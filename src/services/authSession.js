// Central session-expiry handling.
//
// When Cognito tokens die (idle refresh failure, missing token, or API 401)
// while the UI still thinks the user is signed in, call reportAuthFailure()
// once. App registers a handler that clears local auth and shows a calm
// re-sign-in banner; callers throw AuthExpiredError so catch blocks can skip
// the usual red "API error …" banners.

export class AuthExpiredError extends Error {
  constructor() {
    super("session_expired");
    this.name = "AuthExpiredError";
  }
}

export function isAuthExpiredError(e) {
  return !!e && e.name === "AuthExpiredError";
}

let authFailureHandler = null;
let handlingAuthFailure = false;

/** App calls this once on mount to own the recovery UX. */
export function registerAuthFailureHandler(fn) {
  authFailureHandler = typeof fn === "function" ? fn : null;
}

/**
 * Run the registered recovery handler (idempotent under concurrency), then
 * always throw AuthExpiredError so callers can bail without painting a red error.
 */
export async function reportAuthFailure() {
  if (!handlingAuthFailure) {
    handlingAuthFailure = true;
    try {
      if (authFailureHandler) await authFailureHandler();
    } catch {
      // Recovery itself is best-effort; still surface AuthExpiredError below.
    } finally {
      // Allow a later expiry (after the user signs back in) to recover again.
      queueMicrotask(() => {
        handlingAuthFailure = false;
      });
    }
  }
  throw new AuthExpiredError();
}

/** If the response is 401, recover the session and throw AuthExpiredError. */
export async function throwIfUnauthorized(res) {
  if (res && res.status === 401) {
    await reportAuthFailure();
  }
}
