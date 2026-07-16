// Central registry for in-app Help walkthroughs.
//
// Each entry is keyed by the frontend page identifier (see PAGE_TO_PATH in
// App.jsx) and drives two things:
//   1. A coach-mark tour (react-joyride steps) launched from the Help menu or
//      auto-launched once on first visit when tips are enabled.
//   2. A short looping clip/GIF walkthrough shown in the ClipLightbox.
//
// Design notes for the 65+ audience: keep tours to 3-5 steps, one idea per
// step, plain non-technical language, and always target elements that are
// reliably on-screen. Steps attach to `[data-help-anchor="..."]` markers added
// to the pages so refactors of class names don't silently break tours.

// The pages that have a walkthrough. Kept in sync with the backend
// _HELP_WALKTHROUGH_KEYS allowlist in kinin-lambda profile.py.
export const WALKTHROUGH_PAGE_KEYS = [
  "interview",
  "journal",
  "pins",
  "reunion",
  "review-chats",
  // Contextual sub-tour: triggered when a Reunion persona is first opened,
  // not on page load. Not shown as a "Show me around this page" menu option.
  "reunion-persona",
];

// Master switch for the "Watch a quick video" help option. The clip framework
// (ClipLightbox, registry `clip` metadata, captions pipeline) is in place, but
// no real narrated clips have been produced yet — only placeholder posters. Flip
// this to true once actual clip files exist in public/help/clips/.
export const HELP_CLIPS_ENABLED = false;

function anchor(name) {
  return `[data-help-anchor="${name}"]`;
}

// A centered "welcome" step needs no on-screen target; it floats in the middle.
function welcomeStep(content) {
  return {
    target: "body",
    placement: "center",
    disableBeacon: true,
    title: "Welcome",
    content,
  };
}

// Ordered so the primary/most-used feature (the interview) comes first. This
// object is the single source of truth consumed by App.jsx, HelpMenu, and
// ClipLightbox.
export const WALKTHROUGHS = {
  interview: {
    label: "the Interview",
    steps: [
      welcomeStep(
        "This is where you talk with Kinin. It asks questions, and your answers become your life story. Here is a quick tour \u2014 it only takes a moment.",
      ),
      {
        target: anchor("interview-chat"),
        title: "Your conversation",
        content:
          "Kinin's questions appear here, along with everything you have shared. There are no wrong answers \u2014 share as much or as little as you like.",
        placement: "bottom",
        disableBeacon: true,
      },
      {
        target: anchor("interview-composer"),
        title: "Your reply",
        content:
          "Type your answer here and press Send. Take all the time you need \u2014 nothing is ever lost.",
        placement: "top",
      },
      {
        target: anchor("interview-voice"),
        title: "Prefer to talk?",
        content:
          "Tap the microphone to speak your answer instead of typing \u2014 Kinin turns your words into text you can review before you send.",
        placement: "top",
      },
      {
        target: anchor("interview-listen"),
        title: "Hear Kinin's voice",
        content:
          "Tap here to turn Kinin's voice on. When it's on, Kinin reads each question and reply aloud in a warm, natural voice. Tap it again to go back to silent reading.",
        placement: "top",
      },
      {
        target: anchor("help-menu"),
        title: "Help is always here",
        content:
          "Whenever you have a question, open this Help button. You can retake this tour or ask Kinin a question.",
        placement: "bottom",
      },
    ],
    clip: {
      title: "Using the Interview",
      src: "/help/clips/interview.mp4",
      poster: "/help/clips/interview.poster.svg",
      captionsSrc: "/help/clips/interview.vtt",
      caption:
        "Kinin asks a question, you type or speak your answer, and press Send. Your story grows one conversation at a time.",
    },
  },

  journal: {
    label: "the Journal",
    steps: [
      welcomeStep(
        "The Journal is your own space to write memories in your own words, whenever inspiration strikes. We've opened an example entry so you can see how it all works \u2014 here is a quick look around.",
      ),
      {
        target: anchor("journal-editor"),
        title: "Write here",
        content:
          "Give your entry a title and write your memory in this box. It saves automatically as you go, so you never have to worry about losing your words. You can also add a photo or two.",
        placement: "right",
        disableBeacon: true,
      },
      {
        target: anchor("journal-save"),
        title: "Save it to your story",
        content:
          "While you are still writing, an entry stays a private draft. When it feels finished, press Save Journal Entry and Kinin gently weaves it into your life story.",
        placement: "top",
        disableBeacon: true,
      },
      {
        target: anchor("journal-ask"),
        title: "A second pair of eyes",
        content:
          "Whenever you'd like, ask Kinin to gently point out spots that feel thin, or to tidy up spelling and punctuation. Kinin only suggests \u2014 it never rewrites your words. You choose what to change.",
        placement: "top",
        disableBeacon: true,
      },
      {
        target: anchor("journal-entries"),
        title: "Your entries",
        content:
          "All of your entries live here. Use the tabs to see drafts, finished entries, or everything at once \u2014 and press New anytime to start another memory.",
        placement: "left",
      },
      {
        target: anchor("help-menu"),
        title: "Help is always here",
        content:
          "Open this Help button anytime to retake this tour or ask Kinin a question.",
        placement: "bottom",
      },
    ],
    clip: {
      title: "Using the Journal",
      src: "/help/clips/journal.mp4",
      poster: "/help/clips/journal.poster.svg",
      captionsSrc: "/help/clips/journal.vtt",
      caption:
        "Write a memory in the editor on the left. It autosaves, and your entries appear in the list on the right.",
    },
  },

  pins: {
    label: "Memory Pins",
    steps: [
      welcomeStep(
        "Memory Pins are quick notes for memories you want to explore later, so a good idea is never forgotten. Here is how they work.",
      ),
      {
        target: anchor("pins-new"),
        title: "Jot a quick note",
        content:
          "Type a memory or idea here and add it as a pin. Keep it short \u2014 you can come back to it whenever you are ready.",
        placement: "bottom",
        disableBeacon: true,
      },
      {
        target: anchor("pins-list"),
        title: "Turn a pin into a story",
        content:
          "From any pin you can start a conversation with Kinin or a journal entry, and mark it complete when you are done.",
        placement: "top",
      },
      {
        target: anchor("help-menu"),
        title: "Help is always here",
        content:
          "Open this Help button anytime to retake this tour or ask Kinin a question.",
        placement: "bottom",
      },
    ],
    clip: {
      title: "Using Memory Pins",
      src: "/help/clips/pins.mp4",
      poster: "/help/clips/pins.poster.svg",
      captionsSrc: "/help/clips/pins.vtt",
      caption:
        "Add a short pin for a memory you want to explore, then start a chat or journal entry from it later.",
    },
  },

  reunion: {
    label: "Reunion",
    steps: [
      welcomeStep(
        "Reunion lets you talk with a loved one's story in a natural conversation. Here is how to begin.",
      ),
      {
        target: anchor("reunion-main"),
        title: "Choose a story",
        content:
          "Pick a shared biography, then ask questions just as you would in conversation. Kinin answers using their memories.",
        placement: "top",
        disableBeacon: true,
      },
      {
        target: anchor("help-menu"),
        title: "Help is always here",
        content:
          "Open this Help button anytime to retake this tour or ask Kinin a question.",
        placement: "bottom",
      },
    ],
    clip: {
      title: "Using Reunion",
      src: "/help/clips/reunion.mp4",
      poster: "/help/clips/reunion.poster.svg",
      captionsSrc: "/help/clips/reunion.vtt",
      caption:
        "Choose a shared biography and ask questions. Answers link back to the original memories they came from.",
    },
  },

  // Contextual sub-tour shown the first time a persona (biography) is opened.
  // No centered welcome step (the user is already mid-flow), and no clip.
  "reunion-persona": {
    label: "Talking with a persona",
    steps: [
      {
        target: anchor("reunion-chat"),
        title: "Ask them anything",
        content:
          "This is where their answers appear, in their voice, drawn from the memories they shared. Try questions like \u201CWhat was your childhood home like?\u201D or \u201CTell me about the day you got married.\u201D",
        placement: "bottom",
        disableBeacon: true,
      },
      {
        target: anchor("reunion-input"),
        title: "Ask in your own words",
        content:
          "Type a question here and press Send. You can ask follow-ups just like a real conversation \u2014 \u201CWhat happened next?\u201D works well. When they answer, you'll see numbered \u201CSources\u201D you can open.",
        placement: "top",
        disableBeacon: true,
      },
      {
        target: anchor("reunion-citations"),
        title: "See where answers come from",
        content:
          "Each answer can show numbered \u201CSources.\u201D Tap one to read the original memory \u2014 an interview moment or journal entry \u2014 that the answer came from.",
        placement: "top",
        disableBeacon: true,
      },
    ],
    clip: null,
  },

  "review-chats": {
    label: "Review & Edit",
    steps: [
      welcomeStep(
        "Review & Edit lets you look back through past conversations and fix anything you would like to change. Here is a quick tour.",
      ),
      {
        target: anchor("review-filters"),
        title: "Find a memory",
        content:
          "Search by words or pick a date range to find past conversations. You can include your journal entries too.",
        placement: "bottom",
        disableBeacon: true,
      },
      {
        target: anchor("review-results"),
        title: "Edit your words",
        content:
          "Your results appear here. You can edit anything you said to correct or add detail \u2014 Kinin's questions stay as they were.",
        placement: "top",
      },
      {
        target: anchor("help-menu"),
        title: "Help is always here",
        content:
          "Open this Help button anytime to retake this tour or ask Kinin a question.",
        placement: "bottom",
      },
    ],
    clip: {
      title: "Using Review & Edit",
      src: "/help/clips/review-chats.mp4",
      poster: "/help/clips/review-chats.poster.svg",
      captionsSrc: "/help/clips/review-chats.vtt",
      caption:
        "Search past conversations by text or date, then edit your own answers to correct or add detail.",
    },
  },
};

export function getWalkthrough(pageKey) {
  return WALKTHROUGHS[pageKey] || null;
}

export function hasWalkthrough(pageKey) {
  return Boolean(WALKTHROUGHS[pageKey]);
}
