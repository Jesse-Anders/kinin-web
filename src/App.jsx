import { useEffect, useMemo, useState } from "react";
import {
  fetchAuthSession,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from "aws-amplify/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function App() {
  const [user, setUser] = useState(null);
  const [sessionId, setSessionId] = useState(
    () => localStorage.getItem("session_id") || ""
  );
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isAuthed = useMemo(() => !!user, [user]);

  useEffect(() => {
    (async () => {
      try {
        const u = await getCurrentUser();
        setUser(u);
      } catch {
        setUser(null);
      }
    })();
  }, []);

  async function onLogin() {
    setError("");
    await signInWithRedirect(); // Hosted UI
  }

  async function onLogout() {
    setError("");
    await signOut({ global: true });
    setUser(null);
    setChat([]);
  }

  async function sendTurn() {
    setError("");
    if (!message.trim()) return;

    setBusy(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Missing idToken. Are you logged in?");

      const body = {
        session_id: sessionId || undefined,
        message: message.trim(),
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

      const newSessionId = parsed.session_id || sessionId;
      if (newSessionId && newSessionId !== sessionId) {
        setSessionId(newSessionId);
        localStorage.setItem("session_id", newSessionId);
      }

      setChat((prev) => [
        ...prev,
        { role: "user", content: message.trim() },
        { role: "assistant", content: parsed.assistant },
      ]);
      setMessage("");
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "40px auto",
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      <h2>Kinin — Interviewer</h2>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        {!isAuthed ? (
          <button onClick={onLogin}>Login / Sign up</button>
        ) : (
          <>
            <div style={{ opacity: 0.8 }}>
              Signed in as <b>{user?.username}</b>
            </div>
            <button onClick={onLogout}>Logout</button>
          </>
        )}
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
        <button
          onClick={() => {
            setSessionId("");
            localStorage.removeItem("session_id");
            setChat([]);
          }}
          disabled={busy}
        >
          New Session
        </button>
      </div>

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
              <b>{m.role === "user" ? "You" : "Interviewer"}:</b> {m.content}
            </div>
          ))
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={isAuthed ? "Type a message..." : "Login to chat..."}
          style={{ flex: 1, padding: 10 }}
          disabled={!isAuthed || busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendTurn();
          }}
        />
        <button onClick={sendTurn} disabled={!isAuthed || busy}>
          {busy ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
