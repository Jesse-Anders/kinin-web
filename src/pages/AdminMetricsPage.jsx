import { useMemo, useState } from "react";

function todayUtcDay() {
  return new Date().toISOString().slice(0, 10);
}

function minusUtcDays(dayStr, days) {
  const date = new Date(`${dayStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(v) {
  return safeNum(v).toLocaleString();
}

export default function AdminMetricsPage({ isAuthed, getAccessToken, apiBase, setActivePage }) {
  const defaultEnd = todayUtcDay();
  const defaultStart = minusUtcDays(defaultEnd, 29);
  const [targetUserId, setTargetUserId] = useState(
    () => localStorage.getItem("admin_user_id") || ""
  );
  const [startDayUtc, setStartDayUtc] = useState(defaultStart);
  const [endDayUtc, setEndDayUtc] = useState(defaultEnd);
  const [busy, setBusy] = useState(false);
  const [globalBusy, setGlobalBusy] = useState(false);
  const [error, setError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [globalMetrics, setGlobalMetrics] = useState(null);

  const maxDailyTokens = useMemo(() => {
    const rows = metrics?.day_series || [];
    return rows.reduce((max, row) => Math.max(max, safeNum(row.total_tokens)), 0);
  }, [metrics]);

  async function loadMetrics() {
    setError("");
    setBusy(true);
    setMetrics(null);
    try {
      const target = (targetUserId || "").trim();
      if (!target) throw new Error("target_user_id required");
      const accessToken = await getAccessToken();
      const res = await fetch(`${apiBase}/admin/metrics/user_tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          target_user_id: target,
          start_day_utc: (startDayUtc || "").trim(),
          end_day_utc: (endDayUtc || "").trim(),
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        let detail = t;
        try {
          const j = JSON.parse(t);
          if (j && typeof j === "object") {
            detail = typeof j.body === "string" ? j.body : JSON.stringify(j);
          }
        } catch {
          // keep raw detail
        }
        throw new Error(`API error ${res.status}: ${detail}`);
      }
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      setMetrics(parsed);
      localStorage.setItem("admin_user_id", target);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadGlobalMetrics() {
    setGlobalError("");
    setGlobalBusy(true);
    setGlobalMetrics(null);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`${apiBase}/admin/metrics/global_tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          start_day_utc: (startDayUtc || "").trim(),
          end_day_utc: (endDayUtc || "").trim(),
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        let detail = t;
        try {
          const j = JSON.parse(t);
          if (j && typeof j === "object") {
            detail = typeof j.body === "string" ? j.body : JSON.stringify(j);
          }
        } catch {
          // keep raw detail
        }
        throw new Error(`API error ${res.status}: ${detail}`);
      }
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      setGlobalMetrics(parsed);
    } catch (e) {
      setGlobalError(e?.message || String(e));
    } finally {
      setGlobalBusy(false);
    }
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => setActivePage("admin")}
          style={{
            background: "transparent",
            border: "none",
            color: "#2563eb",
            cursor: "pointer",
            fontSize: 13,
            padding: 0,
            textDecoration: "underline",
          }}
        >
          &larr; Back to Admin Home
        </button>
      </div>

      <div style={{ marginBottom: 10, fontWeight: 600 }}>Admin Metrics - Token Calculator</div>
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 12 }}>
        Token metrics are tracked in UTC with provider-reported values when available and character-based estimates as a fallback.
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <input
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          placeholder="target_user_id (sub)"
          style={{ padding: 10 }}
          disabled={!isAuthed || busy}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ display: "grid", gap: 4, flex: 1 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Start day (UTC)</span>
            <input
              type="date"
              value={startDayUtc}
              onChange={(e) => setStartDayUtc(e.target.value)}
              disabled={!isAuthed || busy}
              style={{ padding: 10 }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, flex: 1 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>End day (UTC)</span>
            <input
              type="date"
              value={endDayUtc}
              onChange={(e) => setEndDayUtc(e.target.value)}
              disabled={!isAuthed || busy}
              style={{ padding: 10 }}
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={loadGlobalMetrics} disabled={!isAuthed || globalBusy}>
            {globalBusy ? "Loading..." : "Load Global Metrics"}
          </button>
          <button onClick={loadMetrics} disabled={!isAuthed || busy}>
            {busy ? "Loading..." : "Load Token Metrics"}
          </button>
        </div>
        {globalError ? <div style={{ color: "#b00020" }}>{globalError}</div> : null}
        {error ? <div style={{ color: "#b00020" }}>{error}</div> : null}
      </div>

      {globalMetrics ? (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 12, background: "#f8fbff" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Global metrics (all users)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 8 }}>
            <div>UTC range: <b>{globalMetrics.start_day_utc} to {globalMetrics.end_day_utc}</b></div>
            <div>Days: <b>{fmtInt(globalMetrics.range_days)}</b></div>
            <div>Active days: <b>{fmtInt(globalMetrics.active_days)}</b></div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 8 }}>
            <div>Total input tokens: <b>{fmtInt(globalMetrics?.totals?.input_tokens)}</b></div>
            <div>Total output tokens: <b>{fmtInt(globalMetrics?.totals?.output_tokens)}</b></div>
            <div>Total tokens: <b>{fmtInt(globalMetrics?.totals?.total_tokens)}</b></div>
            <div>LLM calls: <b>{fmtInt(globalMetrics?.totals?.llm_call_count)}</b></div>
            <div>Avg tokens/day: <b>{fmtInt(globalMetrics?.avg_tokens_per_day)}</b></div>
            <div>Avg tokens/active day: <b>{fmtInt(globalMetrics?.avg_tokens_per_active_day)}</b></div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
            Provider token calls: {fmtInt(globalMetrics?.totals?.provider_token_calls)} | Estimated token calls: {fmtInt(globalMetrics?.totals?.estimated_token_calls)}
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#fafafa" }}>
                  <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Day</th>
                  <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Input</th>
                  <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Output</th>
                  <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Total</th>
                  <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Calls</th>
                  <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Running avg/day</th>
                </tr>
              </thead>
              <tbody>
                {(globalMetrics?.day_series || []).map((row) => (
                  <tr key={`g-${row.day_utc}`}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{row.day_utc}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.input_tokens)}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.output_tokens)}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.total_tokens)}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.llm_call_count)}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.running_avg_tokens_per_day)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {metrics ? (
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>User-specific metrics</div>
          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginBottom: 12, background: "#fafafa" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 8 }}>
              <div>User: <b>{metrics.user_id || "-"}</b></div>
              <div>UTC range: <b>{metrics.start_day_utc} to {metrics.end_day_utc}</b></div>
              <div>Days: <b>{fmtInt(metrics.range_days)}</b></div>
              <div>Active days: <b>{fmtInt(metrics.active_days)}</b></div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <div>Total input tokens: <b>{fmtInt(metrics?.totals?.input_tokens)}</b></div>
              <div>Total output tokens: <b>{fmtInt(metrics?.totals?.output_tokens)}</b></div>
              <div>Total tokens: <b>{fmtInt(metrics?.totals?.total_tokens)}</b></div>
              <div>LLM calls: <b>{fmtInt(metrics?.totals?.llm_call_count)}</b></div>
              <div>Avg tokens/day: <b>{fmtInt(metrics?.avg_tokens_per_day)}</b></div>
              <div>Avg tokens/active day: <b>{fmtInt(metrics?.avg_tokens_per_active_day)}</b></div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              Provider token calls: {fmtInt(metrics?.totals?.provider_token_calls)} | Estimated token calls: {fmtInt(metrics?.totals?.estimated_token_calls)}
            </div>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Per-agent token breakdown</div>
            {(metrics?.agent_breakdown || []).length ? (
              <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", background: "#fafafa" }}>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Agent role</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Input</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Output</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Total</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Calls</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Provider calls</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Estimated calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics?.agent_breakdown || []).map((row) => (
                      <tr key={row.agent_role}>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{row.agent_role}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.input_tokens)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.output_tokens)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.total_tokens)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.llm_call_count)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.provider_token_calls)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.estimated_token_calls)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ opacity: 0.7 }}>No per-agent call records in this range yet.</div>
            )}
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Per-model token breakdown</div>
            {(metrics?.model_breakdown || []).length ? (
              <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", background: "#fafafa" }}>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Model</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Input</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Output</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Total</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Calls</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Provider calls</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Estimated calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics?.model_breakdown || []).map((row) => (
                      <tr key={row.model_id}>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{row.model_id}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.input_tokens)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.output_tokens)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.total_tokens)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.llm_call_count)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.provider_token_calls)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.estimated_token_calls)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ opacity: 0.7 }}>No per-model call records in this range yet.</div>
            )}
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Daily token series (UTC)</div>
            <div style={{ maxHeight: 360, overflow: "auto", border: "1px solid #eee", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", background: "#fafafa" }}>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Day</th>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Input</th>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Output</th>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Total</th>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Calls</th>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Running avg/day</th>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee", width: 180 }}>Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {(metrics?.day_series || []).map((row) => {
                    const total = safeNum(row.total_tokens);
                    const widthPct = maxDailyTokens > 0 ? Math.max(2, Math.round((total / maxDailyTokens) * 100)) : 0;
                    return (
                      <tr key={row.day_utc}>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{row.day_utc}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.input_tokens)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.output_tokens)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(total)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.llm_call_count)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{fmtInt(row.running_avg_tokens_per_day)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>
                          <div style={{ height: 8, background: "#eee", borderRadius: 999, overflow: "hidden" }}>
                            <div
                              style={{
                                height: "100%",
                                width: `${widthPct}%`,
                                background: "#3b82f6",
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
