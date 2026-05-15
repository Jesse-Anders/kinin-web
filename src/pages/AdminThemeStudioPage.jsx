import { useEffect, useMemo, useState } from "react";
import {
  applyTheme,
  clearOverrides,
  encodeOverridesToUrl,
  mergeTokens,
  readOverrides,
  writeOverrides,
} from "../theme/applyTheme";
import {
  COLOR_GROUPS,
  FONT_CHOICES,
  defaultTokens,
} from "../theme/tokens";
import {
  Banner,
  Button,
  ChatRow,
  Colophon,
  DocHeader,
  Eyebrow,
  Field,
  Frame,
  Page,
  Section,
} from "../theme";

// ─────────────────────────────────────────────────────────────────────────────
//  /admin/theme — Theme Studio
//
//  - Reads tokens from src/theme/tokens.js (defaults)
//  - Overlays admin overrides from localStorage
//  - Writes every change live to :root CSS variables via applyTheme()
//  - Exports the current state as a tokens.js paste, downloadable JSON, or
//    shareable preview URL with the overrides base64-encoded.
// ─────────────────────────────────────────────────────────────────────────────

function isRgba(value) {
  return typeof value === "string" && value.trim().toLowerCase().startsWith("rgb");
}

const SAMPLE_CHAT = [
  {
    role: "assistant",
    content:
      "When you picture your kids reading this someday — is there a particular moment you hope they'll find?",
  },
  {
    role: "user",
    content:
      "There's this summer I spent on my uncle's ranch in Montana when I was 19. It changed how I saw the world.",
  },
];

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function tokensToFileSource(t) {
  const json = JSON.stringify(t, null, 2)
    .replace(/"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, "$1:");
  return `// Exported from the Kinin Theme Studio at ${new Date().toISOString()}.
// Replace the body of \`defaultTokens\` in src/theme/tokens.js with the object
// literal below, save, and redeploy. The helper exports (COLOR_GROUPS,
// FONT_CHOICES, mergeTokens, tokensToCssVars) in that file stay as-is.

export const defaultTokens = ${json};
`;
}

function downloadFile(filename, content, mime = "text/plain") {
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
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export default function AdminThemeStudioPage() {
  const [tokens, setTokens] = useState(() =>
    mergeTokens(defaultTokens, readOverrides() || {}),
  );
  const [toast, setToast] = useState("");

  // Apply every change live to :root.
  useEffect(() => {
    applyTheme(diffFromDefaults(tokens));
  }, [tokens]);

  const overrides = useMemo(() => diffFromDefaults(tokens), [tokens]);
  const hasOverrides = Object.keys(overrides).length > 0;

  function setColor(key, value) {
    setTokens((prev) => ({
      ...prev,
      color: { ...prev.color, [key]: value },
    }));
    persist({ ...tokens, color: { ...tokens.color, [key]: value } });
  }

  function setFont(slot, value) {
    setTokens((prev) => ({
      ...prev,
      font: { ...prev.font, [slot]: value },
    }));
    persist({ ...tokens, font: { ...tokens.font, [slot]: value } });
  }

  function setSize(key, value) {
    const numeric = Number(value);
    const v = Number.isFinite(numeric) ? numeric : value;
    setTokens((prev) => ({
      ...prev,
      size: { ...prev.size, [key]: v },
    }));
    persist({ ...tokens, size: { ...tokens.size, [key]: v } });
  }

  function setSpace(key, value) {
    setTokens((prev) => ({
      ...prev,
      space: { ...prev.space, [key]: value },
    }));
    persist({ ...tokens, space: { ...tokens.space, [key]: value } });
  }

  function setMotion(key, value) {
    setTokens((prev) => ({
      ...prev,
      motion: { ...prev.motion, [key]: value },
    }));
    persist({ ...tokens, motion: { ...tokens.motion, [key]: value } });
  }

  function persist(next) {
    const diff = diffFromDefaults(next);
    writeOverrides(diff);
  }

  function flashToast(text) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2400);
  }

  function onReset() {
    clearOverrides();
    setTokens(deepClone(defaultTokens));
    applyTheme();
    flashToast("Reset to defaults.");
  }

  async function onCopyTokens() {
    const ok = await copyToClipboard(tokensToFileSource(tokens));
    flashToast(ok ? "Copied tokens.js snippet to clipboard." : "Copy failed.");
  }

  function onDownloadTokens() {
    downloadFile("tokens.js", tokensToFileSource(tokens), "text/javascript");
    flashToast("Downloaded tokens.js.");
  }

  async function onCopyShareUrl() {
    const encoded = encodeOverridesToUrl(overrides);
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = encoded ? `${base}?theme=${encoded}` : base;
    const ok = await copyToClipboard(url);
    flashToast(ok ? "Preview URL copied." : "Copy failed.");
  }

  return (
    <div className="studio">
      <style>{STUDIO_CSS}</style>

      <header className="studio-bar">
        <div className="studio-bar-left">
          <div className="studio-title">Theme Studio</div>
          <div className="studio-subtitle">
            Edits are local to this browser. Export when you're happy.
          </div>
        </div>
        <div className="studio-bar-actions">
          <button className="studio-btn" onClick={onCopyShareUrl} disabled={!hasOverrides} title="Share a preview URL with the current overrides baked in.">
            Copy preview URL
          </button>
          <button className="studio-btn" onClick={onCopyTokens}>
            Copy tokens.js
          </button>
          <button className="studio-btn" onClick={onDownloadTokens}>
            Download tokens.js
          </button>
          <button className="studio-btn studio-btn-danger" onClick={onReset} disabled={!hasOverrides}>
            Reset
          </button>
        </div>
        {toast ? <div className="studio-toast">{toast}</div> : null}
      </header>

      <div className="studio-cols">
        {/* — Controls — */}
        <aside className="studio-controls">
          {COLOR_GROUPS.map((group) => (
            <ControlGroup key={group.label} title={group.label}>
              {group.keys.map((key) => (
                <ColorRow
                  key={key}
                  name={key}
                  value={tokens.color[key]}
                  defaultValue={defaultTokens.color[key]}
                  onChange={(v) => setColor(key, v)}
                />
              ))}
            </ControlGroup>
          ))}

          <ControlGroup title="Typography">
            <SelectRow
              label="Display font"
              value={tokens.font.display}
              options={FONT_CHOICES.display}
              onChange={(v) => setFont("display", v)}
            />
            <SelectRow
              label="Body font"
              value={tokens.font.body}
              options={FONT_CHOICES.body}
              onChange={(v) => setFont("body", v)}
            />
            <SelectRow
              label="Mono font"
              value={tokens.font.mono}
              options={FONT_CHOICES.mono}
              onChange={(v) => setFont("mono", v)}
            />
          </ControlGroup>

          <ControlGroup title="Headline sizes">
            <NumberRow
              label="H1 min (px)"
              value={tokens.size.h1Min}
              min={32}
              max={120}
              onChange={(v) => setSize("h1Min", v)}
            />
            <NumberRow
              label="H1 max (px)"
              value={tokens.size.h1Max}
              min={60}
              max={220}
              onChange={(v) => setSize("h1Max", v)}
            />
            <NumberRow
              label="H2 min (px)"
              value={tokens.size.h2Min}
              min={24}
              max={80}
              onChange={(v) => setSize("h2Min", v)}
            />
            <NumberRow
              label="H2 max (px)"
              value={tokens.size.h2Max}
              min={40}
              max={140}
              onChange={(v) => setSize("h2Max", v)}
            />
            <NumberRow
              label="Quote min (px)"
              value={tokens.size.quoteMin}
              min={18}
              max={60}
              onChange={(v) => setSize("quoteMin", v)}
            />
            <NumberRow
              label="Quote max (px)"
              value={tokens.size.quoteMax}
              min={26}
              max={84}
              onChange={(v) => setSize("quoteMax", v)}
            />
          </ControlGroup>

          <ControlGroup title="Layout">
            <TextRow
              label="Container max"
              value={tokens.space.containerMax}
              onChange={(v) => setSpace("containerMax", v)}
            />
            <TextRow
              label="Page gutter"
              value={tokens.space.pageGutter}
              onChange={(v) => setSpace("pageGutter", v)}
            />
            <TextRow
              label="Section vertical"
              value={tokens.space.sectionY}
              onChange={(v) => setSpace("sectionY", v)}
            />
          </ControlGroup>

          <ControlGroup title="Motion">
            <RangeRow
              label="Noise overlay"
              value={Number(tokens.motion.noiseOpacity)}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setMotion("noiseOpacity", String(v))}
              display={`${Math.round(Number(tokens.motion.noiseOpacity) * 100)}%`}
            />
          </ControlGroup>

          <div className="studio-footnote">
            Default tokens live in <code>src/theme/tokens.js</code>. The Studio
            only stores the diff in <code>localStorage</code> — your edits
            don't ship until you paste the exported file into the repo.
          </div>
        </aside>

        {/* — Live preview — */}
        <section className="studio-preview">
          <Page>
            <DocHeader
              left="Kinin · Theme Studio"
              mark="— Memoirist, in motion."
              right="Live preview"
            />

            <section className="km-cover">
              <div className="km-cover-meta">One conversation at a time</div>
              <h1 className="km-h1">
                Your story,
                <br />
                <em>preserved.</em>
              </h1>
              <p className="km-cover-sub">
                Kinin is an AI-powered biographical interviewer. It asks
                thoughtful questions, listens carefully, and follows your
                lead — building a rich personal narrative, session by session.
              </p>
              <div className="km-cover-foot">
                <Field label="Format" value="Guided conversation" />
                <Field label="Cadence" value="As often as you wish" />
                <Field label="Audience" value="You · your people" />
                <Field label="Posture" value="Patient, generous" />
              </div>
            </section>

            <Section
              meta="01 / Foundation"
              eyebrow="What Kinin is for"
              title={<>The stories that <em>matter</em>, in your own voice.</>}
            >
              <div className="km-twocol">
                <div className="km-quote">
                  "The goal isn't to record a life. It's to <em>preserve</em>{" "}
                  the moments <span className="km-strike">behind</span> the
                  moments."
                </div>
                <div className="km-prose">
                  <p>
                    Kinin helps you tell the story of your life, one
                    conversation at a time. Your memories, experiences, and
                    reflections come together as a living biography.
                  </p>
                  <p>
                    You're never locked into a script. If a question sparks a
                    memory you want to follow, follow it. Each session picks up
                    where you left off.
                  </p>
                </div>
              </div>
            </Section>

            <Section
              meta="02 / The Interview"
              eyebrow="A conversation, in motion"
              title={<>What a session <em>looks like.</em></>}
            >
              <Frame label="Fig. 01 — Sample exchange">
                <div className="km-chat">
                  {SAMPLE_CHAT.map((m, i) => (
                    <ChatRow key={i} role={m.role}>
                      {m.content}
                    </ChatRow>
                  ))}
                </div>
              </Frame>
            </Section>

            <Section
              meta="03 / Care & Cadence"
              eyebrow="A few small preferences"
              title={<>Preferences, <em>plainly stated.</em></>}
            >
              <Frame label="Form 01 — Personal details">
                <div className="km-form-grid">
                  <label className="km-form-row">
                    <div className="km-form-label">Preferred name</div>
                    <input className="km-form-input" defaultValue="Eleanor" />
                    <div className="km-form-help">
                      How Kinin will address you in conversation.
                    </div>
                  </label>
                  <label className="km-form-row">
                    <div className="km-form-label">Reminder cadence</div>
                    <input className="km-form-input" defaultValue="Every two weeks" />
                  </label>
                </div>
                <div className="km-form-actions">
                  <Button>Cancel</Button>
                  <Button variant="primary">Save preferences</Button>
                </div>
              </Frame>
            </Section>

            <Banner tone="info">
              <span>
                <strong>Local-only.</strong> These tweaks live in your
                browser's localStorage until you export them.
              </span>
            </Banner>

            <Colophon
              left={`Kinin · ${new Date().getFullYear()}`}
              mark="— with patience, and the time it takes."
              right="Theme Studio"
            />
          </Page>
        </section>
      </div>
    </div>
  );
}

// ─── Helper components for the Studio chrome ──────────────────────────────

function ControlGroup({ title, children }) {
  return (
    <div className="studio-group">
      <div className="studio-group-title">{title}</div>
      <div className="studio-group-body">{children}</div>
    </div>
  );
}

function ColorRow({ name, value, defaultValue, onChange }) {
  const editableAsPicker = !isRgba(value);
  return (
    <div className="studio-row">
      <div className="studio-row-label">
        {humanize(name)}
        {value !== defaultValue ? <span className="studio-dot" /> : null}
      </div>
      <div className="studio-row-controls">
        <span
          className="studio-swatch"
          style={{ background: value }}
          aria-hidden="true"
        />
        {editableAsPicker ? (
          <input
            type="color"
            value={value}
            onInput={(e) => onChange(e.target.value)}
            onChange={(e) => onChange(e.target.value)}
            className="studio-color"
          />
        ) : null}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="studio-text studio-text-mono"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function SelectRow({ label, value, options, onChange }) {
  // If the current value isn't one of the curated choices, include it as the
  // first option so it isn't lost.
  const seen = new Set(options);
  const allOptions = seen.has(value) ? options : [value, ...options];
  return (
    <div className="studio-row">
      <div className="studio-row-label">{label}</div>
      <div className="studio-row-controls">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="studio-select"
        >
          {allOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt.replace(/['"]/g, "").split(",")[0]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function NumberRow({ label, value, onChange, min, max }) {
  return (
    <div className="studio-row">
      <div className="studio-row-label">{label}</div>
      <div className="studio-row-controls">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="studio-text"
        />
      </div>
    </div>
  );
}

function TextRow({ label, value, onChange }) {
  return (
    <div className="studio-row">
      <div className="studio-row-label">{label}</div>
      <div className="studio-row-controls">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="studio-text studio-text-mono"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function RangeRow({ label, value, min, max, step, onChange, display }) {
  return (
    <div className="studio-row">
      <div className="studio-row-label">
        {label}
        {display ? <span className="studio-row-aux">{display}</span> : null}
      </div>
      <div className="studio-row-controls">
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          className="studio-range"
        />
      </div>
    </div>
  );
}

function humanize(camel) {
  return camel
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase());
}

// Compute the minimal diff between current tokens and defaults so we only
// store/share what actually changed.
function diffFromDefaults(t) {
  const out = {};
  for (const group of Object.keys(defaultTokens)) {
    const base = defaultTokens[group];
    const cur = t[group];
    if (!cur) continue;
    const groupDiff = {};
    for (const key of Object.keys(base)) {
      const baseVal = base[key];
      const curVal = cur[key];
      if (curVal !== undefined && String(curVal) !== String(baseVal)) {
        groupDiff[key] = curVal;
      }
    }
    if (Object.keys(groupDiff).length) out[group] = groupDiff;
  }
  return out;
}

// ─── Studio chrome styles (stable; do NOT consume tokens) ─────────────────

const STUDIO_CSS = `
.studio {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #111;
  background: #fafafa;
  min-height: 100vh;
  padding: 0;
}

.studio-bar {
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
.studio-title {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #d6cdb8;
}
.studio-subtitle {
  font-size: 12px;
  color: #8c7d62;
  margin-top: 2px;
}
.studio-bar-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.studio-btn {
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
.studio-btn:hover:not(:disabled) { background: #2a2218; color: #fff; border-color: #b84e2d; }
.studio-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.studio-btn-danger { color: #f4a48c; }
.studio-btn-danger:hover:not(:disabled) { background: #5d1e10; border-color: #b84e2d; color: #fff; }

.studio-toast {
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
}

.studio-cols {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 0;
  min-height: calc(100vh - 64px);
}

.studio-controls {
  background: #1f1a12;
  color: #d6cdb8;
  padding: 24px 22px 80px;
  border-right: 1px solid #2c2419;
  overflow-y: auto;
  max-height: calc(100vh - 64px);
  position: sticky;
  top: 64px;
  font-size: 13px;
}

.studio-group {
  border-bottom: 1px solid #2c2419;
  padding-bottom: 20px;
  margin-bottom: 20px;
}
.studio-group:last-child { border-bottom: none; }
.studio-group-title {
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #b84e2d;
  margin-bottom: 14px;
  font-weight: 600;
}
.studio-group-body { display: grid; gap: 10px; }

.studio-row {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 10px;
  align-items: center;
  font-size: 12px;
}
.studio-row-label {
  color: #b8ad96;
  text-transform: capitalize;
  display: flex;
  align-items: center;
  gap: 8px;
}
.studio-row-aux {
  margin-left: auto;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  color: #d6cdb8;
}
.studio-dot {
  width: 6px; height: 6px; border-radius: 999px;
  background: #b84e2d;
  display: inline-block;
}
.studio-row-controls { display: flex; align-items: center; gap: 8px; }

.studio-swatch {
  width: 22px; height: 22px;
  border: 1px solid #3a3328;
  flex-shrink: 0;
  display: inline-block;
}
.studio-color {
  width: 24px; height: 24px;
  border: 1px solid #3a3328;
  background: transparent;
  padding: 0;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  flex-shrink: 0;
}
.studio-color::-webkit-color-swatch-wrapper { padding: 0; }
.studio-color::-webkit-color-swatch { border: none; }

.studio-text, .studio-select {
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
}
.studio-text:focus, .studio-select:focus { border-color: #b84e2d; }
.studio-text-mono { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }

.studio-range {
  flex: 1;
  accent-color: #b84e2d;
}

.studio-footnote {
  font-size: 11px;
  color: #8c7d62;
  line-height: 1.55;
  padding: 16px 0 0;
  border-top: 1px dashed #2c2419;
  margin-top: 12px;
}
.studio-footnote code {
  font-family: ui-monospace, Menlo, monospace;
  background: #15110a;
  padding: 1px 5px;
  color: #d6cdb8;
}

.studio-preview {
  overflow-y: auto;
  max-height: calc(100vh - 64px);
  background: var(--cream);
  padding: 24px 0 80px;
  position: relative;
}
.studio-preview .km-page { max-width: 980px; }

@media (max-width: 1100px) {
  .studio-cols { grid-template-columns: 320px 1fr; }
  .studio-row { grid-template-columns: 110px 1fr; }
}
@media (max-width: 860px) {
  .studio-cols { grid-template-columns: 1fr; }
  .studio-controls { position: static; max-height: none; }
  .studio-preview { max-height: none; }
}
`;
