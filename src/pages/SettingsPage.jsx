import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Frame, Section } from "../theme";
import InterviewDetailsPanel from "../components/InterviewDetailsPanel";
import VoicePickerSection from "../components/VoicePickerSection";
import StewardshipPage from "./StewardshipPage";

// Audio features (mic dictation + Kinin's spoken voice) are currently on for
// every user, so the per-account enable/disable toggle is hidden. Flip this to
// true (and re-open the backend STT gate) if we reintroduce it as an add-on.
const SHOW_VOICE_FEATURES_TOGGLE = false;

// Categories that use draft → Save Settings / Cancel (stay on page).
const SAVEABLE_CATEGORIES = new Set(["voice", "reminders", "biographies", "help"]);

// Settings, split by category. `category` is one of the ids in
// SETTINGS_CATEGORIES (voice | reminders | biographies | interview) or null for
// the index landing. Plan & billing lives on My Account. A persistent breakout
// menu switches between categories. Editable sections use local drafts and
// persist only when the user clicks Save Settings.
export default function SettingsPage({
  category,
  categories,
  onNavigateCategory,
  profileBusy,
  profileNotice,
  profileError,
  // voice
  ttsVoiceUuid,
  saveVoicePreferences,
  // voice features add-on
  voiceFeaturesEnabled,
  saveVoiceFeaturesEnabled,
  // reminders
  continuitySettings,
  saveReminderCadence,
  weeklySparkSettings,
  saveWeeklySparkCadence,
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
  // stewardship
  stewardshipProps = null,
}) {
  const [replayNotice, setReplayNotice] = useState("");
  const [localNotice, setLocalNotice] = useState("");

  const [draftVoiceUuid, setDraftVoiceUuid] = useState(ttsVoiceUuid || "");
  const [draftVoiceFeatures, setDraftVoiceFeatures] = useState(voiceFeaturesEnabled === true);
  const [draftCadence, setDraftCadence] = useState(
    String(continuitySettings?.reminder_cadence_weeks ?? 2)
  );
  const [draftSparkCadence, setDraftSparkCadence] = useState(
    weeklySparkSettings?.cadence || "weekly"
  );
  const [draftBioEnabled, setDraftBioEnabled] = useState(
    biographySettings?.enabled !== false
  );
  const [draftHelpTips, setDraftHelpTips] = useState(helpTipsEnabled !== false);

  // Clear page-local notices when moving between categories.
  useEffect(() => {
    setLocalNotice("");
    setReplayNotice("");
  }, [category]);

  // Reset drafts when switching categories or when saved props catch up.
  useEffect(() => {
    setDraftVoiceUuid(ttsVoiceUuid || "");
    setDraftVoiceFeatures(voiceFeaturesEnabled === true);
    setDraftCadence(String(continuitySettings?.reminder_cadence_weeks ?? 2));
    setDraftSparkCadence(weeklySparkSettings?.cadence || "weekly");
    setDraftBioEnabled(biographySettings?.enabled !== false);
    setDraftHelpTips(helpTipsEnabled !== false);
  }, [
    category,
    ttsVoiceUuid,
    voiceFeaturesEnabled,
    continuitySettings?.reminder_cadence_weeks,
    weeklySparkSettings?.cadence,
    biographySettings?.enabled,
    helpTipsEnabled,
  ]);

  const activeCategory = categories.find((c) => c.id === category) || null;
  const showSaveCancel = SAVEABLE_CATEGORIES.has(category);

  const dirty = useMemo(() => {
    if (category === "voice") {
      const voiceDirty = (draftVoiceUuid || "") !== (ttsVoiceUuid || "");
      const featuresDirty =
        SHOW_VOICE_FEATURES_TOGGLE && draftVoiceFeatures !== (voiceFeaturesEnabled === true);
      return voiceDirty || featuresDirty;
    }
    if (category === "reminders") {
      const cadenceDirty =
        draftCadence !== String(continuitySettings?.reminder_cadence_weeks ?? 2);
      const sparkDirty =
        !!weeklySparkSettings?.enrolled &&
        draftSparkCadence !== (weeklySparkSettings?.cadence || "weekly");
      return cadenceDirty || sparkDirty;
    }
    if (category === "biographies") {
      return draftBioEnabled !== (biographySettings?.enabled !== false);
    }
    if (category === "help") {
      return draftHelpTips !== (helpTipsEnabled !== false);
    }
    return false;
  }, [
    category,
    draftVoiceUuid,
    ttsVoiceUuid,
    draftVoiceFeatures,
    voiceFeaturesEnabled,
    draftCadence,
    continuitySettings?.reminder_cadence_weeks,
    draftSparkCadence,
    weeklySparkSettings?.enrolled,
    weeklySparkSettings?.cadence,
    draftBioEnabled,
    biographySettings?.enabled,
    draftHelpTips,
    helpTipsEnabled,
  ]);

  function handleCancel() {
    setDraftVoiceUuid(ttsVoiceUuid || "");
    setDraftVoiceFeatures(voiceFeaturesEnabled === true);
    setDraftCadence(String(continuitySettings?.reminder_cadence_weeks ?? 2));
    setDraftSparkCadence(weeklySparkSettings?.cadence || "weekly");
    setDraftBioEnabled(biographySettings?.enabled !== false);
    setDraftHelpTips(helpTipsEnabled !== false);
    setLocalNotice("");
  }

  async function handleSave() {
    setLocalNotice("");
    if (category === "voice") {
      let ok = true;
      if ((draftVoiceUuid || "") !== (ttsVoiceUuid || "")) {
        ok = saveVoicePreferences ? !!(await saveVoicePreferences(draftVoiceUuid)) : false;
      }
      if (
        ok &&
        SHOW_VOICE_FEATURES_TOGGLE &&
        draftVoiceFeatures !== (voiceFeaturesEnabled === true) &&
        saveVoiceFeaturesEnabled
      ) {
        ok = !!(await saveVoiceFeaturesEnabled(draftVoiceFeatures));
      }
      if (ok) setLocalNotice("Settings saved.");
      return;
    }
    if (category === "reminders") {
      let ok = true;
      if (draftCadence !== String(continuitySettings?.reminder_cadence_weeks ?? 2)) {
        ok = saveReminderCadence ? !!(await saveReminderCadence(Number(draftCadence))) : false;
      }
      if (
        ok &&
        weeklySparkSettings?.enrolled &&
        draftSparkCadence !== (weeklySparkSettings?.cadence || "weekly") &&
        saveWeeklySparkCadence
      ) {
        ok = !!(await saveWeeklySparkCadence(draftSparkCadence));
      }
      if (ok) setLocalNotice("Settings saved.");
      return;
    }
    if (category === "biographies") {
      if (draftBioEnabled === (biographySettings?.enabled !== false)) {
        setLocalNotice("Settings saved.");
        return;
      }
      const ok = saveBiographyEnabled ? !!(await saveBiographyEnabled(draftBioEnabled)) : false;
      if (ok) setLocalNotice("Settings saved.");
      return;
    }
    if (category === "help") {
      if (draftHelpTips === (helpTipsEnabled !== false)) {
        setLocalNotice("Settings saved.");
        return;
      }
      const ok = saveHelpTipsEnabled ? !!(await saveHelpTipsEnabled(draftHelpTips)) : false;
      if (ok) setLocalNotice("Settings saved.");
    }
  }

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
      {profileNotice || localNotice ? (
        <div style={{ margin: "20px 0" }}>
          <Banner tone="info">{profileNotice || localNotice}</Banner>
        </div>
      ) : null}

      {!activeCategory ? (
        <div className="km-prose" style={{ maxWidth: 560, marginTop: 24 }}>
          <p>Pick a category above to adjust its settings, then use Save Settings when you&apos;re ready.</p>
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
                ttsVoiceUuid={draftVoiceUuid}
                setTtsVoiceUuid={setDraftVoiceUuid}
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
                    checked={draftVoiceFeatures}
                    onChange={(e) => setDraftVoiceFeatures(e.target.checked)}
                    disabled={profileBusy || !saveVoiceFeaturesEnabled}
                  />
                  <span>
                    <strong>
                      Voice features are {draftVoiceFeatures ? "on" : "off"}.
                    </strong>
                    {" "}
                    {draftVoiceFeatures
                      ? "The microphone is available in chat so you can dictate your messages."
                      : "Turn this on to dictate messages with the microphone in chat."}
                  </span>
                </label>
              </Frame>
            ) : null}
          </>
        ) : null}

        {category === "reminders" ? (
          <>
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
                        checked={draftCadence === opt.value}
                        onChange={(e) => setDraftCadence(e.target.value)}
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

            {weeklySparkSettings?.enrolled ? (
              <Frame label="The Weekly Spark Emailer">
                <div className="km-prose" style={{ maxWidth: 560, marginBottom: 18 }}>
                  <p>
                    A little kindling for a conversation or journal entry — optional every time,
                    like a side quest.
                  </p>
                </div>
                <div className="km-mono-label" style={{ marginBottom: 10 }}>
                  How often should we send The Weekly Spark?
                </div>
                <div className="km-radio-list">
                  {[
                    { value: "weekly", label: "Every week" },
                    { value: "biweekly", label: "Every 2 weeks" },
                    { value: "monthly", label: "Monthly" },
                    { value: "off", label: "Turn off" },
                  ].map((opt) => (
                    <label key={opt.value} className="km-radio">
                      <input
                        type="radio"
                        name="weekly-spark-cadence"
                        value={opt.value}
                        checked={draftSparkCadence === opt.value}
                        onChange={() => setDraftSparkCadence(opt.value)}
                        disabled={profileBusy || !saveWeeklySparkCadence}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </Frame>
            ) : null}
          </>
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
                checked={draftHelpTips}
                onChange={(e) => {
                  setReplayNotice("");
                  setDraftHelpTips(e.target.checked);
                }}
                disabled={profileBusy || !saveHelpTipsEnabled}
              />
              <span>
                <strong>
                  Helpful tips and walkthroughs are {draftHelpTips ? "on" : "off"}.
                </strong>
                {" "}
                {draftHelpTips
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
          <Frame label="Biography Share Settings">
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
                checked={draftBioEnabled}
                onChange={(e) => setDraftBioEnabled(e.target.checked)}
                disabled={profileBusy || !saveBiographyEnabled}
              />
              <span>
                <strong>
                  Biography sharing is {draftBioEnabled ? "on" : "paused"}.
                </strong>
                {" "}
                {draftBioEnabled
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

        {category === "stewardship" && stewardshipProps ? (
          <StewardshipPage panelOnly {...stewardshipProps} />
        ) : null}
      </div>

      {showSaveCancel ? (
        <div className="km-form-actions">
          <Button onClick={handleCancel} disabled={profileBusy || !dirty}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={profileBusy || !dirty}
          >
            Save Settings
          </Button>
        </div>
      ) : null}
    </Section>
  );
}
