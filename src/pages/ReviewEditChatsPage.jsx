import { useMemo, useState } from "react";

function parseApiPayload(text) {
  try {
    const outer = JSON.parse(text);
    return typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
  } catch {
    return null;
  }
}

function formatDateInput(value) {
  return (value || "").trim();
}

export default function ReviewEditChatsPage({ isAuthed, getAccessToken, apiBase }) {
  const [sessionId, setSessionId] = useState("");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [items, setItems] = useState([]);
  const [nextKey, setNextKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editTurnId, setEditTurnId] = useState("");
  const [editDraft, setEditDraft] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const orderedItems = useMemo(() => {
    const roleOrder = { user: 0, assistant: 1 };
    return [...items].sort((a, b) => {
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
  }, [items]);

  async function searchChats({ append = false } = {}) {
    setError("");
    setStatus("");
    setBusy(true);
    try {
      const accessToken = await getAccessToken();
      const payload = {
        session_id: (sessionId || "").trim() || undefined,
        query: (query || "").trim() || undefined,
        date_from: formatDateInput(dateFrom) || undefined,
        date_to: formatDateInput(dateTo) || undefined,
        start_key: append ? nextKey || undefined : undefined,
        limit: 50,
      };
      const res = await fetch(`${apiBase}/review_chats/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      const parsed = parseApiPayload(text);
      if (!res.ok) {
        throw new Error(`API error ${res.status}: ${parsed ? JSON.stringify(parsed) : text}`);
      }
      const rows = parsed?.items || [];
      setItems((prev) => (append ? [...prev, ...rows] : rows));
      setNextKey(parsed?.next_start_key || null);
      setStatus(`Loaded ${rows.length} turn rows.`);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item) {
    setEditTurnId(String(item?.turn_id || ""));
    setEditDraft(String(item?.content || ""));
    setError("");
    setStatus("");
  }

  function cancelEdit() {
    setEditTurnId("");
    setEditDraft("");
  }

  async function submitEdit(item) {
    setError("");
    setStatus("");
    const turnId = String(item?.turn_id || "");
    const draft = (editDraft || "").trim();
    if (!turnId) {
      setError("turn_id missing.");
      return;
    }
    if (!draft) {
      setError("Edited content cannot be empty.");
      return;
    }
    setEditBusy(true);
    try {
      const accessToken = await getAccessToken();
      const clientRequestId =
        globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const payload = {
        session_id: String(item?.session_id || "").trim(),
        turn_id: turnId,
        new_content: draft,
        client_request_id: clientRequestId,
      };
      const res = await fetch(`${apiBase}/review_chats/edit_turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      const parsed = parseApiPayload(text);
      if (!res.ok) {
        throw new Error(`API error ${res.status}: ${parsed ? JSON.stringify(parsed) : text}`);
      }
      setItems((prev) =>
        prev.map((row) =>
          row?.turn_id === turnId &&
          String(row?.role || "").toLowerCase() === "user" &&
          String(row?.session_id || "") === String(item?.session_id || "")
            ? {
                ...row,
                content: draft,
                edited_at: parsed?.item?.edited_at || parsed?.edited_at || row?.edited_at,
                edited_by: parsed?.item?.edited_by || parsed?.edited_by || row?.edited_by,
              }
            : row
        )
      );
      setStatus("Turn updated.");
      setEditTurnId("");
      setEditDraft("");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Review / Edit Chats</div>
      <div style={{ opacity: 0.75, marginBottom: 12 }}>
        Search your past chats by text/date and correct your own user turns.
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="session_id (optional)"
          disabled={!isAuthed || busy || editBusy}
          style={{ padding: 9 }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search text"
          disabled={!isAuthed || busy || editBusy}
          style={{ padding: 9 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="date_from YYYY-MM-DD"
            disabled={!isAuthed || busy || editBusy}
            style={{ flex: 1, padding: 9 }}
          />
          <input
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="date_to YYYY-MM-DD"
            disabled={!isAuthed || busy || editBusy}
            style={{ flex: 1, padding: 9 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => searchChats({ append: false })} disabled={!isAuthed || busy || editBusy}>
            {busy ? "Searching..." : "Search"}
          </button>
          <button onClick={() => searchChats({ append: true })} disabled={!isAuthed || busy || !nextKey || editBusy}>
            Load More
          </button>
        </div>
      </div>

      {status ? <div style={{ color: "#065f46", marginBottom: 8 }}>{status}</div> : null}
      {error ? <div style={{ color: "#b00020", marginBottom: 8 }}>{error}</div> : null}

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 10,
          padding: 12,
          background: "#fafafa",
          maxHeight: 460,
          overflow: "auto",
        }}
      >
        {orderedItems.length ? (
          orderedItems.map((item, idx) => {
            const rowTurnId = String(item?.turn_id || "");
            const rowRole = String(item?.role || "").toLowerCase();
            const isEditing = rowTurnId && rowTurnId === editTurnId;
            return (
              <div key={`${item?.session_id || ""}-${rowTurnId}-${idx}`} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                  {item?.timestamp || "—"} · {item?.session_id || "—"} · {item?.role || "—"}
                </div>
                {!isEditing ? (
                  <div style={{ marginBottom: 6, whiteSpace: "pre-wrap" }}>{item?.content || ""}</div>
                ) : (
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    style={{ width: "100%", minHeight: 100, boxSizing: "border-box", padding: 8, marginBottom: 6 }}
                    disabled={editBusy}
                  />
                )}
                {item?.edited_at ? (
                  <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>
                    edited_at: {item.edited_at}
                  </div>
                ) : null}
                {rowRole === "user" ? (
                  !isEditing ? (
                    <button onClick={() => startEdit(item)} disabled={editBusy || busy}>
                      Edit
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => submitEdit(item)} disabled={editBusy || busy}>
                        {editBusy ? "Saving..." : "Save"}
                      </button>
                      <button onClick={cancelEdit} disabled={editBusy}>
                        Cancel
                      </button>
                    </div>
                  )
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.6 }}>Only user turns are editable.</div>
                )}
              </div>
            );
          })
        ) : (
          <div style={{ opacity: 0.7 }}>No turns loaded yet.</div>
        )}
      </div>
    </div>
  );
}
