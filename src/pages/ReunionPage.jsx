import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radio, X } from "lucide-react";
import {
  Banner,
  Button,
  ChatRow,
  Frame,
  Section,
  Spinner,
  TypingDots,
} from "../theme";

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

/**
 * Reunion mode — the Listener experience.
 *
 * Layout: single-column chat. Citation badges under each assistant reply
 * open a bottom sheet (iOS UISheetPresentationController pattern) that
 * shows the original passage. The sheet is hidden by default and comes up
 * when the user taps a citation. Dismiss via backdrop tap, close button, or
 * Escape key.
 */
export default function ReunionPage({ isAuthed, getAccessToken, apiBase, onUpgraded }) {
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
  // yet, interviewee paused Reunion) so listeners aren't greeted with a red
  // banner for something benign.
  const [chatErrorTone, setChatErrorTone] = useState("danger");

  // The memory currently open in the bottom sheet, or null when hidden.
  const [activeSource, setActiveSource] = useState(null);

  const inputRef = useRef(null);
  const surfaceRef = useRef(null);
  const sheetCloseRef = useRef(null);

  const selectedBio = useMemo(
    () => bios.find((b) => b.biography_owner_user_id === selectedOwnerId) || null,
    [bios, selectedOwnerId],
  );

  const speakerTag = selectedBio?.display_name || "Reunion";
  const sendDisabled =
    !isAuthed || sending || !selectedOwnerId || !(draft || "").trim();

  const closeSource = useCallback(() => setActiveSource(null), []);

  useEffect(() => {
    if (!isAuthed) {
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
        const res = await fetch(`${apiBase}/reunion/biographies`, {
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
        if (list.length === 1) setSelectedOwnerId(list[0].biography_owner_user_id);
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
    setMessages([]);
    clearChatError();
    setDraft("");
    setActiveSource(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function startNewConversation() {
    if (sending) return;
    setMessages([]);
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
      const res = await fetch(`${apiBase}/reunion/upgrade`, {
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

  async function sendMessage() {
    const trimmed = (draft || "").trim();
    if (!trimmed || !selectedOwnerId || sending) return;
    clearChatError();
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
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/reunion/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          biography_owner_user_id: selectedOwnerId,
          message: trimmed,
        }),
      });
      const text = await res.text();
      const parsed = parseApiPayload(text);
      if (!res.ok) {
        const code = String(parsed?.error || "");
        const isSelf = !!selectedBio?.is_self;
        const speaker =
          parsed?.display_name ||
          selectedBio?.display_name ||
          "This person";
        setMessages((prev) => prev.filter((m) => m.id !== placeholder.id));
        if (code === "no_memories_available") {
          setChatErrorTone("info");
          setChatError(
            isSelf
              ? "You haven't shared any memories with Kinin yet. Have your first interview session, then come back to preview your Reunion."
              : `${speaker} hasn't shared any memories with Kinin yet. Check back after their next session.`,
          );
          return;
        }
        if (code === "reunion_disabled_by_owner") {
          setChatErrorTone("info");
          setChatError(
            isSelf
              ? "You've paused Reunion. Turn it back on in Settings to preview or share your biography."
              : `${speaker} has paused Reunion access for now. You'll be able to reach them again once they turn it back on.`,
          );
          return;
        }
        if (code === "reunion_access_denied") {
          setChatErrorTone("danger");
          setChatError(
            "You don't have access to this biography anymore. Ask an administrator to restore it.",
          );
          return;
        }
        const detail =
          parsed?.detail || parsed?.error || (parsed ? JSON.stringify(parsed) : text);
        setChatErrorTone("danger");
        setChatError(`${res.status} — ${detail}`);
        return;
      }
      const reply = String(parsed?.response || "").trim();
      const sources = Array.isArray(parsed?.source_turn_ids)
        ? parsed.source_turn_ids
        : [];
      const memoriesUsed = Array.isArray(parsed?.memories_used)
        ? parsed.memories_used.filter(
            (m) => m && typeof m.memory_id === "string" && typeof m.content === "string",
          )
        : [];
      const contextCount = Number(parsed?.context_turn_ids_count || 0);
      const elapsedMs = Number(parsed?.elapsed_ms || 0);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id
            ? {
                ...m,
                content: reply || "(no reply)",
                pending: false,
                source_turn_ids: sources,
                memories_used: memoriesUsed,
                context_turn_ids_count: contextCount,
                elapsed_ms: elapsedMs,
              }
            : m,
        ),
      );
    } catch (e) {
      setChatError(e?.message || String(e));
      setMessages((prev) => prev.filter((m) => m.id !== placeholder.id));
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
    setActiveSource({ memory_id: memory.memory_id, content: memory.content });
  }

  const sheetOpen = activeSource != null;

  return (
    <Section
      eyebrow="Reunion"
      title={
        <>
          Talk with those <br /><em>who came before.</em>
        </>
      }
    >
      <div className="km-prose" style={{ maxWidth: 680, marginBottom: 32 }}>
        <p>
          Reunion lets you speak with the people whose stories Kinin has
          captured. The voice you hear is built from the interviewee&apos;s own
          recorded memories — what they actually said, in their own words.
          Choose a biography below to begin.
        </p>
      </div>

      {!isAuthed ? (
        <Banner tone="info">
          <span>Sign in to use Reunion.</span>
        </Banner>
      ) : null}

      {isAuthed && viewer?.can_upgrade ? (
        <div style={{ marginBottom: 24 }}>
          <Frame label="Start your own Kinin">
            <div className="km-prose" style={{ maxWidth: 620, marginBottom: 16 }}>
              <p style={{ margin: 0 }}>
                You&apos;re here as a listener — but you have a story too. Start
                your own Kinin interview and let your family talk with your
                memories one day. You&apos;ll keep access to everyone who&apos;s
                shared their Reunion with you.
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
                  className="km-reunion-bio"
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
                          Preview what listeners will hear from your Reunion.
                        </div>
                      ) : b.date_of_birth ? (
                        <div className="km-form-help" style={{ marginTop: 2 }}>
                          Born {formatDateOfBirth(b.date_of_birth)}
                        </div>
                      ) : null}
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
                ? "Previewing your Reunion"
                : `Talking with ${selectedBio.display_name || selectedBio.biography_owner_user_id}`}
            </div>
            {messages.length > 0 ? (
              <Button size="sm" onClick={startNewConversation} disabled={sending}>
                Start new
              </Button>
            ) : null}
          </div>

          <div ref={surfaceRef} className="km-chat-surface km-chat km-reunion-surface">
            {messages.length === 0 ? (
              <div className="km-chat-empty">
                {selectedBio.is_self
                  ? "Ask anything a family member might ask — try questions about your childhood, work, or the things you care about — and see how Reunion replies."
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
                      {m.role === "assistant" &&
                      Array.isArray(m.memories_used) &&
                      m.memories_used.length > 0 ? (
                        <div className="km-reunion-citations">
                          <div className="km-mono-label km-reunion-citations-label">
                            Sources
                          </div>
                          <div className="km-reunion-citations-row">
                            {m.memories_used.map((mem, i) => {
                              const isActive =
                                activeSource?.memory_id === mem.memory_id;
                              return (
                                <button
                                  key={mem.memory_id}
                                  type="button"
                                  className="km-reunion-citation"
                                  data-active={isActive ? "true" : "false"}
                                  onClick={() => openSource(mem)}
                                  title={`View original passage (${mem.memory_id})`}
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

          <div className="km-chat-input-row" style={{ marginTop: 12 }}>
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
                    ? "Ask your Reunion something..."
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
            Reunion is a faithful AI reconstruction. Responses are grounded in
            recorded memories — never invented.
          </div>
        </div>
      ) : null}

      {/* Bottom sheet for original-source citation. iOS-native pattern
          (UISheetPresentationController): slides up from bottom, backdrop
          dims chat, dismiss via backdrop tap, close button, or Escape. */}
      <div
        className="km-reunion-sheet-backdrop"
        data-open={sheetOpen ? "true" : "false"}
        onClick={closeSource}
        aria-hidden={!sheetOpen}
      />
      <div
        className="km-reunion-sheet"
        data-open={sheetOpen ? "true" : "false"}
        role="dialog"
        aria-modal="true"
        aria-label="Original source passage"
        aria-hidden={!sheetOpen}
      >
        <div className="km-reunion-sheet-handle" aria-hidden="true" />
        <div className="km-reunion-sheet-header">
          <span className="km-mono-label">Original source</span>
          <button
            ref={sheetCloseRef}
            type="button"
            className="km-reunion-source-close"
            onClick={closeSource}
            aria-label="Close source"
            title="Close (Esc)"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {activeSource ? (
          <div className="km-reunion-sheet-body">
            <div className="km-reunion-source-id">
              <code>{activeSource.memory_id}</code>
            </div>
            <div className="km-reunion-source-body">{activeSource.content}</div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
