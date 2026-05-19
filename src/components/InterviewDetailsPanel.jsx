import { useCallback, useEffect, useState } from "react";
import { Button, DetailRow, Spinner } from "../theme";
import { listTtsPresets } from "../services/ttsPresetsClient";
import { VOICE_OPTIONS } from "../services/voiceCatalog";

const LABEL_GROUPS = [
  { key: "user_focus_labels", label: "User focus" },
  { key: "user_interest_labels", label: "User interests" },
  { key: "must_avoid_topics", label: "Must avoid topics" },
  { key: "handle_lightly_topics", label: "Handle lightly topics" },
];

// Order matters — first entry is the product default (used when no
// localStorage value is set). Standard is the safe default: most of our
// curated voices aren't compatible with chatterbox-turbo, and Resemble's
// turbo workers periodically OOM (HTTP 503 ResourcesExhausted). Turbo
// remains as a dev toggle for latency comparison.
const TTS_MODEL_OPTIONS = [
  { value: "", label: "Standard (default)" },
  { value: "chatterbox-turbo", label: "Turbo (low latency, voice-restricted)" },
];

const PRESET_NONE_VALUE = "none";

export default function InterviewDetailsPanel({
  isAuthed,
  busy,
  sessionId,
  setSessionId,
  detailsBusy,
  updateInterviewDetails,
  journeyVersion,
  labelGroups,
  progressForDisplay,
  uiState,
  ttsModel,
  setTtsModel,
  ttsVoiceUuid,
  setTtsVoiceUuid,
  ttsPresetUuid,
  setTtsPresetUuid,
}) {
  // Note: ttsVoicePrompt / setTtsVoicePrompt are no longer consumed here
  // (Resemble silently ignores inline `description`; we use preset_uuid
  // instead). Wiring remains intact in App.jsx in case Resemble's
  // synthesize endpoint ever honors inline descriptions.
  const showTtsToggle = typeof setTtsModel === "function";
  const currentTtsModel = typeof ttsModel === "string" ? ttsModel : "";
  const showVoiceUuidInput = typeof setTtsVoiceUuid === "function";
  const currentVoiceUuid = typeof ttsVoiceUuid === "string" ? ttsVoiceUuid : "";
  const showPresetPicker = typeof setTtsPresetUuid === "function";
  const currentPresetUuid =
    typeof ttsPresetUuid === "string" ? ttsPresetUuid : "";

  const [presets, setPresets] = useState({ custom: [], default: [] });
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetsError, setPresetsError] = useState("");

  const fetchPresets = useCallback(async () => {
    if (!isAuthed || !showPresetPicker) return;
    setPresetsLoading(true);
    setPresetsError("");
    try {
      const data = await listTtsPresets();
      setPresets({
        custom: data.customPresets || [],
        default: data.defaultPresets || [],
      });
    } catch (e) {
      setPresetsError(e?.message || String(e));
    } finally {
      setPresetsLoading(false);
    }
  }, [isAuthed, showPresetPicker]);

  useEffect(() => {
    void fetchPresets();
  }, [fetchPresets]);

  const allPresets = [...(presets.custom || []), ...(presets.default || [])];
  const selectedPreset = allPresets.find((p) => p?.uuid === currentPresetUuid);
  return (
    <div className="km-stack" style={{ gap: 18 }}>
      <div className="km-row" style={{ justifyContent: "space-between" }}>
        <Button
          size="sm"
          onClick={updateInterviewDetails}
          disabled={!isAuthed || !sessionId || detailsBusy}
        >
          {detailsBusy ? (
            <>
              <Spinner /> Updating...
            </>
          ) : (
            "Refresh"
          )}
        </Button>
        <span className="km-mono-label">Manual refresh</span>
      </div>

      {showTtsToggle ? (
        <div>
          <div className="km-mono-label" style={{ marginBottom: 6 }}>
            Kinin Voice · TTS model (A/B)
          </div>
          <div
            className="km-row"
            style={{ gap: 6, flexWrap: "wrap", alignItems: "stretch" }}
          >
            {TTS_MODEL_OPTIONS.map((opt) => {
              const isActive = currentTtsModel === opt.value;
              return (
                <button
                  key={opt.value || "default"}
                  type="button"
                  onClick={() => setTtsModel(opt.value)}
                  className={`km-tts-model-pill${
                    isActive ? " km-tts-model-pill-active" : ""
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="km-muted" style={{ marginTop: 6, fontSize: 12 }}>
            Applies to the next sentence/turn synthesized.
          </div>
        </div>
      ) : null}

      {showVoiceUuidInput ? (
        <div>
          <div className="km-mono-label" style={{ marginBottom: 6 }}>
            Kinin Voice · Voice
          </div>
          <select
            value={currentVoiceUuid}
            onChange={(e) => setTtsVoiceUuid(e.target.value)}
            className="km-input-compact"
            style={{ width: "100%" }}
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v.uuid} value={v.uuid}>
                {v.name}
                {v.isDefault ? " (default)" : ""} — {v.uuid}
              </option>
            ))}
            {/*
              If the stored UUID isn't in our curated list (e.g. legacy
              localStorage value), render it as a fallback option so the
              dropdown still reflects state instead of silently switching.
            */}
            {currentVoiceUuid &&
            !VOICE_OPTIONS.find((v) => v.uuid === currentVoiceUuid) ? (
              <option value={currentVoiceUuid}>
                Custom — {currentVoiceUuid}
              </option>
            ) : null}
          </select>
          <div className="km-muted" style={{ marginTop: 6, fontSize: 12 }}>
            Choose Kinin&rsquo;s Resemble voice. Picking <em>Ember</em>{" "}
            restores the product default. Note: some voices are
            model-specific (e.g. a standard Chatterbox voice may not work
            with Turbo).
          </div>
        </div>
      ) : null}

      {showPresetPicker ? (
        <div>
          <div className="km-mono-label" style={{ marginBottom: 6 }}>
            Kinin Voice · Voice Settings Preset
          </div>
          <div className="km-row" style={{ gap: 6, alignItems: "stretch" }}>
            <select
              value={currentPresetUuid}
              onChange={(e) => setTtsPresetUuid(e.target.value)}
              className="km-input-compact"
              style={{ flex: 1 }}
              disabled={presetsLoading}
            >
              <option value={PRESET_NONE_VALUE}>
                — None (no preset applied) —
              </option>
              {(presets.custom || []).length ? (
                <optgroup label="Custom presets">
                  {(presets.custom || []).map((p) => (
                    <option key={p.uuid} value={p.uuid}>
                      {p.name || p.uuid}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {(presets.default || []).length ? (
                <optgroup label="Default presets">
                  {(presets.default || []).map((p) => (
                    <option key={p.uuid} value={p.uuid}>
                      {p.name || p.uuid}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <button
              type="button"
              onClick={() => { void fetchPresets(); }}
              disabled={!isAuthed || presetsLoading}
              className="km-tts-model-pill"
              title="Refresh preset list from Resemble"
            >
              {presetsLoading ? "…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() =>
                setTtsPresetUuid("6b6bfa07-e246-42ed-9362-4641b85bac79")
              }
              disabled={
                currentPresetUuid === "6b6bfa07-e246-42ed-9362-4641b85bac79"
              }
              className="km-tts-model-pill"
              title="Restore Kinin default (Warmth)"
            >
              Default
            </button>
          </div>
          {presetsError ? (
            <div
              className="km-muted"
              style={{ marginTop: 6, fontSize: 12, color: "var(--crimson)" }}
            >
              Failed to load presets: {presetsError}
            </div>
          ) : null}
          {selectedPreset?.settings ? (
            <div
              className="km-muted"
              style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5 }}
            >
              {selectedPreset.settings.description
                ? `“${selectedPreset.settings.description}”`
                : ""}
              {selectedPreset.settings.description ? <br /> : null}
              <span style={{ fontFamily: "var(--font-mono)" }}>
                pace {selectedPreset.settings.pace ?? "1"} · temp{" "}
                {selectedPreset.settings.temperature ?? "0.8"} · exag{" "}
                {selectedPreset.settings.exaggeration ?? "0.5"}
              </span>
            </div>
          ) : (
            <div className="km-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Voice Settings Presets are managed in Resemble's dashboard.
              This list is fetched live via the Resemble API. Selected
              preset's settings (pace/temperature/exaggeration/description)
              are applied to every synthesis call.
            </div>
          )}
        </div>
      ) : null}

      <DetailRow label="Journey version" value={journeyVersion || "—"} />

      {LABEL_GROUPS.map(({ key, label }) => (
        <DetailRow
          key={key}
          label={label}
          value={labelGroups?.[key]?.length ? labelGroups[key].join(", ") : "—"}
        />
      ))}

      <div>
        <DetailRow
          label="Journey progress"
          value={
            <>
              <strong>{progressForDisplay.percent}%</strong>{" "}
              <span className="km-muted">
                ({progressForDisplay.complete_steps} complete,{" "}
                {progressForDisplay.closed_steps} closed /{" "}
                {progressForDisplay.total_steps} total)
              </span>
            </>
          }
        />
        <div className="km-progress">
          <div
            className="km-progress-bar"
            style={{
              width: `${Math.min(100, Math.max(0, progressForDisplay.percent))}%`,
            }}
          />
        </div>
      </div>

      <DetailRow
        label="Mode"
        value={
          <>
            <strong>{uiState?.mode || "—"}</strong>
            {uiState?.current_step_title ? (
              <>
                {" "}— Step: <strong>{uiState.current_step_title}</strong>
              </>
            ) : null}
          </>
        }
      />

      {uiState?.interviewer_step_specific_context ? (
        <DetailRow
          label="Interviewer step context"
          value={<strong>{uiState.interviewer_step_specific_context}</strong>}
        />
      ) : null}
      {uiState?.evaluator_step_specific_context ? (
        <DetailRow
          label="Evaluator step context"
          value={<strong>{uiState.evaluator_step_specific_context}</strong>}
        />
      ) : null}

      <DetailRow
        label="Pending advance"
        value={
          <strong>
            {uiState?.pending_advance && Object.keys(uiState.pending_advance).length
              ? JSON.stringify(uiState.pending_advance)
              : "—"}
          </strong>
        }
      />

      <div>
        <div className="km-mono-label" style={{ marginBottom: 6 }}>session_id</div>
        <input
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.target.value);
            localStorage.setItem("session_id", e.target.value);
          }}
          placeholder="session_id (optional — leave blank to auto-create)"
          className="km-input-compact"
          disabled={busy}
        />
      </div>

      {uiState && uiState.mode === "guided" ? (
        <div className="km-stepfields">
          <div className="km-mono-label" style={{ marginBottom: 10 }}>Step fields</div>
          <div className="km-row" style={{ alignItems: "flex-start", gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div className="km-mono-label" style={{ color: "var(--sage-deep)", marginBottom: 4 }}>Covered</div>
              <ul className="km-list-bare">
                {(uiState.covered_fields || []).length ? (
                  (uiState.covered_fields || []).map((f, i) => <li key={"c-" + i}>{f}</li>)
                ) : (
                  <li className="km-muted">(none yet)</li>
                )}
              </ul>
            </div>
            <div style={{ flex: 1 }}>
              <div className="km-mono-label" style={{ color: "var(--crimson)", marginBottom: 4 }}>Uncovered</div>
              <ul className="km-list-bare">
                {(uiState.uncovered_fields || []).length ? (
                  (uiState.uncovered_fields || []).map((f, i) => <li key={"u-" + i}>{f}</li>)
                ) : (
                  <li className="km-muted">(none)</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
