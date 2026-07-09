import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Spinner } from "../theme";
import {
  isRealtimeDictationSupported,
  useRealtimeDictation,
} from "../hooks/useRealtimeDictation";
import { transcribeAudio } from "../services/sttClient";

const STT_MAX_RECORD_MS = 180000; // 3-minute cap (matches chat)

function pickRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "";
}

/**
 * Self-contained voice-to-text mic button. Real-time streaming (OpenAI
 * Realtime over WebRTC) is used wherever it's supported; otherwise it falls
 * back to record → batch /stt transcription. Final transcript chunks are
 * handed to `onText(chunk)` so the caller can append them to whatever field
 * it owns.
 *
 * Gated by `voiceFeaturesEnabled` (the paid add-on) — renders nothing when off.
 */
export default function DictationMic({
  voiceFeaturesEnabled,
  disabled = false,
  onText,
  size = 20,
}) {
  const dictationSupported = isRealtimeDictationSupported();

  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);
  const emit = useCallback((chunk) => {
    const clean = (chunk || "").trim();
    if (clean && onTextRef.current) onTextRef.current(clean);
  }, []);

  const [sttError, setSttError] = useState("");

  const handleDictationError = useCallback((err) => {
    if (err === "not-allowed" || err === "service-not-allowed") {
      setSttError("Microphone access was denied. Check your browser's site settings.");
    } else if (err === "no-microphone") {
      setSttError("No microphone was found.");
    } else if (err === "connection_lost") {
      setSttError("Voice connection dropped. Tap the mic to try again.");
    } else if (err === "voice_features_not_enabled") {
      setSttError("Enable voice features in Settings to use voice input.");
    } else if (err === "network") {
      setSttError("Voice input needs an internet connection.");
    } else {
      setSttError("Voice input hit a snag. Please try again.");
    }
  }, []);

  const dictation = useRealtimeDictation({
    onFinal: emit,
    onError: handleDictationError,
  });

  // ---- Batch fallback (record → /stt) for browsers without WebRTC ----
  const [isRecording, setIsRecording] = useState(false);
  const [sttBusy, setSttBusy] = useState(false);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordStopTimerRef = useRef(null);

  const releaseRecordingStream = useCallback(() => {
    if (recordStopTimerRef.current) {
      clearTimeout(recordStopTimerRef.current);
      recordStopTimerRef.current = null;
    }
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    setIsRecording(false);
  }, []);

  const finalizeRecording = useCallback(async () => {
    const chunks = recordedChunksRef.current;
    recordedChunksRef.current = [];
    const recorder = mediaRecorderRef.current;
    const mimeType = recorder?.mimeType || "audio/webm";
    releaseRecordingStream();
    mediaRecorderRef.current = null;
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) return;
    setSttBusy(true);
    setSttError("");
    try {
      const { text } = await transcribeAudio({ blob, mimeType });
      const clean = (text || "").trim();
      if (!clean) {
        setSttError("Didn't catch that — try speaking again.");
        return;
      }
      emit(clean);
    } catch (e) {
      const code = e?.message || "";
      if (code === "voice_features_not_enabled" || e?.status === 403) {
        setSttError("Enable voice features in Settings to use voice input.");
      } else if (code === "stt_timeout" || e?.status === 504) {
        setSttError("That clip was too long to transcribe. Try a shorter one.");
      } else if (code === "audio_too_large" || e?.status === 413) {
        setSttError("That recording was too long. Try a shorter clip.");
      } else if (code === "rate_limited" || e?.status === 429) {
        setSttError("Too many voice requests. Try again shortly.");
      } else {
        setSttError("Couldn't transcribe the audio. Please try again.");
      }
    } finally {
      setSttBusy(false);
    }
  }, [emit, releaseRecordingStream]);

  const startRecording = useCallback(async () => {
    if (isRecording || sttBusy) return;
    setSttError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setSttError("Voice input isn't supported in this browser.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setSttError(
        e?.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Couldn't access the microphone.",
      );
      return;
    }
    const mimeType = pickRecorderMimeType();
    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    mediaStreamRef.current = stream;
    mediaRecorderRef.current = recorder;
    recordedChunksRef.current = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      void finalizeRecording();
    };
    try {
      recorder.start();
    } catch {
      releaseRecordingStream();
      mediaRecorderRef.current = null;
      setSttError("Couldn't start recording. Please try again.");
      return;
    }
    setIsRecording(true);
    recordStopTimerRef.current = window.setTimeout(() => {
      stopRecording();
    }, STT_MAX_RECORD_MS);
  }, [isRecording, sttBusy, finalizeRecording, releaseRecordingStream, stopRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else void startRecording();
  }, [isRecording, startRecording, stopRecording]);

  // Stop everything if the add-on is switched off, and clean up on unmount.
  useEffect(() => {
    if (!voiceFeaturesEnabled) {
      if (dictationSupported) dictation.stop();
      stopRecording();
      setSttError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceFeaturesEnabled]);

  useEffect(() => {
    return () => {
      if (recordStopTimerRef.current) clearTimeout(recordStopTimerRef.current);
      const stream = mediaStreamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (!voiceFeaturesEnabled) return null;

  const micActive = dictationSupported ? dictation.listening : isRecording;
  const micBusy = !dictationSupported && sttBusy;
  const micTitle = micBusy
    ? "Transcribing..."
    : micActive
      ? dictationSupported
        ? "Stop dictation"
        : "Stop and transcribe"
      : dictationSupported
        ? "Dictate (live)"
        : "Dictate";

  const noteVisible =
    dictation.listening || isRecording || sttBusy || sttError;
  const noteText = dictationSupported && dictation.connecting
    ? "Connecting…"
    : dictationSupported && dictation.listening
      ? "Listening… your words will appear below."
      : sttBusy
        ? "Transcribing…"
        : isRecording
          ? "Recording… tap stop when you're done (3 min max)."
          : sttError;

  return (
    <span className="km-dictation">
      <button
        type="button"
        onClick={dictationSupported ? dictation.toggle : toggleRecording}
        disabled={disabled || micBusy}
        title={micTitle}
        aria-label={micTitle}
        aria-pressed={micActive}
        className={`km-mic-btn${micActive ? " km-mic-btn-recording" : ""}${
          micBusy ? " km-mic-btn-busy" : ""
        }`}
      >
        {micBusy ? (
          <Spinner />
        ) : micActive ? (
          <Square size={size - 2} />
        ) : (
          <Mic size={size} />
        )}
      </button>
      {noteVisible ? (
        <span className="km-dictation-note" role="status" aria-live="polite">
          {noteText}
        </span>
      ) : null}
    </span>
  );
}
