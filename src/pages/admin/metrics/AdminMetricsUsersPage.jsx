import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banner, Spinner } from "../../../theme";
import { ChartFrame } from "../../../admin/metrics/ChartFrame";
import { MetricsShell } from "../../../admin/metrics/MetricsShell";
import { Sparkline } from "../../../admin/metrics/Sparkline";
import { useMetrics } from "../../../admin/metrics/MetricsContext";
import { postAdminApi } from "../../../admin/metrics/apiClient";
import { aliasForUserSub } from "../../../admin/metrics/userAlias";
import { maybeObfuscateLabel, maybeObfuscateNumber } from "../../../admin/metrics/demoMode";
import { fmtDay, fmtInt, fmtTokens, fmtUsd } from "../../../admin/metrics/format";
import {
  axisStyle,
  chartTokens,
  colorForFamily,
  gridStroke,
  tooltipLabelStyle,
  tooltipStyle,
} from "../../../admin/metrics/chartTokens";

const SORTS = [
  { id: "tokens", label: "Tokens" },
  { id: "calls", label: "Calls" },
  { id: "words", label: "Words" },
  { id: "cost", label: "Cost" },
];

export default function AdminMetricsUsersPage({ isAuthed, getAccessToken, apiBase, setActivePage }) {
  const { range, demoMode, revealEmails, aliasSalt } = useMetrics();
  const [sortBy, setSortBy] = useState("tokens");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drawerUser, setDrawerUser] = useState(null);
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
          path: "/admin/metrics/top_users",
          getAccessToken,
          body: {
            start_day_utc: range.start,
            end_day_utc: range.end,
            sort_by: sortBy,
            limit: 50,
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
  }, [apiBase, getAccessToken, isAuthed, range.start, range.end, sortBy]);

  const users = data?.users || [];
  const tokens = chartTokens();

  return (
    <MetricsShell
      activePageId="admin-metrics-users"
      setActivePage={setActivePage}
      eyebrow="Admin · Metrics · IV"
      title={<>Users</>}
      subtitle="Top users in the selected range. Click a row for per-day, per-agent, per-model breakdowns."
    >
      {error ? (
        <Banner tone="danger">
          <span><strong>Error.</strong> {error}</span>
        </Banner>
      ) : null}

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
            marginRight: 8,
          }}
        >
          Sort by
        </span>
        {SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`km-range-bar-preset ${sortBy === s.id ? "is-active" : ""}`}
            onClick={() => setSortBy(s.id)}
          >
            {s.label}
          </button>
        ))}
        <span
          style={{
            marginLeft: 12,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-faint)",
            letterSpacing: "0.1em",
          }}
        >
          {data ? `${data.total_users || 0} total users active in range` : ""}
        </span>
      </div>

      <ChartFrame
        eyebrow="Leaderboard"
        title={`Top users by ${sortBy}`}
        description={
          revealEmails
            ? "Showing user IDs (truncated). Emails would require a Cognito lookup per row."
            : "User IDs hashed to 6-char aliases. Toggle 'Reveal emails' in the header to show raw IDs."
        }
        exportName={`users-top-by-${sortBy}`}
      >
        {busy && !data ? (
          <div style={{ height: 240, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        ) : (
          <div style={{ overflow: "auto", maxHeight: 600 }}>
            <table className="km-metrics-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>User</th>
                  <th className="num">Tokens</th>
                  <th className="num">Calls</th>
                  <th className="num">Words</th>
                  <th className="num">Cost</th>
                  <th>Active days</th>
                  <th style={{ width: 120 }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const spark = (u.spark || []).map((v, i) => ({ y: v, day: i }));
                  const label = revealEmails
                    ? maybeObfuscateLabel(u.user_id, { demoMode }) || "—"
                    : aliasForUserSub(u.user_id, aliasSalt);
                  return (
                    <tr
                      key={u.user_id}
                      className="is-clickable"
                      onClick={() => setDrawerUser(u)}
                    >
                      <td className="num">{idx + 1}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all", maxWidth: 280 }}>
                        {label}
                      </td>
                      <td className="num">{fmtTokens(maybeObfuscateNumber(u.tokens, { demoMode }))}</td>
                      <td className="num">{fmtInt(maybeObfuscateNumber(u.calls, { demoMode }))}</td>
                      <td className="num">{fmtInt(maybeObfuscateNumber(u.user_words, { demoMode }))}</td>
                      <td className="num">{fmtUsd(maybeObfuscateNumber(u.cost || 0, { demoMode, isCount: false }))}</td>
                      <td className="num">{u.active_days}</td>
                      <td style={{ minWidth: 100 }}>
                        <Sparkline data={spark} color={tokens.sage} height={28} />
                      </td>
                    </tr>
                  );
                })}
                {!users.length ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: 20, color: "var(--ink-faint)", fontStyle: "italic" }}>
                      No active users in this range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </ChartFrame>

      {drawerUser ? (
        <UserDrawer
          user={drawerUser}
          range={range}
          isAuthed={isAuthed}
          getAccessToken={getAccessToken}
          apiBase={apiBase}
          aliasSalt={aliasSalt}
          revealEmails={revealEmails}
          demoMode={demoMode}
          onClose={() => setDrawerUser(null)}
        />
      ) : null}
    </MetricsShell>
  );
}

function UserDrawer({ user, range, isAuthed, getAccessToken, apiBase, aliasSalt, revealEmails, demoMode, onClose }) {
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthed || !user?.user_id) return;
    let alive = true;
    setBusy(true);
    setError("");
    postAdminApi({
      apiBase,
      path: "/admin/metrics/user_tokens",
      getAccessToken,
      body: {
        target_user_id: user.user_id,
        start_day_utc: range.start,
        end_day_utc: range.end,
      },
    })
      .then((payload) => {
        if (!alive) return;
        setDetail(payload);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message || String(e));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [user, range.start, range.end, apiBase, getAccessToken, isAuthed]);

  const tokens = chartTokens();
  const label = revealEmails
    ? user.user_id
    : aliasForUserSub(user.user_id, aliasSalt);

  const daySeries = useMemo(() => {
    return (detail?.day_series || []).map((r) => ({
      day_utc: r.day_utc,
      tokens: r.total_tokens,
      words: r.user_word_count,
    }));
  }, [detail]);

  return (
    <>
      <div className="km-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="km-drawer" role="dialog" aria-modal="true">
        <button type="button" className="km-drawer-close" onClick={onClose}>
          ← Close
        </button>
        <header>
          <div className="km-chart-frame-eyebrow">User detail</div>
          <h2 className="km-h2" style={{ margin: 0, fontStyle: "italic" }}>{label}</h2>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)", marginTop: 6 }}>
            {range.start} → {range.end} (UTC)
          </div>
        </header>

        {error ? (
          <Banner tone="danger">
            <span><strong>Error.</strong> {error}</span>
          </Banner>
        ) : null}

        {busy && !detail ? (
          <div style={{ height: 200, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        ) : (
          <>
            <div className="km-kpi-grid">
              <div className="km-kpi-card">
                <div className="km-kpi-eyebrow">Tokens</div>
                <div className="km-kpi-value">{fmtTokens(maybeObfuscateNumber(detail?.totals?.total_tokens || 0, { demoMode }))}</div>
                <div className="km-kpi-caption">{fmtInt(detail?.totals?.llm_call_count || 0)} LLM calls</div>
              </div>
              <div className="km-kpi-card">
                <div className="km-kpi-eyebrow">Words</div>
                <div className="km-kpi-value">{fmtInt(maybeObfuscateNumber(detail?.totals?.user_word_count || 0, { demoMode }))}</div>
                <div className="km-kpi-caption">{detail?.active_days || 0} active days</div>
              </div>
              <div className="km-kpi-card">
                <div className="km-kpi-eyebrow">Provider / Estimated</div>
                <div className="km-kpi-value" style={{ fontSize: 18 }}>
                  {fmtInt(detail?.totals?.provider_token_calls || 0)} / {fmtInt(detail?.totals?.estimated_token_calls || 0)}
                </div>
                <div className="km-kpi-caption">calls with provider-reported tokens vs estimated</div>
              </div>
            </div>

            <ChartFrame eyebrow="Per day" title="Tokens" exportName={`user-${label}-tokens`}>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={daySeries} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" />
                    <XAxis dataKey="day_utc" tickFormatter={fmtDay} tick={axisStyle()} stroke={tokens.thread} />
                    <YAxis tick={axisStyle()} stroke={tokens.thread} tickFormatter={(v) => fmtTokens(v)} width={56} />
                    <Tooltip contentStyle={tooltipStyle()} labelStyle={tooltipLabelStyle()} formatter={(v) => fmtInt(v)} labelFormatter={fmtDay} />
                    <Line type="monotone" dataKey="tokens" stroke={tokens.crimson} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartFrame>

            <ChartFrame eyebrow="By agent role" title="Tokens per agent" exportName={`user-${label}-agent`}>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(detail?.agent_breakdown || []).slice(0, 10).map((r) => ({
                      name: r.agent_role,
                      tokens: maybeObfuscateNumber(r.total_tokens, { demoMode }),
                    }))}
                    layout="vertical"
                    margin={{ top: 8, right: 12, bottom: 8, left: 12 }}
                  >
                    <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={axisStyle()} stroke={tokens.thread} tickFormatter={(v) => fmtTokens(v)} />
                    <YAxis type="category" dataKey="name" tick={axisStyle()} stroke={tokens.thread} width={140} />
                    <Tooltip contentStyle={tooltipStyle()} labelStyle={tooltipLabelStyle()} formatter={(v) => fmtInt(v)} />
                    <Bar dataKey="tokens" fill={tokens.sage} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartFrame>

            <ChartFrame eyebrow="By model" title="Tokens per model" exportName={`user-${label}-model`}>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(detail?.model_breakdown || []).slice(0, 10).map((r) => ({
                      name: r.model_id,
                      family: r.family || "unknown",
                      tokens: maybeObfuscateNumber(r.total_tokens, { demoMode }),
                    }))}
                    layout="vertical"
                    margin={{ top: 8, right: 12, bottom: 8, left: 12 }}
                  >
                    <CartesianGrid stroke={gridStroke()} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={axisStyle()} stroke={tokens.thread} tickFormatter={(v) => fmtTokens(v)} />
                    <YAxis type="category" dataKey="name" tick={axisStyle()} stroke={tokens.thread} width={180} />
                    <Tooltip contentStyle={tooltipStyle()} labelStyle={tooltipLabelStyle()} formatter={(v) => fmtInt(v)} />
                    <Bar dataKey="tokens" isAnimationActive={false}>
                      {(detail?.model_breakdown || []).slice(0, 10).map((r, idx) => (
                        <Cell key={`mb-${idx}`} fill={colorForFamily(r.family || "")} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartFrame>
          </>
        )}
      </aside>
    </>
  );
}
