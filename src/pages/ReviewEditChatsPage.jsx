import { useMemo, useState } from "react";
import { Banner, Button, Frame, Section, Spinner, TextArea, TextInput } from "../theme";

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

function toLocalDateInputValue(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

function formatEditedAt(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(dt);
}

export default function ReviewEditChatsPage({ isAuthed, getAccessToken, apiBase, userDisplayName = "You" }) {
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [items, setItems] = useState([]);
  const [nextKey, setNextKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editRowKey, setEditRowKey] = useState("");
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

  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const activeFilterSummary = useMemo(() => {
    const parts = [];
    if ((query || "").trim()) parts.push(`matching "${(query || "").trim()}"`);
    if (dateFrom && dateTo) parts.push(`from ${dateFrom} to ${dateTo}`);
    else if (dateFrom) parts.push(`from ${dateFrom}`);
    else if (dateTo) parts.push(`through ${dateTo}`);
    return parts.length ? `Showing results ${parts.join(" ")}` : "Showing all chats";
  }, [query, dateFrom, dateTo]);

  function applyDatePreset(days) {
    if (days === "all") {
      setDateFrom("");
      setDateTo("");
      return;
    }
    const now = new Date();
    if (days === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(toLocalDateInputValue(first));
      setDateTo(toLocalDateInputValue(now));
      return;
    }
    const delta = Number(days);
    if (!Number.isFinite(delta) || delta < 1) return;
    const start = new Date(now);
    start.setDate(now.getDate() - (delta - 1));
    setDateFrom(toLocalDateInputValue(start));
    setDateTo(toLocalDateInputValue(now));
  }

  function clearFilters() {
    setQuery("");
    setDateFrom("");
    setDateTo("");
    setError("");
    setStatus("Filters cleared.");
  }

  async function searchChats({ append = false } = {}) {
    if (invalidDateRange) {
      setError("`From` date must be on or before `To` date.");
      setStatus("");
      return;
    }
    setError("");
    setStatus("");
    setBusy(true);
    try {
      const accessToken = await getAccessToken();
      const payload = {
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

  function getRowKey(item) {
    const sid = String(item?.session_id || "");
    const tid = String(item?.turn_id || "");
    const role = String(item?.role || "").toLowerCase();
    return `${sid}::${tid}::${role}`;
  }

  function startEdit(item) {
    setEditRowKey(getRowKey(item));
    setEditDraft(String(item?.content || ""));
    setError("");
    setStatus("");
  }

  function cancelEdit() {
    setEditRowKey("");
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
            : row,
        ),
      );
      setStatus("Turn updated.");
      setEditRowKey("");
      setEditDraft("");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <Section
      eyebrow="Review &amp; edit"
      title={
        <>
          Your conversations,<br /><em>in your hands.</em>
        </>
      }
    >
      <div className="km-prose" style={{ maxWidth: 680, marginBottom: 32 }}>
        <p>
          Search your past chats by text or date, and correct your own user
          turns. Kinin's replies are kept intact as a record of what was said.
        </p>
      </div>

      <Frame label="Filters">
        <div className="km-stack" style={{ gap: 18 }}>
          <div>
            <div className="km-mono-label" style={{ marginBottom: 6 }}>Search text</div>
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a phrase, name, place..."
              disabled={!isAuthed || busy || editBusy}
            />
          </div>

          <div className="km-row" style={{ gap: 8 }}>
            <Button size="sm" onClick={() => applyDatePreset(7)} disabled={!isAuthed || busy || editBusy}>
              Last 7 days
            </Button>
            <Button size="sm" onClick={() => applyDatePreset(30)} disabled={!isAuthed || busy || editBusy}>
              Last 30 days
            </Button>
            <Button size="sm" onClick={() => applyDatePreset("month")} disabled={!isAuthed || busy || editBusy}>
              This month
            </Button>
            <Button size="sm" onClick={() => applyDatePreset("all")} disabled={!isAuthed || busy || editBusy}>
              All time
            </Button>
          </div>

          <div className="km-row" style={{ gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div className="km-mono-label" style={{ marginBottom: 6 }}>From</div>
              <TextInput
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="From date"
                disabled={!isAuthed || busy || editBusy}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="km-mono-label" style={{ marginBottom: 6 }}>To</div>
              <TextInput
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="To date"
                disabled={!isAuthed || busy || editBusy}
              />
            </div>
          </div>

          {invalidDateRange ? (
            <Banner tone="danger">
              <span>"From" date must be on or before "To" date.</span>
            </Banner>
          ) : null}

          <div className="km-form-help" style={{ fontStyle: "italic" }}>
            {activeFilterSummary}
          </div>

          <div className="km-row">
            <Button
              variant="primary"
              onClick={() => searchChats({ append: false })}
              disabled={!isAuthed || busy || editBusy || invalidDateRange}
            >
              {busy ? (
                <>
                  <Spinner /> Searching...
                </>
              ) : (
                "Search"
              )}
            </Button>
            <Button
              onClick={() => searchChats({ append: true })}
              disabled={!isAuthed || busy || !nextKey || editBusy || invalidDateRange}
            >
              Load more
            </Button>
            <Button onClick={clearFilters} disabled={!isAuthed || busy || editBusy}>
              Clear
            </Button>
          </div>
        </div>
      </Frame>

      {status ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone="info">{status}</Banner>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone="danger">{error}</Banner>
        </div>
      ) : null}

      <div className="km-review-results">
        {orderedItems.length ? (
          orderedItems.map((item, idx) => {
            const rowTurnId = String(item?.turn_id || "");
            const rowRole = String(item?.role || "").toLowerCase();
            const rowKey = getRowKey(item);
            const isEditing = rowTurnId && rowKey === editRowKey;
            const speakerLabel = rowRole === "assistant" ? "Kinin" : userDisplayName;
            return (
              <div key={`${rowKey}-${idx}`} className={`km-chat-row km-chat-row-${rowRole}`}>
                <div className="km-chat-tag">{speakerLabel}</div>
                <div className="km-chat-bubble" style={{ width: "100%" }}>
                  {!isEditing ? (
                    <div style={{ whiteSpace: "pre-wrap" }}>{item?.content || ""}</div>
                  ) : (
                    <TextArea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      disabled={editBusy}
                      rows={5}
                      style={{ marginBottom: 8 }}
                    />
                  )}
                  {item?.edited_at ? (
                    <div className="km-mono-label" style={{ marginTop: 6 }}>
                      Edited · {formatEditedAt(item.edited_at)}
                    </div>
                  ) : null}
                  {rowRole === "user" ? (
                    !isEditing ? (
                      <div style={{ marginTop: 10 }}>
                        <Button size="sm" onClick={() => startEdit(item)} disabled={editBusy || busy}>
                          Edit
                        </Button>
                      </div>
                    ) : (
                      <div className="km-row" style={{ marginTop: 10 }}>
                        <Button size="sm" variant="primary" onClick={() => submitEdit(item)} disabled={editBusy || busy}>
                          {editBusy ? (
                            <>
                              <Spinner /> Saving...
                            </>
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button size="sm" onClick={cancelEdit} disabled={editBusy}>
                          Cancel
                        </Button>
                      </div>
                    )
                  ) : (
                    <div className="km-form-help">Kinin's text cannot be edited.</div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="km-chat-empty">No turns loaded yet. Use the filters above and search.</div>
        )}
      </div>
    </Section>
  );
}
