import { useState } from "react";
import { Banner, Button, Frame, Section } from "../theme";
import InterviewDetailsPanel from "../components/InterviewDetailsPanel";
import VoicePickerSection from "../components/VoicePickerSection";

// Audio features (mic dictation + Kinin's spoken voice) are currently on for
// every user, so the per-account enable/disable toggle is hidden. Flip this to
// true (and re-open the backend STT gate) if we reintroduce it as an add-on.
const SHOW_VOICE_FEATURES_TOGGLE = false;

// Settings, split by category. `category` is one of the ids in
// SETTINGS_CATEGORIES (voice | reminders | biographies | interview) or null for
// the index landing. A persistent breakout menu switches between them; each
// section persists on its own (optimistic saves in App.jsx). Managing who can
// interact with your biography now lives on the Family Circle page — this
// section keeps only the on/off switch plus a link there.
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
  // biographies
  biographySettings,
  saveBiographyEnabled,
  onManageFamilyCircle,
  // help & tips
  helpTipsEnabled,
  saveHelpTipsEnabled,
  replayWalkthroughs,
  // interview
  interviewDetails,
}) {
  const biographyEnabled = biographySettings?.enabled !== false;
  const helpTipsOn = helpTipsEnabled !== false;
  const voiceFeaturesOn = voiceFeaturesEnabled === true;
  const cadenceValue = String(continuitySettings?.reminder_cadence_weeks ?? 2);

  const [replayNotice, setReplayNotice] = useState("");

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
            <span><strong>Something went wrong.</strong> {profileError}</span>
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

            {SHOW_VOICE_FEATURES_TOGGLE ? (
              <Frame label="Voice features">
                <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
                  <p>
                    Voice features let you <strong>speak instead of type</strong> —
                    tap the microphone in chat and Kinin turns your words into text
                    you can edit before sending. This add-on also unlocks upcoming
                    abilities to save your spoken recordings and let your biography
                    speak back in your own voice.
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
            ) : null}
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

        {category === "biographies" ? (
          <Frame label="Biographies">
            <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
              <p>
                Sharing lets the family &amp; close friends you invite interact
                with your biography &mdash; asking questions and hearing answers
                in your voice, grounded in what you&apos;ve already shared with
                Kinin. New memories become available as soon as you finish each
                turn.
              </p>
              <p>
                You control access. Turn sharing off any time to pause it for
                everyone; turn it back on when you&apos;re ready.
              </p>
            </div>
            <label className="km-checkbox">
              <input
                type="checkbox"
                checked={biographyEnabled}
                onChange={(e) =>
                  saveBiographyEnabled && saveBiographyEnabled(e.target.checked)
                }
                disabled={profileBusy || !saveBiographyEnabled}
              />
              <span>
                <strong>
                  Biography sharing is {biographyEnabled ? "on" : "paused"}.
                </strong>
                {" "}
                {biographyEnabled
                  ? "The people in your Family Circle can interact with your biography."
                  : "No one can interact with your biography right now, even the people in your Family Circle."}
              </span>
            </label>

            <div style={{ marginTop: 28 }}>
              <div className="km-mono-label" style={{ marginBottom: 12 }}>
                Choose who can interact with your biography
              </div>
              <div className="km-prose" style={{ maxWidth: 560, marginBottom: 14 }}>
                <p>
                  Invite and manage the family &amp; close friends who can reach
                  your biography over in Family Circle.
                </p>
              </div>
              {onManageFamilyCircle ? (
                <Button variant="primary" onClick={onManageFamilyCircle}>
                  Open Family Circle
                </Button>
              ) : null}
            </div>
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
