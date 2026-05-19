/**
 * Streaming TTS queue.
 *
 * Designed to be fed character deltas from a live LLM stream. Each time a
 * complete sentence (or paragraph-ending) is detected, a /tts request is
 * fired in parallel. Returned audio is played in original order so the
 * user hears Kinin's voice begin a couple of seconds after the first text
 * appears — instead of waiting for the entire turn to finish before any
 * synthesis starts.
 *
 * Two playback backends are supported, picked at construction time:
 *
 *   1. <audio> element (desktop / Android / non-iOS browsers).
 *        Pass `audioEl`. The element should already be "blessed" by a
 *        prior user gesture so that programmatic .play() calls don't
 *        hit browser autoplay restrictions.
 *
 *   2. Web Audio API (iOS Safari and any other engine where the <audio>
 *        element is unreliable).
 *        Pass `audioCtx` — an AudioContext that has already been resumed
 *        inside a user gesture. The queue will decode each chunk via
 *        decodeAudioData and schedule it on the context's destination
 *        with an AudioBufferSourceNode.
 *
 * If both are passed, `audioCtx` wins.
 *
 * Lifecycle:
 *   const queue = createTtsStreamQueue({
 *     audioEl OR audioCtx,    // exactly one playback backend
 *     synthesize,             // ({ text, model, signal }) =>
 *                             //   { objectUrl, arrayBuffer, ... }
 *     getModel,               // () => string | undefined
 *     onPlaybackBlocked,      // optional: () => void  (autoplay rejected
 *                             //   on <audio>, or AudioContext suspended)
 *     onPlaybackStarted,      // optional: () => void
 *     onAllDone,              // optional: () => void  (queue drained)
 *     onError,                // optional: (err) => void
 *   });
 *   queue.feed(deltaText);    // call for every stream.delta
 *   queue.finalize();         // call once when the stream completes
 *   queue.abort();            // call to tear down (toggle off, new turn, unmount)
 *   queue.resumePlayback();   // call from a user gesture if blocked
 *
 * Sentence segmentation is intentionally conservative:
 *   - A sentence terminator is one or more of [.!?]
 *   - Followed by optional closing quote/paren
 *   - Followed by whitespace (we need the space to confirm boundary)
 *   - Followed (after the whitespace) by a capital letter, an opening
 *     quote/paren, an em-dash, or end-of-buffer.
 *   - Common abbreviations (Dr., Mrs., e.g.) do NOT count as boundaries.
 *
 * If a sentence grows longer than MAX_CHUNK_CHARS without terminating, we
 * force-flush at the nearest comma/space to keep latency bounded.
 */

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "sr", "jr", "st", "prof", "rev",
  "mt", "etc", "vs", "fig", "no", "approx", "ca", "ave",
  "e.g", "i.e",
]);

const MAX_CHUNK_CHARS = 220;
const MIN_FLUSH_CHARS = 80;

function isSentenceTerminator(ch) {
  return ch === "." || ch === "!" || ch === "?";
}

function isClosingPunct(ch) {
  return ch === '"' || ch === "'" || ch === ")" || ch === "]" || ch === "\u201d" || ch === "\u2019";
}

function isStartChar(ch) {
  return /[A-Z"'([\u201c\u2018\u2014]/.test(ch);
}

function tokenBefore(buffer, idx) {
  // Returns the lowercase alphanumeric word immediately preceding idx,
  // (idx points to the terminator). Used to filter out abbreviations.
  let end = idx;
  let start = idx;
  while (start > 0 && /[A-Za-z]/.test(buffer[start - 1])) start -= 1;
  return buffer.substring(start, end).toLowerCase();
}

/**
 * Find the next sentence boundary in `buffer` at-or-after `fromIdx`.
 * Returns the index *after* the boundary (i.e., where the next sentence
 * begins), or -1 if no boundary is detected yet (need more data).
 */
function findNextBoundary(buffer, fromIdx) {
  let i = fromIdx;
  while (i < buffer.length) {
    const ch = buffer[i];
    if (!isSentenceTerminator(ch)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < buffer.length && isSentenceTerminator(buffer[j])) j += 1;
    while (j < buffer.length && isClosingPunct(buffer[j])) j += 1;

    if (j >= buffer.length || !/\s/.test(buffer[j])) {
      i = j;
      continue;
    }

    if (ch === ".") {
      const word = tokenBefore(buffer, i);
      if (word && ABBREVIATIONS.has(word)) {
        i = j;
        continue;
      }
    }

    let k = j;
    while (k < buffer.length && /\s/.test(buffer[k])) k += 1;
    if (k >= buffer.length) {
      return -1;
    }
    if (isStartChar(buffer[k])) {
      return k;
    }
    i = j;
  }
  return -1;
}

/**
 * Force-flush position when no real boundary has appeared and the chunk
 * is getting too long. Picks the nearest comma/semicolon/colon/space
 * after MIN_FLUSH_CHARS to keep prosody reasonable.
 */
function findForcedBoundary(buffer) {
  if (buffer.length <= MAX_CHUNK_CHARS) return -1;
  for (let i = MIN_FLUSH_CHARS; i < buffer.length; i += 1) {
    const ch = buffer[i];
    if (ch === "," || ch === ";" || ch === ":" || ch === "\u2014") {
      let k = i + 1;
      while (k < buffer.length && /\s/.test(buffer[k])) k += 1;
      if (k < buffer.length) return k;
    }
  }
  for (let i = MAX_CHUNK_CHARS; i < buffer.length; i += 1) {
    if (/\s/.test(buffer[i])) {
      let k = i + 1;
      while (k < buffer.length && /\s/.test(buffer[k])) k += 1;
      if (k < buffer.length) return k;
    }
  }
  return -1;
}

export function createTtsStreamQueue({
  audioEl,
  audioCtx,
  synthesize,
  getModel,
  onPlaybackBlocked,
  onPlaybackStarted,
  onAllDone,
  onError,
} = {}) {
  if (!audioEl && !audioCtx) {
    throw new Error(
      "createTtsStreamQueue: either audioEl or audioCtx is required",
    );
  }
  if (typeof synthesize !== "function") {
    throw new Error("createTtsStreamQueue: synthesize() is required");
  }
  // Web Audio wins if both are provided. Lets the host (App.jsx) pass both
  // an element and a context and have the queue pick the right backend
  // without per-platform branching at the call site.
  const useWebAudio = !!audioCtx;

  let buffer = "";
  let nextSubmitIdx = 0;
  let aborted = false;
  let finalized = false;
  let queueDoneEmitted = false;
  const jobs = [];
  let nextPlayIdx = 0;
  let isPlaying = false;
  const inflightControllers = new Set();
  let blockedNotified = false;
  // Web Audio backend: the currently-playing AudioBufferSourceNode (if
  // any). Held so abort() can call .stop() on it. We never reuse a
  // BufferSource; each chunk gets a fresh one.
  let currentSource = null;

  const fail = (err) => {
    if (typeof onError === "function") {
      try { onError(err); } catch { /* noop */ }
    }
  };

  const revoke = (url) => {
    if (!url) return;
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  };

  const maybeEmitAllDone = () => {
    if (queueDoneEmitted) return;
    if (!finalized) return;
    if (isPlaying) return;
    if (nextPlayIdx < jobs.length) return;
    if (inflightControllers.size > 0) return;
    queueDoneEmitted = true;
    if (typeof onAllDone === "function") {
      try { onAllDone(); } catch { /* noop */ }
    }
  };

  const advanceAndContinue = (job, statusAfter) => {
    if (job.objectUrl) {
      revoke(job.objectUrl);
      job.objectUrl = null;
    }
    job.audioBuffer = null;
    job.status = statusAfter;
    nextPlayIdx += 1;
    isPlaying = false;
    currentSource = null;
    if (aborted) return;
    void playNextIfReady();
  };

  const isReadyForPlayback = (job) => {
    if (job.status !== "ready") return false;
    return useWebAudio ? !!job.audioBuffer : !!job.objectUrl;
  };

  const playNextIfReady = async () => {
    if (aborted) return;
    if (isPlaying) return;
    while (nextPlayIdx < jobs.length) {
      const job = jobs[nextPlayIdx];
      if (job.status === "pending" || job.status === "inflight") return;
      if (job.status === "failed" || job.status === "aborted") {
        nextPlayIdx += 1;
        continue;
      }
      if (isReadyForPlayback(job)) break;
      nextPlayIdx += 1;
    }
    if (nextPlayIdx >= jobs.length) {
      maybeEmitAllDone();
      return;
    }
    const job = jobs[nextPlayIdx];
    if (!job || !isReadyForPlayback(job)) return;

    isPlaying = true;

    if (useWebAudio) {
      // Web Audio path: schedule the pre-decoded AudioBuffer on the
      // context's destination via a fresh BufferSource. iOS handles this
      // reliably across the whole session once the context is resumed.
      try {
        if (audioCtx.state === "suspended") {
          try {
            await audioCtx.resume();
          } catch {
            // Will surface via the catch below if it ultimately fails.
          }
        }
        if (audioCtx.state !== "running") {
          throw new Error("AudioContext is not running");
        }
        const source = audioCtx.createBufferSource();
        source.buffer = job.audioBuffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          // onended fires for both natural end and forced .stop(). If we
          // were aborted, abort() already cleaned up — skip here.
          if (aborted) return;
          advanceAndContinue(job, "played");
        };
        currentSource = source;
        source.start(0);
        if (typeof onPlaybackStarted === "function") {
          try { onPlaybackStarted(); } catch { /* noop */ }
        }
      } catch (playErr) {
        isPlaying = false;
        currentSource = null;
        if (!blockedNotified) {
          blockedNotified = true;
          if (typeof onPlaybackBlocked === "function") {
            try { onPlaybackBlocked(playErr); } catch { /* noop */ }
          }
        }
      }
      return;
    }

    // <audio> element path (desktop / Android).
    try {
      audioEl.onended = () => advanceAndContinue(job, "played");
      audioEl.onerror = () => advanceAndContinue(job, "failed");
      audioEl.muted = false;
      audioEl.src = job.objectUrl;
      await audioEl.play();
      if (typeof onPlaybackStarted === "function") {
        try { onPlaybackStarted(); } catch { /* noop */ }
      }
    } catch (playErr) {
      isPlaying = false;
      if (!blockedNotified) {
        blockedNotified = true;
        if (typeof onPlaybackBlocked === "function") {
          try { onPlaybackBlocked(playErr); } catch { /* noop */ }
        }
      }
    }
  };

  const submitChunk = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const job = {
      idx: jobs.length,
      text: trimmed,
      status: "pending",
      objectUrl: null,
      audioBuffer: null,
    };
    jobs.push(job);

    const controller = new AbortController();
    inflightControllers.add(controller);
    job.status = "inflight";

    const model = typeof getModel === "function" ? getModel() : undefined;

    synthesize({ text: trimmed, model, signal: controller.signal })
      .then(async (result) => {
        inflightControllers.delete(controller);
        if (aborted) {
          revoke(result?.objectUrl);
          job.status = "aborted";
          return;
        }
        if (useWebAudio) {
          // Decode eagerly so the buffer is ready by the time playback
          // catches up. We can throw out the objectUrl/Blob in this
          // branch — the Web Audio path doesn't use it. decodeAudioData
          // detaches its input ArrayBuffer, so we pass a copy and leave
          // the caller's reference untouched.
          revoke(result?.objectUrl);
          try {
            const arrayBuffer = result?.arrayBuffer;
            if (!arrayBuffer) throw new Error("missing arrayBuffer");
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
            if (aborted) {
              job.status = "aborted";
              return;
            }
            job.audioBuffer = audioBuffer;
            job.status = "ready";
          } catch (decodeErr) {
            job.status = "failed";
            fail(decodeErr);
            void playNextIfReady();
            return;
          }
        } else {
          job.status = "ready";
          job.objectUrl = result?.objectUrl || null;
        }
        void playNextIfReady();
      })
      .catch((err) => {
        inflightControllers.delete(controller);
        if (controller.signal.aborted) {
          job.status = "aborted";
        } else {
          job.status = "failed";
          fail(err);
        }
        void playNextIfReady();
      });
  };

  const drainBuffer = ({ force = false } = {}) => {
    if (aborted) return;
    let safety = 0;
    while (safety < 50) {
      safety += 1;
      const slice = buffer.slice(nextSubmitIdx);
      if (!slice) return;

      const rel = findNextBoundary(slice, 0);
      if (rel >= 0) {
        const chunk = slice.slice(0, rel);
        if (chunk.trim()) submitChunk(chunk);
        nextSubmitIdx += rel;
        continue;
      }

      if (!force) {
        const forced = findForcedBoundary(slice);
        if (forced >= 0) {
          const chunk = slice.slice(0, forced);
          if (chunk.trim()) submitChunk(chunk);
          nextSubmitIdx += forced;
          continue;
        }
        return;
      }

      const tail = slice.trim();
      if (tail) submitChunk(slice);
      nextSubmitIdx = buffer.length;
      return;
    }
  };

  return {
    feed(delta) {
      if (aborted || finalized) return;
      if (typeof delta !== "string" || !delta) return;
      buffer += delta;
      drainBuffer({ force: false });
    },
    finalize() {
      if (aborted || finalized) return;
      finalized = true;
      drainBuffer({ force: true });
      maybeEmitAllDone();
    },
    abort() {
      if (aborted) return;
      aborted = true;
      for (const c of inflightControllers) {
        try { c.abort(); } catch { /* noop */ }
      }
      inflightControllers.clear();
      if (useWebAudio) {
        if (currentSource) {
          try { currentSource.onended = null; } catch { /* noop */ }
          try { currentSource.stop(0); } catch { /* noop */ }
          try { currentSource.disconnect(); } catch { /* noop */ }
          currentSource = null;
        }
      } else {
        try { audioEl.pause(); } catch { /* noop */ }
        audioEl.onended = null;
        audioEl.onerror = null;
      }
      for (const job of jobs) {
        if (job.objectUrl) revoke(job.objectUrl);
        job.objectUrl = null;
        job.audioBuffer = null;
        if (job.status !== "played") job.status = "aborted";
      }
      isPlaying = false;
    },
    async resumePlayback() {
      if (aborted) return;
      blockedNotified = false;
      if (useWebAudio) {
        // The Web Audio path can only end up "blocked" if the
        // AudioContext got suspended (tab backgrounded, screen lock,
        // call coming in). Resuming the context inside a user gesture
        // is the recovery; we then resume scheduling chunks. There's
        // no in-flight BufferSource to "unpause" — Web Audio sources
        // are fire-and-forget — so we just nudge the queue forward.
        if (audioCtx.state === "suspended") {
          try {
            await audioCtx.resume();
          } catch {
            // Fall through; playNextIfReady will surface the failure
            // via onPlaybackBlocked again.
          }
        }
        await playNextIfReady();
        return;
      }
      if (isPlaying) {
        try {
          audioEl.muted = false;
          await audioEl.play();
          return;
        } catch (e) {
          if (!blockedNotified) {
            blockedNotified = true;
            if (typeof onPlaybackBlocked === "function") {
              try { onPlaybackBlocked(e); } catch { /* noop */ }
            }
          }
          return;
        }
      }
      await playNextIfReady();
    },
    get isActive() {
      return !aborted && (inflightControllers.size > 0 || isPlaying || nextPlayIdx < jobs.length || !finalized);
    },
  };
}
