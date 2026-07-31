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

const PRICE_KEEP_MONTHLY = "$4.99/month";
const PRICE_KEEP_ANNUAL = "$49/year";

/** Soft tones so consecutive stewardship cards don’t blend while scrolling. */
const STEWARD_BLOCK_TONES = [
  { bg: "rgba(46, 88, 72, 0.09)", border: "rgba(46, 88, 72, 0.28)" },
  { bg: "rgba(122, 78, 48, 0.09)", border: "rgba(122, 78, 48, 0.26)" },
  { bg: "rgba(52, 74, 110, 0.09)", border: "rgba(52, 74, 110, 0.26)" },
  { bg: "rgba(98, 86, 40, 0.1)", border: "rgba(98, 86, 40, 0.28)" },
];

function formatPeriodEnd(unixSeconds) {
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(n * 1000)
    );
  } catch {
    return "";
  }
}

function billingLabel(role) {
  const plan = String(role?.billing_plan || "").toLowerCase();
  if (plan === "keep_interactive" || plan === "legacy") {
    if (role?.cancel_at_period_end) {
      const when = formatPeriodEnd(role.current_period_end);
      return when
        ? `Shared — active until ${when}, then Archive`
        : "Shared — cancellation scheduled, then Archive";
    }
    if (role?.is_free_seat) return "Shared (free with Build Biography)";
    if (role?.is_paid) {
      const iv = String(role.billing_interval || "").toLowerCase();
      if (iv === "annual") return `Shared · annual (${PRICE_KEEP_ANNUAL})`;
      return `Shared · monthly (${PRICE_KEEP_MONTHLY})`;
    }
    return "Shared";
  }
  if (plan === "archive" || plan === "dormant") return "Archive (chat paused)";
  return plan || "";
}

function isArchivePlan(plan) {
  const p = String(plan || "").toLowerCase();
  return p === "archive" || p === "dormant" || !p;
}

/** One help line above its button — used in Stewardship action stacks. */
function ActionBlock({ help, children }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p className="km-prose" style={{ margin: 0 }}>
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
  onStewardshipChanged,
}) {
  const [roles, setRoles] = useState([]);
  const [own, setOwn] = useState(ownLifecycle);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [freeSeatAvailable, setFreeSeatAvailable] = useState(false);
  const [grantsFreeSeat, setGrantsFreeSeat] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(true);
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
    if (!isAuthed || !apiBase) return null;
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
      const nextRoles = Array.isArray(parsed?.roles) ? parsed.roles : [];
      setRoles(nextRoles);
      setOwn(parsed?.own_lifecycle || null);
      const grants = parsed?.build_biography_grants_free_seat === true;
      setGrantsFreeSeat(grants);
      if (typeof parsed?.free_seat_available === "boolean") {
        setFreeSeatAvailable(parsed.free_seat_available);
      } else {
        setFreeSeatAvailable(
          grants && !nextRoles.some((r) => r?.status === "active" && r?.is_free_seat)
        );
      }
      try {
        const billRes = await fetch(`${apiBase}/billing/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (billRes.ok) {
          const billParsed = parseApiPayload(await billRes.text());
          if (typeof billParsed?.stripe_configured === "boolean") {
            setStripeConfigured(billParsed.stripe_configured);
          }
        }
      } catch {
        /* keep prior stripeConfigured */
      }
      return nextRoles;
    } catch (e) {
      if (isAuthExpiredError(e)) return null;
      setError(describeApiErrorMessage(e, "Could not load Stewardship."));
      return null;
    } finally {
      setLoading(false);
    }
  }, [apiBase, getAccessToken, isAuthed]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;
    params.delete("checkout");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", next);
    if (checkout === "cancel") {
      setNotice("Checkout canceled. You can share a stewarded biography anytime.");
      return;
    }
    if (checkout !== "success") return;

    let cancelled = false;
    (async () => {
      setNotice("Checking your stewardship subscription…");
      try {
        for (let i = 0; i < 6; i += 1) {
          if (cancelled) return;
          const nextRoles = await load();
          const shared = (nextRoles || []).some((r) => {
            if (r?.status !== "active") return false;
            const plan = String(r?.billing_plan || "").toLowerCase();
            return (
              (plan === "keep_interactive" || plan === "legacy") &&
              (r?.is_paid || r?.is_free_seat || r?.stripe_subscription_id)
            );
          });
          if (shared) {
            if (!cancelled) {
              setNotice("Share Stewarded is active for a biography under your care.");
            }
            return;
          }
          await new Promise((r) => setTimeout(r, i === 0 ? 1000 : 1500));
        }
        if (!cancelled) {
          setNotice(
            "Payment received in Stripe, but Stewardship hasn’t updated yet. Wait a few seconds and refresh this page."
          );
        }
      } catch {
        if (!cancelled) {
          setNotice("Could not confirm the subscription yet. Refresh Stewardship in a moment.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
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
      if (!res.ok && !(parsed?.checkout_required && parsed?.url)) {
        const code =
          parsed?.error || parsed?.detail || parsed?.message || `HTTP ${res.status}`;
        const err = new Error(code);
        err.status = res.status;
        err.payload = parsed;
        throw err;
      }
      if (parsed?.checkout_required && parsed?.url) {
        window.location.href = parsed.url;
        return parsed;
      }
      setNotice(successNotice);
      await load();
      if (typeof onStewardshipChanged === "function") {
        try {
          onStewardshipChanged();
        } catch {
          /* parent refresh is best-effort */
        }
      }
      return parsed;
    } catch (e) {
      if (isAuthExpiredError(e)) return null;
      setError(describeApiErrorMessage(e, { context: "Request failed" }));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function setRoleBilling(role, billingPlan, interval = "monthly", successNotice = "Saved.") {
    const origin = window.location.origin;
    return post(
      "/stewardship/billing",
      {
        owner_user_id: role.owner_user_id,
        billing_plan: billingPlan,
        interval,
        success_url: `${origin}/settings/stewardship?checkout=success`,
        cancel_url: `${origin}/settings/stewardship?checkout=cancel`,
      },
      successNotice,
    );
  }

  async function useFreeSeatForRole(role) {
    const name = role.owner_display_name || "this biography";
    const freeHolder = roles.find((r) => r?.status === "active" && r?.is_free_seat);
    if (freeHolder && freeHolder.owner_user_id !== role.owner_user_id) {
      const holderName = freeHolder.owner_display_name || "another biography";
      const ok = window.confirm(
        `Your free Share Stewarded seat is currently on ${holderName}. ` +
          `Archive that biography and use the free seat for ${name}?`
      );
      if (!ok) return;
      const archived = await setRoleBilling(
        freeHolder,
        "archive",
        "monthly",
        `${holderName} archived so the free seat can move.`,
      );
      if (!archived) return;
    } else {
      const ok = window.confirm(
        `Use your free Share Stewarded seat (included with Build Biography) for ${name}?`
      );
      if (!ok) return;
    }
    await setRoleBilling(
      role,
      "keep_interactive",
      "monthly",
      `Free Share Stewarded seat assigned to ${name}.`,
    );
  }

  async function subscribeRole(role, interval) {
    const name = role.owner_display_name || "this biography";
    await setRoleBilling(
      role,
      "keep_interactive",
      interval,
      `Opening Checkout to share ${name}…`,
    );
  }

  async function archiveRole(role) {
    const name = role.owner_display_name || "this biography";
    const paid = Boolean(role?.is_paid);
    const until = formatPeriodEnd(role?.current_period_end);
    const ok = window.confirm(
      paid
        ? until
          ? `Cancel the Share Stewarded subscription for ${name}?\n\nIt will remain Shared until ${until}, then return to Archive.`
          : `Cancel the Share Stewarded subscription for ${name}?\n\nIt will remain Shared until the end of the billing period, then return to Archive.`
        : `Archive ${name}? Chat will pause immediately. You can assign your free seat or subscribe again later.`,
    );
    if (!ok) return;
    await setRoleBilling(
      role,
      "archive",
      "monthly",
      paid
        ? until
          ? `Cancellation scheduled. ${name} stays Shared until ${until}, then returns to Archive.`
          : `Cancellation scheduled. ${name} stays Shared until the billing period ends, then returns to Archive.`
        : `${name} is now Archived.`,
    );
  }

  async function requestHandoff() {
    const stewardName = (accountExecutor?.name || "").trim() || "your Account Steward";
    const stewardEmail = (accountExecutor?.email || "").trim();
    const who = stewardEmail ? `${stewardName} (${stewardEmail})` : stewardName;
    const ok = window.confirm(
      `Hand off your biography to ${who}?\n\n` +
        "They must already have a Kinin account. When they accept, Stewardship becomes active on free Archive, " +
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
    const parsed = await post("/stewardship/export", { owner_user_id: ownerUserId }, "");
    if (!parsed?.package) return;
    try {
      const { downloadBiographyPdf } = await import("../services/biographyExportPdf");
      await downloadBiographyPdf(parsed.package, {
        filename: parsed.filename || "kinin-biography.pdf",
      });
      setNotice("Biography PDF downloaded.");
    } catch (e) {
      setError(describeApiErrorMessage(e, "Could not build the PDF export."));
    }
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
            {own?.own_designation?.status === "claim_pending" ||
            own?.pending_stewardship_claim?.active ? (
              <Banner tone="info">
                <span>
                  <strong>A Stewardship request is waiting.</strong>{" "}
                  {(own?.pending_stewardship_claim?.steward_name ||
                    own?.own_designation?.steward_name ||
                    "Your Account Steward") + " "}
                  started a request to take care of this biography. Your interview
                  stays open during the waiting period. If this was unexpected and you
                  want to keep interviewing, choose <strong>I’m still here</strong>{" "}
                  below to cancel the request.
                </span>
              </Banner>
            ) : null}
            {!(own?.interview_sealed || interviewSealed) ? (
              <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
                <p className="km-prose" style={{ margin: 0 }}>
                  Name your Account Steward above first. Handing off is an end-of-use
                  step for storytelling on this account: when they accept, you stop
                  adding new interview or journal material here.
                </p>
                <ActionBlock
                  help={
                    <>
                      <strong>Hand off to Account Steward</strong> — they must already
                      have a Kinin account. Emails them to accept (and confirms to
                      you). When they accept, the biography starts on free Archive
                      and Interview, Journal, Pins, and Review seal permanently
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
        <div className="km-prose" style={{ maxWidth: 560, marginBottom: 14 }}>
          <p className="km-muted" style={{ margin: 0 }}>
            Choose how each completed biography is shared. Archive pauses chat; Share
            Stewarded keeps explore chat and family invites available. Build Biography
            includes one free Share Stewarded seat.
          </p>
        </div>
        {loading ? (
          <Skeleton height={80} />
        ) : roles.length === 0 ? (
          <div className="km-prose">
            <p>No one has named you as their Account Steward yet.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {roles.map((role, index) => {
              const tone = STEWARD_BLOCK_TONES[index % STEWARD_BLOCK_TONES.length];
              const inviteOpen = shareDraft.owner_user_id === role.owner_user_id;
              const transferOpen = transferDraft.owner_user_id === role.owner_user_id;
              return (
              <div
                key={`${role.owner_user_id}-${role.steward_email}`}
                className="km-prose"
                style={{
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  borderRadius: 14,
                  padding: "16px 16px 18px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shield size={18} aria-hidden="true" />
                  <strong style={{ fontSize: "1.15rem" }}>
                    {role.owner_display_name || "Someone"}
                  </strong>
                </div>
                {role.status === "active" ? (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: "1.2rem",
                      fontWeight: 600,
                      lineHeight: 1.35,
                      letterSpacing: "0.01em",
                    }}
                  >
                    Current plan:{" "}
                    <span style={{ whiteSpace: "nowrap" }}>
                      {billingLabel(role)}
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
                  <div className="km-prose" style={{ marginTop: 4 }}>
                    Waiting period ends {role.claim_cooling_ends_at}
                  </div>
                ) : null}
                <div style={{ marginTop: 10 }}>
                  {role.status === "handoff_pending" && role.is_steward_transfer ? (
                    <div className="km-prose" style={{ maxWidth: 560 }}>
                      <p>
                        <strong>An Account Steward asked you to take over.</strong>{" "}
                        Accepting transfers Stewardship of this completed biography to
                        you on free Archive (chat paused). Turn on Share Stewarded later
                        ({PRICE_KEEP_MONTHLY} or {PRICE_KEEP_ANNUAL}, or free with Build
                        Biography) if you want explore chat and family interaction.
                      </p>
                      <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
                        <ActionBlock
                          help={
                            <>
                              <strong>Accept stewardship transfer — Archive (free)</strong>{" "}
                              — take over care with no charge. Chat stays paused until
                              you turn on Share Stewarded for family explore access.
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
                                "Stewardship transfer accepted on free Archive. Turn on Share Stewarded below when you want family explore chat.",
                              )
                            }
                          >
                            Accept stewardship transfer — Archive (free)
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
                        activates Stewardship on free Archive and permanently
                        seals their Interview, Journal, Pins, and Review. Turn on
                        Share Stewarded later when you want explore chat and family
                        interaction with this biography.
                      </p>
                      <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
                        <ActionBlock
                          help={
                            <>
                              <strong>Accept handoff — Archive (free)</strong> —
                              keep the biography stored with chat paused. No charge.
                              After accepting, turn on Share Stewarded below so family
                              can explore and chat.
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
                                "Stewardship accepted on free Archive. Their biography is completed. Turn on Share Stewarded when you want family explore chat.",
                              )
                            }
                          >
                            Accept handoff — Archive (free)
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
                      const onArchive = isArchivePlan(role.billing_plan);
                      const freeHolder = roles.find(
                        (r) => r?.status === "active" && r?.is_free_seat
                      );
                      const cancelUntil = formatPeriodEnd(role?.current_period_end);
                      return (
                        <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
                          <p style={{ margin: 0 }}>
                            Stewardship is active for {ownerName}. Their biography is
                            completed — storytelling on that account is closed. Use the
                            actions below to care for it.
                          </p>
                          {onArchive ? (
                            <Banner tone="info">
                              <span>
                                <strong>Current plan: Archive (chat paused).</strong> Turn
                                on Share Stewarded so you and invited family can explore
                                this biography.
                                {grantsFreeSeat && freeSeatAvailable ? (
                                  <> Your free seat from Build Biography is available.</>
                                ) : null}
                                {grantsFreeSeat && freeHolder ? (
                                  <>
                                    {" "}
                                    Free seat is currently on{" "}
                                    <strong>
                                      {freeHolder.owner_display_name || "another biography"}
                                    </strong>
                                    .
                                  </>
                                ) : null}
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

                          <div style={{ display: "grid", gap: 8 }}>
                            <div
                              className="km-form-actions"
                              style={{
                                justifyContent: "flex-start",
                                flexWrap: "wrap",
                                gap: 10,
                              }}
                            >
                              {onArchive ? (
                                <>
                                  <Button
                                    variant="primary"
                                    disabled={busy || !grantsFreeSeat}
                                    onClick={() => useFreeSeatForRole(role)}
                                    title={
                                      !grantsFreeSeat
                                        ? "Requires an active Build Biography subscription"
                                        : freeSeatAvailable
                                          ? "Assign your free seat included with Build Biography"
                                          : freeHolder
                                            ? `Move free seat from ${freeHolder.owner_display_name || "the other biography"}`
                                            : ""
                                    }
                                  >
                                    {!grantsFreeSeat
                                      ? "Free seat needs Build Biography"
                                      : freeSeatAvailable
                                        ? "Use free seat"
                                        : "Move free seat here"}
                                  </Button>
                                  <Button
                                    disabled={busy || !stripeConfigured}
                                    onClick={() => subscribeRole(role, "monthly")}
                                  >
                                    Subscribe monthly · {PRICE_KEEP_MONTHLY}
                                  </Button>
                                  <Button
                                    disabled={busy || !stripeConfigured}
                                    onClick={() => subscribeRole(role, "annual")}
                                  >
                                    Subscribe annual · {PRICE_KEEP_ANNUAL}
                                  </Button>
                                </>
                              ) : (
                                <div style={{ display: "grid", gap: 6 }}>
                                  <Button
                                    disabled={
                                      busy ||
                                      !stripeConfigured ||
                                      Boolean(role?.cancel_at_period_end)
                                    }
                                    onClick={() => archiveRole(role)}
                                  >
                                    {role?.cancel_at_period_end
                                      ? "Cancellation scheduled"
                                      : role?.is_paid
                                        ? "Cancel subscription"
                                        : "Archive"}
                                  </Button>
                                  {role?.is_paid && !role?.cancel_at_period_end ? (
                                    <p className="km-muted" style={{ margin: 0, fontSize: 13 }}>
                                      Cancels renewal. This biography stays Shared until
                                      the end of the paid period, then returns to Archive.
                                    </p>
                                  ) : null}
                                  {role?.cancel_at_period_end ? (
                                    <p className="km-muted" style={{ margin: 0, fontSize: 13 }}>
                                      {cancelUntil
                                        ? `Stays Shared until ${cancelUntil}, then returns to Archive.`
                                        : "Stays Shared until the paid period ends, then returns to Archive."}
                                    </p>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          </div>

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
                                <strong>Export copy</strong> — download a readable
                                PDF of the interview and journal for backup or
                                sharing offline.
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
                                <strong>Invite family access</strong> — invite someone to
                                explore <strong>{ownerName}</strong>’s completed
                                biography. They can ask questions; they cannot edit.
                                Requires Share Stewarded (not Archive).
                              </>
                            }
                          >
                            <Button
                              disabled={busy}
                              aria-expanded={inviteOpen}
                              onClick={() => {
                                if (inviteOpen) {
                                  setShareDraft({
                                    owner_user_id: "",
                                    owner_display_name: "",
                                    email: "",
                                    relationship: "",
                                  });
                                  return;
                                }
                                setTransferDraft({
                                  owner_user_id: "",
                                  owner_display_name: "",
                                  email: "",
                                  name: "",
                                });
                                setShareDraft({
                                  owner_user_id: role.owner_user_id,
                                  owner_display_name: ownerName,
                                  email: "",
                                  relationship: "",
                                });
                              }}
                            >
                              {inviteOpen
                                ? "Hide invite form"
                                : "Invite family access"}
                            </Button>
                            {inviteOpen ? (
                              <div
                                style={{
                                  marginTop: 12,
                                  padding: "14px 14px 12px",
                                  borderRadius: 10,
                                  background: "rgba(255,255,255,0.55)",
                                  border: "1px solid rgba(26,20,11,0.12)",
                                }}
                              >
                                <p style={{ margin: "0 0 12px", fontWeight: 600 }}>
                                  Invite family to {ownerName}’s biography
                                </p>
                                <p className="km-muted" style={{ margin: "0 0 12px" }}>
                                  They can ask questions grounded in memories already
                                  shared. They cannot edit the interview or journal.
                                </p>
                                <div className="km-form-grid">
                                  <FormRow label="Email">
                                    <TextInput
                                      value={shareDraft.email}
                                      onChange={(e) =>
                                        setShareDraft((p) => ({
                                          ...p,
                                          email: e.target.value,
                                        }))
                                      }
                                      disabled={busy}
                                      inputMode="email"
                                    />
                                  </FormRow>
                                  <FormRow label="Relationship (optional)">
                                    <TextInput
                                      value={shareDraft.relationship}
                                      onChange={(e) =>
                                        setShareDraft((p) => ({
                                          ...p,
                                          relationship: e.target.value,
                                        }))
                                      }
                                      disabled={busy}
                                    />
                                  </FormRow>
                                </div>
                                <div className="km-row" style={{ marginTop: 14, gap: 8 }}>
                                  <Button
                                    variant="primary"
                                    disabled={busy || !(shareDraft.email || "").trim()}
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
                              </div>
                            ) : null}
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
                                  free Archive.
                                </>
                              }
                            >
                              <Button
                                disabled={busy}
                                aria-expanded={transferOpen}
                                onClick={() => {
                                  if (transferOpen) {
                                    setTransferDraft({
                                      owner_user_id: "",
                                      owner_display_name: "",
                                      email: "",
                                      name: "",
                                    });
                                    return;
                                  }
                                  setShareDraft({
                                    owner_user_id: "",
                                    owner_display_name: "",
                                    email: "",
                                    relationship: "",
                                  });
                                  setTransferDraft({
                                    owner_user_id: role.owner_user_id,
                                    owner_display_name: ownerName,
                                    email: "",
                                    name: "",
                                  });
                                }}
                              >
                                {transferOpen
                                  ? "Hide hand off form"
                                  : "Hand off Stewardship"}
                              </Button>
                              {transferOpen ? (
                                <div
                                  style={{
                                    marginTop: 12,
                                    padding: "14px 14px 12px",
                                    borderRadius: 10,
                                    background: "rgba(255,255,255,0.55)",
                                    border: "1px solid rgba(26,20,11,0.12)",
                                  }}
                                >
                                  <p style={{ margin: "0 0 12px", fontWeight: 600 }}>
                                    Hand off {ownerName}’s biography
                                  </p>
                                  <p className="km-muted" style={{ margin: "0 0 12px" }}>
                                    Recipient must already have a Kinin account. They
                                    start on free Archive when they accept.
                                  </p>
                                  <div className="km-form-grid">
                                    <FormRow label="Recipient name (optional)">
                                      <TextInput
                                        value={transferDraft.name}
                                        onChange={(e) =>
                                          setTransferDraft((p) => ({
                                            ...p,
                                            name: e.target.value,
                                          }))
                                        }
                                        disabled={busy}
                                      />
                                    </FormRow>
                                    <FormRow label="Recipient email">
                                      <TextInput
                                        value={transferDraft.email}
                                        onChange={(e) =>
                                          setTransferDraft((p) => ({
                                            ...p,
                                            email: e.target.value,
                                          }))
                                        }
                                        disabled={busy}
                                        inputMode="email"
                                      />
                                    </FormRow>
                                  </div>
                                  <div
                                    className="km-row"
                                    style={{ marginTop: 14, gap: 8 }}
                                  >
                                    <Button
                                      variant="primary"
                                      disabled={
                                        busy || !(transferDraft.email || "").trim()
                                      }
                                      onClick={async () => {
                                        const toEmail = (
                                          transferDraft.email || ""
                                        ).trim();
                                        const toName = (
                                          transferDraft.name || ""
                                        ).trim();
                                        const who = toName
                                          ? `${toName} (${toEmail})`
                                          : toEmail;
                                        const ownerLabel =
                                          transferDraft.owner_display_name ||
                                          "this person";
                                        const ok = window.confirm(
                                          `Hand off Stewardship of ${ownerLabel}’s biography to ${who}?\n\n` +
                                            "They must already have a Kinin account. We’ll email them to accept, " +
                                            "and you’ll get a confirmation. You remain the Account Steward until they accept. " +
                                            "When they accept, the biography starts on free Archive.",
                                        );
                                        if (!ok) return;
                                        const parsed = await post(
                                          "/stewardship/transfer",
                                          {
                                            owner_user_id:
                                              transferDraft.owner_user_id,
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
                                </div>
                              ) : null}
                            </ActionBlock>
                          )}
                        </div>
                      );
                    })()
                  ) : null}
                </div>
              </div>
              );
            })}
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
