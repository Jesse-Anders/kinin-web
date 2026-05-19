// Minimal head-and-shoulders silhouettes used in the voice picker UI.
//
// Drawn as tiny inline SVGs so they can be tinted with currentColor and
// inherit theme without needing image assets. Two variants ("woman" /
// "man") loosely keyed off classic restroom-sign hair shapes — recognisable
// at 24-48px, neutral otherwise. If we later want photographic / brand
// imagery, swap these out without touching consumers.

export default function VoiceSilhouette({
  type = "woman",
  size = 36,
  title,
}) {
  const label = title || (type === "man" ? "Masculine voice" : "Feminine voice");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={label}
      style={{ display: "block" }}
    >
      <title>{label}</title>
      {type === "man" ? (
        <g fill="currentColor">
          {/* Head with short hair */}
          <path d="M24 6c-5.2 0-9.3 4.1-9.3 9.3v3.4c0 5.2 4.1 9.3 9.3 9.3s9.3-4.1 9.3-9.3v-3.4C33.3 10.1 29.2 6 24 6Z" />
          {/* Shoulders */}
          <path d="M9.5 42c0-6.4 6.5-11.5 14.5-11.5S38.5 35.6 38.5 42v1.5h-29V42Z" />
        </g>
      ) : (
        <g fill="currentColor">
          {/* Head + flowing hair */}
          <path d="M24 5c-6 0-10.8 4.6-10.8 10.4v4.2c0 1.7.4 3.3 1.1 4.7-1.6 1.6-2.6 3.8-2.6 6.2 0 .7.6 1.3 1.3 1.3h22c.7 0 1.3-.6 1.3-1.3 0-2.4-1-4.6-2.6-6.2.7-1.4 1.1-3 1.1-4.7v-4.2C34.8 9.6 30 5 24 5Z" />
          {/* Shoulders */}
          <path d="M9.5 42c0-6.4 6.5-11.5 14.5-11.5S38.5 35.6 38.5 42v1.5h-29V42Z" />
        </g>
      )}
    </svg>
  );
}
