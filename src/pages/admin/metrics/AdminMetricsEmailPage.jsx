import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banner, Spinner } from "../../../theme";
import { ChartFrame } from "../../../admin/metrics/ChartFrame";
import { KpiCard } from "../../../admin/metrics/KpiCard";
import { MetricsShell } from "../../../admin/metrics/MetricsShell";
import { useMetrics } from "../../../admin/metrics/MetricsContext";
import { postAdminApi } from "../../../admin/metrics/apiClient";
import {
  axisStyle,
  chartTokens,
  gridStroke,
  tooltipLabelStyle,
  tooltipStyle,
} from "../../../admin/metrics/chartTokens";
import { fmtDay, fmtInt } from "../../../admin/metrics/format";

const fmtPct = (v) => `${(Number(v) || 0).toFixed(1)}%`;

// One horizontal step in the Spark conversion funnel.
function FunnelStage({ label, count, rate, rateLabel, tone }) {
  return (
    <div className={`km-kpi-card ${tone ? `tone-${tone}` : ""}`} style={{ flex: "1 1 130px", minWidth: 130 }}>
      <div className="km-kpi-eyebrow">{label}</div>
      <div className="km-kpi-value">{fmtInt(count)}</div>
      {rate != null ? (
        <div className="km-kpi-caption">
          {fmtPct(rate)} {rateLabel}
        </div>
      ) : (
        <div className="km-kpi-caption">&nbsp;</div>
      )}
    </div>
  );
}

export default function AdminMetricsEmailPage({ isAuthed, getAccessToken, apiBase, setActivePage }) {
  const { range } = useMetrics();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fetchToken = useRef(0);

  useEffect(() => {
    if (!isAuthed) return;
    const myToken = ++fetchToken.current;
    setBusy(true);
    setError("");
    (async () => {
      try {
        const res = await postAdminApi({
          apiBase,
          path: "/admin/metrics/email",
          getAccessToken,
          body: { start_day_utc: range.start, end_day_utc: range.end },
        });
        if (myToken !== fetchToken.current) return;
        setData(res);
      } catch (e) {
        if (myToken !== fetchToken.current) return;
        setError(e?.message || String(e));
      } finally {
        if (myToken === fetchToken.current) setBusy(false);
      }
    })();
  }, [apiBase, getAccessToken, isAuthed, range.start, range.end]);

  const tokens = chartTokens();
  const spark = data?.spark_funnel || {};
  const reminder = data?.reminder_funnel || {};
  const leaderboard = data?.prompt_leaderboard || [];
  const health = data?.health || {};

  // Flatten the nested day_series into a chart-friendly shape.
  const chartDays = useMemo(
    () =>
      (data?.day_series || []).map((r) => ({
        day_utc: r.date,
        spark_sends: r.spark?.sends || 0,
        spark_clicks: r.spark?.clicks || 0,
        spark_user_turn: r.spark?.user_turn || 0,
        reminder_sends: r.reminder?.sends || 0,
        reminder_clicks: r.reminder?.clicks || 0,
      })),
    [data],
  );

  return (
    <MetricsShell
      activePageId="admin-metrics-email"
      setActivePage={setActivePage}
      eyebrow="Admin · Metrics · VI"
      title={<>Email Engagement</>}
      subtitle="Weekly Spark and Reminder deliverability, clicks, and the first-party Spark conversion funnel. Opens are shown for context only (MPP-inflated)."
    >
      {error ? (
        <Banner tone="danger">
          <span><strong>Error.</strong> {error}</span>
        </Banner>
      ) : null}

      <div className="km-kpi-grid">
        <KpiCard
          eyebrow="Spark sends"
          value={spark.sent || 0}
          format={(v) => fmtInt(v)}
          caption={`${fmtInt(spark.delivered || 0)} delivered · ${fmtPct(spark.delivery_rate || 0)}`}
          tone="sage"
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Spark click rate"
          value={spark.click_rate || 0}
          format={fmtPct}
          caption={`${fmtInt(spark.clicked || 0)} clicks of delivered`}
          tone="butter"
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Spark conversion"
          value={spark.conversion_rate || 0}
          format={fmtPct}
          caption={`${fmtInt(spark.user_turn || 0)} engaged of ${fmtInt(spark.delivered || 0)} delivered`}
          tone="crimson"
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Reminder click rate"
          value={reminder.click_rate || 0}
          format={fmtPct}
          caption={`${fmtInt(reminder.clicked || 0)} clicks · ${fmtInt(reminder.sent || 0)} sent`}
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Opens (MPP-inflated)"
          value={spark.opened || 0}
          format={(v) => fmtInt(v)}
          caption="Deliverability pulse only — not a headline metric"
          isLoading={busy && !data}
        />
      </div>

      {/* Spark conversion funnel */}
      <ChartFrame
        eyebrow="First-party, no pixel"
        title="Weekly Spark conversion funnel"
        description="Delivered → clicked (SES) → chat started → user engaged (first-party, joined by send receipt). Each rate is relative to the previous stage."
        exportName="email-spark-funnel"
      >
        {busy && !data ? (
          <div style={{ height: 140, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <FunnelStage label="Delivered" count={spark.delivered || 0} rate={spark.delivery_rate} rateLabel="of sent" tone="sage" />
            <FunnelStage label="Clicked" count={spark.clicked || 0} rate={spark.click_rate} rateLabel="of delivered" tone="butter" />
            <FunnelStage label="Chat started" count={spark.chat_started || 0} rate={spark.chat_start_rate} rateLabel="of clicked" />
            <FunnelStage label="User engaged" count={spark.user_turn || 0} rate={spark.user_turn_rate} rateLabel="of chat started" tone="crimson" />
          </div>
        )}
      </ChartFrame>

      {/* Daily series */}
      <ChartFrame
        eyebrow="Daily"
        title="Spark sends, clicks & engagement over time"
        description="Sends vs clicks vs users who authored a message in a Spark-seeded conversation."
        exportName="email-spark-daily"
      >
        {busy && !data ? (
          <div style={{ height: 300, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartDays} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" />
                <XAxis dataKey="day_utc" tickFormatter={fmtDay} tick={axisStyle()} stroke={tokens.thread} />
                <YAxis tick={axisStyle()} stroke={tokens.thread} tickFormatter={(v) => fmtInt(v)} width={44} />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  labelStyle={tooltipLabelStyle()}
                  labelFormatter={fmtDay}
                  formatter={(v, name) => {
                    const labels = {
                      spark_sends: "Spark sends",
                      spark_clicks: "Spark clicks",
                      spark_user_turn: "User engaged",
                    };
                    return [fmtInt(v), labels[name] || name];
                  }}
                />
                <Legend
                  wrapperStyle={{ ...axisStyle(), paddingTop: 8 }}
                  iconType="square"
                  formatter={(v) =>
                    ({ spark_sends: "Spark sends", spark_clicks: "Spark clicks", spark_user_turn: "User engaged" }[v] || v)
                  }
                />
                <Line type="monotone" dataKey="spark_sends" stroke={tokens.sage} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="spark_clicks" stroke={tokens.butter} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="spark_user_turn" stroke={tokens.crimson} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartFrame>

      {/* Prompt leaderboard */}
      <ChartFrame
        eyebrow="Which prompts land"
        title="Spark prompt leaderboard"
        description="Ranked by users who engaged (then chat started, then clicks). Use it to prune duds and promote winners."
        exportName="email-spark-leaderboard"
      >
        {busy && !data ? (
          <div style={{ height: 160, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        ) : leaderboard.length === 0 ? (
          <p className="km-prose">No Spark sends in this range yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="km-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "6px 10px" }}>Prompt</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Sends</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Clicks</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Chat started</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Engaged</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Conv.</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => {
                  const conv = row.sends ? (100 * row.user_turn) / row.sends : 0;
                  return (
                    <tr key={`${row.title}-${i}`} style={{ borderTop: "1px solid var(--km-thread, #e5e0d8)" }}>
                      <td style={{ padding: "6px 10px" }}>
                        {row.title}
                        {row.spark_index != null ? (
                          <span style={{ opacity: 0.5 }}> · #{row.spark_index}</span>
                        ) : null}
                      </td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtInt(row.sends)}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtInt(row.clicks)}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtInt(row.chat_started)}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtInt(row.user_turn)}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtPct(conv)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartFrame>

      {/* Deliverability health */}
      <ChartFrame
        eyebrow="Deliverability"
        title="Health signals in range (all families)"
        description="Hard bounces and complaints hurt sender reputation. These also page via the ops report in real time."
        exportName="email-health"
      >
        <div className="km-kpi-grid">
          <KpiCard eyebrow="Complaints" value={health.complaint || 0} format={(v) => fmtInt(v)} tone="crimson" caption="Spam reports" isLoading={busy && !data} />
          <KpiCard eyebrow="Hard bounces" value={health.bounce || 0} format={(v) => fmtInt(v)} caption="Permanent + transient" isLoading={busy && !data} />
          <KpiCard eyebrow="Rejects" value={health.reject || 0} format={(v) => fmtInt(v)} caption="Blocked before send" isLoading={busy && !data} />
          <KpiCard eyebrow="Render failures" value={health.rendering_failure || 0} format={(v) => fmtInt(v)} caption="Template errors" isLoading={busy && !data} />
          <KpiCard eyebrow="Delivery delays" value={health.delivery_delay || 0} format={(v) => fmtInt(v)} caption="Retrying" isLoading={busy && !data} />
        </div>
      </ChartFrame>
    </MetricsShell>
  );
}
