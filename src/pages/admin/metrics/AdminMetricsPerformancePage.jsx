import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { obfuscateSeries } from "../../../admin/metrics/demoMode";

function fmtMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

export default function AdminMetricsPerformancePage({ isAuthed, getAccessToken, apiBase, setActivePage }) {
  const { range, demoMode } = useMetrics();
  const [modelFilter, setModelFilter] = useState("");
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
        const payload = await postAdminApi({
          apiBase,
          path: "/admin/metrics/performance",
          getAccessToken,
          body: {
            start_day_utc: range.start,
            end_day_utc: range.end,
            model_id: modelFilter || null,
          },
        });
        if (myToken !== fetchToken.current) return;
        setData(payload);
      } catch (e) {
        if (myToken !== fetchToken.current) return;
        setError(e?.message || String(e));
      } finally {
        if (myToken === fetchToken.current) setBusy(false);
      }
    })();
  }, [apiBase, getAccessToken, isAuthed, range.start, range.end, modelFilter]);

  const tokens = chartTokens();
  const latencyRows = useMemo(() => (data?.latency_rows || []).slice(0, 14), [data]);
  const days = useMemo(
    () => obfuscateSeries(data?.day_series || [], { demoMode }),
    [data, demoMode],
  );
  const models = data?.models_seen || [];
  const totals = data?.totals || {};

  const grouped = useMemo(
    () =>
      latencyRows.map((r) => ({
        name: `${r.agent_role} · ${shortModel(r.model_id)}`,
        p50: r.p50_ms,
        p95: r.p95_ms,
        p99: r.p99_ms,
        calls: r.calls,
      })),
    [latencyRows],
  );

  return (
    <MetricsShell
      eyebrow="Admin · Metrics · V"
      title={<>Performance</>}
      subtitle="Per-call latency by agent and model. Provider-reported tokens are the gold standard; estimated tokens reduce data confidence."
      onBack={() => setActivePage("admin-metrics")}
    >
      {error ? (
        <Banner tone="danger">
          <span><strong>Error.</strong> {error}</span>
        </Banner>
      ) : null}

      {/* KPI cards */}
      <div className="km-kpi-grid">
        <KpiCard
          eyebrow="Calls"
          value={totals.calls || 0}
          format={(v) => fmtInt(v)}
          caption={`${days.length} day window`}
          series={days.map((r) => ({ day_utc: r.day_utc, y: r.calls }))}
          sparkColor={tokens.crimson}
          tone="crimson"
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Provider confidence"
          value={totals.provider_confidence_pct || 0}
          format={(v) => `${(v || 0).toFixed(0)}%`}
          caption={`${fmtInt(totals.provider_calls || 0)} provider-reported`}
          series={days.map((r) => ({
            day_utc: r.day_utc,
            y: r.calls ? (r.provider_calls / r.calls) * 100 : 0,
          }))}
          sparkColor={tokens.sage}
          tone="sage"
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Slowest p95"
          value={Math.max(0, ...latencyRows.map((r) => r.p95_ms || 0))}
          format={fmtMs}
          caption="Worst-case p95 across the shown combos"
          sparkColor={tokens.butter}
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Median p50"
          value={Math.round(
            latencyRows.reduce((acc, r) => acc + (r.p50_ms || 0), 0) /
              Math.max(1, latencyRows.length),
          )}
          format={fmtMs}
          caption="Average of per-combo medians"
          sparkColor={tokens.inkSoft}
          isLoading={busy && !data}
        />
      </div>

      {/* Model filter */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
          }}
        >
          Model filter
        </span>
        <select
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            padding: "6px 10px",
            background: "var(--cream)",
            border: "1px solid var(--thread)",
            color: "var(--ink)",
            minWidth: 280,
          }}
        >
          <option value="">All models</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Latency bars: p50/p95/p99 grouped */}
      <ChartFrame
        eyebrow="Latency percentiles"
        title="p50 · p95 · p99 by agent + model"
        description="Each combo shows median, 95th and 99th percentile of LLM call duration."
        exportName="performance-latency"
      >
        {busy && !data ? (
          <div style={{ height: 320, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        ) : (
          <div style={{ width: "100%", height: 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grouped} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 12 }}>
                <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={axisStyle()} stroke={tokens.thread} tickFormatter={(v) => fmtMs(v)} />
                <YAxis type="category" dataKey="name" tick={axisStyle()} stroke={tokens.thread} width={260} />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  labelStyle={tooltipLabelStyle()}
                  formatter={(v, n) => [fmtMs(v), n.toUpperCase()]}
                />
                <Legend wrapperStyle={{ ...axisStyle(), paddingTop: 8 }} iconType="square" />
                <Bar dataKey="p50" fill={tokens.sage} isAnimationActive={false} />
                <Bar dataKey="p95" fill={tokens.butter} isAnimationActive={false} />
                <Bar dataKey="p99" fill={tokens.crimson} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartFrame>

      {/* Call volume by day */}
      <ChartFrame
        eyebrow="Daily volume"
        title="LLM calls per day"
        description="Stacked: provider-reported (sage) vs estimated (butter)."
        exportName="performance-volume"
      >
        {busy && !data ? (
          <div style={{ height: 220, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" />
                <XAxis dataKey="day_utc" tickFormatter={fmtDay} tick={axisStyle()} stroke={tokens.thread} />
                <YAxis tick={axisStyle()} stroke={tokens.thread} tickFormatter={(v) => fmtInt(v)} width={56} />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  labelStyle={tooltipLabelStyle()}
                  formatter={(v, n) => [fmtInt(v), n === "provider_calls" ? "Provider" : "Estimated"]}
                  labelFormatter={fmtDay}
                />
                <Legend wrapperStyle={{ ...axisStyle(), paddingTop: 4 }} iconType="square" />
                <Area
                  type="monotone"
                  stackId="vol"
                  dataKey="provider_calls"
                  fill={tokens.sage}
                  stroke={tokens.sageDeep}
                  fillOpacity={0.8}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  stackId="vol"
                  dataKey="estimated_calls"
                  fill={tokens.butter}
                  stroke={tokens.butter}
                  fillOpacity={0.7}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartFrame>

      {/* Detailed latency table */}
      <ChartFrame
        eyebrow="Detail"
        title="Per agent + model latencies"
        description="All percentiles across the matched calls. Sortable by clicking column headers (visual only — actual sort is by calls)."
        exportName="performance-table"
      >
        <div style={{ overflow: "auto", maxHeight: 480 }}>
          <table className="km-metrics-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Model</th>
                <th className="num">Calls</th>
                <th className="num">p50</th>
                <th className="num">p95</th>
                <th className="num">p99</th>
                <th className="num">Mean</th>
                <th className="num">Max</th>
              </tr>
            </thead>
            <tbody>
              {(data?.latency_rows || []).map((r) => (
                <tr key={`${r.agent_role}|${r.model_id}`}>
                  <td>{r.agent_role}</td>
                  <td style={{ wordBreak: "break-all", maxWidth: 280, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    {r.model_id}
                  </td>
                  <td className="num">{fmtInt(r.calls)}</td>
                  <td className="num">{fmtMs(r.p50_ms)}</td>
                  <td className="num">{fmtMs(r.p95_ms)}</td>
                  <td className="num">{fmtMs(r.p99_ms)}</td>
                  <td className="num">{fmtMs(r.mean_ms)}</td>
                  <td className="num">{fmtMs(r.max_ms)}</td>
                </tr>
              ))}
              {!data?.latency_rows?.length ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 20, color: "var(--ink-faint)", fontStyle: "italic" }}>
                    {busy ? "Loading…" : "No latency-bearing calls in this range."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ChartFrame>
    </MetricsShell>
  );
}

function shortModel(modelId) {
  const m = String(modelId || "");
  if (m.length <= 24) return m;
  return `…${m.slice(-22)}`;
}
