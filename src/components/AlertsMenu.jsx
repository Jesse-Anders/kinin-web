import { useEffect, useRef, useState } from "react";
import { Bell, Clock, X } from "lucide-react";

// Top-right notification widget, shown beside the Help control. Surfaces gentle,
// non-ominous nudges (e.g. "add a trusted contact" ~2 weeks after signup, and
// future new-feature announcements). Renders nothing when there are no active
// alerts. Each alert offers one primary action plus "Remind me later" (snooze)
// and "Dismiss" (permanently clear). State is persisted by the parent.
export default function AlertsMenu({ alerts = [], onCta, onSnooze, onDismiss }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const count = alerts.length;

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

  if (count === 0) return null;

  const label = count === 1 ? "1 notification" : `${count} notifications`;

  return (
    <div className="km-alerts-menu" ref={rootRef}>
      <button
        type="button"
        className="km-alerts-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Bell size={20} strokeWidth={1.8} />
        <span className="km-alerts-badge" aria-hidden="true">
          {count}
        </span>
      </button>

      {open ? (
        <div className="km-alerts-popover" role="menu" aria-label="Notifications">
          <div className="km-alerts-head">
            <span>Notifications</span>
            <button
              type="button"
              className="km-alerts-x"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          {alerts.map((alert) => (
            <div key={alert.id} className="km-alert-card" role="menuitem">
              <div className="km-alert-card-title">{alert.title}</div>
              <div className="km-alert-card-body">{alert.body}</div>
              <div className="km-alert-card-actions">
                {alert.cta ? (
                  <button
                    type="button"
                    className="km-alert-cta"
                    onClick={() => {
                      setOpen(false);
                      onCta?.(alert);
                    }}
                  >
                    {alert.cta.label}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="km-alert-secondary"
                  onClick={() => onSnooze?.(alert)}
                >
                  <Clock size={15} strokeWidth={1.8} />
                  <span>Remind me later</span>
                </button>
                <button
                  type="button"
                  className="km-alert-secondary"
                  onClick={() => onDismiss?.(alert)}
                >
                  <X size={15} strokeWidth={1.8} />
                  <span>Dismiss</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
