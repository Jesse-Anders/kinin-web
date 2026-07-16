// In-app alerts / gentle nudges surfaced by the top-right notification widget
// (see components/AlertsMenu.jsx). This is the client-owned catalog: each alert
// defines its own trigger predicate and copy. The backend only persists the
// per-user *state* the client can't recompute — whether an alert has been
// snoozed ("remind me later") or dismissed ("delete alert") — keyed by `id`.
//
// Design intent: friendly, never ominous. Alerts remind people about useful
// things they haven't set up yet, and are the vehicle for announcing new
// features later. Add a new alert by appending to ALERTS with an `isEligible`.

// How long "Remind me later" pushes an alert out before it can resurface.
export const ALERT_SNOOZE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(iso, nowMs) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (nowMs - t) / DAY_MS;
}

// The alert catalog. `isEligible(ctx)` decides whether the alert's underlying
// condition is currently true; snooze/dismiss state is applied separately in
// App.jsx. ctx = { nowMs, signupAt, hasExecutor }.
export const ALERTS = [
  {
    id: "trusted-contact",
    tone: "info",
    title: "Add a trusted contact",
    body:
      "Naming someone you trust means your Kinin story can reach the people who matter most down the road. It only takes a minute, and you can change or remove it anytime.",
    cta: { label: "Add a trusted contact", page: "account" },
    // Show ~2 weeks after signup if the user still has no trusted contact.
    isEligible(ctx) {
      if (ctx.hasExecutor) return false;
      const age = daysBetween(ctx.signupAt, ctx.nowMs);
      return age !== null && age >= 14;
    },
  },
];

// Resolve the alerts a user should currently see, applying persisted
// snooze/dismiss state. `alertsState` is the backend map:
//   { [id]: { status: "snoozed"|"dismissed", snoozed_until?: iso } }.
// Returns eligible, non-dismissed, non-actively-snoozed alerts in catalog order.
export function resolveActiveAlerts(ctx, alertsState) {
  const state = alertsState && typeof alertsState === "object" ? alertsState : {};
  const nowMs = ctx?.nowMs ?? Date.now();
  return ALERTS.filter((alert) => {
    if (!alert.isEligible(ctx)) return false;
    const st = state[alert.id];
    if (!st || typeof st !== "object") return true;
    if (st.status === "dismissed") return false;
    if (st.status === "snoozed") {
      const until = Date.parse(st.snoozed_until || "");
      // Still snoozed only while the snooze window hasn't elapsed.
      if (!Number.isNaN(until) && nowMs < until) return false;
    }
    return true;
  });
}
