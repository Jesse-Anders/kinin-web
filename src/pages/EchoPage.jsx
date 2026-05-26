import { useEffect, useMemo, useRef, useState } from "react";
import { Radio } from "lucide-react";
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
 * Echo mode — the Listener experience.
 *
 * Stateless backend: every POST /echo/chat call is independent. We maintain
 * the conversation buffer client-side so the user sees a chat thread; this
 * thread is NOT persisted anywhere yet (intentional for Phase 2b).
 */
export default function EchoPage({ isAuthed, getAccessToken, apiBase }) {
  const [bios, setBios] = useState([]);
  const [biosLoading, setBiosLoading] = useState(false);
  const [biosError, setBiosError] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");

  const inputRef = useRef(null);
  const surfaceRef = useRef(null);

  const selectedBio = useMemo(
    () => bios.find((b) => b.biography_owner_user_id === selectedOwnerId) || null,
    [bios, selectedOwnerId],
  );

  const speakerTag = selectedBio?.display_name || "Echo";
  const sendDisabled =
    !isAuthed || sending || !selectedOwnerId || !(draft || "").trim();

  useEffect(() => {
    if (!isAuthed) {
      setBios([]);
      setSelectedOwnerId("");
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setBiosLoading(true);
      setBiosError("");
      try {
        const token = await getAccessToken();
        const res = await fetch(`${apiBase}/echo/biographies`, {
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
    // Scroll to bottom on new messages or while waiting for a reply.
    const el = surfaceRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  function selectBio(owner) {
    if (sending) return;
    setSelectedOwnerId(owner);
    setMessages([]);
    setChatError("");
    setDraft("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function startNewConversation() {
    if (sending) return;
    setMessages([]);
    setChatError("");
    setDraft("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function sendMessage() {
    const trimmed = (draft || "").trim();
    if (!trimmed || !selectedOwnerId || sending) return;
    setChatError("");
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
      const res = await fetch(`${apiBase}/echo/chat`, {
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
        const detail =
          parsed?.detail || parsed?.error || (parsed ? JSON.stringify(parsed) : text);
        throw new Error(`${res.status} — ${detail}`);
      }
      const reply = String(parsed?.response || "").trim();
      const sources = Array.isArray(parsed?.source_turn_ids)
        ? parsed.source_turn_ids
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

  return (
    <Section
      eyebrow="Echo"
      title={
        <>
          Talk with those <br /><em>who came before.</em>
        </>
      }
    >
      <div className="km-prose" style={{ maxWidth: 680, marginBottom: 32 }}>
        <p>
          Echo lets you speak with the people whose stories Kinin has captured.
          The voice you hear is built from the interviewee&apos;s own recorded
          memories — what they actually said, in their own words. Choose a
          biography below to begin.
        </p>
      </div>

      {!isAuthed ? (
        <Banner tone="info">
          <span>Sign in to use Echo.</span>
        </Banner>
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
              return (
                <button
                  key={b.biography_owner_user_id}
                  type="button"
                  onClick={() => selectBio(b.biography_owner_user_id)}
                  disabled={sending}
                  className="km-echo-bio"
                  data-selected={isSelected ? "true" : "false"}
                >
                  <div className="km-row" style={{ alignItems: "center", gap: 12 }}>
                    <Radio size={16} aria-hidden="true" style={{ flex: "0 0 auto" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        {b.display_name || b.biography_owner_user_id}
                      </div>
                      {b.date_of_birth ? (
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
            style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}
          >
            <div className="km-mono-label">
              Talking with {selectedBio.display_name || selectedBio.biography_owner_user_id}
            </div>
            {messages.length > 0 ? (
              <Button size="sm" onClick={startNewConversation} disabled={sending}>
                Start new
              </Button>
            ) : null}
          </div>

          <div ref={surfaceRef} className="km-chat-surface km-chat km-echo-surface">
            {messages.length === 0 ? (
              <div className="km-chat-empty">
                Ask anything — about their family, their work, the things they
                cared about.
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
                      Array.isArray(m.source_turn_ids) &&
                      m.source_turn_ids.length > 0 ? (
                        <details className="km-details" style={{ marginTop: 10 }}>
                          <summary className="km-details-summary">
                            <span className="km-mono-label">
                              — Memories drawn upon ({m.source_turn_ids.length})
                            </span>
                          </summary>
                          <div className="km-form-help" style={{ marginTop: 6 }}>
                            <div>
                              Cited memory ids:{" "}
                              <code>{m.source_turn_ids.join(", ")}</code>
                            </div>
                            {m.context_turn_ids_count ? (
                              <div style={{ marginTop: 4 }}>
                                Of {m.context_turn_ids_count} total memories provided.
                              </div>
                            ) : null}
                            {m.elapsed_ms ? (
                              <div style={{ marginTop: 4 }}>
                                Response generated in {(m.elapsed_ms / 1000).toFixed(1)}s.
                              </div>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </>
                  )}
                </ChatRow>
              ))
            )}
          </div>

          {chatError ? (
            <div style={{ marginTop: 12 }}>
              <Banner tone="danger">
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
                isAuthed
                  ? `Ask ${speakerTag} something...`
                  : "Sign in to chat..."
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
          <div className="km-form-help" style={{ marginTop: 8, fontStyle: "italic" }}>
            Echo is a faithful AI reconstruction. Responses are grounded in
            recorded memories — never invented.
          </div>
        </div>
      ) : null}
    </Section>
  );
}
