import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Eye,
  ImagePlus,
  MapPin,
  Pencil,
  Plus,
  Save,
  SpellCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Banner, Button, Frame, Section, Spinner, TextArea, TextInput } from "../theme";
import DictationMic from "../components/DictationMic";
import {
  confirmPhoto,
  createEntry,
  deleteEntry,
  deletePhoto,
  getEntry,
  listEntries,
  presignPhoto,
  reviewEntry,
  saveEntry,
  updateEntry,
  updatePhotoCaption,
  uploadPhotoToS3,
} from "../services/journalClient";
import { updatePin } from "../services/pinsClient";

const TITLE_MAX_CHARS = 200;
const REVIEW_MAX_WORDS = 6000;
const AUTOSAVE_DEBOUNCE_MS = 1200;
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_CAPTION_MAX = 300;
const SUPPORTED_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"];

// Convert iOS HEIC/HEIF to JPEG on-device (most browsers can't render HEIC).
// Non-HEIC files are returned untouched (we store originals, no recompression).
async function prepareImageFile(file) {
  const isHeic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!isHeic) return file;
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const name = file.name.replace(/\.(heic|heif)$/i, ".jpg") || "photo.jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

function readImageDims(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

const NOTE_LABELS = {
  thin: "Feels thin",
  unclear: "Unclear",
  question: "Question",
};

function countWords(text) {
  return (text || "").trim() ? (text || "").trim().split(/\s+/).length : 0;
}

// Prefix errors with the operation that failed, and translate raw fetch
// transport failures ("Load failed" / "Failed to fetch") into something clearer.
function describeError(context, e) {
  const raw = e?.message || String(e || "");
  const isNetwork = /load failed|failed to fetch|networkerror/i.test(raw);
  const detail = isNetwork ? "network request didn't complete (connection or CORS)" : raw;
  return `${context}: ${detail}`;
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
  voiceFeaturesEnabled = false,
  openEntryId = "",
  onEntryOpened,
  onOpenHelp,
}) {
  const [entries, setEntries] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [listFilter, setListFilter] = useState("all"); // all | draft | finalized
  const [entrySearch, setEntrySearch] = useState("");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [entryStatus, setEntryStatus] = useState("draft");
  const [sourcePinId, setSourcePinId] = useState("");
  const [sourcePinCompleted, setSourcePinCompleted] = useState(false);
  const [completingPin, setCompletingPin] = useState(false);

  const [attachments, setAttachments] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

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
      setError(describeError("Couldn't load your entries", e));
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
        setSourcePinId(entry.source_pin_id || "");
        setSourcePinCompleted(Boolean(entry.source_pin_completed));
        setAttachments(Array.isArray(entry.attachments) ? entry.attachments : []);
        savedSnapshotRef.current = { title: entry.title || "", body: entry.body || "" };
        setAutosave("idle");
      }
    } catch (e) {
      setError(describeError("Couldn't open that entry", e));
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
        setSourcePinId(entry.source_pin_id || "");
        setSourcePinCompleted(Boolean(entry.source_pin_completed));
        setAttachments([]);
        savedSnapshotRef.current = { title: entry.title || "", body: "" };
        setNotes([]);
        setFixes([]);
        setReviewMode("");
        setView("write");
        setAutosave("idle");
      }
    } catch (e) {
      setError(describeError("Couldn't create a new entry", e));
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
      setAutosave("error");
      setError(describeError("Autosave failed", e));
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
      setError(describeError("Couldn't save to your story", e));
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
      setAttachments([]);
      setNotes([]);
      setFixes([]);
      setReviewMode("");
      savedSnapshotRef.current = null;
      setStatusMsg("Entry deleted.");
    } catch (e) {
      setError(describeError("Couldn't delete that entry", e));
    } finally {
      setDeleting(false);
    }
  }

  async function handleCompletePin() {
    if (!activeId || !sourcePinId || sourcePinCompleted) return;
    setError("");
    setStatusMsg("");
    setCompletingPin(true);
    try {
      const token = await getAccessToken();
      await updatePin({ apiBase, token, pinId: sourcePinId, updates: { status: "completed" } });
      // Remember on the entry so we don't offer this again on reopen.
      await updateEntry({
        apiBase,
        token,
        entryId: activeId,
        updates: { source_pin_completed: true },
      });
      setSourcePinCompleted(true);
      setStatusMsg("Linked pin marked complete.");
    } catch (e) {
      setError(describeError("Couldn't mark the linked pin complete", e));
    } finally {
      setCompletingPin(false);
    }
  }

  async function handleAddPhotos(fileList) {
    if (!activeId) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const remaining = MAX_PHOTOS - attachments.length;
    if (remaining <= 0) {
      setError(`You can attach up to ${MAX_PHOTOS} photos per entry.`);
      return;
    }
    setError("");
    setStatusMsg("");
    setUploadingPhoto(true);
    try {
      const token = await getAccessToken();
      let latest = attachments;
      for (const raw of files.slice(0, remaining)) {
        let file;
        try {
          file = await prepareImageFile(raw);
        } catch {
          setError("Couldn't read that image (HEIC conversion failed).");
          continue;
        }
        const mime = file.type;
        if (!SUPPORTED_PHOTO_MIME.includes(mime)) {
          setError("Unsupported image type. Use JPEG, PNG, or WebP.");
          continue;
        }
        if (file.size > MAX_PHOTO_BYTES) {
          setError(`Each photo must be under ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)}MB.`);
          continue;
        }
        const dims = await readImageDims(file);
        const pre = await presignPhoto({
          apiBase,
          token,
          entryId: activeId,
          mime,
          bytes: file.size,
          filename: file.name,
        });
        await uploadPhotoToS3({ uploadUrl: pre.upload_url, file, mime });
        const confirmed = await confirmPhoto({
          apiBase,
          token,
          entryId: activeId,
          photoId: pre.photo_id,
          mime,
          width: dims.width,
          height: dims.height,
          caption: "",
        });
        if (Array.isArray(confirmed?.attachments)) latest = confirmed.attachments;
        setAttachments(latest);
      }
      const count = latest.length;
      setEntries((prev) =>
        prev.map((e) => (e.entry_id === activeId ? { ...e, photo_count: count } : e)),
      );
    } catch (e) {
      setError(describeError("Couldn't attach that photo", e));
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function handleRemovePhoto(photoId) {
    if (!activeId || !photoId) return;
    const confirmed = window.confirm("Remove this photo from the entry? This cannot be undone.");
    if (!confirmed) return;
    setError("");
    try {
      const token = await getAccessToken();
      const data = await deletePhoto({ apiBase, token, entryId: activeId, photoId });
      const next = Array.isArray(data?.attachments) ? data.attachments : [];
      setAttachments(next);
      setEntries((prev) =>
        prev.map((e) => (e.entry_id === activeId ? { ...e, photo_count: next.length } : e)),
      );
    } catch (e) {
      setError(describeError("Couldn't remove that photo", e));
    }
  }

  function handleCaptionChange(photoId, value) {
    setAttachments((prev) =>
      prev.map((a) => (a.photo_id === photoId ? { ...a, caption: value.slice(0, PHOTO_CAPTION_MAX) } : a)),
    );
  }

  async function handleCaptionBlur(photoId) {
    const att = attachments.find((a) => a.photo_id === photoId);
    if (!att) return;
    try {
      const token = await getAccessToken();
      await updatePhotoCaption({ apiBase, token, entryId: activeId, photoId, caption: att.caption || "" });
    } catch (e) {
      setError(describeError("Couldn't save that caption", e));
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
      setError(describeError("Kinin couldn't finish that review", e));
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

  // Append dictated speech to the body at the caret (or end), matching how
  // the chat mic feeds transcript into its input.
  const appendDictation = useCallback((chunk) => {
    const clean = String(chunk || "").trim();
    if (!clean) return;
    setBody((prev) => {
      const base = prev || "";
      const joiner = base && !/\s$/.test(base) ? " " : "";
      return base + joiner + clean;
    });
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) {
        el.focus();
        try {
          el.setSelectionRange(el.value.length, el.value.length);
        } catch {
          /* noop */
        }
      }
    });
  }, []);

  function handleTitleBlur() {
    if (!title.trim() && body.trim()) {
      // Mirror the backend: derive a title from the opening line.
      const firstLine = body.trim().split(/\r?\n/)[0].trim();
      const derived = firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
      setTitle(derived || "Untitled entry");
    }
  }

  const autosaveLabel =
    autosave === "saving"
      ? "Saving..."
      : autosave === "saved"
      ? "Saved"
      : autosave === "error"
      ? "Autosave paused — use Save"
      : "";

  const statusCounts = useMemo(() => {
    let draft = 0;
    let finalized = 0;
    for (const e of entries) {
      if (e.status === "finalized") finalized += 1;
      else draft += 1;
    }
    return { all: entries.length, draft, finalized };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = entrySearch.trim().toLowerCase();
    return entries.filter((e) => {
      if (listFilter === "draft" && e.status !== "draft") return false;
      if (listFilter === "finalized" && e.status !== "finalized") return false;
      if (!q) return true;
      return `${e.title || ""} ${e.preview || ""}`.toLowerCase().includes(q);
    });
  }, [entries, listFilter, entrySearch]);

  // Entries arrive newest-first, so month buckets come out newest-first too.
  const groupedEntries = useMemo(() => {
    const groups = [];
    let currentKey = null;
    for (const e of filteredEntries) {
      const raw = e.updated_at || e.created_at || "";
      const d = new Date(raw);
      const key = Number.isNaN(d.getTime())
        ? "Undated"
        : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(d);
      if (key !== currentKey) {
        groups.push({ label: key, items: [e] });
        currentKey = key;
      } else {
        groups[groups.length - 1].items.push(e);
      }
    }
    return groups;
  }, [filteredEntries]);

  const listTabs = [
    { key: "all", label: "All", count: statusCounts.all },
    { key: "draft", label: "Drafts", count: statusCounts.draft },
    { key: "finalized", label: "In your story", count: statusCounts.finalized },
  ];

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
                  <div className="km-row" style={{ gap: 10, alignItems: "center" }}>
                    {voiceFeaturesEnabled && view === "write" ? (
                      <DictationMic
                        voiceFeaturesEnabled={voiceFeaturesEnabled}
                        disabled={!isAuthed}
                        onText={appendDictation}
                        size={18}
                      />
                    ) : null}
                    <span className="km-mono-label" style={{ opacity: 0.8 }}>
                      {words} words {autosaveLabel ? `· ${autosaveLabel}` : ""}
                    </span>
                  </div>
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

                {/* Photo attachments */}
                <div className="km-stack" style={{ gap: 8 }}>
                  <div className="km-row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <span className="km-mono-label">
                      Photos ({attachments.length}/{MAX_PHOTOS})
                    </span>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                      multiple
                      style={{ display: "none" }}
                      onChange={(ev) => handleAddPhotos(ev.target.files)}
                    />
                    <Button
                      size="sm"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={!isAuthed || uploadingPhoto || attachments.length >= MAX_PHOTOS}
                    >
                      {uploadingPhoto ? <Spinner /> : <ImagePlus size={15} strokeWidth={1.5} />} Add photo
                    </Button>
                  </div>

                  {attachments.length ? (
                    <div className="km-journal-photos">
                      {attachments.map((att) => (
                        <div key={att.photo_id} className="km-journal-photo">
                          <div className="km-journal-photo-frame">
                            {att.url ? (
                              <img src={att.url} alt={att.caption || "Journal photo"} loading="lazy" />
                            ) : (
                              <div className="km-journal-photo-fallback">Photo</div>
                            )}
                            <button
                              type="button"
                              className="km-journal-photo-remove"
                              onClick={() => handleRemovePhoto(att.photo_id)}
                              aria-label="Remove photo"
                              title="Remove photo"
                            >
                              <X size={14} strokeWidth={2} />
                            </button>
                          </div>
                          <TextInput
                            value={att.caption || ""}
                            onChange={(ev) => handleCaptionChange(att.photo_id, ev.target.value)}
                            onBlur={() => handleCaptionBlur(att.photo_id)}
                            placeholder="Add a caption (optional)"
                            maxLength={PHOTO_CAPTION_MAX}
                            disabled={!isAuthed}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {attachments.length ? (
                    <div className="km-form-help">
                      Photos are shared with family in Reunion once you Save this entry to your story.
                    </div>
                  ) : null}
                </div>

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

                {onOpenHelp ? (
                  <div className="km-form-help">
                    Questions about editing, privacy, or your account?{" "}
                    <button type="button" className="km-help-entry-link" onClick={onOpenHelp}>
                      Kinin Help
                    </button>
                  </div>
                ) : null}

                {sourcePinId ? (
                  <div className="km-row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <MapPin size={15} strokeWidth={1.5} style={{ opacity: 0.7, flexShrink: 0 }} />
                    {sourcePinCompleted ? (
                      <span className="km-mono-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Check size={14} strokeWidth={2} /> Linked pin completed
                      </span>
                    ) : (
                      <Button size="sm" onClick={handleCompletePin} disabled={!isAuthed || completingPin}>
                        {completingPin ? <Spinner /> : <Check size={15} strokeWidth={1.5} />} Mark linked pin complete
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            </Frame>
          ) : (
            <div className="km-chat-empty">Select an entry or start a new one to begin writing.</div>
          )}
        </div>

        {/* Entries — RIGHT */}
        <div style={{ flex: "2 1 240px", minWidth: 230, maxWidth: 320 }}>
          <div className="km-row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span className="km-mono-label">Entries</span>
            <Button size="sm" variant="primary" onClick={handleNewEntry} disabled={!isAuthed || creating}>
              {creating ? <Spinner /> : <Plus size={16} strokeWidth={1.5} />} New
            </Button>
          </div>

          <div style={{ marginBottom: 8 }}>
            <TextInput
              value={entrySearch}
              onChange={(ev) => setEntrySearch(ev.target.value)}
              placeholder="Search entries..."
              aria-label="Search entries"
              disabled={!isAuthed}
            />
          </div>

          <div className="km-row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {listTabs.map((tab) => (
              <Button
                key={tab.key}
                size="sm"
                variant={listFilter === tab.key ? "primary" : "ghost"}
                onClick={() => setListFilter(tab.key)}
                aria-pressed={listFilter === tab.key}
              >
                {tab.label} ({tab.count})
              </Button>
            ))}
          </div>

          {loadingList ? (
            <div className="km-chat-empty">
              <Spinner /> Loading...
            </div>
          ) : !entries.length ? (
            <div className="km-chat-empty">No entries yet. Start a new one.</div>
          ) : !filteredEntries.length ? (
            <div className="km-chat-empty">
              {entrySearch.trim() ? "No entries match your search." : "Nothing in this view yet."}
            </div>
          ) : (
            <div
              className="km-journal-entry-list"
              style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}
            >
              {groupedEntries.map((group) => (
                <div key={group.label} className="km-stack" style={{ gap: 8, marginBottom: 14 }}>
                  <div
                    className="km-mono-label"
                    style={{
                      position: "sticky",
                      top: 0,
                      background: "var(--cream)",
                      padding: "4px 0",
                      opacity: 0.75,
                      zIndex: 1,
                    }}
                  >
                    {group.label}
                  </div>
                  {group.items.map((e) => (
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
              ))}
            </div>
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
