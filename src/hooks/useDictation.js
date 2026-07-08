import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Real-time dictation via the browser-native Web Speech API
 * (SpeechRecognition). Frontend-only, zero cost, no backend round-trip.
 *
 * Deliberately isolated behind this hook so the streaming provider can be
 * swapped later (Deepgram / AWS Transcribe / OpenAI Realtime) without touching
 * the chat UI: keep the same { supported, listening, interim, start, stop,
 * toggle } surface and callbacks.
 *
 * Hardening (see notes inline):
 *   - Singleton recognition instance (avoids the macOS/iOS "chime" + state bugs)
 *   - Transcript rebuilt from the results array (works around Safari's
 *     interim-duplication bug rather than naively appending deltas)
 *   - continuous + interimResults for a live stream
 *   - Auto-restart when the engine ends unexpectedly (Chrome's ~60s silence
 *     timeout, random Safari ends) while we're still meant to be listening
 *   - Safari "seriously stop" workaround so the mic actually releases
 *
 * Not wired for iOS (native keyboard dictation covers phones); the mic-warmup
 * and continuous=false auto-restart hybrid that iOS needs is intentionally
 * omitted to keep desktop Safari to a single permission prompt.
 */

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isDictationSupported() {
  return !!getSpeechRecognitionCtor();
}

function isAppleVendor() {
  if (typeof navigator === "undefined") return false;
  return /Apple/i.test(navigator.vendor || "");
}

export function useDictation({ lang = "en-US", onFinal, onError } = {}) {
  const Ctor = getSpeechRecognitionCtor();
  const supported = !!Ctor;

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recognitionRef = useRef(null);
  const listeningRef = useRef(false);
  const manualStopRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const ensureRecognition = useCallback(() => {
    if (!Ctor) return null;
    if (recognitionRef.current) return recognitionRef.current;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
      // Rebuild the current interim fresh each event (never append) and fire
      // finals as discrete chunks. This sidesteps Safari's habit of emitting
      // duplicated interim text.
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) {
          const clean = transcript.trim();
          if (clean && onFinalRef.current) onFinalRef.current(clean);
        } else {
          interimText += transcript;
        }
      }
      setInterim(interimText.trim());
    };

    rec.onerror = (event) => {
      const err = event?.error || "unknown";
      // no-speech / aborted are benign and fire during normal use.
      if (err !== "no-speech" && err !== "aborted") {
        if (onErrorRef.current) onErrorRef.current(err);
      }
    };

    rec.onend = () => {
      // The engine can stop on its own (silence timeout, transient). If the
      // user hasn't asked us to stop, restart to keep a continuous stream.
      if (listeningRef.current && !manualStopRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* fall through to teardown */
        }
      }
      listeningRef.current = false;
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = rec;
    return rec;
  }, [Ctor, lang]);

  const start = useCallback(() => {
    const rec = ensureRecognition();
    if (!rec) return;
    manualStopRef.current = false;
    listeningRef.current = true;
    setInterim("");
    try {
      rec.start();
    } catch {
      // "recognition has already started" — treat as already listening.
    }
    setListening(true);
  }, [ensureRecognition]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    listeningRef.current = false;
    const rec = recognitionRef.current;
    if (rec) {
      // Safari won't actually release the mic on stop() unless you nudge it
      // with a start() first. Harmless elsewhere; guarded to Apple vendors.
      if (isAppleVendor()) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      }
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    setListening(false);
    setInterim("");
  }, []);

  const toggle = useCallback(() => {
    if (listeningRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      listeningRef.current = false;
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.onend = null;
          rec.onresult = null;
          rec.onerror = null;
          rec.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return { supported, listening, interim, start, stop, toggle };
}
