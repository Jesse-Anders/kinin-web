export function Colophon({ left, mark, right }) {
  return (
    <footer className="km-colophon">
      <div className="km-colophon-left">{left}</div>
      <div className="km-colophon-mark">{mark}</div>
      <div className="km-colophon-right">{right}</div>
    </footer>
  );
}
