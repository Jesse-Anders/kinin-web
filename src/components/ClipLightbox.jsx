import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "../theme";

// Accessible modal that plays a short feature walkthrough clip. The clip is
// muted and loops (calm, non-startling for the target audience) and never
// autoplays with sound. A visible text caption restates the steps for people
// who cannot or prefer not to rely on the video, and a captions track is used
// when provided. Closes on Escape, backdrop click, or the large close button.
export default function ClipLightbox({ clip, onClose }) {
  const closeRef = useRef(null);
  const isGif = typeof clip?.src === "string" && clip.src.endsWith(".gif");

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    // Move focus into the dialog for keyboard/screen-reader users.
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!clip) return null;

  const titleId = "km-clip-title";
  const captionId = "km-clip-caption";

  return (
    <div
      className="km-clip-backdrop"
      onClick={() => onClose?.()}
      role="presentation"
    >
      <div
        className="km-clip-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={captionId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="km-clip-header">
          <div id={titleId} className="km-clip-title">
            {clip.title || "Quick walkthrough"}
          </div>
          <button
            type="button"
            ref={closeRef}
            className="km-clip-close"
            onClick={() => onClose?.()}
            aria-label="Close video"
          >
            <X size={22} strokeWidth={2} />
          </button>
        </div>

        <div className="km-clip-media">
          {isGif ? (
            <img
              src={clip.src}
              alt={clip.caption || clip.title || "Feature walkthrough"}
              className="km-clip-video"
            />
          ) : (
            <video
              className="km-clip-video"
              src={clip.src}
              poster={clip.poster || undefined}
              muted
              loop
              autoPlay
              playsInline
              controls
              preload="metadata"
            >
              {clip.captionsSrc ? (
                <track
                  kind="captions"
                  src={clip.captionsSrc}
                  srcLang="en"
                  label="English"
                  default
                />
              ) : null}
            </video>
          )}
        </div>

        {clip.caption ? (
          <p id={captionId} className="km-clip-caption">
            {clip.caption}
          </p>
        ) : null}

        <div className="km-clip-actions">
          <Button variant="primary" onClick={() => onClose?.()}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
