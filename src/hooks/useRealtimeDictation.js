import { useCallback, useEffect, useRef, useState } from "react";
import { createRealtimeToken } from "../services/sttClient";

/**
 * Real-time streaming dictation via OpenAI's Realtime transcription session,
 * over WebRTC. Single-vendor (OpenAI already handles the rest of the data),
 * works in every modern browser (incl. Firefox), and audio never transits our
 * backend — the browser connects to OpenAI directly with a short-lived
 * ephemeral token minted by POST /stt/realtime_token.
 *
 * Kept behind the same { supported, listening, connecting, interim, start,
 * stop, toggle } surface as the previous Web Speech hook so the chat UI is
 * provider-agnostic and swappable.
 *
 * Flow: mint token -> getUserMedia -> RTCPeerConnection (+ mic track +
 * `oai-events` data channel) -> POST SDP offer to /v1/realtime/calls -> apply
 * answer. Transcript deltas/finals arrive as JSON events on the data channel.
 */

const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export function isRealtimeDictationSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function mapError(err) {
  if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
    return "not-allowed";
  }
  if (err?.name === "NotFoundError") return "no-microphone";
  return err?.message || "realtime_error";
}

export function useRealtimeDictation({ lang = "en", onFinal, onError } = {}) {
  const supported = isRealtimeDictationSupported();

  const [listening, setListening] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [interim, setInterim] = useState("");

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const streamRef = useRef(null);
  const interimRef = useRef("");
  const activeRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const cleanup = useCallback(() => {
    activeRef.current = false;
    const dc = dcRef.current;
    if (dc) {
      try {
        dc.onmessage = null;
        dc.onopen = null;
        dc.close();
      } catch {
        /* ignore */
      }
    }
    dcRef.current = null;
    const pc = pcRef.current;
    if (pc) {
      try {
        pc.getSenders().forEach((s) => {
          try {
            s.track?.stop();
          } catch {
            /* ignore */
          }
        });
        pc.close();
      } catch {
        /* ignore */
      }
    }
    pcRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
      streamRef.current = null;
    }
    interimRef.current = "";
    setInterim("");
    setListening(false);
    setConnecting(false);
  }, []);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    if (!supported || activeRef.current) return;
    activeRef.current = true;
    setConnecting(true);
    setInterim("");
    interimRef.current = "";

    try {
      const token = await createRealtimeToken({ language: lang });
      if (!activeRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        if (
          activeRef.current &&
          (st === "failed" || st === "disconnected")
        ) {
          if (onErrorRef.current) onErrorRef.current("connection_lost");
          cleanup();
        }
      };

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        // Belt-and-suspenders: the ephemeral token already carries the
        // transcription config, but re-send it once the channel opens.
        try {
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                type: "transcription",
                audio: {
                  input: {
                    transcription: {
                      model: token.model || "gpt-4o-mini-transcribe",
                      language: lang,
                    },
                    turn_detection: { type: "server_vad" },
                  },
                },
              },
            }),
          );
        } catch {
          /* ignore */
        }
      };
      dc.onmessage = (e) => {
        let evt;
        try {
          evt = JSON.parse(e.data);
        } catch {
          return;
        }
        const type = evt?.type;
        if (type === "conversation.item.input_audio_transcription.delta") {
          interimRef.current += evt.delta || "";
          setInterim(interimRef.current.trim());
        } else if (
          type === "conversation.item.input_audio_transcription.completed"
        ) {
          const finalText = (evt.transcript || "").trim();
          interimRef.current = "";
          setInterim("");
          if (finalText && onFinalRef.current) onFinalRef.current(finalText);
        } else if (type === "error") {
          if (onErrorRef.current) {
            onErrorRef.current(evt.error?.message || "realtime_error");
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!activeRef.current) return;

      const sdpResponse = await fetch(OPENAI_CALLS_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token.value}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        throw new Error(`realtime_sdp_${sdpResponse.status}`);
      }
      const answerSdp = await sdpResponse.text();
      if (!activeRef.current) return;

      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      setConnecting(false);
      setListening(true);
    } catch (err) {
      const code = mapError(err);
      cleanup();
      if (onErrorRef.current) onErrorRef.current(code);
    }
  }, [supported, lang, cleanup]);

  const toggle = useCallback(() => {
    if (activeRef.current) stop();
    else void start();
  }, [start, stop]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    supported,
    // "listening" stays true through the brief connect phase so the mic button
    // reads as active immediately; `connecting` drives the status copy.
    listening: listening || connecting,
    connecting,
    interim,
    start,
    stop,
    toggle,
  };
}
