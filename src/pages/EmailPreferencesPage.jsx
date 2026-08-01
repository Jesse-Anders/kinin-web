import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Frame, Section, Spinner } from "../theme";

function parsePrefsParams() {
  const p = new URLSearchParams(window.location.search || "");
  return {
    email: (p.get("email") || "").trim().toLowerCase(),
    exp: (p.get("exp") || "").trim(),
    token: (p.get("token") || "").trim(),
  };
}

async function postEmailPrefs(apiBase, endpoint, payload) {
  const res = await fetch(`${apiBase}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let parsed = null;
  try {
    const outer = JSON.parse(text);
    parsed = typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const detail = parsed ? JSON.stringify(parsed) : text;
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return parsed || {};
}

const SPARK_OPTIONS = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "off", label: "Turn off Weekly Spark" },
];

export default function EmailPreferencesPage({ apiBase }) {
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [globalUnsubscribed, setGlobalUnsubscribed] = useState(null);
  const [sparkCadence, setSparkCadence] = useState("weekly");
  const [sparkEnrolled, setSparkEnrolled] = useState(false);

  const params = useMemo(() => parsePrefsParams(), []);
  const hasTokenInputs = !!(params.email && params.exp && params.token);
  const tokenPayload = useMemo(
    () => ({ email: params.email, exp: params.exp, token: params.token }),
    [params.email, params.exp, params.token]
  );

  useEffect(() => {
    async function load() {
      if (!hasTokenInputs) return;
      setBusy(true);
      setErrorText("");
      try {
        const out = await postEmailPrefs(apiBase, "/email_prefs/weekly_spark/status", tokenPayload);
        setGlobalUnsubscribed(!!out.global_unsubscribed);
        const spark = out.weekly_spark || {};
        setSparkEnrolled(!!spark.enrolled);
        if (spark.cadence) setSparkCadence(String(spark.cadence));
      } catch (e) {
        setErrorText(e.message || String(e));
      } finally {
        setBusy(false);
      }
    }
    load();
  }, [apiBase, hasTokenInputs, tokenPayload]);

  async function saveSparkCadence(next) {
    setBusy(true);
    setErrorText("");
    setStatusText("");
    try {
      const out = await postEmailPrefs(apiBase, "/email_prefs/weekly_spark/set", {
        ...tokenPayload,
        cadence: next,
      });
      const spark = out.weekly_spark || {};
      setSparkEnrolled(!!spark.enrolled);
      if (spark.cadence) setSparkCadence(String(spark.cadence));
      setStatusText(
        next === "off"
          ? "Weekly Spark is turned off. You can turn it back on anytime."
          : "Weekly Spark frequency updated."
      );
    } catch (e) {
      setErrorText(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doUnsubscribeAll() {
    setBusy(true);
    setErrorText("");
    setStatusText("");
    try {
      const out = await postEmailPrefs(apiBase, "/email_prefs/unsubscribe", tokenPayload);
      setGlobalUnsubscribed(!!out.global_unsubscribed);
      setStatusText("You have been unsubscribed from non-essential Kinin emails.");
    } catch (e) {
      setErrorText(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doResubscribe() {
    setBusy(true);
    setErrorText("");
    setStatusText("");
    try {
      const out = await postEmailPrefs(apiBase, "/email_prefs/resubscribe", tokenPayload);
      setGlobalUnsubscribed(!!out.global_unsubscribed);
      setStatusText("You are resubscribed. Non-essential emails are enabled again.");
    } catch (e) {
      setErrorText(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      eyebrow="Email preferences"
      title={
        <>
          Your<br /><em>inbox, your call.</em>
        </>
      }
    >
      {!hasTokenInputs ? (
        <Banner tone="danger">
          <span>
            This preferences link is missing required parameters. Please use the full link from your email.
          </span>
        </Banner>
      ) : null}

      {hasTokenInputs ? (
        <div className="km-stack" style={{ gap: 20 }}>
          <Frame label="The Weekly Spark">
            <div className="km-prose" style={{ maxWidth: 560, marginBottom: 16 }}>
              <p>
                A little kindling for a conversation or journal entry — optional every time,
                like a side quest.
              </p>
              {!sparkEnrolled ? (
                <p className="km-muted">
                  Weekly Spark is not active on this account yet. Frequency choices below will
                  apply once it is.
                </p>
              ) : null}
            </div>
            <div className="km-mono-label" style={{ marginBottom: 10 }}>
              How often should we send The Weekly Spark?
            </div>
            <div className="km-radio-list">
              {SPARK_OPTIONS.map((opt) => (
                <label key={opt.value} className="km-radio">
                  <input
                    type="radio"
                    name="weekly-spark-cadence"
                    value={opt.value}
                    checked={sparkCadence === opt.value}
                    onChange={() => saveSparkCadence(opt.value)}
                    disabled={busy}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </Frame>

          <Frame label="All non-essential emails">
            <div className="km-stack" style={{ gap: 16 }}>
              <div>
                <div className="km-mono-label" style={{ marginBottom: 6 }}>Email</div>
                <div className="km-field-value">{params.email}</div>
              </div>
              <div className="km-prose" style={{ margin: 0 }}>
                {globalUnsubscribed === true ? (
                  <>You're <strong>unsubscribed</strong> from non-essential emails.</>
                ) : globalUnsubscribed === false ? (
                  <>You're <strong>subscribed</strong> to non-essential emails.</>
                ) : (
                  <>Checking status...</>
                )}
              </div>
              <div className="km-row">
                {globalUnsubscribed ? (
                  <Button variant="primary" onClick={doResubscribe} disabled={busy}>
                    {busy ? <><Spinner /> Working...</> : "Resubscribe"}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={doUnsubscribeAll} disabled={busy}>
                    {busy ? <><Spinner /> Working...</> : "Unsubscribe from all"}
                  </Button>
                )}
              </div>
            </div>
          </Frame>
        </div>
      ) : null}

      {statusText ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone="info">{statusText}</Banner>
        </div>
      ) : null}
      {errorText ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone="danger">{errorText}</Banner>
        </div>
      ) : null}
    </Section>
  );
}
