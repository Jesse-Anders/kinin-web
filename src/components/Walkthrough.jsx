import { useMemo } from "react";
import { Joyride, ACTIONS, EVENTS, ORIGIN, STATUS } from "react-joyride";

// Senior-friendly coach-mark tour built on react-joyride (v3). Deliberately
// constrained: one step visible at a time, large tap targets, plain-language
// button labels, high-contrast overlay, and no motion when the user prefers
// reduced motion. The parent owns `run`/`steps` and is told when the tour
// finishes or is skipped via `onDone` (called for both so we can mark the page
// walkthrough as seen either way).
export default function Walkthrough({ steps = [], run = false, onDone }) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const options = useMemo(
    () => ({
      // Palette pulled from the theme tokens (set as CSS vars on :root, so they
      // resolve inside the react-joyride portal appended to <body>).
      primaryColor: "var(--sage-deep, #4a5d4e)",
      textColor: "var(--ink, #211b17)",
      backgroundColor: "var(--cream, #f7f3ec)",
      arrowColor: "var(--cream, #f7f3ec)",
      overlayColor: "rgba(33, 27, 23, 0.6)",
      spotlightPadding: 8,
      spotlightRadius: 6,
      zIndex: 12000,
      // Only Back / Skip / primary (Next / Done). No separate corner close, so
      // there is one obvious way forward and one obvious way out.
      buttons: ["back", "skip", "primary"],
      showProgress: true,
      // Overlay/keyboard both cleanly end the tour rather than trapping people.
      // (We finish the tour ourselves in handleEvent when either fires a CLOSE.)
      overlayClickAction: "close",
      dismissKeyAction: "close",
      // Never show the pulsing beacon. In v3 this is the option that suppresses
      // it (the v2 per-step `disableBeacon` prop is ignored); without this, a
      // CLOSE in continuous mode would orphan a beacon dot on the page.
      skipBeacon: true,
      disableFocusTrap: false,
      skipScroll: prefersReducedMotion,
      scrollDuration: prefersReducedMotion ? 0 : 300,
    }),
    [prefersReducedMotion],
  );

  const styles = useMemo(
    () => ({
      tooltip: {
        fontSize: 18,
        lineHeight: 1.5,
        borderRadius: 10,
        padding: 22,
        maxWidth: 420,
      },
      tooltipTitle: {
        fontSize: 21,
        fontWeight: 600,
        marginBottom: 6,
      },
      tooltipContent: { padding: "10px 0" },
      buttonPrimary: {
        fontSize: 18,
        fontWeight: 600,
        padding: "12px 22px",
        minHeight: 48,
        borderRadius: 8,
      },
      buttonBack: {
        fontSize: 17,
        padding: "12px 16px",
        minHeight: 48,
        marginRight: 8,
      },
      buttonSkip: {
        fontSize: 16,
        padding: "12px 14px",
        minHeight: 48,
      },
    }),
    [],
  );

  const locale = useMemo(
    () => ({
      back: "Back",
      close: "Close",
      last: "Done",
      next: "Next",
      nextWithProgress: "Next ({current} of {total})",
      skip: "Skip tour",
    }),
    [],
  );

  function handleEvent(data) {
    const { type, action, origin, status } = data || {};
    // Terminal events: Done (finished), Skip tour (skipped), or any tour:end.
    if (
      type === EVENTS.TOUR_END ||
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED
    ) {
      onDone?.(status);
      return;
    }
    // Clicking the overlay or pressing Escape fires a CLOSE action. In
    // continuous mode that only closes the *current* step and would drop a
    // beacon for the next one. Treat any such dismissal as ending the whole
    // tour cleanly so nothing is left orphaned on the page.
    if (
      action === ACTIONS.CLOSE &&
      (origin === ORIGIN.OVERLAY || origin === ORIGIN.KEYBOARD)
    ) {
      onDone?.(STATUS.SKIPPED);
    }
  }

  if (!steps.length) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      scrollToFirstStep={!prefersReducedMotion}
      options={options}
      styles={styles}
      locale={locale}
      onEvent={handleEvent}
    />
  );
}
