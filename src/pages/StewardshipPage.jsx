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
    designated: "Trusted contact (confirmed)",
    handoff_pending: "Handoff waiting for you",
    claim_pending: "Stewardship request pending",
    active: "Legacy steward (active)",
    declined: "Declined",
    resigned: "Resigned",
  };
  return map[status] || status || "Unknown";
}

export default function StewardshipPage({
  isAuthed,
  getAccessToken,
  apiBase,
  ownLifecycle = null,
  onOpenBiography,
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
      setError(describeApiErrorMessage(e, "Could not load stewardship."));
    } finally {
      setLoading(false);
    }
  }, [apiBase, getAccessToken, isAuthed]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(path, body) {
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
      setNotice("Saved.");
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

  if (!isAuthed) {
    return (
      <Section eyebrow="Stewardship" title="Trusted contact role">
        <Banner tone="info">Sign in to see biographies you’re named to steward.</Banner>
      </Section>
    );
  }

  return (
    <Section eyebrow="Stewardship" title="Trusted contact & legacy steward">
      <div className="km-prose" style={{ maxWidth: 640, marginBottom: 18 }}>
        <p>
          When someone names you as their trusted contact, it appears here.
          Designation alone does not open their biography. Stewardship begins
          only after a voluntary handoff or a verified request.
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

      <Frame label="Your own biography">
        {loading && !own ? (
          <Skeleton height={48} />
        ) : (
          <div className="km-prose" style={{ maxWidth: 560 }}>
            <p>
              Status:{" "}
              <strong>{own?.biography_lifecycle_state || "active_in_progress"}</strong>
              {own?.interview_sealed ? " · interview sealed" : ""}
            </p>
            <div className="km-row" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
              <Button disabled={busy || own?.interview_sealed} onClick={() => post("/stewardship/complete", {})}>
                Mark biography complete
              </Button>
              <Button disabled={busy || own?.interview_sealed} onClick={() => post("/stewardship/handoff", {})}>
                Hand off to trusted contact
              </Button>
              <Button disabled={busy} onClick={() => post("/stewardship/still-here", {})}>
                I’m still here
              </Button>
            </div>
          </div>
        )}
      </Frame>

      <div style={{ marginTop: 20 }}>
      <Frame label="Roles you’ve been given">
        {loading ? (
          <Skeleton height={80} />
        ) : roles.length === 0 ? (
          <div className="km-prose">
            <p>No one has named you as a trusted contact yet.</p>
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
                  {role.billing_plan ? ` · plan: ${role.billing_plan}` : ""}
                  {role.claim_cooling_ends_at ? ` · cooling until ${role.claim_cooling_ends_at}` : ""}
                </div>
                <div className="km-row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                  {role.status === "handoff_pending" ? (
                    <>
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() =>
                          post("/stewardship/handoff/accept", {
                            owner_user_id: role.owner_user_id,
                            billing_plan: "legacy",
                          })
                        }
                      >
                        Accept handoff ($4.99 Legacy)
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          post("/stewardship/handoff/accept", {
                            owner_user_id: role.owner_user_id,
                            billing_plan: "dormant",
                          })
                        }
                      >
                        Accept as Dormant ($0.99)
                      </Button>
                    </>
                  ) : null}
                  {role.status === "designated" || role.status === "handoff_pending" ? (
                    <>
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
                        Begin stewardship request
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          post("/stewardship/pause", {
                            owner_user_id: role.owner_user_id,
                            steward_email: role.steward_email,
                          })
                        }
                      >
                        I’m checking on them
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          post("/stewardship/decline", {
                            owner_user_id: role.owner_user_id,
                            steward_email: role.steward_email,
                          })
                        }
                      >
                        Decline role
                      </Button>
                    </>
                  ) : null}
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
                        Switch to {role.billing_plan === "dormant" ? "Legacy $4.99" : "Dormant $0.99"}
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
                        Name successor
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
                        Resign
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
        <Frame label="Stewardship request attestation">
          <div className="km-prose" style={{ maxWidth: 560, marginBottom: 12 }}>
            <p>
              By submitting, you attest that the account holder is no longer willing
              or able to maintain this Kinin account, and that you are their
              designated trusted contact. False statements may result in account
              suspension. A protective waiting period applies unless a death
              certificate key is provided for expedited review.
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
            <FormRow label="Death certificate key (optional, expedites)">
              <TextInput
                value={claimDraft.death_certificate_key}
                onChange={(e) => setClaimDraft((p) => ({ ...p, death_certificate_key: e.target.value }))}
                disabled={busy}
                placeholder="s3 key or support reference"
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
              Submit request
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
        <Frame label="Successor trusted contact">
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
    </Section>
  );
}
