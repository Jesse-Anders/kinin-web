import { useRef, useState } from "react";
import { LifeBuoy, ArrowLeft } from "lucide-react";
import { Button, ChatRow, TypingDots } from "../theme";

// Same-window "help mode" wrapper. Visually distinct from the interview (sage /
// info palette, framed banner) so it reads as "Kinin has changed its objective"
// rather than a different app. The interview is untouched underneath; exiting
// returns the user exactly where they left off.
export default function HelpMode({
  messages = [],
  busy = false,
  disabled = false,
  onSend,
  onExit,
  maxChars = 4000,
  title = "Kinin is in help mode",
  subtitle = "Answering questions about Kinin. Your interview is saved and waiting.",
}) {
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy || disabled) return;
    onSend?.(trimmed);
    setText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  function autoResize(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }

  return (
    <div className="km-help">
      <div className="km-help-banner">
        <div className="km-help-banner-icon">
          <LifeBuoy size={18} strokeWidth={1.6} />
        </div>
        <div className="km-help-banner-text">
          <div className="km-help-banner-title">{title}</div>
          <div className="km-help-banner-sub">{subtitle}</div>
        </div>
        <button type="button" className="km-help-return-btn" onClick={() => onExit?.()}>
          <ArrowLeft size={15} strokeWidth={1.8} />
          <span>Return to interview</span>
        </button>
      </div>

      <div className="km-help-surface km-chat">
        {messages.length === 0 ? (
          <div className="km-help-empty">
            Ask anything about Kinin — editing your answers, privacy, your account, or how the interview works.
          </div>
        ) : (
          messages.map((m, idx) => (
            <ChatRow key={m.id ?? idx} role={m.role} tag={m.role === "user" ? "You" : "Kinin"}>
              {m.role === "assistant" && busy && !m.content ? <TypingDots label="Kinin is looking into it" /> : m.content}
            </ChatRow>
          ))
        )}
      </div>

      <div className="km-help-input-row">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, maxChars));
            autoResize(e.target);
          }}
          onInput={(e) => autoResize(e.target)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask about Kinin…"
          className="km-chat-input"
          maxLength={maxChars}
          rows={1}
          disabled={disabled || busy}
        />
        <Button variant="primary" onClick={submit} disabled={disabled || busy || !text.trim()}>
          {busy ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
