import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  BookMarked,
  BookOpen,
  CircleUserRound,
  CirclePlus,
  Compass,
  Check,
  Key,
  MapPin,
  Menu,
  MessageCircle,
  Mic,
  NotebookPen,
  Play,
  Quote,
  ScrollText,
  Settings as SettingsIcon,
  Square,
  UsersRound,
  X,
} from "lucide-react";
import kininHomeIcon from "./assets/icons/kinin-icon-390sq.png";
import {
  confirmUserAttribute,
  fetchAuthSession,
  getCurrentUser,
  sendUserAttributeVerificationCode,
  signInWithRedirect,
  signOut,
  updatePassword,
  updateUserAttributes,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { useLocation, useNavigate } from "react-router-dom";
import {
  isAuthExpiredError,
  registerAuthFailureHandler,
  reportAuthFailure,
} from "./services/authSession";
import { describeApiErrorMessage } from "./services/describeApiError";
import FaqPage from "./pages/FaqPage";
import FeedbackPage from "./pages/FeedbackPage";
import ContactPage from "./pages/ContactPage";
import AccountPage from "./pages/AccountPage";
import MyAccountPage from "./pages/MyAccountPage";
import SettingsPage from "./pages/SettingsPage";
import AdminCrmPage from "./pages/AdminCrmPage";
import AdminHomePage from "./pages/AdminHomePage";
import { AdminNav } from "./admin/AdminNav";
import AdminMetricsIndexPage from "./pages/admin/metrics/AdminMetricsIndexPage";
import AdminMetricsOverviewPage from "./pages/admin/metrics/AdminMetricsOverviewPage";
import AdminMetricsCostPage from "./pages/admin/metrics/AdminMetricsCostPage";
import AdminMetricsEngagementPage from "./pages/admin/metrics/AdminMetricsEngagementPage";
import AdminMetricsUsersPage from "./pages/admin/metrics/AdminMetricsUsersPage";
import AdminMetricsPerformancePage from "./pages/admin/metrics/AdminMetricsPerformancePage";
import AdminMetricsPricingPage from "./pages/admin/metrics/AdminMetricsPricingPage";
import AdminUserPurgePage from "./pages/AdminUserPurgePage";
import AboutKininPage from "./pages/AboutKininPage";
import PrivacyPage from "./pages/PrivacyPage";
import ReviewEditChatsPage from "./pages/ReviewEditChatsPage";
import PinsPage from "./pages/PinsPage";
import JournalPage from "./pages/JournalPage";
import {
  createEntry as createJournalEntry,
  findEntriesByPin as findJournalEntriesByPin,
} from "./services/journalClient";
import { updatePin } from "./services/pinsClient";
import BiographiesPage from "./pages/BiographiesPage";
import FamilyCirclePage from "./pages/FamilyCirclePage";
import UnsubscribePage from "./pages/UnsubscribePage";
import OnboardingPage from "./pages/OnboardingPage";
import ExecutorAcceptPage from "./pages/ExecutorAcceptPage";
import ConfirmEmailPage from "./pages/ConfirmEmailPage";
import AdminThemeStudioPage from "./pages/AdminThemeStudioPage";
import AdminEmailStudioPage from "./pages/AdminEmailStudioPage";
import InterviewDetailsPanel from "./components/InterviewDetailsPanel";
import HelpMode from "./components/HelpMode";
import HelpMenu from "./components/HelpMenu";
import AlertsMenu from "./components/AlertsMenu";
import Walkthrough from "./components/Walkthrough";
import ClipLightbox from "./components/ClipLightbox";
import {
  getWalkthrough,
  hasWalkthrough,
  HELP_CLIPS_ENABLED,
  WALKTHROUGH_PAGE_KEYS,
} from "./help/walkthroughs";
import {
  ALERT_SNOOZE_DAYS,
  resolveActiveAlerts,
} from "./notifications/alerts";
import {
  Banner,
  Button,
  ChatRow,
  Frame,
  FullscreenLoader,
  Skeleton,
  Spinner,
  TypingDots,
} from "./theme";
import { streamTurn } from "./services/turnStreamClient";
import { sendHelpTurn } from "./services/helpClient";
import { synthesizeTts, warmTts } from "./services/ttsClient";
import { transcribeAudio } from "./services/sttClient";
import {
  useRealtimeDictation,
  isRealtimeDictationSupported,
} from "./hooks/useRealtimeDictation";
import { createTtsStreamQueue } from "./services/ttsStreamQueue";
import { isIOS } from "./services/platform";
import { ensureRunning, playArrayBuffer } from "./services/webAudioPlayer";
import {
  startIosAudioSession,
  stopIosAudioSession,
} from "./services/iosAudioSession";
import {
  DEFAULT_VOICE_UUID,
  QUICK_SWITCH_UUIDS,
  VOICE_OPTIONS,
  resolveEffectivePresetUuid,
} from "./services/voiceCatalog";
import VoiceSilhouette from "./components/VoiceSilhouette";

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const STREAM_WS_URL = import.meta.env.VITE_STREAM_WS_URL || "";
// Client-side rollout switch for streamed biography replies. Off by default so
// shipping this build is a no-op (biography chat keeps using HTTP) until the
// backend flag + WebSocket route are deployed. Accepts 1/true/yes/on to match
// the backend's KININ_BIOGRAPHY_STREAMING_ENABLED semantics.
const BIOGRAPHY_STREAMING_ENABLED = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_BIOGRAPHY_STREAMING_ENABLED || "").trim().toLowerCase(),
);
const RELEASE_CHANNEL = (import.meta.env.VITE_RELEASE_CHANNEL || "dev").toLowerCase();
const IS_BETA_LITE = RELEASE_CHANNEL === "beta-lite";
const VERSION_LABEL = IS_BETA_LITE ? "Beta-lite Version 1.0" : "Dev Version 1.0";
const GOOGLE_LOGIN_ENABLED = String(import.meta.env.VITE_GOOGLE_LOGIN_ENABLED || "").toLowerCase() === "1";
const GOOGLE_PROVIDER_NAME = import.meta.env.VITE_GOOGLE_PROVIDER_NAME || "Google";
const ACCOUNT_CONFIRM_PHRASE = "delete my account and all data";
const CHAT_MESSAGE_MAX_CHARS = 4000;

// Append `add` to `base`, inserting a single space only when needed. Used to
// stitch dictation chunks (finals / interim) onto the existing message.
function joinText(base, add) {
  const b = base || "";
  if (!add) return b;
  const joiner = b && !/\s$/.test(b) ? " " : "";
  return b + joiner + add;
}

// Auto-session-boundary: after this much inactivity (or a calendar-day
// rollover), the next time the chat is opened/foregrounded we silently start a
// fresh conversation. This matches the manual "Start a new conversation"
// behavior (mints a new session + resets the rolling summary). Applies to both
// web and the iOS app, where the user is effectively always logged in.
const AUTO_SESSION_IDLE_MS = 120 * 60 * 1000; // 120 minutes

function readLastActivityAt() {
  try {
    const raw = localStorage.getItem("last_activity_at");
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function markSessionActivity() {
  try {
    localStorage.setItem("last_activity_at", String(Date.now()));
  } catch {
    /* privacy-mode / unavailable localStorage: ignore */
  }
}

// A session is "stale" (should be rotated on next open) if the last recorded
// activity was more than AUTO_SESSION_IDLE_MS ago, or on a prior local day.
function isSessionStale() {
  const last = readLastActivityAt();
  if (!last) return false; // no prior activity → nothing to rotate
  const now = Date.now();
  if (now - last >= AUTO_SESSION_IDLE_MS) return true;
  const lastDay = new Date(last);
  const nowDay = new Date(now);
  return (
    lastDay.getFullYear() !== nowDay.getFullYear() ||
    lastDay.getMonth() !== nowDay.getMonth() ||
    lastDay.getDate() !== nowDay.getDate()
  );
}
const PAGE_TO_PATH = {
  interview: "/",
  help: "/help",
  about: "/about",
  faq: "/faq",
  feedback: "/feedback",
  "review-chats": "/review-chats",
  pins: "/pins",
  journal: "/journal",
  biographies: "/biographies",
  "family-circle": "/family-circle",
  contact: "/contact",
  privacy: "/privacy",
  unsubscribe: "/unsubscribe",
  "executor-accept": "/executor/accept",
  confirm: "/confirm",
  onboarding: "/onboarding",
  admin: "/admin",
  "admin-onboarding-preview": "/admin/onboarding-preview",
  "admin-crm": "/admin/crm",
  "admin-metrics": "/admin/metrics",
  "admin-metrics-overview": "/admin/metrics/overview",
  "admin-metrics-cost": "/admin/metrics/cost",
  "admin-metrics-engagement": "/admin/metrics/engagement",
  "admin-metrics-users": "/admin/metrics/users",
  "admin-metrics-performance": "/admin/metrics/performance",
  "admin-metrics-pricing": "/admin/metrics/pricing",
  "admin-user-purge": "/admin/user-purge",
  "admin-theme": "/admin/theme",
  "admin-email": "/admin/email",
  account: "/account",
  "danger-zone": "/danger-zone",
  settings: "/settings",
  "settings-voice": "/settings/voice",
  "settings-reminders": "/settings/reminders",
  "settings-biographies": "/settings/biographies",
  "settings-interview": "/settings/interview",
  "settings-help": "/settings/help",
};
// Settings category pages, in menu order. Kept as data so the breakout menu
// and the routing/render switch stay in sync.
const SETTINGS_CATEGORIES = [
  { id: "voice", page: "settings-voice", label: "Voice", blurb: "Choose the voice Kinin speaks in." },
  { id: "reminders", page: "settings-reminders", label: "Reminders", blurb: "How often Kinin checks back in." },
  { id: "biographies", page: "settings-biographies", label: "Biographies", blurb: "Turn sharing of your biography on or off." },
  { id: "interview", page: "settings-interview", label: "Interview details", blurb: "Behind-the-scenes session context." },
  { id: "help", page: "settings-help", label: "Help & tips", blurb: "Guided tours and helpful pop-up tips." },
];
const SETTINGS_PAGE_TO_CATEGORY = Object.fromEntries(
  SETTINGS_CATEGORIES.map((c) => [c.page, c.id]),
);
const PATH_TO_PAGE = {
  ...Object.fromEntries(Object.entries(PAGE_TO_PATH).map(([page, path]) => [path, page])),
  // Legacy alias: the old profile/bio route now lives under My Account.
  "/bio": "account",
};

function normalizePath(pathname, hash = "") {
  const hashRaw = String(hash || "");
  if ((pathname || "") === "/" && hashRaw.startsWith("#/")) {
    const hashPath = hashRaw.slice(1).split("?")[0] || "/";
    if (hashPath === "/") return "/";
    return hashPath.replace(/\/+$/, "") || "/";
  }
  if (!pathname) return "/";
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

// The "Start a new conversation" control is hidden for now but left fully wired
// (endSession) so we can re-enable it by flipping this flag.
const SHOW_START_NEW_CONVERSATION = false;

const TOPIC_KIND_LABEL = {
  deferred: "Pick back up",
  never_seen: "Something new",
};

function TopicChooser({
  loading,
  error,
  choices,
  switchingStepId,
  submittingCustom,
  onChoose,
  onSubmitCustom,
  onClose,
}) {
  const [customText, setCustomText] = useState("");
  const canSwitch = !choices || choices.can_switch !== false;
  const items = (choices && Array.isArray(choices.choices) ? choices.choices : []) || [];
  const busyAny = Boolean(switchingStepId) || submittingCustom;
  const trimmedCustom = customText.trim();

  function submitCustom() {
    if (!trimmedCustom || busyAny) return;
    onSubmitCustom(trimmedCustom);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Switch Topics"
      className="km-topics-backdrop"
      onClick={busyAny ? undefined : onClose}
    >
      <div className="km-topics-modal" onClick={(e) => e.stopPropagation()}>
        <div className="km-topics-header">
          <div>
            <span className="km-eyebrow">Your story</span>
            <h2 className="km-topics-title">Switch Topics</h2>
          </div>
          <button
            type="button"
            className="km-topics-close"
            onClick={onClose}
            disabled={busyAny}
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {loading ? (
          <div className="km-topics-state">
            <Spinner /> <span>Gathering a few directions…</span>
          </div>
        ) : error ? (
          <div style={{ marginTop: 16 }}>
            <Banner tone="danger">
              <span>{error}</span>
            </Banner>
          </div>
        ) : !canSwitch ? (
          <p className="km-topics-intro">
            This is a part of your story we&apos;d like to finish together before moving on.
            When you&apos;ve wrapped it up, more directions will open up here. In the meantime,
            you can always start a fresh thread below.
          </p>
        ) : (
          <>
            {items.length > 0 ? (
              <>
                <p className="km-topics-intro">
                  We&apos;ll set your current thread aside — you can always return to
                  it — and pick up somewhere new.
                </p>
                <div className="km-topics-list">
                  {items.map((c) => {
                    const busy = switchingStepId === c.step_id;
                    return (
                      <button
                        key={c.step_id}
                        type="button"
                        className="km-topics-option"
                        onClick={() => onChoose(c.step_id)}
                        disabled={busyAny}
                      >
                        <span className="km-topics-option-body">
                          <span className="km-topics-option-title">
                            {c.step_title || "Untitled topic"}
                          </span>
                          <span className="km-topics-option-kind" data-kind={c.kind}>
                            {TOPIC_KIND_LABEL[c.kind] || "Topic"}
                          </span>
                        </span>
                        {busy ? <Spinner /> : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="km-topics-intro">
                There aren&apos;t any other set topics to jump to right now — but you can always
                bring up something of your own below.
              </p>
            )}

            <div className="km-topics-divider">or</div>
            <div className="km-topics-custom">
              <label className="km-topics-custom-label" htmlFor="km-topic-custom-input">
                Talk about something specific
              </label>
              <p className="km-topics-custom-hint">
                Name a memory, person, or moment you&apos;d like to explore, and we&apos;ll start
                right there.
              </p>
              <div className="km-topics-custom-row">
                <input
                  id="km-topic-custom-input"
                  className="km-topics-input"
                  type="text"
                  placeholder="e.g. the summer I learned to sail"
                  value={customText}
                  disabled={busyAny}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitCustom();
                    }
                  }}
                />
                <button
                  type="button"
                  className="km-btn km-btn-primary km-btn-sm"
                  onClick={submitCustom}
                  disabled={!trimmedCustom || busyAny}
                >
                  {submittingCustom ? <Spinner /> : "Begin"}
                </button>
              </div>
            </div>
          </>
        )}

        <div className="km-topics-footer">
          <button
            type="button"
            className="km-topics-neveromind"
            onClick={onClose}
            disabled={busyAny}
          >
            Never mind, stay on topic
          </button>
        </div>
      </div>
    </div>
  );
}

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
  // Meta help ("Kinin Help"). Fully separate from the interview: its own thread
  // lives server-side and never touches the biography/memory pipeline. It has
  // its own page (activePage === "help", path /help); the interview
  // `chat`/`sessionId` are untouched while the user is over there. The help
  // thread persists in state across in-session navigation but is not persisted
  // across reload by design (help threads are ephemeral).
  const [helpSessionId, setHelpSessionId] = useState("");
  const [helpChat, setHelpChat] = useState([]);
  const [helpBusy, setHelpBusy] = useState(false);
  // Coach-mark tour + clip-lightbox UI state (see HelpMenu / Walkthrough /
  // ClipLightbox). `tourPage` freezes which page's steps are running so a mid-
  // tour navigation can't swap the steps out from under the user.
  const [tourRun, setTourRun] = useState(false);
  const [tourPage, setTourPage] = useState("");
  const [tourSteps, setTourSteps] = useState([]);
  const [clipPage, setClipPage] = useState("");
  // In-app alerts (top-right notification widget). `alertsState` is the backend
  // snooze/dismiss map keyed by alert id; `signupAt` powers time-based triggers.
  const [alertsState, setAlertsState] = useState({});
  const [signupAt, setSignupAt] = useState(null);
  // Account type from the entitlement plan. "biography_only" is a read-only
  // "Reader" account (invited to interact with someone's biography, no
  // interview of their own); everything else is treated as a full "Storyteller".
  const [planState, setPlanState] = useState("");
  // Count of live story-request pins waiting on this user — powers the
  // "a family member would love a story" alert. Derived server-side from pins.
  const [pendingStoryRequests, setPendingStoryRequests] = useState(0);
  // Count of memories the user asked for that a storyteller has now shared but
  // the user hasn't acknowledged — powers the "your memory was shared" alert.
  const [fulfilledStoryRequests, setFulfilledStoryRequests] = useState(0);
  const [isSendingTurn, setIsSendingTurn] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [startingPinId, setStartingPinId] = useState("");
  const [startingJournalPinId, setStartingJournalPinId] = useState("");
  const [journalOpenEntryId, setJournalOpenEntryId] = useState("");
  // Deep-link from Family Circle → Biographies: select this owner on arrival.
  const [biographyOpenOwnerId, setBiographyOpenOwnerId] = useState("");
  // The pin (if any) that seeded the current chat session — powers the
  // "Chat from Pin" note + Mark Pin Complete control at the bottom of the chat.
  const [chatPin, setChatPin] = useState(null);
  const [chatPinCompleted, setChatPinCompleted] = useState(false);
  const [completingChatPin, setCompletingChatPin] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  // "Choose another topic" (guided journey step picker).
  const [topicChooserOpen, setTopicChooserOpen] = useState(false);
  const [topicChoices, setTopicChoices] = useState(null);
  const [topicChoicesLoading, setTopicChoicesLoading] = useState(false);
  const [topicChoicesError, setTopicChoicesError] = useState("");
  const [switchingTopicStepId, setSwitchingTopicStepId] = useState("");
  const [submittingCustomTopic, setSubmittingCustomTopic] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [biographyInvite, setBiographyInvite] = useState(null);
  const [error, setError] = useState("");
  // Errors from the profile-editing surfaces (account/settings + onboarding).
  // Kept separate from the global `error` so they render ONLY on those pages
  // and can never bleed onto chat/other pages. saveProfile, the optimistic
  // Settings toggles, executor actions, and the profile load all route here.
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  // Cognito session died while the UI still looked signed-in. Cleared on a
  // successful sign-in; drives the calm re-auth banner instead of red API dumps.
  const [sessionExpired, setSessionExpired] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState(null);
  const [didStart, setDidStart] = useState(false);
  const [_showProfile, setShowProfile] = useState(false);
  const [profileSchema, setProfileSchema] = useState(null);
  const [bioProfile, setBioProfile] = useState({ preferred_name: "", date_of_birth: "" });
  // Blanket privacy switch: when false, family members can't reach this
  // interviewee's biography. Defaults to true so legacy users stay accessible
  // until they explicitly opt out.
  const [biographySettings, setBiographySettings] = useState({ enabled: true });
  // "Enable voice features" paid add-on (voice input, storage, biography
  // playback/reenactment). Defaults OFF — opt-in feature set, not a default.
  // Audio features are currently always on for all users (add-on toggle hidden,
  // backend gate open). Default true so the mic renders before any profile load.
  const [voiceFeaturesEnabled, setVoiceFeaturesEnabled] = useState(true);
  // In-app help / onboarding. `tips_enabled` gates first-visit auto-launch of
  // per-page walkthroughs; `walkthroughs_seen` records which page tours a user
  // has already been shown so they auto-launch only once. Persisted on the
  // profile so the state follows the user across devices. Defaults ON.
  const [helpPrefs, setHelpPrefs] = useState({
    tips_enabled: true,
    walkthroughs_seen: {},
    journal_seeded: false,
  });
  // Bumped whenever a Journal tour is requested. JournalPage watches this,
  // ensures an entry is open (so entry-only anchors exist), then calls back to
  // actually launch the coach marks.
  const [journalTourNonce, setJournalTourNonce] = useState(0);
  // Voice-to-text (dictation) recording state — Phase 1: transient, no storage.
  const [isRecording, setIsRecording] = useState(false);
  const [sttBusy, setSttBusy] = useState(false);
  const [sttError, setSttError] = useState("");
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordStopTimerRef = useRef(null);
  const [continuitySettings, setContinuitySettings] = useState({
    reminder_cadence_weeks: 2,
    reminder_channel: "email",
  });
  const [accountExecutor, setAccountExecutor] = useState({
    name: "",
    email: "",
    confirm_email: "",
    status: "",
    confirmed_at: null,
    last_invite_sent_at: null,
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [activePage, setActivePage] = useState("interview");
  const [onboardingStatus, setOnboardingStatus] = useState({
    required: false,
    completed_at: null,
    current_step: 1,
  });
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingPreview, setOnboardingPreview] = useState({
    step: 1,
    bioProfile: { preferred_name: "", date_of_birth: "" },
    accountExecutor: { name: "", email: "", confirm_email: "" },
    continuitySettings: { reminder_cadence_weeks: 2, reminder_channel: "email" },
  });
  const messageInputRef = useRef(null);

  // Real-time streaming dictation via OpenAI Realtime (WebRTC). Streams live
  // interim + final text into the message box; works across modern browsers.
  // Ancient browsers without WebRTC fall back to the batch record -> POST /stt
  // path (the isRecording/sttBusy state below).
  const dictationSupported = isRealtimeDictationSupported();
  const appendDictatedText = useCallback((chunk) => {
    setMessage((prev) => joinText(prev, chunk).slice(0, CHAT_MESSAGE_MAX_CHARS));
  }, []);
  const handleDictationError = useCallback((err) => {
    if (err === "not-allowed" || err === "service-not-allowed") {
      setSttError("Microphone access was denied. Check your browser's site settings.");
    } else if (err === "no-microphone") {
      setSttError("No microphone was found.");
    } else if (err === "connection_lost") {
      setSttError("Voice connection dropped. Tap the mic to try again.");
    } else if (err === "voice_features_not_enabled") {
      setSttError("Enable voice features in Settings to use voice input.");
    } else if (err === "network") {
      setSttError("Voice input needs an internet connection.");
    } else {
      setSttError("Voice input hit a snag. Please try again.");
    }
  }, []);
  const dictation = useRealtimeDictation({
    onFinal: appendDictatedText,
    onError: handleDictationError,
  });
  // Grow the textarea as dictation fills it (value changes without an input
  // event, so the onInput auto-resize doesn't fire on its own).
  useEffect(() => {
    const el = messageInputRef.current;
    if (el) autoResizeMessageInput(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, dictation.interim, dictation.listening]);

  // Kinin voice (TTS) — per-session toggle, defaults off. Audio bytes
  // come back from POST /tts and are played client-side as Blob URLs.
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceNeedsUserGesture, setVoiceNeedsUserGesture] = useState(false);
  // Last user-facing TTS error message. Surfaced as a small note near
  // the AudioLines toggle so users can see when synthesis is failing
  // without checking the console (especially important on iOS, where
  // the console isn't easily accessible). Cleared on toggle-off, new
  // turn, or new session.
  const [voiceError, setVoiceError] = useState("");
  // Dev-only A/B for Resemble TTS model. Default is "" (Resemble's
  // standard Chatterbox), which is what our curated voices are tuned
  // for. "chatterbox-turbo" is kept as a dev toggle for latency testing,
  // but most voices in our catalog are incompatible with it
  // (template_id=110 errors) and Resemble's turbo workers OOM on it
  // intermittently (HTTP 503 ResourcesExhausted). Persisted in
  // localStorage so a dev choice survives reloads.
  //
  // Migration: any browser that previously persisted "chatterbox-turbo"
  // (the old default) gets reset to standard on next load. This runs
  // once per browser, gated by `tts_model_default_migrated_v2`.
  const [ttsModel, setTtsModel] = useState(() => {
    try {
      if (
        !localStorage.getItem("tts_model_default_migrated_v2") &&
        localStorage.getItem("tts_model") === "chatterbox-turbo"
      ) {
        localStorage.setItem("tts_model", "");
        localStorage.setItem("tts_model_default_migrated_v2", "1");
      }
    } catch {
      // Ignore: privacy-mode / unavailable localStorage, fall through
      // to the default below.
    }
    const raw = localStorage.getItem("tts_model");
    return raw === null ? "" : raw;
  });
  const ttsModelRef = useRef(ttsModel);
  useEffect(() => {
    ttsModelRef.current = ttsModel;
    if (ttsModel) {
      localStorage.setItem("tts_model", ttsModel);
    } else {
      localStorage.setItem("tts_model", "");
    }
  }, [ttsModel]);
  // Dev-only voice UUID override. When empty, the backend falls back to
  // RESEMBLE_DEFAULT_VOICE_UUID. Used to try different Resemble voices
  // (notably: some voices are only compatible with specific models —
  // e.g. a standard-Chatterbox voice may not work under chatterbox-turbo).
  // Persisted in localStorage so the override survives reloads.
  // Kinin's out-of-the-box voice + preset. The frontend always sends
  // these to /tts so the experience is identical regardless of whether
  // backend env vars are set. Reset buttons in the dev panel return to
  // these defaults (not to empty).
  const [ttsVoiceUuid, setTtsVoiceUuid] = useState(
    () => localStorage.getItem("tts_voice_uuid") || DEFAULT_VOICE_UUID
  );
  const ttsVoiceUuidRef = useRef(ttsVoiceUuid);
  useEffect(() => {
    ttsVoiceUuidRef.current = ttsVoiceUuid;
    if (ttsVoiceUuid) {
      localStorage.setItem("tts_voice_uuid", ttsVoiceUuid);
    } else {
      localStorage.removeItem("tts_voice_uuid");
    }
  }, [ttsVoiceUuid]);
  // Serializes all PUT /profile writes. The full "Save" and the optimistic
  // toggles (biography sharing / voice features / voice preference) all hit the same
  // conditional-write record; without ordering, overlapping requests can
  // resolve out of order and apply a stale server snapshot. Chaining them
  // guarantees writes (and the state reconciliation that follows each) run
  // one at a time, in submission order.
  const profileWriteChainRef = useRef(Promise.resolve());
  // Dev-only free-text voice style prompt (Resemble "description"). Sent
  // inline per /tts call. Empty = no prompt. Capped to 1000 chars (matches
  // Resemble's preset spec; backend enforces the same limit).
  // NOTE: Resemble silently ignores this field on /synthesize; kept around
  // only because the wiring is harmless and may be useful if Resemble's
  // synthesize endpoint ever honors inline descriptions. The user-facing
  // textarea is hidden in the dev panel — preset_uuid is the working path.
  const [ttsVoicePrompt, setTtsVoicePrompt] = useState(
    () => localStorage.getItem("tts_voice_prompt") || ""
  );
  const ttsVoicePromptRef = useRef(ttsVoicePrompt);
  useEffect(() => {
    ttsVoicePromptRef.current = ttsVoicePrompt;
    if (ttsVoicePrompt) {
      localStorage.setItem("tts_voice_prompt", ttsVoicePrompt);
    } else {
      localStorage.removeItem("tts_voice_prompt");
    }
  }, [ttsVoicePrompt]);
  // Resemble Voice Settings Preset UUID. When non-empty, every /tts call
  // includes preset_uuid, and Resemble applies the preset's settings
  // (pace/temperature/exaggeration/description). This is the officially
  // supported style-control path.
  const [ttsPresetUuid, setTtsPresetUuid] = useState(
    () =>
      localStorage.getItem("tts_preset_uuid") ||
      "6b6bfa07-e246-42ed-9362-4641b85bac79" // Warmth
  );
  const ttsPresetUuidRef = useRef(ttsPresetUuid);
  useEffect(() => {
    ttsPresetUuidRef.current = ttsPresetUuid;
    if (ttsPresetUuid) {
      localStorage.setItem("tts_preset_uuid", ttsPresetUuid);
    } else {
      localStorage.removeItem("tts_preset_uuid");
    }
  }, [ttsPresetUuid]);
  // Reusable single <audio> element. Created lazily on first toggle-ON
  // (during a real user gesture) so the browser "blesses" it for
  // subsequent programmatic play() calls. Reusing the same element
  // across turns helps autoplay policy on Chrome / Firefox / desktop
  // Safari. iOS uses Web Audio instead (see audioCtxRef).
  const audioRef = useRef(null);
  // Web Audio context. On desktop browsers we only use it to "unlock"
  // audio output during the toggle-ON gesture and then fall back to the
  // <audio> element. On iOS — where the <audio> element is unreliable
  // for autoplay — this context becomes the playback path: each TTS
  // chunk is decoded via decodeAudioData and scheduled on a fresh
  // AudioBufferSourceNode. Once resumed inside a user gesture, the
  // context stays unlocked for the rest of the session.
  const audioCtxRef = useRef(null);
  // Tracks an in-flight Web Audio playback (the controller returned by
  // playArrayBuffer). Used so stopVoicePlayback can interrupt the
  // single-shot fallback path on iOS.
  const webAudioCtrlRef = useRef(null);
  const currentObjectUrlRef = useRef(null);
  const lastSpokenKeyRef = useRef(null);
  const ttsAbortRef = useRef(null);
  // Per-turn streaming TTS queue. Created on each new turn when voice is
  // enabled, torn down on stream end, abort, voice-off, or new session.
  const ttsQueueRef = useRef(null);
  // 1-sample silent WAV used to "warm up" the <audio> element during
  // the user gesture (toggle-ON) so later programmatic plays succeed.
  const SILENT_WAV_DATA_URI =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuOverflowOpen, setMenuOverflowOpen] = useState(false);
  const sidebarRef = useRef(null);
  const hasSyncedPathRef = useRef(false);
  // Mirrors of state read inside global event listeners (focus/visibility) so
  // the auto-session-boundary handler always sees current values without
  // re-subscribing on every render.
  const isAuthedRef = useRef(false);
  const activePageRef = useRef("interview");
  const busyRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Always start a new page at the top. CSS sets html { scroll-behavior:
  // smooth } for in-page anchors, so we force `instant` here to avoid the
  // jarring smooth-scroll when changing routes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  const ensureAudioElement = () => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      audioRef.current = a;
    }
    return audioRef.current;
  };

  // Called during a real user gesture (toggle-ON click) to unlock
  // programmatic audio playback for the rest of the session. The
  // approach depends on which playback path the session will use:
  //
  //   • iOS: We rely on Web Audio for all TTS playback. Creating and
  //     resuming the AudioContext here, plus scheduling a 1-sample
  //     silent buffer, is the canonical iOS unlock and is sufficient
  //     for the entire session. We deliberately do NOT poke the
  //     <audio> element — a muted .play() on iOS does not actually
  //     unlock that element, and pretending it does has historically
  //     made things worse.
  //
  //   • Other browsers: Same Web Audio resume (so any Web Audio code
  //     elsewhere works), plus a muted .play() on the persistent
  //     <audio> element to bless it for later programmatic plays.
  const primeAudio = () => {
    const ios = isIOS();

    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx) {
        if (ctx.state === "suspended") {
          void ctx.resume();
        }
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      }
    } catch { /* noop */ }

    if (ios) return; // iOS playback is Web Audio only — skip <audio>.

    try {
      const audio = ensureAudioElement();
      audio.muted = true;
      if (!audio.src) audio.src = SILENT_WAV_DATA_URI;
      const p = audio.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          try { audio.pause(); } catch { /* noop */ }
          try { audio.currentTime = 0; } catch { /* noop */ }
        }).catch(() => { /* noop */ });
      }
    } catch { /* noop */ }
  };

  const stopVoicePlayback = () => {
    if (ttsQueueRef.current) {
      try { ttsQueueRef.current.abort(); } catch { /* noop */ }
      ttsQueueRef.current = null;
    }
    if (ttsAbortRef.current) {
      try { ttsAbortRef.current.abort(); } catch { /* noop */ }
      ttsAbortRef.current = null;
    }
    if (webAudioCtrlRef.current) {
      try { webAudioCtrlRef.current.stop(); } catch { /* noop */ }
      webAudioCtrlRef.current = null;
    }
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* noop */ }
      // Do NOT null the element — we keep it primed for future plays.
    }
    if (currentObjectUrlRef.current) {
      try { URL.revokeObjectURL(currentObjectUrlRef.current); } catch { /* noop */ }
      currentObjectUrlRef.current = null;
    }
    setVoiceNeedsUserGesture(false);
    setVoiceBusy(false);
  };

  const resumeVoicePlayback = async () => {
    setVoiceBusy(true);
    try {
      // On iOS we may end up here because the AudioContext got
      // suspended (tab backgrounded, screen locked, incoming call).
      // Resuming the context inside the user's tap is the recovery.
      if (isIOS() && audioCtxRef.current) {
        const ok = await ensureRunning(audioCtxRef.current);
        if (!ok) {
          setVoiceNeedsUserGesture(true);
          return;
        }
      }
      if (ttsQueueRef.current) {
        await ttsQueueRef.current.resumePlayback();
        setVoiceNeedsUserGesture(false);
        return;
      }
      const audio = audioRef.current;
      if (audio) {
        audio.muted = false;
        await audio.play();
      }
      setVoiceNeedsUserGesture(false);
    } catch (playErr) {
      console.warn("TTS manual play failed:", playErr?.message || playErr);
      setVoiceNeedsUserGesture(true);
    } finally {
      setVoiceBusy(false);
    }
  };

  const playAssistantSpeech = async (text) => {
    stopVoicePlayback();
    setVoiceBusy(true);
    setVoiceNeedsUserGesture(false);
    setVoiceError("");
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    let result = null;
    try {
      result = await synthesizeTts({
        text,
        model: ttsModelRef.current || undefined,
        voiceUuid: ttsVoiceUuidRef.current || undefined,
        voicePrompt: ttsVoicePromptRef.current || undefined,
        presetUuid: resolveEffectivePresetUuid(
          ttsVoiceUuidRef.current,
          ttsPresetUuidRef.current,
        ),
        signal: controller.signal,
      });
    } catch (e) {
      if (!controller.signal.aborted) {
        const msg = e?.message || String(e);
        console.warn("TTS synthesis failed:", msg);
        if (/tts_http_5\d\d/.test(msg)) {
          setVoiceError(
            "Voice service is temporarily unavailable. Try again in a moment.",
          );
        } else if (/tts_http_4\d\d/.test(msg)) {
          setVoiceError(
            "Voice could not be generated (model/voice mismatch).",
          );
        } else {
          setVoiceError("Voice playback failed.");
        }
      }
    } finally {
      if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
    }
    if (!result) {
      setVoiceBusy(false);
      return;
    }
    if (controller.signal.aborted) {
      try { URL.revokeObjectURL(result.objectUrl); } catch { /* noop */ }
      setVoiceBusy(false);
      return;
    }

    // iOS path: route through Web Audio. The <audio> element is
    // unreliable for autoplay even after priming, and src swaps can
    // re-lock it. Once the AudioContext is resumed (done during
    // toggle-ON), playing decoded buffers is rock solid.
    if (isIOS() && audioCtxRef.current && result.arrayBuffer) {
      try { URL.revokeObjectURL(result.objectUrl); } catch { /* noop */ }
      try {
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") {
          await ensureRunning(ctx);
        }
        if (ctx.state !== "running") {
          setVoiceNeedsUserGesture(true);
          setVoiceBusy(false);
          return;
        }
        const ctrl = await playArrayBuffer(ctx, result.arrayBuffer);
        webAudioCtrlRef.current = ctrl;
        ctrl.ended.then(() => {
          if (webAudioCtrlRef.current === ctrl) {
            webAudioCtrlRef.current = null;
          }
          setVoiceNeedsUserGesture(false);
        });
      } catch (e) {
        console.warn("TTS Web Audio playback failed:", e?.message || e);
        setVoiceNeedsUserGesture(true);
      } finally {
        setVoiceBusy(false);
      }
      return;
    }

    // <audio> element path (desktop / Android).
    currentObjectUrlRef.current = result.objectUrl;
    const audio = ensureAudioElement();
    audio.muted = false;
    const objectUrl = result.objectUrl;
    const cleanup = () => {
      setVoiceNeedsUserGesture(false);
      if (currentObjectUrlRef.current === objectUrl) {
        try { URL.revokeObjectURL(currentObjectUrlRef.current); } catch { /* noop */ }
        currentObjectUrlRef.current = null;
      }
    };
    // Assignment-style listeners overwrite previous handlers on the
    // reused element, avoiding accumulation across turns.
    audio.onended = cleanup;
    audio.onerror = () => {
      console.warn("TTS audio playback error");
      cleanup();
    };
    audio.src = objectUrl;
    try {
      await audio.play();
    } catch (playErr) {
      console.warn("TTS audio play() blocked:", playErr?.message || playErr);
      setVoiceNeedsUserGesture(true);
    } finally {
      setVoiceBusy(false);
    }
  };

  // Reset voice toggle and stop any playback when the session changes
  // (new chat → voice resets to off, per product spec).
  useEffect(() => {
    setVoiceEnabled(false);
    setVoiceError("");
    stopVoicePlayback();
    if (isIOS()) {
      stopIosAudioSession();
    }
    lastSpokenKeyRef.current = null;
  }, [sessionId]);

  // Clean up audio + Web Audio context on unmount.
  useEffect(
    () => () => {
      stopVoicePlayback();
      audioRef.current = null;
      if (audioCtxRef.current) {
        try { void audioCtxRef.current.close(); } catch { /* noop */ }
        audioCtxRef.current = null;
      }
      stopIosAudioSession();
    },
    [],
  );

  // Auto-play newly completed assistant messages when voice is on.
  // Only fires once per message (tracked by id or content fingerprint),
  // and waits until streaming has finished. Streamed turns are handled
  // sentence-by-sentence by the per-turn TTS queue (see sendTurn); when
  // that queue ran for the latest assistant message, we mark it spoken
  // here so this fallback doesn't re-speak the whole turn.
  useEffect(() => {
    if (!voiceEnabled) return;
    if (isSendingTurn || isStartingSession) return;
    if (ttsQueueRef.current) return;
    if (!Array.isArray(chat) || chat.length === 0) return;
    const lastIdx = chat.length - 1;
    const last = chat[lastIdx];
    if (!last || last.role !== "assistant") return;
    const content = (last.content || "").trim();
    if (!content) return;
    const key = last.id ?? `idx-${lastIdx}:${content.slice(0, 64)}`;
    if (key === lastSpokenKeyRef.current) return;
    lastSpokenKeyRef.current = key;
    void playAssistantSpeech(content);
    // playAssistantSpeech / stopVoicePlayback are stable in behavior and
    // intentionally excluded; including them would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, voiceEnabled, isSendingTurn, isStartingSession]);

  const toggleVoice = () => {
    if (voiceEnabled) {
      setVoiceEnabled(false);
      setVoiceError("");
      stopVoicePlayback();
      // Tear down the iOS silent loop on toggle-off so we don't keep
      // a hidden <audio> element running indefinitely.
      if (isIOS()) {
        stopIosAudioSession();
      }
      return;
    }
    setVoiceError("");
    // On iOS, start a silent looping <audio> element inside this user
    // gesture. While it plays, iOS classifies the page as media-active
    // and Web Audio output is actually routed to the speaker. Without
    // this, source.start() can run "successfully" but produce no
    // audible output and never fire onended — the failure mode we saw
    // where the voice icon pulses indefinitely.
    if (isIOS()) {
      startIosAudioSession();
    }
    // Prime audio during this user gesture so later programmatic
    // play() calls (after async TTS) are not blocked by browser
    // autoplay policy on Chrome/Firefox/desktop Safari.
    primeAudio();
    // Pre-warm the /tts Lambda container (no Resemble call, no audio).
    // Fire-and-forget; the goal is to absorb the ~1s of cold-start init
    // before the first real synthesis is requested.
    void warmTts();
    // Turning ON: don't retroactively read existing messages. Mark the
    // current last assistant message as already spoken so only NEW
    // assistant turns trigger playback.
    let lastIdx = -1;
    for (let i = chat.length - 1; i >= 0; i -= 1) {
      const m = chat[i];
      if (m?.role === "assistant" && (m?.content || "").trim()) {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx >= 0) {
      const m = chat[lastIdx];
      const content = (m.content || "").trim();
      lastSpokenKeyRef.current = m.id ?? `idx-${lastIdx}:${content.slice(0, 64)}`;
    }
    setVoiceEnabled(true);
  };

  const menuItems = [
    {
      id: "about",
      label: "About",
      icon: BookOpen,
      requiresAuth: false,
      onClick: () => navigateToPage("about"),
    },
    {
      id: "faq",
      label: "FAQ",
      icon: Quote,
      requiresAuth: false,
      onClick: () => navigateToPage("faq"),
    },
    {
      id: "interview",
      label: "Interview",
      icon: MessageCircle,
      requiresAuth: true,
      hideForReader: true,
      onClick: () => navigateToPage("interview"),
    },
    {
      id: "journal",
      label: "Journal",
      icon: NotebookPen,
      requiresAuth: true,
      hideForReader: true,
      onClick: () => navigateToPage("journal"),
    },
    {
      id: "pins",
      label: "Pins",
      icon: MapPin,
      requiresAuth: true,
      hideForReader: true,
      onClick: () => navigateToPage("pins"),
    },
    {
      id: "review-chats",
      label: "Review",
      icon: ScrollText,
      requiresAuth: true,
      hideForReader: true,
      onClick: () => navigateToPage("review-chats"),
    },
    {
      id: "biographies",
      label: "Biographies",
      icon: BookMarked,
      requiresAuth: true,
      onClick: () => navigateToPage("biographies"),
    },
    {
      id: "family-circle",
      label: "Family Circle",
      icon: UsersRound,
      requiresAuth: true,
      onClick: () => navigateToPage("family-circle"),
    },
    {
      id: "feedback",
      label: "Feedback",
      requiresAuth: true,
      onClick: () => navigateToPage("feedback"),
    },
    {
      id: "admin",
      label: "Admin",
      icon: Key,
      requiresAuth: true,
      hideForBetaLite: true,
      onClick: () => navigateToPage("admin"),
    },
  ];
  const [feedbackName, setFeedbackName] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactStatus, setContactStatus] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [cognitoGivenName, setCognitoGivenName] = useState("");
  const [cognitoEmail, setCognitoEmail] = useState("");
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [accountConfirmText, setAccountConfirmText] = useState("");
  const [accountUsername, setAccountUsername] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  // True when the signed-in user came in via a federated IdP (e.g. Google).
  // Those users have no Cognito-managed password and their email is owned by
  // the IdP, so the change-email / change-password controls are hidden.
  const [isFederatedUser, setIsFederatedUser] = useState(false);
  // Change-email flow (Cognito self-service). Two steps: request -> confirm
  // with the code Cognito emails to the NEW address.
  const [emailForm, setEmailForm] = useState({ newEmail: "", code: "" });
  const [emailStage, setEmailStage] = useState("idle"); // idle | confirm
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailNotice, setEmailNotice] = useState("");
  // Change-password flow (Cognito self-service, current + new).
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");

  function navigateToPage(page, options = {}) {
    const targetPath = PAGE_TO_PATH[page] || "/";
    const currentPath = normalizePath(location.pathname || "/", location.hash || "");
    if (targetPath === currentPath) return;
    navigate(targetPath, options);
  }

  const isAuthed = useMemo(() => !!user, [user]);
  const onboardingRequired =
    isAuthed &&
    onboardingStatus?.required === true &&
    !onboardingStatus?.completed_at;
  function normalizeLabelArray(values) {
    if (!Array.isArray(values)) return [];
    return values
      .filter((x) => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Client mirror of the backend's normalize_date_of_birth
  // (kinin-lambda/src/kinin/utils/date_of_birth.py): strict YYYY-MM-DD, a real
  // calendar date, not in the future, and age <= 120. Keep the two in sync —
  // the backend is authoritative and will reject anything this misses.
  function isValidDateOfBirth(value) {
    const text = String(value || "").trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!m) return false;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const dt = new Date(year, month - 1, day);
    // Reject rollover (e.g. Feb 30 -> Mar 2); strptime on the backend would.
    if (
      dt.getFullYear() !== year ||
      dt.getMonth() !== month - 1 ||
      dt.getDate() !== day
    ) {
      return false;
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dt > today) return false;
    let age = today.getFullYear() - year;
    if (
      today.getMonth() < month - 1 ||
      (today.getMonth() === month - 1 && today.getDate() < day)
    ) {
      age -= 1;
    }
    if (age > 120) return false;
    return true;
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
  const navDisplayName = useMemo(() => {
    const preferred = String(bioProfile?.preferred_name || "").trim();
    if (preferred) return preferred;
    const given = String(cognitoGivenName || "").trim();
    if (given) return given;
    return "";
  }, [bioProfile?.preferred_name, cognitoGivenName]);

  useEffect(() => {
    if (!messageInputRef.current) return;
    if (message) return;
    messageInputRef.current.style.height = "auto";
  }, [message]);
  // About and FAQ sit on the main sidebar when logged out, but nest into the
  // "+" overflow menu (alongside Contact and Privacy) once a user is logged in.
  // Feedback is auth-only and always lives in that "+" overflow menu.
  const NESTED_WHEN_AUTHED_IDS = new Set(["about", "faq", "feedback"]);
  // A "Reader" (biography_only) account has no interview of their own, so the
  // interviewer-only sections (Interview, Journal, Pins, Review) are hidden.
  const isReader = planState === "biography_only";
  const visibleTopItems = menuItems.filter(
    (item) =>
      item.section !== "bottom" &&
      (isAuthed || !item.requiresAuth) &&
      !(item.hideForBetaLite && IS_BETA_LITE) &&
      !(item.hideForReader && isReader) &&
      !(isAuthed && NESTED_WHEN_AUTHED_IDS.has(item.id))
  );
  const nestedTopItems = isAuthed
    ? menuItems.filter(
        (item) =>
          item.section !== "bottom" &&
          NESTED_WHEN_AUTHED_IDS.has(item.id) &&
          !(item.hideForBetaLite && IS_BETA_LITE)
      )
    : [];
  const extraMenuItems = [
    ...nestedTopItems,
    {
      id: "kinin-help",
      label: "Kinin Help",
      requiresAuth: true,
      onClick: () => openHelpMode(),
    },
    {
      id: "contact",
      label: "Contact",
      requiresAuth: false,
      onClick: () => navigateToPage("contact"),
    },
    {
      id: "privacy",
      label: "Privacy",
      requiresAuth: false,
      onClick: () => navigateToPage("privacy"),
    },
  ];
  const visibleExtraMenuItems = extraMenuItems.filter((item) => isAuthed || !item.requiresAuth);
  const primaryTopItems = visibleTopItems.filter((item) => item.id !== "admin");
  const adminTopItems = visibleTopItems.filter((item) => item.id === "admin");
  const visibleBottomItems = menuItems.filter(
    (item) => item.section === "bottom" && (isAuthed || !item.requiresAuth) && !(item.hideForBetaLite && IS_BETA_LITE)
  );
  const showNavigation = !onboardingRequired;
  useEffect(() => {
    if (uiState?.progress && typeof uiState.progress.percent === "number") {
      setLastProgress(uiState.progress);
    }
  }, [uiState]);
  useEffect(() => {
    const normalizedPath = normalizePath(location.pathname || "/", location.hash || "");
    const page = PATH_TO_PAGE[normalizedPath];
    if (!page) {
      navigate("/", { replace: true });
      return;
    }
    hasSyncedPathRef.current = true;
    setActivePage((prev) => (prev === page ? prev : page));
  }, [location.pathname, location.hash, navigate]);

  useEffect(() => {
    if (!hasSyncedPathRef.current) return;
    const currentPath = normalizePath(location.pathname || "/", location.hash || "");
    const currentPage = PATH_TO_PAGE[currentPath];
    if (currentPage && currentPage !== activePage) return;
    const targetPath = PAGE_TO_PATH[activePage] || "/";
    if (currentPath !== targetPath) {
      navigate(targetPath);
    }
  }, [activePage, location.pathname, location.hash, navigate]);

  // Errors are page-scoped: never let a banner from one page linger onto the
  // next. Profile/settings errors already use `profileError` (rendered only on
  // the account/onboarding surfaces); this clears the global chat/turn/auth
  // banner whenever the active page changes so nothing bleeds across pages.
  useEffect(() => {
    setError("");
  }, [activePage]);

  useEffect(() => {
    const isRestrictedAuthPage =
      activePage === "account" ||
      activePage === "danger-zone" ||
      activePage === "onboarding" ||
      activePage === "feedback" ||
      activePage === "review-chats" ||
      activePage === "pins" ||
      activePage === "journal" ||
      activePage === "biographies" ||
      activePage === "family-circle" ||
      activePage === "help";
    const isAdminPage =
      activePage === "admin" ||
      activePage === "admin-onboarding-preview" ||
      activePage === "admin-crm" ||
      activePage === "admin-metrics" ||
      activePage === "admin-metrics-overview" ||
      activePage === "admin-metrics-cost" ||
      activePage === "admin-metrics-engagement" ||
      activePage === "admin-metrics-users" ||
      activePage === "admin-metrics-performance" ||
      activePage === "admin-metrics-pricing" ||
      activePage === "admin-user-purge" ||
      activePage === "admin-theme" ||
      activePage === "admin-email";

    if (isRestrictedAuthPage && !isAuthed) {
      navigate("/", { replace: true });
      return;
    }
    if (isAdminPage && (!isAuthed || IS_BETA_LITE)) {
      navigate("/", { replace: true });
    }
  }, [activePage, isAuthed, navigate]);

  useEffect(() => {
    if (!isAuthed || !onboardingChecked) return;
    if (onboardingRequired && activePage !== "onboarding") {
      navigateToPage("onboarding", { replace: true });
      return;
    }
    if (!onboardingRequired && activePage === "onboarding") {
      navigateToPage("interview", { replace: true });
    }
  }, [activePage, isAuthed, onboardingChecked, onboardingRequired]);

  // Readers (biography_only) have no interviewer surface, so steer them away
  // from those pages if they arrive via a direct URL/back-button to Biographies.
  const READER_FORBIDDEN_PAGES = useMemo(
    () => new Set(["interview", "journal", "pins", "review-chats"]),
    [],
  );
  useEffect(() => {
    if (!isAuthed || !onboardingChecked) return;
    if (planState === "biography_only" && READER_FORBIDDEN_PAGES.has(activePage)) {
      navigateToPage("biographies", { replace: true });
    }
  }, [activePage, isAuthed, onboardingChecked, planState, READER_FORBIDDEN_PAGES]);

  useEffect(() => {
    if (activePage !== "admin-onboarding-preview") return;
    setOnboardingPreview({
      step: 1,
      bioProfile: { ...bioProfile },
      accountExecutor: {
        name: accountExecutor?.name || "",
        email: accountExecutor?.email || "",
        confirm_email: accountExecutor?.confirm_email || accountExecutor?.email || "",
      },
      continuitySettings: { ...continuitySettings },
    });
  }, [activePage, bioProfile, accountExecutor, continuitySettings]);

  async function getAccessToken() {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();
      if (!token) {
        // Only treat as an unexpected expiry when the UI still thinks we're
        // signed in — cold logged-out calls should not flash the banner.
        if (isAuthedRef.current) await reportAuthFailure();
        throw new Error("Missing accessToken. Are you logged in?");
      }
      return token;
    } catch (e) {
      if (isAuthExpiredError(e)) throw e;
      if (isAuthedRef.current) await reportAuthFailure();
      throw e;
    }
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
    if (res.status === 401) {
      await reportAuthFailure();
    }
    const { text, parsed } = await getApiErrorPayload(res);
    if (res.status === 403 && parsed?.error === "onboarding_required") {
      setOnboardingStatus((prev) => ({
        ...prev,
        required: true,
        current_step: Number(parsed.current_step || prev?.current_step || 1),
      }));
      navigateToPage("onboarding", { replace: true });
      const onboardingErr = new Error("onboarding_required");
      onboardingErr.name = "OnboardingRequiredError";
      throw onboardingErr;
    }
    if (res.status === 403 && parsed?.error === "access_blocked") {
      setAccessBlocked({
        reason: parsed.reason || "blocked",
        access_state: parsed.access_state || "blocked",
        plan_state: parsed.plan_state || "none",
      });
      navigateToPage("interview", { replace: true });
      const blockedErr = new Error("access_blocked");
      blockedErr.name = "AccessBlockedError";
      throw blockedErr;
    }
    const detail = parsed ? JSON.stringify(parsed) : text;
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  function setTopErrorFromException(e) {
    const message = describeApiErrorMessage(e);
    if (!message) return;
    setError(message);
  }

  // Profile/settings-scoped counterpart of setTopErrorFromException. Writes to
  // `profileError`, which is only rendered inside the account/onboarding pages.
  function setProfileErrorFromException(e) {
    const message = describeApiErrorMessage(e);
    if (!message) return;
    setProfileError(message);
  }

  // Send one PUT /profile, serialized behind any in-flight profile writes.
  // Returns the parsed profile body. Throws on non-OK (via ensureApiOk) or
  // auth failure, so callers keep their existing try/catch + revert logic.
  function putProfile(body) {
    const task = async () => {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");
      const res = await fetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });
      await ensureApiOk(res);
      const data = await res.json();
      return typeof data.body === "string" ? JSON.parse(data.body) : data;
    };
    // Chain after the previous write regardless of how it settled, so a failed
    // write never stalls the queue. Callers await the returned promise.
    const run = profileWriteChainRef.current.then(task, task);
    profileWriteChainRef.current = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  // --- Per-section appliers -------------------------------------------------
  // Each reconciles exactly ONE slice of local form state from a /profile
  // response. Partial/optimistic saves (a single toggle) call only their own
  // slice so a partial response can never clobber unrelated fields (e.g. the
  // DOB). The full applyProfilePayload() composes all of them for full loads.

  function applyVoicePreferencesFromPayload(parsed) {
    const voicePrefs = parsed?.voice_preferences;
    if (voicePrefs && typeof voicePrefs === "object") {
      const savedVoice = voicePrefs.voice_uuid;
      const known = VOICE_OPTIONS.some((v) => v.uuid === savedVoice);
      if (known && savedVoice !== ttsVoiceUuidRef.current) {
        setTtsVoiceUuid(savedVoice);
      }
    }
  }

  function applyBiographySettingsFromPayload(parsed) {
    const biography = parsed?.biography_settings;
    setBiographySettings({
      enabled:
        biography && typeof biography === "object" && biography.enabled === false
          ? false
          : true,
    });
  }

  function applyVoiceFeaturesFromPayload() {
    // Audio features (microphone dictation + Kinin's spoken voice) are on for
    // everyone right now — the per-account add-on toggle is hidden and the
    // backend STT gate is open. We ignore the stored voice_features flag and
    // always enable so the mic is available to all users. (If we reintroduce
    // gating later, restore the payload-driven value here.)
    setVoiceFeaturesEnabled(true);
  }

  function applyHelpPreferencesFromPayload(parsed) {
    const hp = parsed?.help_preferences;
    if (!hp || typeof hp !== "object") return;
    const seen =
      hp.walkthroughs_seen && typeof hp.walkthroughs_seen === "object"
        ? hp.walkthroughs_seen
        : {};
    setHelpPrefs({
      // Default ON: only an explicit false disables tips.
      tips_enabled: hp.tips_enabled !== false,
      walkthroughs_seen: { ...seen },
      journal_seeded: hp.journal_seeded === true,
    });
  }

  function applyBioProfileFromPayload(parsed) {
    const bp = parsed?.biography_user_profile || {};
    // Sticky required fields: never blank a populated name/DOB from a response
    // that happens to omit them.
    setBioProfile((prev) => ({
      preferred_name:
        typeof bp.preferred_name === "string" && bp.preferred_name
          ? bp.preferred_name
          : prev.preferred_name || "",
      date_of_birth:
        typeof bp.date_of_birth === "string" && bp.date_of_birth
          ? bp.date_of_birth
          : prev.date_of_birth || "",
    }));
  }

  function applyContinuityFromPayload(parsed) {
    const continuity = parsed?.continuity_settings || {};
    setContinuitySettings({
      reminder_cadence_weeks:
        continuity.reminder_cadence_weeks === undefined || continuity.reminder_cadence_weeks === null
          ? 2
          : Number(continuity.reminder_cadence_weeks),
      reminder_channel: continuity.reminder_channel || "email",
    });
  }

  function applyAccountExecutorFromPayload(parsed) {
    const executor = parsed?.account_executor || {};
    setAccountExecutor({
      name: executor.name || "",
      email: executor.email || "",
      confirm_email: executor.email || "",
      status: executor.status || "",
      confirmed_at: executor.confirmed_at || null,
      last_invite_sent_at: executor.last_invite_sent_at || null,
    });
  }

  function applyProfilePayload(parsed) {
    const onboarding = parsed?.onboarding || {};
    applyVoicePreferencesFromPayload(parsed);
    applyBioProfileFromPayload(parsed);
    applyContinuityFromPayload(parsed);
    setOnboardingStatus({
      required: onboarding.required === true,
      completed_at: onboarding.completed_at || null,
      current_step: Number(onboarding.current_step || 1),
    });
    applyAccountExecutorFromPayload(parsed);
    applyBiographySettingsFromPayload(parsed);
    applyVoiceFeaturesFromPayload(parsed);
    applyHelpPreferencesFromPayload(parsed);
    applyAlertsFromPayload(parsed);
  }

  function applyAlertsFromPayload(parsed) {
    // Only overwrite when the payload actually carries these keys, so a partial
    // PUT response never wipes optimistic local state.
    if (parsed && typeof parsed === "object" && "alerts" in parsed) {
      const raw = parsed.alerts;
      setAlertsState(raw && typeof raw === "object" ? raw : {});
    }
    if (parsed && typeof parsed === "object" && "signup_at" in parsed) {
      setSignupAt(typeof parsed.signup_at === "string" ? parsed.signup_at : null);
    }
    if (parsed && typeof parsed === "object" && "plan_state" in parsed) {
      setPlanState(typeof parsed.plan_state === "string" ? parsed.plan_state : "");
    }
    if (parsed && typeof parsed === "object" && "pending_story_requests" in parsed) {
      const n = Number(parsed.pending_story_requests);
      setPendingStoryRequests(Number.isFinite(n) && n > 0 ? n : 0);
    }
    if (parsed && typeof parsed === "object" && "fulfilled_story_requests" in parsed) {
      const n = Number(parsed.fulfilled_story_requests);
      setFulfilledStoryRequests(Number.isFinite(n) && n > 0 ? n : 0);
    }
  }

  function normalizedExecutorDraft() {
    return {
      name: (accountExecutor?.name || "").trim(),
      email: (accountExecutor?.email || "").trim().toLowerCase(),
      confirmEmail: (accountExecutor?.confirm_email || "").trim().toLowerCase(),
    };
  }

  function validateExecutorDraft() {
    const draft = normalizedExecutorDraft();
    const hasAny = !!(draft.name || draft.email || draft.confirmEmail);
    if (!hasAny) return { ok: true, draft, hasAny: false };
    if (!draft.name || !draft.email || !draft.confirmEmail) {
      return { ok: false, message: "Account executor requires name, email, and confirm email." };
    }
    if (draft.email !== draft.confirmEmail) {
      return { ok: false, message: "Account executor email and confirm email must match." };
    }
    return { ok: true, draft, hasAny: true };
  }

  async function loadProfileState({ includeSchema = false } = {}) {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    if (!idToken) throw new Error("Missing idToken. Are you logged in?");
    const requests = [
      fetch(`${API_BASE}/profile`, {
        method: "GET",
        headers: { Authorization: `Bearer ${idToken}` },
      }),
    ];
    if (includeSchema) {
      requests.unshift(
        fetch(`${API_BASE}/profile/schema`, {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
        })
      );
    }
    const results = await Promise.all(requests);
    for (const res of results) {
      await ensureApiOk(res);
    }
    if (includeSchema) {
      const schemaData = await results[0].json();
      const schemaParsed = typeof schemaData.body === "string" ? JSON.parse(schemaData.body) : schemaData;
      setProfileSchema(schemaParsed.schema || null);
    }
    const profileRes = includeSchema ? results[1] : results[0];
    const profileData = await profileRes.json();
    const profileParsed = typeof profileData.body === "string" ? JSON.parse(profileData.body) : profileData;
    applyProfilePayload(profileParsed);
  }

  function applyTurnResponse(parsed, fallbackSessionId) {
    setAccessBlocked(null);
    markSessionActivity();
    const newSessionId = parsed.session_id || fallbackSessionId || "";
    if (newSessionId && newSessionId !== sessionId) {
      setSessionId(newSessionId);
      localStorage.setItem("session_id", newSessionId);
    }
    if (
      (parsed.journey_version_display !== undefined && parsed.journey_version_display !== null) ||
      (parsed.journey_version !== undefined && parsed.journey_version !== null)
    ) {
      const v = String(parsed.journey_version_display ?? parsed.journey_version);
      setJourneyVersion(v);
      localStorage.setItem("journey_version", v);
    }
    syncLabelGroupsFromParsed(parsed);
    if (parsed.ui_state) {
      setUiState(parsed.ui_state);
    }
    return newSessionId;
  }

  async function sendTurnBuffered({ idToken, trimmedMessage, clientRequestId }) {
    const body = {
      session_id: sessionId || undefined,
      message: trimmedMessage,
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
    const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
    applyTurnResponse(parsed, sessionId);
    return parsed;
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
          const payload = session.tokens.idToken.payload || {};
          const tokenGivenName = String(payload.given_name || "").trim();
          setCognitoGivenName(tokenGivenName);
          const tokenEmail = String(payload.email || "").trim();
          setCognitoEmail(tokenEmail);
          // Federated users carry an `identities` claim (e.g. Google). They
          // have no Cognito password and the IdP owns their email.
          setIsFederatedUser(!!payload.identities);
          const u = await getCurrentUser();
          setUser(u);
          setSessionExpired(false);

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
        setCognitoGivenName("");
        setCognitoEmail("");
      } catch {
        setUser(null);
        setCognitoGivenName("");
        setCognitoEmail("");
      }
    })();
  }, []);

  useEffect(() => {
    if (!isAuthed) {
      setOnboardingChecked(false);
      return;
    }
    (async () => {
      try {
        await loadProfileState();
      } catch (e) {
        setTopErrorFromException(e);
      } finally {
        setOnboardingChecked(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  useEffect(() => {
    if (!isAuthed) return;
    if (!onboardingChecked) return;
    if (onboardingRequired) return;
    if (busy) return;
    if (didStart) return;
    // Auto-start session on login/cold-launch to get intro + session_id without
    // requiring a user message. If the stored session has gone stale (long idle
    // gap or a new local day), mint a fresh conversation instead of resuming.
    startSession(isSessionStale() ? { newSession: true } : {});
    setDidStart(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, onboardingChecked, onboardingRequired]);

  // Keep listener-facing refs in sync with the latest render values.
  isAuthedRef.current = isAuthed;
  activePageRef.current = activePage;
  busyRef.current = busy;

  // Auto-session-boundary on foreground: when the app/tab becomes visible again
  // after a long idle gap (or across a calendar day), silently start a fresh
  // conversation. Lazy by design — a stale session is only rotated when the
  // user actually returns to the chat, so we never churn sessions in the
  // background. The natural "Welcome back…" recap is the only signal shown.
  useEffect(() => {
    if (!isAuthed) return undefined;
    function handleForeground() {
      if (
        typeof document !== "undefined" &&
        document.visibilityState &&
        document.visibilityState !== "visible"
      ) {
        return;
      }
      if (!isAuthedRef.current) return;
      if (activePageRef.current !== "interview") return;
      if (busyRef.current) return;
      if (!localStorage.getItem("session_id")) return;
      if (!isSessionStale()) return;
      startSession({ newSession: true });
    }
    window.addEventListener("focus", handleForeground);
    document.addEventListener("visibilitychange", handleForeground);
    return () => {
      window.removeEventListener("focus", handleForeground);
      document.removeEventListener("visibilitychange", handleForeground);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  useEffect(() => {
    if (!user?.username) return;
    setAccountUsername(user.username);
  }, [user]);

  // Capture a biography invite deep link (?invite=biography&email=&from=) so we
  // can welcome the invitee by name and point them at signup. Persist it across
  // the Hosted UI redirect, and strip the params so they don't linger in the URL.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if ((sp.get("invite") || "").toLowerCase() === "biography") {
        const invite = {
          email: (sp.get("email") || "").trim(),
          from: (sp.get("from") || "").trim(),
        };
        setBiographyInvite(invite);
        try {
          sessionStorage.setItem("kinin_biography_invite", JSON.stringify(invite));
        } catch { /* ignore storage errors */ }
        sp.delete("invite");
        sp.delete("email");
        sp.delete("from");
        const qs = sp.toString();
        window.history.replaceState(
          {},
          "",
          window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
        );
      } else {
        const stored = sessionStorage.getItem("kinin_biography_invite");
        if (stored) setBiographyInvite(JSON.parse(stored));
      }
    } catch { /* ignore malformed invite params */ }
  }, []);

  // Once signed in, the invite has served its purpose (the grant materializes
  // server-side at signup); clear the stored context.
  useEffect(() => {
    if (!isAuthed) return;
    setBiographyInvite(null);
    try {
      sessionStorage.removeItem("kinin_biography_invite");
    } catch { /* ignore */ }
  }, [isAuthed]);

  async function onLogin(provider) {
    setError("");
    setAccessBlocked(null);
    setIsSigningIn(true);
    try {
      if (provider) {
        await signInWithRedirect({ provider }); // Hosted UI with explicit provider
      } else {
        await signInWithRedirect(); // Hosted UI provider picker/default
      }
    } catch (e) {
      console.error("Login redirect failed:", e);
      setTopErrorFromException(e);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function onLogout() {
    setError("");
    setAccessBlocked(null);
    setSessionExpired(false);
    await signOut({ global: true });
    setUser(null);
    setDidStart(false);
    setChat([]);
    setChatPin(null);
    setChatPinCompleted(false);
    setOnboardingStatus({ required: false, completed_at: null, current_step: 1 });
    setOnboardingChecked(false);
  }

  // Cognito session died while the UI still looked signed-in. Clear local auth
  // once and show a calm re-sign-in banner instead of a cascade of red API errors.
  const handleAuthFailure = useCallback(async () => {
    setSessionExpired(true);
    setError("");
    setProfileError("");
    setAccessBlocked(null);
    setUser(null);
    setDidStart(false);
    setChat([]);
    setChatPin(null);
    setChatPinCompleted(false);
    setOnboardingStatus({ required: false, completed_at: null, current_step: 1 });
    setOnboardingChecked(false);
    try {
      // Local only — refresh/access tokens are already unusable; a global
      // revoke would just add another failing network call.
      await signOut({ global: false });
    } catch {
      // Ignore — tokens may already be gone.
    }
  }, []);

  useEffect(() => {
    registerAuthFailureHandler(handleAuthFailure);
    return () => registerAuthFailureHandler(null);
  }, [handleAuthFailure]);

  useEffect(() => {
    // Amplify emits this when a background token refresh fails (typical after
    // long idle). signedOut is NOT handled here — intentional logout and our
    // own recovery signOut would otherwise loop.
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload?.event !== "tokenRefresh_failure") return;
      if (!isAuthedRef.current) return;
      void reportAuthFailure().catch(() => {
        // AuthExpiredError is expected; swallow at the Hub boundary.
      });
    });
    return unsubscribe;
  }, []);

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
        // Local sign-out only — account is already deleted, so global token
        // revocation is unnecessary and would fail without the admin scope.
        await signOut({ global: false });
      } catch {
        // Ignore sign-out errors after account deletion.
      }
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
      navigateToPage("interview");
      window.location.assign(window.location.origin + window.location.pathname);
    } catch (e) {
      setAccountError(e?.message || String(e));
    } finally {
      setAccountPassword("");
      setAccountBusy(false);
    }
  }

  // ---- Cognito self-service: change password ----
  async function changePassword() {
    setPasswordError("");
    setPasswordNotice("");
    if (isFederatedUser) {
      setPasswordError("Your sign-in is managed by your identity provider.");
      return;
    }
    const current = passwordForm.current;
    const next = passwordForm.next;
    if (!current) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (!next || next.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (next !== passwordForm.confirm) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    if (next === current) {
      setPasswordError("New password must differ from the current one.");
      return;
    }
    setPasswordBusy(true);
    try {
      await updatePassword({ oldPassword: current, newPassword: next });
      setPasswordForm({ current: "", next: "", confirm: "" });
      setPasswordNotice("Password updated.");
    } catch (e) {
      const name = e?.name || "";
      if (name === "NotAuthorizedException") {
        setPasswordError("Current password is incorrect.");
      } else if (name === "InvalidPasswordException" || name === "InvalidParameterException") {
        setPasswordError(
          e?.message || "New password doesn't meet the requirements.",
        );
      } else if (name === "LimitExceededException") {
        setPasswordError("Too many attempts. Please wait a bit and try again.");
      } else {
        setPasswordError(e?.message || "Couldn't update your password.");
      }
    } finally {
      setPasswordBusy(false);
    }
  }

  // ---- Cognito self-service: change email (request + confirm code) ----
  async function requestEmailChange() {
    setEmailError("");
    setEmailNotice("");
    if (isFederatedUser) {
      setEmailError("Your email is managed by your identity provider.");
      return;
    }
    const next = (emailForm.newEmail || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    if (next === (cognitoEmail || "").trim().toLowerCase()) {
      setEmailError("That's already your email address.");
      return;
    }
    setEmailBusy(true);
    try {
      const result = await updateUserAttributes({
        userAttributes: { email: next },
      });
      const step = result?.email?.nextStep?.updateAttributeStep;
      if (step === "CONFIRM_ATTRIBUTE_WITH_CODE") {
        setEmailStage("confirm");
        setEmailNotice(`We sent a verification code to ${next}.`);
      } else {
        // No confirmation required (pool not enforcing verification).
        await refreshCognitoEmail();
        setEmailForm({ newEmail: "", code: "" });
        setEmailNotice("Email updated.");
      }
    } catch (e) {
      const name = e?.name || "";
      if (name === "AliasExistsException") {
        setEmailError("That email is already in use by another account.");
      } else if (name === "LimitExceededException") {
        setEmailError("Too many attempts. Please wait a bit and try again.");
      } else if (name === "NotAuthorizedException") {
        setEmailError("Please sign in again before changing your email.");
      } else {
        setEmailError(e?.message || "Couldn't start the email change.");
      }
    } finally {
      setEmailBusy(false);
    }
  }

  async function confirmEmailChange() {
    setEmailError("");
    setEmailNotice("");
    const code = (emailForm.code || "").trim();
    if (!code) {
      setEmailError("Enter the verification code.");
      return;
    }
    setEmailBusy(true);
    try {
      await confirmUserAttribute({
        userAttributeKey: "email",
        confirmationCode: code,
      });
      await refreshCognitoEmail();
      // Reconcile the backend entitlement's denormalized email copy with the
      // new (now-verified) Cognito email. Best-effort: the account is already
      // updated in Cognito regardless, and the server reads the email from
      // Cognito itself (not from us), so nothing here can be spoofed.
      try {
        const token = await getAccessToken();
        await fetch(`${API_BASE}/account/sync-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: "{}",
        });
      } catch {
        // Non-fatal — a later re-login or admin action can reconcile.
      }
      setEmailForm({ newEmail: "", code: "" });
      setEmailStage("idle");
      setEmailNotice("Email address updated.");
    } catch (e) {
      const name = e?.name || "";
      if (name === "CodeMismatchException") {
        setEmailError("That code is incorrect. Check it and try again.");
      } else if (name === "ExpiredCodeException") {
        setEmailError("That code expired. Request a new one.");
      } else {
        setEmailError(e?.message || "Couldn't confirm the new email.");
      }
    } finally {
      setEmailBusy(false);
    }
  }

  async function resendEmailChangeCode() {
    setEmailError("");
    try {
      await sendUserAttributeVerificationCode({ userAttributeKey: "email" });
      setEmailNotice("A new code is on its way.");
    } catch (e) {
      setEmailError(e?.message || "Couldn't resend the code.");
    }
  }

  function cancelEmailChange() {
    setEmailStage("idle");
    setEmailForm({ newEmail: "", code: "" });
    setEmailError("");
    setEmailNotice("");
  }

  // Pull the freshest email from Cognito after a change and reflect it locally.
  async function refreshCognitoEmail() {
    try {
      const session = await fetchAuthSession({ forceRefresh: true });
      const tokenEmail = String(
        session?.tokens?.idToken?.payload?.email || "",
      ).trim();
      if (tokenEmail) setCognitoEmail(tokenEmail);
    } catch {
      /* best-effort: display refresh only */
    }
  }

  async function startChatFromPin(pin) {
    if (!pin || !pin.pin_id) return;
    setStartingPinId(pin.pin_id);
    try {
      // Reset the current conversation and open a fresh freeform session
      // seeded by the pin so Kinin opens by referencing the pinned memory.
      setChat([]);
      setUiState(null);
      setChatPin({ id: pin.pin_id, text: pin.text || "" });
      setChatPinCompleted(pin.status === "completed");
      navigateToPage("interview");
      await startSession({ mode: "freeform", pinId: pin.pin_id, newSession: true });
    } finally {
      setStartingPinId("");
    }
  }

  async function markChatPinComplete() {
    if (!chatPin?.id || chatPinCompleted) return;
    setError("");
    setCompletingChatPin(true);
    try {
      const token = await getAccessToken();
      await updatePin({ apiBase: API_BASE, token, pinId: chatPin.id, updates: { status: "completed" } });
      setChatPinCompleted(true);
    } catch (e) {
      setTopErrorFromException(e);
    } finally {
      setCompletingChatPin(false);
    }
  }

  async function startJournalFromPin(pin) {
    if (!pin || !pin.pin_id) return;
    setStartingJournalPinId(pin.pin_id);
    try {
      const token = await getAccessToken();

      // If this pin already has a linked journal entry, offer to reopen it
      // rather than silently creating a duplicate. Exact server-side lookup so
      // it holds even for users with hundreds of entries.
      let existing = null;
      try {
        const list = await findJournalEntriesByPin({ apiBase: API_BASE, token, pinId: pin.pin_id });
        const entries = Array.isArray(list?.entries) ? list.entries : [];
        existing = entries[0] || null;
      } catch {
        // Lookup is a best-effort check; fall through to normal creation.
      }

      if (existing) {
        const openExisting = window.confirm(
          `You already started a journal entry from this pin:\n\n` +
            `“${existing.title || "Untitled entry"}”\n\n` +
            `Click OK to open that entry, or Cancel to create a new, separate entry.`,
        );
        if (openExisting) {
          setJournalOpenEntryId(existing.entry_id);
          navigateToPage("journal");
          return;
        }
        // Cancel → fall through and create another entry from the same pin.
      }

      // Seed a new journal draft with the pin text so the user can expand the
      // reminder into a full written memory. Title auto-derives on the backend.
      const data = await createJournalEntry({
        apiBase: API_BASE,
        token,
        title: "",
        body: pin.text || "",
        sourcePinId: pin.pin_id,
      });
      const entryId = data?.entry?.entry_id || "";
      setJournalOpenEntryId(entryId);
      navigateToPage("journal");
    } catch (e) {
      setTopErrorFromException(e);
    } finally {
      setStartingJournalPinId("");
    }
  }

  async function startSession({ mode, pinId, newSession = false } = {}) {
    setError("");
    setBusy(true);
    setIsStartingSession(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");

      const body = {
        // Omit session_id to force the backend to mint a fresh session
        // (used when launching a brand-new conversation from a pin).
        session_id: newSession ? undefined : sessionId || undefined,
        start: true,
      };
      if (mode) body.mode = mode;
      if (pinId) body.pin_id = pinId;

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

      markSessionActivity();
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
      setIsStartingSession(false);
      setBusy(false);
    }
  }

  // Send a message to the meta help agent. `explicitSessionId` lets callers
  // (e.g. entering help mode from an offer) pass the freshly-issued help
  // session id before React state has settled.
  async function sendHelp(text, explicitSessionId) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    setHelpBusy(true);
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userMessageId = `help-user-${stamp}`;
    const assistantMessageId = `help-assistant-${stamp}`;
    setHelpChat((prev) => [
      ...prev,
      { id: userMessageId, role: "user", content: trimmed },
      { id: assistantMessageId, role: "assistant", content: "" },
    ]);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");
      const resp = await sendHelpTurn({
        apiBase: API_BASE,
        token: idToken,
        message: trimmed,
        helpSessionId: explicitSessionId || helpSessionId || undefined,
      });
      if (resp?.help_session_id) setHelpSessionId(resp.help_session_id);
      const answer = typeof resp?.answer === "string" ? resp.answer : "";
      setHelpChat((prev) =>
        prev.map((m) => (m.id === assistantMessageId ? { ...m, content: answer } : m))
      );
    } catch {
      setHelpChat((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content:
                  "Sorry — I couldn't reach help just now. Please try again in a moment.",
              }
            : m
        )
      );
    } finally {
      setHelpBusy(false);
    }
  }

  // Enter Kinin Help from an interviewer offer: start a fresh thread on the
  // offered help session and auto-send the user's original question so they
  // land directly on the answer, on the dedicated Help page.
  function enterHelpModeFromOffer(meta) {
    const hsid = meta?.helpSessionId || "";
    setHelpSessionId(hsid);
    setHelpChat([]);
    navigateToPage("help");
    if (meta?.originalQuestion) {
      void sendHelp(meta.originalQuestion, hsid);
    }
  }

  // Manual entry: navigate to the dedicated Help page. The in-session help
  // thread (helpChat / helpSessionId) lives in App state, so a user's help
  // history stays intact when they leave and come back within a session.
  function openHelpMode() {
    navigateToPage("help");
  }

  // "Return to interview" from the Help page. Leaves the help thread intact so
  // it's still there if the user opens Help again this session.
  function exitHelpMode() {
    navigateToPage("interview");
  }

  // ---- In-app help walkthroughs (coach marks + clips) ---------------------

  // Resolve a page's steps to only those whose anchor is currently on-screen
  // (the centered "welcome" step targets body and is always kept). This keeps a
  // tour robust across empty/loading states so react-joyride never stalls on a
  // missing target.
  function resolveTourSteps(pageKey) {
    const wt = getWalkthrough(pageKey);
    if (!wt) return [];
    return wt.steps.filter(
      (s) => s.target === "body" || document.querySelector(s.target),
    );
  }

  // A page has a launchable tour when it has a walkthrough and at least one of
  // its steps resolves. (Kinin Help now lives on its own page, so the interview
  // surface is always the real interview when this runs.)
  function pageHasTour(pageKey) {
    if (!hasWalkthrough(pageKey)) return false;
    return true;
  }

  function startTour(pageKey) {
    const steps = resolveTourSteps(pageKey);
    if (!steps.length) return;
    setTourPage(pageKey);
    setTourSteps(steps);
    setTourRun(true);
  }

  // Entry point for launching a page tour. The Journal's key features only exist
  // in the DOM once an entry is open, so its tour is routed through JournalPage
  // (via a nonce): the page opens an entry, then calls startTour("journal").
  // Every other page starts immediately.
  function launchTour(pageKey) {
    if (pageKey === "journal") {
      setJournalTourNonce((n) => n + 1);
      return;
    }
    startTour(pageKey);
  }

  function handleTourDone() {
    setTourRun(false);
    setTourSteps([]);
    const finishedPage = tourPage;
    setTourPage("");
    if (finishedPage) void markWalkthroughSeen(finishedPage);
  }

  function openClip(pageKey) {
    if (!getWalkthrough(pageKey)?.clip) return;
    setClipPage(pageKey);
  }

  // Fired by BiographiesPage when a biography is first opened. Offers the
  // contextual "how to ask / citations" sub-tour once, if tips are enabled and
  // it hasn't been seen. Delayed so the chat surface + input have mounted.
  function handleBiographyPersonaOpen() {
    if (!isAuthed || accessBlocked) return;
    if (!helpPrefs.tips_enabled) return;
    if (helpPrefs.walkthroughs_seen?.["biographies-persona"]) return;
    if (autoTourAttemptedRef.current.has("biographies-persona")) return;
    autoTourAttemptedRef.current.add("biographies-persona");
    setTimeout(() => {
      if (helpPrefs.walkthroughs_seen?.["biographies-persona"]) return;
      startTour("biographies-persona");
    }, 600);
  }

  // Pages whose first-visit tour we've already attempted this session, so a
  // page that can't yet resolve its anchors doesn't retry on every render.
  const autoTourAttemptedRef = useRef(new Set());

  // First-visit auto-launch: when help tips are on and the current page's tour
  // has never been seen, launch it once (after a short delay so the page's
  // anchors have mounted). Runs at most once per page per session.
  //
  // IMPORTANT: gate on `onboardingChecked`. Until the profile GET resolves,
  // `helpPrefs.walkthroughs_seen` is still the empty default, so evaluating
  // earlier would race the load — on a slow refresh the 700ms timer could fire
  // with stale (empty) seen data and re-launch a tour the user already finished.
  // `onboardingChecked` flips true only after the profile (incl. seen flags) is
  // applied, so by the time this runs the seen map is authoritative.
  useEffect(() => {
    if (!onboardingChecked) return undefined;
    if (!isAuthed || accessBlocked) return undefined;
    if (!helpPrefs.tips_enabled) return undefined;
    if (tourRun || clipPage) return undefined;
    const key = activePage;
    if (!pageHasTour(key)) return undefined;
    if (helpPrefs.walkthroughs_seen?.[key]) return undefined;
    if (autoTourAttemptedRef.current.has(key)) return undefined;
    const timer = setTimeout(() => {
      autoTourAttemptedRef.current.add(key);
      // Re-check conditions at fire time (page/help state may have changed).
      if (helpPrefs.walkthroughs_seen?.[key]) return;
      if (!pageHasTour(key)) return;
      launchTour(key);
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onboardingChecked,
    activePage,
    isAuthed,
    accessBlocked,
    helpPrefs.tips_enabled,
    helpPrefs.walkthroughs_seen,
    tourRun,
    clipPage,
  ]);

  async function sendTurn() {
    setError("");
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;
    if (trimmedMessage.length > CHAT_MESSAGE_MAX_CHARS) {
      setError(`Message too long. Maximum is ${CHAT_MESSAGE_MAX_CHARS} characters.`);
      return;
    }

    setBusy(true);
    setIsSendingTurn(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      const accessToken = session.tokens?.accessToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");

      const clientRequestId =
        globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const userMessageId = `user-${clientRequestId}`;
      const assistantMessageId = `assistant-${clientRequestId}`;
      setChat((prev) => [
        ...prev,
        { id: userMessageId, role: "user", content: trimmedMessage },
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);

      const appendAssistantDelta = (delta) => {
        setChat((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: `${m.content || ""}${delta}` }
              : m
          )
        );
      };
      const setAssistantFinal = (text) => {
        setChat((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: text ?? m.content ?? "" }
              : m
          )
        );
      };
      // If the backend short-circuited into a help-mode offer, the assistant
      // bubble becomes the handoff line with an inline "Switch to help mode"
      // CTA instead of a normal answer. Returns true when a meta offer was
      // applied so the caller skips the normal final-text write.
      const applyMetaSuggestion = (resp) => {
        const ms = resp?.meta_suggestion;
        if (!ms || typeof ms !== "object") return false;
        const handoff =
          (typeof resp.assistant === "string" && resp.assistant) ||
          ms.handoff_message ||
          "";
        setChat((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: handoff || m.content || "",
                  metaSuggestion: {
                    helpSessionId: ms.help_session_id || "",
                    handoff,
                    originalQuestion: trimmedMessage,
                  },
                }
              : m
          )
        );
        return true;
      };

      // If voice is on AND we have a WS stream, build a sentence-by-sentence
      // TTS queue. Each completed sentence is sent to /tts in parallel as
      // text streams in; audio plays in order through the persistent
      // primed <audio> element. This turns ~9s of post-stream silence
      // into ~1-2s while still keeping prosody natural.
      let streamQueue = null;
      const shouldStreamVoice = voiceEnabled && STREAM_WS_URL && accessToken;
      if (shouldStreamVoice) {
        if (ttsQueueRef.current) {
          try { ttsQueueRef.current.abort(); } catch { /* noop */ }
          ttsQueueRef.current = null;
        }
        try {
          // On iOS, hand the queue our AudioContext so it plays via
          // BufferSource (the <audio> element is unreliable on iOS even
          // after priming). On every other browser, the persistent
          // <audio> element works fine and lets the browser handle
          // buffering/decoding for us.
          const queueOptions = isIOS() && audioCtxRef.current
            ? { audioCtx: audioCtxRef.current }
            : { audioEl: ensureAudioElement() };
          // Clear any stale error so a recovering Resemble doesn't keep
          // a "voice unavailable" banner from a prior turn pinned.
          setVoiceError("");
          streamQueue = createTtsStreamQueue({
            ...queueOptions,
            synthesize: ({ text, model, signal }) => {
              return synthesizeTts({
                text,
                model,
                voiceUuid: ttsVoiceUuidRef.current || undefined,
                voicePrompt: ttsVoicePromptRef.current || undefined,
                presetUuid: resolveEffectivePresetUuid(
                  ttsVoiceUuidRef.current,
                  ttsPresetUuidRef.current,
                ),
                signal,
              });
            },
            getModel: () => ttsModelRef.current || undefined,
            onPlaybackBlocked: () => setVoiceNeedsUserGesture(true),
            onError: (err) => {
              const msg = err?.message || String(err);
              console.warn("Streaming TTS error:", msg);
              // Resemble's structured errors come through as
              // "tts_http_503", "tts_http_500" etc. — translate to
              // user-friendly text without exposing internals.
              if (/tts_http_5\d\d/.test(msg)) {
                setVoiceError(
                  "Voice service is temporarily unavailable. Try again in a moment.",
                );
              } else if (/tts_http_4\d\d/.test(msg)) {
                setVoiceError(
                  "Voice could not be generated (model/voice mismatch).",
                );
              } else {
                setVoiceError("Voice playback failed.");
              }
            },
            onPlaybackStarted: () => {
              setVoiceNeedsUserGesture(false);
              setVoiceBusy(true);
            },
            onAllDone: () => setVoiceBusy(false),
          });
          ttsQueueRef.current = streamQueue;
          // Mark this assistant message as already-spoken so the
          // post-stream auto-play effect doesn't fire a second synthesis
          // for the full text.
          lastSpokenKeyRef.current = assistantMessageId;
          setVoiceBusy(true);
        } catch (e) {
          console.warn("Streaming TTS init failed:", e?.message || e);
          streamQueue = null;
        }
      }

      const onStreamDelta = (delta) => {
        appendAssistantDelta(delta);
        if (streamQueue) {
          try { streamQueue.feed(delta); } catch { /* noop */ }
        }
      };

      let completed = false;
      if (STREAM_WS_URL && accessToken) {
        try {
          const streamed = await streamTurn({
            wsUrl: STREAM_WS_URL,
            accessToken,
            message: trimmedMessage,
            sessionId: sessionId || undefined,
            clientRequestId,
            mode: uiState?.mode,
            onDelta: onStreamDelta,
          });
          applyTurnResponse(streamed, sessionId);
          if (!applyMetaSuggestion(streamed) && typeof streamed.assistant === "string") {
            setAssistantFinal(streamed.assistant);
          }
          if (streamQueue) {
            try { streamQueue.finalize(); } catch { /* noop */ }
          }
          setMessage("");
          completed = true;
        } catch {
          if (streamQueue) {
            try { streamQueue.abort(); } catch { /* noop */ }
            if (ttsQueueRef.current === streamQueue) ttsQueueRef.current = null;
          }
          completed = false;
        }
      }

      if (!completed) {
        try {
          const parsed = await sendTurnBuffered({
            idToken,
            trimmedMessage,
            clientRequestId,
          });
          if (!applyMetaSuggestion(parsed)) {
            setAssistantFinal(typeof parsed.assistant === "string" ? parsed.assistant : "");
          }
          setMessage("");
        } catch (e) {
          setChat((prev) =>
            prev.filter((m) => m.id !== userMessageId && m.id !== assistantMessageId)
          );
          throw e;
        }
      }

    } catch (e) {
      setTopErrorFromException(e);
    } finally {
      setIsSendingTurn(false);
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
    setIsEndingSession(true);
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

      markSessionActivity();
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
      setIsEndingSession(false);
      setBusy(false);
    }
  }

  // Open the "Choose another topic" picker and fetch candidate steps
  // (one deferred + the next two never-seen) from the backend.
  async function openTopicChooser() {
    setTopicChooserOpen(true);
    setTopicChoices(null);
    setTopicChoicesError("");
    setTopicChoicesLoading(true);
    try {
      const idToken = await getAccessToken();
      const res = await fetch(`${API_BASE}/turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          session_id: sessionId || undefined,
          list_topic_choices: true,
        }),
      });
      await ensureApiOk(res);
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      setTopicChoices(parsed.topic_choices || { choices: [], can_switch: true });
    } catch (e) {
      setTopicChoicesError(
        (e && e.message) || "Couldn't load topics. Please try again."
      );
    } finally {
      setTopicChoicesLoading(false);
    }
  }

  function closeTopicChooser() {
    setTopicChooserOpen(false);
    setTopicChoices(null);
    setTopicChoicesError("");
    setSwitchingTopicStepId("");
    setSubmittingCustomTopic(false);
  }

  // Switch the guided conversation to the chosen step. The backend defers the
  // current step and returns an interviewer message opening the new topic, which
  // we append to the existing chat thread (same session).
  async function chooseTopic(stepId) {
    if (!stepId || switchingTopicStepId) return;
    setSwitchingTopicStepId(stepId);
    setTopicChoicesError("");
    try {
      const idToken = await getAccessToken();
      const res = await fetch(`${API_BASE}/turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          session_id: sessionId || undefined,
          enter_step_id: stepId,
        }),
      });
      await ensureApiOk(res);
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      applyTurnResponse(parsed, sessionId);
      if (parsed.assistant) {
        setChat((prev) => [...prev, { role: "assistant", content: parsed.assistant }]);
      }
      closeTopicChooser();
    } catch (e) {
      setTopicChoicesError(
        (e && e.message) || "Couldn't switch topics. Please try again."
      );
    } finally {
      setSwitchingTopicStepId("");
    }
  }

  // Start an open-ended conversation on a topic the user typed in. The backend
  // seeds an interviewer opening anchored on their topic and follows their lead.
  async function chooseCustomTopic(topicText) {
    const topic = (topicText || "").trim();
    if (!topic || submittingCustomTopic || switchingTopicStepId) return;
    setSubmittingCustomTopic(true);
    setTopicChoicesError("");
    try {
      const idToken = await getAccessToken();
      const res = await fetch(`${API_BASE}/turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          session_id: sessionId || undefined,
          custom_topic: topic,
        }),
      });
      await ensureApiOk(res);
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      applyTurnResponse(parsed, sessionId);
      if (parsed.assistant) {
        setChat((prev) => [...prev, { role: "assistant", content: parsed.assistant }]);
      }
      closeTopicChooser();
    } catch (e) {
      setTopicChoicesError(
        (e && e.message) || "Couldn't start that topic. Please try again."
      );
    } finally {
      setSubmittingCustomTopic(false);
    }
  }

  async function openProfile() {
    setProfileError("");
    setProfileNotice("");
    setShowProfile(true);
    navigateToPage("account");
    if (!isAuthed) {
      setProfileError("Please sign in to view your profile.");
      return;
    }
    setProfileBusy(true);
    try {
      await loadProfileState({ includeSchema: true });
      setAccessBlocked(null);
    } catch (e) {
      setProfileErrorFromException(e);
    } finally {
      setProfileBusy(false);
    }
  }

  async function saveProfile(options = {}) {
    const {
      closeAfterSave = true,
      navigateAfterSave = true,
      onboardingStep = null,
      markOnboardingCompleted = false,
      executorNotice = "",
      executorSendInvite = true,
    } = options;
    setProfileError("");
    if (!isAuthed) return;
    setProfileBusy(true);
    try {
      const preferred = (bioProfile.preferred_name || "").trim();
      if (!preferred) throw new Error("Preferred name is required.");
      const dateOfBirth = String(bioProfile.date_of_birth || "").trim();
      if (!dateOfBirth) throw new Error("Date of birth is required.");
      if (!isValidDateOfBirth(dateOfBirth)) {
        throw new Error("Date of birth must be a valid date in YYYY-MM-DD format.");
      }
      const executorValidation = validateExecutorDraft();
      if (!executorValidation.ok) {
        throw new Error(executorValidation.message);
      }

      const payload = {
        biography_user_profile: {
          preferred_name: preferred,
          date_of_birth: dateOfBirth,
        },
        continuity_settings: {
          reminder_cadence_weeks: Number(continuitySettings?.reminder_cadence_weeks ?? 2),
          reminder_channel: "email",
        },
        onboarding:
          onboardingStep || markOnboardingCompleted
            ? {
                ...(onboardingStep ? { current_step: Number(onboardingStep) } : {}),
                ...(markOnboardingCompleted ? { mark_completed: true } : {}),
              }
            : undefined,
        account_executor:
          executorValidation.hasAny
            ? {
                name: executorValidation.draft.name,
                email: executorValidation.draft.email,
                send_invite: !!executorSendInvite,
              }
            : null,
        voice_preferences: ttsVoiceUuid
          ? { voice_uuid: ttsVoiceUuid }
          : null,
        biography_settings: {
          enabled: biographySettings?.enabled !== false,
        },
        voice_features: {
          enabled: !!voiceFeaturesEnabled,
        },
      };

      const parsed = await putProfile(payload);
      setAccessBlocked(null);
      applyProfilePayload(parsed);
      if (closeAfterSave) {
        setShowProfile(false);
      }
      if (navigateAfterSave) {
        navigateToPage("interview");
      }
      if (executorNotice) {
        setProfileNotice(executorNotice);
      } else if (payload.account_executor && !markOnboardingCompleted) {
        setProfileNotice("Account executor invitation email sent.");
      }
      return true;
    } catch (e) {
      setProfileErrorFromException(e);
      return false;
    } finally {
      setProfileBusy(false);
    }
  }

  // Per-section save: identity fields (preferred name + date of birth) only.
  // Used by the "My Account" page so saving one section can't clobber others.
  async function saveBioProfile() {
    setProfileError("");
    setProfileNotice("");
    if (!isAuthed) return false;
    const preferred = (bioProfile.preferred_name || "").trim();
    if (!preferred) {
      setProfileError("Preferred name is required.");
      return false;
    }
    const dateOfBirth = String(bioProfile.date_of_birth || "").trim();
    if (!dateOfBirth) {
      setProfileError("Date of birth is required.");
      return false;
    }
    if (!isValidDateOfBirth(dateOfBirth)) {
      setProfileError("Date of birth must be a valid date in YYYY-MM-DD format.");
      return false;
    }
    setProfileBusy(true);
    try {
      const parsed = await putProfile({
        biography_user_profile: {
          preferred_name: preferred,
          date_of_birth: dateOfBirth,
        },
      });
      setAccessBlocked(null);
      applyBioProfileFromPayload(parsed);
      setProfileNotice("Profile saved.");
      return true;
    } catch (e) {
      setProfileErrorFromException(e);
      return false;
    } finally {
      setProfileBusy(false);
    }
  }

  // Per-section save: reminder rhythm. Optimistic like the other toggles —
  // flip local state, PUT, revert on failure.
  async function saveReminderCadence(weeks) {
    if (!isAuthed) return false;
    setProfileError("");
    setProfileNotice("");
    const desired = Number(weeks);
    const previous = continuitySettings;
    setContinuitySettings((prev) => ({
      ...prev,
      reminder_cadence_weeks: desired,
    }));
    try {
      const parsed = await putProfile({
        continuity_settings: {
          reminder_cadence_weeks: desired,
          reminder_channel: "email",
        },
      });
      applyContinuityFromPayload(parsed);
      setProfileNotice("Reminder rhythm updated.");
      return true;
    } catch (e) {
      setContinuitySettings(previous);
      setProfileErrorFromException(e);
      return false;
    }
  }

  // Persist the biography sharing on/off privacy switch immediately, without
  // waiting for the user to hit "Save" on the Settings page. Optimistic: local
  // state flips first, then we PUT. On failure we revert and surface a banner —
  // this is a privacy control so silent failure is unacceptable.
  async function saveBiographyEnabled(nextEnabled) {
    if (!isAuthed) return false;
    const desired = !!nextEnabled;
    const previous = biographySettings?.enabled !== false;
    setProfileError("");
    setBiographySettings({ enabled: desired });
    try {
      const parsed = await putProfile({ biography_settings: { enabled: desired } });
      // Reconcile only this slice — never re-hydrate the whole form from a
      // partial-save response.
      applyBiographySettingsFromPayload(parsed);
      setProfileNotice(
        desired
          ? "Biography sharing is on. The family members you've invited can interact with your biography."
          : "Biography sharing is paused. No one can reach your biography until you turn it back on.",
      );
      return true;
    } catch (e) {
      setBiographySettings({ enabled: previous });
      setProfileErrorFromException(e);
      return false;
    }
  }

  // Persist the "Enable voice features" add-on toggle immediately (optimistic),
  // mirroring saveBiographyEnabled. Turning this on unlocks voice dictation now
  // and voice storage / biography voice features in later phases.
  async function saveVoiceFeaturesEnabled(nextEnabled) {
    if (!isAuthed) return false;
    const desired = !!nextEnabled;
    const previous = !!voiceFeaturesEnabled;
    setProfileError("");
    setVoiceFeaturesEnabled(desired);
    if (!desired) {
      // If they turn it off mid-capture, stop and discard.
      if (dictationSupported) dictation.stop();
      stopRecording();
      setSttError("");
    }
    try {
      const parsed = await putProfile({ voice_features: { enabled: desired } });
      applyVoiceFeaturesFromPayload(parsed);
      return true;
    } catch (e) {
      setVoiceFeaturesEnabled(previous);
      setProfileErrorFromException(e);
      return false;
    }
  }

  // Toggle "show helpful tips and walkthroughs" (optimistic + revert on error).
  async function saveHelpTipsEnabled(nextEnabled) {
    if (!isAuthed) return false;
    const desired = !!nextEnabled;
    const previous = helpPrefs;
    setProfileError("");
    setHelpPrefs((prev) => ({ ...prev, tips_enabled: desired }));
    try {
      const parsed = await putProfile({ help_preferences: { tips_enabled: desired } });
      applyHelpPreferencesFromPayload(parsed);
      return true;
    } catch (e) {
      setHelpPrefs(previous);
      setProfileErrorFromException(e);
      return false;
    }
  }

  // Record that a page's coach-mark tour has been shown so it does not
  // auto-launch again. Merge-patch: the backend merges into walkthroughs_seen.
  async function markWalkthroughSeen(pageKey) {
    if (!isAuthed || !pageKey) return false;
    if (helpPrefs.walkthroughs_seen?.[pageKey]) return true;
    const previous = helpPrefs;
    setHelpPrefs((prev) => ({
      ...prev,
      walkthroughs_seen: { ...prev.walkthroughs_seen, [pageKey]: true },
    }));
    try {
      const parsed = await putProfile({
        help_preferences: { walkthroughs_seen: { [pageKey]: true } },
      });
      applyHelpPreferencesFromPayload(parsed);
      return true;
    } catch (e) {
      setHelpPrefs(previous);
      setProfileErrorFromException(e);
      return false;
    }
  }

  // Record that the one-time "My First Journal Entry" starter has been created
  // (or intentionally skipped for an established account). Optimistic + merged.
  async function markJournalSeeded() {
    if (!isAuthed) return false;
    if (helpPrefs.journal_seeded) return true;
    const previous = helpPrefs;
    setHelpPrefs((prev) => ({ ...prev, journal_seeded: true }));
    try {
      const parsed = await putProfile({
        help_preferences: { journal_seeded: true },
      });
      applyHelpPreferencesFromPayload(parsed);
      return true;
    } catch (e) {
      setHelpPrefs(previous);
      setProfileErrorFromException(e);
      return false;
    }
  }

  // Reset all seen flags so every page tour auto-launches again (Settings
  // "Replay walkthroughs"). Clears local state and overwrites the server map.
  async function replayWalkthroughs() {
    if (!isAuthed) return false;
    const previous = helpPrefs;
    setProfileError("");
    const cleared = WALKTHROUGH_PAGE_KEYS.reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {});
    setHelpPrefs((prev) => ({ ...prev, walkthroughs_seen: {} }));
    try {
      const parsed = await putProfile({
        help_preferences: { walkthroughs_seen: cleared },
      });
      applyHelpPreferencesFromPayload(parsed);
      return true;
    } catch (e) {
      setHelpPrefs(previous);
      setProfileErrorFromException(e);
      return false;
    }
  }

  // Snooze ("remind me later") or dismiss ("delete alert") an in-app alert.
  // Optimistic + merge-patched to the server (per-alert-id) so it sticks across
  // sessions and devices.
  async function saveAlertAction(alertId, action, resurfaceValue) {
    if (!isAuthed || !alertId) return false;
    const patch =
      action === "snooze"
        ? {
            status: "snoozed",
            snoozed_until: new Date(
              Date.now() + ALERT_SNOOZE_DAYS * 24 * 60 * 60 * 1000,
            ).toISOString(),
          }
        : { status: "dismissed" };
    // Record the count at silence-time so a count-driven alert (story requests)
    // can resurface when MORE arrive, while staying quiet for the acknowledged ones.
    if (typeof resurfaceValue === "number" && Number.isFinite(resurfaceValue)) {
      patch.count = resurfaceValue;
    }
    const previous = alertsState;
    setAlertsState((prev) => ({ ...prev, [alertId]: { ...patch } }));
    setProfileError("");
    try {
      const parsed = await putProfile({ alerts: { [alertId]: patch } });
      applyAlertsFromPayload(parsed);
      return true;
    } catch (e) {
      setAlertsState(previous);
      setProfileErrorFromException(e);
      return false;
    }
  }

  // A trusted contact (account executor) exists once both name and email are set
  // (any invite status counts). Drives the "add a trusted contact" alert.
  const hasAccountExecutor = Boolean(
    (accountExecutor?.name || "").trim() && (accountExecutor?.email || "").trim(),
  );
  // Alerts to surface right now: eligible by trigger, minus dismissed/snoozed.
  // Suppressed until the user is past onboarding and has app access.
  const activeAlerts = useMemo(() => {
    if (!isAuthed || accessBlocked || onboardingRequired) return [];
    return resolveActiveAlerts(
      {
        nowMs: Date.now(),
        signupAt,
        hasExecutor: hasAccountExecutor,
        pendingStoryRequests,
        fulfilledStoryRequests,
      },
      alertsState,
    );
  }, [
    isAuthed,
    accessBlocked,
    onboardingRequired,
    signupAt,
    hasAccountExecutor,
    pendingStoryRequests,
    fulfilledStoryRequests,
    alertsState,
  ]);

  // ---- Voice-to-text dictation (Phase 1: transient, no storage) ----
  const STT_MAX_RECORD_MS = 180000; // 3-minute cap

  function pickRecorderMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const c of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(c)) return c;
      } catch {
        /* ignore */
      }
    }
    return "";
  }

  function releaseRecordingStream() {
    if (recordStopTimerRef.current) {
      clearTimeout(recordStopTimerRef.current);
      recordStopTimerRef.current = null;
    }
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    setIsRecording(false);
  }

  async function finalizeRecording() {
    const chunks = recordedChunksRef.current;
    recordedChunksRef.current = [];
    const recorder = mediaRecorderRef.current;
    const mimeType = recorder?.mimeType || "audio/webm";
    releaseRecordingStream();
    mediaRecorderRef.current = null;
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) return;
    setSttBusy(true);
    setSttError("");
    try {
      const { text } = await transcribeAudio({ blob, mimeType });
      const clean = (text || "").trim();
      if (!clean) {
        setSttError("Didn't catch that — try speaking again.");
        return;
      }
      setMessage((prev) => {
        const base = prev || "";
        const joiner = base && !/\s$/.test(base) ? " " : "";
        return (base + joiner + clean).slice(0, CHAT_MESSAGE_MAX_CHARS);
      });
      requestAnimationFrame(() => {
        const el = messageInputRef.current;
        if (el) {
          el.focus();
          autoResizeMessageInput(el);
        }
      });
    } catch (e) {
      const code = e?.message || "";
      if (code === "voice_features_not_enabled" || e?.status === 403) {
        setSttError("Enable voice features in Settings to use voice input.");
      } else if (code === "stt_timeout" || e?.status === 504) {
        setSttError("That clip was too long to transcribe. Try a shorter one.");
      } else if (code === "audio_too_large" || e?.status === 413) {
        setSttError("That recording was too long. Try a shorter clip.");
      } else if (code === "rate_limited" || e?.status === 429) {
        setSttError("Too many voice requests. Try again shortly.");
      } else {
        setSttError("Couldn't transcribe the audio. Please try again.");
      }
    } finally {
      setSttBusy(false);
    }
  }

  async function startRecording() {
    if (!voiceFeaturesEnabled || isRecording || sttBusy) return;
    setSttError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setSttError("Voice input isn't supported in this browser.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setSttError(
        e?.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Couldn't access the microphone.",
      );
      return;
    }
    const mimeType = pickRecorderMimeType();
    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    mediaStreamRef.current = stream;
    mediaRecorderRef.current = recorder;
    recordedChunksRef.current = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      void finalizeRecording();
    };
    try {
      recorder.start();
    } catch {
      releaseRecordingStream();
      mediaRecorderRef.current = null;
      setSttError("Couldn't start recording. Please try again.");
      return;
    }
    setIsRecording(true);
    recordStopTimerRef.current = window.setTimeout(() => {
      stopRecording();
    }, STT_MAX_RECORD_MS);
  }

  function toggleRecording() {
    if (isRecording) stopRecording();
    else void startRecording();
  }

  // Release the mic and any pending auto-stop timer on unmount.
  useEffect(() => {
    return () => {
      if (recordStopTimerRef.current) clearTimeout(recordStopTimerRef.current);
      const stream = mediaStreamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Persist Kinin's voice choice from the chat-strip quick-switch without going
  // through the full saveProfile pipeline. Optimistic: the caller flips the
  // selection first. On failure we revert the selection so the UI never lies,
  // and surface a concise (chat-context) banner rather than failing silently.
  async function saveVoicePreferences(voiceUuid) {
    if (!isAuthed) return false;
    const next = (voiceUuid || "").trim();
    if (!next) return false;
    // ttsVoiceUuidRef lags one render, so at call time it still holds the
    // value from before the caller's optimistic setTtsVoiceUuid().
    const previous = ttsVoiceUuidRef.current;
    try {
      const parsed = await putProfile({ voice_preferences: { voice_uuid: next } });
      applyVoicePreferencesFromPayload(parsed);
      return true;
    } catch {
      if (previous && previous !== next) setTtsVoiceUuid(previous);
      setError("Couldn't save your voice choice. Please try again.");
      return false;
    }
  }

  async function updateOnboardingStep(step) {
    if (!isAuthed) return false;
    setOnboardingBusy(true);
    try {
      const parsed = await putProfile({ onboarding: { current_step: Number(step) } });
      applyProfilePayload(parsed);
      return true;
    } catch (e) {
      setProfileErrorFromException(e);
      return false;
    } finally {
      setOnboardingBusy(false);
    }
  }

  // Per-section save: account executor slice only. sendInvite controls whether
  // Cognito/SES emails the invite. Returns true on success.
  async function saveAccountExecutor({ sendInvite = true, notice = "" } = {}) {
    setProfileError("");
    setProfileNotice("");
    if (!isAuthed) return false;
    const validation = validateExecutorDraft();
    if (!validation.ok) {
      setProfileError(validation.message);
      return false;
    }
    if (!validation.hasAny) {
      setProfileError("Enter your trusted contact's name and email.");
      return false;
    }
    setProfileBusy(true);
    try {
      const parsed = await putProfile({
        account_executor: {
          name: validation.draft.name,
          email: validation.draft.email,
          send_invite: !!sendInvite,
        },
      });
      applyAccountExecutorFromPayload(parsed);
      setProfileNotice(
        notice || (sendInvite ? "Trusted contact saved and invited." : "Trusted contact saved."),
      );
      return true;
    } catch (e) {
      setProfileErrorFromException(e);
      return false;
    } finally {
      setProfileBusy(false);
    }
  }

  async function resendAccountExecutorInvite() {
    const validation = validateExecutorDraft();
    const statusNorm = (accountExecutor?.status || "").trim().toLowerCase();
    const hasInviteBeenSent =
      !!accountExecutor?.last_invite_sent_at || statusNorm === "pending" || statusNorm === "confirmed";
    const firstSend = !hasInviteBeenSent;
    if (!validation.ok) {
      setProfileError(validation.message || "Please complete account executor details before sending an invite.");
      return;
    }
    if (!validation.hasAny) {
      setProfileError("Enter account executor details before sending an invite.");
      return;
    }
    await saveAccountExecutor({
      sendInvite: true,
      notice: firstSend
        ? "Account executor invitation email sent."
        : "Account executor invitation email resent.",
    });
  }

  async function removeAccountExecutor() {
    setProfileError("");
    if (!isAuthed) return;
    setProfileBusy(true);
    try {
      const parsed = await putProfile({ account_executor: null });
      applyProfilePayload(parsed);
      setProfileNotice("Account executor removed.");
    } catch (e) {
      setProfileErrorFromException(e);
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

  async function submitContact() {
    setContactStatus("");
    setContactBusy(true);
    try {
      const email = (contactEmail || "").trim();
      const messageText = (contactMessage || "").trim();
      if (!email) {
        throw new Error("Please enter your email.");
      }
      if (!messageText) {
        throw new Error("Please enter a message.");
      }
      const payload = {
        name: (contactName || "").trim() || undefined,
        email,
        message: messageText,
      };
      const res = await fetch(`${API_BASE}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API error ${res.status}: ${t}`);
      }
      setContactMessage("");
      setContactStatus("Thanks - we received your message.");
    } catch (e) {
      setContactStatus(e.message || String(e));
    } finally {
      setContactBusy(false);
    }
  }

  async function onOnboardingBack() {
    const step = Number(onboardingStatus?.current_step || 1);
    if (step <= 1) return;
    await updateOnboardingStep(step - 1);
  }

  async function onOnboardingContinue() {
    setProfileError("");
    const step = Number(onboardingStatus?.current_step || 1);
    if (step === 1) {
      await updateOnboardingStep(2);
      return;
    }
    if (step === 2) {
      // Save bio profile, then advance to the final step (reminder cadence).
      await saveProfile({
        closeAfterSave: false,
        navigateAfterSave: false,
        onboardingStep: 3,
      });
      return;
    }
  }

  async function onOnboardingBegin() {
    const ok = await saveProfile({
      closeAfterSave: false,
      navigateAfterSave: false,
      onboardingStep: 3,
      markOnboardingCompleted: true,
    });
    if (!ok) return;
    navigateToPage("interview");
  }

  function onOnboardingPreviewBack() {
    setOnboardingPreview((prev) => ({
      ...prev,
      step: Math.max(1, Number(prev.step || 1) - 1),
    }));
  }

  function onOnboardingPreviewContinue() {
    setOnboardingPreview((prev) => ({
      ...prev,
      step: Math.min(3, Number(prev.step || 1) + 1),
    }));
  }

  function onOnboardingPreviewBegin() {
    navigateToPage("admin");
  }

  return (
    <div className="km-app-shell">
      {showNavigation && isAuthed ? (
        <div className="km-top-widgets">
          <AlertsMenu
            alerts={activeAlerts}
            onCta={(alert) => {
              if (alert?.cta?.page) navigateToPage(alert.cta.page);
            }}
            onSnooze={(alert) => {
              void saveAlertAction(alert.id, "snooze", alert.resurfaceValue);
            }}
            onDismiss={(alert) => {
              void saveAlertAction(alert.id, "dismiss", alert.resurfaceValue);
            }}
          />
          <HelpMenu
            hasTour={pageHasTour(activePage)}
            hasClip={HELP_CLIPS_ENABLED && Boolean(getWalkthrough(activePage)?.clip)}
            canAsk={isAuthed && !accessBlocked}
            onOpenMenu={() => {
              if (tourRun) handleTourDone();
            }}
            onShowTour={() => launchTour(activePage)}
            onAskKinin={() => openHelpMode()}
            onWatchClip={() => openClip(activePage)}
          />
        </div>
      ) : null}
      {showNavigation ? (
        <Walkthrough steps={tourSteps} run={tourRun} onDone={handleTourDone} />
      ) : null}
      {clipPage ? (
        <ClipLightbox
          clip={getWalkthrough(clipPage)?.clip}
          onClose={() => setClipPage("")}
        />
      ) : null}
      {showNavigation ? (
      <aside className={`km-sidebar ${menuOpen ? "is-open" : ""}`} ref={sidebarRef}>
        <button
          type="button"
          className="km-sidebar-brand"
          onClick={() => {
            setMenuOpen(false);
            setShowProfile(false);
            setMenuOverflowOpen(false);
            navigateToPage("interview");
          }}
        >
          <img src={kininHomeIcon} alt="Kinin" />
          <span className="km-sidebar-wordmark">Kinin</span>
        </button>
        <div className="km-sidebar-divider" />
        {/* Only the primary nav items scroll when the viewport is short, so the
            pinned "+" menu, admin links, and bottom account/settings section
            can never slide off the bottom of the window. The "+" popover
            escapes to the right and needs overflow:visible, so it stays out of
            this scroll container. */}
        <div className="km-sidebar-scroll">
          {primaryTopItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className="km-sidebar-item"
                onClick={() => {
                  setMenuOpen(false);
                  setMenuOverflowOpen(false);
                  item.onClick();
                }}
              >
                {Icon ? <Icon className="km-sidebar-icon" size={20} strokeWidth={1.5} /> : null}
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="km-sidebar-overflow-toggle">
          <button
            type="button"
            className="km-sidebar-item"
            onClick={() => setMenuOverflowOpen((prev) => !prev)}
          >
            <CirclePlus className="km-sidebar-icon" size={20} strokeWidth={1.5} />
          </button>
          {menuOverflowOpen ? (
            <div className="km-sidebar-popover">
              {visibleExtraMenuItems.map((item) => {
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="km-sidebar-item"
                    onClick={() => {
                      setMenuOpen(false);
                      setMenuOverflowOpen(false);
                      item.onClick();
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        {adminTopItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="km-sidebar-item"
              onClick={() => {
                setMenuOpen(false);
                setMenuOverflowOpen(false);
                item.onClick();
              }}
            >
              {Icon ? <Icon className="km-sidebar-icon" size={20} strokeWidth={1.5} /> : null}
              {item.label}
            </button>
          );
        })}
        <div className="km-sidebar-spacer" />
        <div>
          {!isAuthed ? (
            <div className="km-sidebar-auth">
              <button
                type="button"
                className="km-sidebar-item is-signin"
                onClick={() => {
                  setMenuOpen(false);
                  onLogin();
                }}
              >
                <CircleUserRound className="km-sidebar-icon" size={20} strokeWidth={1.5} />
                My Account
              </button>
              {GOOGLE_LOGIN_ENABLED ? (
                <button
                  type="button"
                  className="km-sidebar-item is-signin"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogin(GOOGLE_PROVIDER_NAME);
                  }}
                >
                  <CircleUserRound className="km-sidebar-icon" size={20} strokeWidth={1.5} />
                  Continue with Google
                </button>
              ) : null}
            </div>
          ) : (
            <div className="km-sidebar-account">
              <div className="km-sidebar-muted">{navDisplayName || "Signed in"}</div>
              <div className="km-sidebar-divider km-sidebar-divider-tight" />
              <button
                type="button"
                className="km-sidebar-item is-bottom"
                onClick={() => {
                  setMenuOpen(false);
                  openProfile();
                }}
              >
                <CircleUserRound className="km-sidebar-icon" size={18} strokeWidth={1.5} />
                My Account
              </button>
              <div className="km-sidebar-divider km-sidebar-divider-tight" />
              <button
                type="button"
                className="km-sidebar-item is-bottom"
                onClick={() => {
                  setMenuOpen(false);
                  navigateToPage("settings");
                }}
              >
                <SettingsIcon className="km-sidebar-icon" size={18} strokeWidth={1.5} />
                Settings
              </button>
              <div className="km-sidebar-divider km-sidebar-divider-tight" />
              <button
                type="button"
                className="km-sidebar-item is-bottom is-centered"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        {visibleBottomItems.length ? <div className="km-sidebar-divider" /> : null}
        {visibleBottomItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className="km-sidebar-item is-bottom"
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
      ) : null}
      <main className={`km-main ${showNavigation ? "" : "km-main-no-sidebar"}`}>
        {showNavigation ? (
        <div className="km-topbar">
          <button type="button" className="km-menu-toggle" onClick={() => setMenuOpen(true)}>
            <Menu size={22} strokeWidth={1.5} />
            Kinin
          </button>
          {!isAuthed ? (
            <button
              type="button"
              className="km-btn km-btn-ghost km-btn-sm km-topbar-signin"
              onClick={() => onLogin()}
              disabled={isSigningIn}
            >
              {isSigningIn ? (
                <Spinner />
              ) : (
                <CircleUserRound size={15} strokeWidth={1.6} />
              )}
              Sign in
            </button>
          ) : null}
        </div>
        ) : null}
        {(
          activePage === "admin" ||
          activePage === "admin-onboarding-preview" ||
          activePage === "admin-crm" ||
          activePage === "admin-metrics" ||
          activePage === "admin-metrics-overview" ||
          activePage === "admin-metrics-cost" ||
          activePage === "admin-metrics-engagement" ||
          activePage === "admin-metrics-users" ||
          activePage === "admin-metrics-performance" ||
          activePage === "admin-metrics-pricing" ||
          activePage === "admin-user-purge" ||
          activePage === "admin-theme" ||
          activePage === "admin-email"
        ) ? (
          <AdminNav activePage={activePage} setActivePage={navigateToPage} />
        ) : null}
        {activePage === "admin-theme" ? (
          <AdminThemeStudioPage />
        ) : activePage === "admin-email" ? (
          <AdminEmailStudioPage
            isAuthed={isAuthed}
            getAccessToken={getAccessToken}
            apiBase={API_BASE}
          />
        ) : (
        <div
          style={{
            maxWidth: 900,
            margin: "20px auto 40px",
            padding: 16,
          }}
        >
          <div className="km-chat-header">
            <img src={kininHomeIcon} alt="Kinin" className="km-chat-header-icon" />
            <div className="km-chat-header-wordmark">Kinin</div>
            <div className="km-chat-header-rule" />
            <div className="km-chat-header-tag">— a living biography, in conversation.</div>
            {isAuthed && activePage === "interview" && chat.length > 0 ? (
              <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {/* "Start a new conversation" is hidden for now but kept wired
                    (endSession) in case we bring it back. */}
                {SHOW_START_NEW_CONVERSATION ? (
                  <button
                    type="button"
                    className="km-btn km-btn-ghost km-btn-sm"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                    onClick={endSession}
                    disabled={busy || isEndingSession}
                    title="Start a fresh conversation. This won't log you out or delete anything."
                  >
                    {isEndingSession ? <Spinner /> : <CirclePlus size={14} strokeWidth={1.5} />} Start a new conversation
                  </button>
                ) : null}
                <button
                  type="button"
                  className="km-btn km-btn-ghost km-btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  onClick={openTopicChooser}
                  disabled={busy || isEndingSession || topicChooserOpen}
                  title="Switch to a different topic. Your current one is set aside, not lost."
                >
                  <Compass size={14} strokeWidth={1.5} /> Switch Topics
                </button>
              </div>
            ) : null}
          </div>

          {topicChooserOpen ? (
            <TopicChooser
              loading={topicChoicesLoading}
              error={topicChoicesError}
              choices={topicChoices}
              switchingStepId={switchingTopicStepId}
              submittingCustom={submittingCustomTopic}
              onChoose={chooseTopic}
              onSubmitCustom={chooseCustomTopic}
              onClose={closeTopicChooser}
            />
          ) : null}

      {sessionExpired && !isAuthed ? (
        <Banner tone="info">
          <div>
            <div>
              <strong>Your session expired.</strong> Sign in again to continue.
            </div>
            <div style={{ marginTop: 10 }}>
              <Button variant="primary" onClick={() => onLogin()} disabled={isSigningIn}>
                Sign in
              </Button>
            </div>
          </div>
        </Banner>
      ) : null}

      {error && (
        <Banner tone="danger">
          <span>
            <strong>Something went wrong.</strong> {error}
          </span>
        </Banner>
      )}

      {!isAuthed && biographyInvite ? (
        <Banner tone="info">
          <div>
            <div>
              <strong>
                {biographyInvite.from
                  ? `${biographyInvite.from} invited you to explore their biography on Kinin.`
                  : "You've been invited to explore a biography on Kinin."}
              </strong>
            </div>
            <div style={{ marginTop: 6 }}>
              Kinin lets you talk with a loved one&apos;s memories, in their own
              voice. Create your free account
              {biographyInvite.email ? (
                <> using <strong>{biographyInvite.email}</strong></>
              ) : null}{" "}
              to start exploring.
            </div>
            <div style={{ marginTop: 10 }}>
              <Button variant="primary" onClick={() => onLogin()} disabled={isSigningIn}>
                Create your free account
              </Button>
            </div>
          </div>
        </Banner>
      ) : null}

      {isEndingSession ? (
        <Banner tone="info">
          <Spinner />
          <span>Ending session...</span>
        </Banner>
      ) : null}

      {accessBlocked ? (
        <Banner tone="info">
          <div>
            <div><strong>Sorry, Kinin app use is by invite only at this time.</strong></div>
            <div style={{ marginTop: 6 }}>
              If you believe you are receiving this message in error, or you would like to be considered for
              early access, please email <a href="mailto:Jesse@kinin.ai">Jesse@kinin.ai</a>.
            </div>
          </div>
        </Banner>
      ) : null}

      {activePage === "admin" && !IS_BETA_LITE ? (
        <AdminHomePage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          setActivePage={navigateToPage}
        />
      ) : activePage === "faq" ? (
        <FaqPage isAuthed={isAuthed} navigateToPage={navigateToPage} />
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
      ) : activePage === "contact" ? (
        <ContactPage
          contactName={contactName}
          setContactName={setContactName}
          contactEmail={contactEmail}
          setContactEmail={setContactEmail}
          contactMessage={contactMessage}
          setContactMessage={setContactMessage}
          contactBusy={contactBusy}
          contactStatus={contactStatus}
          submitContact={submitContact}
        />
      ) : activePage === "about" ? (
        <AboutKininPage />
      ) : activePage === "privacy" ? (
        <PrivacyPage />
      ) : activePage === "review-chats" ? (
        <ReviewEditChatsPage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          userDisplayName={navDisplayName || "You"}
        />
      ) : activePage === "pins" ? (
        <PinsPage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          onStartChatFromPin={startChatFromPin}
          onStartJournalFromPin={startJournalFromPin}
          startingPinId={startingPinId}
          startingJournalPinId={startingJournalPinId}
        />
      ) : activePage === "journal" ? (
        <JournalPage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          voiceFeaturesEnabled={voiceFeaturesEnabled}
          openEntryId={journalOpenEntryId}
          onEntryOpened={() => setJournalOpenEntryId("")}
          seedFirstEntry={
            onboardingChecked && helpPrefs.tips_enabled && !helpPrefs.journal_seeded
          }
          onMarkSeeded={markJournalSeeded}
          tourNonce={journalTourNonce}
          onReadyForTour={() => startTour("journal")}
        />
      ) : activePage === "biographies" ? (
        <BiographiesPage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          streamWsUrl={BIOGRAPHY_STREAMING_ENABLED ? STREAM_WS_URL : ""}
          openOwnerId={biographyOpenOwnerId}
          onOwnerOpened={() => setBiographyOpenOwnerId("")}
          onUpgraded={() => navigateToPage("interview")}
          onPersonaOpen={handleBiographyPersonaOpen}
        />
      ) : activePage === "family-circle" ? (
        <FamilyCirclePage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          biographyEnabled={biographySettings?.enabled !== false}
          isReader={isReader}
          onManageSharing={() => navigateToPage("settings-biographies")}
          onStoryRequestsSeen={() => setFulfilledStoryRequests(0)}
          onOpenBiography={(ownerId) => {
            const id = String(ownerId || "").trim();
            if (!id) return;
            setBiographyOpenOwnerId(id);
            navigateToPage("biographies");
          }}
        />
      ) : activePage === "unsubscribe" ? (
        <UnsubscribePage apiBase={API_BASE} />
      ) : activePage === "executor-accept" ? (
        <ExecutorAcceptPage apiBase={API_BASE} />
      ) : activePage === "confirm" ? (
        <ConfirmEmailPage />
      ) : activePage === "admin-crm" ? (
        <AdminCrmPage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
        />
      ) : activePage === "admin-metrics" ? (
        <AdminMetricsIndexPage setActivePage={navigateToPage} />
      ) : activePage === "admin-metrics-overview" ? (
        <AdminMetricsOverviewPage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          setActivePage={navigateToPage}
        />
      ) : activePage === "admin-metrics-cost" ? (
        <AdminMetricsCostPage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          setActivePage={navigateToPage}
        />
      ) : activePage === "admin-metrics-engagement" ? (
        <AdminMetricsEngagementPage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          setActivePage={navigateToPage}
        />
      ) : activePage === "admin-metrics-users" ? (
        <AdminMetricsUsersPage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          setActivePage={navigateToPage}
        />
      ) : activePage === "admin-metrics-performance" ? (
        <AdminMetricsPerformancePage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          setActivePage={navigateToPage}
        />
      ) : activePage === "admin-metrics-pricing" ? (
        <AdminMetricsPricingPage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          setActivePage={navigateToPage}
        />
      ) : activePage === "admin-user-purge" ? (
        <AdminUserPurgePage
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={API_BASE}
          setActivePage={navigateToPage}
        />
      ) : activePage === "onboarding" ? (
        <OnboardingPage
          onboardingStep={Number(onboardingStatus?.current_step || 1)}
          bioProfile={bioProfile}
          setBioProfile={setBioProfile}
          continuitySettings={continuitySettings}
          setContinuitySettings={setContinuitySettings}
          busy={profileBusy || onboardingBusy}
          profileError={profileError}
          onBack={onOnboardingBack}
          onContinue={onOnboardingContinue}
          onBegin={onOnboardingBegin}
        />
      ) : activePage === "admin-onboarding-preview" ? (
        <OnboardingPage
          onboardingStep={Number(onboardingPreview.step || 1)}
          bioProfile={onboardingPreview.bioProfile}
          setBioProfile={(next) =>
            setOnboardingPreview((prev) => ({
              ...prev,
              bioProfile: typeof next === "function" ? next(prev.bioProfile) : next,
            }))
          }
          continuitySettings={onboardingPreview.continuitySettings}
          setContinuitySettings={(next) =>
            setOnboardingPreview((prev) => ({
              ...prev,
              continuitySettings:
                typeof next === "function" ? next(prev.continuitySettings) : next,
            }))
          }
          busy={false}
          onBack={onOnboardingPreviewBack}
          onContinue={onOnboardingPreviewContinue}
          onBegin={onOnboardingPreviewBegin}
          previewMode
          beginLabel="Back to Admin"
        />
      ) : activePage === "account" ? (
        <MyAccountPage
          profileSchema={profileSchema}
          bioProfile={bioProfile}
          setBioProfile={setBioProfile}
          accountExecutor={accountExecutor}
          setAccountExecutor={setAccountExecutor}
          profileBusy={profileBusy}
          profileNotice={profileNotice}
          profileError={profileError}
          security={{
            email: cognitoEmail,
            isFederatedUser,
            emailForm,
            setEmailForm,
            emailStage,
            emailBusy,
            emailError,
            emailNotice,
            requestEmailChange,
            confirmEmailChange,
            resendEmailChangeCode,
            cancelEmailChange,
            passwordForm,
            setPasswordForm,
            passwordBusy,
            passwordError,
            passwordNotice,
            changePassword,
          }}
          saveBioProfile={saveBioProfile}
          saveAccountExecutor={saveAccountExecutor}
          resendAccountExecutorInvite={resendAccountExecutorInvite}
          removeAccountExecutor={removeAccountExecutor}
          onOpenDangerZone={() => navigateToPage("danger-zone")}
          onClose={() => {
            setShowProfile(false);
            navigateToPage("interview");
          }}
        />
      ) : activePage.startsWith("settings") ? (
        <SettingsPage
          category={SETTINGS_PAGE_TO_CATEGORY[activePage] || null}
          categories={SETTINGS_CATEGORIES}
          onNavigateCategory={(page) => navigateToPage(page)}
          onClose={() => navigateToPage("interview")}
          profileBusy={profileBusy}
          profileNotice={profileNotice}
          profileError={profileError}
          ttsVoiceUuid={ttsVoiceUuid}
          setTtsVoiceUuid={(uuid) => {
            setTtsVoiceUuid(uuid);
            void saveVoicePreferences(uuid);
          }}
          voiceFeaturesEnabled={voiceFeaturesEnabled}
          saveVoiceFeaturesEnabled={saveVoiceFeaturesEnabled}
          continuitySettings={continuitySettings}
          saveReminderCadence={saveReminderCadence}
          biographySettings={biographySettings}
          saveBiographyEnabled={saveBiographyEnabled}
          onManageFamilyCircle={() => navigateToPage("family-circle")}
          helpTipsEnabled={helpPrefs.tips_enabled !== false}
          saveHelpTipsEnabled={saveHelpTipsEnabled}
          replayWalkthroughs={replayWalkthroughs}
          apiBase={API_BASE}
          getAccessToken={getAccessToken}
          interviewDetails={{
            isAuthed,
            busy,
            sessionId,
            setSessionId,
            detailsBusy,
            updateInterviewDetails,
            journeyVersion,
            labelGroups,
            progressForDisplay,
            uiState,
          }}
        />
      ) : activePage === "danger-zone" ? (
        <AccountPage
          isAuthed={isAuthed}
          accountUsername={accountUsername}
          accountEmail={cognitoEmail}
          accountPassword={accountPassword}
          setAccountPassword={setAccountPassword}
          accountConfirmText={accountConfirmText}
          setAccountConfirmText={setAccountConfirmText}
          accountBusy={accountBusy}
          accountStatus={accountStatus}
          accountError={accountError}
          closeAccount={closeAccount}
          onBack={() => openProfile()}
        />
      ) : activePage === "help" ? (
        <HelpMode
          messages={helpChat}
          busy={helpBusy}
          disabled={!isAuthed || !!accessBlocked}
          onSend={(t) => sendHelp(t)}
          onExit={exitHelpMode}
          maxChars={CHAT_MESSAGE_MAX_CHARS}
        />
      ) : (
        <div>
          <div className="km-chat-surface km-chat" data-help-anchor="interview-chat">
            {chat.length === 0 ? (
              isStartingSession ? (
                <div className="km-chat-loading">
                  <Skeleton />
                  <Skeleton short />
                  <div className="km-chat-loading-tag">Preparing your interview...</div>
                </div>
              ) : isAuthed ? (
                <div className="km-chat-empty">Start chatting to begin your interview.</div>
              ) : (
                <div className="km-chat-empty">
                  <div className="km-chat-empty-title">
                    Start chatting after signing in.
                  </div>
                  <div className="km-chat-empty-cta">
                    <button
                      type="button"
                      className="km-btn km-btn-primary"
                      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                      onClick={() => onLogin()}
                      disabled={isSigningIn}
                    >
                      {isSigningIn ? (
                        <Spinner />
                      ) : (
                        <CircleUserRound size={18} strokeWidth={1.6} />
                      )}
                      Sign in to start
                    </button>
                    {GOOGLE_LOGIN_ENABLED ? (
                      <button
                        type="button"
                        className="km-btn km-btn-ghost"
                        onClick={() => onLogin(GOOGLE_PROVIDER_NAME)}
                        disabled={isSigningIn}
                      >
                        Continue with Google
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            ) : (
              chat.map((m, idx) => (
                <ChatRow key={m.id ?? idx} role={m.role}>
                  {m.role === "assistant" && isSendingTurn && !m.content ? (
                    <TypingDots />
                  ) : (
                    <>
                      {m.content}
                      {m.metaSuggestion ? (
                        <div className="km-meta-offer">
                          <button
                            type="button"
                            className="km-meta-offer-btn"
                            onClick={() => enterHelpModeFromOffer(m.metaSuggestion)}
                          >
                            Ask on the Kinin Help page
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </ChatRow>
              ))
            )}
          </div>

          <div className="km-chat-input-row" data-help-anchor="interview-composer">
            <textarea
              ref={messageInputRef}
              value={
                dictation.listening && dictation.interim
                  ? joinText(message, dictation.interim)
                  : message
              }
              onChange={(e) => {
                const nextMessage = e.target.value.slice(0, CHAT_MESSAGE_MAX_CHARS);
                // Typing while dictating hands control back to the keyboard:
                // stop the stream and keep whatever is now in the box.
                if (dictationSupported && dictation.listening) dictation.stop();
                setMessage(nextMessage);
                autoResizeMessageInput(e.target);
              }}
              onInput={(e) => autoResizeMessageInput(e.target)}
              placeholder={
                isAuthed
                  ? "Type a message..."
                  : "Currently logged out..."
              }
              className="km-chat-input"
              maxLength={CHAT_MESSAGE_MAX_CHARS}
              rows={1}
              disabled={!isAuthed || busy || !!accessBlocked}
            />
            {voiceFeaturesEnabled ? (
              (() => {
                const micActive = dictationSupported ? dictation.listening : isRecording;
                const micBusy = !dictationSupported && sttBusy;
                const micTitle = micBusy
                  ? "Transcribing..."
                  : micActive
                    ? dictationSupported
                      ? "Stop dictation"
                      : "Stop and transcribe"
                    : dictationSupported
                      ? "Speak your message (live)"
                      : "Speak your message";
                return (
                  <button
                    type="button"
                    data-help-anchor="interview-voice"
                    onClick={dictationSupported ? dictation.toggle : toggleRecording}
                    disabled={!isAuthed || busy || !!accessBlocked || micBusy}
                    title={micTitle}
                    aria-label={micTitle}
                    aria-pressed={micActive}
                    className={`km-mic-btn${
                      micActive ? " km-mic-btn-recording" : ""
                    }${micBusy ? " km-mic-btn-busy" : ""}`}
                  >
                    {micBusy ? (
                      <Spinner />
                    ) : micActive ? (
                      <Square size={18} />
                    ) : (
                      <Mic size={20} />
                    )}
                  </button>
                );
              })()
            ) : null}
            <Button
              variant="primary"
              onClick={sendTurn}
              disabled={!isAuthed || busy || !!accessBlocked}
            >
              {isSendingTurn ? "Sending..." : "Send"}
            </Button>
          </div>
          {voiceFeaturesEnabled &&
          (dictation.listening || isRecording || sttBusy || sttError) ? (
            <div
              className="km-voice-error-note"
              role="status"
              aria-live="polite"
            >
              {dictationSupported && dictation.connecting
                ? "Connecting…"
                : dictationSupported && dictation.listening
                  ? "Voice to Text is active..."
                  : sttBusy
                    ? "Transcribing…"
                    : isRecording
                      ? "Recording… tap the stop button when you're done (3 min max)."
                      : sttError}
            </div>
          ) : null}

          {chatPin ? (
            <div className="km-chat-pin-note">
              <MapPin size={14} strokeWidth={1.5} style={{ flexShrink: 0, color: "var(--ink-soft)" }} />
              <span className="km-chat-pin-note-label">Chat from Pin:</span>
              <span className="km-chat-pin-note-text" style={{ flex: 1, minWidth: 120 }}>
                {chatPin.text
                  ? chatPin.text.length > 90
                    ? `${chatPin.text.slice(0, 87)}…`
                    : chatPin.text
                  : "your pinned memory"}
              </span>
              {chatPinCompleted ? (
                <span
                  className="km-mono-label"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Check size={14} strokeWidth={2} /> Completed
                </span>
              ) : (
                <Button
                  size="sm"
                  onClick={markChatPinComplete}
                  disabled={!isAuthed || completingChatPin}
                >
                  {completingChatPin ? <Spinner /> : <Check size={15} strokeWidth={1.5} />} Mark Pin Complete
                </Button>
              )}
            </div>
          ) : null}

          {/* Chat-session control strip. New per-session toggles
              (voice, future autoplay, transcript-only, etc.) live here.
              Right-aligned so the first toggle sits under the Send button;
              additional toggles fan out leftward. */}
          <div className="km-chat-controls">
            {voiceEnabled ? (
              <div
                className="km-voice-quickswitch"
                role="group"
                aria-label="Kinin voice"
              >
                {QUICK_SWITCH_UUIDS.map((uuid) => {
                  const v = VOICE_OPTIONS.find((opt) => opt.uuid === uuid);
                  if (!v) return null;
                  const selected = ttsVoiceUuid === v.uuid;
                  const label = `Kinin Voice - ${v.name}`;
                  return (
                    <button
                      key={v.uuid}
                      type="button"
                      disabled={!isAuthed}
                      onClick={() => {
                        setTtsVoiceUuid(v.uuid);
                        void saveVoicePreferences(v.uuid);
                      }}
                      title={label}
                      aria-label={label}
                      aria-pressed={selected}
                      className={`km-voice-quickbtn${
                        selected ? " km-voice-quickbtn-selected" : ""
                      }`}
                    >
                      <VoiceSilhouette type={v.silhouette} size={22} decorative />
                    </button>
                  );
                })}
              </div>
            ) : null}
            {voiceEnabled && voiceNeedsUserGesture ? (
              <button
                type="button"
                onClick={() => { void resumeVoicePlayback(); }}
                disabled={!isAuthed || voiceBusy}
                title="Kinin Voice blocked by browser autoplay — tap to play"
                aria-label="Play Kinin voice now"
                className="km-chat-toggle-fallback"
              >
                <Play size={14} />
                <span>Tap to play</span>
              </button>
            ) : null}
            <button
              type="button"
              data-help-anchor="interview-listen"
              onClick={toggleVoice}
              disabled={!isAuthed}
              title={
                voiceEnabled ? "Kinin Voice - Active" : "Kinin Voice - Muted"
              }
              aria-pressed={voiceEnabled}
              aria-label={
                voiceEnabled ? "Kinin Voice - Active" : "Kinin Voice - Muted"
              }
              className={`km-chat-toggle${
                voiceEnabled ? " km-chat-toggle-active" : ""
              }${voiceBusy ? " km-chat-toggle-busy" : ""}`}
            >
              <AudioLines size={20} />
            </button>
          </div>
          {voiceEnabled && voiceError ? (
            <div
              className="km-voice-error-note"
              role="status"
              aria-live="polite"
            >
              {voiceError}
            </div>
          ) : null}
          {!IS_BETA_LITE ? (
            <details className="km-details">
              <summary className="km-details-summary">
                <span className="km-mono-label">— Interview Details</span>
                <span className="km-details-version">{VERSION_LABEL}</span>
              </summary>
              <Frame label="Interview state · debug">
                <InterviewDetailsPanel
                  isAuthed={isAuthed}
                  busy={busy}
                  sessionId={sessionId}
                  setSessionId={setSessionId}
                  detailsBusy={detailsBusy}
                  updateInterviewDetails={updateInterviewDetails}
                  journeyVersion={journeyVersion}
                  labelGroups={labelGroups}
                  progressForDisplay={progressForDisplay}
                  uiState={uiState}
                  ttsModel={ttsModel}
                  setTtsModel={setTtsModel}
                  ttsVoiceUuid={ttsVoiceUuid}
                  setTtsVoiceUuid={setTtsVoiceUuid}
                  ttsVoicePrompt={ttsVoicePrompt}
                  setTtsVoicePrompt={setTtsVoicePrompt}
                  ttsPresetUuid={ttsPresetUuid}
                  setTtsPresetUuid={setTtsPresetUuid}
                />
              </Frame>
            </details>
          ) : null}
        </div>
          )}
        </div>
        )}
      </main>
      {showNavigation && menuOpen ? (
        <div
          className="km-menu-backdrop"
          onClick={() => {
            setMenuOpen(false);
            setMenuOverflowOpen(false);
          }}
        />
      ) : null}
      {isSigningIn ? (
        <FullscreenLoader>Redirecting to sign in...</FullscreenLoader>
      ) : null}
    </div>
  );
}
