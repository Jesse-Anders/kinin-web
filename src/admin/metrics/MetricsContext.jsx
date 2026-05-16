import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Persistent admin metrics preferences live in localStorage under a single
// JSON blob so we don't pollute the key namespace.
const STORAGE_KEY = "kinin.adminMetrics.v1";

const DEFAULT_PRESET = "last_30_days";

const MetricsContext = createContext(null);

function todayUtcDay() {
  return new Date().toISOString().slice(0, 10);
}

function shiftUtcDay(dayStr, days) {
  const dt = new Date(`${dayStr}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function firstOfMonthUtc(dayStr) {
  return `${dayStr.slice(0, 7)}-01`;
}

function firstOfQuarterUtc(dayStr) {
  const year = Number(dayStr.slice(0, 4));
  const month = Number(dayStr.slice(5, 7));
  const qStartMonth = ((Math.ceil(month / 3) - 1) * 3) + 1;
  return `${year}-${String(qStartMonth).padStart(2, "0")}-01`;
}

function firstOfYearUtc(dayStr) {
  return `${dayStr.slice(0, 4)}-01-01`;
}

// Resolve a preset key to a concrete [start, end] inclusive day range. The
// "end" of every preset is "today UTC" so cards refresh as the day advances.
export function resolvePreset(preset, customStart, customEnd) {
  const end = todayUtcDay();
  switch (preset) {
    case "last_7_days":
      return { start: shiftUtcDay(end, -6), end };
    case "last_30_days":
      return { start: shiftUtcDay(end, -29), end };
    case "last_90_days":
      return { start: shiftUtcDay(end, -89), end };
    case "mtd":
      return { start: firstOfMonthUtc(end), end };
    case "qtd":
      return { start: firstOfQuarterUtc(end), end };
    case "ytd":
      return { start: firstOfYearUtc(end), end };
    case "custom":
      return {
        start: customStart || shiftUtcDay(end, -29),
        end: customEnd || end,
      };
    default:
      return { start: shiftUtcDay(end, -29), end };
  }
}

// Compute the immediately-prior period of the same length, used for
// "vs. previous period" deltas everywhere.
export function priorPeriod(start, end) {
  if (!start || !end) return { start: "", end: "" };
  const startDt = new Date(`${start}T00:00:00.000Z`);
  const endDt = new Date(`${end}T00:00:00.000Z`);
  const days = Math.round((endDt - startDt) / (1000 * 60 * 60 * 24)) + 1;
  return {
    start: shiftUtcDay(start, -days),
    end: shiftUtcDay(start, -1),
  };
}

function loadPersisted() {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist(state) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function MetricsProvider({ children }) {
  const [state, setState] = useState(() => {
    const fromStorage = loadPersisted();
    return {
      preset: fromStorage.preset || DEFAULT_PRESET,
      customStart: fromStorage.customStart || "",
      customEnd: fromStorage.customEnd || "",
      demoMode: Boolean(fromStorage.demoMode),
      revealEmails: Boolean(fromStorage.revealEmails),
      aliasSalt: fromStorage.aliasSalt || randomSalt(),
      budgetUsdMonthly: numberOr(fromStorage.budgetUsdMonthly, 0),
    };
  });

  useEffect(() => {
    persist(state);
  }, [state]);

  const setPreset = useCallback((preset) => {
    setState((s) => ({ ...s, preset }));
  }, []);
  const setCustomRange = useCallback((customStart, customEnd) => {
    setState((s) => ({ ...s, preset: "custom", customStart, customEnd }));
  }, []);
  const setDemoMode = useCallback((demoMode) => {
    setState((s) => ({ ...s, demoMode: Boolean(demoMode) }));
  }, []);
  const setRevealEmails = useCallback((revealEmails) => {
    setState((s) => ({ ...s, revealEmails: Boolean(revealEmails) }));
  }, []);
  const setBudget = useCallback((amount) => {
    setState((s) => ({ ...s, budgetUsdMonthly: numberOr(amount, 0) }));
  }, []);

  const range = useMemo(
    () => resolvePreset(state.preset, state.customStart, state.customEnd),
    [state.preset, state.customStart, state.customEnd],
  );
  const prior = useMemo(() => priorPeriod(range.start, range.end), [range]);

  const value = useMemo(
    () => ({
      preset: state.preset,
      customStart: state.customStart,
      customEnd: state.customEnd,
      demoMode: state.demoMode,
      revealEmails: state.revealEmails,
      aliasSalt: state.aliasSalt,
      budgetUsdMonthly: state.budgetUsdMonthly,
      range,
      prior,
      setPreset,
      setCustomRange,
      setDemoMode,
      setRevealEmails,
      setBudget,
    }),
    [state, range, prior, setPreset, setCustomRange, setDemoMode, setRevealEmails, setBudget],
  );

  return <MetricsContext.Provider value={value}>{children}</MetricsContext.Provider>;
}

export function useMetrics() {
  const ctx = useContext(MetricsContext);
  if (!ctx) {
    throw new Error("useMetrics() must be inside <MetricsProvider>");
  }
  return ctx;
}

function numberOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function randomSalt() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2, 12);
}
