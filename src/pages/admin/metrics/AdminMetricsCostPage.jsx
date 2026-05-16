import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banner, Button, Spinner } from "../../../theme";
import { ChartFrame } from "../../../admin/metrics/ChartFrame";
import { KpiCard } from "../../../admin/metrics/KpiCard";
import { MetricsShell } from "../../../admin/metrics/MetricsShell";
import { useMetrics } from "../../../admin/metrics/MetricsContext";
import { postAdminApi } from "../../../admin/metrics/apiClient";
import {
  axisStyle,
  chartTokens,
  colorForFamily,
  gridStroke,
  paletteAt,
  tooltipLabelStyle,
  tooltipStyle,
} from "../../../admin/metrics/chartTokens";
import { fmtDay, fmtTokens, fmtUsd, safeDivide } from "../../../admin/metrics/format";
import { maybeObfuscateNumber, obfuscateSeries } from "../../../admin/metrics/demoMode";

function familyLabel(family) {
  if (!family) return "Unknown";
  const map = {
    "claude-opus-4-7": "Opus 4.7",
    "claude-opus-4-6": "Opus 4.6",
    "claude-opus-4-5": "Opus 4.5",
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-sonnet-4-5": "Sonnet 4.5",
    "claude-sonnet-4": "Sonnet 4",
    "claude-haiku-4-5": "Haiku 4.5",
    "claude-haiku-3-5": "Haiku 3.5",
    unknown: "Unknown",
  };
  return map[family] || family;
}

export default function AdminMetricsCostPage({ isAuthed, getAccessToken, apiBase, setActivePage }) {
  const { range, prior, demoMode, budgetUsdMonthly, setBudget } = useMetrics();
  const [data, setData] = useState(null);
  const [priorData, setPriorData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Local "draft" for the budget input so users can type freely without
  // every keystroke writing to localStorage.
  const [budgetDraft, setBudgetDraft] = useState(() => String(budgetUsdMonthly || ""));
  useEffect(() => {
    setBudgetDraft(String(budgetUsdMonthly || ""));
  }, [budgetUsdMonthly]);

  // Re-fetch when range changes (or on first auth).
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
            path: "/admin/metrics/cost",
            getAccessToken,
            body: { start_day_utc: range.start, end_day_utc: range.end },
          }),
          postAdminApi({
            apiBase,
            path: "/admin/metrics/cost",
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
  const families = data?.families || [];
  const familyKeys = families.length ? families : ["unknown"];

  const stackedSeries = useMemo(() => {
    const rows = (data?.day_series || []).map((row) => {
      const out = { day_utc: row.day_utc, total_cost: row.total_cost };
      for (const fam of familyKeys) {
        const key = `cost_${fam}`;
        out[key] = row[key] || 0;
      }
      return out;
    });
    return obfuscateSeries(rows, { demoMode });
  }, [data, familyKeys, demoMode]);

  const totals = data?.totals || {};
  const priorTotals = priorData?.totals || {};

  const totalCost = totals.total_cost || 0;
  const priorTotalCost = priorTotals.total_cost || 0;
  const totalTokens = totals.total_tokens || 0;
  const totalCalls = totals.calls || 0;

  // Compose KPI card series from the stacked series (just the per-day total).
  const dailyTotalSeries = stackedSeries.map((r) => ({ day_utc: r.day_utc, y: r.total_cost }));

  // Budget math.
  const monthlyBudget = Number(budgetUsdMonthly) || 0;
  const daysInMonth = 30;
  const rangeDays = data?.range_days || 0;
  const avgPerDay = rangeDays ? totalCost / rangeDays : 0;
  const projectedMonth = avgPerDay * daysInMonth;
  const budgetPctConsumed = monthlyBudget > 0 ? (projectedMonth / monthlyBudget) * 100 : 0;
  const overBudget = monthlyBudget > 0 && projectedMonth > monthlyBudget;

  // Provider vs estimated split.
  const providerVsEstimated = useMemo(() => {
    const provider = totals.provider_cost || 0;
    const estimated = totals.estimated_cost || 0;
    return [
      { name: "Provider-reported", value: maybeObfuscateNumber(provider, { demoMode, isCount: false }) || 0, kind: "provider" },
      { name: "Estimated", value: maybeObfuscateNumber(estimated, { demoMode, isCount: false }) || 0, kind: "estimated" },
    ];
  }, [totals.provider_cost, totals.estimated_cost, demoMode]);

  // Bar chart datasets.
  const agentBars = useMemo(() => {
    const rows = (data?.agent_breakdown || []).slice(0, 12).map((r) => ({
      name: r.agent_role,
      cost: r.total_cost,
      calls: r.calls,
    }));
    return obfuscateSeries(rows, { demoMode, xKey: "name" });
  }, [data, demoMode]);

  const modelBars = useMemo(() => {
    const rows = (data?.model_breakdown || []).slice(0, 12).map((r) => ({
      name: r.display_name || r.model_id,
      family: r.family,
      cost: r.total_cost,
      calls: r.calls,
    }));
    return obfuscateSeries(rows, { demoMode, xKey: "name" });
  }, [data, demoMode]);

  return (
    <MetricsShell
      eyebrow="Admin · Metrics · II"
      title={<>LLM Cost</>}
      subtitle="Token usage transposed into dollars, using the registered model pricing. Cost figures here reflect LLM inference only."
      onBack={() => setActivePage("admin-metrics")}
    >
      {error ? (
        <Banner tone="danger">
          <span><strong>Error.</strong> {error}</span>
        </Banner>
      ) : null}

      {data?.unknown_models?.length ? (
        <Banner tone="info">
          <div>
            <strong>{data.unknown_models.length} model{data.unknown_models.length === 1 ? "" : "s"} have no registered pricing.</strong>{" "}
            <button
              type="button"
              className="km-link-button"
              onClick={() => setActivePage("admin-metrics-pricing")}
            >
              Register pricing →
            </button>
            <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)" }}>
              {data.unknown_models.slice(0, 4).map((m) => m.model_id).join(", ")}
              {data.unknown_models.length > 4 ? ` and ${data.unknown_models.length - 4} more` : ""}
            </div>
          </div>
        </Banner>
      ) : null}

      {/* KPI row */}
      <div className="km-kpi-grid">
        <KpiCard
          eyebrow="Total cost"
          value={totalCost}
          prior={priorTotalCost}
          format={(v) => fmtUsd(v, { compact: true })}
          caption={`${rangeDays} day${rangeDays === 1 ? "" : "s"}`}
          series={dailyTotalSeries}
          sparkColor={tokens.crimson}
          tone="crimson"
          invertDelta
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Avg / active day"
          value={data?.avg_cost_per_active_day || 0}
          format={(v) => fmtUsd(v)}
          caption={`${data?.active_days || 0} active day${(data?.active_days || 0) === 1 ? "" : "s"}`}
          series={dailyTotalSeries}
          sparkColor={tokens.sage}
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Projected month"
          value={projectedMonth}
          format={(v) => fmtUsd(v, { compact: true })}
          caption="Linear extrapolation of avg/day × 30"
          series={dailyTotalSeries}
          sparkColor={tokens.butter}
          isLoading={busy && !data}
        />
        <KpiCard
          eyebrow="Calls"
          value={totalCalls}
          format={(v) => fmtTokens(v)}
          caption={`${fmtTokens(totalTokens)} tokens`}
          series={(data?.day_series || []).map((r) => ({ day_utc: r.day_utc, y: r.total_cost > 0 ? 1 : 0 }))}
          sparkColor={tokens.inkSoft}
          isLoading={busy && !data}
        />
      </div>

      {/* Budget panel */}
      <ChartFrame
        eyebrow="Burn rate vs target"
        title="Monthly budget"
        description={
          monthlyBudget > 0
            ? `Projected ${fmtUsd(projectedMonth, { compact: true })} vs budget ${fmtUsd(monthlyBudget, { compact: true })}.`
            : "Set a monthly target to see projected burn-rate health."
        }
        exportName="cost-budget"
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Budget (USD / month)
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value)}
              onBlur={() => setBudget(Number(budgetDraft) || 0)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setBudget(Number(budgetDraft) || 0);
                }
              }}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                padding: "6px 10px",
                background: "var(--cream)",
                border: "1px solid var(--thread)",
                color: "var(--ink)",
                width: 140,
              }}
            />
            <Button
              variant="ghost"
              onClick={() => setBudget(Number(budgetDraft) || 0)}
            >
              Save
            </Button>
            {monthlyBudget > 0 ? (
              <span className={`km-pill ${overBudget ? "tone-down" : "tone-up"}`}>
                {overBudget
                  ? `Over by ${fmtUsd(projectedMonth - monthlyBudget)}`
                  : `${(budgetPctConsumed || 0).toFixed(0)}% of target`}
              </span>
            ) : null}
          </div>

          {monthlyBudget > 0 ? (
            <div className="km-budget-bar">
              <div
                className={`km-budget-bar-fill ${overBudget ? "over-budget" : ""}`}
                style={{ width: `${Math.min(100, budgetPctConsumed)}%` }}
              />
              <div className="km-budget-bar-marker" style={{ left: `${Math.min(100, budgetPctConsumed)}%` }} />
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)" }}>
            <div>Range total <strong style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16 }}>{fmtUsd(totalCost)}</strong></div>
            <div>Avg / day <strong style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16 }}>{fmtUsd(avgPerDay)}</strong></div>
            <div>Per call <strong style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16 }}>{fmtUsd(safeDivide(totalCost, totalCalls))}</strong></div>
          </div>
        </div>
      </ChartFrame>

      {/* Stacked cost by family */}
      <ChartFrame
        eyebrow="Daily spend by model family"
        title="Cost over time"
        description="Each band is one Claude model family; total stacked height is daily LLM spend."
        exportName="cost-stacked-area"
      >
        {busy && !data ? (
          <div style={{ height: 280, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stackedSeries} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" />
                <XAxis
                  dataKey="day_utc"
                  tickFormatter={fmtDay}
                  tick={axisStyle()}
                  stroke={tokens.thread}
                />
                <YAxis
                  tick={axisStyle()}
                  stroke={tokens.thread}
                  tickFormatter={(v) => fmtUsd(v, { compact: true })}
                  width={70}
                />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  labelStyle={tooltipLabelStyle()}
                  formatter={(v) => fmtUsd(v)}
                  labelFormatter={(label) => fmtDay(label)}
                />
                <Legend
                  wrapperStyle={{ ...axisStyle(), paddingTop: 8 }}
                  iconType="square"
                  formatter={(v) => familyLabel(String(v).replace(/^cost_/, ""))}
                />
                {familyKeys.map((fam) => (
                  <Area
                    key={fam}
                    type="monotone"
                    stackId="cost"
                    dataKey={`cost_${fam}`}
                    name={`cost_${fam}`}
                    fill={colorForFamily(fam)}
                    fillOpacity={0.85}
                    stroke={colorForFamily(fam)}
                    strokeWidth={1}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartFrame>

      {/* Side-by-side: agent role bars + model bars */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
        <ChartFrame
          eyebrow="Cost by agent role"
          title="Where the money goes"
          description="Top 12 agent roles by LLM spend in this range."
          exportName="cost-by-agent"
        >
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentBars} layout="vertical" margin={{ top: 8, right: 18, bottom: 8, left: 12 }}>
                <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={axisStyle()}
                  stroke={tokens.thread}
                  tickFormatter={(v) => fmtUsd(v, { compact: true })}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={axisStyle()}
                  stroke={tokens.thread}
                  width={160}
                />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  labelStyle={tooltipLabelStyle()}
                  formatter={(v, n) => (n === "cost" ? fmtUsd(v) : v)}
                />
                <Bar dataKey="cost" fill={tokens.crimson} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartFrame>

        <ChartFrame
          eyebrow="Cost by model"
          title="Per-model spend"
          description="Top 12 model IDs by LLM spend. Colored by family."
          exportName="cost-by-model"
        >
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelBars} layout="vertical" margin={{ top: 8, right: 18, bottom: 8, left: 12 }}>
                <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={axisStyle()}
                  stroke={tokens.thread}
                  tickFormatter={(v) => fmtUsd(v, { compact: true })}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={axisStyle()}
                  stroke={tokens.thread}
                  width={170}
                />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  labelStyle={tooltipLabelStyle()}
                  formatter={(v, n) => (n === "cost" ? fmtUsd(v) : v)}
                />
                <Bar dataKey="cost" isAnimationActive={false}>
                  {modelBars.map((row, idx) => (
                    <Cell key={`mb-${idx}`} fill={colorForFamily(row.family)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartFrame>
      </div>

      {/* Provider vs estimated */}
      <ChartFrame
        eyebrow="Data confidence"
        title="Provider-reported vs estimated"
        description="Estimated calls infer tokens from character counts when the provider doesn't report them; cost confidence is lower for those."
        exportName="cost-provider-vs-estimated"
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={providerVsEstimated}
                  dataKey="value"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={1}
                  stroke={tokens.cream}
                  isAnimationActive={false}
                >
                  {providerVsEstimated.map((entry, idx) => (
                    <Cell key={`pe-${idx}`} fill={entry.kind === "provider" ? tokens.sage : tokens.butter} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle()}
                  labelStyle={tooltipLabelStyle()}
                  formatter={(v) => fmtUsd(v)}
                />
                <Legend
                  wrapperStyle={{ ...axisStyle(), paddingTop: 6 }}
                  iconType="square"
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)", letterSpacing: "0.08em" }}>
            <div style={{ marginBottom: 6, textTransform: "uppercase" }}>Counts</div>
            <div>{totals.provider_calls || 0} provider-reported calls</div>
            <div>{totals.estimated_calls || 0} estimated calls</div>
            <div style={{ marginTop: 14, textTransform: "uppercase" }}>Cost</div>
            <div>{fmtUsd(totals.provider_cost || 0)} provider-reported</div>
            <div>{fmtUsd(totals.estimated_cost || 0)} estimated</div>
          </div>
        </div>
      </ChartFrame>

      {/* Detailed table */}
      <ChartFrame
        eyebrow="Per-model detail"
        title="Cost breakdown by model"
        description="Sorted by total cost. Click a row's family chip to jump to the pricing-overrides admin."
        exportName="cost-table"
      >
        <div style={{ overflow: "auto", maxHeight: 480 }}>
          <table className="km-metrics-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Family</th>
                <th className="num">Calls</th>
                <th className="num">Tokens</th>
                <th className="num">Input $</th>
                <th className="num">Output $</th>
                <th className="num">Total $</th>
                <th>Pricing source</th>
              </tr>
            </thead>
            <tbody>
              {(data?.model_breakdown || []).map((row) => (
                <tr key={row.model_id}>
                  <td style={{ wordBreak: "break-all", maxWidth: 360 }}>{row.display_name || row.model_id}</td>
                  <td>
                    <span
                      className="km-pill"
                      style={{ borderColor: colorForFamily(row.family), color: colorForFamily(row.family) }}
                    >
                      {familyLabel(row.family)}
                    </span>
                  </td>
                  <td className="num">{fmtTokens(maybeObfuscateNumber(row.calls, { demoMode }))}</td>
                  <td className="num">{fmtTokens(maybeObfuscateNumber(row.tokens, { demoMode }))}</td>
                  <td className="num">{fmtUsd(maybeObfuscateNumber(row.input_cost, { demoMode, isCount: false }))}</td>
                  <td className="num">{fmtUsd(maybeObfuscateNumber(row.output_cost, { demoMode, isCount: false }))}</td>
                  <td className="num"><strong>{fmtUsd(maybeObfuscateNumber(row.total_cost, { demoMode, isCount: false }))}</strong></td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-faint)" }}>
                    {row.is_known ? row.source : <span className="km-pill tone-warn">Unknown</span>}
                  </td>
                </tr>
              ))}
              {!data?.model_breakdown?.length ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 20, color: "var(--ink-faint)", fontStyle: "italic" }}>
                    {busy ? "Loading…" : "No model calls in this range."}
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
