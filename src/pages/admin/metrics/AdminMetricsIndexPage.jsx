import { Banknote, ChartLine, Gauge, ScrollText, Users, Wrench } from "lucide-react";
import { Eyebrow } from "../../../theme";
import { useMetrics } from "../../../admin/metrics/MetricsContext";

const DASHBOARDS = [
  {
    id: "admin-metrics-overview",
    eyebrow: "I.",
    title: "Overview",
    blurb:
      "Headline KPIs — active users, sessions, messages, words, LLM cost — at a glance, with period-over-period deltas.",
    Icon: ChartLine,
  },
  {
    id: "admin-metrics-cost",
    eyebrow: "II.",
    title: "LLM Cost",
    blurb:
      "Spend by model, by agent role, by day. Monthly budget tracking and projected month-end burn.",
    Icon: Banknote,
  },
  {
    id: "admin-metrics-engagement",
    eyebrow: "III.",
    title: "Engagement & Funnel",
    blurb:
      "DAU, WAU, MAU. The invite → onboarded → first chat → returning funnel, and retention cohorts.",
    Icon: ScrollText,
  },
  {
    id: "admin-metrics-users",
    eyebrow: "IV.",
    title: "Users",
    blurb:
      "Top users by tokens, cost, sessions, words. Click into per-user time series and breakdowns.",
    Icon: Users,
  },
  {
    id: "admin-metrics-performance",
    eyebrow: "V.",
    title: "Performance",
    blurb:
      "LLM latency p50/p95/p99 by agent and model. Provider-reported vs. estimated token confidence.",
    Icon: Gauge,
  },
];

export default function AdminMetricsIndexPage({ setActivePage }) {
  const { range } = useMetrics();

  return (
    <div className="km-admin-page km-metrics-index">
      <button
        type="button"
        onClick={() => setActivePage("admin")}
        className="km-link-button"
        style={{ marginBottom: 18 }}
      >
        ← Back to Admin Home
      </button>

      <header className="km-metrics-index-head">
        <Eyebrow>Admin · Metrics</Eyebrow>
        <h2 className="km-h1">
          The instruments,<br /><em>arranged in suite.</em>
        </h2>
        <p className="km-prose km-metrics-index-sub">
          Five dashboards for monitoring engagement and cost. All ranges default to{" "}
          <strong>{range.start}</strong> through <strong>{range.end}</strong> (UTC). Each
          sub-page lets you adjust the window and toggle demo mode.
        </p>
      </header>

      <div className="km-metrics-index-grid">
        {DASHBOARDS.map((card) => {
          const Icon = card.Icon;
          return (
            <button
              key={card.id}
              type="button"
              className="km-metrics-index-card"
              onClick={() => setActivePage(card.id)}
            >
              <div className="km-metrics-index-card-icon">
                <Icon size={20} strokeWidth={1.4} />
              </div>
              <div className="km-metrics-index-card-eyebrow">{card.eyebrow}</div>
              <div className="km-metrics-index-card-title">{card.title}</div>
              <div className="km-metrics-index-card-blurb">{card.blurb}</div>
              <div className="km-metrics-index-card-cta">Open →</div>
            </button>
          );
        })}
      </div>

      <div className="km-metrics-index-footer">
        <button
          type="button"
          className="km-link-button"
          onClick={() => setActivePage("admin-metrics-pricing")}
        >
          <Wrench size={14} strokeWidth={1.4} style={{ marginRight: 6, verticalAlign: "-2px" }} />
          Manage model pricing overrides
        </button>
      </div>
    </div>
  );
}
