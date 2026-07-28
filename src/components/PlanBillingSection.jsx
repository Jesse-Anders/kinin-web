import { useEffect, useState } from "react";
import { Banner, Button, Frame } from "../theme";
import { describeApiErrorMessage } from "../services/describeApiError";

function planLabel(raw, interval) {
  const p = String(raw || "").trim().toLowerCase();
  const iv = String(interval || "").trim().toLowerCase();
  const intervalNote =
    iv === "monthly" ? " · monthly" : iv === "annual" ? " · annual" : "";
  if (p === "active") return `Interviewer (paid)${intervalNote}`;
  if (p === "trialing") return "Full trial";
  if (p === "beta_invited") return "Beta (full access, free)";
  if (p === "biography_only") return "Free listener (read-only)";
  if (p === "past_due") return "Past due — update payment";
  if (p === "canceled") return "Free listener (subscription ended)";
  if (p === "none") return "No plan yet";
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
          setBillingNotice(
            "You're on beta full access. A Stripe customer may be linked, but beta stays free."
          );
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
          success_url: `${origin}/account?checkout=success`,
          cancel_url: `${origin}/account?checkout=cancel`,
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
      if (!res.ok) throw new Error(describeApiErrorMessage(parsed) || parsed?.error || `HTTP ${res.status}`);
      if (parsed?.action === "upgraded") {
        setBillingNotice("Switched to annual. Your monthly plan has ended; Stripe prorates the difference.");
      } else if (parsed?.action === "scheduled_downgrade") {
        const when = formatPeriodEnd(parsed?.period_end);
        setBillingNotice(
          when
            ? `Annual plan continues until ${when}. Monthly billing starts after that — you won't be charged twice.`
            : "Annual plan continues until the end of the current year term, then monthly begins."
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
          return_url: `${window.location.origin}/account`,
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

  return (
    <Frame label="Plan & billing">
      <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
        <p>
          Your interviewer subscription covers interviewing and interactive chat
          on your live biography. Beta-invited accounts stay free. Cancel or
          update your card in the Stripe customer portal.
        </p>
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
        {status?.cancel_at_period_end && periodEndLabel ? (
          <p className="km-muted">Cancels at period end ({periodEndLabel}).</p>
        ) : null}
        {status?.scheduled_interval === "monthly" && periodEndLabel ? (
          <p className="km-muted">
            Scheduled: switch to monthly after {periodEndLabel}.
          </p>
        ) : null}
        {!status?.stripe_configured ? (
          <p className="km-muted">
            Billing is not fully configured on this environment yet (Stripe
            prices / keys). Subscribe buttons will return an error until ops
            finishes setup.
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
              Subscribe monthly
            </Button>
            <Button
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("annual")}
            >
              Subscribe annually
            </Button>
          </>
        ) : null}
        {canChange && interval !== "annual" ? (
          <Button
            variant="primary"
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("annual")}
          >
            Switch to annual
          </Button>
        ) : null}
        {canChange && interval !== "monthly" ? (
          <Button
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("monthly")}
          >
            Switch to monthly at period end
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
