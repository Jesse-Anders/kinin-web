// Web Audio API playback path for TTS.
//
// On iOS Safari, the `<audio>` element is finicky: a `play()` made outside
// a user gesture is rejected, muted-play priming doesn't actually unlock
// the element, and even an unlocked element can re-lock on `src` swaps.
// AudioContext sidesteps all of that — once `ctx.resume()` succeeds inside
// a user gesture (which we do during the voice toggle-ON click), the
// context plays freely for the rest of the session.
//
// This module exports a small helper that:
//   1. Decodes an MP3/WAV ArrayBuffer into an AudioBuffer.
//   2. Schedules it on the context's destination via an
//      AudioBufferSourceNode.
//   3. Returns a controller with `.stop()` plus a Promise that resolves
//      when playback ends naturally (so the caller can chain the next
//      chunk in a streaming queue).
//
// Why not reuse the same BufferSource? AudioBufferSourceNodes are
// single-use — once `.start()` is called and the buffer finishes, the
// node is done and a fresh one must be created for the next chunk.
// That's the canonical Web Audio pattern.

/**
 * Decode + play a single audio chunk through an existing AudioContext.
 *
 * @param {AudioContext} ctx           Must already be resumed (state ===
 *                                     "running"). Caller is responsible
 *                                     for unlocking the context inside a
 *                                     user gesture.
 * @param {ArrayBuffer} arrayBuffer    Compressed audio bytes (MP3 in our
 *                                     case). `decodeAudioData` detaches
 *                                     the buffer, so we slice() a copy.
 * @returns {Promise<{
 *   ended: Promise<{ stopped: boolean }>,
 *   stop: () => void,
 * }>}                                 Resolves once decoding completes
 *                                     and the source has started.
 *                                     `ended` resolves when playback
 *                                     finishes (naturally or via stop).
 *                                     `stop()` aborts playback.
 *
 * Throws if `ctx` is closed or decode fails.
 */
export async function playArrayBuffer(ctx, arrayBuffer) {
  if (!ctx) throw new Error("playArrayBuffer: AudioContext is required");
  if (!arrayBuffer) throw new Error("playArrayBuffer: arrayBuffer is required");

  // decodeAudioData detaches its input. Take a copy so the caller's
  // original buffer (which they may also be using for an objectUrl /
  // Blob) is left intact.
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  let stopped = false;
  let resolveEnded;
  const ended = new Promise((resolve) => {
    resolveEnded = resolve;
  });
  source.onended = () => {
    resolveEnded({ stopped });
  };

  source.start(0);

  return {
    ended,
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        source.stop(0);
      } catch {
        // Already stopped or never started; safe to ignore.
      }
      try {
        source.disconnect();
      } catch {
        // Same.
      }
    },
  };
}

/**
 * Best-effort resume on an AudioContext. iOS will suspend the context
 * when the tab is backgrounded or the screen locks; we want to nudge it
 * back to "running" before scheduling new sources.
 *
 * Returns true if the context is running after the attempt, false
 * otherwise (caller can surface a "Tap to play" prompt in that case).
 */
export async function ensureRunning(ctx) {
  if (!ctx) return false;
  if (ctx.state === "running") return true;
  try {
    await ctx.resume();
  } catch {
    return false;
  }
  return ctx.state === "running";
}
