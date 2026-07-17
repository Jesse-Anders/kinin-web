import { useCallback, useEffect, useState } from "react";
import { UsersRound } from "lucide-react";
import {
  Banner,
  Button,
  FormRow,
  Frame,
  Section,
  Skeleton,
  Spinner,
  TextInput,
} from "../theme";

function parseSharesPayload(text) {
  try {
    const outer = JSON.parse(text);
    return typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
  } catch {
    return null;
  }
}

/**
 * Family Circle — the home for the family and close friends who can interact
 * with your biography. In this first version it relocates the invite/manage-
 * access controls that used to live in Settings. The on/off switch for whether
 * your biography is shareable at all still lives in Settings; a link points
 * there. More ways to connect with your circle are coming later.
 */
export default function FamilyCirclePage({
  isAuthed,
  getAccessToken,
  apiBase,
  biographyEnabled = true,
  onManageSharing,
}) {
  const canManageShares =
    !!apiBase && typeof getAccessToken === "function" && isAuthed;

  const [shares, setShares] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [sharesError, setSharesError] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRelationship, setShareRelationship] = useState("");

  const loadShares = useCallback(async () => {
    if (!canManageShares) return;
    setSharesLoading(true);
    setSharesError("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/biographies/shares`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const parsed = parseSharesPayload(text);
      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.error || `Request failed (${res.status})`);
      }
      setShares(Array.isArray(parsed?.shares) ? parsed.shares : []);
      setPendingInvites(Array.isArray(parsed?.pending_invites) ? parsed.pending_invites : []);
    } catch (e) {
      setSharesError(e?.message || String(e));
    } finally {
      setSharesLoading(false);
    }
  }, [apiBase, getAccessToken, canManageShares]);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  async function addShare(e) {
    if (e?.preventDefault) e.preventDefault();
    if (!canManageShares || shareBusy) return;
    const email = shareEmail.trim();
    const relationship = shareRelationship.trim();
    if (!email) {
      setSharesError("Enter an email address to invite.");
      return;
    }
    setShareBusy(true);
    setSharesError("");
    setShareNotice("");
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
      const text = await res.text();
      const parsed = parseSharesPayload(text);
      if (!res.ok) {
        if (parsed?.error === "invite_limit_reached") {
          throw new Error(
            parsed?.detail || "You've reached the limit of pending invitations. Cancel one or wait for someone to join.",
          );
        }
        throw new Error(parsed?.detail || parsed?.error || `Request failed (${res.status})`);
      }
      if (parsed?.pending) {
        setShareNotice(
          `Invitation sent to ${email}. They'll be able to interact with your biography as soon as they join Kinin.`,
        );
      } else {
        const name = parsed?.share?.display_name || email;
        setShareNotice(`${name} can now interact with your biography.`);
      }
      setShareEmail("");
      setShareRelationship("");
      await loadShares();
    } catch (err) {
      setSharesError(err?.message || String(err));
    } finally {
      setShareBusy(false);
    }
  }

  async function removeShare(listenerUserId, name) {
    if (!canManageShares || shareBusy || !listenerUserId) return;
    setShareBusy(true);
    setSharesError("");
    setShareNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/biographies/shares`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ listener_user_id: listenerUserId }),
      });
      const text = await res.text();
      const parsed = parseSharesPayload(text);
      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.error || `Request failed (${res.status})`);
      }
      setShareNotice(`${name || "That person"}'s access has been removed.`);
      await loadShares();
    } catch (err) {
      setSharesError(err?.message || String(err));
    } finally {
      setShareBusy(false);
    }
  }

  async function cancelInvite(email) {
    if (!canManageShares || shareBusy || !email) return;
    setShareBusy(true);
    setSharesError("");
    setShareNotice("");
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
      const text = await res.text();
      const parsed = parseSharesPayload(text);
      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.error || `Request failed (${res.status})`);
      }
      setShareNotice(`Invitation to ${email} has been cancelled.`);
      await loadShares();
    } catch (err) {
      setSharesError(err?.message || String(err));
    } finally {
      setShareBusy(false);
    }
  }

  return (
    <Section
      eyebrow="Family Circle"
      title={
        <>
          The people in your <br /><em>family circle.</em>
        </>
      }
    >
      <div className="km-prose" style={{ maxWidth: 680, marginBottom: 28 }} data-help-anchor="family-circle-main">
        <p>
          Family Circle is where you invite the family and close friends who can
          interact with your biography — asking questions and hearing answers in
          your own words. You can add or remove people any time.
        </p>
      </div>

      {!isAuthed ? (
        <Banner tone="info">
          <span>Sign in to manage your Family Circle.</span>
        </Banner>
      ) : null}

      {isAuthed && !biographyEnabled ? (
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

      {canManageShares ? (
        <div data-help-anchor="family-circle-invite">
        <Frame label="Invite family & close friends">
          <div className="km-prose" style={{ maxWidth: 560, marginBottom: 16 }}>
            <p>
              Invite someone by the email tied to their Kinin account and they can
              start right away. Invite someone who isn&apos;t on Kinin yet and
              they&apos;ll gain access when they join.
            </p>
          </div>

          {shareNotice ? (
            <div style={{ marginBottom: 14 }}>
              <Banner tone="info">{shareNotice}</Banner>
            </div>
          ) : null}
          {sharesError ? (
            <div style={{ marginBottom: 14 }}>
              <Banner tone="danger">{sharesError}</Banner>
            </div>
          ) : null}

          <form className="km-form-grid" onSubmit={addShare}>
            <FormRow label="Their email">
              <TextInput
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                disabled={shareBusy}
                inputMode="email"
                placeholder="name@example.com"
              />
            </FormRow>
            <FormRow label="Relationship (optional)" help="e.g. daughter, brother, close friend">
              <TextInput
                value={shareRelationship}
                onChange={(e) => setShareRelationship(e.target.value)}
                disabled={shareBusy}
                maxLength={60}
                placeholder="daughter"
              />
            </FormRow>
          </form>
          <div className="km-row" style={{ marginTop: 14 }}>
            <Button variant="primary" onClick={addShare} disabled={shareBusy || !shareEmail.trim()}>
              {shareBusy ? (
                <>
                  <Spinner /> Working...
                </>
              ) : (
                "Invite this person"
              )}
            </Button>
          </div>

          <div style={{ marginTop: 22 }}>
            <div className="km-mono-label" style={{ marginBottom: 10 }}>
              In your family circle
            </div>
            {sharesLoading ? (
              <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
                <Skeleton />
                <Skeleton short />
              </div>
            ) : shares.length === 0 ? (
              <div className="km-form-help" style={{ fontStyle: "normal" }}>
                You haven&apos;t invited anyone to your biography yet.
              </div>
            ) : (
              <ul className="km-share-list">
                {shares.map((s) => (
                  <li key={s.listener_user_id} className="km-share-row">
                    <div>
                      <strong>{s.display_name || s.listener_user_id}</strong>
                      {s.relationship ? (
                        <span className="km-muted"> · {s.relationship}</span>
                      ) : null}
                    </div>
                    <Button
                      onClick={() => removeShare(s.listener_user_id, s.display_name)}
                      disabled={shareBusy}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pendingInvites.length > 0 ? (
            <div style={{ marginTop: 20 }}>
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
                    <Button onClick={() => cancelInvite(p.invitee_email)} disabled={shareBusy}>
                      Cancel
                    </Button>
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
                Family Circle will grow into space for your
                closest people — with more ways to share moments and stay
                connected. This is just the beginning.
              </p>
            </div>
          </Frame>
        </div>
      ) : null}
    </Section>
  );
}
