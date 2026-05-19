// iOS audio session unlocker.
//
// On iOS Safari, an unlocked AudioContext is not always enough — the
// underlying audio session can still be in a state where source.start()
// runs without producing audible output, and source.onended never
// fires. The standard production workaround (used by WhatsApp Web,
// Slack, Discord, etc.) is to keep a hidden, looping <audio> element
// playing silent audio for as long as voice is enabled. While such an
// element is "actively playing", iOS classifies the page as a
// media-playing tab and routes Web Audio output through the speaker
// reliably.
//
// We generate the silent WAV bytes in-process so we don't need to ship
// a static asset and so there's no risk of an HTTP fetch failing.
// 200 ms at 8 kHz mono 16-bit is ~3.2 KB of mostly-zero bytes — tiny.

function writeAscii(view, offset, ascii) {
  for (let i = 0; i < ascii.length; i += 1) {
    view.setUint8(offset + i, ascii.charCodeAt(i));
  }
}

function buildSilentWavBlob({ durationMs = 200, sampleRate = 8000 } = {}) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const numSamples = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = numSamples * numChannels * bytesPerSample;
  const totalSize = 44 + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeAscii(view, 8, "WAVE");

  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true); // bits per sample

  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
  // Bytes 44..end remain zero (silence). ArrayBuffer is zero-initialized.

  return new Blob([buffer], { type: "audio/wav" });
}

// Module-level singletons so multiple call sites share the same hidden
// element and we don't accumulate orphan blob URLs.
let activeAudioEl = null;
let activeBlobUrl = null;

/**
 * Begin a silent audio loop. Must be called inside a user gesture (e.g.
 * the toggle-ON click) on first use. Subsequent calls are idempotent.
 *
 * On non-iOS browsers this is a no-op — the silent loop is unnecessary
 * and adds nothing but a hidden DOM node.
 */
export function startIosAudioSession() {
  if (typeof document === "undefined") return;
  if (activeAudioEl) {
    // Already running. If it got paused by the system, nudge it back.
    if (activeAudioEl.paused) {
      const p = activeAudioEl.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
          // Will retry on the next user-gesture call.
        });
      }
    }
    return;
  }

  try {
    const blob = buildSilentWavBlob();
    const url = URL.createObjectURL(blob);
    const el = document.createElement("audio");
    el.setAttribute("playsinline", "");
    el.setAttribute("aria-hidden", "true");
    el.muted = false; // Must be unmuted on iOS for the session promotion to count.
    el.loop = true;
    el.preload = "auto";
    el.volume = 0.0001; // Inaudible but non-zero so iOS treats it as real playback.
    el.src = url;
    // Position offscreen so it never interferes with layout. We avoid
    // display:none because Safari has historically been suspicious of
    // hidden media elements.
    el.style.position = "fixed";
    el.style.top = "-9999px";
    el.style.left = "-9999px";
    el.style.width = "1px";
    el.style.height = "1px";
    el.style.opacity = "0";
    document.body.appendChild(el);

    activeAudioEl = el;
    activeBlobUrl = url;

    const p = el.play();
    if (p && typeof p.then === "function") {
      p.catch(() => {
        // Autoplay may have rejected outside of a gesture. The
        // toggle-ON path always runs us inside a gesture, so this
        // should succeed there. If it fails elsewhere, stopping and
        // restarting on the next gesture is fine.
      });
    }
  } catch {
    // If anything in the setup throws (e.g. AudioContext / DOM
    // unavailable in some embed), we silently fall through. The Web
    // Audio path may still produce audio on its own; the silent loop
    // is a robustness layer, not a hard dependency.
  }
}

/**
 * Stop the silent loop and free the blob URL. Idempotent.
 */
export function stopIosAudioSession() {
  if (activeAudioEl) {
    try { activeAudioEl.pause(); } catch { /* noop */ }
    try { activeAudioEl.src = ""; } catch { /* noop */ }
    try { activeAudioEl.remove(); } catch { /* noop */ }
    activeAudioEl = null;
  }
  if (activeBlobUrl) {
    try { URL.revokeObjectURL(activeBlobUrl); } catch { /* noop */ }
    activeBlobUrl = null;
  }
}
