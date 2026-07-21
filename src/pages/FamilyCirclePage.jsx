import { useCallback, useEffect, useState } from "react";
import { HeartHandshake, MessageCircleHeart, UsersRound, X } from "lucide-react";
import {
  Banner,
  Button,
  FormRow,
  Frame,
  Section,
  Skeleton,
  Spinner,
  TextArea,
  TextInput,
} from "../theme";
import { isAuthExpiredError, throwIfUnauthorized } from "../services/authSession";

const STORY_REQUEST_MAX = 1000;

function parseApiPayload(text) {
  try {
    const outer = JSON.parse(text);
    return typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
  } catch {
    return null;
  }
}

// A warm, human-feeling placeholder avatar: the person's initials on a soft
// colored disc, seeded from their name so each person keeps a stable color
// until real profile photos land.
const AVATAR_PALETTE = [
  { bg: "#E8D9C4", fg: "#6B4E2E" },
  { bg: "#D6E2D2", fg: "#3F5A3A" },
  { bg: "#D9E0EC", fg: "#3C4C6B" },
  { bg: "#EEDAD6", fg: "#7A473C" },
  { bg: "#E4DCEC", fg: "#57436E" },
  { bg: "#E9E3CC", fg: "#6E6231" },
];

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(dt);
}

function initialsFor(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function paletteFor(name) {
  const key = String(name || "");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function MemberAvatar({ name }) {
  const { bg, fg } = paletteFor(name);
  return (
    <span
      className="km-fc-avatar"
      style={{ background: bg, color: fg }}
      aria-hidden="true"
    >
      {initialsFor(name)}
    </span>
  );
}

function StoryRequestModal({ member, busy, error, onSend, onClose }) {
  const [message, setMessage] = useState("");
  const remaining = STORY_REQUEST_MAX - message.length;
  const name = member?.display_name || "your family member";

  return (
    <div
      className="km-fc-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Ask ${name} to share a memory`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="km-fc-modal">
        <div className="km-fc-modal-head">
          <div className="km-fc-modal-title">
            Ask {name} to share a memory
          </div>
          <button
            type="button"
            className="km-alerts-x"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="km-prose" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0 }}>
            Invite {name} to share a memory to their biography. Example:
            &ldquo;{name}, do you remember when we got lost in NYC? I&apos;d love
            for you to share that story.&rdquo;
          </p>
        </div>
        <TextArea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={STORY_REQUEST_MAX}
          disabled={busy}
          placeholder={`${name}, do you remember when we got lost in NYC? I'd love for you to share that story.`}
        />
        <div className="km-form-help" style={{ marginTop: 6 }}>
          {remaining} characters left
        </div>
        {error ? (
          <div style={{ marginTop: 12 }}>
            <Banner tone="danger">{error}</Banner>
          </div>
        ) : null}
        <div className="km-row" style={{ marginTop: 16, gap: 10, justifyContent: "flex-end" }}>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onSend(message.trim())}
            disabled={busy || !message.trim()}
          >
            {busy ? (
              <>
                <Spinner /> Sending...
              </>
            ) : (
              <>
                <MessageCircleHeart size={16} strokeWidth={1.6} /> Send request
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Family Circle — the home for the family and close friends you're connected to
 * through Kinin biographies. It lists everyone in your circle (people you've
 * invited to your biography and people who've shared theirs with you), lets you
 * invite new people, and lets you ask a storyteller in your circle to share a
 * specific memory. The on/off switch for whether your own biography is
 * shareable still lives in Settings; a link points there.
 */
export default function FamilyCirclePage({
  isAuthed,
  getAccessToken,
  apiBase,
  biographyEnabled = true,
  isReader = false,
  onManageSharing,
  onStoryRequestsSeen,
}) {
  const canLoad = !!apiBase && typeof getAccessToken === "function" && isAuthed;
  // Readers (biography_only) have no biography of their own to share, so they
  // can't invite people — they only appear in others' circles and can request
  // stories from the storytellers who've shared with them.
  const canInvite = canLoad && !isReader;

  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRelationship, setShareRelationship] = useState("");

  const [requestTarget, setRequestTarget] = useState(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState("");

  const [sentRequests, setSentRequests] = useState([]);
  const [sentLoading, setSentLoading] = useState(false);
  // Collapsed by default: show only the most recent couple of requests so a long
  // history doesn't dominate the page. Expandable on demand.
  const [sentExpanded, setSentExpanded] = useState(false);
  const SENT_COLLAPSED_COUNT = 2;

  const loadCircle = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/biographies/circle`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      await throwIfUnauthorized(res);
      const parsed = parseApiPayload(await res.text());
      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.error || `Request failed (${res.status})`);
      }
      setMembers(Array.isArray(parsed?.members) ? parsed.members : []);
      setPendingInvites(Array.isArray(parsed?.pending_invites) ? parsed.pending_invites : []);
    } catch (e) {
      if (isAuthExpiredError(e)) return;
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, getAccessToken, canLoad]);

  const markStoryRequestsSeen = useCallback(async () => {
    if (!canLoad) return;
    try {
      const token = await getAccessToken();
      await fetch(`${apiBase}/biographies/story-requests/seen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (typeof onStoryRequestsSeen === "function") onStoryRequestsSeen();
    } catch {
      // Non-critical: the alert will clear on the next profile refresh anyway.
    }
  }, [apiBase, getAccessToken, canLoad, onStoryRequestsSeen]);

  const loadStoryRequests = useCallback(async () => {
    if (!canLoad) return;
    setSentLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/biographies/story-requests`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const parsed = parseApiPayload(await res.text());
      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.error || `Request failed (${res.status})`);
      }
      const list = Array.isArray(parsed?.requests) ? parsed.requests : [];
      setSentRequests(list);
      // Opening Family Circle acknowledges any "your memory was shared" nudges,
      // just like opening Pins clears the incoming-request alert. Best-effort.
      if (list.some((r) => r?.status === "fulfilled")) {
        markStoryRequestsSeen();
      }
    } catch {
      // History is a nice-to-have; a load failure shouldn't disrupt the page.
      setSentRequests([]);
    } finally {
      setSentLoading(false);
    }
  }, [apiBase, getAccessToken, canLoad, markStoryRequestsSeen]);

  useEffect(() => {
    loadCircle();
    loadStoryRequests();
  }, [loadCircle, loadStoryRequests]);

  async function addShare(e) {
    if (e?.preventDefault) e.preventDefault();
    if (!canInvite || busy) return;
    const email = shareEmail.trim();
    const relationship = shareRelationship.trim();
    if (!email) {
      setError("Enter an email address to invite.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/biographies/shares`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, relationship }),
      });
      await throwIfUnauthorized(res);
      const parsed = parseApiPayload(await res.text());
      if (!res.ok) {
        if (parsed?.error === "invite_limit_reached") {
          throw new Error(
            parsed?.detail ||
              "You've reached the limit of pending invitations. Cancel one or wait for someone to join.",
          );
        }
        throw new Error(parsed?.detail || parsed?.error || `Request failed (${res.status})`);
      }
      if (parsed?.pending) {
        setNotice(
          `Invitation sent to ${email}. They'll join your circle as soon as they're on Kinin.`,
        );
      } else {
        const name = parsed?.share?.display_name || email;
        setNotice(`${name} is now in your family circle.`);
      }
      setShareEmail("");
      setShareRelationship("");
      await loadCircle();
    } catch (err) {
      if (isAuthExpiredError(err)) return;
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member) {
    if (!canInvite || busy || !member?.member_id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/biographies/shares`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ listener_user_id: member.member_id }),
      });
      await throwIfUnauthorized(res);
      const parsed = parseApiPayload(await res.text());
      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.error || `Request failed (${res.status})`);
      }
      setNotice(`${member.display_name || "That person"} can no longer reach your biography.`);
      await loadCircle();
    } catch (err) {
      if (isAuthExpiredError(err)) return;
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelInvite(email) {
    if (!canInvite || busy || !email) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/biographies/shares`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invitee_email: email }),
      });
      await throwIfUnauthorized(res);
      const parsed = parseApiPayload(await res.text());
      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.error || `Request failed (${res.status})`);
      }
      setNotice(`Invitation to ${email} has been cancelled.`);
      await loadCircle();
    } catch (err) {
      if (isAuthExpiredError(err)) return;
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendStoryRequest(message) {
    if (!requestTarget?.member_id || !message) return;
    setRequestBusy(true);
    setRequestError("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/biographies/story-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ target_user_id: requestTarget.member_id, message }),
      });
      await throwIfUnauthorized(res);
      const parsed = parseApiPayload(await res.text());
      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.error || `Request failed (${res.status})`);
      }
      const name = requestTarget.display_name || "your family member";
      setRequestTarget(null);
      setNotice(`Your memory request is on its way to ${name}.`);
      loadStoryRequests();
    } catch (err) {
      if (isAuthExpiredError(err)) return;
      setRequestError(err?.message || String(err));
    } finally {
      setRequestBusy(false);
    }
  }

  const introCopy = isReader
    ? "Family Circle is where you connect with the people whose biographies you can explore. When someone is recording their own biography with Kinin, you can ask them to share a particular memory."
    : "Family Circle is where you gather the family and close friends who can interact with your biography — and where you can ask the storytellers in your circle to share a memory you'd love to hear.";

  const emptyCopy = isReader
    ? "No one has shared their biography with you yet."
    : "You haven't added anyone to your family circle yet.";

  return (
    <Section
      eyebrow="Family Circle"
      title={
        <>
          The people in your <br />
          <em>family circle.</em>
        </>
      }
    >
      <div className="km-prose" style={{ maxWidth: 680, marginBottom: 28 }} data-help-anchor="family-circle-main">
        <p>{introCopy}</p>
      </div>

      {!isAuthed ? (
        <Banner tone="info">
          <span>Sign in to see your Family Circle.</span>
        </Banner>
      ) : null}

      {isAuthed && !isReader && !biographyEnabled ? (
        <div style={{ marginBottom: 20 }}>
          <Banner tone="info">
            <div>
              <div>
                Biography sharing is currently paused, so the people below
                can&apos;t reach your biography yet.
              </div>
              {onManageSharing ? (
                <div style={{ marginTop: 10 }}>
                  <Button size="sm" onClick={onManageSharing}>
                    Turn sharing on in Settings
                  </Button>
                </div>
              ) : null}
            </div>
          </Banner>
        </div>
      ) : null}

      {notice ? (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="info">{notice}</Banner>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="danger">{error}</Banner>
        </div>
      ) : null}

      {isAuthed ? (
        <div style={{ marginBottom: 24 }}>
          <Frame label="Your family circle">
            {loading ? (
              <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
                <Skeleton />
                <Skeleton short />
              </div>
            ) : members.length === 0 ? (
              <div className="km-form-help" style={{ fontStyle: "normal" }}>
                {emptyCopy}
              </div>
            ) : (
              <div className="km-fc-grid">
                {members.map((m) => {
                  const isReaderMember = m.account_type === "reader";
                  return (
                    <div key={m.member_id} className="km-fc-card">
                      <div className="km-fc-card-top">
                        <MemberAvatar name={m.display_name} />
                        <div className="km-fc-card-id">
                          <div className="km-fc-card-name">
                            {m.display_name || "Family member"}
                          </div>
                          {m.email ? (
                            <div className="km-fc-card-email" title={m.email}>
                              {m.email}
                            </div>
                          ) : null}
                          {m.relationship ? (
                            <div className="km-fc-card-rel">{m.relationship}</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="km-fc-tags">
                        {m.shares_with_me ? (
                          <span className="km-fc-chip">Shares their biography with you</span>
                        ) : null}
                        {m.i_share_with_them ? (
                          <span className="km-fc-chip">Can hear your biography</span>
                        ) : null}
                        {isReaderMember ? (
                          <span className="km-fc-chip km-fc-chip-muted">
                            Reader · no biography yet
                          </span>
                        ) : null}
                      </div>

                      <div className="km-fc-card-actions">
                        {m.can_request_story ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setRequestError("");
                              setRequestTarget(m);
                            }}
                            disabled={busy}
                          >
                            <MessageCircleHeart size={15} strokeWidth={1.6} /> Ask{" "}
                            {m.display_name ? m.display_name.split(" ")[0] : "them"} to
                            share a memory
                          </Button>
                        ) : null}
                        {m.i_share_with_them ? (
                          <Button size="sm" onClick={() => removeMember(m)} disabled={busy}>
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Frame>
        </div>
      ) : null}

      {isAuthed ? (
        <div style={{ marginBottom: 24 }}>
          <Frame label="Memory requests you've sent">
            {sentLoading ? (
              <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
                <Skeleton />
                <Skeleton short />
              </div>
            ) : sentRequests.length === 0 ? (
              <div className="km-form-help" style={{ fontStyle: "normal" }}>
                You haven&apos;t asked anyone to share a memory yet. When you do,
                you&apos;ll see a record of your requests here.
              </div>
            ) : (
              <>
              <ul className="km-share-list">
                {(() => {
                  const ordered = [...sentRequests].sort(
                    (a, b) =>
                      new Date(b.created_at || 0).getTime() -
                      new Date(a.created_at || 0).getTime(),
                  );
                  const visible = sentExpanded
                    ? ordered
                    : ordered.slice(0, SENT_COLLAPSED_COUNT);
                  return visible;
                })().map((r) => {
                  const to = (r.target_name || "").trim() || "A family member";
                  const fulfilled = r.status === "fulfilled";
                  return (
                    <li key={r.request_id} className="km-share-row" style={{ alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div>
                          <strong>{to}</strong>
                          {r.created_at ? (
                            <span className="km-muted"> · {formatDate(r.created_at)}</span>
                          ) : null}
                        </div>
                        {r.message ? (
                          <div className="km-muted" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                            &ldquo;{r.message}&rdquo;
                          </div>
                        ) : null}
                        {fulfilled ? (
                          <div
                            style={{
                              marginTop: 6,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              color: "#3F5A3A",
                            }}
                          >
                            <HeartHandshake size={15} strokeWidth={1.8} aria-hidden="true" />
                            <span>
                              {to} shared this memory
                              {r.recorded_in_biography ? " — it's now in their Kinin biography" : ""}
                              {r.fulfilled_at ? ` · ${formatDate(r.fulfilled_at)}` : ""}
                            </span>
                          </div>
                        ) : (
                          <div className="km-muted" style={{ marginTop: 6 }}>
                            Waiting for {to} to share
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {sentRequests.length > SENT_COLLAPSED_COUNT ? (
                <div className="km-row" style={{ marginTop: 12 }}>
                  <Button size="sm" onClick={() => setSentExpanded((v) => !v)}>
                    {sentExpanded
                      ? "Show fewer"
                      : `Show all ${sentRequests.length} requests`}
                  </Button>
                </div>
              ) : null}
              </>
            )}
          </Frame>
        </div>
      ) : null}

      {canInvite ? (
        <div data-help-anchor="family-circle-invite">
          <Frame label="Invite family & close friends">
            <div className="km-prose" style={{ maxWidth: 560, marginBottom: 16 }}>
              <p>
                Invite someone by the email tied to their Kinin account and they can
                start right away. Invite someone who isn&apos;t on Kinin yet and
                they&apos;ll gain access when they join.
              </p>
            </div>

            <form className="km-form-grid" onSubmit={addShare}>
              <FormRow label="Their email">
                <TextInput
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  disabled={busy}
                  inputMode="email"
                  placeholder="name@example.com"
                />
              </FormRow>
              <FormRow label="Relationship (optional)" help="e.g. daughter, brother, close friend">
                <TextInput
                  value={shareRelationship}
                  onChange={(e) => setShareRelationship(e.target.value)}
                  disabled={busy}
                  maxLength={60}
                  placeholder="daughter"
                />
              </FormRow>
            </form>
            <div className="km-row" style={{ marginTop: 14 }}>
              <Button variant="primary" onClick={addShare} disabled={busy || !shareEmail.trim()}>
                {busy ? (
                  <>
                    <Spinner /> Working...
                  </>
                ) : (
                  "Invite this person"
                )}
              </Button>
            </div>

            {pendingInvites.length > 0 ? (
              <div style={{ marginTop: 24 }}>
                <div className="km-mono-label" style={{ marginBottom: 10 }}>
                  Invited · not joined yet
                </div>
                <ul className="km-share-list">
                  {pendingInvites.map((p) => (
                    <li key={p.invitee_email} className="km-share-row">
                      <div>
                        <strong>{p.invitee_email}</strong>
                        {p.relationship ? (
                          <span className="km-muted"> · {p.relationship}</span>
                        ) : null}
                        <span className="km-muted"> · awaiting sign-up</span>
                      </div>
                      {canInvite ? (
                        <Button onClick={() => cancelInvite(p.invitee_email)} disabled={busy}>
                          Cancel
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Frame>
        </div>
      ) : null}

      {isAuthed ? (
        <div style={{ marginTop: 24 }}>
          <Frame label="More coming soon">
            <div className="km-prose" style={{ maxWidth: 560 }}>
              <p style={{ margin: 0 }}>
                <UsersRound size={16} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />
                Family Circle will grow into a space for your closest people — with
                more ways to share moments and stay connected. This is just the
                beginning.
              </p>
            </div>
          </Frame>
        </div>
      ) : null}

      {requestTarget ? (
        <StoryRequestModal
          member={requestTarget}
          busy={requestBusy}
          error={requestError}
          onSend={sendStoryRequest}
          onClose={() => {
            if (!requestBusy) setRequestTarget(null);
          }}
        />
      ) : null}
    </Section>
  );
}
