import { useEffect, useMemo, useRef, useState } from "react";
import {
  Home as HomeIcon,
  CircleUserRound,
  Footprints,
  Grid2X2Check,
  Megaphone,
  Menu,
  CirclePlus,
} from "lucide-react";
import {
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from "aws-amplify/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const RELEASE_CHANNEL = (import.meta.env.VITE_RELEASE_CHANNEL || "dev").toLowerCase();
const IS_BETA_LITE = RELEASE_CHANNEL === "beta-lite";
const VERSION_LABEL = IS_BETA_LITE ? "Beta-lite Version 1.0" : "Dev Version 1.0";


export default function App() {
  const [user, setUser] = useState(null);
  const [sessionId, setSessionId] = useState(
    () => localStorage.getItem("session_id") || ""
  );
  const [journeyVersion, setJourneyVersion] = useState(
    () => localStorage.getItem("journey_version") || ""
  );
  const [userFocusLabels, setUserFocusLabels] = useState(() => {
    try {
      const raw = localStorage.getItem("user_focus_labels");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [mustAvoidTopics, setMustAvoidTopics] = useState(() => {
    try {
      const raw = localStorage.getItem("must_avoid_topics");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [handleLightlyTopics, setHandleLightlyTopics] = useState(() => {
    try {
      const raw = localStorage.getItem("handle_lightly_topics");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [uiState, setUiState] = useState(null);
  const [lastProgress, setLastProgress] = useState(null);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [didStart, setDidStart] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileSchema, setProfileSchema] = useState(null);
  const [bioProfile, setBioProfile] = useState({ preferred_name: "", age: "" });
  const [profileBusy, setProfileBusy] = useState(false);
  const [activePage, setActivePage] = useState("interview");
  const [adminUserId, setAdminUserId] = useState(
    () => localStorage.getItem("admin_user_id") || ""
  );
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminTokenClaims, setAdminTokenClaims] = useState(null);
  const [lookupUsername, setLookupUsername] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [turnsSessionId, setTurnsSessionId] = useState("");
  const [turnsItems, setTurnsItems] = useState([]);
  const [turnsBusy, setTurnsBusy] = useState(false);
  const [turnsError, setTurnsError] = useState("");
  const [turnsNextKey, setTurnsNextKey] = useState(null);
  const turnsListRef = useRef(null);
  const turnsAppendRef = useRef(false);
  const messageInputRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuOverflowOpen, setMenuOverflowOpen] = useState(false);
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const sidebarRef = useRef(null);
  const sidebarMeasureRef = useRef(null);
  const sidebarBottomRef = useRef(null);
  const [feedbackName, setFeedbackName] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [adminFeedbackItems, setAdminFeedbackItems] = useState([]);
  const [adminFeedbackNextKey, setAdminFeedbackNextKey] = useState(null);
  const [adminFeedbackBusy, setAdminFeedbackBusy] = useState(false);
  const [adminFeedbackError, setAdminFeedbackError] = useState("");
  const [feedbackRangeDays, setFeedbackRangeDays] = useState(7);
  const [feedbackUserFilter, setFeedbackUserFilter] = useState("");
  const [newFeedbackCount, setNewFeedbackCount] = useState(0);

  const isAuthed = useMemo(() => !!user, [user]);
  const adminStatusCounts = useMemo(() => {
    if (!adminOverview?.steps || !Array.isArray(adminOverview.steps)) return null;
    return adminOverview.steps.reduce((acc, step) => {
      const status = step?.status || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
  }, [adminOverview]);
  const turnsView = useMemo(() => {
    const roleOrder = { user: 0, assistant: 1 };
    return [...turnsItems].sort((a, b) => {
      const ta = a?.timestamp || "";
      const tb = b?.timestamp || "";
      if (ta && tb && ta !== tb) return ta.localeCompare(tb);
      const ra = roleOrder[a?.role] ?? 2;
      const rb = roleOrder[b?.role] ?? 2;
      if (ra !== rb) return ra - rb;
      const ska = a?.["ts#session_id#turn_id"] || "";
      const skb = b?.["ts#session_id#turn_id"] || "";
      return String(ska).localeCompare(String(skb));
    });
  }, [turnsItems]);
  const filteredFeedbackItems = useMemo(() => {
    const days = Number(feedbackRangeDays) || 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const userFilter = (feedbackUserFilter || "").trim();
    return (adminFeedbackItems || []).filter((item) => {
      const createdAt = item?.created_at ? Date.parse(item.created_at) : NaN;
      if (!Number.isNaN(createdAt) && createdAt < cutoff) return false;
      if (userFilter && item?.user_id !== userFilter) return false;
      return true;
    });
  }, [adminFeedbackItems, feedbackRangeDays, feedbackUserFilter]);
  const progressForDisplay = useMemo(() => {
    return (
      uiState?.progress ||
      lastProgress || {
        total_steps: 0,
        complete_steps: 0,
        closed_steps: 0,
        percent: 0,
      }
    );
  }, [uiState, lastProgress]);

  useEffect(() => {
    if (!turnsListRef.current) return;
    if (turnsAppendRef.current) return;
    turnsListRef.current.scrollTop = turnsListRef.current.scrollHeight;
  }, [turnsView.length]);
  useEffect(() => {
    if (!messageInputRef.current) return;
    if (message) return;
    messageInputRef.current.style.height = "auto";
  }, [message]);
  useEffect(() => {
    if (uiState?.progress && typeof uiState.progress.percent === "number") {
      setLastProgress(uiState.progress);
    }
  }, [uiState]);
  useEffect(() => {
    function recompute() {
      if (!sidebarRef.current || !sidebarMeasureRef.current || !sidebarBottomRef.current) {
        return;
      }
      const available = sidebarRef.current.clientHeight - 32;
      const topHeight = sidebarMeasureRef.current.scrollHeight;
      const bottomHeight = sidebarBottomRef.current.scrollHeight;
      setMenuCollapsed(topHeight + bottomHeight > available);
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [newFeedbackCount, isAuthed, user?.username]);
  useEffect(() => {
    if (!adminFeedbackItems.length) {
      setNewFeedbackCount(0);
      return;
    }
    const lastSeen = Number(localStorage.getItem("feedback_last_seen_ms") || "0");
    const newer = adminFeedbackItems.filter((item) => {
      const createdAt = item?.created_at ? Date.parse(item.created_at) : NaN;
      return !Number.isNaN(createdAt) && createdAt > lastSeen;
    });
    setNewFeedbackCount(newer.length);
  }, [adminFeedbackItems]);

  function decodeJwtPayload(token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      const json = atob(padded);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  async function getAccessToken() {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    if (!token) throw new Error("Missing accessToken. Are you logged in?");
    return token;
  }

  // Polling for async evaluator UI state (/turn/status).
  const statusPollRef = useRef({ runId: 0, timer: null, abort: null });

  function stopStatusPoll() {
    const cur = statusPollRef.current;
    cur.runId += 1;
    if (cur.timer) {
      clearTimeout(cur.timer);
      cur.timer = null;
    }
    if (cur.abort) {
      try {
        cur.abort.abort();
      } catch {
        // ignore
      }
      cur.abort = null;
    }
  }

  function startStatusPoll(nextSessionId, idToken) {
    if (!nextSessionId || !idToken) return;
    stopStatusPoll();
    const runId = statusPollRef.current.runId;
    const abort = new AbortController();
    statusPollRef.current.abort = abort;

    const tick = async () => {
      // Cancelled / superseded
      if (statusPollRef.current.runId !== runId) return;
      try {
        const url = `${API_BASE}/turn/status?session_id=${encodeURIComponent(
          nextSessionId
        )}`;
        const res = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
          signal: abort.signal,
        });
        if (statusPollRef.current.runId !== runId) return;
        if (res.ok) {
          const data = await res.json();
          const parsed =
            typeof data.body === "string" ? JSON.parse(data.body) : data;
          if (parsed?.ui_state) {
            setUiState(parsed.ui_state);
          }
          if (parsed && parsed.processing === false) {
            stopStatusPoll();
            return;
          }
        }
      } catch {
        // swallow and retry until max attempts (we rely on user actions/next turn if it never converges)
      }
      // Poll at 1000ms (low-frequency, low-cost).
      statusPollRef.current.timer = setTimeout(tick, 1000);
    };

    // Kick off immediately.
    statusPollRef.current.timer = setTimeout(tick, 0);
  }

  // Cleanup on unmount.
  useEffect(() => stopStatusPoll, []);

  useEffect(() => {
    (async () => {
      try {
        // Ensure Hosted UI redirect is processed and tokens are available
        const session = await fetchAuthSession();

        // If tokens exist, we are authenticated
        if (session?.tokens?.idToken) {
          const u = await getCurrentUser();
          setUser(u);

          // Clean up ?code=... in URL after login
          if (window.location.search.includes("code=")) {
            window.history.replaceState(
              {},
              document.title,
              window.location.pathname
            );
          }
          return;
        }

        setUser(null);
      } catch {
        setUser(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    if (busy) return;
    if (didStart) return;
    // Auto-start session on login to get intro + session_id without requiring a user message.
    startSession();
    setDidStart(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  async function onLogin() {
    setError("");
    try {
      await signInWithRedirect(); // Hosted UI
    } catch (e) {
      console.error("Login redirect failed:", e);
      setError(e?.message || JSON.stringify(e));
    }
  }

  async function onLogout() {
    setError("");
    await signOut({ global: true });
    stopStatusPoll();
    setUser(null);
    setChat([]);
  }

  async function startSession() {
    setError("");
    setBusy(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");

      const body = {
        session_id: sessionId || undefined,
        start: true,
      };

      const res = await fetch(`${API_BASE}/turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API error ${res.status}: ${t}`);
      }

      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;

      const newSessionId = parsed.session_id || sessionId;
      if (newSessionId && newSessionId !== sessionId) {
        setSessionId(newSessionId);
        localStorage.setItem("session_id", newSessionId);
      }
      if ((parsed.journey_version_display !== undefined && parsed.journey_version_display !== null) || (parsed.journey_version !== undefined && parsed.journey_version !== null)) {
        const v = String(parsed.journey_version_display ?? parsed.journey_version);
        setJourneyVersion(v);
        localStorage.setItem("journey_version", v);
      }
      if (Array.isArray(parsed.user_focus_labels)) {
        const labels = parsed.user_focus_labels
          .filter((x) => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean);
        setUserFocusLabels(labels);
        localStorage.setItem("user_focus_labels", JSON.stringify(labels));
      }
      if (Array.isArray(parsed.must_avoid_topics)) {
        const topics = parsed.must_avoid_topics
          .filter((x) => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean);
        setMustAvoidTopics(topics);
        localStorage.setItem("must_avoid_topics", JSON.stringify(topics));
      }
      if (Array.isArray(parsed.handle_lightly_topics)) {
        const topics = parsed.handle_lightly_topics
          .filter((x) => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean);
        setHandleLightlyTopics(topics);
        localStorage.setItem("handle_lightly_topics", JSON.stringify(topics));
      }

      if (parsed.assistant) {
        setChat([{ role: "assistant", content: parsed.assistant }]);
      }

      if (parsed.ui_state) {
        setUiState(parsed.ui_state);
      }

      // Async UI state refresh (no visible "updating" UI; just keep step fields accurate).
      startStatusPoll(newSessionId, idToken);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendTurn() {
    setError("");
    if (!message.trim()) return;

    setBusy(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");

      const clientRequestId =
        globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const body = {
        session_id: sessionId || undefined,
        message: message.trim(),
        client_request_id: clientRequestId,
      };

      const res = await fetch(`${API_BASE}/turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text();
        // Try to parse structured error bodies (Lambda proxy / API Gateway)
        let detail = t;
        try {
          const j = JSON.parse(t);
          if (j && typeof j === "object") {
            if (typeof j.body === "string") {
              try {
                const inner = JSON.parse(j.body);
                detail = JSON.stringify(inner);
              } catch {
                detail = j.body;
              }
            } else {
              detail = JSON.stringify(j);
            }
          }
        } catch {
          // keep raw text
        }
        throw new Error(`API error ${res.status}: ${detail}`);
      }

      const data = await res.json();
      const parsed =
        typeof data.body === "string" ? JSON.parse(data.body) : data;

      const newSessionId = parsed.session_id || sessionId;
      if (newSessionId && newSessionId !== sessionId) {
        setSessionId(newSessionId);
        localStorage.setItem("session_id", newSessionId);
      }
      if ((parsed.journey_version_display !== undefined && parsed.journey_version_display !== null) || (parsed.journey_version !== undefined && parsed.journey_version !== null)) {
        const v = String(parsed.journey_version_display ?? parsed.journey_version);
        setJourneyVersion(v);
        localStorage.setItem("journey_version", v);
      }
      if (Array.isArray(parsed.user_focus_labels)) {
        const labels = parsed.user_focus_labels
          .filter((x) => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean);
        setUserFocusLabels(labels);
        localStorage.setItem("user_focus_labels", JSON.stringify(labels));
      }
      if (Array.isArray(parsed.must_avoid_topics)) {
        const topics = parsed.must_avoid_topics
          .filter((x) => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean);
        setMustAvoidTopics(topics);
        localStorage.setItem("must_avoid_topics", JSON.stringify(topics));
      }
      if (Array.isArray(parsed.handle_lightly_topics)) {
        const topics = parsed.handle_lightly_topics
          .filter((x) => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean);
        setHandleLightlyTopics(topics);
        localStorage.setItem("handle_lightly_topics", JSON.stringify(topics));
      }

      if (parsed.ui_state) {
        setUiState(parsed.ui_state);
      }

      setChat((prev) => [
        ...prev,
        { role: "user", content: message.trim() },
        { role: "assistant", content: parsed.assistant },
      ]);
      setMessage("");

      // Async UI state refresh (poll until worker releases lock).
      startStatusPoll(newSessionId, idToken);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function autoResizeMessageInput(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }

  async function endSession() {
    setError("");
    setBusy(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");

      const body = {
        session_id: sessionId || undefined,
        end_session: true,
      };

      const res = await fetch(`${API_BASE}/turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API error ${res.status}: ${t}`);
      }

      const data = await res.json();
      const parsed =
        typeof data.body === "string" ? JSON.parse(data.body) : data;

      const newSessionId = parsed.session_id || "";
      setSessionId(newSessionId);
      localStorage.setItem("session_id", newSessionId);
      if ((parsed.journey_version_display !== undefined && parsed.journey_version_display !== null) || (parsed.journey_version !== undefined && parsed.journey_version !== null)) {
        const v = String(parsed.journey_version_display ?? parsed.journey_version);
        setJourneyVersion(v);
        localStorage.setItem("journey_version", v);
      }
      if (Array.isArray(parsed.user_focus_labels)) {
        const labels = parsed.user_focus_labels
          .filter((x) => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean);
        setUserFocusLabels(labels);
        localStorage.setItem("user_focus_labels", JSON.stringify(labels));
      }
      if (Array.isArray(parsed.must_avoid_topics)) {
        const topics = parsed.must_avoid_topics
          .filter((x) => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean);
        setMustAvoidTopics(topics);
        localStorage.setItem("must_avoid_topics", JSON.stringify(topics));
      }
      if (Array.isArray(parsed.handle_lightly_topics)) {
        const topics = parsed.handle_lightly_topics
          .filter((x) => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean);
        setHandleLightlyTopics(topics);
        localStorage.setItem("handle_lightly_topics", JSON.stringify(topics));
      }
      setChat([]);
      setUiState(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openProfile() {
    setError("");
    if (!isAuthed) return;
    setShowProfile(true);
    setActivePage("bio");
    setProfileBusy(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");

      const [schemaRes, profileRes] = await Promise.all([
        fetch(`${API_BASE}/profile/schema`, {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        fetch(`${API_BASE}/profile`, {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      ]);

      if (!schemaRes.ok) throw new Error(`API error ${schemaRes.status}: ${await schemaRes.text()}`);
      if (!profileRes.ok) throw new Error(`API error ${profileRes.status}: ${await profileRes.text()}`);

      const schemaData = await schemaRes.json();
      const schemaParsed =
        typeof schemaData.body === "string" ? JSON.parse(schemaData.body) : schemaData;
      setProfileSchema(schemaParsed.schema || null);

      const profData = await profileRes.json();
      const profParsed =
        typeof profData.body === "string" ? JSON.parse(profData.body) : profData;
      const bp = profParsed.biography_user_profile || {};
      setBioProfile({
        preferred_name: bp.preferred_name || "",
        age: bp.age === undefined || bp.age === null ? "" : String(bp.age),
      });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setProfileBusy(false);
    }
  }

  async function saveProfile() {
    setError("");
    if (!isAuthed) return;
    setProfileBusy(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");

      const preferred = (bioProfile.preferred_name || "").trim();
      if (!preferred) throw new Error("Preferred name is required.");

      const ageVal = (bioProfile.age || "").trim();
      const payload = {
        biography_user_profile: {
          preferred_name: preferred,
          age: ageVal ? Number(ageVal) : null,
        },
      };

      const res = await fetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API error ${res.status}: ${t}`);
      }
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      const bp = parsed.biography_user_profile || {};
      setBioProfile({
        preferred_name: bp.preferred_name || preferred,
        age: bp.age === undefined || bp.age === null ? "" : String(bp.age),
      });
      setShowProfile(false);
      setActivePage("interview");
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setProfileBusy(false);
    }
  }

  async function fetchAdminOverview() {
    setAdminError("");
    setAdminBusy(true);
    setAdminOverview(null);
    try {
      const accessToken = await getAccessToken();
      const target = (adminUserId || "").trim();
      if (!target) throw new Error("target_user_id required");

      const res = await fetch(`${API_BASE}/admin/get_user_journey_overview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ target_user_id: target }),
      });

      if (!res.ok) {
        const t = await res.text();
        let detail = t;
        try {
          const j = JSON.parse(t);
          if (j && typeof j === "object") {
            if (typeof j.body === "string") {
              try {
                const inner = JSON.parse(j.body);
                detail = JSON.stringify(inner);
              } catch {
                detail = j.body;
              }
            } else {
              detail = JSON.stringify(j);
            }
          }
        } catch {
          // keep raw text
        }
        throw new Error(`API error ${res.status}: ${detail}`);
      }

      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      setAdminOverview(parsed);
    } catch (e) {
      setAdminError(e.message || String(e));
    } finally {
      setAdminBusy(false);
    }
  }

  async function lookupAdminUsers() {
    setLookupError("");
    setLookupBusy(true);
    setLookupResults([]);
    try {
      const accessToken = await getAccessToken();
      const username = (lookupUsername || "").trim();
      const email = (lookupEmail || "").trim();
      if (!username && !email) throw new Error("username or email required");

      const res = await fetch(`${API_BASE}/admin/lookup_user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ username: username || undefined, email: email || undefined }),
      });

      if (!res.ok) {
        const t = await res.text();
        let detail = t;
        try {
          const j = JSON.parse(t);
          if (j && typeof j === "object") {
            if (typeof j.body === "string") {
              try {
                const inner = JSON.parse(j.body);
                detail = JSON.stringify(inner);
              } catch {
                detail = j.body;
              }
            } else {
              detail = JSON.stringify(j);
            }
          }
        } catch {
          // keep raw text
        }
        throw new Error(`API error ${res.status}: ${detail}`);
      }

      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      setLookupResults(parsed.matches || []);
    } catch (e) {
      setLookupError(e.message || String(e));
    } finally {
      setLookupBusy(false);
    }
  }

  async function fetchAdminTurns({ append = false } = {}) {
    setTurnsError("");
    turnsAppendRef.current = append;
    if (!append) {
      setTurnsItems([]);
      setTurnsNextKey(null);
    }
    setTurnsBusy(true);
    try {
      const accessToken = await getAccessToken();
      const target = (adminUserId || "").trim();
      if (!target) throw new Error("target_user_id required");
      const sessionId = (turnsSessionId || "").trim();

      const res = await fetch(`${API_BASE}/admin/list_user_turns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          target_user_id: target,
          session_id: sessionId || undefined,
          start_key: append ? turnsNextKey || undefined : undefined,
          limit: 50,
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        let detail = t;
        try {
          const j = JSON.parse(t);
          if (j && typeof j === "object") {
            if (typeof j.body === "string") {
              try {
                const inner = JSON.parse(j.body);
                detail = JSON.stringify(inner);
              } catch {
                detail = j.body;
              }
            } else {
              detail = JSON.stringify(j);
            }
          }
        } catch {
          // keep raw text
        }
        throw new Error(`API error ${res.status}: ${detail}`);
      }

      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      const items = parsed.items || [];
      setTurnsItems((prev) => (append ? [...prev, ...items] : items));
      setTurnsNextKey(parsed.next_start_key || null);
    } catch (e) {
      setTurnsError(e.message || String(e));
    } finally {
      setTurnsBusy(false);
      turnsAppendRef.current = false;
    }
  }

  async function submitFeedback() {
    setFeedbackStatus("");
    setFeedbackBusy(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session?.tokens?.idToken?.toString();
      const payload = {
        message: (feedbackMessage || "").trim(),
        username: (feedbackName || "").trim() || (user?.username || ""),
        email: (feedbackEmail || "").trim() || undefined,
      };
      if (!payload.message) {
        throw new Error("Please enter a message.");
      }
      const headers = { "Content-Type": "application/json" };
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
      const res = await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API error ${res.status}: ${t}`);
      }
      setFeedbackMessage("");
      setFeedbackStatus("Thanks for the feedback!");
    } catch (e) {
      setFeedbackStatus(e.message || String(e));
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function fetchAdminFeedback({ append = false } = {}) {
    setAdminFeedbackError("");
    setAdminFeedbackBusy(true);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`${API_BASE}/admin/list_feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          limit: 50,
          start_key: append ? adminFeedbackNextKey || undefined : undefined,
          user_id: (feedbackUserFilter || "").trim() || undefined,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API error ${res.status}: ${t}`);
      }
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      const items = parsed.items || [];
      setAdminFeedbackItems((prev) => (append ? [...prev, ...items] : items));
      setAdminFeedbackNextKey(parsed.next_start_key || null);
      if (items.length) {
        const newest = items
          .map((i) => (i?.created_at ? Date.parse(i.created_at) : NaN))
          .filter((v) => !Number.isNaN(v))
          .sort((a, b) => b - a)[0];
        if (newest) {
          localStorage.setItem("feedback_last_seen_ms", String(newest));
        }
      }
    } catch (e) {
      setAdminFeedbackError(e.message || String(e));
    } finally {
      setAdminFeedbackBusy(false);
    }
  }

  async function loadAdminTokenClaims() {
    setAdminError("");
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      const accessToken = session.tokens?.accessToken?.toString();
      setAdminTokenClaims({
        id: decodeJwtPayload(idToken),
        access: decodeJwtPayload(accessToken),
      });
    } catch (e) {
      setAdminError(e.message || String(e));
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`} ref={sidebarRef}>
        <button
          type="button"
          className="sidebar-home sidebar-home-primary"
          onClick={() => {
            setMenuOpen(false);
            setShowProfile(false);
            setMenuOverflowOpen(false);
            setActivePage("interview");
          }}
        >
          <HomeIcon className="sidebar-home-icon" size={26} strokeWidth={1.5} />
          Kinin
        </button>
        <div className="sidebar-divider" />
        {!menuCollapsed ? (
          <>
            <button
              type="button"
              className="sidebar-home sidebar-home-secondary"
              onClick={() => {
                setMenuOpen(false);
                openProfile();
              }}
            >
              <Footprints className="sidebar-home-icon" size={20} strokeWidth={1.5} />
              Bio Profile
            </button>
            <button
              type="button"
              className="sidebar-home sidebar-home-secondary"
              onClick={() => {
                setMenuOpen(false);
                setActivePage("faq");
              }}
            >
              <Grid2X2Check className="sidebar-home-icon" size={20} strokeWidth={1.5} />
              FAQ
            </button>
            <button
              type="button"
              className="sidebar-home sidebar-home-secondary"
              onClick={() => {
                setMenuOpen(false);
                setActivePage("feedback");
              }}
            >
              <Megaphone className="sidebar-home-icon" size={20} strokeWidth={1.5} />
              <span className="sidebar-label">
                Feedback
                {newFeedbackCount > 0 ? (
                  <span className="sidebar-badge">{newFeedbackCount}</span>
                ) : null}
              </span>
            </button>
          </>
        ) : (
          <div className="sidebar-overflow-toggle">
            <button
              type="button"
              className="sidebar-home sidebar-home-secondary"
              onClick={() => setMenuOverflowOpen((prev) => !prev)}
            >
              <CirclePlus className="sidebar-home-icon" size={20} strokeWidth={1.5} />
            </button>
            {menuOverflowOpen ? (
              <div className="sidebar-popover">
                <button
                  type="button"
                  className="sidebar-home sidebar-home-secondary"
                  onClick={() => {
                    setMenuOpen(false);
                    setMenuOverflowOpen(false);
                    openProfile();
                  }}
                >
                  <Footprints className="sidebar-home-icon" size={20} strokeWidth={1.5} />
                  Bio Profile
                </button>
                <button
                  type="button"
                  className="sidebar-home sidebar-home-secondary"
                  onClick={() => {
                    setMenuOpen(false);
                    setMenuOverflowOpen(false);
                    setActivePage("faq");
                  }}
                >
                  <Grid2X2Check className="sidebar-home-icon" size={20} strokeWidth={1.5} />
                  FAQ
                </button>
                <button
                  type="button"
                  className="sidebar-home sidebar-home-secondary"
                  onClick={() => {
                    setMenuOpen(false);
                    setMenuOverflowOpen(false);
                    setActivePage("feedback");
                  }}
                >
                  <Megaphone className="sidebar-home-icon" size={20} strokeWidth={1.5} />
                  <span className="sidebar-label">
                    Feedback
                    {newFeedbackCount > 0 ? (
                      <span className="sidebar-badge">{newFeedbackCount}</span>
                    ) : null}
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        )}
        <div className="sidebar-spacer" />
        <div ref={sidebarBottomRef}>
          {!isAuthed ? (
            <button
              type="button"
              className="sidebar-home sidebar-home-secondary signin"
              onClick={() => {
                setMenuOpen(false);
                onLogin();
              }}
            >
              <CircleUserRound className="sidebar-home-icon" size={20} strokeWidth={1.5} />
              Sign In
            </button>
          ) : (
            <div className="sidebar-signout">
              <button
                type="button"
                className="sidebar-home sidebar-home-secondary signin"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                <CircleUserRound className="sidebar-home-icon" size={20} strokeWidth={1.5} />
                Sign Out
              </button>
              <div className="sidebar-muted">{user?.username}</div>
            </div>
          )}
          <div className="sidebar-divider" />
          <button
            type="button"
            className="sidebar-home sidebar-home-secondary"
            onClick={() => {
              setMenuOpen(false);
              endSession();
            }}
          >
            End Session
          </button>
        </div>
      </aside>
      <div className="sidebar-measure" ref={sidebarMeasureRef}>
        <button type="button" className="sidebar-home sidebar-home-primary">
          <HomeIcon className="sidebar-home-icon" size={26} strokeWidth={1.5} />
          Kinin
        </button>
        <div className="sidebar-divider" />
        <button type="button" className="sidebar-home sidebar-home-secondary">
          <Footprints className="sidebar-home-icon" size={20} strokeWidth={1.5} />
          Bio Profile
        </button>
        <button type="button" className="sidebar-home sidebar-home-secondary">
          <Grid2X2Check className="sidebar-home-icon" size={20} strokeWidth={1.5} />
          FAQ
        </button>
        <button type="button" className="sidebar-home sidebar-home-secondary">
          <Megaphone className="sidebar-home-icon" size={20} strokeWidth={1.5} />
          Feedback
        </button>
      </div>
      <main className="main-content">
        <button type="button" className="menu-toggle" onClick={() => setMenuOpen(true)}>
          <Menu className="menu-toggle-icon" size={22} strokeWidth={1.5} />
          Kinin
        </button>
        <div
          style={{
            maxWidth: 900,
            margin: "40px auto",
            padding: 16,
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 600 }}>Kinin Interviewer - seeing</div>
            <div style={{ fontSize: 14, opacity: 0.65 }}>{VERSION_LABEL}</div>
          </div>

      {error && (
        <div
          style={{
            background: "#ffe8e8",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <b>Error:</b> {error}
        </div>
      )}

      {!IS_BETA_LITE ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setActivePage("interview")} disabled={activePage === "interview"}>
            Interview
          </button>
          <button onClick={() => setActivePage("admin")} disabled={activePage === "admin"}>
            Admin
          </button>
        </div>
      ) : null}

      {activePage === "admin" && !IS_BETA_LITE ? (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <b>Admin Lookup</b>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              Search by username and/or email to find a user, then fetch overview.
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
            <input
              value={lookupUsername}
              onChange={(e) => setLookupUsername(e.target.value)}
              placeholder="username (optional)"
              style={{ padding: 10 }}
              disabled={!isAuthed || lookupBusy}
            />
            <input
              value={lookupEmail}
              onChange={(e) => setLookupEmail(e.target.value)}
              placeholder="email (optional)"
              style={{ padding: 10 }}
              disabled={!isAuthed || lookupBusy}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={lookupAdminUsers} disabled={!isAuthed || lookupBusy}>
                {lookupBusy ? "Searching..." : "Lookup"}
              </button>
              <button onClick={loadAdminTokenClaims} disabled={!isAuthed || lookupBusy}>
                Show Token Claims
              </button>
            </div>
            {lookupError ? <div style={{ color: "#b00020" }}>{lookupError}</div> : null}
          </div>

          {lookupResults.length ? (
            <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>Matches</div>
              {lookupResults.map((u) => (
                <div
                  key={u.sub || u.username}
                  style={{
                    borderBottom: "1px solid #f0f0f0",
                    paddingBottom: 8,
                    marginBottom: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div>
                      <b>{u.username || "—"}</b> {u.email ? `(${u.email})` : ""}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      sub: {u.sub || "—"} · status: {u.status || "—"} · enabled: {String(u.enabled)}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const sub = u.sub || "";
                      setAdminUserId(sub);
                      localStorage.setItem("admin_user_id", sub);
                    }}
                  >
                    Use
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {adminTokenClaims ? (
            <div style={{ marginBottom: 12, opacity: 0.85 }}>
              <div>
                Access groups:{" "}
                <b>
                  {adminTokenClaims.access?.["cognito:groups"]
                    ? JSON.stringify(adminTokenClaims.access["cognito:groups"])
                    : "—"}
                </b>
              </div>
              <div>
                ID groups:{" "}
                <b>
                  {adminTokenClaims.id?.["cognito:groups"]
                    ? JSON.stringify(adminTokenClaims.id["cognito:groups"])
                    : "—"}
                </b>
              </div>
            </div>
          ) : null}

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <b>Journey Overview</b>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={adminUserId}
                onChange={(e) => {
                  setAdminUserId(e.target.value);
                  localStorage.setItem("admin_user_id", e.target.value);
                }}
                placeholder="target_user_id (sub)"
                style={{ flex: 1, padding: 10 }}
                disabled={!isAuthed || adminBusy}
              />
              <button onClick={fetchAdminOverview} disabled={!isAuthed || adminBusy}>
                {adminBusy ? "Loading..." : "Fetch Overview"}
              </button>
            </div>
            {adminError ? <div style={{ color: "#b00020", marginBottom: 8 }}>{adminError}</div> : null}
            {adminOverview ? (
              <div
                style={{
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                  <div>
                    Journey:{" "}
                    <b>
                      {adminOverview.journey_id || "—"} v{adminOverview.journey_version || "—"}
                    </b>
                  </div>
                  <div>
                    Current step: <b>{adminOverview.current_step_id || "—"}</b>
                  </div>
                </div>
                {adminStatusCounts ? (
                  <div style={{ marginBottom: 8, opacity: 0.8 }}>
                    Status counts:{" "}
                    <b>{Object.entries(adminStatusCounts).map(([k, v]) => `${k}:${v}`).join(", ")}</b>
                  </div>
                ) : null}
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Raw JSON</div>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    margin: 0,
                    maxHeight: 360,
                    overflow: "auto",
                    background: "#fff",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #eee",
                  }}
                >
                  {JSON.stringify(adminOverview, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <b>Turn Log</b>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={turnsSessionId}
                onChange={(e) => setTurnsSessionId(e.target.value)}
                placeholder="session_id (optional filter)"
                style={{ flex: 1, padding: 10 }}
                disabled={!isAuthed || turnsBusy}
              />
              <button onClick={() => fetchAdminTurns({ append: false })} disabled={!isAuthed || turnsBusy}>
                {turnsBusy ? "Loading..." : "Load Turns"}
              </button>
              <button
                onClick={() => fetchAdminTurns({ append: true })}
                disabled={!isAuthed || turnsBusy || !turnsNextKey}
              >
                Load More
              </button>
            </div>
            {turnsError ? <div style={{ color: "#b00020", marginBottom: 8 }}>{turnsError}</div> : null}
            {turnsView.length ? (
              <div
                ref={turnsListRef}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: 12,
                  background: "#fafafa",
                  maxHeight: 360,
                  overflow: "auto",
                }}
              >
                {turnsView.map((t, i) => (
                  <div key={`${t.session_id || ""}-${t.timestamp || ""}-${i}`} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                      {t.timestamp || "—"} · {t.session_id || "—"} · {t.role || "—"}
                    </div>
                    <div style={{ color: t.role === "assistant" ? "#2563eb" : "#111" }}>
                      {t.content || ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ opacity: 0.7 }}>No turns loaded yet.</div>
            )}
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Feedback</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select
                value={feedbackRangeDays}
                onChange={(e) => setFeedbackRangeDays(Number(e.target.value))}
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={365}>Last 1 year</option>
              </select>
              <input
                value={feedbackUserFilter}
                onChange={(e) => setFeedbackUserFilter(e.target.value)}
                placeholder="filter by user_id (optional)"
                style={{ flex: 1, padding: 8 }}
              />
              <button
                onClick={() => {
                  fetchAdminFeedback({ append: false });
                }}
                disabled={!isAuthed || adminFeedbackBusy}
              >
                {adminFeedbackBusy ? "Loading..." : "Load All"}
              </button>
            </div>
            {adminFeedbackError ? (
              <div style={{ color: "#b00020", marginBottom: 8 }}>{adminFeedbackError}</div>
            ) : null}
            {filteredFeedbackItems.length ? (
              <div
                style={{
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: 12,
                  background: "#fafafa",
                  maxHeight: 280,
                  overflow: "auto",
                }}
              >
                {filteredFeedbackItems.map((f, i) => (
                  <div key={`${f.user_id || "anon"}-${f.created_at || ""}-${i}`} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                      {f.created_at || "—"} · {f.user_id || "anon"} · {f.username || "—"} · {f.email || "—"}
                    </div>
                    <div>{f.message || ""}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ opacity: 0.7 }}>No feedback loaded yet.</div>
            )}
          </div>
        </div>
      ) : activePage === "faq" ? (
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
            Kinin Frequently Asked Questions
          </div>
          <div style={{ minHeight: 240 }} />
        </div>
      ) : activePage === "feedback" ? (
        <div style={{ padding: 16, maxWidth: 720 }}>
          <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
            Feedback: Please, let us know your thoughts.
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <label>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Name (optional)</div>
              <input
                value={feedbackName}
                onChange={(e) => setFeedbackName(e.target.value)}
                style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                placeholder="Your name"
              />
            </label>
            <label>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Email (optional)</div>
              <input
                value={feedbackEmail}
                onChange={(e) => setFeedbackEmail(e.target.value)}
                style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                placeholder="you@example.com"
                inputMode="email"
              />
            </label>
            <label>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Message *</div>
              <textarea
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value)}
                style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10, minHeight: 120 }}
                placeholder="What should we improve?"
              />
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={submitFeedback} disabled={feedbackBusy}>
                {feedbackBusy ? "Sending..." : "Send Feedback"}
              </button>
              {feedbackStatus ? <div style={{ opacity: 0.7 }}>{feedbackStatus}</div> : null}
            </div>
          </div>
          <div style={{ minHeight: 12 }} />
        </div>
      ) : activePage === "bio" ? (
        <div style={{ padding: 16 }}>
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <b>Biography Profile</b>
                <div style={{ opacity: 0.7, fontSize: 12 }}>
                  {profileSchema?.title || "Profile"} (schema v{profileSchema?.version || "—"})
                </div>
              </div>
              <button
                onClick={() => {
                  setShowProfile(false);
                  setActivePage("interview");
                }}
                disabled={profileBusy}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Preferred name *</div>
                <input
                  value={bioProfile.preferred_name}
                  onChange={(e) => setBioProfile((p) => ({ ...p, preferred_name: e.target.value }))}
                  disabled={profileBusy}
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                />
              </label>
              <label>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Age (optional)</div>
                <input
                  value={bioProfile.age}
                  onChange={(e) => setBioProfile((p) => ({ ...p, age: e.target.value }))}
                  disabled={profileBusy}
                  style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10 }}
                  inputMode="numeric"
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveProfile} disabled={profileBusy}>
                  {profileBusy ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setShowProfile(false);
                    setActivePage("interview");
                  }}
                  disabled={profileBusy}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 12,
              minHeight: 260,
              marginBottom: 12,
            }}
          >
            {chat.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Start chatting after logging in.</div>
            ) : (
              chat.map((m, idx) => (
                <div key={idx} style={{ marginBottom: 10 }}>
                  <b>{m.role === "user" ? "You" : "Kinin"}:</b> {m.content}
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <textarea
              ref={messageInputRef}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                autoResizeMessageInput(e.target);
              }}
              onInput={(e) => autoResizeMessageInput(e.target)}
              placeholder={isAuthed ? "Type a message..." : "Login to chat..."}
              style={{
                flex: 1,
                padding: 10,
                fontSize: 12,
                resize: "none",
                overflow: "hidden",
              }}
              rows={1}
              disabled={!isAuthed || busy}
            />
            <button onClick={sendTurn} disabled={!isAuthed || busy}>
              {busy ? "Sending..." : "Send"}
            </button>
          </div>

          <details
            style={{
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 12,
              marginBottom: 12,
              background: "#fcfcfc",
            }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>Interview Details</summary>
            <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  Auth status: <b>{user ? "SIGNED IN" : "SIGNED OUT"}</b>
                </div>
                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  Journey version: <b>{journeyVersion || "—"}</b>
                </div>
                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  User focus:{" "}
                  <b>{userFocusLabels?.length ? userFocusLabels.join(", ") : "—"}</b>
                </div>
                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  Must avoid topics:{" "}
                  <b>{mustAvoidTopics?.length ? mustAvoidTopics.join(", ") : "—"}</b>
                </div>
                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  Handle lightly topics:{" "}
                  <b>{handleLightlyTopics?.length ? handleLightlyTopics.join(", ") : "—"}</b>
                </div>
                {/* Journey progress bar (completed + closed steps / total). */}
                <div style={{ marginBottom: 12, opacity: 0.8 }}>
                  Journey progress: <b>{progressForDisplay.percent}%</b>{" "}
                  <span style={{ opacity: 0.7 }}>
                    ({progressForDisplay.complete_steps} complete,{" "}
                    {progressForDisplay.closed_steps} closed /{" "}
                    {progressForDisplay.total_steps} total)
                  </span>
                  <div
                    style={{
                      height: 8,
                      marginTop: 6,
                      borderRadius: 999,
                      background: "#eee",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, Math.max(0, progressForDisplay.percent))}%`,
                        background: "#3b82f6",
                      }}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  Mode: <b>{uiState?.mode || "—"}</b>
                  {uiState?.current_step_title ? (
                    <>
                      {" "}— Step: <b>{uiState.current_step_title}</b>
                    </>
                  ) : null}
                </div>
                {uiState?.interviewer_step_specific_context ? (
                  <div style={{ marginBottom: 8, opacity: 0.8 }}>
                    Interviewer step context:{" "}
                    <b>{uiState.interviewer_step_specific_context}</b>
                  </div>
                ) : null}
                {uiState?.evaluator_step_specific_context ? (
                  <div style={{ marginBottom: 8, opacity: 0.8 }}>
                    Evaluator step context:{" "}
                    <b>{uiState.evaluator_step_specific_context}</b>
                  </div>
                ) : null}

                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  Guided submode: <b>{uiState?.guided_submode || "—"}</b>
                </div>
                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  Pending advance:{" "}
                  <b>
                    {uiState?.pending_advance && Object.keys(uiState.pending_advance).length
                      ? JSON.stringify(uiState.pending_advance)
                      : "—"}
                  </b>
                </div>
                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  Deepdive:{" "}
                  <b>
                    {uiState?.deepdive && Object.keys(uiState.deepdive).length
                      ? JSON.stringify(uiState.deepdive)
                      : "—"}
                  </b>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input
                    value={sessionId}
                    onChange={(e) => {
                      setSessionId(e.target.value);
                      localStorage.setItem("session_id", e.target.value);
                    }}
                    placeholder="session_id (optional — leave blank to auto-create)"
                    style={{ flex: 1, padding: 10 }}
                    disabled={busy}
                  />
                </div>

                {uiState && (uiState.mode === "guided" || uiState.mode === "deepdive") ? (
                  <div
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 10,
                      padding: 12,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ marginBottom: 8 }}>
                      <b>Step fields</b>
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Covered</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {(uiState.covered_fields || []).length ? (
                            (uiState.covered_fields || []).map((f, i) => <li key={"c-" + i}>{f}</li>)
                          ) : (
                            <li style={{ opacity: 0.7 }}>(none yet)</li>
                          )}
                        </ul>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Uncovered</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {(uiState.uncovered_fields || []).length ? (
                            (uiState.uncovered_fields || []).map((f, i) => <li key={"u-" + i}>{f}</li>)
                          ) : (
                            <li style={{ opacity: 0.7 }}>(none)</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : null}
            </div>
          </details>
        </div>
          )}
        </div>
      </main>
      {menuOpen ? <div className="menu-backdrop" onClick={() => setMenuOpen(false)} /> : null}
    </div>
  );
}
