export function ChatRow({ role, tag, children }) {
  const resolvedTag = tag || (role === "user" ? "You" : "Kinin");
  return (
    <div className={`km-chat-row km-chat-row-${role}`}>
      <div className="km-chat-tag">{resolvedTag}</div>
      <div className={`km-chat-bubble km-chat-bubble-${role}`}>{children}</div>
    </div>
  );
}

export function TypingDots({ label = "Kinin is thinking" }) {
  return (
    <span className="km-typing" aria-label={label} role="status">
      <span className="km-typing-dot" />
      <span className="km-typing-dot" />
      <span className="km-typing-dot" />
    </span>
  );
}
