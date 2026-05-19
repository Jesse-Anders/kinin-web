/**
 * Streaming TTS queue.
 *
 * Designed to be fed character deltas from a live LLM stream. Each time a
 * complete sentence (or paragraph-ending) is detected, a /tts request is
 * fired in parallel. Returned audio is played in original order through a
 * single persistent <audio> element supplied by the caller, so the user
 * hears Kinin's voice begin a couple of seconds after the first text
 * appears — instead of waiting for the entire turn to finish before any
 * synthesis starts.
 *
 * Lifecycle:
 *   const queue = createTtsStreamQueue({
 *     audioEl,                // persistent <audio>, already user-primed
 *     synthesize,             // ({ text, model, signal }) => { objectUrl, ... }
 *     getModel,               // () => string | undefined
 *     onPlaybackBlocked,      // optional: () => void  (autoplay rejected)
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
  synthesize,
  getModel,
  onPlaybackBlocked,
  onPlaybackStarted,
  onAllDone,
  onError,
} = {}) {
  if (!audioEl) throw new Error("createTtsStreamQueue: audioEl is required");
  if (typeof synthesize !== "function") {
    throw new Error("createTtsStreamQueue: synthesize() is required");
  }

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
      if (job.status === "ready" && job.objectUrl) {
        break;
      }
      nextPlayIdx += 1;
    }
    if (nextPlayIdx >= jobs.length) {
      maybeEmitAllDone();
      return;
    }
    const job = jobs[nextPlayIdx];
    if (!job || !job.objectUrl) return;

    isPlaying = true;
    try {
      audioEl.onended = () => {
        revoke(job.objectUrl);
        job.objectUrl = null;
        job.status = "played";
        nextPlayIdx += 1;
        isPlaying = false;
        if (aborted) return;
        void playNextIfReady();
      };
      audioEl.onerror = () => {
        revoke(job.objectUrl);
        job.objectUrl = null;
        job.status = "failed";
        nextPlayIdx += 1;
        isPlaying = false;
        if (aborted) return;
        void playNextIfReady();
      };
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
    };
    jobs.push(job);

    const controller = new AbortController();
    inflightControllers.add(controller);
    job.status = "inflight";

    const model = typeof getModel === "function" ? getModel() : undefined;

    synthesize({ text: trimmed, model, signal: controller.signal })
      .then((result) => {
        inflightControllers.delete(controller);
        if (aborted) {
          revoke(result?.objectUrl);
          job.status = "aborted";
          return;
        }
        job.status = "ready";
        job.objectUrl = result?.objectUrl || null;
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
      try { audioEl.pause(); } catch { /* noop */ }
      audioEl.onended = null;
      audioEl.onerror = null;
      for (const job of jobs) {
        if (job.objectUrl) revoke(job.objectUrl);
        job.objectUrl = null;
        if (job.status !== "played") job.status = "aborted";
      }
      isPlaying = false;
    },
    async resumePlayback() {
      if (aborted) return;
      blockedNotified = false;
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
