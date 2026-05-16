import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  /admin/email — Email Studio
//
//  - Loads email_content.json from the lambda
//  - Renders an editable form for globals (header / colophon / legal) and
//    each template's per-template fields.
//  - Pushes every edit through /admin/email_studio/preview (debounced) so
//    the right-pane <iframe> shows the rendered email in near-real-time.
//  - "Save" writes the JSON back to the repo via /admin/email_studio/save_content
//    (also offers a "Download JSON" fallback for read-only deploys).
//  - "Send test to…" hits /admin/email_studio/test_send to mail the rendered
//    template through SES.
// ─────────────────────────────────────────────────────────────────────────────

const PREVIEW_DEBOUNCE_MS = 350;

const GLOBAL_GROUPS = [
  {
    key: "header",
    title: "Header (used in every email)",
    fields: [
      { key: "mark_image_url", label: "Mark image URL", kind: "text" },
      { key: "mark_alt", label: "Mark alt text", kind: "text" },
      { key: "mark_link_url", label: "Mark link URL", kind: "text" },
      { key: "tagline", label: "Tagline (mono caps)", kind: "text" },
    ],
  },
  {
    key: "colophon",
    title: "Colophon (dark band, used in every email)",
    fields: [
      { key: "year_label", label: "Year label", kind: "text" },
      { key: "motto", label: "Default motto", kind: "text" },
      { key: "contact_email", label: "Contact email", kind: "text" },
      { key: "contact_url", label: "Contact URL", kind: "text" },
      { key: "contact_url_label", label: "Contact URL label", kind: "text" },
      { key: "address", label: "Mailing address", kind: "text" },
    ],
  },
  {
    key: "legal",
    title: "Legal / unsubscribe (used in every email)",
    fields: [
      { key: "unsubscribe_lead", label: "Unsubscribe lead-in", kind: "text" },
      { key: "unsubscribe_link_label", label: "Unsubscribe link label", kind: "text" },
      { key: "privacy_boilerplate", label: "Privacy boilerplate", kind: "longtext" },
      { key: "privacy_link_label", label: "Privacy link label", kind: "text" },
      { key: "copyright", label: "Copyright line", kind: "text" },
    ],
  },
];

// Heuristic: long, multi-sentence, or HTML-bearing fields render as <textarea>.
function classifyTemplateField(value) {
  if (value === null || value === undefined) return "text";
  const s = String(value);
  if (s.length > 80) return "longtext";
  if (s.includes("<") || s.includes("\n")) return "longtext";
  return "text";
}

function humanize(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/Html/g, "HTML")
    .replace(/Url/g, "URL")
    .replace(/Cta/g, "CTA");
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function downloadFile(filename, content, mime = "application/json") {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function adminFetch(apiBase, getAccessToken, endpoint, body) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${apiBase}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    const outer = JSON.parse(text);
    parsed = typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const detail = parsed ? JSON.stringify(parsed) : text;
    const err = new Error(`API error ${res.status}: ${detail}`);
    err.status = res.status;
    err.parsed = parsed;
    throw err;
  }
  return parsed;
}

export default function AdminEmailStudioPage({ isAuthed, getAccessToken, apiBase }) {
  const [content, setContent] = useState(null);
  const [originalContent, setOriginalContent] = useState(null);
  const [templates, setTemplates] = useState([]); // [{key, path, subject, doc_title, preheader}]
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [previewHtml, setPreviewHtml] = useState("");
  const [previewMeta, setPreviewMeta] = useState({ subject: "", preheader: "" });
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [saveBusy, setSaveBusy] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [toastTone, setToastTone] = useState("ok"); // "ok" | "err"

  const debounceRef = useRef(null);
  const previewSeqRef = useRef(0);

  const dirty = useMemo(() => {
    if (!content || !originalContent) return false;
    return JSON.stringify(content) !== JSON.stringify(originalContent);
  }, [content, originalContent]);

  // Dynamic tokens for the currently selected template. We use this to
  // warn the admin if a copy field references {{user_name}} (or similar)
  // that is no longer present after their edits — content fields are
  // re-substituted in pass 2 by the senders, so a missing dynamic token
  // would render as the literal `{{user_name}}` placeholder.
  const selectedDynamicTokens = useMemo(() => {
    const t = templates.find((x) => x.key === selectedKey);
    return Array.isArray(t?.dynamic_tokens) ? t.dynamic_tokens : [];
  }, [templates, selectedKey]);

  const droppedDynamicTokens = useMemo(() => {
    if (!content?.templates?.[selectedKey] || !originalContent?.templates?.[selectedKey]) {
      return [];
    }
    const original = originalContent.templates[selectedKey];
    const current = content.templates[selectedKey];
    const dropped = new Set();
    for (const fieldKey of Object.keys(original)) {
      const before = String(original[fieldKey] ?? "");
      const after = String(current[fieldKey] ?? "");
      if (!before || before === after) continue;
      const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
      const beforeTokens = new Set();
      let m;
      while ((m = re.exec(before))) beforeTokens.add(m[1]);
      const afterTokens = new Set();
      re.lastIndex = 0;
      while ((m = re.exec(after))) afterTokens.add(m[1]);
      for (const tok of beforeTokens) {
        if (!afterTokens.has(tok) && !tok.startsWith("__")) {
          dropped.add(tok);
        }
      }
    }
    return Array.from(dropped).sort();
  }, [content, originalContent, selectedKey]);

  function flashToast(text, tone = "ok") {
    setToast(text);
    setToastTone(tone);
    window.setTimeout(() => setToast(""), 2800);
  }

  // ── Initial load ──────────────────────────────────────────────────────────
  const loadContent = useCallback(async () => {
    if (!isAuthed) return;
    setLoading(true);
    setLoadError("");
    try {
      const parsed = await adminFetch(
        apiBase,
        getAccessToken,
        "/admin/email_studio/get_content",
        {},
      );
      const doc = parsed?.content || null;
      const tmpls = parsed?.templates || [];
      if (!doc) throw new Error("Empty response from /admin/email_studio/get_content");
      setContent(doc);
      setOriginalContent(deepClone(doc));
      setTemplates(tmpls);
      setSelectedKey((prev) => prev || tmpls[0]?.key || "");
    } catch (e) {
      setLoadError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, getAccessToken, isAuthed]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  // ── Debounced preview render ──────────────────────────────────────────────
  const renderPreview = useCallback(
    async (key, doc) => {
      if (!key || !doc) return;
      const seq = ++previewSeqRef.current;
      setPreviewBusy(true);
      setPreviewError("");
      try {
        const parsed = await adminFetch(
          apiBase,
          getAccessToken,
          "/admin/email_studio/preview",
          { template_key: key, overrides: doc },
        );
        if (seq !== previewSeqRef.current) return; // stale
        setPreviewHtml(parsed?.html || "");
        setPreviewMeta({
          subject: parsed?.subject || "",
          preheader: parsed?.preheader || "",
        });
      } catch (e) {
        if (seq !== previewSeqRef.current) return;
        setPreviewError(e.message || String(e));
      } finally {
        if (seq === previewSeqRef.current) setPreviewBusy(false);
      }
    },
    [apiBase, getAccessToken],
  );

  useEffect(() => {
    if (!selectedKey || !content) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      renderPreview(selectedKey, content);
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selectedKey, content, renderPreview]);

  // ── Edit helpers ──────────────────────────────────────────────────────────
  function setGlobalField(group, fieldKey, value) {
    setContent((prev) => {
      if (!prev) return prev;
      const next = { ...prev, globals: { ...prev.globals } };
      next.globals[group] = { ...(next.globals[group] || {}), [fieldKey]: value };
      return next;
    });
  }

  function setTemplateField(templateKey, fieldKey, value) {
    setContent((prev) => {
      if (!prev) return prev;
      const next = { ...prev, templates: { ...prev.templates } };
      next.templates[templateKey] = {
        ...(next.templates[templateKey] || {}),
        [fieldKey]: value,
      };
      return next;
    });
  }

  function resetEdits() {
    if (!originalContent) return;
    setContent(deepClone(originalContent));
    flashToast("Edits reset to last-saved version.");
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  async function onSave() {
    if (!content) return;
    setSaveBusy(true);
    try {
      const parsed = await adminFetch(
        apiBase,
        getAccessToken,
        "/admin/email_studio/save_content",
        { content },
      );
      setOriginalContent(deepClone(content));
      if (parsed?.written) {
        flashToast("Saved email_content.json on disk. Commit + push to ship.");
      } else {
        flashToast(parsed?.warning || "Saved (download fallback — see warning).", "err");
      }
    } catch (e) {
      flashToast(e.message || "Save failed.", "err");
    } finally {
      setSaveBusy(false);
    }
  }

  function onDownloadJson() {
    if (!content) return;
    const serialized = JSON.stringify(content, null, 2);
    downloadFile("email_content.json", serialized);
    flashToast("Downloaded email_content.json.");
  }

  async function onCopyJson() {
    if (!content) return;
    const ok = await copyToClipboard(JSON.stringify(content, null, 2));
    flashToast(ok ? "Copied JSON to clipboard." : "Copy failed.", ok ? "ok" : "err");
  }

  async function onTestSend() {
    if (!content || !selectedKey) return;
    const recipient = (testRecipient || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      flashToast("Enter a valid recipient email.", "err");
      return;
    }
    setTestBusy(true);
    try {
      const parsed = await adminFetch(
        apiBase,
        getAccessToken,
        "/admin/email_studio/test_send",
        { template_key: selectedKey, overrides: content, recipient },
      );
      flashToast(`Sent to ${parsed?.recipient || recipient}.`, "ok");
    } catch (e) {
      flashToast(e.message || "Test send failed.", "err");
    } finally {
      setTestBusy(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const selectedTemplateBlock =
    selectedKey && content?.templates ? content.templates[selectedKey] : null;
  const selectedSummary = templates.find((t) => t.key === selectedKey);

  return (
    <div className="estudio">
      <style>{STUDIO_CSS}</style>

      <header className="estudio-bar">
        <div className="estudio-bar-left">
          <div className="estudio-title">Email Studio</div>
          <div className="estudio-subtitle">
            Edit globals + per-template copy, preview live, send a test, then
            save back to the repo and ship via PR.
          </div>
        </div>
        <div className="estudio-bar-actions">
          <input
            type="email"
            placeholder="recipient@example.com"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            className="estudio-text estudio-recipient"
            disabled={testBusy || !isAuthed}
            autoComplete="off"
          />
          <button
            className="estudio-btn"
            onClick={onTestSend}
            disabled={!isAuthed || !content || testBusy || !selectedKey}
            title="Render this template with current edits and email it via SES."
          >
            {testBusy ? "Sending..." : "Send test"}
          </button>
          <button
            className="estudio-btn"
            onClick={onCopyJson}
            disabled={!content}
            title="Copy the current email_content.json document to clipboard."
          >
            Copy JSON
          </button>
          <button
            className="estudio-btn"
            onClick={onDownloadJson}
            disabled={!content}
            title="Download email_content.json (use this if Save can't write to disk)."
          >
            Download JSON
          </button>
          <button
            className="estudio-btn estudio-btn-danger"
            onClick={resetEdits}
            disabled={!dirty}
            title="Discard local edits and restore the last-saved values."
          >
            Reset
          </button>
          <button
            className="estudio-btn estudio-btn-primary"
            onClick={onSave}
            disabled={!isAuthed || !dirty || saveBusy}
            title="Persist the current document to email_content.json on disk."
          >
            {saveBusy ? "Saving..." : dirty ? "Save" : "Saved"}
          </button>
        </div>
        {toast ? (
          <div className={`estudio-toast ${toastTone === "err" ? "is-err" : ""}`}>{toast}</div>
        ) : null}
      </header>

      {loadError ? (
        <div className="estudio-fatal">
          <strong>Could not load email content.</strong>
          <div>{loadError}</div>
          <button className="estudio-btn" onClick={loadContent} style={{ marginTop: 12 }}>
            Retry
          </button>
        </div>
      ) : null}

      {!loadError && (loading || !content) ? (
        <div className="estudio-fatal">Loading email content…</div>
      ) : null}

      {!loadError && content ? (
        <div className="estudio-cols">
          {/* ── Left: editor ────────────────────────────────────────── */}
          <aside className="estudio-controls">
            <ControlGroup title="Templates">
              <div className="estudio-template-list">
                {templates.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`estudio-template-row ${
                      t.key === selectedKey ? "is-active" : ""
                    }`}
                    onClick={() => setSelectedKey(t.key)}
                  >
                    <div className="estudio-template-key">{t.key}</div>
                    <div className="estudio-template-subject">
                      {t.subject || <em>(no subject)</em>}
                    </div>
                  </button>
                ))}
              </div>
            </ControlGroup>

            {selectedTemplateBlock ? (
              <ControlGroup title={`Template: ${selectedKey}`}>
                {Object.keys(selectedTemplateBlock).length === 0 ? (
                  <div className="estudio-footnote">
                    No editable fields for this template.
                  </div>
                ) : (
                  Object.entries(selectedTemplateBlock).map(([fieldKey, value]) => (
                    <FieldRow
                      key={fieldKey}
                      label={humanize(fieldKey)}
                      hint={
                        fieldKey === "colophon_motto_override"
                          ? "Leave blank to inherit the global motto."
                          : null
                      }
                      kind={classifyTemplateField(value)}
                      value={value === null || value === undefined ? "" : String(value)}
                      onChange={(v) => setTemplateField(selectedKey, fieldKey, v || null)}
                    />
                  ))
                )}
              </ControlGroup>
            ) : null}

            {GLOBAL_GROUPS.map((group) => (
              <ControlGroup key={group.key} title={group.title}>
                {group.fields.map((f) => (
                  <FieldRow
                    key={f.key}
                    label={f.label}
                    kind={f.kind}
                    value={
                      content?.globals?.[group.key]?.[f.key] === undefined ||
                      content?.globals?.[group.key]?.[f.key] === null
                        ? ""
                        : String(content.globals[group.key][f.key])
                    }
                    onChange={(v) => setGlobalField(group.key, f.key, v)}
                  />
                ))}
              </ControlGroup>
            ))}

            <div className="estudio-footnote">
              Edits live in your browser until you press <code>Save</code>. The
              save endpoint writes <code>email_content.json</code> on the lambda
              filesystem; commit the file in <code>kinin-lambda</code> and ship
              a PR for the change to reach production. If the lambda's
              filesystem is read-only, use <code>Download JSON</code> instead.
            </div>
          </aside>

          {/* ── Right: live preview ─────────────────────────────────── */}
          <section className="estudio-preview">
            <div className="estudio-preview-meta">
              <div className="estudio-meta-row">
                <span className="estudio-meta-label">Subject</span>
                <span className="estudio-meta-value">
                  {previewMeta.subject || <em>—</em>}
                </span>
              </div>
              <div className="estudio-meta-row">
                <span className="estudio-meta-label">Preheader</span>
                <span className="estudio-meta-value">
                  {previewMeta.preheader || <em>—</em>}
                </span>
              </div>
              <div className="estudio-meta-row">
                <span className="estudio-meta-label">Template</span>
                <span className="estudio-meta-value">
                  {selectedSummary?.path || selectedKey}
                </span>
              </div>
              {selectedDynamicTokens.length ? (
                <div className="estudio-meta-row">
                  <span className="estudio-meta-label">Dyn. tokens</span>
                  <span className="estudio-meta-value estudio-token-list">
                    {selectedDynamicTokens.map((tok) => (
                      <code
                        key={tok}
                        className={
                          droppedDynamicTokens.includes(tok)
                            ? "estudio-token estudio-token-missing"
                            : "estudio-token"
                        }
                        title={
                          droppedDynamicTokens.includes(tok)
                            ? `Warning: an edit you made dropped {{${tok}}} from a content field. The sender may render the literal placeholder.`
                            : `Dynamic token populated by the sender at send time.`
                        }
                      >
                        {`{{${tok}}}`}
                      </code>
                    ))}
                  </span>
                </div>
              ) : null}
              {droppedDynamicTokens.length ? (
                <div className="estudio-meta-row estudio-meta-warn">
                  Warning — your edits removed{" "}
                  {droppedDynamicTokens.map((t) => `{{${t}}}`).join(", ")}{" "}
                  from a copy field. The sender will render those literally.
                </div>
              ) : null}
              {previewBusy ? (
                <div className="estudio-meta-row estudio-meta-busy">
                  rendering preview…
                </div>
              ) : null}
              {previewError ? (
                <div className="estudio-meta-row estudio-meta-err">
                  {previewError}
                </div>
              ) : null}
            </div>
            <iframe
              key={selectedKey}
              title={`Preview: ${selectedKey}`}
              className="estudio-iframe"
              srcDoc={previewHtml || "<!doctype html><html><body></body></html>"}
              sandbox="allow-same-origin"
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ControlGroup({ title, children }) {
  return (
    <div className="estudio-group">
      <div className="estudio-group-title">{title}</div>
      <div className="estudio-group-body">{children}</div>
    </div>
  );
}

function FieldRow({ label, hint, kind, value, onChange }) {
  const isLong = kind === "longtext";
  return (
    <div className={`estudio-row ${isLong ? "is-long" : ""}`}>
      <div className="estudio-row-label">
        <span>{label}</span>
        {hint ? <span className="estudio-row-hint">{hint}</span> : null}
      </div>
      <div className="estudio-row-controls">
        {isLong ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="estudio-textarea"
            spellCheck={false}
            rows={Math.min(10, Math.max(2, Math.ceil((value || "").length / 60)))}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="estudio-text"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Studio chrome — kept independent of the site's --tokens so the Studio's UI
//  doesn't change when an admin edits the site theme.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_CSS = `
.estudio {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #111;
  background: #fafafa;
  min-height: 100vh;
}
.estudio-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  background: #15110a;
  color: #f4ebd6;
  padding: 14px 28px 12px;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid #2c2419;
}
.estudio-title {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #d6cdb8;
}
.estudio-subtitle {
  font-size: 12px;
  color: #8c7d62;
  margin-top: 2px;
}
.estudio-bar-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
}
.estudio-btn {
  appearance: none;
  background: transparent;
  border: 1px solid #3a3328;
  color: #d6cdb8;
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 8px 14px;
  cursor: pointer;
  transition: all 0.18s;
  border-radius: 0;
}
.estudio-btn:hover:not(:disabled) {
  background: #2a2218;
  color: #fff;
  border-color: #b84e2d;
}
.estudio-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.estudio-btn-primary {
  background: #b84e2d;
  border-color: #b84e2d;
  color: #fff;
}
.estudio-btn-primary:hover:not(:disabled) {
  background: #9a3f24;
  border-color: #9a3f24;
}
.estudio-btn-danger { color: #f4a48c; }
.estudio-btn-danger:hover:not(:disabled) {
  background: #5d1e10;
  border-color: #b84e2d;
  color: #fff;
}
.estudio-recipient {
  background: #15110a;
  border: 1px solid #3a3328;
  color: #f4ebd6;
  font-size: 12px;
  font-family: ui-monospace, Menlo, monospace;
  padding: 8px 10px;
  width: 230px;
}
.estudio-recipient:focus { border-color: #b84e2d; outline: none; }

.estudio-toast {
  position: fixed;
  top: 16px;
  right: 16px;
  background: #15110a;
  color: #f4ebd6;
  padding: 10px 16px;
  font-size: 12px;
  letter-spacing: 0.04em;
  border: 1px solid #b84e2d;
  z-index: 50;
  max-width: 360px;
}
.estudio-toast.is-err {
  border-color: #f4a48c;
  color: #f4a48c;
}

.estudio-fatal {
  padding: 32px 28px;
  color: #4d3f2a;
  font-size: 14px;
  background: #fafafa;
}

.estudio-cols {
  display: grid;
  grid-template-columns: 440px 1fr;
  gap: 0;
  min-height: calc(100vh - 64px);
}
.estudio-controls {
  background: #1f1a12;
  color: #d6cdb8;
  padding: 20px 22px 80px;
  border-right: 1px solid #2c2419;
  overflow-y: auto;
  max-height: calc(100vh - 64px);
  position: sticky;
  top: 64px;
  font-size: 13px;
}

.estudio-group {
  border-bottom: 1px solid #2c2419;
  padding-bottom: 18px;
  margin-bottom: 18px;
}
.estudio-group:last-child { border-bottom: none; }
.estudio-group-title {
  font-size: 10px;
  letter-spacing: 0.20em;
  text-transform: uppercase;
  color: #b84e2d;
  margin-bottom: 12px;
  font-weight: 600;
}
.estudio-group-body { display: grid; gap: 10px; }

.estudio-template-list { display: grid; gap: 6px; }
.estudio-template-row {
  text-align: left;
  background: transparent;
  border: 1px solid #2c2419;
  color: #d6cdb8;
  padding: 8px 10px;
  cursor: pointer;
  font-family: inherit;
  display: grid;
  gap: 2px;
}
.estudio-template-row:hover {
  border-color: #b84e2d;
}
.estudio-template-row.is-active {
  background: #2a2218;
  border-color: #b84e2d;
  color: #fff;
}
.estudio-template-key {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  letter-spacing: 0.05em;
  color: #f4ebd6;
}
.estudio-template-subject {
  font-size: 12px;
  color: #8c7d62;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.estudio-row {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 10px;
  align-items: center;
  font-size: 12px;
}
.estudio-row.is-long {
  grid-template-columns: 130px 1fr;
  align-items: start;
}
.estudio-row-label {
  color: #b8ad96;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 2px;
}
.estudio-row-hint {
  font-size: 10px;
  color: #6a5e47;
  font-style: italic;
}
.estudio-row-controls { display: flex; align-items: center; gap: 8px; }

.estudio-text, .estudio-textarea {
  flex: 1;
  min-width: 0;
  background: #15110a;
  border: 1px solid #3a3328;
  color: #f4ebd6;
  padding: 6px 8px;
  font-family: inherit;
  font-size: 12px;
  border-radius: 0;
  outline: none;
  width: 100%;
  resize: vertical;
}
.estudio-text:focus, .estudio-textarea:focus { border-color: #b84e2d; }
.estudio-textarea {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
}

.estudio-footnote {
  font-size: 11px;
  color: #8c7d62;
  line-height: 1.55;
  padding: 14px 0 0;
  border-top: 1px dashed #2c2419;
  margin-top: 12px;
}
.estudio-footnote code {
  font-family: ui-monospace, Menlo, monospace;
  background: #15110a;
  padding: 1px 5px;
  color: #d6cdb8;
}

.estudio-preview {
  background: #f2e5ca;
  padding: 24px 24px 80px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  max-height: calc(100vh - 64px);
}
.estudio-preview-meta {
  background: #fff;
  border: 1px solid #d5cdba;
  padding: 14px 16px;
  display: grid;
  gap: 6px;
  font-size: 12px;
}
.estudio-meta-row {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 12px;
  align-items: baseline;
}
.estudio-meta-label {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #7a6b50;
}
.estudio-meta-value {
  color: #1a140b;
  word-break: break-word;
}
.estudio-meta-busy { color: #7a6b50; font-style: italic; }
.estudio-meta-err { color: #b84e2d; }
.estudio-meta-warn {
  color: #b84e2d;
  background: #fff4e6;
  border: 1px solid #f4c891;
  padding: 8px 10px;
  margin-top: 6px;
  font-size: 11.5px;
  line-height: 1.5;
  display: block;
  grid-column: 1 / -1;
}
.estudio-token-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.estudio-token {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10.5px;
  background: #f4ebd6;
  border: 1px solid #d5cdba;
  color: #1a140b;
  padding: 1px 6px;
  border-radius: 0;
  cursor: help;
}
.estudio-token-missing {
  background: #fff4e6;
  border-color: #b84e2d;
  color: #b84e2d;
}

.estudio-iframe {
  width: 100%;
  flex: 1;
  min-height: 720px;
  background: #fff;
  border: 1px solid #d5cdba;
}

@media (max-width: 1100px) {
  .estudio-cols { grid-template-columns: 360px 1fr; }
  .estudio-row { grid-template-columns: 110px 1fr; }
  .estudio-recipient { width: 180px; }
}
@media (max-width: 860px) {
  .estudio-cols { grid-template-columns: 1fr; }
  .estudio-controls { position: static; max-height: none; }
  .estudio-preview { max-height: none; }
}
`;
