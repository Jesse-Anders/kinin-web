import { useEffect, useState } from "react";
import { Banner, Button, Frame } from "../theme";
import { describeApiErrorMessage } from "../services/describeApiError";

const PRICE_MONTHLY = "$11.99/month";
const PRICE_ANNUAL = "$99/year";

function planLabel(raw, interval) {
  const p = String(raw || "").trim().toLowerCase();
  const iv = String(interval || "").trim().toLowerCase();
  if (p === "active") {
    if (iv === "monthly") return `Interviewer · monthly (${PRICE_MONTHLY})`;
    if (iv === "annual") return `Interviewer · annual (${PRICE_ANNUAL})`;
    return "Interviewer (paid)";
  }
  if (p === "trialing") return "Full trial — interview and your live biography";
  if (p === "beta_invited") return "Full access (complimentary)";
  if (p === "biography_only") return "Free listener — shared biographies only";
  if (p === "past_due") return "Past due — update payment to keep interviewing";
  if (p === "canceled") return "Free listener (subscription ended)";
  if (p === "none") return "No interviewer plan yet";
  return p ? p.replace(/_/g, " ") : "Unknown";
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

function planExplainer({ effectivePlan, interval, canCheckout, canChange, cancelAtPeriodEnd, periodEndLabel }) {
  const p = String(effectivePlan || "").trim().toLowerCase();

  if (p === "biography_only" || p === "canceled" || p === "none") {
    return (
      <>
        <p>
          You&apos;re on the <strong>free listener</strong> plan. You can explore
          biographies that paying storytellers (or Legacy stewards) share with you.
          You can&apos;t run your own interview or chat with your own live biography
          until you subscribe.
        </p>
        <p>
          <strong>Interviewer plans:</strong> {PRICE_MONTHLY}, or {PRICE_ANNUAL}{" "}
          (best value). Either unlocks interviewing, journaling, and an interactive
          biography you can share with family and close friends.
        </p>
      </>
    );
  }

  if (p === "trialing") {
    return (
      <>
        <p>
          You&apos;re on a <strong>full trial</strong> — interviewing and your own
          live biography are unlocked for a limited time. When the trial ends you
          become a free listener unless you subscribe.
        </p>
        <p>
          Subscribe anytime: <strong>{PRICE_MONTHLY}</strong> or{" "}
          <strong>{PRICE_ANNUAL}</strong>.
        </p>
      </>
    );
  }

  if (p === "past_due") {
    return (
      <>
        <p>
          There&apos;s a <strong>billing problem</strong> on this account. Interview
          and interactive chat on your own biography are paused until payment is
          updated. Use <strong>Manage billing</strong> to fix your card.
        </p>
        <p>
          Plans: {PRICE_MONTHLY} or {PRICE_ANNUAL}.
        </p>
      </>
    );
  }

  if (p === "active") {
    const intervalLine =
      interval === "monthly"
        ? `You're on the monthly Interviewer plan (${PRICE_MONTHLY}).`
        : interval === "annual"
          ? `You're on the annual Interviewer plan (${PRICE_ANNUAL}).`
          : "You're on a paid Interviewer plan.";
    return (
      <>
        <p>
          {intervalLine} That covers interviewing, journaling, and interactive chat
          on your live biography — including sharing it with people in your Family
          Circle.
        </p>
        {cancelAtPeriodEnd && periodEndLabel ? (
          <p>
            Cancellation is scheduled: you keep full access through{" "}
            <strong>{periodEndLabel}</strong>, then you become a free listener. You
            can reverse the cancel or switch plans before then via the buttons below
            or Manage billing.
          </p>
        ) : null}
        {canChange && interval === "monthly" && !cancelAtPeriodEnd ? (
          <p>
            Switch to annual ({PRICE_ANNUAL}) anytime — Stripe prorates so you
            aren&apos;t double-billed. Or open Manage billing to update your card or
            cancel at period end.
          </p>
        ) : null}
        {canChange && interval === "annual" ? (
          <p>
            Prefer monthly ({PRICE_MONTHLY})? You can schedule that for the end of
            your annual term so the year completes first. Manage billing also lets
            you update your card or cancel.
          </p>
        ) : null}
        {canChange && interval === "monthly" && cancelAtPeriodEnd ? (
          <p>
            You can still switch to annual ({PRICE_ANNUAL}) before the cancel date,
            or use Manage billing to resume monthly / update payment.
          </p>
        ) : null}
      </>
    );
  }

  if (p === "beta_invited") {
    return (
      <>
        <p>
          You have <strong>full complimentary access</strong> to interview and your
          live biography. Paid plans ({PRICE_MONTHLY} / {PRICE_ANNUAL}) are optional
          if you want a Stripe billing profile for later.
        </p>
      </>
    );
  }

  if (canCheckout) {
    return (
      <p>
        Choose an Interviewer plan to unlock interviewing and your own shareable
        biography: {PRICE_MONTHLY} or {PRICE_ANNUAL}.
      </p>
    );
  }

  return (
    <p>
      Manage your interviewer subscription below. Plans: {PRICE_MONTHLY} or{" "}
      {PRICE_ANNUAL}.
    </p>
  );
}

/**
 * Interviewer plan subscribe / change / portal controls.
 * Lives on My Account (Phase 2.3c); return URLs use /account.
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
          if (status?.plan_state === "active" || status?.plan_state === "beta_invited") break;
          await new Promise((r) => setTimeout(r, 1500));
        }
        if (status?.plan_state === "active") {
          setBillingNotice("You're subscribed. Interviewer access is active.");
        } else if (status?.plan_state === "beta_invited") {
          setBillingNotice("You're subscribed in Stripe; complimentary full access is unchanged.");
        } else {
          setBillingNotice(
            "Payment received in Stripe, but access hasn't updated yet. Wait a few seconds and refresh, or contact support if it stays stuck."
          );
        }
      } catch (e) {
        setBillingNotice(e?.message || "Could not confirm subscription status.");
      } finally {
        cleanUrl();
      }
    })();
  }, [apiBase, getAccessToken]);

  async function openCheckout(interval) {
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
          success_url: `${origin}/account?section=billing&checkout=success`,
          cancel_url: `${origin}/account?section=billing&checkout=cancel`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;
      if (res.status === 409 || parsed?.error === "subscription_already_active") {
        setBillingNotice(
          "You already have an active interviewer subscription. Use Switch plan or Manage billing instead of starting a new checkout."
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

  async function changePlan(interval) {
    setBillingBusy(true);
    setBillingError("");
    setBillingNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/billing/change-plan`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json().catch(() => ({}));
      const parsed = typeof data?.body === "string" ? JSON.parse(data.body) : data;
      if (!res.ok) {
        const msg =
          describeApiErrorMessage(parsed) ||
          parsed?.error ||
          (res.status >= 500
            ? "Could not change plan right now. Try again in a moment, or use Manage billing."
            : `HTTP ${res.status}`);
        throw new Error(msg);
      }
      if (parsed?.action === "upgraded") {
        setBillingNotice(
          `Switched to annual (${PRICE_ANNUAL}). Your monthly plan ended; Stripe prorates the difference so you aren't charged twice.`
        );
      } else if (parsed?.action === "scheduled_downgrade") {
        const when = formatPeriodEnd(parsed?.period_end);
        setBillingNotice(
          when
            ? `Annual plan continues until ${when}. Monthly (${PRICE_MONTHLY}) starts after that — you won't be charged twice.`
            : `Annual plan continues until the end of the current year term, then monthly (${PRICE_MONTHLY}) begins.`
        );
      } else if (parsed?.error === "already_on_interval") {
        setBillingNotice("You're already on that plan.");
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

  const status = billingStatus;
  const effectivePlan = status?.plan_state || planState;
  const interval = status?.interval || "";
  const canCheckout = Boolean(status?.can_checkout);
  const canChange = Boolean(status?.can_change_plan);
  const busy = billingBusy || disabled;
  const periodEndLabel = formatPeriodEnd(status?.current_period_end);
  const cancelAtPeriodEnd = Boolean(status?.cancel_at_period_end);

  return (
    <Frame label="Plan & billing">
      <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
        {planExplainer({
          effectivePlan,
          interval,
          canCheckout,
          canChange,
          cancelAtPeriodEnd,
          periodEndLabel,
        })}
      </div>
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
        <p>
          <strong>Current plan:</strong> {planLabel(effectivePlan, interval)}
        </p>
        {cancelAtPeriodEnd && periodEndLabel ? (
          <p className="km-muted">Access continues through {periodEndLabel}, then free listener.</p>
        ) : null}
        {status?.scheduled_interval === "monthly" && periodEndLabel ? (
          <p className="km-muted">
            Scheduled: switch to monthly ({PRICE_MONTHLY}) after {periodEndLabel}.
          </p>
        ) : null}
        {!status?.stripe_configured ? (
          <p className="km-muted">
            Billing is not fully configured on this environment yet. Subscribe
            buttons will return an error until setup finishes.
          </p>
        ) : null}
      </div>
      <div
        className="km-form-actions"
        style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 12 }}
      >
        {canCheckout ? (
          <>
            <Button
              variant="primary"
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("monthly")}
            >
              Subscribe monthly · {PRICE_MONTHLY}
            </Button>
            <Button
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("annual")}
            >
              Subscribe annually · {PRICE_ANNUAL}
            </Button>
          </>
        ) : null}
        {canChange && interval !== "annual" ? (
          <Button
            variant="primary"
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("annual")}
          >
            Switch to annual · {PRICE_ANNUAL}
          </Button>
        ) : null}
        {canChange && interval !== "monthly" ? (
          <Button
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("monthly")}
          >
            Switch to monthly at period end · {PRICE_MONTHLY}
          </Button>
        ) : null}
        <Button
          disabled={busy || !status?.has_customer}
          onClick={() => openPortal()}
        >
          Manage billing
        </Button>
      </div>
    </Frame>
  );
}
