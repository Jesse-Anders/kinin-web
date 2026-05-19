// Lightweight, agent-string-free-where-possible platform detection.
//
// We use this exclusively to opt iOS into the Web Audio playback path for
// TTS — the `<audio>` element on iOS Safari has subtle autoplay quirks that
// AudioContext sidesteps cleanly once resumed inside a user gesture.
//
// All iOS browsers (Safari, Chrome/CriOS, Firefox/FxiOS, Edge/EdgiOS) share
// the same underlying WebKit and the same autoplay rules, so we treat them
// uniformly. We deliberately do NOT distinguish Safari vs Chrome on iOS.

export function isIOS() {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  // iPhone / iPod always report honestly.
  if (/iPhone|iPod/.test(ua)) return true;
  // Older iPads (iPadOS 12 and earlier).
  if (/iPad/.test(ua)) return true;
  // iPadOS 13+ pretends to be desktop Safari. The reliable tell is
  // platform == MacIntel combined with touch support (Macs don't have it).
  if (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}
