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
import { fmtDay, fmtInt, fmtTokens, fmtUsd, safeDivide } from "../../../admin/metrics/format";
import { obfuscateSeries } from "../../../admin/metrics/demoMode";

export default function AdminMetricsOverviewPage({ isAuthed, getAccessToken, apiBase, setActivePage }) {
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
            path: "/admin/metrics/overview",
            getAccessToken,
            body: { start_day_utc: range.start, end_day_utc: range.end },
          }),
          postAdminApi({
            apiBase,
            path: "/admin/metrics/overview",
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

  // Per-card sparkline data is just the relevant column mapped to `y`.
  const seriesFor = (field) => days.map((r) => ({ day_utc: r.day_utc, y: r[field] || 0 }));

  // Secondary "per active user" series.
  const sessionsPerUserSeries = days.map((r) => ({
    day_utc: r.day_utc,
    per_user: safeDivide(r.llm_calls, r.active_users),
  }));
  const costPerUserSeries = days.map((r) => ({
    day_utc: r.day_utc,
    per_user: safeDivide(r.total_cost, r.active_users),
  }));

  return (
    <MetricsShell
      activePageId="admin-metrics-overview"
      setActivePage={setActivePage}
      eyebrow="Admin · Metrics · I"
      title={<>Overview</>}
      subtitle="The headline view — active users, sign-ups, messages, words, LLM cost — for the selected range."
    >
      {error ? (
        <Banner tone="danger">
          <span><strong>Error.</strong> {error}</span>
        </Banner>
      ) : null}

      <div className="km-kpi-grid">
        <KpiCard
          eyebrow="Active users (DAU avg)"
          value={totals.active_users_avg || 0}
          prior={priorTotals.active_users_avg || 0}
          format={(v) => fmtInt(v)}
          caption={`${totals.active_users_union || 0} unique in range · peak ${totals.active_users_peak || 0}/day`}
          series={seriesFor("active_users")}
          sparkColor={tokens.sage}
          tone="sage"
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="New sign-ups"
          value={totals.new_signups || 0}
          prior={priorTotals.new_signups || 0}
          format={(v) => fmtInt(v)}
          caption="Lifecycle CRM rows created in range"
          series={seriesFor("new_signups")}
          sparkColor={tokens.crimson}
          tone="crimson"
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Messages (LLM calls)"
          value={totals.llm_calls || 0}
          prior={priorTotals.llm_calls || 0}
          format={(v) => fmtTokens(v)}
          caption={`${fmtTokens(totals.total_tokens || 0)} tokens`}
          series={seriesFor("llm_calls")}
          sparkColor={tokens.butter}
          tone="butter"
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Words written"
          value={totals.user_word_count || 0}
          prior={priorTotals.user_word_count || 0}
          format={(v) => fmtInt(v)}
          caption="Cumulative user words in user turns"
          series={seriesFor("user_word_count")}
          sparkColor={tokens.inkSoft}
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="LLM cost"
          value={totals.total_cost || 0}
          prior={priorTotals.total_cost || 0}
          format={(v) => fmtUsd(v, { compact: true })}
          caption={`${fmtUsd(safeDivide(totals.total_cost || 0, totals.active_users_avg || 0))} / active user`}
          series={seriesFor("total_cost")}
          sparkColor={tokens.crimsonDeep}
          tone="crimson"
          invertDelta
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Cost per message"
          value={safeDivide(totals.total_cost || 0, totals.llm_calls || 0)}
          prior={safeDivide(priorTotals.total_cost || 0, priorTotals.llm_calls || 0)}
          format={(v) => fmtUsd(v)}
          caption="Average LLM cost across all calls"
          series={days.map((r) => ({ day_utc: r.day_utc, y: safeDivide(r.total_cost, r.llm_calls) }))}
          sparkColor={tokens.inkSoft}
          invertDelta
          isLoading={busy && !data}
        />
      </div>

      {/* Hero composed chart: users (left axis) vs cost (right axis) */}
      <ChartFrame
        eyebrow="Users and cost, side by side"
        title="Daily active users vs LLM cost"
        description="Engagement on the left axis; spend on the right. When these decouple, look closer."
        exportName="overview-users-vs-cost"
      >
        {busy && !data ? (
          <div style={{ height: 320, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        ) : (
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={days} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" />
                <XAxis
                  dataKey="day_utc"
                  tickFormatter={fmtDay}
                  tick={axisStyle()}
                  stroke={tokens.thread}
                />
                <YAxis
                  yAxisId="users"
                  tick={axisStyle()}
                  stroke={tokens.thread}
                  tickFormatter={(v) => fmtInt(v)}
                  width={48}
                />
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  tick={axisStyle()}
                  stroke={tokens.thread}
                  tickFormatter={(v) => fmtUsd(v, { compact: true })}
                  width={72}
                />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  labelStyle={tooltipLabelStyle()}
                  formatter={(v, name) => {
                    if (name === "total_cost") return [fmtUsd(v), "LLM cost"];
                    if (name === "active_users") return [fmtInt(v), "Active users"];
                    return [v, name];
                  }}
                  labelFormatter={(label) => fmtDay(label)}
                />
                <Legend
                  wrapperStyle={{ ...axisStyle(), paddingTop: 8 }}
                  iconType="square"
                  formatter={(v) => (v === "active_users" ? "Active users" : "LLM cost")}
                />
                <Line
                  type="monotone"
                  yAxisId="users"
                  dataKey="active_users"
                  stroke={tokens.sage}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  yAxisId="cost"
                  dataKey="total_cost"
                  stroke={tokens.crimson}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartFrame>

      {/* Secondary row: per-user trends */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
        <ChartFrame
          eyebrow="Per-user volume"
          title="Messages per active user"
          description="LLM calls divided by DAU. Rising = deeper sessions."
          exportName="overview-msgs-per-user"
        >
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={sessionsPerUserSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" />
                <XAxis dataKey="day_utc" tickFormatter={fmtDay} tick={axisStyle()} stroke={tokens.thread} />
                <YAxis tick={axisStyle()} stroke={tokens.thread} tickFormatter={(v) => (v < 1 ? v.toFixed(1) : fmtInt(v))} />
                <Tooltip contentStyle={tooltipStyle()} labelStyle={tooltipLabelStyle()} formatter={(v) => v.toFixed(2)} labelFormatter={fmtDay} />
                <Line type="monotone" dataKey="per_user" stroke={tokens.butter} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartFrame>
        <ChartFrame
          eyebrow="Per-user cost"
          title="Cost per active user"
          description="LLM cost divided by DAU. Rising can mean longer turns or pricier models."
          exportName="overview-cost-per-user"
        >
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={costPerUserSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" />
                <XAxis dataKey="day_utc" tickFormatter={fmtDay} tick={axisStyle()} stroke={tokens.thread} />
                <YAxis tick={axisStyle()} stroke={tokens.thread} tickFormatter={(v) => fmtUsd(v)} />
                <Tooltip contentStyle={tooltipStyle()} labelStyle={tooltipLabelStyle()} formatter={(v) => fmtUsd(v)} labelFormatter={fmtDay} />
                <Line type="monotone" dataKey="per_user" stroke={tokens.crimson} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartFrame>
      </div>
    </MetricsShell>
  );
}
