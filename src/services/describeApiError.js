// Map API / transport failures to calm, UI-friendly copy for user-facing pages.
// Admin tooling should keep using raw messages.
//
// Returns null when the caller should paint nothing (session expiry, gated
// redirects). Otherwise { message, tone } where tone is "info" | "danger".

import { isAuthExpiredError } from "./authSession";

const NETWORK_RE = /load failed|failed to fetch|networkerror|network request failed/i;
const API_ERROR_RE = /^API error\s+(\d+)\s*:\s*(.*)$/is;
const REQUEST_FAILED_RE = /^Request failed\s*\((\d+)\)/i;

// Machine codes → user copy. Prefer short, actionable language.
const CODE_MESSAGES = {
  // Access / account
  unauthorized: "Please sign in again to continue.",
  access_blocked: "Kinin is invite-only right now. Email Jesse@kinin.ai if you need access.",
  onboarding_required: "Finish getting started, then you can continue.",
  account_close_failed: "We couldn't close the account. Please try again.",
  confirmation_mismatch: "Confirmation text didn't match. Please try again.",
  username_mismatch: "That username doesn't match this account.",
  username_and_password_required: "Username and password are required to continue.",

  // Biography / circle
  biography_access_denied: "You don't have access to this biography anymore.",
  biography_disabled_by_owner: "This biography is paused for now.",
  no_memories_available: "There aren't any shared memories to draw on yet.",
  biography_owner_user_id_required: "Please choose a biography first.",
  message_required: "Please enter a message.",
  invite_limit_reached: "You've reached the limit of pending invitations.",
  not_in_circle: "That person isn't in your family circle.",
  circle_lookup_failed: "We couldn't load your family circle. Please try again.",
  circle_check_failed: "We couldn't check your family circle. Please try again.",

  // Journal
  entry_not_found: "That journal entry isn't available anymore.",
  empty_entry: "Write a little something before continuing.",
  title_too_long: "That title is too long. Please shorten it.",
  body_too_long: "That entry is too long. Please shorten it.",
  invalid_status: "That status isn't valid.",
  invalid_mode: "That review option isn't available.",
  too_long_for_review: "That entry is a bit long for review. Shorten it and try again.",
  too_many_photos: "You've attached the maximum number of photos for this entry.",
  unsupported_media_type: "Use a JPEG, PNG, or WebP image.",
  photo_too_large: "That photo is too large. Try a smaller image.",
  photo_not_found: "That photo isn't available anymore.",
  missing_photo_id: "That photo couldn't be confirmed. Please try again.",
  photo_already_confirmed: "That photo is already attached.",
  upload_not_found: "We couldn't find that upload. Please try again.",
  empty_upload: "That upload looks empty. Please try again.",
  media_not_configured: "Photo uploads aren't available right now.",
  invalid_size: "That file size isn't valid.",
  llm_error: "Kinin had trouble finishing that. Please try again in a moment.",

  // Pins
  pin_not_found: "That pin isn't available anymore.",
  text_too_long: "That text is too long. Please shorten it.",

  // Session / journey
  conflict_user_state_changed: "Something changed while you were away. Please try again.",
  user_state_too_large: "Your story data is too large to save that change. Please try a smaller edit.",
  topic_switch_blocked: "You can't switch topics right now. Please try again shortly.",
  turn_in_progress: "Still finishing your last reply. Please wait a moment.",
  request_in_progress: "Still working on your last request. Please wait a moment.",

  // Stewardship
  account_steward_required: "Name and invite an Account Steward in My Account first.",
  account_steward_unconfirmed: "Your Account Steward needs to confirm their invitation before you can hand off.",
  stewardship_not_found: "That Stewardship role isn't available.",
  handoff_not_pending: "There isn't a handoff waiting to accept.",
  already_stewarded: "Stewardship is already active for this biography.",
  attestation_required: "Please write a short attestation before submitting.",
  invalid_claim_reason: "Please choose a valid reason for the Stewardship request.",
  invalid_billing_plan: "Please choose Legacy Stewardship or Dormant Archive.",
  role_not_active: "Stewardship isn't active for this biography yet.",
  cannot_decline_active: "You can't decline after Stewardship is already active. Resign instead.",
  cannot_remove_active_steward: "An active Account Steward can't be removed this way.",

  // Contact / misc
  email_required: "Please enter an email address.",
  invalid_email: "Please enter a valid email address.",
  message_too_long: "That message is too long. Please shorten it.",
  rate_limited: "Please wait a moment and try again.",
  empty_message: "Please enter a message.",
  invalid_body: "Please check what you entered and try again.",
  unknown_keys: "Please check what you entered and try again.",
  invalid_value: "Please check what you entered and try again.",

  // Help / chat
  help_api_base_missing: "Help isn't available right now.",
  biography_llm_failed: "Kinin had trouble answering. Please try again in a moment.",
};

const GENERIC_400 =
  "Please check what you entered and try again.";
const GENERIC_NETWORK =
  "We couldn't reach Kinin. Check your connection and try again.";
const GENERIC_5XX =
  "Something went wrong on our side. Please try again in a moment.";

function parsePayload(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;
  try {
    const outer = JSON.parse(text);
    if (outer && typeof outer.body === "string") {
      try {
        return JSON.parse(outer.body);
      } catch {
        return outer;
      }
    }
    return outer;
  } catch {
    return null;
  }
}

function extractFromError(err) {
  if (!err) return { status: null, code: "", payload: null, raw: "" };

  if (typeof err === "string") {
    return extractFromMessage(err);
  }

  const status = Number(err.status || err.statusCode || 0) || null;
  const payload = err.payload || err.body || null;
  if (payload && typeof payload === "object") {
    return {
      status: status || Number(payload.status) || null,
      code: String(payload.error || "").trim(),
      payload,
      raw: err.message || String(err),
    };
  }

  return extractFromMessage(err.message || String(err), status);
}

function extractFromMessage(message, statusHint = null) {
  const raw = String(message || "");
  const apiMatch = raw.match(API_ERROR_RE);
  if (apiMatch) {
    const status = Number(apiMatch[1]) || statusHint;
    const payload = parsePayload(apiMatch[2]);
    return {
      status,
      code: String(payload?.error || "").trim(),
      payload,
      raw,
    };
  }
  const reqMatch = raw.match(REQUEST_FAILED_RE);
  if (reqMatch) {
    return {
      status: Number(reqMatch[1]) || statusHint,
      code: "",
      payload: null,
      raw,
    };
  }
  // Bare machine codes sometimes thrown as Error("onboarding_required")
  if (/^[a-z][a-z0-9_]{2,64}$/.test(raw.trim())) {
    return { status: statusHint, code: raw.trim(), payload: null, raw };
  }
  return { status: statusHint, code: "", payload: null, raw };
}

function requestIdRef(payload) {
  const id = String(payload?.request_id || "").trim();
  if (!id) return "";
  const tail = id.length <= 8 ? id : id.slice(-8);
  return ` Reference: ${tail}.`;
}

/**
 * @param {unknown} err
 * @param {{ context?: string }} [opts]
 * @returns {{ message: string, tone: "info" | "danger" } | null}
 */
export function describeApiError(err, opts = {}) {
  if (!err) return null;
  if (isAuthExpiredError(err)) return null;
  if (err?.name === "AccessBlockedError" || err?.name === "OnboardingRequiredError") {
    return null;
  }

  const context = String(opts.context || "").trim();
  const { status, code, payload, raw } = extractFromError(err);

  if (NETWORK_RE.test(raw)) {
    const message = context ? `${context}. ${GENERIC_NETWORK}` : GENERIC_NETWORK;
    return { message, tone: "danger" };
  }

  // Soft / expected product states
  if (
    code === "biography_disabled_by_owner" ||
    code === "no_memories_available" ||
    code === "onboarding_required"
  ) {
    return { message: CODE_MESSAGES[code], tone: "info" };
  }

  if (code && CODE_MESSAGES[code]) {
    let message = CODE_MESSAGES[code];
    if (status >= 500) message += requestIdRef(payload);
    return { message, tone: "danger" };
  }

  if (status === 401) {
    return { message: CODE_MESSAGES.unauthorized, tone: "danger" };
  }

  if (status === 429) {
    return { message: CODE_MESSAGES.rate_limited, tone: "info" };
  }

  if (status && status >= 500) {
    const message =
      (context ? `${context}. ${GENERIC_5XX}` : GENERIC_5XX) + requestIdRef(payload);
    return { message, tone: "danger" };
  }

  if (status && status >= 400 && status < 500) {
    const message = context ? `${context}. ${GENERIC_400}` : GENERIC_400;
    return { message, tone: "danger" };
  }

  // Unknown / unparsed — never show raw JSON to users
  if (/^\s*\{[\s\S]*\}\s*$/.test(raw) || /API error\s+\d+/i.test(raw)) {
    const message =
      (context ? `${context}. ${GENERIC_5XX}` : GENERIC_5XX) + requestIdRef(payload);
    return { message, tone: "danger" };
  }

  // Plain local validation strings (already friendly) — keep them
  if (raw && !/API error|Request failed|traceback|Exception/i.test(raw)) {
    return { message: context ? `${context}. ${raw}` : raw, tone: "danger" };
  }

  const message = context ? `${context}. ${GENERIC_5XX}` : GENERIC_5XX;
  return { message, tone: "danger" };
}

/** String form for setError(...) — empty when the error should be suppressed. */
export function describeApiErrorMessage(err, opts = {}) {
  return describeApiError(err, opts)?.message || "";
}
