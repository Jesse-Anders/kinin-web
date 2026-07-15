import { useEffect, useRef, useState } from "react";
import { LifeBuoy, Compass, MessageCircleQuestion, PlayCircle, X } from "lucide-react";

// Persistent, clearly-labeled Help control anchored top-right on every page.
// One predictable place for all help (WCAG 2.2 "Consistent Help"). Opens a
// popover with three large actions:
//   1. Show me around this page  -> coach-mark tour for the current page
//   2. Ask Kinin a question      -> existing AI help mode
//   3. Watch a quick video       -> looping clip walkthrough
// Actions that don't apply to the current page are hidden.
export default function HelpMenu({
  onShowTour,
  onAskKinin,
  onWatchClip,
  onOpenMenu,
  hasTour = false,
  hasClip = false,
  canAsk = true,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  function toggleOpen() {
    setOpen((prev) => {
      const next = !prev;
      // Opening the menu ends any active walkthrough so the tour overlay/beacon
      // can never be left orphaned behind the menu.
      if (next) onOpenMenu?.();
      return next;
    });
  }

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(action) {
    setOpen(false);
    action?.();
  }

  const items = [
    hasTour && {
      id: "tour",
      icon: Compass,
      label: "Show me around this page",
      onClick: onShowTour,
    },
    canAsk && {
      id: "ask",
      icon: MessageCircleQuestion,
      label: "Ask Kinin a question",
      onClick: onAskKinin,
    },
    hasClip && {
      id: "clip",
      icon: PlayCircle,
      label: "Watch a quick video",
      onClick: onWatchClip,
    },
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <div className="km-help-menu" ref={rootRef}>
      <button
        type="button"
        className="km-help-menu-btn"
        data-help-anchor="help-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <LifeBuoy size={20} strokeWidth={1.8} />
        <span>Help</span>
      </button>

      {open ? (
        <div className="km-help-menu-popover" role="menu" aria-label="Help">
          <div className="km-help-menu-head">
            <span>How can we help?</span>
            <button
              type="button"
              className="km-help-menu-x"
              onClick={() => setOpen(false)}
              aria-label="Close help menu"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="km-help-menu-item"
                onClick={() => run(item.onClick)}
              >
                <Icon size={22} strokeWidth={1.6} className="km-help-menu-item-icon" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
