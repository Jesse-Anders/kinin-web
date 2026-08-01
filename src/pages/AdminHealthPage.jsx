import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, HeartPulse, RefreshCw } from "lucide-react";
import { Banner, Button, Eyebrow, Frame, Section, Skeleton } from "../theme";
import { postAdminApi } from "../admin/metrics/apiClient";

const TIER_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "INFO"];

function healthTone(health) {
  const h = String(health || "").toUpperCase();
  if (h === "RED") return "danger";
  return "info";
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(iso);
  }
}

function TierTable({ rows }) {
  if (!rows?.length) {
    return <p className="km-muted" style={{ margin: 0 }}>None.</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="km-table" style={{ width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            <th align="left">Signature</th>
            <th align="left">Env</th>
            <th align="left">Provider</th>
            <th align="left">Type</th>
            <th align="right">Events</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.title}-${r.environment}-${i}`}>
              <td>{r.title || "—"}</td>
              <td>{r.environment || "dev/local"}</td>
              <td>{r.provider || "—"}</td>
              <td>{r.error_type || "—"}</td>
              <td align="right">
                <strong>{r.events ?? 0}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminHealthPage({ getAccessToken, apiBase, setActivePage }) {
  const [items, setItems] = useState([]);
  const [stale, setStale] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadList = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await postAdminApi({
        apiBase,
        path: "/admin/ops/reports/list",
        body: { limit: 45 },
        getAccessToken,
      });
      const next = Array.isArray(data?.items) ? data.items : [];
      setItems(next);
      setStale(Boolean(data?.stale));
      setSelectedDate((prev) => prev || next[0]?.report_date || "");
    } catch (e) {
      setError(e?.message || "Could not load health reports.");
    } finally {
      setBusy(false);
    }
  }, [apiBase, getAccessToken]);

  const loadDetail = useCallback(
    async (reportDate) => {
      if (!reportDate) {
        setDetail(null);
        return;
      }
      setBusy(true);
      setError("");
      try {
        const data = await postAdminApi({
          apiBase,
          path: "/admin/ops/reports/get",
          body: { report_date: reportDate },
          getAccessToken,
        });
        setDetail(data);
      } catch (e) {
        setDetail(null);
        setError(e?.message || "Could not load report detail.");
      } finally {
        setBusy(false);
      }
    },
    [apiBase, getAccessToken]
  );

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedDate) loadDetail(selectedDate);
  }, [selectedDate, loadDetail]);

  const report = detail?.report || null;
  const tiers = report?.tiers || {};
  const totals = detail?.totals_by_tier || report?.totals_by_tier || {};

  const ageLabel = useMemo(() => {
    const iso = detail?.generated_at || items[0]?.generated_at;
    if (!iso) return "";
    try {
      const ms = Date.now() - new Date(iso).getTime();
      const h = Math.floor(ms / 3600000);
      if (h < 1) return "less than 1 hour ago";
      if (h < 48) return `${h} hours ago`;
      return `${Math.floor(h / 24)} days ago`;
    } catch {
      return "";
    }
  }, [detail, items]);

  async function runNow() {
    setRunBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await postAdminApi({
        apiBase,
        path: "/admin/ops/reports/run",
        body: { window_hours: 24, send_email: false },
        getAccessToken,
      });
      setNotice(
        `Report generated (${data?.health || "—"}${data?.persisted ? ", saved" : ", not persisted"}).`
      );
      if (data?.report_date) setSelectedDate(data.report_date);
      if (data?.report) {
        setDetail({
          report_date: data.report_date,
          generated_at: data.generated_at,
          health: data.health,
          totals_by_tier: data.totals_by_tier,
          report: data.report,
          subject: data.report?.subject,
        });
      }
      await loadList();
    } catch (e) {
      setError(e?.message || "Could not run report.");
    } finally {
      setRunBusy(false);
    }
  }

  function downloadJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kinin-ops-health-${selectedDate || "report"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="km-admin-page" style={{ maxWidth: 1100, margin: "20px auto 40px", padding: 16 }}>
      <button
        type="button"
        onClick={() => setActivePage("admin")}
        className="km-link-button"
        style={{ marginBottom: 18 }}
      >
        ← Back to Admin Home
      </button>

      <header style={{ marginBottom: 22 }}>
        <Eyebrow>Admin · Health</Eyebrow>
        <h2 className="km-h1" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <HeartPulse size={28} aria-hidden />
          Daily ops health
        </h2>
        <p className="km-prose km-muted" style={{ maxWidth: 640, margin: "8px 0 0" }}>
          Current and past KININ daily health digests. Same payload as the morning email —
          failures, LLM provider rates, session volume, and billing ops counts.
        </p>
      </header>

      {stale ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="danger">
            Latest digest is older than 26 hours{ageLabel ? ` (${ageLabel})` : ""}. The
            ops-report cron or email path may be down — check the SNS heartbeat alarm too.
          </Banner>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="danger">{error}</Banner>
        </div>
      ) : null}
      {notice ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info">{notice}</Banner>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => loadList()}>
          <RefreshCw size={16} style={{ marginRight: 6 }} />
          Refresh list
        </Button>
        <Button type="button" variant="primary" disabled={runBusy} onClick={runNow}>
          {runBusy ? "Running…" : "Run report now"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={!report}
          onClick={downloadJson}
        >
          <Download size={16} style={{ marginRight: 6 }} />
          Download JSON
        </Button>
      </div>

      <div
        className="km-admin-health-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(200px, 260px) 1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        <Frame label="Past reports">
          {busy && !items.length ? (
            <Skeleton height={120} />
          ) : items.length === 0 ? (
            <p className="km-muted" style={{ margin: 0 }}>
              No persisted digests yet. Run a report or wait for the daily cron (~01:15 UTC).
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((item) => {
                const active = item.report_date === selectedDate;
                return (
                  <li key={item.report_date} style={{ marginBottom: 6 }}>
                    <button
                      type="button"
                      className={`km-link-button ${active ? "is-active" : ""}`}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: active ? "1px solid var(--km-border, #ccc)" : "1px solid transparent",
                        background: active ? "rgba(0,0,0,0.04)" : "transparent",
                      }}
                      onClick={() => setSelectedDate(item.report_date)}
                    >
                      <div style={{ fontWeight: 600 }}>{item.report_date}</div>
                      <div className="km-muted" style={{ fontSize: 12 }}>
                        {item.health || "—"} · C={item.critical_count ?? 0} H=
                        {item.high_count ?? 0}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Frame>

        <Section>
          {!selectedDate ? (
            <p className="km-muted">Select a report date.</p>
          ) : busy && !report ? (
            <Skeleton height={240} />
          ) : !report ? (
            <p className="km-muted">No detail for {selectedDate}.</p>
          ) : (
            <>
              <Banner tone={healthTone(detail?.health || report.health)}>
                <strong>{detail?.health || report.health || "—"}</strong>
                {" · "}
                Generated {formatWhen(detail?.generated_at || report.generated_at)}
                {ageLabel ? ` (${ageLabel})` : ""}
                {" · "}
                Window {report.hours || 24}h
              </Banner>

              <p className="km-muted" style={{ marginTop: 12, fontSize: 13 }}>
                Totals:{" "}
                {TIER_ORDER.map((t) => `${t}=${totals[t] ?? 0}`).join(" · ")}
              </p>

              {TIER_ORDER.map((tier) => (
                <Frame key={tier} label={`${tier} (${(tiers[tier] || []).reduce((s, r) => s + (r.events || 0), 0)})`}>
                  <TierTable rows={tiers[tier] || []} />
                </Frame>
              ))}

              <Frame label="Billing (24h)">
                {(report.billing_volume || []).length === 0 ? (
                  <p className="km-muted" style={{ margin: 0 }}>No billing ops events.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="km-table" style={{ width: "100%", fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th align="left">Env</th>
                          <th align="left">Event</th>
                          <th align="left">Product</th>
                          <th align="right">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.billing_volume.map((r, i) => (
                          <tr key={`${r.event_name}-${i}`}>
                            <td>{r.environment || "—"}</td>
                            <td>{r.event_name}</td>
                            <td>{r.product || "—"}</td>
                            <td align="right">{r.events ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Frame>

              <Frame label="Volume (throughput proxy)">
                {(report.volume || []).length === 0 ? (
                  <p className="km-muted" style={{ margin: 0 }}>No volume data.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {report.volume.map((v, i) => (
                      <li key={`${v.event_name}-${i}`}>
                        {v.environment || "—"} · {v.event_name} = {v.events ?? 0}
                      </li>
                    ))}
                  </ul>
                )}
              </Frame>

              <Frame label="Provider error rate">
                {(report.provider_rate || []).length === 0 ? (
                  <p className="km-muted" style={{ margin: 0 }}>No trace call data.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {report.provider_rate.map((p, i) => (
                      <li key={`${p.provider}-${i}`}>
                        {p.environment || "—"} · {p.provider}: {p.errors}/{p.calls} (
                        {p.rate_pct}%)
                      </li>
                    ))}
                  </ul>
                )}
              </Frame>

              <Frame label="Recent samples">
                {(report.samples || []).length === 0 ? (
                  <p className="km-muted" style={{ margin: 0 }}>No samples.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                    {(report.samples || []).slice(0, 12).map((s, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        <code>{s.ts || ""}</code> [{s.environment || "—"}]{" "}
                        <strong>{s.event_name}</strong> {(s.error || "").slice(0, 180)}
                      </li>
                    ))}
                  </ul>
                )}
              </Frame>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
