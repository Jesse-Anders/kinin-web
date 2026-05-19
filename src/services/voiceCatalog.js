// Curated Resemble pre-built voices Kinin supports.
//
// This list is the single source of truth on the frontend for:
//  - the dropdown in InterviewDetailsPanel (dev override)
//  - the radio picker on the Kinin Settings page (user saved default)
//  - the quick-switch in the chat strip (Ember / Richard)
//  - the silhouette artwork used in the chat strip and preview UI
//
// The backend keeps a matching allowlist in
// kinin/handlers/profile.py (`_ALLOWED_VOICE_UUIDS`). When changing this
// list, update both places. Order is the dropdown / Settings list order.
//
// Preview MP3s live under public/voice-previews/<slug>.mp3 and were
// rendered with Resemble's default (non-turbo) model, matching what the
// chat actually uses at runtime.

export const VOICE_OPTIONS = [
  {
    uuid: "55592656",
    name: "Ember",
    slug: "ember",
    silhouette: "woman",
    isDefault: true,
  },
  { uuid: "1ff0045f", name: "Vivian", slug: "vivian", silhouette: "woman" },
  {
    uuid: "e28236ee",
    name: "Samantha",
    slug: "samantha",
    silhouette: "woman",
  },
  { uuid: "bee581c1", name: "Ethan", slug: "ethan", silhouette: "man" },
  {
    uuid: "a3b3f1df",
    name: "Emmanuel",
    slug: "emmanuel",
    silhouette: "man",
  },
  { uuid: "85ba84f2", name: "Richard", slug: "richard", silhouette: "man" },
];

// The voice we ship as the product default before a user makes a choice.
export const DEFAULT_VOICE_UUID = "55592656";

// Voices exposed in the chat-strip quick-switch (next to the AudioLines icon).
// One feminine + one masculine; intentionally limited so users can flip with a
// single click. The full list lives in Settings.
export const QUICK_SWITCH_UUIDS = ["55592656", "85ba84f2"];

export function findVoice(uuid) {
  if (!uuid) return null;
  return VOICE_OPTIONS.find((v) => v.uuid === uuid) || null;
}

export function voicePreviewUrl(slug) {
  if (!slug) return null;
  return `/voice-previews/${slug}.mp3`;
}
