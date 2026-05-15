import { defaultTokens, mergeTokens, tokensToCssVars } from "./tokens";

const STORAGE_KEY = "kinin_theme_overrides";
const URL_PARAM = "theme";

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function readOverrides() {
  if (typeof window === "undefined") return null;

  // URL param wins so preview links work without persisting.
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get(URL_PARAM);
    if (encoded) {
      const decoded = atob(encoded);
      const parsed = safeJsonParse(decoded);
      if (parsed) return parsed;
    }
  } catch {
    // ignore — fall back to localStorage
  }

  return safeJsonParse(window.localStorage.getItem(STORAGE_KEY));
}

export function writeOverrides(overrides) {
  if (typeof window === "undefined") return;
  if (!overrides || Object.keys(overrides).length === 0) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  }
}

export function clearOverrides() {
  writeOverrides(null);
}

export function resolveTokens(overrides) {
  return mergeTokens(defaultTokens, overrides || readOverrides() || {});
}

// Write every token to a CSS variable on :root, so any element can reference
// var(--cream), var(--font-display), etc.
export function applyTheme(overrides) {
  if (typeof document === "undefined") return defaultTokens;
  const resolved = resolveTokens(overrides);
  const vars = tokensToCssVars(resolved);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  return resolved;
}

export function encodeOverridesToUrl(overrides) {
  if (!overrides) return "";
  try {
    return btoa(JSON.stringify(overrides));
  } catch {
    return "";
  }
}
