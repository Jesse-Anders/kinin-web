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
        ? `Shared — ends ${when}`
        : "Shared — ending at period end";
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
      await postStewardBilling({
        ownerUserId: bio.owner_user_id,
        billingPlan: "keep_interactive",
        interval: iv,
        notice: `Opening Checkout to share ${name}…`,
      });
    } catch (e) {
      setBillingError(e?.message || "Could not start stewardship checkout");
      setBillingBusy(false);
    }
  }

  async function archiveStewardBio(bio) {
    const name = bio.display_name || "this biography";
    const paid = Boolean(bio?.is_paid);
    const ok = window.confirm(
      paid
        ? `Archive ${name}? Shared access continues until the end of the billing period, then chat pauses.`
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
          ? `Archive scheduled for ${name} at period end.`
          : `${name} is now Archived.`,
      });
    } catch (e) {
      setBillingError(e?.message || "Could not archive biography");
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
  const trialEndsAt = status?.trial_ends_at || "";
  const trialEndsLabel = formatIsoDate(trialEndsAt);
  const plan = String(effectivePlan || "").toLowerCase();
  const isBuild = plan === "active" && product !== "share_bio";
  const isShareBio = plan === "share_bio" || (plan === "active" && product === "share_bio");
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
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {stewardedBios.map((bio) => {
                    const archived = isArchiveBio(bio);
                    const interactive = !archived;
                    return (
                      <li
                        key={bio.owner_user_id || bio.display_name}
                        style={{
                          marginBottom: 16,
                          paddingBottom: 16,
                          borderBottom: "1px solid rgba(0,0,0,0.08)",
                        }}
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
                            <Button
                              disabled={busy || !status?.stripe_configured}
                              onClick={() => archiveStewardBio(bio)}
                            >
                              {bio?.is_paid && !bio?.cancel_at_period_end
                                ? "Archive at period end"
                                : "Archive"}
                            </Button>
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
