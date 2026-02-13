import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

export default function AdminHomePage({ isAuthed, getAccessToken, apiBase }) {
  // ── Admin state ──
  const [adminUserId, setAdminUserId] = useState(
    () => localStorage.getItem("admin_user_id") || ""
  );
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminTokenClaims, setAdminTokenClaims] = useState(null);

  // Lookup
  const [lookupUsername, setLookupUsername] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");

  // Turns
  const [turnsSessionId, setTurnsSessionId] = useState("");
  const [turnsItems, setTurnsItems] = useState([]);
  const [turnsBusy, setTurnsBusy] = useState(false);
  const [turnsError, setTurnsError] = useState("");
  const [turnsNextKey, setTurnsNextKey] = useState(null);
  const turnsListRef = useRef(null);
  const turnsAppendRef = useRef(false);

  // Feedback
  const [adminFeedbackItems, setAdminFeedbackItems] = useState([]);
  const [adminFeedbackNextKey, setAdminFeedbackNextKey] = useState(null);
  const [adminFeedbackBusy, setAdminFeedbackBusy] = useState(false);
  const [adminFeedbackError, setAdminFeedbackError] = useState("");
  const [feedbackRangeDays, setFeedbackRangeDays] = useState(7);
  const [feedbackUserFilter, setFeedbackUserFilter] = useState("");

  // ── Derived / memos ──

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

  // ── Effects ──

  useEffect(() => {
    if (!turnsListRef.current) return;
    if (turnsAppendRef.current) return;
    turnsListRef.current.scrollTop = turnsListRef.current.scrollHeight;
  }, [turnsView.length]);

  // ── Helpers ──

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

  // ── API functions ──

  async function fetchAdminOverview() {
    setAdminError("");
    setAdminBusy(true);
    setAdminOverview(null);
    try {
      const accessToken = await getAccessToken();
      const target = (adminUserId || "").trim();
      if (!target) throw new Error("target_user_id required");

      const res = await fetch(`${apiBase}/admin/get_user_journey_overview`, {
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

      const res = await fetch(`${apiBase}/admin/lookup_user`, {
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

      const res = await fetch(`${apiBase}/admin/list_user_turns`, {
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

  async function fetchAdminFeedback({ append = false } = {}) {
    setAdminFeedbackError("");
    setAdminFeedbackBusy(true);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`${apiBase}/admin/list_feedback`, {
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

  // ── Render ──

  return (
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
  );
}
