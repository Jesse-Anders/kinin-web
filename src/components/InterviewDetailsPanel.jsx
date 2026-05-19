import { Button, DetailRow, Spinner } from "../theme";

const LABEL_GROUPS = [
  { key: "user_focus_labels", label: "User focus" },
  { key: "user_interest_labels", label: "User interests" },
  { key: "must_avoid_topics", label: "Must avoid topics" },
  { key: "handle_lightly_topics", label: "Handle lightly topics" },
];

const TTS_MODEL_OPTIONS = [
  { value: "chatterbox-turbo", label: "Turbo (low latency)" },
  { value: "", label: "Standard (default quality)" },
];

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
  ttsVoicePrompt,
  setTtsVoicePrompt,
}) {
  const showTtsToggle = typeof setTtsModel === "function";
  const currentTtsModel =
    typeof ttsModel === "string" ? ttsModel : "chatterbox-turbo";
  const showVoiceUuidInput = typeof setTtsVoiceUuid === "function";
  const currentVoiceUuid = typeof ttsVoiceUuid === "string" ? ttsVoiceUuid : "";
  const showVoicePromptInput = typeof setTtsVoicePrompt === "function";
  const currentVoicePrompt =
    typeof ttsVoicePrompt === "string" ? ttsVoicePrompt : "";
  const VOICE_PROMPT_MAX = 1000;
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
            Kinin Voice · Voice UUID override
          </div>
          <div className="km-row" style={{ gap: 6, alignItems: "stretch" }}>
            <input
              value={currentVoiceUuid}
              onChange={(e) => setTtsVoiceUuid(e.target.value.trim())}
              placeholder="Leave blank to use server default"
              className="km-input-compact"
              style={{ flex: 1 }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <button
              type="button"
              onClick={() => setTtsVoiceUuid("")}
              disabled={!currentVoiceUuid}
              className="km-tts-model-pill"
              title="Clear override and use server default"
            >
              Reset
            </button>
          </div>
          <div className="km-muted" style={{ marginTop: 6, fontSize: 12 }}>
            Override the Resemble voice for this browser. Refresh after
            pasting a new UUID is not required — it applies to the next
            synthesis. Note: some voices are model-specific (e.g. a
            standard Chatterbox voice may not work with Turbo).
          </div>
        </div>
      ) : null}

      {showVoicePromptInput ? (
        <div>
          <div className="km-mono-label" style={{ marginBottom: 6 }}>
            Kinin Voice · Style prompt
          </div>
          <textarea
            value={currentVoicePrompt}
            onChange={(e) =>
              setTtsVoicePrompt(e.target.value.slice(0, VOICE_PROMPT_MAX))
            }
            placeholder={
              'e.g. "Speak in a calm, warm tone. Pause slightly between sentences."'
            }
            className="km-input-compact"
            style={{
              width: "100%",
              minHeight: 64,
              resize: "vertical",
              fontFamily: "inherit",
              lineHeight: 1.4,
            }}
            spellCheck
            maxLength={VOICE_PROMPT_MAX}
          />
          <div
            className="km-row"
            style={{ justifyContent: "space-between", marginTop: 4 }}
          >
            <button
              type="button"
              onClick={() => setTtsVoicePrompt("")}
              disabled={!currentVoicePrompt}
              className="km-tts-model-pill"
              title="Clear prompt"
            >
              Reset
            </button>
            <span
              className="km-muted"
              style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
            >
              {currentVoicePrompt.length} / {VOICE_PROMPT_MAX}
            </span>
          </div>
          <div className="km-muted" style={{ marginTop: 6, fontSize: 12 }}>
            Free-text style prompt sent to Resemble per synthesis (their
            "description" field). May add ~100–400 ms per call. Empty =
            no prompt. Note: Resemble officially supports this field on
            Voice Settings Presets; we send it inline, so it may be
            ignored depending on backend behavior — check CloudWatch
            elapsed_ms and listen for tonal change after toggling.
          </div>
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
