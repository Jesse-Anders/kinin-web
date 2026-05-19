import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  BookOpen,
  CircleUserRound,
  CirclePlus,
  Feather,
  Key,
  Menu,
  Play,
  Quote,
  ScrollText,
} from "lucide-react";
import kininHomeIcon from "./assets/icons/kinin-icon-390sq.png";
import {
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from "aws-amplify/auth";
import { useLocation, useNavigate } from "react-router-dom";
import FaqPage from "./pages/FaqPage";
import FeedbackPage from "./pages/FeedbackPage";
import ContactPage from "./pages/ContactPage";
import AccountPage from "./pages/AccountPage";
import KininSettingsPage from "./pages/KininSettingsPage";
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
import UnsubscribePage from "./pages/UnsubscribePage";
import OnboardingPage from "./pages/OnboardingPage";
import ExecutorAcceptPage from "./pages/ExecutorAcceptPage";
import AdminThemeStudioPage from "./pages/AdminThemeStudioPage";
import AdminEmailStudioPage from "./pages/AdminEmailStudioPage";
import InterviewDetailsPanel from "./components/InterviewDetailsPanel";
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
import { synthesizeTts, warmTts } from "./services/ttsClient";
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
const RELEASE_CHANNEL = (import.meta.env.VITE_RELEASE_CHANNEL || "dev").toLowerCase();
const IS_BETA_LITE = RELEASE_CHANNEL === "beta-lite";
const VERSION_LABEL = IS_BETA_LITE ? "Beta-lite Version 1.0" : "Dev Version 1.0";
const GOOGLE_LOGIN_ENABLED = String(import.meta.env.VITE_GOOGLE_LOGIN_ENABLED || "").toLowerCase() === "1";
const GOOGLE_PROVIDER_NAME = import.meta.env.VITE_GOOGLE_PROVIDER_NAME || "Google";
const ACCOUNT_CONFIRM_PHRASE = "delete my account and all data";
const CHAT_MESSAGE_MAX_CHARS = 4000;
const PAGE_TO_PATH = {
  interview: "/",
  about: "/about",
  faq: "/faq",
  feedback: "/feedback",
  "review-chats": "/review-chats",
  contact: "/contact",
  privacy: "/privacy",
  unsubscribe: "/unsubscribe",
  "executor-accept": "/executor/accept",
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
};
const PATH_TO_PAGE = {
  ...Object.fromEntries(Object.entries(PAGE_TO_PATH).map(([page, path]) => [path, page])),
  // Legacy aliases: the old "Settings" page is now reached under My Account.
  "/settings": "account",
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
  const [isSendingTurn, setIsSendingTurn] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [accessBlocked, setAccessBlocked] = useState(null);
  const [didStart, setDidStart] = useState(false);
  const [_showProfile, setShowProfile] = useState(false);
  const [profileSchema, setProfileSchema] = useState(null);
  const [bioProfile, setBioProfile] = useState({ preferred_name: "", date_of_birth: "" });
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
      id: "feedback",
      label: "Feedback",
      icon: Feather,
      requiresAuth: true,
      onClick: () => navigateToPage("feedback"),
    },
    {
      id: "review-chats",
      label: "Review",
      icon: ScrollText,
      requiresAuth: true,
      onClick: () => navigateToPage("review-chats"),
    },
    {
      id: "admin",
      label: "Admin",
      icon: Key,
      requiresAuth: true,
      hideForBetaLite: true,
      onClick: () => navigateToPage("admin"),
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

  function isValidDateOfBirth(value) {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const dt = new Date(`${text}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return false;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dt > today) return false;
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
  const visibleTopItems = menuItems.filter(
    (item) => item.section !== "bottom" && (isAuthed || !item.requiresAuth) && !(item.hideForBetaLite && IS_BETA_LITE)
  );
  const extraMenuItems = [
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

  useEffect(() => {
    const isRestrictedAuthPage =
      activePage === "account" ||
      activePage === "danger-zone" ||
      activePage === "onboarding" ||
      activePage === "feedback" ||
      activePage === "review-chats";
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
    if (e?.name === "AccessBlockedError" || e?.name === "OnboardingRequiredError") return;
    setError(e?.message || String(e));
  }

  function applyProfilePayload(parsed) {
    const bp = parsed?.biography_user_profile || {};
    const continuity = parsed?.continuity_settings || {};
    const onboarding = parsed?.onboarding || {};
    const executor = parsed?.account_executor || {};
    const voicePrefs = parsed?.voice_preferences;
    if (voicePrefs && typeof voicePrefs === "object") {
      const savedVoice = voicePrefs.voice_uuid;
      const known = VOICE_OPTIONS.some((v) => v.uuid === savedVoice);
      if (known && savedVoice !== ttsVoiceUuidRef.current) {
        setTtsVoiceUuid(savedVoice);
      }
    }
    setBioProfile({
      preferred_name: bp.preferred_name || "",
      date_of_birth: bp.date_of_birth || "",
    });
    setContinuitySettings({
      reminder_cadence_weeks:
        continuity.reminder_cadence_weeks === undefined || continuity.reminder_cadence_weeks === null
          ? 2
          : Number(continuity.reminder_cadence_weeks),
      reminder_channel: continuity.reminder_channel || "email",
    });
    setOnboardingStatus({
      required: onboarding.required === true,
      completed_at: onboarding.completed_at || null,
      current_step: Number(onboarding.current_step || 1),
    });
    setAccountExecutor({
      name: executor.name || "",
      email: executor.email || "",
      confirm_email: executor.email || "",
      status: executor.status || "",
      confirmed_at: executor.confirmed_at || null,
      last_invite_sent_at: executor.last_invite_sent_at || null,
    });
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
          const tokenGivenName = String(session.tokens.idToken.payload?.given_name || "").trim();
          setCognitoGivenName(tokenGivenName);
          const tokenEmail = String(session.tokens.idToken.payload?.email || "").trim();
          setCognitoEmail(tokenEmail);
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
    // Auto-start session on login to get intro + session_id without requiring a user message.
    startSession();
    setDidStart(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, onboardingChecked, onboardingRequired]);

  useEffect(() => {
    if (!user?.username) return;
    setAccountUsername(user.username);
  }, [user]);

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
    await signOut({ global: true });
    setUser(null);
    setDidStart(false);
    setChat([]);
    setOnboardingStatus({ required: false, completed_at: null, current_step: 1 });
    setOnboardingChecked(false);
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

  async function startSession() {
    setError("");
    setBusy(true);
    setIsStartingSession(true);
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
      setIsStartingSession(false);
      setBusy(false);
    }
  }

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
          if (typeof streamed.assistant === "string") {
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
          setAssistantFinal(typeof parsed.assistant === "string" ? parsed.assistant : "");
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

  async function openProfile() {
    setError("");
    setProfileNotice("");
    setShowProfile(true);
    navigateToPage("account");
    if (!isAuthed) {
      setError("Please sign in to view your profile.");
      return;
    }
    setProfileBusy(true);
    try {
      await loadProfileState({ includeSchema: true });
      setAccessBlocked(null);
    } catch (e) {
      setTopErrorFromException(e);
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
    setError("");
    if (!isAuthed) return;
    setProfileBusy(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");

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
      setTopErrorFromException(e);
      return false;
    } finally {
      setProfileBusy(false);
    }
  }

  // Persist a single voice choice without going through the full saveProfile
  // pipeline. Used by the chat-strip quick-switch and the Settings page voice
  // picker so the user's pick survives across devices. Fire-and-forget: a
  // failure is logged but does not surface a top error (the UI already
  // reflects the new state via optimistic update).
  async function saveVoicePreferences(voiceUuid) {
    if (!isAuthed) return false;
    const next = (voiceUuid || "").trim();
    if (!next) return false;
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) return false;
      const res = await fetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ voice_preferences: { voice_uuid: next } }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      applyProfilePayload(parsed);
      return true;
    } catch {
      return false;
    }
  }

  async function updateOnboardingStep(step) {
    if (!isAuthed) return false;
    setOnboardingBusy(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");
      const res = await fetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          onboarding: { current_step: Number(step) },
        }),
      });
      await ensureApiOk(res);
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      applyProfilePayload(parsed);
      return true;
    } catch (e) {
      setTopErrorFromException(e);
      return false;
    } finally {
      setOnboardingBusy(false);
    }
  }

  async function resendAccountExecutorInvite() {
    const validation = validateExecutorDraft();
    const statusNorm = (accountExecutor?.status || "").trim().toLowerCase();
    const hasInviteBeenSent =
      !!accountExecutor?.last_invite_sent_at || statusNorm === "pending" || statusNorm === "confirmed";
    const firstSend = !hasInviteBeenSent;
    if (!validation.ok) {
      setError(validation.message || "Please complete account executor details before sending an invite.");
      return;
    }
    if (!validation.hasAny) {
      setError("Enter account executor details before sending an invite.");
      return;
    }
    const ok = await saveProfile({
      closeAfterSave: false,
      navigateAfterSave: false,
      executorNotice: firstSend
        ? "Account executor invitation email sent."
        : "Account executor invitation email resent.",
    });
    if (ok) {
      setError("");
    }
  }

  async function removeAccountExecutor() {
    setError("");
    if (!isAuthed) return;
    setProfileBusy(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");
      const res = await fetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ account_executor: null }),
      });
      await ensureApiOk(res);
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      applyProfilePayload(parsed);
      setProfileNotice("Account executor removed.");
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
    const step = Number(onboardingStatus?.current_step || 1);
    if (step === 1) {
      await updateOnboardingStep(2);
      return;
    }
    if (step === 2) {
      const ok = await saveProfile({
        closeAfterSave: false,
        navigateAfterSave: false,
        onboardingStep: 3,
      });
      if (!ok) return;
      return;
    }
    if (step === 3) {
      const validation = validateExecutorDraft();
      if (!validation.ok) {
        setError(validation.message || "Trusted contact requires valid details.");
        return;
      }
      await updateOnboardingStep(4);
    }
  }

  async function onOnboardingBegin() {
    const ok = await saveProfile({
      closeAfterSave: false,
      navigateAfterSave: false,
      onboardingStep: 4,
      markOnboardingCompleted: true,
      executorSendInvite: false,
    });
    if (!ok) return;
    navigateToPage("interview");
  }

  async function onOnboardingSkip() {
    setAccountExecutor({
      name: "",
      email: "",
      confirm_email: "",
      status: "",
      confirmed_at: null,
      last_invite_sent_at: null,
    });
    await updateOnboardingStep(4);
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
      step: Math.min(4, Number(prev.step || 1) + 1),
    }));
  }

  function onOnboardingPreviewSkip() {
    setOnboardingPreview((prev) => ({
      ...prev,
      accountExecutor: { name: "", email: "", confirm_email: "" },
      step: 4,
    }));
  }

  function onOnboardingPreviewBegin() {
    navigateToPage("admin");
  }

  return (
    <div className="km-app-shell">
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
                Sign In
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
            <div className="km-sidebar-auth">
              <button
                type="button"
                className="km-sidebar-item is-signin"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                <CircleUserRound className="km-sidebar-icon" size={20} strokeWidth={1.5} />
                Sign Out
              </button>
              <div className="km-sidebar-muted">{navDisplayName || "Signed in"}</div>
            </div>
          )}
          {isAuthed ? (
            <button
              type="button"
              className="km-sidebar-item is-bottom"
              onClick={() => {
                setMenuOpen(false);
                openProfile();
              }}
            >
              My Account
            </button>
          ) : null}
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
        <button type="button" className="km-menu-toggle" onClick={() => setMenuOpen(true)}>
          <Menu size={22} strokeWidth={1.5} />
          Kinin
        </button>
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
            margin: "40px auto",
            padding: 16,
          }}
        >
          <div className="km-chat-header">
            <img src={kininHomeIcon} alt="Kinin" className="km-chat-header-icon" />
            <div className="km-chat-header-wordmark">Kinin</div>
            <div className="km-chat-header-rule" />
            <div className="km-chat-header-tag">— a living biography, in conversation.</div>
          </div>

      {error && (
        <Banner tone="danger">
          <span><strong>Error.</strong> {error}</span>
        </Banner>
      )}

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
      ) : activePage === "unsubscribe" ? (
        <UnsubscribePage apiBase={API_BASE} />
      ) : activePage === "executor-accept" ? (
        <ExecutorAcceptPage apiBase={API_BASE} />
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
          accountExecutor={accountExecutor}
          setAccountExecutor={setAccountExecutor}
          continuitySettings={continuitySettings}
          setContinuitySettings={setContinuitySettings}
          busy={profileBusy || onboardingBusy}
          onBack={onOnboardingBack}
          onContinue={onOnboardingContinue}
          onBegin={onOnboardingBegin}
          onSkip={onOnboardingSkip}
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
          accountExecutor={onboardingPreview.accountExecutor}
          setAccountExecutor={(next) =>
            setOnboardingPreview((prev) => ({
              ...prev,
              accountExecutor: typeof next === "function" ? next(prev.accountExecutor) : next,
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
          onSkip={onOnboardingPreviewSkip}
          previewMode
          beginLabel="Back to Admin"
        />
      ) : activePage === "account" ? (
        <KininSettingsPage
          profileSchema={profileSchema}
          bioProfile={bioProfile}
          setBioProfile={setBioProfile}
          continuitySettings={continuitySettings}
          setContinuitySettings={setContinuitySettings}
          accountExecutor={accountExecutor}
          setAccountExecutor={setAccountExecutor}
          profileBusy={profileBusy}
          profileNotice={profileNotice}
          saveProfile={saveProfile}
          ttsVoiceUuid={ttsVoiceUuid}
          setTtsVoiceUuid={setTtsVoiceUuid}
          resendAccountExecutorInvite={resendAccountExecutorInvite}
          removeAccountExecutor={removeAccountExecutor}
          onOpenDangerZone={() => navigateToPage("danger-zone")}
          onClose={() => {
            setShowProfile(false);
            navigateToPage("interview");
          }}
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
      ) : (
        <div>
          <div className="km-chat-surface km-chat">
            {chat.length === 0 ? (
              isStartingSession ? (
                <div className="km-chat-loading">
                  <Skeleton />
                  <Skeleton short />
                  <div className="km-chat-loading-tag">Preparing your interview...</div>
                </div>
              ) : (
                <div className="km-chat-empty">Start chatting after logging in.</div>
              )
            ) : (
              chat.map((m, idx) => (
                <ChatRow key={m.id ?? idx} role={m.role}>
                  {m.role === "assistant" && isSendingTurn && !m.content ? (
                    <TypingDots />
                  ) : (
                    m.content
                  )}
                </ChatRow>
              ))
            )}
          </div>

          <div className="km-chat-input-row">
            <textarea
              ref={messageInputRef}
              value={message}
              onChange={(e) => {
                const nextMessage = e.target.value.slice(0, CHAT_MESSAGE_MAX_CHARS);
                setMessage(nextMessage);
                autoResizeMessageInput(e.target);
              }}
              onInput={(e) => autoResizeMessageInput(e.target)}
              placeholder={isAuthed ? "Type a message..." : "Login to chat..."}
              className="km-chat-input"
              maxLength={CHAT_MESSAGE_MAX_CHARS}
              rows={1}
              disabled={!isAuthed || busy || !!accessBlocked}
            />
            <Button
              variant="primary"
              onClick={sendTurn}
              disabled={!isAuthed || busy || !!accessBlocked}
            >
              {isSendingTurn ? "Sending..." : "Send"}
            </Button>
          </div>
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
