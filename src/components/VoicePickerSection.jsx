import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import VoiceSilhouette from "./VoiceSilhouette";
import { VOICE_OPTIONS, voicePreviewUrl } from "../services/voiceCatalog";

// Voice picker rendered inside the Kinin Settings page. Lets the user choose
// the voice Kinin uses when reading turns aloud, and audition each option via
// a baked preview MP3 in /public/voice-previews/.
//
// State management is intentionally light: the radio selection updates the
// caller's React state via setTtsVoiceUuid; persistence happens via the
// page's bottom "Save" button (which folds voice_preferences into the PUT
// /profile payload).
export default function VoicePickerSection({
  ttsVoiceUuid,
  setTtsVoiceUuid,
  disabled,
}) {
  // We share a single Audio element across all preview buttons so that
  // clicking one row's Play interrupts whatever was playing in another row.
  // Refs hold both the element and the currently-playing slug so the UI can
  // render a Pause icon on the right row.
  const audioRef = useRef(null);
  const [playingSlug, setPlayingSlug] = useState(null);
  const [errorSlug, setErrorSlug] = useState(null);

  useEffect(() => {
    return () => {
      // Stop any preview that might be in flight when the section unmounts.
      const a = audioRef.current;
      if (a) {
        try {
          a.pause();
          a.src = "";
        } catch {
          // Ignore: nothing useful to do if the element is already detached.
        }
      }
      audioRef.current = null;
    };
  }, []);

  function togglePreview(slug) {
    setErrorSlug(null);
    const url = voicePreviewUrl(slug);
    if (!url) return;

    // If this row is already playing, treat the click as a pause.
    if (playingSlug === slug && audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        // Ignore: pause errors are non-fatal here.
      }
      setPlayingSlug(null);
      return;
    }

    // Stop any prior preview before starting a new one.
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        // Ignore: previous element may be in a half-torn-down state.
      }
    }
    const a = new Audio(url);
    audioRef.current = a;
    a.onended = () => {
      if (audioRef.current === a) setPlayingSlug(null);
    };
    a.onerror = () => {
      if (audioRef.current === a) {
        setPlayingSlug(null);
        setErrorSlug(slug);
      }
    };
    const playPromise = a.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.catch(() => {
        if (audioRef.current === a) {
          setPlayingSlug(null);
          setErrorSlug(slug);
        }
      });
    }
    setPlayingSlug(slug);
  }

  return (
    <div className="km-voice-list">
      {VOICE_OPTIONS.map((v) => {
        const selected = ttsVoiceUuid === v.uuid;
        const isPlaying = playingSlug === v.slug;
        const failed = errorSlug === v.slug;
        return (
          <label
            key={v.uuid}
            className={`km-voice-row${selected ? " km-voice-row-selected" : ""}`}
          >
            <input
              type="radio"
              name="kinin-voice-uuid"
              value={v.uuid}
              checked={selected}
              onChange={() => setTtsVoiceUuid(v.uuid)}
              disabled={disabled}
            />
            <span className="km-voice-silhouette">
              <VoiceSilhouette type={v.silhouette} />
            </span>
            <span className="km-voice-meta">
              <span className="km-voice-name">
                {v.name}
                {v.isDefault ? (
                  <span className="km-voice-default-tag"> (default)</span>
                ) : null}
              </span>
              {failed ? (
                <span className="km-voice-error">
                  Preview unavailable — try again.
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className={`km-voice-preview${
                isPlaying ? " km-voice-preview-playing" : ""
              }`}
              onClick={(e) => {
                // Clicking inside the <label> would otherwise toggle the
                // radio. Stop the click so the preview button is its own
                // independent affordance.
                e.preventDefault();
                e.stopPropagation();
                togglePreview(v.slug);
              }}
              aria-label={
                isPlaying
                  ? `Pause ${v.name} voice preview`
                  : `Play ${v.name} voice preview`
              }
              aria-pressed={isPlaying}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              <span className="km-voice-preview-label">
                {isPlaying ? "Pause" : "Preview"}
              </span>
            </button>
          </label>
        );
      })}
    </div>
  );
}
