import { useCallback, useEffect, useState } from "react";
import { Banner, Button, FormRow, Frame, Section, Skeleton, Spinner, TextInput } from "../theme";
import InterviewDetailsPanel from "../components/InterviewDetailsPanel";
import VoicePickerSection from "../components/VoicePickerSection";

function parseSharesPayload(text) {
  try {
    const outer = JSON.parse(text);
    return typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
  } catch {
    return null;
  }
}

// Settings, split by category. `category` is one of the ids in
// SETTINGS_CATEGORIES (voice | reminders | reunion | interview) or null for
// the index landing. A persistent breakout menu switches between them; each
// section persists on its own (optimistic saves in App.jsx).
export default function SettingsPage({
  category,
  categories,
  onNavigateCategory,
  onClose,
  profileBusy,
  profileNotice,
  profileError,
  // voice
  ttsVoiceUuid,
  setTtsVoiceUuid,
  // voice features add-on
  voiceFeaturesEnabled,
  saveVoiceFeaturesEnabled,
  // reminders
  continuitySettings,
  saveReminderCadence,
  // reunion
  reunionSettings,
  saveReunionEnabled,
  // help & tips
  helpTipsEnabled,
  saveHelpTipsEnabled,
  replayWalkthroughs,
  apiBase,
  getAccessToken,
  // interview
  interviewDetails,
}) {
  const reunionEnabled = reunionSettings?.enabled !== false;
  const helpTipsOn = helpTipsEnabled !== false;
  const voiceFeaturesOn = voiceFeaturesEnabled === true;
  const cadenceValue = String(continuitySettings?.reminder_cadence_weeks ?? 2);
  const canManageShares =
    !!apiBase && typeof getAccessToken === "function" && category === "reunion";

  const [shares, setShares] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [sharesError, setSharesError] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRelationship, setShareRelationship] = useState("");
  const [replayNotice, setReplayNotice] = useState("");

  const loadShares = useCallback(async () => {
    if (!canManageShares) return;
    setSharesLoading(true);
    setSharesError("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/reunion/shares`, {
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
      setSharesError("Enter an email address to share with.");
      return;
    }
    setShareBusy(true);
    setSharesError("");
    setShareNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase}/reunion/shares`, {
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
          `Invitation sent to ${email}. They'll be able to hear your story as soon as they join Kinin.`,
        );
      } else {
        const name = parsed?.share?.display_name || email;
        setShareNotice(`${name} can now hear your story in Reunion.`);
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
      const res = await fetch(`${apiBase}/reunion/shares`, {
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
      const res = await fetch(`${apiBase}/reunion/shares`, {
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

  const activeCategory = categories.find((c) => c.id === category) || null;

  return (
    <Section
      eyebrow="Settings"
      title={
        activeCategory ? (
          <>{activeCategory.label}</>
        ) : (
          <>
            Your <em>preferences</em>,
            <br />by category.
          </>
        )
      }
    >
      <nav className="km-settings-nav" aria-label="Settings categories">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`km-settings-nav-item${c.id === category ? " is-active" : ""}`}
            onClick={() => onNavigateCategory(c.page)}
          >
            <span className="km-settings-nav-label">{c.label}</span>
            <span className="km-settings-nav-blurb">{c.blurb}</span>
          </button>
        ))}
      </nav>

      {profileError ? (
        <div style={{ margin: "20px 0" }}>
          <Banner tone="danger">
            <span><strong>Error.</strong> {profileError}</span>
          </Banner>
        </div>
      ) : null}
      {profileNotice ? (
        <div style={{ margin: "20px 0" }}>
          <Banner tone="info">{profileNotice}</Banner>
        </div>
      ) : null}

      {!activeCategory ? (
        <div className="km-prose" style={{ maxWidth: 560, marginTop: 24 }}>
          <p>Pick a category above to adjust its settings. Changes save on their own.</p>
        </div>
      ) : null}

      <div className="km-stack" style={{ gap: 32, marginTop: 8 }}>
        {category === "voice" ? (
          <>
            <Frame label="Voice">
              <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
                <p>
                  Choose the voice Kinin uses when reading turns aloud. Each
                  option has a preview clip so you can audition before you
                  commit. You can change this anytime.
                </p>
              </div>
              <VoicePickerSection
                ttsVoiceUuid={ttsVoiceUuid}
                setTtsVoiceUuid={setTtsVoiceUuid}
                disabled={profileBusy}
              />
            </Frame>

            <Frame label="Voice features">
              <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
                <p>
                  Voice features let you <strong>speak instead of type</strong> —
                  tap the microphone in chat and Kinin turns your words into text
                  you can edit before sending. This add-on also unlocks upcoming
                  abilities to save your spoken recordings and let your Reunion
                  persona speak back in your own voice.
                </p>
                <p className="km-muted">
                  Kinin reading its turns aloud is always free and works without
                  this add-on.
                </p>
              </div>
              <label className="km-checkbox">
                <input
                  type="checkbox"
                  checked={voiceFeaturesOn}
                  onChange={(e) =>
                    saveVoiceFeaturesEnabled &&
                    saveVoiceFeaturesEnabled(e.target.checked)
                  }
                  disabled={profileBusy || !saveVoiceFeaturesEnabled}
                />
                <span>
                  <strong>
                    Voice features are {voiceFeaturesOn ? "on" : "off"}.
                  </strong>
                  {" "}
                  {voiceFeaturesOn
                    ? "The microphone is available in chat so you can dictate your messages."
                    : "Turn this on to dictate messages with the microphone in chat."}
                </span>
              </label>
            </Frame>
          </>
        ) : null}

        {category === "reminders" ? (
          <Frame label="Reminder rhythm">
            <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
              <p>Choose how long you can go absent before Kinin gets back in touch.</p>
            </div>
            <div>
              <div className="km-mono-label" style={{ marginBottom: 10 }}>
                Remind me when I haven't talked with Kinin for
              </div>
              <div className="km-radio-list">
                {[
                  { value: "1", label: "1 week" },
                  { value: "2", label: "2 weeks" },
                  { value: "3", label: "3 weeks" },
                  { value: "4", label: "4 weeks" },
                  { value: "0", label: "Never" },
                ].map((opt) => (
                  <label key={opt.value} className="km-radio">
                    <input
                      type="radio"
                      name="reminder-cadence-weeks"
                      value={opt.value}
                      checked={cadenceValue === opt.value}
                      onChange={(e) =>
                        saveReminderCadence &&
                        saveReminderCadence(Number(e.target.value))
                      }
                      disabled={profileBusy || !saveReminderCadence}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <div className="km-mono-label" style={{ marginBottom: 10 }}>
                How should Kinin remind me?
              </div>
              <div className="km-radio-list">
                <label className="km-radio">
                  <input type="radio" checked readOnly disabled={profileBusy} />
                  <span>Email</span>
                </label>
                <label className="km-radio km-radio-disabled">
                  <input type="radio" disabled />
                  <span>Text <span className="km-muted">— coming soon</span></span>
                </label>
              </div>
            </div>
          </Frame>
        ) : null}

        {category === "help" ? (
          <Frame label="Help & tips">
            <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
              <p>
                Kinin can show short, friendly pop-up tips and a quick guided
                tour the first time you visit each part of the app. You can turn
                these off any time, and turn them back on whenever you like.
              </p>
            </div>
            <label className="km-checkbox">
              <input
                type="checkbox"
                checked={helpTipsOn}
                onChange={(e) => {
                  setReplayNotice("");
                  if (saveHelpTipsEnabled) saveHelpTipsEnabled(e.target.checked);
                }}
                disabled={profileBusy || !saveHelpTipsEnabled}
              />
              <span>
                <strong>
                  Helpful tips and walkthroughs are {helpTipsOn ? "on" : "off"}.
                </strong>
                {" "}
                {helpTipsOn
                  ? "You'll see a short guided tour the first time you open each page."
                  : "You won't see guided tours automatically. You can still open them anytime from the Help button."}
              </span>
            </label>

            <div style={{ marginTop: 28 }}>
              <div className="km-mono-label" style={{ marginBottom: 12 }}>
                Start the tours over
              </div>
              <div className="km-prose" style={{ maxWidth: 560, marginBottom: 14 }}>
                <p>
                  Already seen the tours? You can replay them. The next time you
                  visit each page, its guided tour will appear again.
                </p>
              </div>
              <Button
                onClick={async () => {
                  setReplayNotice("");
                  const ok = replayWalkthroughs ? await replayWalkthroughs() : false;
                  if (ok) setReplayNotice("Done — the tours will show again as you visit each page.");
                }}
                disabled={profileBusy || !replayWalkthroughs}
              >
                Replay walkthroughs
              </Button>
              {replayNotice ? (
                <div style={{ marginTop: 12 }}>
                  <Banner tone="info">{replayNotice}</Banner>
                </div>
              ) : null}
            </div>
          </Frame>
        ) : null}

        {category === "reunion" ? (
          <Frame label="Reunion">
            <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
              <p>
                Reunion lets family members you've invited talk directly with
                your interview memories &mdash; asking questions and hearing
                answers in your voice, grounded in what you've already shared
                with Kinin. New memories become available to Reunion as soon as
                you finish each turn.
              </p>
              <p>
                You control access. Turn Reunion off any time to pause it for
                everyone; turn it back on when you're ready. Individual
                per-listener controls will come later &mdash; this is a blanket
                switch for now.
              </p>
            </div>
            <label className="km-checkbox">
              <input
                type="checkbox"
                checked={reunionEnabled}
                onChange={(e) =>
                  saveReunionEnabled && saveReunionEnabled(e.target.checked)
                }
                disabled={profileBusy || !saveReunionEnabled}
              />
              <span>
                <strong>Reunion is {reunionEnabled ? "on" : "paused"}.</strong>
                {" "}
                {reunionEnabled
                  ? "Family members you've granted access can reach you through Reunion."
                  : "No one can reach you through Reunion right now, even if you've granted them access."}
              </span>
            </label>

            {apiBase && typeof getAccessToken === "function" ? (
              <div style={{ marginTop: 28 }}>
                <div className="km-mono-label" style={{ marginBottom: 12 }}>
                  Who can hear your story in Kinin's Reunion
                </div>
                <div className="km-prose" style={{ maxWidth: 560, marginBottom: 16 }}>
                  <p>
                    Invite a family member or friend by the email tied to their
                    Kinin account. They'll be able to talk with your Reunion right
                    away. You can remove access at any time.
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
                      "Share with this person"
                    )}
                  </Button>
                </div>

                <div style={{ marginTop: 22 }}>
                  <div className="km-mono-label" style={{ marginBottom: 10 }}>
                    Currently shared with
                  </div>
                  {sharesLoading ? (
                    <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
                      <Skeleton />
                      <Skeleton short />
                    </div>
                  ) : shares.length === 0 ? (
                    <div className="km-form-help" style={{ fontStyle: "normal" }}>
                      You haven't shared your Reunion with anyone yet.
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
              </div>
            ) : null}
          </Frame>
        ) : null}

        {category === "interview" ? (
          interviewDetails ? (
            <Frame label="Interview details">
              <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
                <p>
                  A behind-the-scenes look at your current interview session —
                  journey progress, current step, topic labels, and other context
                  Kinin is tracking for you.
                </p>
              </div>
              <InterviewDetailsPanel {...interviewDetails} />
            </Frame>
          ) : (
            <div className="km-prose" style={{ maxWidth: 560 }}>
              <p className="km-muted">
                Start a conversation to see live interview details here.
              </p>
            </div>
          )
        ) : null}
      </div>

      <div className="km-form-actions">
        <Button onClick={onClose} disabled={profileBusy}>
          Done
        </Button>
      </div>
    </Section>
  );
}
