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

function statusLabel(status, { isStewardTransfer = false } = {}) {
  if (status === "handoff_pending" && isStewardTransfer) {
    return "Stewardship transfer waiting for you to accept";
  }
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
    stewarded: "Completed — under Stewardship",
    closed: "Closed",
  };
  return map[state] || state || "Active — interview in progress";
}

function billingLabel(plan) {
  if (plan === "legacy") return "Legacy Stewardship ($4.99/mo)";
  if (plan === "dormant") return "Dormant Archive (free)";
  return plan || "";
}

/** One help line above its button — used in Stewardship action stacks. */
function ActionBlock({ help, children }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p className="km-form-help" style={{ fontStyle: "normal", margin: 0 }}>
        {help}
      </p>
      <div>{children}</div>
    </div>
  );
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
  const [shareDraft, setShareDraft] = useState({
    owner_user_id: "",
    owner_display_name: "",
    email: "",
    relationship: "",
  });
  const [transferDraft, setTransferDraft] = useState({
    owner_user_id: "",
    owner_display_name: "",
    email: "",
    name: "",
  });

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
      `Hand off your biography to ${who}?\n\n` +
        "They must already have a Kinin account. When they accept, Stewardship becomes active on free Dormant Archive, " +
        "and your Interview, Journal, Pins, and Review are permanently sealed on this account. " +
        "You can still explore the biography in Biographies, but you will no longer add new stories here.\n\n" +
        "Until they accept, your interview stays editable and you can keep using Kinin as usual.",
    );
    if (!ok) return;
    await post(
      "/stewardship/handoff",
      {},
      `Handoff request sent to ${stewardName}. We've emailed them to accept — you’ll also get a confirmation email. Your interview stays open until they accept.`,
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
              {own?.interview_sealed || interviewSealed ? " · completed (read-only)" : ""}
            </p>
            {own?.interview_sealed || interviewSealed ? (
              <Banner tone="info">
                <span>
                  Stewardship is active and this biography is completed. Interview,
                  Journal, Pins, and Review are permanently closed on this account.
                  You can still open your biography under Biographies; your Account
                  Steward looks after ongoing care and family access.
                </span>
              </Banner>
            ) : null}
            {own?.own_designation?.status === "handoff_pending" ? (
              <Banner tone="info">
                <span>
                  Handoff request sent
                  {own.own_designation.steward_name
                    ? ` to ${own.own_designation.steward_name}`
                    : ""}
                  . Waiting for them to accept. Your interview stays editable until
                  then — once they accept, Interview, Journal, Pins, and Review end
                  permanently on this account.
                </span>
              </Banner>
            ) : null}
            {!(own?.interview_sealed || interviewSealed) ? (
              <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
                <p className="km-form-help" style={{ fontStyle: "normal", margin: 0 }}>
                  Name your Account Steward above first. Handing off is an end-of-use
                  step for storytelling on this account: when they accept, you stop
                  adding new interview or journal material here.
                </p>
                <ActionBlock
                  help={
                    <>
                      <strong>Mark biography complete</strong> — optional milestone;
                      you can still keep interviewing. Does not hand off or close
                      storytelling.
                    </>
                  }
                >
                  <Button
                    disabled={busy}
                    onClick={() =>
                      post("/stewardship/complete", {}, "Biography marked complete.")
                    }
                  >
                    Mark biography complete
                  </Button>
                </ActionBlock>
                <ActionBlock
                  help={
                    <>
                      <strong>Hand off to Account Steward</strong> — they must already
                      have a Kinin account. Emails them to accept (and confirms to
                      you). When they accept, the biography starts on free Dormant
                      Archive and Interview, Journal, Pins, and Review seal permanently
                      on this account.
                    </>
                  }
                >
                  <Button
                    disabled={
                      busy || own?.own_designation?.status === "handoff_pending"
                    }
                    onClick={requestHandoff}
                  >
                    {own?.own_designation?.status === "handoff_pending"
                      ? "Handoff already sent"
                      : "Hand off to Account Steward"}
                  </Button>
                </ActionBlock>
                <ActionBlock
                  help={
                    <>
                      <strong>I’m still here</strong> — cancels a claim or quiet
                      outreach if someone started a stewardship request about you.
                      Does not start a handoff.
                    </>
                  }
                >
                  <Button
                    disabled={busy}
                    onClick={() =>
                      post(
                        "/stewardship/still-here",
                        {},
                        "Thanks — we've noted that you're still here.",
                      )
                    }
                  >
                    I’m still here
                  </Button>
                </ActionBlock>
              </div>
            ) : null}
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
                  <Shield size={18} aria-hidden="true" />
                  <strong style={{ fontSize: "1.15rem" }}>
                    {role.owner_display_name || "Someone"}
                  </strong>
                </div>
                {role.status === "active" && role.billing_plan ? (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: "1.2rem",
                      fontWeight: 600,
                      lineHeight: 1.35,
                      letterSpacing: "0.01em",
                    }}
                  >
                    Current Plan:{" "}
                    <span style={{ whiteSpace: "nowrap" }}>
                      {billingLabel(role.billing_plan)}
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: "1.05rem",
                      fontWeight: 600,
                      lineHeight: 1.35,
                    }}
                  >
                    {statusLabel(role.status, {
                      isStewardTransfer: !!role.is_steward_transfer,
                    })}
                  </div>
                )}
                {role.claim_cooling_ends_at ? (
                  <div className="km-form-help" style={{ fontStyle: "normal", marginTop: 4 }}>
                    Waiting period ends {role.claim_cooling_ends_at}
                  </div>
                ) : null}
                <div style={{ marginTop: 10 }}>
                  {role.status === "handoff_pending" && role.is_steward_transfer ? (
                    <div className="km-prose" style={{ maxWidth: 560 }}>
                      <p>
                        <strong>An Account Steward asked you to take over.</strong>{" "}
                        Accepting transfers Stewardship of this completed biography to
                        you on free Dormant Archive (chat paused). Switch to Legacy
                        Stewardship ($4.99/mo) later if you want explore chat and family
                        interaction.
                      </p>
                      <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
                        <ActionBlock
                          help={
                            <>
                              <strong>Accept stewardship transfer — Dormant (free)</strong>{" "}
                              — take over care with no charge. Chat stays paused until
                              you upgrade to Legacy ($4.99/mo) for family explore access.
                            </>
                          }
                        >
                          <Button
                            variant="primary"
                            disabled={busy}
                            onClick={() =>
                              post(
                                "/stewardship/transfer/accept",
                                { owner_user_id: role.owner_user_id },
                                "Stewardship transfer accepted on free Dormant Archive. Switch to Legacy ($4.99/mo) in Stewardship when you want family explore chat.",
                              )
                            }
                          >
                            Accept stewardship transfer — Dormant (free)
                          </Button>
                        </ActionBlock>
                        <ActionBlock
                          help={
                            <>
                              <strong>Decline transfer</strong> — turn this down; the
                              current Account Steward keeps the role.
                            </>
                          }
                        >
                          <Button
                            disabled={busy}
                            onClick={() =>
                              post(
                                "/stewardship/decline",
                                {
                                  owner_user_id: role.owner_user_id,
                                  steward_email: role.steward_email,
                                },
                                "Stewardship transfer declined.",
                              )
                            }
                          >
                            Decline transfer
                          </Button>
                        </ActionBlock>
                      </div>
                    </div>
                  ) : null}

                  {role.status === "handoff_pending" && !role.is_steward_transfer ? (
                    <div className="km-prose" style={{ maxWidth: 560 }}>
                      <p>
                        <strong>They asked you to take over.</strong> Accepting
                        activates Stewardship on free Dormant Archive and permanently
                        seals their Interview, Journal, Pins, and Review. Switch to
                        Legacy Stewardship ($4.99/mo) later when you want explore chat
                        and family interaction with this biography.
                      </p>
                      <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
                        <ActionBlock
                          help={
                            <>
                              <strong>Accept handoff — Dormant Archive (free)</strong> —
                              keep the biography stored with chat paused. No charge.
                              After accepting, upgrade to Legacy ($4.99/mo) in Stewardship
                              so family can explore and chat.
                            </>
                          }
                        >
                          <Button
                            variant="primary"
                            disabled={busy}
                            onClick={() =>
                              post(
                                "/stewardship/handoff/accept",
                                {
                                  owner_user_id: role.owner_user_id,
                                },
                                "Stewardship accepted on free Dormant Archive. Their biography is completed. Switch to Legacy ($4.99/mo) when you want family explore chat.",
                              )
                            }
                          >
                            Accept handoff — Dormant Archive (free)
                          </Button>
                        </ActionBlock>
                        <ActionBlock
                          help={
                            <>
                              <strong>Decline handoff</strong> — turn down this
                              handoff; they keep control of their account.
                            </>
                          }
                        >
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
                        </ActionBlock>
                      </div>
                    </div>
                  ) : null}

                  {role.status === "designated" ? (
                    <div className="km-prose" style={{ maxWidth: 560 }}>
                      <p>
                        You’re named as their Account Steward, but they haven’t handed
                        the biography off yet. You can’t open it until they hand it
                        off — or until you start a stewardship request because they
                        can no longer manage the account themselves.
                      </p>
                      <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
                        <ActionBlock
                          help={
                            <>
                              <strong>Request stewardship (they can’t manage it)</strong>{" "}
                              — for death or lasting incapacity when they can’t hand
                              off. Starts a protective waiting period (they can cancel
                              with “I’m still here”).
                            </>
                          }
                        >
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
                        </ActionBlock>
                        <ActionBlock
                          help={
                            <>
                              <strong>I’m checking on them</strong> — pauses quiet
                              reminders while you look into things. Does not open the
                              biography.
                            </>
                          }
                        >
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
                        </ActionBlock>
                        <ActionBlock
                          help={
                            <>
                              <strong>Decline role</strong> — step down as their named
                              Account Steward.
                            </>
                          }
                        >
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
                        </ActionBlock>
                      </div>
                    </div>
                  ) : null}

                  {role.status === "active" ? (
                    (() => {
                      const ownerName = role.owner_display_name || "this person";
                      const switchToDormant = role.billing_plan !== "dormant";
                      const switchLabel = switchToDormant
                        ? "Switch to Dormant Archive (free)"
                        : "Switch to Legacy Stewardship ($4.99/mo)";
                      const switchHelp = switchToDormant
                        ? "archive the biography for free with chat paused. No charge to you as steward."
                        : "enable fuller explore/chat and family-invite tools for this biography ($4.99/mo).";
                      return (
                        <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
                          <p style={{ margin: 0 }}>
                            Stewardship is active for {ownerName}. Their biography is
                            completed — storytelling on that account is closed. Use the
                            actions below to care for it. Dormant Archive is free;
                            Legacy Stewardship is $4.99/mo when you want explore chat
                            and family interaction. To pass this biography to someone
                            else for safekeeping, use Hand off Stewardship (they must
                            already have a Kinin account). Biographies you steward also
                            move with you if your own account later becomes stewarded.
                          </p>
                          {role.billing_plan === "dormant" ? (
                            <Banner tone="info">
                              <span>
                                <strong>Current plan: Dormant Archive (free).</strong>{" "}
                                Chat is paused. Switch to Legacy Stewardship ($4.99/mo)
                                so you and invited family can explore and interact with
                                this biography.
                              </span>
                            </Banner>
                          ) : null}
                          {role.pending_transfer_to_email ? (
                            <Banner tone="info">
                              <span>
                                <strong>Transfer request sent</strong> to{" "}
                                {role.pending_transfer_to_email}
                                {role.pending_transfer_to_name
                                  ? ` (${role.pending_transfer_to_name})`
                                  : ""}
                                . We’ve emailed them to accept. You remain the Account
                                Steward until they accept — you can cancel below.
                              </span>
                            </Banner>
                          ) : null}
                          <ActionBlock
                            help={
                              <>
                                <strong>Open biography</strong> — explore the completed
                                biography for {ownerName} (ask questions grounded in
                                memories already shared).
                              </>
                            }
                          >
                            <Button
                              variant="primary"
                              disabled={busy}
                              onClick={() => onOpenBiography?.(role.owner_user_id)}
                            >
                              Open biography
                            </Button>
                          </ActionBlock>
                          <ActionBlock
                            help={
                              <>
                                <strong>Export copy</strong> — download a portable
                                JSON package of the biography for backup or offline
                                use.
                              </>
                            }
                          >
                            <Button
                              disabled={busy}
                              onClick={() => exportBio(role.owner_user_id)}
                            >
                              Export copy
                            </Button>
                          </ActionBlock>
                          <ActionBlock
                            help={
                              <>
                                <strong>{switchLabel}</strong> — {switchHelp}
                              </>
                            }
                          >
                            <Button
                              disabled={busy}
                              onClick={() =>
                                post("/stewardship/billing", {
                                  owner_user_id: role.owner_user_id,
                                  billing_plan: switchToDormant ? "dormant" : "legacy",
                                })
                              }
                            >
                              {switchLabel}
                            </Button>
                          </ActionBlock>
                          <ActionBlock
                            help={
                              <>
                                <strong>Invite family access</strong> — invite a
                                family member to explore the completed biography for{" "}
                                {ownerName}. They can ask questions; they cannot edit.
                                Family explore chat requires Legacy Stewardship
                                ($4.99/mo) — upgrade first if this biography is still on
                                Dormant Archive.
                              </>
                            }
                          >
                            <Button
                              disabled={busy}
                              onClick={() =>
                                setShareDraft({
                                  owner_user_id: role.owner_user_id,
                                  owner_display_name: ownerName,
                                  email: "",
                                  relationship: "",
                                })
                              }
                            >
                              Invite family access
                            </Button>
                          </ActionBlock>
                          {role.pending_transfer_to_email ? (
                            <ActionBlock
                              help={
                                <>
                                  <strong>Cancel transfer</strong> — withdraw the
                                  pending Hand off Stewardship request. You remain the
                                  Account Steward.
                                </>
                              }
                            >
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  post(
                                    "/stewardship/transfer/cancel",
                                    { owner_user_id: role.owner_user_id },
                                    "Stewardship transfer cancelled.",
                                  )
                                }
                              >
                                Cancel transfer
                              </Button>
                            </ActionBlock>
                          ) : (
                            <ActionBlock
                              help={
                                <>
                                  <strong>Hand off Stewardship</strong> — transfer care
                                  of {ownerName}’s completed biography to another
                                  person who already has a Kinin account. They get an
                                  email, accept in Settings → Stewardship, and start on
                                  free Dormant Archive. You keep explore access afterward
                                  unless access is removed later.
                                </>
                              }
                            >
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  setTransferDraft({
                                    owner_user_id: role.owner_user_id,
                                    owner_display_name: ownerName,
                                    email: "",
                                    name: "",
                                  })
                                }
                              >
                                Hand off Stewardship
                              </Button>
                            </ActionBlock>
                          )}
                        </div>
                      );
                    })()
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

      {transferDraft.owner_user_id ? (
        <div style={{ marginTop: 20 }}>
          <Frame label="Hand off Stewardship">
            <div className="km-prose" style={{ maxWidth: 560, marginBottom: 12 }}>
              <p>
                Transfer Stewardship of the completed biography for{" "}
                {transferDraft.owner_display_name || "this person"} to someone who
                already has a Kinin account. They will receive an email and must
                accept in Settings → Stewardship. Accepting starts free Dormant
                Archive for them (no payment setup required).
              </p>
            </div>
            <div className="km-form-grid">
              <FormRow label="Recipient name (optional)">
                <TextInput
                  value={transferDraft.name}
                  onChange={(e) =>
                    setTransferDraft((p) => ({ ...p, name: e.target.value }))
                  }
                  disabled={busy}
                />
              </FormRow>
              <FormRow label="Recipient email">
                <TextInput
                  value={transferDraft.email}
                  onChange={(e) =>
                    setTransferDraft((p) => ({ ...p, email: e.target.value }))
                  }
                  disabled={busy}
                  inputMode="email"
                />
              </FormRow>
            </div>
            <div className="km-row" style={{ marginTop: 14, gap: 8 }}>
              <Button
                variant="primary"
                disabled={busy || !(transferDraft.email || "").trim()}
                onClick={async () => {
                  const toEmail = (transferDraft.email || "").trim();
                  const toName = (transferDraft.name || "").trim();
                  const who = toName ? `${toName} (${toEmail})` : toEmail;
                  const ownerLabel =
                    transferDraft.owner_display_name || "this person";
                  const ok = window.confirm(
                    `Hand off Stewardship of ${ownerLabel}’s biography to ${who}?\n\n` +
                      "They must already have a Kinin account. We’ll email them to accept, " +
                      "and you’ll get a confirmation. You remain the Account Steward until they accept. " +
                      "When they accept, the biography starts on free Dormant Archive.",
                  );
                  if (!ok) return;
                  const parsed = await post(
                    "/stewardship/transfer",
                    {
                      owner_user_id: transferDraft.owner_user_id,
                      email: toEmail,
                      name: toName,
                    },
                    `Transfer request sent to ${who}. We've emailed them to accept — you’ll also get a confirmation. Status shows as Transfer pending until they accept.`,
                  );
                  if (!parsed) return;
                  setTransferDraft({
                    owner_user_id: "",
                    owner_display_name: "",
                    email: "",
                    name: "",
                  });
                }}
              >
                Send transfer request
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  setTransferDraft({
                    owner_user_id: "",
                    owner_display_name: "",
                    email: "",
                    name: "",
                  })
                }
              >
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
              Invite a family member to explore the completed biography for{" "}
              {shareDraft.owner_display_name || "this person"}. They can ask
              questions grounded in memories already shared. They cannot edit the
              interview or journal.
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
                await post("/stewardship/shares", {
                  owner_user_id: shareDraft.owner_user_id,
                  email: shareDraft.email,
                  relationship: shareDraft.relationship,
                });
                setShareDraft({
                  owner_user_id: "",
                  owner_display_name: "",
                  email: "",
                  relationship: "",
                });
              }}
            >
              Send invite
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                setShareDraft({
                  owner_user_id: "",
                  owner_display_name: "",
                  email: "",
                  relationship: "",
                })
              }
            >
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
