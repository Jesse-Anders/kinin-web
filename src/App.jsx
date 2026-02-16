import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleUserRound,
  Footprints,
  Grid2X2Check,
  Megaphone,
  Menu,
  CirclePlus,
  Shield,
  Glasses,
} from "lucide-react";
import kininHomeIcon from "./assets/icons/kinin-icon-390sq.png";
import {
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from "aws-amplify/auth";
import FaqPage from "./pages/FaqPage";
import FeedbackPage from "./pages/FeedbackPage";
import AccountPage from "./pages/AccountPage";
import BioProfilePage from "./pages/BioProfilePage";
import AdminCrmPage from "./pages/AdminCrmPage";
import AdminHomePage from "./pages/AdminHomePage";
import AboutKininPage from "./pages/AboutKininPage";

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const RELEASE_CHANNEL = (import.meta.env.VITE_RELEASE_CHANNEL || "dev").toLowerCase();
const IS_BETA_LITE = RELEASE_CHANNEL === "beta-lite";
const VERSION_LABEL = IS_BETA_LITE ? "Beta-lite Version 1.0" : "Dev Version 1.0";
const ACCOUNT_CONFIRM_PHRASE = "delete my account and all data";


export default function App() {
  const LABEL_GROUPS = [
    { key: "user_focus_labels", label: "User focus" },
    { key: "user_interest_labels", label: "User interests" },
    { key: "must_avoid_topics", label: "Must avoid topics" },
    { key: "handle_lightly_topics", label: "Handle lightly topics" },
  ];
  const [user, setUser] = useState(null);
  const [sessionId, setSessionId] = useState(
    () => localStorage.getItem("session_id") || ""
  );
  const [journeyVersion, setJourneyVersion] = useState(
    () => localStorage.getItem("journey_version") || ""
  );
  const [labelGroups, setLabelGroups] = useState(() => {
    const out = {};
    LABEL_GROUPS.forEach(({ key }) => {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        out[key] = Array.isArray(parsed) ? parsed : [];
      } catch {
        out[key] = [];
      }
    });
    return out;
  });
  const [uiState, setUiState] = useState(null);
  const [lastProgress, setLastProgress] = useState(null);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessBlocked, setAccessBlocked] = useState(null);
  const [didStart, setDidStart] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileSchema, setProfileSchema] = useState(null);
  const [bioProfile, setBioProfile] = useState({ preferred_name: "", age: "" });
  const [profileBusy, setProfileBusy] = useState(false);
  const [activePage, setActivePage] = useState("interview");
  const messageInputRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuOverflowOpen, setMenuOverflowOpen] = useState(false);
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const sidebarRef = useRef(null);
  const sidebarMeasureRef = useRef(null);
  const sidebarBottomRef = useRef(null);
  const menuItems = [
    {
      id: "bio",
      label: "Bio Profile",
      icon: Footprints,
      requiresAuth: true,
      onClick: () => openProfile(),
    },
    {
      id: "faq",
      label: "FAQ",
      icon: Grid2X2Check,
      requiresAuth: false,
      onClick: () => setActivePage("faq"),
    },
    {
      id: "feedback",
      label: "Feedback",
      icon: Megaphone,
      requiresAuth: false,
      onClick: () => setActivePage("feedback"),
    },
    {
      id: "about",
      label: "About",
      icon: Glasses,
      requiresAuth: false,
      onClick: () => setActivePage("about"),
    },
    {
      id: "admin",
      label: "Admin",
      icon: Shield,
      requiresAuth: true,
      hideForBetaLite: true,
      onClick: () => setActivePage("admin"),
    },
    {
      id: "end-session",
      label: "End Session",
      icon: null,
      requiresAuth: true,
      onClick: () => endSession(),
      section: "bottom",
    },
  ];
  const [feedbackName, setFeedbackName] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [accountConfirmText, setAccountConfirmText] = useState("");
  const [accountUsername, setAccountUsername] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountStatus, setAccountStatus] = useState("");

  const isAuthed = useMemo(() => !!user, [user]);
  function normalizeLabelArray(values) {
    if (!Array.isArray(values)) return [];
    return values
      .filter((x) => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function syncLabelGroupsFromParsed(parsed) {
    setLabelGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      LABEL_GROUPS.forEach(({ key }) => {
        if (Array.isArray(parsed?.[key])) {
          const labels = normalizeLabelArray(parsed[key]);
          next[key] = labels;
          localStorage.setItem(key, JSON.stringify(labels));
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }
  const accountConfirmMatches = useMemo(
    () => accountConfirmText.trim().toLowerCase() === ACCOUNT_CONFIRM_PHRASE,
    [accountConfirmText]
  );
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
    if (!messageInputRef.current) return;
    if (message) return;
    messageInputRef.current.style.height = "auto";
  }, [message]);
  const visibleTopItems = menuItems.filter(
    (item) => item.section !== "bottom" && (isAuthed || !item.requiresAuth) && !(item.hideForBetaLite && IS_BETA_LITE)
  );
  const visibleBottomItems = menuItems.filter(
    (item) => item.section === "bottom" && (isAuthed || !item.requiresAuth) && !(item.hideForBetaLite && IS_BETA_LITE)
  );
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
  }, [isAuthed, user?.username]);

  async function getAccessToken() {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    if (!token) throw new Error("Missing accessToken. Are you logged in?");
    return token;
  }

  async function getApiErrorPayload(res) {
    const text = await res.text();
    let parsed = null;
    try {
      const outer = JSON.parse(text);
      parsed = typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
    } catch {
      parsed = null;
    }
    return { text, parsed };
  }

  async function ensureApiOk(res) {
    if (res.ok) return;
    const { text, parsed } = await getApiErrorPayload(res);
    if (res.status === 403 && parsed?.error === "access_blocked") {
      setAccessBlocked({
        reason: parsed.reason || "blocked",
        access_state: parsed.access_state || "blocked",
        plan_state: parsed.plan_state || "none",
      });
      setActivePage("interview");
      const blockedErr = new Error("access_blocked");
      blockedErr.name = "AccessBlockedError";
      throw blockedErr;
    }
    const detail = parsed ? JSON.stringify(parsed) : text;
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  function setTopErrorFromException(e) {
    if (e?.name === "AccessBlockedError") return;
    setError(e?.message || String(e));
  }

  async function updateInterviewDetails() {
    if (!sessionId || !isAuthed) return;
    setDetailsBusy(true);
    try {
      const idToken = await getAccessToken();
      const url = `${API_BASE}/turn/status?session_id=${encodeURIComponent(sessionId)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      await ensureApiOk(res);
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      if (parsed?.ui_state) {
        setUiState(parsed.ui_state);
        if ((parsed.ui_state.journey_version_display ?? parsed.ui_state.journey_version) != null) {
          const v = String(parsed.ui_state.journey_version_display ?? parsed.ui_state.journey_version);
          setJourneyVersion(v);
          localStorage.setItem("journey_version", v);
        }
      }
      syncLabelGroupsFromParsed(parsed);
    } catch (e) {
      setTopErrorFromException(e);
    } finally {
      setDetailsBusy(false);
    }
  }

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

  useEffect(() => {
    if (!user?.username) return;
    setAccountUsername(user.username);
  }, [user]);

  async function onLogin() {
    setError("");
    setAccessBlocked(null);
    try {
      await signInWithRedirect(); // Hosted UI
    } catch (e) {
      console.error("Login redirect failed:", e);
      setTopErrorFromException(e);
    }
  }

  async function onLogout() {
    setError("");
    setAccessBlocked(null);
    await signOut({ global: true });
    setUser(null);
    setChat([]);
  }

  async function closeAccount() {
    setAccountError("");
    setAccountStatus("");
    if (!isAuthed) {
      setAccountError("You must be signed in to delete your account.");
      return;
    }
    if (!accountConfirmMatches) {
      setAccountError(`Type "${ACCOUNT_CONFIRM_PHRASE}" to confirm.`);
      return;
    }
    setAccountBusy(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");

      const res = await fetch(`${API_BASE}/account/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          confirmation: accountConfirmText,
          username: accountUsername,
          password: accountPassword,
        }),
      });

      await ensureApiOk(res);

      setAccountStatus("Account deleted. Signing you out...");
      try {
        await signOut({ global: true });
      } catch {
        // Ignore sign-out errors after account deletion.
      }
      stopStatusPoll();
      setUser(null);
      setChat([]);
      setSessionId("");
      setJourneyVersion("");
      localStorage.removeItem("session_id");
      localStorage.removeItem("journey_version");
      LABEL_GROUPS.forEach(({ key }) => localStorage.removeItem(key));
      setLabelGroups(
        LABEL_GROUPS.reduce((acc, { key }) => {
          acc[key] = [];
          return acc;
        }, {})
      );
      setActivePage("interview");
      window.location.assign(window.location.origin + window.location.pathname);
    } catch (e) {
      setAccountError(e?.message || String(e));
    } finally {
      setAccountPassword("");
      setAccountBusy(false);
    }
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

      await ensureApiOk(res);

      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      setAccessBlocked(null);

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
      syncLabelGroupsFromParsed(parsed);

      if (parsed.assistant) {
        setChat([{ role: "assistant", content: parsed.assistant }]);
      }

      if (parsed.ui_state) {
        setUiState(parsed.ui_state);
      }

    } catch (e) {
      setTopErrorFromException(e);
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

      await ensureApiOk(res);

      const data = await res.json();
      const parsed =
        typeof data.body === "string" ? JSON.parse(data.body) : data;
      setAccessBlocked(null);

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
      syncLabelGroupsFromParsed(parsed);

      if (parsed.ui_state) {
        setUiState(parsed.ui_state);
      }

      setChat((prev) => [
        ...prev,
        { role: "user", content: message.trim() },
        { role: "assistant", content: parsed.assistant },
      ]);
      setMessage("");

    } catch (e) {
      setTopErrorFromException(e);
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

      await ensureApiOk(res);

      const data = await res.json();
      const parsed =
        typeof data.body === "string" ? JSON.parse(data.body) : data;
      setAccessBlocked(null);

      const newSessionId = parsed.session_id || "";
      setSessionId(newSessionId);
      localStorage.setItem("session_id", newSessionId);
      if ((parsed.journey_version_display !== undefined && parsed.journey_version_display !== null) || (parsed.journey_version !== undefined && parsed.journey_version !== null)) {
        const v = String(parsed.journey_version_display ?? parsed.journey_version);
        setJourneyVersion(v);
        localStorage.setItem("journey_version", v);
      }
      syncLabelGroupsFromParsed(parsed);
      setChat([]);
      setUiState(null);
    } catch (e) {
      setTopErrorFromException(e);
    } finally {
      setBusy(false);
    }
  }

  async function openProfile() {
    setError("");
    setShowProfile(true);
    setActivePage("bio");
    if (!isAuthed) {
      setError("Please sign in to view your profile.");
      return;
    }
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
      await ensureApiOk(schemaRes);
      await ensureApiOk(profileRes);
      setAccessBlocked(null);

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
      setTopErrorFromException(e);
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

      await ensureApiOk(res);
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      setAccessBlocked(null);
      const bp = parsed.biography_user_profile || {};
      setBioProfile({
        preferred_name: bp.preferred_name || preferred,
        age: bp.age === undefined || bp.age === null ? "" : String(bp.age),
      });
      setShowProfile(false);
      setActivePage("interview");
    } catch (e) {
      setTopErrorFromException(e);
    } finally {
      setProfileBusy(false);
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
          <img
            src={kininHomeIcon}
            alt="Kinin"
            className="sidebar-home-icon sidebar-home-icon-img"
          />
          Kinin
        </button>
        <div className="sidebar-divider" />
        {!menuCollapsed ? (
          <>
            {visibleTopItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="sidebar-home sidebar-home-secondary"
                  onClick={() => {
                    setMenuOpen(false);
                    setMenuOverflowOpen(false);
                    item.onClick();
                  }}
                >
                  {Icon ? <Icon className="sidebar-home-icon" size={20} strokeWidth={1.5} /> : null}
                  {item.label}
                </button>
              );
            })}
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
                {visibleTopItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="sidebar-home sidebar-home-secondary"
                      onClick={() => {
                        setMenuOpen(false);
                        setMenuOverflowOpen(false);
                        item.onClick();
                      }}
                    >
                      {Icon ? <Icon className="sidebar-home-icon" size={20} strokeWidth={1.5} /> : null}
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
        <div className="sidebar-spacer" />
        <div ref={sidebarBottomRef}>
          {!isAuthed ? (
            <div className="sidebar-auth">
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
            </div>
          ) : (
            <div className="sidebar-auth">
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
          {isAuthed ? (
            <button
              type="button"
              className="sidebar-home sidebar-home-secondary sidebar-home-bottom"
              onClick={() => {
                setMenuOpen(false);
                setActivePage("account");
              }}
            >
              My Account
            </button>
          ) : null}
        {visibleBottomItems.length ? <div className="sidebar-divider" /> : null}
        {visibleBottomItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className="sidebar-home sidebar-home-secondary sidebar-home-bottom"
            onClick={() => {
              setMenuOpen(false);
              item.onClick();
            }}
          >
            {item.label}
          </button>
        ))}
        </div>
      </aside>
      <div className="sidebar-measure" ref={sidebarMeasureRef}>
        <button type="button" className="sidebar-home sidebar-home-primary">
          <img
            src={kininHomeIcon}
            alt="Kinin"
            className="sidebar-home-icon sidebar-home-icon-img"
          />
          Kinin
        </button>
        <div className="sidebar-divider" />
        {visibleTopItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" className="sidebar-home sidebar-home-secondary">
              {Icon ? <Icon className="sidebar-home-icon" size={20} strokeWidth={1.5} /> : null}
              {item.label}
            </button>
          );
        })}
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
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <img
              src={kininHomeIcon}
              alt="Kinin"
              style={{ width: 48, height: 48, objectFit: "contain", display: "block", margin: "0 auto 6px", opacity: 0.8 }}
            />
            <div style={{ fontSize: 18, fontWeight: 300, color: "rgba(17, 17, 17, 0.55)" }}>Kinin</div>
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

      {accessBlocked ? (
        <div
          style={{
            background: "#fff4e5",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            border: "1px solid #f5d7a1",
          }}
        >
          <div><b>Sorry, Kinin app use is by invite only at this time.</b></div>
          <div style={{ marginTop: 6 }}>
            If you believe you are receiving this message in error, or you would like to be considered for early
            access, please email team@kinin.ai.
          </div>
        </div>
      ) : null}

      {activePage === "admin" && !IS_BETA_LITE ? (
        <AdminHomePage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          setActivePage={setActivePage}
        />
      ) : activePage === "faq" ? (
        <FaqPage />
      ) : activePage === "feedback" ? (
        <FeedbackPage
          feedbackName={feedbackName}
          setFeedbackName={setFeedbackName}
          feedbackEmail={feedbackEmail}
          setFeedbackEmail={setFeedbackEmail}
          feedbackMessage={feedbackMessage}
          setFeedbackMessage={setFeedbackMessage}
          feedbackBusy={feedbackBusy}
          feedbackStatus={feedbackStatus}
          submitFeedback={submitFeedback}
        />
      ) : activePage === "about" ? (
        <AboutKininPage />
      ) : activePage === "admin-crm" ? (
        <AdminCrmPage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
        />
      ) : activePage === "account" ? (
        <AccountPage
          isAuthed={isAuthed}
          accountUsername={accountUsername}
          accountPassword={accountPassword}
          setAccountPassword={setAccountPassword}
          accountConfirmText={accountConfirmText}
          setAccountConfirmText={setAccountConfirmText}
          accountBusy={accountBusy}
          accountStatus={accountStatus}
          accountError={accountError}
          closeAccount={closeAccount}
        />
      ) : activePage === "bio" ? (
        <BioProfilePage
          profileSchema={profileSchema}
          bioProfile={bioProfile}
          setBioProfile={setBioProfile}
          profileBusy={profileBusy}
          saveProfile={saveProfile}
          onClose={() => {
            setShowProfile(false);
            setActivePage("interview");
          }}
        />
      ) : (
        <div>
          <div
            style={{
              minHeight: 260,
              marginBottom: 12,
              padding: "8px 0",
            }}
          >
            {chat.length === 0 ? (
              <div style={{ opacity: 0.5, textAlign: "center", paddingTop: 80, fontSize: 15 }}>
                Start chatting after logging in.
              </div>
            ) : (
              chat.map((m, idx) => (
                <div
                  key={idx}
                  className={
                    m.role === "user" ? "chat-row chat-row-user" : "chat-row chat-row-assistant"
                  }
                >
                  <div
                    className={
                      m.role === "user"
                        ? "chat-bubble chat-bubble-user"
                        : "chat-bubble chat-bubble-assistant"
                    }
                  >
                    {m.content}
                  </div>
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
              className="chat-input"
              style={{
                flex: 1,
                padding: 10,
                fontSize: 16,
                resize: "none",
                overflow: "hidden",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                color: "rgba(17, 17, 17, 0.7)",
              }}
              rows={1}
              disabled={!isAuthed || busy || !!accessBlocked}
            />
            <button
              onClick={sendTurn}
              disabled={!isAuthed || busy || !!accessBlocked}
              style={{
                background: "#f0f0f0",
                color: "rgba(17, 17, 17, 0.75)",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
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
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#999" }}>
              Interview Details
            </summary>
            <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 10, opacity: 0.8 }}>
                  <div style={{ fontWeight: 600 }}>Kinin - Interviewer</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{VERSION_LABEL}</div>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button onClick={updateInterviewDetails} disabled={!isAuthed || !sessionId || detailsBusy}>
                    {detailsBusy ? "Updating..." : "Update Details"}
                  </button>
                  <div style={{ opacity: 0.7, alignSelf: "center", fontSize: 12 }}>
                    Manual refresh
                  </div>
                </div>
                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  Journey version: <b>{journeyVersion || "—"}</b>
                </div>
                {LABEL_GROUPS.map(({ key, label }) => (
                  <div key={key} style={{ marginBottom: 8, opacity: 0.8 }}>
                    {label}:{" "}
                    <b>
                      {labelGroups?.[key]?.length ? labelGroups[key].join(", ") : "—"}
                    </b>
                  </div>
                ))}
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
