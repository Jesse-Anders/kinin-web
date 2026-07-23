import { useCallback, useEffect, useState } from "react";
import { Shield } from "lucide-react";
import {
  Banner,
  Button,
  FormRow,
  Frame,
  Section,
  Skeleton,
  TextArea,
  TextInput,
} from "../theme";
import AccountStewardSection from "../components/AccountStewardSection";
import { isAuthExpiredError, throwIfUnauthorized } from "../services/authSession";
import { describeApiErrorMessage } from "../services/describeApiError";

function parseApiPayload(text) {
  try {
    const outer = JSON.parse(text);
    return typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
  } catch {
    return null;
  }
}

function statusLabel(status) {
  const map = {
    designated: "Account Steward confirmed",
    handoff_pending: "Handoff waiting for you to accept",
    claim_pending: "Stewardship request pending (waiting period)",
    active: "Stewardship active",
    declined: "Role declined",
    resigned: "Resigned",
  };
  return map[status] || status || "Unknown";
}

function lifecycleLabel(state) {
  const map = {
    active_in_progress: "Active — interview in progress",
    active_complete: "Active — marked complete",
    outreach: "Quiet outreach in progress",
    dormant: "Dormant hold",
    stewarded: "Under Stewardship",
    closed: "Closed",
  };
  return map[state] || state || "Active — interview in progress";
}

function billingLabel(plan) {
  if (plan === "legacy") return "Legacy Stewardship ($4.99/mo)";
  if (plan === "dormant") return "Dormant Archive ($0.99/mo)";
  return plan || "";
}

export default function StewardshipPage({
  isAuthed,
  getAccessToken,
  apiBase,
  ownLifecycle = null,
  onOpenBiography,
  // When true, omit the outer Section (Settings page already provides chrome).
  panelOnly = false,
  // Designate steward (owner side) — same controls formerly on My Account.
  accountExecutor,
  setAccountExecutor,
  profileBusy = false,
  interviewSealed = false,
  executorStatus = "",
  saveAccountExecutor,
  resendAccountExecutorInvite,
  removeAccountExecutor,
}) {
  const [roles, setRoles] = useState([]);
  const [own, setOwn] = useState(ownLifecycle);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [claimDraft, setClaimDraft] = useState({ owner_user_id: "", reason: "death", attestation: "", death_certificate_key: "" });
  const [successorDraft, setSuccessorDraft] = useState({ owner_user_id: "", name: "", email: "" });
  const [shareDraft, setShareDraft] = useState({ owner_user_id: "", email: "", relationship: "" });

  const load = useCallback(async () => {
    if (!isAuthed || !apiBase) return;
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/stewardship`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      throwIfUnauthorized(res);
      const parsed = parseApiPayload(await res.text());
      if (!res.ok) throw new Error(parsed?.error || `HTTP ${res.status}`);
      setRoles(Array.isArray(parsed?.roles) ? parsed.roles : []);
      setOwn(parsed?.own_lifecycle || null);
    } catch (e) {
      if (isAuthExpiredError(e)) return;
      setError(describeApiErrorMessage(e, "Could not load Stewardship."));
    } finally {
      setLoading(false);
    }
  }, [apiBase, getAccessToken, isAuthed]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(path, body, successNotice = "Saved.") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body || {}),
      });
      throwIfUnauthorized(res);
      const parsed = parseApiPayload(await res.text());
      if (!res.ok) throw new Error(parsed?.error || parsed?.detail || `HTTP ${res.status}`);
      setNotice(successNotice);
      await load();
      return parsed;
    } catch (e) {
      if (isAuthExpiredError(e)) return null;
      setError(describeApiErrorMessage(e, "Request failed."));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function requestHandoff() {
    const stewardName = (accountExecutor?.name || "").trim() || "your Account Steward";
    const stewardEmail = (accountExecutor?.email || "").trim();
    const who = stewardEmail ? `${stewardName} (${stewardEmail})` : stewardName;
    const ok = window.confirm(
      `Send a handoff request to ${who}?\n\n` +
        "They will be asked to accept Stewardship of your biography. " +
        "Your interview stays editable until they accept.",
    );
    if (!ok) return;
    await post(
      "/stewardship/handoff",
      {},
      `Handoff request sent to ${stewardName}. We've emailed them to accept.`,
    );
  }

  async function exportBio(ownerUserId) {
    const parsed = await post("/stewardship/export", { owner_user_id: ownerUserId });
    if (!parsed?.package) return;
    const blob = new Blob([JSON.stringify(parsed.package, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = parsed.filename || "kinin-biography.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const body = !isAuthed ? (
    <Banner tone="info">Sign in to manage your Account Steward and stewardship roles.</Banner>
  ) : (
    <>
      <div className="km-prose" style={{ maxWidth: 640, marginBottom: 18 }}>
        <p>
          Name your Account Steward here, and manage biographies you’re named to
          steward. Confirming an invite does not open their biography. Stewardship
          begins only after a voluntary handoff, or after a verified stewardship
          request with a protective waiting period.
        </p>
      </div>

      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="danger">{error}</Banner>
        </div>
      ) : null}
      {notice ? (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="info">{notice}</Banner>
        </div>
      ) : null}

      {typeof saveAccountExecutor === "function" ? (
        <div style={{ marginBottom: 20 }}>
          <AccountStewardSection
            accountExecutor={accountExecutor}
            setAccountExecutor={setAccountExecutor}
            profileBusy={profileBusy}
            interviewSealed={interviewSealed}
            executorStatus={executorStatus}
            saveAccountExecutor={saveAccountExecutor}
            resendAccountExecutorInvite={resendAccountExecutorInvite}
            removeAccountExecutor={removeAccountExecutor}
          />
        </div>
      ) : null}

      <Frame label="Your own biography">
        {loading && !own ? (
          <Skeleton height={48} />
        ) : (
          <div className="km-prose" style={{ maxWidth: 560 }}>
            <p>
              Status:{" "}
              <strong>{lifecycleLabel(own?.biography_lifecycle_state)}</strong>
              {own?.interview_sealed ? " · interview sealed (read-only)" : ""}
            </p>
            {own?.own_designation?.status === "handoff_pending" ? (
              <Banner tone="info">
                <span>
                  Handoff request sent
                  {own.own_designation.steward_name
                    ? ` to ${own.own_designation.steward_name}`
                    : ""}
                  . Waiting for them to accept. Your interview stays editable until then.
                </span>
              </Banner>
            ) : null}
            <p className="km-form-help" style={{ fontStyle: "normal", marginTop: 8 }}>
              Name your Account Steward above first. When you’re ready for them to
              look after this biography, send a handoff request. Use “I’m still here”
              if a stewardship request was started and you want to cancel it.
            </p>
            <div className="km-row" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
              <Button
                disabled={busy || own?.interview_sealed}
                onClick={() =>
                  post("/stewardship/complete", {}, "Biography marked complete.")
                }
              >
                Mark biography complete
              </Button>
              <Button
                disabled={
                  busy ||
                  own?.interview_sealed ||
                  own?.own_designation?.status === "handoff_pending"
                }
                onClick={requestHandoff}
              >
                {own?.own_designation?.status === "handoff_pending"
                  ? "Handoff already sent"
                  : "Hand off to Account Steward"}
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  post("/stewardship/still-here", {}, "Thanks — we've noted that you're still here.")
                }
              >
                I’m still here
              </Button>
            </div>
          </div>
        )}
      </Frame>

      <div style={{ marginTop: 20 }}>
      <Frame label="Biographies you steward">
        {loading ? (
          <Skeleton height={80} />
        ) : roles.length === 0 ? (
          <div className="km-prose">
            <p>No one has named you as their Account Steward yet.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {roles.map((role) => (
              <div key={`${role.owner_user_id}-${role.steward_email}`} className="km-prose" style={{ borderTop: "1px solid rgba(26,20,11,0.12)", paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shield size={16} aria-hidden="true" />
                  <strong>{role.owner_display_name || "Someone"}</strong>
                </div>
                <div className="km-form-help" style={{ fontStyle: "normal", marginTop: 4 }}>
                  {statusLabel(role.status)}
                  {role.billing_plan ? ` · ${billingLabel(role.billing_plan)}` : ""}
                  {role.claim_cooling_ends_at ? ` · waiting period ends ${role.claim_cooling_ends_at}` : ""}
                </div>
                <div style={{ marginTop: 10 }}>
                  {role.status === "handoff_pending" ? (
                    <div className="km-prose" style={{ maxWidth: 560, marginBottom: 10 }}>
                      <p>
                        <strong>They asked you to take over.</strong> Accepting
                        activates Stewardship and seals their interview. Choose how
                        you’d like to keep the biography (billing comes later — pick
                        the mode that fits for now):
                      </p>
                      <ul>
                        <li>
                          <strong>Legacy Stewardship</strong> — explore the biography
                          and invite family.
                        </li>
                        <li>
                          <strong>Dormant Archive</strong> — keep it stored with
                          limited chat.
                        </li>
                      </ul>
                      <div className="km-row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                        <Button
                          variant="primary"
                          disabled={busy}
                          onClick={() =>
                            post(
                              "/stewardship/handoff/accept",
                              {
                                owner_user_id: role.owner_user_id,
                                billing_plan: "legacy",
                              },
                              "Stewardship accepted (Legacy). The interview is now sealed.",
                            )
                          }
                        >
                          Accept handoff — Legacy ($4.99/mo)
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            post(
                              "/stewardship/handoff/accept",
                              {
                                owner_user_id: role.owner_user_id,
                                billing_plan: "dormant",
                              },
                              "Stewardship accepted (Dormant Archive). The interview is now sealed.",
                            )
                          }
                        >
                          Accept handoff — Dormant ($0.99/mo)
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            post(
                              "/stewardship/decline",
                              {
                                owner_user_id: role.owner_user_id,
                                steward_email: role.steward_email,
                              },
                              "Handoff declined.",
                            )
                          }
                        >
                          Decline handoff
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {role.status === "designated" ? (
                    <div className="km-prose" style={{ maxWidth: 560, marginBottom: 10 }}>
                      <p>
                        You’re named as their Account Steward, but they haven’t handed
                        the biography off yet. No access until they hand it off, or
                        until you start a stewardship request if they can no longer
                        manage the account themselves.
                      </p>
                      <div className="km-row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            setClaimDraft({
                              owner_user_id: role.owner_user_id,
                              reason: "death",
                              attestation: "",
                              death_certificate_key: "",
                            })
                          }
                        >
                          Request stewardship (they can’t manage it)
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            post(
                              "/stewardship/pause",
                              {
                                owner_user_id: role.owner_user_id,
                                steward_email: role.steward_email,
                              },
                              "Thanks — we'll pause quiet reminders while you check on them.",
                            )
                          }
                        >
                          I’m checking on them
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            post(
                              "/stewardship/decline",
                              {
                                owner_user_id: role.owner_user_id,
                                steward_email: role.steward_email,
                              },
                              "Account Steward role declined.",
                            )
                          }
                        >
                          Decline role
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="km-row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                  {role.status === "active" ? (
                    <>
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() => onOpenBiography?.(role.owner_user_id)}
                      >
                        Open biography
                      </Button>
                      <Button disabled={busy} onClick={() => exportBio(role.owner_user_id)}>
                        Export copy
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          post("/stewardship/billing", {
                            owner_user_id: role.owner_user_id,
                            billing_plan: role.billing_plan === "dormant" ? "legacy" : "dormant",
                          })
                        }
                      >
                        Switch to {role.billing_plan === "dormant" ? "Legacy Stewardship ($4.99)" : "Dormant Archive ($0.99)"}
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          setSuccessorDraft({
                            owner_user_id: role.owner_user_id,
                            name: "",
                            email: "",
                          })
                        }
                      >
                        Name successor steward
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          setShareDraft({
                            owner_user_id: role.owner_user_id,
                            email: "",
                            relationship: "",
                          })
                        }
                      >
                        Invite family access
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          post("/stewardship/resign", {
                            owner_user_id: role.owner_user_id,
                            steward_email: role.steward_email,
                          })
                        }
                      >
                        Resign stewardship
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Frame>
      </div>

      {claimDraft.owner_user_id ? (
        <div style={{ marginTop: 20 }}>
        <Frame label="Request stewardship (they can’t manage it)">
          <div className="km-prose" style={{ maxWidth: 560, marginBottom: 12 }}>
            <p>
              Use this only when the account holder cannot hand the biography off
              themselves (for example death or permanent incapacity). By submitting,
              you attest that they are no longer willing or able to maintain this
              Kinin account, and that you are their designated Account Steward.
              False statements may result in account suspension. A protective waiting
              period applies unless a death certificate reference is provided for
              expedited review. During the waiting period, they can cancel by signing
              in or choosing “I’m still here.”
            </p>
          </div>
          <div className="km-form-grid">
            <FormRow label="Reason">
              <select
                className="km-input"
                value={claimDraft.reason}
                onChange={(e) => setClaimDraft((p) => ({ ...p, reason: e.target.value }))}
                disabled={busy}
              >
                <option value="death">Death</option>
                <option value="permanent_incapacity">Permanent incapacity</option>
                <option value="owner_requested_offline">Owner requested offline</option>
              </select>
            </FormRow>
            <FormRow label="Attestation">
              <TextArea
                value={claimDraft.attestation}
                onChange={(e) => setClaimDraft((p) => ({ ...p, attestation: e.target.value }))}
                disabled={busy}
                rows={4}
              />
            </FormRow>
            <FormRow label="Death certificate reference (optional, expedites)">
              <TextInput
                value={claimDraft.death_certificate_key}
                onChange={(e) => setClaimDraft((p) => ({ ...p, death_certificate_key: e.target.value }))}
                disabled={busy}
                placeholder="Support reference or document key"
              />
            </FormRow>
          </div>
          <div className="km-row" style={{ marginTop: 14, gap: 8 }}>
            <Button
              variant="primary"
              disabled={busy || (claimDraft.attestation || "").trim().length < 20}
              onClick={async () => {
                await post("/stewardship/claim", claimDraft);
                setClaimDraft({ owner_user_id: "", reason: "death", attestation: "", death_certificate_key: "" });
              }}
            >
              Submit stewardship request
            </Button>
            <Button disabled={busy} onClick={() => setClaimDraft({ owner_user_id: "", reason: "death", attestation: "", death_certificate_key: "" })}>
              Cancel
            </Button>
          </div>
        </Frame>
        </div>
      ) : null}

      {successorDraft.owner_user_id ? (
        <div style={{ marginTop: 20 }}>
        <Frame label="Successor Account Steward">
          <div className="km-prose" style={{ maxWidth: 560, marginBottom: 12 }}>
            <p>
              Name someone who can take over Stewardship if you can no longer serve.
              They will be invited to confirm, just as you were.
            </p>
          </div>
          <div className="km-form-grid">
            <FormRow label="Name">
              <TextInput
                value={successorDraft.name}
                onChange={(e) => setSuccessorDraft((p) => ({ ...p, name: e.target.value }))}
                disabled={busy}
              />
            </FormRow>
            <FormRow label="Email">
              <TextInput
                value={successorDraft.email}
                onChange={(e) => setSuccessorDraft((p) => ({ ...p, email: e.target.value }))}
                disabled={busy}
                inputMode="email"
              />
            </FormRow>
          </div>
          <div className="km-row" style={{ marginTop: 14, gap: 8 }}>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                await post("/stewardship/successor", {
                  owner_user_id: successorDraft.owner_user_id,
                  name: successorDraft.name,
                  email: successorDraft.email,
                });
                setSuccessorDraft({ owner_user_id: "", name: "", email: "" });
              }}
            >
              Save successor
            </Button>
            <Button disabled={busy} onClick={() => setSuccessorDraft({ owner_user_id: "", name: "", email: "" })}>
              Cancel
            </Button>
          </div>
        </Frame>
        </div>
      ) : null}

      {shareDraft.owner_user_id ? (
        <div style={{ marginTop: 20 }}>
        <Frame label="Invite family access">
          <div className="km-prose" style={{ maxWidth: 560, marginBottom: 12 }}>
            <p>
              Invite a family member to explore this sealed biography. They can ask
              questions grounded in the memories already shared — they cannot edit
              the interview.
            </p>
          </div>
          <div className="km-form-grid">
            <FormRow label="Email">
              <TextInput
                value={shareDraft.email}
                onChange={(e) => setShareDraft((p) => ({ ...p, email: e.target.value }))}
                disabled={busy}
                inputMode="email"
              />
            </FormRow>
            <FormRow label="Relationship (optional)">
              <TextInput
                value={shareDraft.relationship}
                onChange={(e) => setShareDraft((p) => ({ ...p, relationship: e.target.value }))}
                disabled={busy}
              />
            </FormRow>
          </div>
          <div className="km-row" style={{ marginTop: 14, gap: 8 }}>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                await post("/stewardship/shares", shareDraft);
                setShareDraft({ owner_user_id: "", email: "", relationship: "" });
              }}
            >
              Send invite
            </Button>
            <Button disabled={busy} onClick={() => setShareDraft({ owner_user_id: "", email: "", relationship: "" })}>
              Cancel
            </Button>
          </div>
        </Frame>
        </div>
      ) : null}
    </>
  );

  if (panelOnly) {
    return <div className="km-stack" style={{ gap: 8, marginTop: 8 }}>{body}</div>;
  }

  return (
    <Section eyebrow="Stewardship" title="Account Stewardship">
      {body}
    </Section>
  );
}
