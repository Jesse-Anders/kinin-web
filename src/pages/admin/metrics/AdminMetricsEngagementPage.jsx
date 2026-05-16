import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import { maybeObfuscateNumber, obfuscateSeries } from "../../../admin/metrics/demoMode";

function colorForRetention(pct) {
  // 0% -> faint cream; 100% -> deep sage.
  if (pct == null) return "var(--cream-warm)";
  const p = Math.max(0, Math.min(100, pct)) / 100;
  // Blend cream-warm -> sage-deep by mixing alpha of a sage-deep overlay.
  return `rgba(78, 105, 64, ${0.08 + p * 0.72})`;
}

export default function AdminMetricsEngagementPage({ isAuthed, getAccessToken, apiBase, setActivePage }) {
  const { range, prior, demoMode } = useMetrics();
  const [data, setData] = useState(null);
  const [priorData, setPriorData] = useState(null);
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
        const [current, previous] = await Promise.all([
          postAdminApi({
            apiBase,
            path: "/admin/metrics/engagement",
            getAccessToken,
            body: { start_day_utc: range.start, end_day_utc: range.end },
          }),
          postAdminApi({
            apiBase,
            path: "/admin/metrics/engagement",
            getAccessToken,
            body: { start_day_utc: prior.start, end_day_utc: prior.end },
          }).catch(() => null),
        ]);
        if (myToken !== fetchToken.current) return;
        setData(current);
        setPriorData(previous);
      } catch (e) {
        if (myToken !== fetchToken.current) return;
        setError(e?.message || String(e));
      } finally {
        if (myToken === fetchToken.current) setBusy(false);
      }
    })();
  }, [apiBase, getAccessToken, isAuthed, range.start, range.end, prior.start, prior.end]);

  const tokens = chartTokens();
  const days = useMemo(
    () => obfuscateSeries(data?.day_series || [], { demoMode }),
    [data, demoMode],
  );
  const totals = data?.totals || {};
  const priorTotals = priorData?.totals || {};
  const funnel = data?.funnel || [];
  const cohorts = data?.cohorts?.cohorts || [];

  // Compute funnel bar widths relative to the largest stage so visual scale
  // is honest.
  const maxFunnelCount = Math.max(1, ...funnel.map((s) => s.count || 0));

  return (
    <MetricsShell
      activePageId="admin-metrics-engagement"
      setActivePage={setActivePage}
      eyebrow="Admin · Metrics · III"
      title={<>Engagement &amp; Funnel</>}
      subtitle="Activity heartbeat and conversion. Funnel counts reflect the current state of the database; series reflect the selected range."
    >
      {error ? (
        <Banner tone="danger">
          <span><strong>Error.</strong> {error}</span>
        </Banner>
      ) : null}

      <div className="km-kpi-grid">
        <KpiCard
          eyebrow="DAU (avg)"
          value={totals.dau_avg || 0}
          prior={priorTotals.dau_avg || 0}
          format={(v) => fmtInt(v)}
          caption="Daily active users in range"
          series={days.map((r) => ({ day_utc: r.day_utc, y: r.dau }))}
          sparkColor={tokens.sage}
          tone="sage"
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="WAU (avg)"
          value={totals.wau_avg || 0}
          prior={priorTotals.wau_avg || 0}
          format={(v) => fmtInt(v)}
          caption="7-day rolling distinct users"
          series={days.map((r) => ({ day_utc: r.day_utc, y: r.wau }))}
          sparkColor={tokens.butter}
          tone="butter"
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="MAU (avg)"
          value={totals.mau_avg || 0}
          prior={priorTotals.mau_avg || 0}
          format={(v) => fmtInt(v)}
          caption="30-day rolling distinct users"
          series={days.map((r) => ({ day_utc: r.day_utc, y: r.mau }))}
          sparkColor={tokens.crimson}
          tone="crimson"
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="New sign-ups"
          value={totals.new_signups_total || 0}
          prior={priorTotals.new_signups_total || 0}
          format={(v) => fmtInt(v)}
          caption="Lifecycle CRM rows created"
          series={days.map((r) => ({ day_utc: r.day_utc, y: r.new_signups }))}
          sparkColor={tokens.inkSoft}
          isLoading={busy && !data}
        />
      </div>

      {/* DAU / WAU / MAU lines */}
      <ChartFrame
        eyebrow="Activity heartbeat"
        title="DAU · WAU · MAU"
        description="Distinct active users by rolling window."
        exportName="engagement-dau-wau-mau"
      >
        {busy && !data ? (
          <div style={{ height: 280, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={days} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" />
                <XAxis dataKey="day_utc" tickFormatter={fmtDay} tick={axisStyle()} stroke={tokens.thread} />
                <YAxis tick={axisStyle()} stroke={tokens.thread} tickFormatter={(v) => fmtInt(v)} width={48} />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  labelStyle={tooltipLabelStyle()}
                  formatter={(v, n) => [fmtInt(v), n.toUpperCase()]}
                  labelFormatter={fmtDay}
                />
                <Legend wrapperStyle={{ ...axisStyle(), paddingTop: 8 }} iconType="square" />
                <Line type="monotone" dataKey="dau" stroke={tokens.sage} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="wau" stroke={tokens.butter} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="mau" stroke={tokens.crimson} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartFrame>

      {/* Funnel */}
      <ChartFrame
        eyebrow="Acquisition funnel"
        title="Invited → Engaged"
        description="Counts are point-in-time snapshots of the underlying tables. Bars are scaled to the largest stage."
        exportName="engagement-funnel"
      >
        <div>
          {funnel.map((stage) => {
            const display = maybeObfuscateNumber(stage.count || 0, { demoMode });
            const width = `${Math.max(2, ((stage.count || 0) / maxFunnelCount) * 100)}%`;
            return (
              <div className="km-funnel-row" key={stage.key}>
                <div className="km-funnel-label">{stage.label}</div>
                <div className="km-funnel-bar">
                  <div className="km-funnel-bar-fill" style={{ width }} />
                </div>
                <div className="km-funnel-count">{fmtInt(display)}</div>
                <div className="km-funnel-pct">
                  {stage.conversion_pct != null ? `${stage.conversion_pct.toFixed(0)}%` : "—"}
                </div>
              </div>
            );
          })}
          {!funnel.length ? (
            <div style={{ padding: 16, color: "var(--ink-faint)", fontStyle: "italic" }}>
              Funnel data unavailable.
            </div>
          ) : null}
        </div>
      </ChartFrame>

      {/* Retention cohorts */}
      <ChartFrame
        eyebrow="Weekly cohorts"
        title="Retention by signup week"
        description="Each row is a cohort of users who signed up that ISO week. Each cell is the % of that cohort active during week N (active = last_active_at falls in that week)."
        exportName="engagement-retention"
      >
        {!cohorts.length ? (
          <div style={{ padding: 16, color: "var(--ink-faint)", fontStyle: "italic" }}>
            Cohort data unavailable.
          </div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table className="km-metrics-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Cohort (week of)</th>
                  <th className="num">Size</th>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <th key={i} className="num" style={{ width: 60 }}>w{i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohort_week}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{c.cohort_week}</td>
                    <td className="num">{fmtInt(maybeObfuscateNumber(c.cohort_size, { demoMode }))}</td>
                    {Array.from({ length: 8 }).map((_, i) => {
                      const cell = (c.retention || {})[`w${i}`];
                      if (!cell) {
                        return <td key={i} className="km-heatmap-empty" style={{ textAlign: "center" }}>—</td>;
                      }
                      return (
                        <td
                          key={i}
                          className="num"
                          style={{
                            background: colorForRetention(cell.pct),
                            color: cell.pct > 50 ? "var(--cream)" : "var(--ink)",
                            textAlign: "center",
                          }}
                          title={`${cell.count} / ${c.cohort_size}`}
                        >
                          {cell.pct.toFixed(0)}%
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartFrame>

      <ChartFrame
        eyebrow="Continuity"
        title="Reminder effectiveness"
        description="Coming soon — this card will tally reminders sent and responses received per period."
        exportName="engagement-continuity"
        noExport
      >
        <div style={{ padding: 12, color: "var(--ink-faint)", fontStyle: "italic" }}>
          Awaits a backend rollup of <code style={{ fontFamily: "var(--font-mono)" }}>continuity_reminder_state</code>.
        </div>
      </ChartFrame>
    </MetricsShell>
  );
}
