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
// App.jsx. ctx = { nowMs, signupAt, hasExecutor, pendingStoryRequests,
// fulfilledStoryRequests }.
//
// An alert may also define `resurfaceValue(ctx)` returning a number (e.g. a
// count of pending items). When present, a snoozed/dismissed alert reappears if
// that value climbs above the baseline recorded when it was silenced — so
// acknowledging today's items doesn't mute tomorrow's. `bodyFor(ctx)` lets an
// alert render dynamic copy.
export const ALERTS = [
  {
    id: "trusted-contact",
    tone: "info",
    title: "Add an Account Steward",
    body:
      "Name someone who can look after your Kinin biography if you can no longer maintain it. Confirming the invite does not give them access yet — Stewardship activates only when needed.",
    cta: { label: "Add an Account Steward", page: "account" },
    // Show ~2 weeks after signup if the user still has no Account Steward.
    isEligible(ctx) {
      if (ctx.hasExecutor) return false;
      const age = daysBetween(ctx.signupAt, ctx.nowMs);
      return age !== null && age >= 14;
    },
  },
  {
    id: "story-request",
    tone: "info",
    title: "A family member would love a story",
    body:
      "Someone in your Family Circle asked you to share a memory. Open your Pins to see what they'd love to hear.",
    cta: { label: "See what they'd love to hear", page: "pins" },
    isEligible(ctx) {
      return (ctx.pendingStoryRequests || 0) > 0;
    },
    resurfaceValue(ctx) {
      return ctx.pendingStoryRequests || 0;
    },
    bodyFor(ctx) {
      const n = ctx.pendingStoryRequests || 0;
      if (n === 1) {
        return "Someone in your Family Circle asked you to share a memory. Open your Pins to see what they'd love to hear.";
      }
      return `${n} people in your Family Circle asked you to share a memory. Open your Pins to see what they'd love to hear.`;
    },
  },
  {
    id: "story-fulfilled",
    tone: "info",
    title: "A memory you asked for was shared",
    body:
      "Someone in your Family Circle shared a memory you asked about. Open Family Circle to see.",
    cta: { label: "See what they shared", page: "family-circle" },
    isEligible(ctx) {
      return (ctx.fulfilledStoryRequests || 0) > 0;
    },
    resurfaceValue(ctx) {
      return ctx.fulfilledStoryRequests || 0;
    },
    bodyFor(ctx) {
      const n = ctx.fulfilledStoryRequests || 0;
      if (n === 1) {
        return "Someone in your Family Circle shared a memory you asked about. Open Family Circle to see.";
      }
      return `${n} memories you asked about have been shared. Open Family Circle to see.`;
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
  const resolved = [];
  for (const alert of ALERTS) {
    if (!alert.isEligible(ctx)) continue;
    const resurfaceValue =
      typeof alert.resurfaceValue === "function" ? alert.resurfaceValue(ctx) : null;
    const st = state[alert.id];
    if (st && typeof st === "object") {
      // A higher current value than the silenced baseline means new activity —
      // let the alert resurface even if it was dismissed/snoozed.
      const baseline = typeof st.count === "number" ? st.count : null;
      const hasNewActivity =
        resurfaceValue !== null && baseline !== null && resurfaceValue > baseline;
      if (st.status === "dismissed" && !hasNewActivity) continue;
      if (st.status === "snoozed") {
        const until = Date.parse(st.snoozed_until || "");
        const stillSnoozed = !Number.isNaN(until) && nowMs < until;
        if (stillSnoozed && !hasNewActivity) continue;
      }
    }
    // Return a shallow copy so callers can read dynamic body/resurfaceValue
    // without mutating the catalog entry.
    resolved.push({
      ...alert,
      body: typeof alert.bodyFor === "function" ? alert.bodyFor(ctx) : alert.body,
      resurfaceValue,
    });
  }
  return resolved;
}
