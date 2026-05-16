// Short stable alias for a Cognito user sub. The same sub + admin salt always
// produces the same alias; different admins (different salts) see different
// labels for the same user. This is intentionally NOT a cryptographic
// pseudonym -- it's a screen-share friendly label that lets you talk about
// "user K6FZ7N" without leaking the real id.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // omit O/I/L/1/0 for legibility

function hash32(value) {
  // FNV-1a 32-bit. Plenty for our cardinality.
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function encodeBase31(num, length) {
  let n = num >>> 0;
  let out = "";
  for (let i = 0; i < length; i++) {
    out = ALPHABET[n % ALPHABET.length] + out;
    n = Math.floor(n / ALPHABET.length);
  }
  return out;
}

export function aliasForUserSub(sub, salt) {
  const seed = `${String(salt || "")}:${String(sub || "")}`;
  if (!sub) return "—";
  // Two hashes give us 6 chars from a 64-bit-ish space.
  const a = hash32(`a:${seed}`);
  const b = hash32(`b:${seed}`);
  return encodeBase31(a, 3) + encodeBase31(b, 3);
}

export function userLabel({ sub, email, reveal, salt }) {
  if (reveal) {
    const e = (email || "").trim();
    if (e) return e;
    const s = (sub || "").trim();
    if (s) return s.slice(0, 8) + "…";
    return "—";
  }
  return aliasForUserSub(sub, salt);
}
