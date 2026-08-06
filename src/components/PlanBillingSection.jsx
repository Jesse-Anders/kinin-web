import { useEffect, useState } from "react";
import { Banner, Button, Frame } from "../theme";
import { describeApiErrorMessage } from "../services/describeApiError";

const PRICE_BUILD_MONTHLY = "$11.99/month";
const PRICE_BUILD_ANNUAL = "$99/year";
const PRICE_SHARE_MONTHLY = "$4.99/month";
const PRICE_SHARE_ANNUAL = "$49/year";
const PRICE_KEEP_MONTHLY = "$4.99/month";
const PRICE_KEEP_ANNUAL = "$49/year";

/** Soft panel tones — stewarded bios match Stewardship page (first two, alternating). */
const OWN_BIO_TONE = {
  bg: "rgba(52, 74, 110, 0.09)",
  border: "rgba(52, 74, 110, 0.26)",
};
const STEWARD_BIO_TONES = [
  { bg: "rgba(46, 88, 72, 0.09)", border: "rgba(46, 88, 72, 0.28)" },
  { bg: "rgba(122, 78, 48, 0.09)", border: "rgba(122, 78, 48, 0.26)" },
];

function tonePanelStyle(tone) {
  return {
    background: tone.bg,
    border: `1px solid ${tone.border}`,
    borderRadius: 14,
    padding: "16px 16px 18px",
  };
}

function formatIsoDate(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(t));
  } catch {
    return "";
  }
}

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

function planLabel(raw, interval, trialEndsAt, product) {
  const p = String(raw || "").trim().toLowerCase();
  const iv = String(interval || "").trim().toLowerCase();
  const prod = String(product || "").trim().toLowerCase();
  if (p === "share_bio" || (p === "active" && prod === "share_bio")) {
    if (iv === "monthly") return `Share My Biography · monthly (${PRICE_SHARE_MONTHLY})`;
    if (iv === "annual") return `Share My Biography · annual (${PRICE_SHARE_ANNUAL})`;
    return "Share My Biography";
  }
  if (p === "active") {
    if (iv === "monthly") return `Build Biography · monthly (${PRICE_BUILD_MONTHLY})`;
    if (iv === "annual") return `Build Biography · annual (${PRICE_BUILD_ANNUAL})`;
    return "Build Biography (paid)";
  }
  if (p === "trialing") {
    const ends = formatIsoDate(trialEndsAt);
    return ends
      ? `7-day full trial — ends ${ends}`
      : "7-day full trial — interview and your live biography";
  }
  if (p === "beta_invited") return "Full access (complimentary)";
  if (p === "biography_only") return "Free listener — shared biographies only";
  if (p === "past_due") return "Past due — update payment to keep access";
  if (p === "canceled") return "Free listener (subscription ended)";
  if (p === "none") return "No owner plan yet";
  return p ? p.replace(/_/g, " ") : "Unknown";
}

function bioPlanLabel(bio) {
  const plan = String(bio?.billing_plan || "").toLowerCase();
  if (plan === "keep_interactive" || plan === "legacy") {
    if (bio?.cancel_at_period_end) {
      const when = formatPeriodEnd(bio.current_period_end);
      return when
        ? `Shared — active until ${when}, then Archive`
        : "Shared — cancellation scheduled, then Archive";
    }
    if (bio?.is_free_seat) return "Shared (free with Build Biography)";
    if (bio?.is_paid) {
      const iv = String(bio.interval || "").toLowerCase();
      if (iv === "annual") return `Shared · annual (${PRICE_KEEP_ANNUAL})`;
      return `Shared · monthly (${PRICE_KEEP_MONTHLY})`;
    }
    return "Shared";
  }
  return "Archive (chat paused)";
}

function isArchiveBio(bio) {
  const plan = String(bio?.billing_plan || "").toLowerCase();
  return plan === "archive" || plan === "dormant" || !plan;
}

/**
 * Build Biography / Share Biography / stewarded bio status.
 */
export default function PlanBillingSection({
  apiBase = "",
  getAccessToken = null,
  planState = "",
  disabled = false,
}) {
  const [billingStatus, setBillingStatus] = useState(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingNotice, setBillingNotice] = useState("");
  const [preserveOpen, setPreserveOpen] = useState(false);

  async function refreshBillingStatus() {
    if (!apiBase || typeof getAccessToken !== "function") return null;
    const token = await getAccessToken();
    if (!token) return null;
    const res = await fetch(`${apiBase}/billing/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;
    if (!res.ok) {
      throw new Error(describeApiErrorMessage(parsed) || `HTTP ${res.status}`);
    }
    setBillingStatus(parsed);
    setBillingError("");
    return parsed;
  }

  useEffect(() => {
    if (!apiBase || typeof getAccessToken !== "function") return;
    let cancelled = false;
    (async () => {
      try {
        await refreshBillingStatus();
      } catch (e) {
        if (!cancelled) setBillingError(e?.message || "Could not load billing status");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, getAccessToken]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;

    const cleanUrl = () => {
      params.delete("checkout");
      const qs = params.toString();
      const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", next);
    };

    (async () => {
      if (checkout === "cancel") {
        setBillingNotice("Checkout canceled. You can subscribe anytime.");
        cleanUrl();
        return;
      }
      if (checkout !== "success") return;
      setBillingNotice("Checking your subscription…");
      try {
        let status = null;
        for (let i = 0; i < 5; i += 1) {
          status = await refreshBillingStatus();
          const plan = String(status?.plan_state || "").toLowerCase();
          if (plan === "active" || plan === "share_bio" || plan === "beta_invited") break;
          await new Promise((r) => setTimeout(r, 1500));
        }
        const plan = String(status?.plan_state || "").toLowerCase();
        if (plan === "active") {
          setBillingNotice("Build Biography is active.");
        } else if (plan === "share_bio") {
          setBillingNotice("Share My Biography is active.");
        } else if (plan === "beta_invited") {
          setBillingNotice("You're subscribed in Stripe; complimentary full access is unchanged.");
        } else {
          setBillingNotice(
            "Payment received in Stripe, but access hasn't updated yet. Wait a few seconds and refresh."
          );
        }
      } catch (e) {
        setBillingNotice(e?.message || "Could not confirm subscription status.");
      } finally {
        cleanUrl();
      }
    })();
  }, [apiBase, getAccessToken]);

  async function openCheckout(interval, product = "interviewer") {
    setBillingBusy(true);
    setBillingError("");
    setBillingNotice("");
    try {
      const token = await getAccessToken();
      const origin = window.location.origin;
      const res = await fetch(`${apiBase}/billing/checkout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          interval,
          product,
          success_url: `${origin}/account?section=billing&checkout=success`,
          cancel_url: `${origin}/account?section=billing&checkout=cancel`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;
      if (res.status === 409 || parsed?.error === "subscription_already_active") {
        setBillingNotice(
          "You already have an active owner plan. Use Switch plan or Manage billing instead."
        );
        await refreshBillingStatus().catch(() => null);
        setBillingBusy(false);
        return;
      }
      if (parsed?.error === "owner_plan_xor_conflict") {
        setBillingNotice(
          "Build Biography and Share My Biography can't both be active. Switch plans below, or cancel the current plan in Manage billing first."
        );
        await refreshBillingStatus().catch(() => null);
        setBillingBusy(false);
        return;
      }
      if (!res.ok) throw new Error(describeApiErrorMessage(parsed) || parsed?.error || `HTTP ${res.status}`);
      if (!parsed?.url) throw new Error("Checkout URL missing");
      window.location.href = parsed.url;
    } catch (e) {
      setBillingError(e?.message || "Checkout failed");
      setBillingBusy(false);
    }
  }

  async function changePlan(interval, product) {
    setBillingBusy(true);
    setBillingError("");
    setBillingNotice("");
    try {
      const token = await getAccessToken();
      const body = { interval };
      if (product) body.product = product;
      const res = await fetch(`${apiBase}/billing/change-plan`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;
      if (!res.ok) {
        throw new Error(
          describeApiErrorMessage(parsed) ||
            parsed?.error ||
            (res.status >= 500
              ? "Could not change plan right now. Try Manage billing."
              : `HTTP ${res.status}`)
        );
      }
      if (parsed?.action === "upgraded" || parsed?.action === "changed") {
        setBillingNotice("Plan updated. Stripe prorates so you aren't double-billed.");
      } else if (
        parsed?.action === "scheduled_downgrade" ||
        parsed?.action === "already_scheduled"
      ) {
        const when = formatPeriodEnd(parsed?.period_end);
        setBillingNotice(
          when
            ? `You're still on your current term until ${when}. After that you'll renew monthly.`
            : "You're still on your current term; the new interval begins when it ends."
        );
      } else {
        setBillingNotice("Plan update requested.");
      }
      await refreshBillingStatus();
    } catch (e) {
      setBillingError(e?.message || "Could not change plan");
    } finally {
      setBillingBusy(false);
    }
  }

  async function cancelOwnerPlan() {
    const when = formatPeriodEnd(billingStatus?.current_period_end);
    const name =
      String(billingStatus?.product || "").toLowerCase() === "share_bio"
        ? "Share My Biography"
        : "Build Biography";
    const ok = window.confirm(
      when
        ? `Cancel ${name}? You keep full access until ${when}, then your account becomes a free listener (shared biographies only).`
        : `Cancel ${name}? You keep full access until the end of the current period, then your account becomes a free listener (shared biographies only).`
    );
    if (!ok) return;
    setBillingBusy(true);
    setBillingError("");
    setBillingNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/billing/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;
      if (!res.ok) {
        throw new Error(describeApiErrorMessage(parsed) || parsed?.error || `HTTP ${res.status}`);
      }
      setBillingNotice(
        parsed?.action === "already_canceling"
          ? "This subscription is already set to end at the current period."
          : "Subscription canceled. You keep access until the end of the current period."
      );
      if (parsed?.plan_state) {
        setBillingStatus(parsed);
      } else {
        await refreshBillingStatus();
      }
    } catch (e) {
      setBillingError(e?.message || "Could not cancel subscription");
    } finally {
      setBillingBusy(false);
    }
  }

  async function keepCurrentInterval() {
    setBillingBusy(true);
    setBillingError("");
    setBillingNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/billing/cancel-scheduled-change`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;
      if (!res.ok) {
        throw new Error(describeApiErrorMessage(parsed) || parsed?.error || `HTTP ${res.status}`);
      }
      setBillingNotice(
        parsed?.action === "already_cleared"
          ? "No pending interval change — your current plan renews as-is."
          : "Pending switch to monthly was canceled. You'll stay on annual at renewal."
      );
      if (parsed?.plan_state != null) {
        setBillingStatus(parsed);
      } else {
        await refreshBillingStatus();
      }
    } catch (e) {
      setBillingError(e?.message || "Could not keep current interval");
    } finally {
      setBillingBusy(false);
    }
  }

  async function resumePlan() {
    setBillingBusy(true);
    setBillingError("");
    setBillingNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/billing/resume`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;
      if (!res.ok) {
        throw new Error(describeApiErrorMessage(parsed) || parsed?.error || `HTTP ${res.status}`);
      }
      setBillingNotice(
        parsed?.action === "already_active"
          ? "Your plan is already set to renew — nothing to resume."
          : "Your plan will continue. The scheduled cancellation has been called off."
      );
      if (parsed?.plan_state) {
        setBillingStatus(parsed);
      } else {
        await refreshBillingStatus();
      }
    } catch (e) {
      setBillingError(e?.message || "Could not resume plan");
    } finally {
      setBillingBusy(false);
    }
  }

  async function openPortal() {
    setBillingBusy(true);
    setBillingError("");
    setBillingNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/billing/portal`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          return_url: `${window.location.origin}/account?section=billing`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;
      if (!res.ok) throw new Error(describeApiErrorMessage(parsed) || parsed?.error || `HTTP ${res.status}`);
      if (!parsed?.url) throw new Error("Portal URL missing");
      window.location.href = parsed.url;
    } catch (e) {
      setBillingError(e?.message || "Could not open billing portal");
      setBillingBusy(false);
    }
  }

  async function postStewardBilling({
    ownerUserId,
    billingPlan,
    interval: iv = "monthly",
    notice = "",
  }) {
    const token = await getAccessToken();
    const origin = window.location.origin;
    const res = await fetch(`${apiBase}/stewardship/billing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        owner_user_id: ownerUserId,
        billing_plan: billingPlan,
        interval: iv,
        success_url: `${origin}/account?section=billing&checkout=success`,
        cancel_url: `${origin}/account?section=billing&checkout=cancel`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;
    if (!res.ok && !parsed?.checkout_required) {
      throw new Error(describeApiErrorMessage(parsed) || parsed?.error || `HTTP ${res.status}`);
    }
    if (parsed?.checkout_required && parsed?.url) {
      window.location.href = parsed.url;
      return parsed;
    }
    if (notice) setBillingNotice(notice);
    await refreshBillingStatus();
    return parsed;
  }

  async function useFreeStewardSeat(bio, freeSeatHolder) {
    const name = bio.display_name || "this biography";
    if (
      freeSeatHolder &&
      freeSeatHolder.owner_user_id &&
      freeSeatHolder.owner_user_id !== bio.owner_user_id
    ) {
      const holderName = freeSeatHolder.display_name || "another biography";
      const ok = window.confirm(
        `Your free Share Stewarded seat is currently on ${holderName}. ` +
          `Archive that biography and use the free seat for ${name}?`
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        `Use your free Share Stewarded seat (included with Build Biography) for ${name}?`
      );
      if (!ok) return;
    }

    setBillingBusy(true);
    setBillingError("");
    setBillingNotice("");
    try {
      if (
        freeSeatHolder &&
        freeSeatHolder.owner_user_id &&
        freeSeatHolder.owner_user_id !== bio.owner_user_id
      ) {
        await postStewardBilling({
          ownerUserId: freeSeatHolder.owner_user_id,
          billingPlan: "archive",
        });
      }
      await postStewardBilling({
        ownerUserId: bio.owner_user_id,
        billingPlan: "keep_interactive",
        notice: `Free Share Stewarded seat assigned to ${name}.`,
      });
    } catch (e) {
      setBillingError(e?.message || "Could not assign free seat");
    } finally {
      setBillingBusy(false);
    }
  }

  async function subscribeStewardBio(bio, iv) {
    const name = bio.display_name || "this biography";
    setBillingBusy(true);
    setBillingError("");
    setBillingNotice("");
    try {
      const parsed = await postStewardBilling({
        ownerUserId: bio.owner_user_id,
        billingPlan: "keep_interactive",
        interval: iv,
      });
      // Checkout redirects away; free-seat (and other in-app) paths must clear busy.
      if (parsed?.checkout_required && parsed?.url) return;
      setBillingNotice(
        parsed?.via === "free_seat"
          ? `Free Share Stewarded seat assigned to ${name}.`
          : `Share Stewarded is on for ${name}.`
      );
    } catch (e) {
      setBillingError(e?.message || "Could not start stewardship checkout");
    } finally {
      setBillingBusy(false);
    }
  }

  async function archiveStewardBio(bio) {
    const name = bio.display_name || "this biography";
    const paid = Boolean(bio?.is_paid);
    const until = formatPeriodEnd(bio?.current_period_end);
    const ok = window.confirm(
      paid
        ? until
          ? `Cancel the Share Stewarded subscription for ${name}?\n\nIt will remain Shared until ${until}, then return to Archive.`
          : `Cancel the Share Stewarded subscription for ${name}?\n\nIt will remain Shared until the end of the billing period, then return to Archive.`
        : `Archive ${name}? Chat will pause immediately. You can assign your free seat or subscribe again later.`
    );
    if (!ok) return;
    setBillingBusy(true);
    setBillingError("");
    setBillingNotice("");
    try {
      await postStewardBilling({
        ownerUserId: bio.owner_user_id,
        billingPlan: "archive",
        notice: paid
          ? until
            ? `Cancellation scheduled. ${name} stays Shared until ${until}, then returns to Archive.`
            : `Cancellation scheduled. ${name} stays Shared until the billing period ends, then returns to Archive.`
          : `${name} is now Archived.`,
      });
    } catch (e) {
      setBillingError(e?.message || "Could not update biography billing");
    } finally {
      setBillingBusy(false);
    }
  }

  const status = billingStatus;
  const effectivePlan = status?.plan_state || planState;
  const interval = status?.interval || "";
  const product = status?.product || "";
  const canCheckoutOwner = Boolean(status?.can_checkout_owner ?? status?.can_checkout);
  const canChange = Boolean(status?.can_change_plan);
  const busy = billingBusy || disabled;
  const periodEndLabel = formatPeriodEnd(status?.current_period_end);
  const cancelAtPeriodEnd = Boolean(status?.cancel_at_period_end);
  const scheduledInterval = String(status?.scheduled_interval || "")
    .trim()
    .toLowerCase();
  const trialEndsAt = status?.trial_ends_at || "";
  const trialEndsLabel = formatIsoDate(trialEndsAt);
  const plan = String(effectivePlan || "").toLowerCase();
  const isBuild = plan === "active" && product !== "share_bio";
  const isShareBio = plan === "share_bio" || (plan === "active" && product === "share_bio");
  // Owner plan set to cancel at period end: still active now, becomes free
  // listener at period end. Drives the cancel callout + Resume affordance and
  // hides the (contradictory) switch-interval buttons until resumed.
  const isOwnerPlanActive = isBuild || isShareBio;
  const ownerCancelPending = isOwnerPlanActive && cancelAtPeriodEnd;
  // Annual→monthly (etc.) already scheduled at period end — sticky state, not a re-clickable switch.
  const ownerSchedulePending =
    isOwnerPlanActive && !cancelAtPeriodEnd && Boolean(scheduledInterval);
  const ownerPlanName = isShareBio ? "Share My Biography" : "Build Biography";
  const grantsFreeSeat = isBuild || plan === "past_due";
  const stewardedBios = Array.isArray(status?.stewarded_bios) ? status.stewarded_bios : [];
  const freeSeatHolder = stewardedBios.find((b) => b?.is_free_seat) || null;
  const freeSeatAvailable = grantsFreeSeat && !freeSeatHolder;

  return (
    <Frame label="Plan & billing">
      {billingError ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="danger">{billingError}</Banner>
        </div>
      ) : null}
      {billingNotice ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info">{billingNotice}</Banner>
        </div>
      ) : null}

      <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
        <p style={{ margin: "0 0 8px" }}>
          <strong>Current subscriptions</strong>
        </p>
        <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>
          <li>
            <strong>Owner:</strong>{" "}
            {planLabel(effectivePlan, interval, trialEndsAt, product)}
            {ownerSchedulePending && periodEndLabel ? (
              <>
                {" "}
                — switching to {scheduledInterval} on {periodEndLabel}
              </>
            ) : null}
          </li>
          {stewardedBios.filter((b) => {
            const p = String(b?.billing_plan || "").toLowerCase();
            return p === "keep_interactive" || p === "legacy";
          }).length === 0 ? (
            <li className="km-muted">
              <strong>Share Stewarded:</strong> none active
            </li>
          ) : (
            stewardedBios
              .filter((b) => {
                const p = String(b?.billing_plan || "").toLowerCase();
                return p === "keep_interactive" || p === "legacy";
              })
              .map((bio) => (
                <li key={bio.owner_user_id || bio.display_name}>
                  <strong>Share Stewarded:</strong> {bio.display_name || "Biography"} —{" "}
                  {bioPlanLabel(bio)}
                </li>
              ))
          )}
        </ul>
        {plan === "trialing" && trialEndsLabel ? (
          <p className="km-muted">
            Full trial ends on <strong>{trialEndsLabel}</strong>.
          </p>
        ) : null}
        {ownerCancelPending ? (
          <div
            style={{
              background: "rgba(140, 56, 24, 0.07)",
              border: "1px solid rgba(140, 56, 24, 0.34)",
              borderRadius: 12,
              padding: "12px 14px",
              margin: "4px 0 6px",
            }}
          >
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>
              Your {ownerPlanName} plan is canceled
              {periodEndLabel ? <> and ends on {periodEndLabel}</> : <> at the end of the current period</>}.
            </p>
            <p className="km-muted" style={{ margin: 0 }}>
              You keep full access until then. After that your account becomes a free listener
              (shared biographies only). Changed your mind? <strong>Resume plan</strong> below to
              keep it — no new charge.
            </p>
          </div>
        ) : null}
        {ownerSchedulePending ? (
          <div
            style={{
              background: "rgba(52, 74, 110, 0.08)",
              border: "1px solid rgba(52, 74, 110, 0.28)",
              borderRadius: 12,
              padding: "12px 14px",
              margin: "4px 0 6px",
            }}
          >
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>
              Switching to monthly
              {periodEndLabel ? <> on {periodEndLabel}</> : <> at the end of the current term</>}
            </p>
            <p className="km-muted" style={{ margin: 0 }}>
              You&apos;re still on annual (
              {isShareBio ? PRICE_SHARE_ANNUAL : PRICE_BUILD_ANNUAL}) until then. After that
              you&apos;ll renew monthly (
              {isShareBio ? PRICE_SHARE_MONTHLY : PRICE_BUILD_MONTHLY}). Use{" "}
              <strong>Keep annual</strong> below if you want to stay on annual at renewal.
            </p>
          </div>
        ) : null}
        {!status?.stripe_configured ? (
          <p className="km-muted">Billing is not fully configured on this environment yet.</p>
        ) : null}
      </div>

      <div className="km-prose" style={{ maxWidth: 560, marginBottom: 10 }}>
        <p style={{ margin: "0 0 8px" }}>
          <strong>Subscription — Build Biography</strong>
        </p>
        <p className="km-muted" style={{ margin: 0 }}>
          Unlocks interviewing and journaling for your own biography, and includes sharing it
          with family. Also includes one free Share Stewarded Biography seat for a sealed
          biography you steward.
        </p>
      </div>
      <div
        className="km-form-actions"
        style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}
      >
        {canCheckoutOwner ? (
          <>
            <Button
              variant="primary"
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("monthly", "interviewer")}
            >
              Monthly · {PRICE_BUILD_MONTHLY}
            </Button>
            <Button
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("annual", "interviewer")}
            >
              Annual · {PRICE_BUILD_ANNUAL}
            </Button>
          </>
        ) : null}
        {ownerCancelPending ? (
          <Button
            variant="primary"
            disabled={busy || !status?.stripe_configured}
            onClick={() => resumePlan()}
          >
            Resume plan
          </Button>
        ) : null}
        {ownerSchedulePending && isBuild ? (
          <Button
            variant="primary"
            disabled={busy || !status?.stripe_configured}
            onClick={() => keepCurrentInterval()}
          >
            Keep annual
          </Button>
        ) : null}
        {canChange && !cancelAtPeriodEnd && !ownerSchedulePending && isBuild && interval !== "annual" ? (
          <Button
            variant="primary"
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("annual", "interviewer")}
          >
            Switch to annual · {PRICE_BUILD_ANNUAL}
          </Button>
        ) : null}
        {canChange && !cancelAtPeriodEnd && !ownerSchedulePending && isBuild && interval !== "monthly" ? (
          <Button
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("monthly", "interviewer")}
          >
            Switch to monthly at period end · {PRICE_BUILD_MONTHLY}
          </Button>
        ) : null}
        {canChange && !cancelAtPeriodEnd && isShareBio ? (
          <Button
            variant="primary"
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan(interval || "monthly", "interviewer")}
          >
            Switch to Build Biography
          </Button>
        ) : null}
        {isOwnerPlanActive && !ownerCancelPending ? (
          <Button
            disabled={busy || !status?.stripe_configured}
            onClick={() => cancelOwnerPlan()}
          >
            Cancel subscription
          </Button>
        ) : null}
        <Button disabled={busy || !status?.has_customer} onClick={() => openPortal()}>
          Manage billing
        </Button>
      </div>

      <div style={{ maxWidth: 560, marginBottom: 12 }}>
        <button
          type="button"
          aria-expanded={preserveOpen}
          onClick={() => setPreserveOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            background: "none",
            border: "none",
            padding: 0,
            textAlign: "left",
            cursor: "pointer",
            font: "inherit",
            color: "inherit",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: "1em",
              transition: "transform 0.15s ease",
              transform: preserveOpen ? "rotate(90deg)" : "rotate(0deg)",
              fontSize: "0.85em",
              lineHeight: 1,
            }}
          >
            ▸
          </span>
          <strong>Subscriptions — Preserve Biographies</strong>
        </button>

        {preserveOpen ? (
          <div className="km-prose" style={{ marginTop: 16, display: "grid", gap: 14 }}>
            <div style={tonePanelStyle(OWN_BIO_TONE)}>
              <p style={{ margin: "0 0 6px" }}>
                <strong>Share My Biography</strong>
              </p>
              {isBuild ? (
                <>
                  <p className="km-muted" style={{ margin: "0 0 12px" }}>
                    This feature is already included with your active Build Biography
                    subscription.
                  </p>
                  <div
                    className="km-form-actions"
                    style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 12 }}
                  >
                    <Button disabled>
                      Monthly · {PRICE_SHARE_MONTHLY} — included
                    </Button>
                    <Button disabled>
                      Annual · {PRICE_SHARE_ANNUAL} — included
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="km-muted" style={{ margin: "0 0 12px" }}>
                    Keep your own biography interactive for family — without interviewing or
                    journaling. Not needed if you already have Build Biography.
                  </p>
                  <div
                    className="km-form-actions"
                    style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 12 }}
                  >
                    {canCheckoutOwner ? (
                      <>
                        <Button
                          disabled={busy || !status?.stripe_configured}
                          onClick={() => openCheckout("monthly", "share_bio")}
                        >
                          Monthly · {PRICE_SHARE_MONTHLY}
                        </Button>
                        <Button
                          disabled={busy || !status?.stripe_configured}
                          onClick={() => openCheckout("annual", "share_bio")}
                        >
                          Annual · {PRICE_SHARE_ANNUAL}
                        </Button>
                      </>
                    ) : null}
                    {ownerSchedulePending && isShareBio ? (
                      <Button
                        variant="primary"
                        disabled={busy || !status?.stripe_configured}
                        onClick={() => keepCurrentInterval()}
                      >
                        Keep annual
                      </Button>
                    ) : null}
                    {canChange &&
                    !cancelAtPeriodEnd &&
                    !ownerSchedulePending &&
                    isShareBio &&
                    interval !== "annual" ? (
                      <Button
                        disabled={busy || !status?.stripe_configured}
                        onClick={() => changePlan("annual", "share_bio")}
                      >
                        Switch to annual · {PRICE_SHARE_ANNUAL}
                      </Button>
                    ) : null}
                    {canChange &&
                    !cancelAtPeriodEnd &&
                    !ownerSchedulePending &&
                    isShareBio &&
                    interval !== "monthly" ? (
                      <Button
                        disabled={busy || !status?.stripe_configured}
                        onClick={() => changePlan("monthly", "share_bio")}
                      >
                        Switch to monthly at period end · {PRICE_SHARE_MONTHLY}
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <div>
              <p style={{ margin: "0 0 6px" }}>
                <strong>Share Stewarded Biographies</strong>
              </p>
              <p className="km-muted" style={{ margin: "0 0 12px" }}>
                When you steward a sealed biography, turn on sharing so family can chat with
                it. Build Biography includes <strong>one free</strong> shared stewarded
                biography; additional ones are {PRICE_KEEP_MONTHLY} or {PRICE_KEEP_ANNUAL}{" "}
                each.
                {grantsFreeSeat && freeSeatAvailable ? (
                  <>
                    {" "}
                    Your free seat is available — assign it to one biography below.
                  </>
                ) : null}
                {grantsFreeSeat && freeSeatHolder ? (
                  <>
                    {" "}
                    Free seat in use on{" "}
                    <strong>{freeSeatHolder.display_name || "a biography"}</strong>.
                  </>
                ) : null}
                {!grantsFreeSeat ? (
                  <> Subscribe to Build Biography above to unlock the free seat.</>
                ) : null}
              </p>
              {stewardedBios.length === 0 ? (
                <p className="km-muted" style={{ margin: 0 }}>
                  You aren&apos;t stewarding any sealed biographies yet. Accept a handoff in
                  Settings → Stewardship, then return here to assign your free seat or
                  subscribe.
                </p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "grid",
                    gap: 14,
                  }}
                >
                  {stewardedBios.map((bio, index) => {
                    const archived = isArchiveBio(bio);
                    const interactive = !archived;
                    const cancelUntil = formatPeriodEnd(bio?.current_period_end);
                    const tone =
                      STEWARD_BIO_TONES[index % STEWARD_BIO_TONES.length];
                    return (
                      <li
                        key={bio.owner_user_id || bio.display_name}
                        style={tonePanelStyle(tone)}
                      >
                        <p style={{ margin: "0 0 4px" }}>
                          <strong>{bio.display_name || "Biography"}</strong>
                        </p>
                        <p className="km-muted" style={{ margin: "0 0 10px" }}>
                          {bioPlanLabel(bio)}
                        </p>
                        <div
                          className="km-form-actions"
                          style={{
                            justifyContent: "flex-start",
                            flexWrap: "wrap",
                            gap: 10,
                          }}
                        >
                          {archived ? (
                            <>
                              <Button
                                variant="primary"
                                disabled={busy || !grantsFreeSeat}
                                onClick={() => useFreeStewardSeat(bio, freeSeatHolder)}
                                title={
                                  !grantsFreeSeat
                                    ? "Requires an active Build Biography subscription"
                                    : freeSeatAvailable
                                      ? "Assign your free seat included with Build Biography"
                                      : freeSeatHolder
                                        ? `Move free seat from ${freeSeatHolder.display_name || "the other biography"}`
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
                                disabled={busy || !status?.stripe_configured}
                                onClick={() => subscribeStewardBio(bio, "monthly")}
                              >
                                Subscribe monthly · {PRICE_KEEP_MONTHLY}
                              </Button>
                              <Button
                                disabled={busy || !status?.stripe_configured}
                                onClick={() => subscribeStewardBio(bio, "annual")}
                              >
                                Subscribe annual · {PRICE_KEEP_ANNUAL}
                              </Button>
                            </>
                          ) : null}
                          {interactive ? (
                            <div style={{ display: "grid", gap: 6 }}>
                              <Button
                                disabled={
                                  busy ||
                                  !status?.stripe_configured ||
                                  Boolean(bio?.cancel_at_period_end)
                                }
                                onClick={() => archiveStewardBio(bio)}
                              >
                                {bio?.cancel_at_period_end
                                  ? "Cancellation scheduled"
                                  : bio?.is_paid
                                    ? "Cancel subscription"
                                    : "Archive"}
                              </Button>
                              {bio?.is_paid && !bio?.cancel_at_period_end ? (
                                <p className="km-muted" style={{ margin: 0, fontSize: 13 }}>
                                  Cancels renewal. This biography stays Shared until the
                                  end of the paid period, then returns to Archive.
                                </p>
                              ) : null}
                              {bio?.cancel_at_period_end ? (
                                <p className="km-muted" style={{ margin: 0, fontSize: 13 }}>
                                  {cancelUntil
                                    ? `Stays Shared until ${cancelUntil}, then returns to Archive.`
                                    : "Stays Shared until the paid period ends, then returns to Archive."}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Frame>
  );
}
