import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Eye,
  Pencil,
  Plus,
  Save,
  SpellCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Banner, Button, Frame, Section, Spinner, TextArea, TextInput } from "../theme";
import {
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  reviewEntry,
  saveEntry,
  updateEntry,
} from "../services/journalClient";

const TITLE_MAX_CHARS = 200;
const REVIEW_MAX_WORDS = 6000;
const AUTOSAVE_DEBOUNCE_MS = 1200;

const NOTE_LABELS = {
  thin: "Feels thin",
  unclear: "Unclear",
  question: "Question",
};

function countWords(text) {
  return (text || "").trim() ? (text || "").trim().split(/\s+/).length : 0;
}

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(dt);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Minimal, safe light-Markdown renderer (escape first, then add our own tags).
function renderMarkdown(src) {
  const inline = (t) =>
    escapeHtml(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  const lines = String(src || "").split(/\r?\n/);
  let html = "";
  let inUl = false;
  let inOl = false;
  const closeLists = () => {
    if (inUl) {
      html += "</ul>";
      inUl = false;
    }
    if (inOl) {
      html += "</ol>";
      inOl = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeLists();
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      closeLists();
      const lvl = m[1].length + 2;
      html += `<h${lvl}>${inline(m[2])}</h${lvl}>`;
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      closeLists();
      html += `<blockquote>${inline(m[1])}</blockquote>`;
      continue;
    }
    if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (!inUl) {
        closeLists();
        html += "<ul>";
        inUl = true;
      }
      html += `<li>${inline(m[1])}</li>`;
      continue;
    }
    if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      if (!inOl) {
        closeLists();
        html += "<ol>";
        inOl = true;
      }
      html += `<li>${inline(m[1])}</li>`;
      continue;
    }
    closeLists();
    html += `<p>${inline(line)}</p>`;
  }
  closeLists();
  return html;
}

export default function JournalPage({
  isAuthed,
  getAccessToken,
  apiBase,
  openEntryId = "",
  onEntryOpened,
}) {
  const [entries, setEntries] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [loadingEntry, setLoadingEntry] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [entryStatus, setEntryStatus] = useState("draft");

  const [autosave, setAutosave] = useState("idle"); // idle | saving | saved
  const [view, setView] = useState("write"); // write | preview
  const [savingEntry, setSavingEntry] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [reviewMode, setReviewMode] = useState(""); // "" | review | cleanup
  const [notes, setNotes] = useState([]);
  const [fixes, setFixes] = useState([]);

  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const savedSnapshotRef = useRef(null);
  const bodyRef = useRef(null);

  const words = countWords(body);
  const overReviewCap = words > REVIEW_MAX_WORDS;

  const loadList = useCallback(async () => {
    if (!isAuthed) return;
    setError("");
    setLoadingList(true);
    try {
      const token = await getAccessToken();
      const data = await listEntries({ apiBase, token, status: "all" });
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoadingList(false);
    }
  }, [isAuthed, getAccessToken, apiBase]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Open a specific entry when arriving from another surface (e.g. "start journal
  // from pin"), then refresh the list so the new draft shows up.
  useEffect(() => {
    if (!openEntryId || !isAuthed) return;
    if (openEntryId === activeId) {
      onEntryOpened?.();
      return;
    }
    (async () => {
      await openEntry(openEntryId);
      await loadList();
      onEntryOpened?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEntryId, isAuthed]);

  async function openEntry(entryId) {
    if (!entryId || entryId === activeId) return;
    setError("");
    setStatusMsg("");
    setNotes([]);
    setFixes([]);
    setReviewMode("");
    setView("write");
    setLoadingEntry(true);
    try {
      const token = await getAccessToken();
      const data = await getEntry({ apiBase, token, entryId });
      const entry = data?.entry;
      if (entry) {
        setActiveId(entry.entry_id);
        setTitle(entry.title || "");
        setBody(entry.body || "");
        setEntryStatus(entry.status || "draft");
        savedSnapshotRef.current = { title: entry.title || "", body: entry.body || "" };
        setAutosave("idle");
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoadingEntry(false);
    }
  }

  async function handleNewEntry() {
    setError("");
    setStatusMsg("");
    setCreating(true);
    try {
      const token = await getAccessToken();
      const data = await createEntry({ apiBase, token, title: "", body: "" });
      const entry = data?.entry;
      if (entry) {
        setEntries((prev) => [entry, ...prev]);
        setActiveId(entry.entry_id);
        setTitle(entry.title || "");
        setBody("");
        setEntryStatus("draft");
        savedSnapshotRef.current = { title: entry.title || "", body: "" };
        setNotes([]);
        setFixes([]);
        setReviewMode("");
        setView("write");
        setAutosave("idle");
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  }

  const persist = useCallback(async () => {
    if (!activeId) return;
    const snap = savedSnapshotRef.current;
    if (snap && snap.title === title && snap.body === body) return;
    setAutosave("saving");
    try {
      const token = await getAccessToken();
      const data = await updateEntry({
        apiBase,
        token,
        entryId: activeId,
        updates: { title, body },
      });
      const entry = data?.entry;
      savedSnapshotRef.current = { title, body };
      setAutosave("saved");
      if (entry) {
        if ((entry.title || "") !== title) setTitle(entry.title || "");
        setEntryStatus(entry.status || "draft");
        setEntries((prev) =>
          prev.map((e) =>
            e.entry_id === activeId
              ? { ...e, title: entry.title, word_count: entry.word_count, status: entry.status, updated_at: entry.updated_at }
              : e,
          ),
        );
      }
    } catch (e) {
      setAutosave("idle");
      setError(e?.message || String(e));
    }
  }, [activeId, title, body, apiBase, getAccessToken]);

  useEffect(() => {
    if (!activeId || !isAuthed) return undefined;
    const snap = savedSnapshotRef.current;
    if (snap && snap.title === title && snap.body === body) return undefined;
    const t = setTimeout(() => {
      persist();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [title, body, activeId, isAuthed, persist]);

  async function handleSaveEntry() {
    if (!activeId) return;
    setError("");
    setStatusMsg("");
    setSavingEntry(true);
    try {
      const token = await getAccessToken();
      const data = await saveEntry({ apiBase, token, entryId: activeId, title, body });
      const entry = data?.entry;
      savedSnapshotRef.current = { title, body };
      setAutosave("saved");
      if (entry) {
        setEntryStatus(entry.status || "finalized");
        if ((entry.title || "") !== title) setTitle(entry.title || "");
        setEntries((prev) =>
          prev.map((e) =>
            e.entry_id === activeId
              ? { ...e, title: entry.title, word_count: entry.word_count, status: entry.status, updated_at: entry.updated_at }
              : e,
          ),
        );
      }
      setStatusMsg(
        data?.unchanged
          ? "Already saved to your story — no changes to add."
          : "Saved to your story. Kinin will weave this into your memories.",
      );
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSavingEntry(false);
    }
  }

  async function handleDelete() {
    if (!activeId) return;
    const confirmed = window.confirm(
      "You are about to delete this journal entry. This action cannot be undone.",
    );
    if (!confirmed) return;
    setError("");
    setStatusMsg("");
    setDeleting(true);
    try {
      const token = await getAccessToken();
      await deleteEntry({ apiBase, token, entryId: activeId });
      setEntries((prev) => prev.filter((e) => e.entry_id !== activeId));
      setActiveId("");
      setTitle("");
      setBody("");
      setNotes([]);
      setFixes([]);
      setReviewMode("");
      savedSnapshotRef.current = null;
      setStatusMsg("Entry deleted.");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setDeleting(false);
    }
  }

  async function runReview(mode) {
    if (!activeId || !body.trim() || overReviewCap) return;
    setError("");
    setStatusMsg("");
    setReviewMode(mode);
    // Make sure Kinin reviews exactly what's on screen.
    await persist();
    try {
      const token = await getAccessToken();
      const data = await reviewEntry({ apiBase, token, entryId: activeId, mode, title, body });
      if (mode === "cleanup") {
        setFixes(Array.isArray(data?.fixes) ? data.fixes : []);
        setNotes([]);
        if (!data?.fixes?.length) setStatusMsg("No spelling or punctuation issues found.");
      } else {
        setNotes(Array.isArray(data?.notes) ? data.notes : []);
        setFixes([]);
        if (!data?.notes?.length) setStatusMsg("Kinin didn't find gaps — this reads clearly.");
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setReviewMode("");
    }
  }

  function locateQuote(quote) {
    const q = String(quote || "");
    if (!q) return;
    setView("write");
    const el = bodyRef.current;
    if (!el) return;
    const idx = body.indexOf(q);
    if (idx < 0) {
      setStatusMsg("That passage has changed — couldn't highlight it.");
      return;
    }
    requestAnimationFrame(() => {
      el.focus();
      try {
        el.setSelectionRange(idx, idx + q.length);
      } catch {
        /* noop */
      }
    });
  }

  function applyFix(fix) {
    const quote = String(fix?.quote || "");
    const suggested = String(fix?.suggested_fix || "");
    if (!quote) return;
    const idx = body.indexOf(quote);
    if (idx < 0) {
      setStatusMsg("That passage has changed — couldn't apply this fix.");
      setFixes((prev) => prev.filter((f) => f !== fix));
      return;
    }
    const next = body.slice(0, idx) + suggested + body.slice(idx + quote.length);
    setBody(next);
    setFixes((prev) => prev.filter((f) => f !== fix));
    setView("write");
  }

  function dismissFix(fix) {
    setFixes((prev) => prev.filter((f) => f !== fix));
  }
  function dismissNote(note) {
    setNotes((prev) => prev.filter((n) => n !== note));
  }

  function handleTitleBlur() {
    if (!title.trim() && body.trim()) {
      // Mirror the backend: derive a title from the opening line.
      const firstLine = body.trim().split(/\r?\n/)[0].trim();
      const derived = firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
      setTitle(derived || "Untitled entry");
    }
  }

  const autosaveLabel =
    autosave === "saving" ? "Saving..." : autosave === "saved" ? "Saved" : "";

  return (
    <Section
      eyebrow="Journal"
      title={
        <>
          Write it your way,
          <br />
          <em>Kinin stays out of the way.</em>
        </>
      }
    >
      <div className="km-prose" style={{ maxWidth: 680, marginBottom: 24 }}>
        <p>
          A quiet place to write your memories in your own words. When you want a
          second pair of eyes, ask Kinin to review for thin spots or tidy up
          spelling — it never rewrites your voice. Save an entry to add it to your
          story.
        </p>
      </div>

      {statusMsg ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info">{statusMsg}</Banner>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="danger">{error}</Banner>
        </div>
      ) : null}

      <div className="km-row" style={{ gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Writing box — LEFT */}
        <div style={{ flex: "5 1 460px", minWidth: 320 }}>
          {loadingEntry ? (
            <div className="km-chat-empty">
              <Spinner /> Opening entry...
            </div>
          ) : activeId ? (
            <Frame>
              <div className="km-stack" style={{ gap: 12 }}>
                <TextInput
                  value={title}
                  onChange={(ev) => setTitle(ev.target.value)}
                  onBlur={handleTitleBlur}
                  placeholder="Title (fills from your first line if left blank)"
                  maxLength={TITLE_MAX_CHARS}
                  disabled={!isAuthed}
                />

                <div className="km-row" style={{ gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                  <div className="km-row" style={{ gap: 6 }}>
                    <Button
                      size="sm"
                      variant={view === "write" ? "primary" : "ghost"}
                      onClick={() => setView("write")}
                    >
                      <Pencil size={15} strokeWidth={1.5} /> Write
                    </Button>
                    <Button
                      size="sm"
                      variant={view === "preview" ? "primary" : "ghost"}
                      onClick={() => setView("preview")}
                    >
                      <Eye size={15} strokeWidth={1.5} /> Preview
                    </Button>
                  </div>
                  <span className="km-mono-label" style={{ opacity: 0.8 }}>
                    {words} words {autosaveLabel ? `· ${autosaveLabel}` : ""}
                  </span>
                </div>

                {view === "write" ? (
                  <TextArea
                    ref={bodyRef}
                    value={body}
                    onChange={(ev) => setBody(ev.target.value)}
                    placeholder="Write your memory here. Light Markdown works: **bold**, *italics*, # headings, - lists."
                    rows={18}
                    disabled={!isAuthed}
                  />
                ) : (
                  <div
                    className="km-prose"
                    style={{ minHeight: 240, padding: "4px 2px" }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
                  />
                )}

                {overReviewCap ? (
                  <div className="km-form-help" style={{ color: "var(--danger, #b00)" }}>
                    Reviews are limited to {REVIEW_MAX_WORDS.toLocaleString()} words. This entry has {words.toLocaleString()}.
                  </div>
                ) : null}

                <div className="km-row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
                  <div className="km-row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <Button
                      variant="primary"
                      onClick={handleSaveEntry}
                      disabled={!isAuthed || savingEntry || !body.trim()}
                    >
                      {savingEntry ? <Spinner /> : <Save size={16} strokeWidth={1.5} />} Save Journal Entry
                    </Button>
                    {entryStatus === "finalized" ? (
                      <span className="km-mono-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Check size={14} strokeWidth={2} /> In your story
                      </span>
                    ) : null}
                  </div>
                  <Button variant="danger" onClick={handleDelete} disabled={!isAuthed || deleting}>
                    {deleting ? <Spinner /> : <Trash2 size={16} strokeWidth={1.5} />} Delete
                  </Button>
                </div>
              </div>
            </Frame>
          ) : (
            <div className="km-chat-empty">Select an entry or start a new one to begin writing.</div>
          )}
        </div>

        {/* Entries — RIGHT */}
        <div style={{ flex: "1 1 180px", minWidth: 170, maxWidth: 220 }}>
          <div className="km-row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="km-mono-label">Entries</span>
            <Button size="sm" variant="primary" onClick={handleNewEntry} disabled={!isAuthed || creating}>
              {creating ? <Spinner /> : <Plus size={16} strokeWidth={1.5} />} New
            </Button>
          </div>
          {loadingList ? (
            <div className="km-chat-empty">
              <Spinner /> Loading...
            </div>
          ) : entries.length ? (
            <div className="km-stack" style={{ gap: 8 }}>
              {entries.map((e) => (
                <button
                  key={e.entry_id}
                  type="button"
                  onClick={() => openEntry(e.entry_id)}
                  className={`km-journal-entry${e.entry_id === activeId ? " is-active" : ""}`}
                >
                  <div className="km-journal-entry-title">{e.title || "Untitled entry"}</div>
                  <div className="km-mono-label km-journal-entry-meta">
                    {e.status === "finalized" ? "In your story" : "Draft"} · {formatDate(e.updated_at)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="km-chat-empty">No entries yet. Start a new one.</div>
          )}
        </div>
      </div>

      {/* Ask Kinin — BOTTOM, full width */}
      {activeId ? (
        <div className="km-stack" style={{ gap: 12, marginTop: 20 }}>
          <Frame label="Ask Kinin">
            <div className="km-stack" style={{ gap: 12 }}>
              <div className="km-row" style={{ gap: 8, flexWrap: "wrap" }}>
                <Button
                  size="sm"
                  onClick={() => runReview("review")}
                  disabled={!isAuthed || !body.trim() || overReviewCap || Boolean(reviewMode)}
                >
                  {reviewMode === "review" ? <Spinner /> : <Sparkles size={16} strokeWidth={1.5} />} Review my journal entry
                </Button>
                <Button
                  size="sm"
                  onClick={() => runReview("cleanup")}
                  disabled={!isAuthed || !body.trim() || overReviewCap || Boolean(reviewMode)}
                >
                  {reviewMode === "cleanup" ? <Spinner /> : <SpellCheck size={16} strokeWidth={1.5} />} Text clean-up
                </Button>
              </div>
              <div className="km-form-help">
                Kinin offers suggestions only — it never rewrites your words. You choose what to change.
              </div>
            </div>
          </Frame>

          {notes.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {notes.map((n, i) => (
                <div key={`note-${i}`} style={{ flex: "1 1 300px", minWidth: 260 }}>
                  <Frame>
                    <div className="km-row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span className="km-mono-label">{NOTE_LABELS[n.type] || "Note"}</span>
                      <button
                        type="button"
                        className="km-btn km-btn-ghost km-btn-sm"
                        onClick={() => dismissNote(n)}
                        aria-label="Dismiss"
                        style={{ padding: 4 }}
                      >
                        <X size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                    {n.quote ? (
                      <button
                        type="button"
                        onClick={() => locateQuote(n.quote)}
                        className="km-mono-label"
                        style={{ display: "block", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4, opacity: 0.85, textDecoration: "underline" }}
                      >
                        “{n.quote}”
                      </button>
                    ) : null}
                    <div style={{ marginTop: 6 }}>{n.note}</div>
                  </Frame>
                </div>
              ))}
            </div>
          ) : null}

          {fixes.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {fixes.map((f, i) => (
                <div key={`fix-${i}`} style={{ flex: "1 1 300px", minWidth: 260 }}>
                  <Frame>
                    <div style={{ textDecoration: "line-through", opacity: 0.7 }}>{f.quote}</div>
                    <div style={{ marginTop: 4, fontWeight: 600 }}>{f.suggested_fix}</div>
                    {f.reason ? <div className="km-mono-label" style={{ marginTop: 4 }}>{f.reason}</div> : null}
                    <div className="km-row" style={{ gap: 8, marginTop: 8 }}>
                      <Button size="sm" variant="primary" onClick={() => applyFix(f)}>
                        <Check size={14} strokeWidth={1.5} /> Apply
                      </Button>
                      <Button size="sm" onClick={() => dismissFix(f)}>
                        <X size={14} strokeWidth={1.5} /> Dismiss
                      </Button>
                    </div>
                  </Frame>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}
