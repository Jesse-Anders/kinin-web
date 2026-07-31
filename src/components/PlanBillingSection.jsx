import { useEffect, useState } from "react";
import { Banner, Button, Frame } from "../theme";
import { describeApiErrorMessage } from "../services/describeApiError";

const PRICE_BUILD_MONTHLY = "$11.99/month";
const PRICE_BUILD_ANNUAL = "$99/year";
const PRICE_SHARE_MONTHLY = "$4.99/month";
const PRICE_SHARE_ANNUAL = "$49/year";
const PRICE_KEEP_MONTHLY = "$4.99/month";
const PRICE_KEEP_ANNUAL = "$49/year";

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
        ? `Keep interactive — ends ${when}`
        : "Keep interactive — ending at period end";
    }
    if (bio?.is_free_seat) return "Keep interactive (included with Build Biography)";
    if (bio?.is_paid) {
      const iv = String(bio.interval || "").toLowerCase();
      if (iv === "annual") return `Keep interactive · annual (${PRICE_KEEP_ANNUAL})`;
      return `Keep interactive · monthly (${PRICE_KEEP_MONTHLY})`;
    }
    return "Keep interactive";
  }
  return "Archive";
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
      } else if (parsed?.action === "scheduled_downgrade") {
        const when = formatPeriodEnd(parsed?.period_end);
        setBillingNotice(
          when
            ? `Current term continues until ${when}, then the new interval begins.`
            : "Current term completes first, then the new interval begins."
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
  const canChange = Boolean(status?.can_change_plan);
  const busy = billingBusy || disabled;
  const periodEndLabel = formatPeriodEnd(status?.current_period_end);
  const cancelAtPeriodEnd = Boolean(status?.cancel_at_period_end);
  const trialEndsAt = status?.trial_ends_at || "";
  const trialEndsLabel = formatIsoDate(trialEndsAt);
  const plan = String(effectivePlan || "").toLowerCase();
  const isBuild = plan === "active" && product !== "share_bio";
  const isShareBio = plan === "share_bio" || (plan === "active" && product === "share_bio");
  const stewardedBios = Array.isArray(status?.stewarded_bios) ? status.stewarded_bios : [];

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
        <p>
          <strong>Current plan:</strong> {planLabel(effectivePlan, interval, trialEndsAt, product)}
        </p>
        {plan === "trialing" && trialEndsLabel ? (
          <p className="km-muted">
            Full trial ends on <strong>{trialEndsLabel}</strong>.
          </p>
        ) : null}
        {cancelAtPeriodEnd && periodEndLabel ? (
          <p className="km-muted">Access continues through {periodEndLabel}, then free listener.</p>
        ) : null}
        {!status?.stripe_configured ? (
          <p className="km-muted">Billing is not fully configured on this environment yet.</p>
        ) : null}
      </div>

      <div className="km-prose" style={{ maxWidth: 560, marginBottom: 10 }}>
        <p style={{ margin: 0 }}>
          <strong>Subscription — Build Biography</strong>
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
        {canChange && isBuild && interval !== "annual" ? (
          <Button
            variant="primary"
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("annual", "interviewer")}
          >
            Switch to annual · {PRICE_BUILD_ANNUAL}
          </Button>
        ) : null}
        {canChange && isBuild && interval !== "monthly" ? (
          <Button
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan("monthly", "interviewer")}
          >
            Switch to monthly at period end · {PRICE_BUILD_MONTHLY}
          </Button>
        ) : null}
        {canChange && isShareBio ? (
          <Button
            variant="primary"
            disabled={busy || !status?.stripe_configured}
            onClick={() => changePlan(interval || "monthly", "interviewer")}
          >
            Switch to Build Biography
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
          <div className="km-prose" style={{ marginTop: 16, paddingLeft: 4 }}>
            <div style={{ marginBottom: 22 }}>
              <p style={{ margin: "0 0 6px" }}>
                <strong>Share My Biography</strong>
              </p>
              <p className="km-muted" style={{ margin: "0 0 12px" }}>
                Already included with a Build Biography plan. Choose this alone if you only want
                family to interact with your biography — without interviewing or journaling.
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
                {canChange && isBuild ? (
                  <Button
                    disabled={busy || !status?.stripe_configured}
                    onClick={() => changePlan(interval || "monthly", "share_bio")}
                  >
                    Switch to Share My Biography
                  </Button>
                ) : null}
                {canChange && isShareBio && interval !== "annual" ? (
                  <Button
                    disabled={busy || !status?.stripe_configured}
                    onClick={() => changePlan("annual", "share_bio")}
                  >
                    Switch to annual · {PRICE_SHARE_ANNUAL}
                  </Button>
                ) : null}
                {canChange && isShareBio && interval !== "monthly" ? (
                  <Button
                    disabled={busy || !status?.stripe_configured}
                    onClick={() => changePlan("monthly", "share_bio")}
                  >
                    Switch to monthly at period end · {PRICE_SHARE_MONTHLY}
                  </Button>
                ) : null}
              </div>
            </div>

            <div>
              <p style={{ margin: "0 0 6px" }}>
                <strong>Share Stewarded Biographies</strong>
              </p>
              <p className="km-muted" style={{ margin: "0 0 12px" }}>
                The first shared stewarded biography is free with a Build Biography plan.
                Additional biographies are {PRICE_KEEP_MONTHLY} or {PRICE_KEEP_ANNUAL} each.
                Manage each biography under Settings → Stewardship.
              </p>
              {stewardedBios.length === 0 ? (
                <p className="km-muted" style={{ margin: 0 }}>
                  You aren&apos;t stewarding any sealed biographies yet.
                </p>
              ) : (
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {stewardedBios.map((bio) => (
                    <li key={bio.owner_user_id || bio.display_name} style={{ marginBottom: 8 }}>
                      <strong>{bio.display_name || "Biography"}</strong> — {bioPlanLabel(bio)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Frame>
  );
}
