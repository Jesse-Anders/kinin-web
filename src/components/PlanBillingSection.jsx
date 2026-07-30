import { useEffect, useState } from "react";
import { Banner, Button, Frame } from "../theme";
import { describeApiErrorMessage } from "../services/describeApiError";

const PRICE_INTERVIEWER_MONTHLY = "$11.99/month";
const PRICE_INTERVIEWER_ANNUAL = "$99/year";
const PRICE_SHARE_MONTHLY = "$4.99/month";
const PRICE_SHARE_ANNUAL = "$49/year";
const PRICE_PACK2_MONTHLY = "$4.99/month";
const PRICE_PACK2_ANNUAL = "$49/year";
const PRICE_PACK5_MONTHLY = "$9.99/month";
const PRICE_PACK5_ANNUAL = "$99/year";

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

function planLabel(raw, interval, trialEndsAt, product) {
  const p = String(raw || "").trim().toLowerCase();
  const iv = String(interval || "").trim().toLowerCase();
  const prod = String(product || "").trim().toLowerCase();
  if (p === "share_bio") {
    if (iv === "monthly") return `Share Biography · monthly (${PRICE_SHARE_MONTHLY})`;
    if (iv === "annual") return `Share Biography · annual (${PRICE_SHARE_ANNUAL})`;
    return "Share Biography";
  }
  if (p === "active") {
    if (prod === "share_bio") {
      if (iv === "monthly") return `Share Biography · monthly (${PRICE_SHARE_MONTHLY})`;
      if (iv === "annual") return `Share Biography · annual (${PRICE_SHARE_ANNUAL})`;
      return "Share Biography";
    }
    if (iv === "monthly") return `Interviewer · monthly (${PRICE_INTERVIEWER_MONTHLY})`;
    if (iv === "annual") return `Interviewer · annual (${PRICE_INTERVIEWER_ANNUAL})`;
    return "Interviewer (paid)";
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

function packLabel(pack, interval) {
  const p = String(pack || "none").trim().toLowerCase();
  const iv = String(interval || "").trim().toLowerCase();
  if (p === "pack_2") {
    return iv === "annual"
      ? `Legacy Pack — 2 seats · annual (${PRICE_PACK2_ANNUAL})`
      : `Legacy Pack — 2 seats · monthly (${PRICE_PACK2_MONTHLY})`;
  }
  if (p === "pack_5") {
    return iv === "annual"
      ? `Legacy Pack — 5 seats · annual (${PRICE_PACK5_ANNUAL})`
      : `Legacy Pack — 5 seats · monthly (${PRICE_PACK5_MONTHLY})`;
  }
  return "No Legacy Pack";
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
 * Interviewer / Share Biography / Legacy Pack subscribe controls.
 * Lives on My Account (Phase 2.6); return URLs use /account.
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
          const plan = String(status?.plan_state || "").toLowerCase();
          const pack = String(status?.steward_pack || "none").toLowerCase();
          if (
            plan === "active" ||
            plan === "share_bio" ||
            plan === "beta_invited" ||
            pack === "pack_2" ||
            pack === "pack_5"
          ) {
            break;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
        const plan = String(status?.plan_state || "").toLowerCase();
        if (plan === "active") {
          setBillingNotice("You're subscribed. Interviewer access is active.");
        } else if (plan === "share_bio") {
          setBillingNotice("Share Biography is active.");
        } else if (status?.steward_pack && status.steward_pack !== "none") {
          setBillingNotice("Legacy Pack is active. Seat capacity updated.");
        } else if (plan === "beta_invited") {
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
          "You already have an active subscription in that category. Use Switch plan or Manage billing instead of starting a new checkout."
        );
        await refreshBillingStatus().catch(() => null);
        setBillingBusy(false);
        return;
      }
      if (parsed?.error === "owner_plan_xor_conflict") {
        setBillingNotice(
          "Interviewer and Share Biography can't both be active. Switch plans below, or cancel the current owner plan in Manage billing first."
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
        const msg =
          describeApiErrorMessage(parsed) ||
          parsed?.error ||
          (res.status >= 500
            ? "Could not change plan right now. Try again in a moment, or use Manage billing."
            : `HTTP ${res.status}`);
        throw new Error(msg);
      }
      if (parsed?.action === "upgraded" || parsed?.action === "changed") {
        setBillingNotice("Plan updated. Stripe prorates so you aren't double-billed.");
      } else if (parsed?.action === "scheduled_downgrade") {
        const when = formatPeriodEnd(parsed?.period_end);
        setBillingNotice(
          when
            ? `Current term continues until ${when}, then the new interval begins.`
            : "Current term completes first, then the new interval begins."
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
  const product = status?.product || "";
  const canCheckoutOwner = Boolean(status?.can_checkout_owner ?? status?.can_checkout);
  const canCheckoutPack = Boolean(status?.can_checkout_pack);
  const canChange = Boolean(status?.can_change_plan);
  const canChangePack = Boolean(status?.can_change_pack);
  const busy = billingBusy || disabled;
  const periodEndLabel = formatPeriodEnd(status?.current_period_end);
  const cancelAtPeriodEnd = Boolean(status?.cancel_at_period_end);
  const trialEndsAt = status?.trial_ends_at || "";
  const trialEndsLabel = formatIsoDate(trialEndsAt);
  const plan = String(effectivePlan || "").toLowerCase();
  const isInterviewer = plan === "active" && product !== "share_bio";
  const isShareBio = plan === "share_bio" || (plan === "active" && product === "share_bio");
  const seatCap = Number(status?.steward_seat_cap || 0);
  const seatsUsed = Number(status?.steward_seats_used || 0);
  const freeSeat = Number(status?.steward_free_seat || 0);
  const packSeats = Number(status?.steward_pack_seats || 0);
  const stewardPack = status?.steward_pack || "none";
  const packInterval = status?.steward_pack_interval || "";

  return (
    <Frame label="Plan & billing">
      <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
        <p>
          Choose an <strong>owner plan</strong> (Interviewer or Share Biography — not
          both) and optionally a <strong>Legacy Pack</strong> for interactive seats on
          sealed biographies you steward. Interviewer includes one free Legacy seat
          while active.
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
          <strong>Owner plan:</strong>{" "}
          {planLabel(effectivePlan, interval, trialEndsAt, product)}
        </p>
        <p>
          <strong>Legacy capacity:</strong> {seatsUsed} / {seatCap} seats used
          {freeSeat || packSeats ? (
            <>
              {" "}
              <span className="km-muted">
                ({freeSeat ? `${freeSeat} free from Interviewer` : "no free seat"}
                {packSeats ? ` + ${packSeats} from pack` : ""})
              </span>
            </>
          ) : (
            <span className="km-muted"> — subscribe Interviewer or a Legacy Pack to unlock seats</span>
          )}
        </p>
        <p>
          <strong>Legacy Pack:</strong> {packLabel(stewardPack, packInterval)}
        </p>
        {plan === "trialing" && trialEndsLabel ? (
          <p className="km-muted">
            Full trial ends on <strong>{trialEndsLabel}</strong>. After that you
            keep free listener access; subscribe here to continue interviewing.
          </p>
        ) : null}
        {cancelAtPeriodEnd && periodEndLabel ? (
          <p className="km-muted">Access continues through {periodEndLabel}, then free listener.</p>
        ) : null}
        {!status?.stripe_configured ? (
          <p className="km-muted">
            Billing is not fully configured on this environment yet. Subscribe
            buttons will return an error until setup finishes.
          </p>
        ) : null}
      </div>

      <div className="km-prose" style={{ maxWidth: 560, marginBottom: 10 }}>
        <p>
          <strong>Owner plans</strong>
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
              Interviewer monthly · {PRICE_INTERVIEWER_MONTHLY}
            </Button>
            <Button
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("annual", "interviewer")}
            >
              Interviewer annual · {PRICE_INTERVIEWER_ANNUAL}
            </Button>
            <Button
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("monthly", "share_bio")}
            >
              Share Biography monthly · {PRICE_SHARE_MONTHLY}
            </Button>
            <Button
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("annual", "share_bio")}
            >
              Share Biography annual · {PRICE_SHARE_ANNUAL}
            </Button>
          </>
        ) : null}
        {canChange && isInterviewer && interval !== "annual" ? (
          <Button
            variant="primary"
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("annual", "interviewer")}
          >
            Switch Interviewer to annual · {PRICE_INTERVIEWER_ANNUAL}
          </Button>
        ) : null}
        {canChange && isInterviewer && interval !== "monthly" ? (
          <Button
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("monthly", "interviewer")}
          >
            Switch Interviewer to monthly at period end · {PRICE_INTERVIEWER_MONTHLY}
          </Button>
        ) : null}
        {canChange && isInterviewer ? (
          <Button
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan(interval || "monthly", "share_bio")}
          >
            Switch to Share Biography
          </Button>
        ) : null}
        {canChange && isShareBio ? (
          <Button
            variant="primary"
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan(interval || "monthly", "interviewer")}
          >
            Switch to Interviewer
          </Button>
        ) : null}
        {canChange && isShareBio && interval !== "annual" ? (
          <Button
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("annual", "share_bio")}
          >
            Switch Share Biography to annual · {PRICE_SHARE_ANNUAL}
          </Button>
        ) : null}
        {canChange && isShareBio && interval !== "monthly" ? (
          <Button
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("monthly", "share_bio")}
          >
            Switch Share Biography to monthly at period end · {PRICE_SHARE_MONTHLY}
          </Button>
        ) : null}
      </div>

      <div className="km-prose" style={{ maxWidth: 560, marginBottom: 10 }}>
        <p>
          <strong>Legacy Packs</strong> — stack on Interviewer&apos;s free seat
        </p>
      </div>
      <div
        className="km-form-actions"
        style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}
      >
        {canCheckoutPack ? (
          <>
            <Button
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("monthly", "steward_pack_2")}
            >
              Pack 2 monthly · {PRICE_PACK2_MONTHLY}
            </Button>
            <Button
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("annual", "steward_pack_2")}
            >
              Pack 2 annual · {PRICE_PACK2_ANNUAL}
            </Button>
            <Button
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("monthly", "steward_pack_5")}
            >
              Pack 5 monthly · {PRICE_PACK5_MONTHLY}
            </Button>
            <Button
              disabled={busy || !status?.stripe_configured}
              onClick={() => openCheckout("annual", "steward_pack_5")}
            >
              Pack 5 annual · {PRICE_PACK5_ANNUAL}
            </Button>
          </>
        ) : null}
        {canChangePack && stewardPack === "pack_2" ? (
          <Button
            variant="primary"
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan(packInterval || "monthly", "steward_pack_5")}
          >
            Upgrade to Pack 5
          </Button>
        ) : null}
        {canChangePack && stewardPack === "pack_5" ? (
          <Button
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan(packInterval || "monthly", "steward_pack_2")}
          >
            Switch to Pack 2
          </Button>
        ) : null}
        <Button disabled={busy || !status?.has_customer} onClick={() => openPortal()}>
          Manage billing
        </Button>
      </div>
    </Frame>
  );
}
