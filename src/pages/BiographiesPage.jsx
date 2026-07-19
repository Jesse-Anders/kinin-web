import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Radio, X } from "lucide-react";
import {
  Banner,
  Button,
  ChatRow,
  Frame,
  Section,
  Spinner,
  TypingDots,
} from "../theme";
import {
  streamBiography,
  isStreamTransportError,
} from "../services/biographyStreamClient";

const MESSAGE_MAX_CHARS = 4000;

function parseApiPayload(text) {
  try {
    const outer = JSON.parse(text);
    return typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
  } catch {
    return null;
  }
}

function formatDateOfBirth(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(dt.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
}

// Human-friendly source label for a citation (no raw turn ids shown to users).
function sourceLabel(memory) {
  return memory?.source_kind === "journal" ? "Journal Entry" : "Interview Moment";
}

function formatSourceDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(dt);
}

// Normalize the memories/citations from a chat payload (HTTP or streamed final)
// into the shape the UI renders.
function normalizeMemoriesUsed(parsed) {
  return Array.isArray(parsed?.memories_used)
    ? parsed.memories_used
        .filter(
          (m) =>
            m && typeof m.memory_id === "string" && typeof m.content === "string",
        )
        .map((m) => ({
          memory_id: m.memory_id,
          content: m.content,
          source_kind: m.source_kind === "journal" ? "journal" : "interview",
          source_date: typeof m.source_date === "string" ? m.source_date : "",
          title: typeof m.title === "string" ? m.title : "",
          photos: Array.isArray(m.photos) ? m.photos.filter((p) => p && p.url) : [],
        }))
    : [];
}

// The fields (other than visible content) to merge into an assistant message
// once a reply completes. Shared by the streamed-final and HTTP paths.
function buildAssistantPatch(parsed) {
  const memoriesUsed = normalizeMemoriesUsed(parsed);
  const allPhotos = memoriesUsed.flatMap((m) =>
    m.photos.map((p) => ({ ...p, memory_id: m.memory_id })),
  );
  return {
    memories_used: memoriesUsed,
    photos: allPhotos,
    source_turn_ids: Array.isArray(parsed?.source_turn_ids)
      ? parsed.source_turn_ids
      : [],
    context_turn_ids_count: Number(parsed?.context_turn_ids_count || 0),
    elapsed_ms: Number(parsed?.elapsed_ms || 0),
  };
}

// ── Per-biography transcript persistence ──────────────────────────────────
// The chat surface is stateless server-side, so we keep transcripts in
// sessionStorage keyed by biography owner. This survives navigating away and
// back (and a page refresh) within the same tab, and clears automatically when
// the tab closes or the user signs out.
const BIO_CHAT_PREFIX = "kinin_bio_chat:";
const BIO_SELECTED_KEY = "kinin_bio_selected";
const BIO_CHAT_MAX_MESSAGES = 200;

function loadTranscript(ownerId) {
  if (!ownerId) return [];
  try {
    const raw = sessionStorage.getItem(BIO_CHAT_PREFIX + ownerId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTranscript(ownerId, messages) {
  if (!ownerId) return;
  try {
    // Persist only settled messages (skip in-flight/streaming placeholders) so
    // a refresh never restores a stuck "typing" bubble.
    const settled = (messages || [])
      .filter((m) => m && !m.pending)
      .slice(-BIO_CHAT_MAX_MESSAGES);
    if (settled.length) {
      sessionStorage.setItem(BIO_CHAT_PREFIX + ownerId, JSON.stringify(settled));
    } else {
      sessionStorage.removeItem(BIO_CHAT_PREFIX + ownerId);
    }
  } catch {
    // Storage full/unavailable — non-fatal; the transcript just won't persist.
  }
}

// Build the recent-conversation payload sent with each chat request. The
// server is stateless, so it relies on this for continuity. We send only
// settled user/assistant messages (no in-flight placeholders) as
// {role, content}; the backend caps how many it actually uses.
const BIO_HISTORY_SEND_MAX = 16;

function buildRequestHistory(messages) {
  return (messages || [])
    .filter(
      (m) =>
        m &&
        !m.pending &&
        (m.role === "user" || m.role === "assistant") &&
        (m.content || "").trim(),
    )
    .slice(-BIO_HISTORY_SEND_MAX)
    .map((m) => ({ role: m.role, content: m.content }));
}

function clearTranscript(ownerId) {
  if (!ownerId) return;
  try {
    sessionStorage.removeItem(BIO_CHAT_PREFIX + ownerId);
  } catch {
    // Ignore.
  }
}

function loadSelectedOwner() {
  try {
    return sessionStorage.getItem(BIO_SELECTED_KEY) || "";
  } catch {
    return "";
  }
}

function saveSelectedOwner(ownerId) {
  try {
    if (ownerId) sessionStorage.setItem(BIO_SELECTED_KEY, ownerId);
    else sessionStorage.removeItem(BIO_SELECTED_KEY);
  } catch {
    // Ignore.
  }
}

function clearAllBioChat() {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && (k === BIO_SELECTED_KEY || k.startsWith(BIO_CHAT_PREFIX))) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // Ignore.
  }
}

/**
 * Biographies — where a family member interacts with a biography.
 *
 * Layout: single-column chat. Citation badges under each assistant reply
 * open a bottom sheet (iOS UISheetPresentationController pattern) that
 * shows the original passage. The sheet is hidden by default and comes up
 * when the user taps a citation. Dismiss via backdrop tap, close button, or
 * Escape key.
 */
export default function BiographiesPage({ isAuthed, getAccessToken, apiBase, streamWsUrl = "", onUpgraded, onPersonaOpen }) {
  const [bios, setBios] = useState([]);
  const [biosLoading, setBiosLoading] = useState(false);
  const [biosError, setBiosError] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [viewer, setViewer] = useState(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  // "danger" for real errors; "info" for expected soft states (no memories
  // yet, interviewee paused sharing) so family members aren't greeted with a red
  // banner for something benign.
  const [chatErrorTone, setChatErrorTone] = useState("danger");

  // The memory currently open in the bottom sheet, or null when hidden.
  const [activeSource, setActiveSource] = useState(null);
  // Full-screen photo lightbox: { photos: [...], index } or null.
  const [gallery, setGallery] = useState(null);

  const inputRef = useRef(null);
  const surfaceRef = useRef(null);
  const sheetCloseRef = useRef(null);

  const selectedBio = useMemo(
    () => bios.find((b) => b.biography_owner_user_id === selectedOwnerId) || null,
    [bios, selectedOwnerId],
  );

  const speakerTag = selectedBio?.display_name || "Biography";
  const sendDisabled =
    !isAuthed || sending || !selectedOwnerId || !(draft || "").trim();

  const closeSource = useCallback(() => setActiveSource(null), []);

  useEffect(() => {
    if (!isAuthed) {
      clearAllBioChat();
      setBios([]);
      setSelectedOwnerId("");
      setMessages([]);
      setActiveSource(null);
      setViewer(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setBiosLoading(true);
      setBiosError("");
      try {
        const token = await getAccessToken();
        const res = await fetch(`${apiBase}/biographies/list`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        const parsed = parseApiPayload(text);
        if (!res.ok) {
          throw new Error(
            `API error ${res.status}: ${parsed ? JSON.stringify(parsed) : text}`,
          );
        }
        const list = Array.isArray(parsed?.biographies) ? parsed.biographies : [];
        if (cancelled) return;
        setBios(list);
        setViewer(parsed?.viewer || null);
        // Restore the last-open biography (and its transcript) so navigating
        // away and back leaves the conversation in place. Fall back to
        // auto-selecting when there's exactly one biography.
        const stored = loadSelectedOwner();
        const restore =
          (stored && list.some((b) => b.biography_owner_user_id === stored) && stored) ||
          (list.length === 1 ? list[0].biography_owner_user_id : "");
        if (restore) {
          setSelectedOwnerId(restore);
          setMessages(loadTranscript(restore));
          saveSelectedOwner(restore);
        }
      } catch (e) {
        if (cancelled) return;
        setBiosError(e?.message || String(e));
      } finally {
        if (!cancelled) setBiosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthed, apiBase, getAccessToken]);

  useEffect(() => {
    // Scroll chat surface to bottom on new messages or while waiting.
    const el = surfaceRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    // Persist the transcript once a turn settles. Skipping while `sending`
    // avoids a write per streamed token and never stores a pending bubble.
    if (!selectedOwnerId || sending) return;
    saveTranscript(selectedOwnerId, messages);
  }, [selectedOwnerId, messages, sending]);

  useEffect(() => {
    // Close the sheet on Escape.
    if (!activeSource) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeSource();
      }
    }
    window.addEventListener("keydown", onKey);
    // Move focus to the close button so keyboard users can dismiss it.
    requestAnimationFrame(() => sheetCloseRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [activeSource, closeSource]);

  function clearChatError() {
    setChatError("");
    setChatErrorTone("danger");
  }

  function selectBio(owner) {
    if (sending) return;
    setSelectedOwnerId(owner);
    saveSelectedOwner(owner);
    // Restore any prior transcript for this biography instead of clearing it.
    setMessages(loadTranscript(owner));
    clearChatError();
    setDraft("");
    setActiveSource(null);
    requestAnimationFrame(() => inputRef.current?.focus());
    // Let the parent offer a first-time "how to ask / citations" walkthrough
    // now that a persona (biography) is open and its chat surface has rendered.
    onPersonaOpen?.();
  }

  function startNewConversation() {
    if (sending) return;
    setMessages([]);
    clearTranscript(selectedOwnerId);
    clearChatError();
    setDraft("");
    setActiveSource(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function upgradeAccount() {
    if (upgrading) return;
    setUpgrading(true);
    setUpgradeError("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/biographies/upgrade`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const parsed = parseApiPayload(text);
      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.error || `Request failed (${res.status})`);
      }
      setViewer((v) => ({ ...(v || {}), plan_state: parsed?.plan_state || "beta_invited", can_upgrade: false }));
      if (typeof onUpgraded === "function") onUpgraded();
    } catch (e) {
      setUpgradeError(e?.message || String(e));
    } finally {
      setUpgrading(false);
    }
  }

  // Map a known backend error code to a friendly, tone-appropriate message.
  // Returns null for codes with no soft mapping (caller shows a generic error).
  function resolveSoftError(code) {
    const isSelf = !!selectedBio?.is_self;
    const speaker = selectedBio?.display_name || "This person";
    if (code === "no_memories_available") {
      return {
        tone: "info",
        message: isSelf
          ? "You haven't shared any memories with Kinin yet. Have your first interview session, then come back to preview your biography."
          : `${speaker} hasn't shared any memories with Kinin yet. Check back after their next session.`,
      };
    }
    if (code === "biography_disabled_by_owner") {
      return {
        tone: "info",
        message: isSelf
          ? "You've paused sharing. Turn it back on in Settings to preview or share your biography."
          : `${speaker} has paused their biography for now. You'll be able to reach them again once they turn it back on.`,
      };
    }
    if (code === "biography_access_denied") {
      return {
        tone: "danger",
        message:
          "You don't have access to this biography anymore. Ask an administrator to restore it.",
      };
    }
    return null;
  }

  function finalizeAssistant(placeholderId, parsed) {
    const patch = buildAssistantPatch(parsed);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === placeholderId
          ? {
              ...m,
              // The streamed-final `response` is authoritative (SOURCES line
              // stripped); fall back to any text already streamed into content.
              content: String(parsed?.response || "").trim() || m.content || "(no reply)",
              pending: false,
              ...patch,
            }
          : m,
      ),
    );
  }

  async function streamViaWs(placeholder, trimmed, token, history) {
    const parsed = await streamBiography({
      wsUrl: streamWsUrl,
      accessToken: token,
      biographyOwnerUserId: selectedOwnerId,
      message: trimmed,
      history,
      clientRequestId: placeholder.id,
      onDelta: (delta) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholder.id
              ? { ...m, content: (m.content || "") + delta, pending: false }
              : m,
          ),
        );
      },
    });
    finalizeAssistant(placeholder.id, parsed);
  }

  async function sendMessage() {
    const trimmed = (draft || "").trim();
    if (!trimmed || !selectedOwnerId || sending) return;
    clearChatError();
    // Snapshot the prior transcript BEFORE appending this turn's placeholder,
    // so the server gets the conversation-so-far for continuity.
    const history = buildRequestHistory(messages);
    const userMsg = {
      id: `u_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      role: "user",
      content: trimmed,
    };
    const placeholder = {
      id: `a_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      role: "assistant",
      content: "",
      pending: true,
    };
    setMessages((prev) => [...prev, userMsg, placeholder]);
    setDraft("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setSending(true);

    const removePlaceholder = () =>
      setMessages((prev) => prev.filter((m) => m.id !== placeholder.id));
    const resetPlaceholder = () =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id ? { ...m, content: "", pending: true } : m,
        ),
      );
    // Render a soft (expected) error for a known code; returns true if handled.
    const showSoft = (code) => {
      const soft = resolveSoftError(code);
      if (!soft) return false;
      removePlaceholder();
      setChatErrorTone(soft.tone);
      setChatError(soft.message);
      return true;
    };

    try {
      const token = await getAccessToken();

      // Preferred path: stream tokens over the WebSocket when configured.
      if (streamWsUrl) {
        try {
          await streamViaWs(placeholder, trimmed, token, history);
          return;
        } catch (streamErr) {
          if (showSoft(streamErr?.code)) return;
          if (!isStreamTransportError(streamErr)) {
            removePlaceholder();
            setChatErrorTone("danger");
            setChatError(
              streamErr?.detail || streamErr?.message || "Something went wrong.",
            );
            return;
          }
          // Transport/availability failure — clear any partial text and fall
          // back to the HTTP request below.
          resetPlaceholder();
        }
      }

      // HTTP path — primary when streaming is off, or fallback after a
      // transport failure above.
      const res = await fetch(`${apiBase}/biographies/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          biography_owner_user_id: selectedOwnerId,
          message: trimmed,
          ...(history.length ? { history } : {}),
        }),
      });
      const text = await res.text();
      const parsed = parseApiPayload(text);
      if (!res.ok) {
        const code = String(parsed?.error || "");
        if (showSoft(code)) return;
        removePlaceholder();
        const detail =
          parsed?.detail || parsed?.error || (parsed ? JSON.stringify(parsed) : text);
        setChatErrorTone("danger");
        setChatError(`${res.status} — ${detail}`);
        return;
      }
      finalizeAssistant(placeholder.id, parsed);
    } catch (e) {
      setChatError(e?.message || String(e));
      removePlaceholder();
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleInputKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendDisabled) sendMessage();
    }
  }

  function openSource(memory) {
    if (!memory) return;
    setActiveSource({
      memory_id: memory.memory_id,
      content: memory.content,
      source_kind: memory.source_kind,
      source_date: memory.source_date,
      title: memory.title,
      photos: Array.isArray(memory.photos) ? memory.photos : [],
    });
  }

  const openGallery = useCallback((photos, index = 0) => {
    if (!Array.isArray(photos) || !photos.length) return;
    setGallery({ photos, index: Math.max(0, Math.min(index, photos.length - 1)) });
  }, []);

  const closeGallery = useCallback(() => setGallery(null), []);

  const stepGallery = useCallback((delta) => {
    setGallery((g) => {
      if (!g) return g;
      const n = g.photos.length;
      return { ...g, index: (g.index + delta + n) % n };
    });
  }, []);

  useEffect(() => {
    if (!gallery) return undefined;
    function onKey(e) {
      if (e.key === "Escape") closeGallery();
      else if (e.key === "ArrowRight") stepGallery(1);
      else if (e.key === "ArrowLeft") stepGallery(-1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [gallery, closeGallery, stepGallery]);

  const sheetOpen = activeSource != null;

  return (
    <Section
      eyebrow="Biographies"
      title={
        <>
          Talk with those <br /><em>who came before.</em>
        </>
      }
    >
      <div className="km-prose" style={{ maxWidth: 680, marginBottom: 32 }} data-help-anchor="biography-main">
        <p>
          Biographies lets you interact with the people whose memories Kinin has
          captured. The voice you hear is built from the interviewee&apos;s own
          recorded memories — what they actually said, in their own words.
          Choose a biography below to begin.
        </p>
      </div>

      {!isAuthed ? (
        <Banner tone="info">
          <span>Sign in to open a biography.</span>
        </Banner>
      ) : null}

      {isAuthed && viewer?.can_upgrade ? (
        <div style={{ marginBottom: 24 }}>
          <Frame label="Start your own Kinin">
            <div className="km-prose" style={{ maxWidth: 620, marginBottom: 16 }}>
              <p style={{ margin: 0 }}>
                You&apos;re here to explore someone&apos;s biography — but you
                have a story too. Start your own Kinin interview and let your
                family talk with your memories one day. You&apos;ll keep access
                to everyone who&apos;s shared their biography with you.
              </p>
            </div>
            {upgradeError ? (
              <div style={{ marginBottom: 12 }}>
                <Banner tone="danger"><span>{upgradeError}</span></Banner>
              </div>
            ) : null}
            <Button variant="primary" onClick={upgradeAccount} disabled={upgrading}>
              {upgrading ? (
                <><Spinner /> Setting up...</>
              ) : (
                "Start telling my story"
              )}
            </Button>
          </Frame>
        </div>
      ) : null}

      <Frame label="Choose a biography">
        {biosLoading ? (
          <div className="km-row" style={{ gap: 8, alignItems: "center" }}>
            <Spinner /> Loading...
          </div>
        ) : biosError ? (
          <Banner tone="danger">
            <span>{biosError}</span>
          </Banner>
        ) : bios.length === 0 ? (
          <div className="km-prose" style={{ maxWidth: 560 }}>
            <p style={{ margin: 0 }}>
              You don&apos;t have access to any biographies yet. Ask an
              administrator to grant you access.
            </p>
          </div>
        ) : (
          <div className="km-stack" style={{ gap: 10 }}>
            {bios.map((b) => {
              const isSelected = b.biography_owner_user_id === selectedOwnerId;
              const isSelf = !!b.is_self;
              const displayName = b.display_name || b.biography_owner_user_id;
              const primaryLabel = isSelf
                ? `You${b.display_name ? ` — ${b.display_name}` : ""}`
                : displayName;
              return (
                <button
                  key={b.biography_owner_user_id}
                  type="button"
                  onClick={() => selectBio(b.biography_owner_user_id)}
                  disabled={sending}
                  className="km-biography-bio"
                  data-selected={isSelected ? "true" : "false"}
                >
                  <div className="km-row" style={{ alignItems: "center", gap: 12 }}>
                    <Radio size={16} aria-hidden="true" style={{ flex: "0 0 auto" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        {primaryLabel}
                      </div>
                      {isSelf ? (
                        <div className="km-form-help" style={{ marginTop: 2 }}>
                          Preview what your family will hear from your biography.
                        </div>
                      ) : (
                        <>
                          {b.date_of_birth ? (
                            <div className="km-form-help" style={{ marginTop: 2 }}>
                              Born {formatDateOfBirth(b.date_of_birth)}
                            </div>
                          ) : null}
                          {b.is_sample ? (
                            <div className="km-form-help" style={{ marginTop: 2 }}>
                              Sample biography — try it out to see how Kinin
                              biographies work.
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Frame>

      {selectedBio ? (
        <div style={{ marginTop: 32 }}>
          <div
            className="km-row"
            style={{
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 12,
            }}
          >
            <div className="km-mono-label">
              {selectedBio.is_self
                ? "Previewing your biography"
                : `Talking with ${selectedBio.display_name || selectedBio.biography_owner_user_id}`}
            </div>
            {messages.length > 0 ? (
              <Button size="sm" onClick={startNewConversation} disabled={sending}>
                Start new
              </Button>
            ) : null}
          </div>

          <div ref={surfaceRef} className="km-chat-surface km-chat km-biography-surface" data-help-anchor="biography-chat">
            {messages.length === 0 ? (
              <div className="km-chat-empty">
                {selectedBio.is_self
                  ? "Ask anything a family member might ask — try questions about your childhood, work, or the things you care about — and see how your biography replies."
                  : "Ask anything — about their family, their work, the things they cared about."}
              </div>
            ) : (
              messages.map((m) => (
                <ChatRow
                  key={m.id}
                  role={m.role}
                  tag={m.role === "assistant" ? speakerTag : undefined}
                >
                  {m.pending ? (
                    <TypingDots label={`${speakerTag} is thinking`} />
                  ) : (
                    <>
                      <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                      {m.role === "assistant" && Array.isArray(m.photos) && m.photos.length > 0 ? (
                        <button
                          type="button"
                          className="km-biography-photo-chip"
                          onClick={() => openGallery(m.photos, 0)}
                          title="View attached photos"
                        >
                          <Camera size={15} strokeWidth={1.6} />
                          {m.photos.length} {m.photos.length === 1 ? "photo" : "photos"}
                        </button>
                      ) : null}
                      {m.role === "assistant" &&
                      Array.isArray(m.memories_used) &&
                      m.memories_used.length > 0 ? (
                        <div className="km-biography-citations" data-help-anchor="biography-citations">
                          <div className="km-mono-label km-biography-citations-label">
                            Sources
                          </div>
                          <div className="km-biography-citations-row">
                            {m.memories_used.map((mem, i) => {
                              const isActive =
                                activeSource?.memory_id === mem.memory_id;
                              return (
                                <button
                                  key={mem.memory_id}
                                  type="button"
                                  className="km-biography-citation"
                                  data-active={isActive ? "true" : "false"}
                                  onClick={() => openSource(mem)}
                                  title={`${sourceLabel(mem)}${
                                    formatSourceDate(mem.source_date)
                                      ? ` · ${formatSourceDate(mem.source_date)}`
                                      : ""
                                  }`}
                                >
                                  [{i + 1}]
                                </button>
                              );
                            })}
                            {m.context_turn_ids_count ? (
                              <span
                                className="km-form-help"
                                style={{ marginLeft: 8 }}
                              >
                                of {m.context_turn_ids_count} memories
                                {m.elapsed_ms
                                  ? ` · ${(m.elapsed_ms / 1000).toFixed(1)}s`
                                  : ""}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </ChatRow>
              ))
            )}
          </div>

          {chatError ? (
            <div style={{ marginTop: 12 }}>
              <Banner tone={chatErrorTone}>
                <span>{chatError}</span>
              </Banner>
            </div>
          ) : null}

          <div className="km-chat-input-row" style={{ marginTop: 12 }} data-help-anchor="biography-input">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                const next = e.target.value.slice(0, MESSAGE_MAX_CHARS);
                setDraft(next);
                autoResizeTextarea(e.target);
              }}
              onInput={(e) => autoResizeTextarea(e.target)}
              onKeyDown={handleInputKeyDown}
              placeholder={
                !isAuthed
                  ? "Sign in to chat..."
                  : selectedBio?.is_self
                    ? "Ask your biography something..."
                    : `Ask ${speakerTag} something...`
              }
              className="km-chat-input"
              maxLength={MESSAGE_MAX_CHARS}
              rows={1}
              disabled={!isAuthed || sending}
            />
            <Button
              variant="primary"
              onClick={sendMessage}
              disabled={sendDisabled}
            >
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>
          <div
            className="km-form-help"
            style={{ marginTop: 8, fontStyle: "italic" }}
          >
            A biography is a faithful AI reconstruction. Responses are grounded
            in recorded memories — never invented.
          </div>
        </div>
      ) : null}

      {/* Bottom sheet for original-source citation. iOS-native pattern
          (UISheetPresentationController): slides up from bottom, backdrop
          dims chat, dismiss via backdrop tap, close button, or Escape. */}
      <div
        className="km-biography-sheet-backdrop"
        data-open={sheetOpen ? "true" : "false"}
        onClick={closeSource}
        aria-hidden={!sheetOpen}
      />
      <div
        className="km-biography-sheet"
        data-open={sheetOpen ? "true" : "false"}
        role="dialog"
        aria-modal="true"
        aria-label="Original source passage"
        aria-hidden={!sheetOpen}
      >
        <div className="km-biography-sheet-handle" aria-hidden="true" />
        <div className="km-biography-sheet-header">
          <span className="km-mono-label">Original source</span>
          <button
            ref={sheetCloseRef}
            type="button"
            className="km-biography-source-close"
            onClick={closeSource}
            aria-label="Close source"
            title="Close (Esc)"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {activeSource ? (
          <div className="km-biography-sheet-body">
            <div className="km-biography-source-meta">
              <span className="km-biography-source-kind">{sourceLabel(activeSource)}</span>
              {formatSourceDate(activeSource.source_date) ? (
                <span className="km-biography-source-date">
                  {formatSourceDate(activeSource.source_date)}
                </span>
              ) : null}
            </div>
            {activeSource.source_kind === "journal" && activeSource.title ? (
              <div className="km-biography-source-title">{activeSource.title}</div>
            ) : null}
            <div className="km-biography-source-body">{activeSource.content}</div>
            {Array.isArray(activeSource.photos) && activeSource.photos.length ? (
              <div className="km-biography-source-photos">
                <div className="km-mono-label" style={{ marginBottom: 6 }}>Photos</div>
                <div className="km-biography-thumbs">
                  {activeSource.photos.map((p, i) => (
                    <button
                      key={p.photo_id || i}
                      type="button"
                      className="km-biography-thumb"
                      onClick={() => openGallery(activeSource.photos, i)}
                      title={p.caption || "View photo"}
                    >
                      <img src={p.url} alt={p.caption || "Attached photo"} loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Full-screen photo lightbox */}
      {gallery ? (
        <div
          className="km-biography-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={closeGallery}
        >
          <button
            type="button"
            className="km-biography-lightbox-close"
            onClick={closeGallery}
            aria-label="Close photos"
          >
            <X size={20} aria-hidden="true" />
          </button>
          {gallery.photos.length > 1 ? (
            <button
              type="button"
              className="km-biography-lightbox-nav km-biography-lightbox-prev"
              onClick={(e) => {
                e.stopPropagation();
                stepGallery(-1);
              }}
              aria-label="Previous photo"
            >
              <ChevronLeft size={28} aria-hidden="true" />
            </button>
          ) : null}
          <figure
            className="km-biography-lightbox-figure"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={gallery.photos[gallery.index]?.url}
              alt={gallery.photos[gallery.index]?.caption || "Attached photo"}
            />
            <figcaption className="km-biography-lightbox-caption">
              {gallery.photos[gallery.index]?.caption ? (
                <span>{gallery.photos[gallery.index].caption}</span>
              ) : null}
              {gallery.photos.length > 1 ? (
                <span className="km-mono-label">
                  {gallery.index + 1} / {gallery.photos.length}
                </span>
              ) : null}
            </figcaption>
          </figure>
          {gallery.photos.length > 1 ? (
            <button
              type="button"
              className="km-biography-lightbox-nav km-biography-lightbox-next"
              onClick={(e) => {
                e.stopPropagation();
                stepGallery(1);
              }}
              aria-label="Next photo"
            >
              <ChevronRight size={28} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}
