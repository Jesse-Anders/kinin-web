import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Spinner } from "../../../theme";
import { MetricsShell } from "../../../admin/metrics/MetricsShell";
import { ChartFrame } from "../../../admin/metrics/ChartFrame";
import { getAdminApi, putAdminApi, deleteAdminApi } from "../../../admin/metrics/apiClient";
import { fmtUsd } from "../../../admin/metrics/format";

// Edit-in-place row state shape:
//   { model_pattern, input_per_million, output_per_million,
//     cache_write_5m_per_million?, cache_write_1h_per_million?,
//     cache_read_per_million?, display_name?, family?, provider?, note? }
const EMPTY_DRAFT = {
  model_pattern: "",
  input_per_million: "",
  output_per_million: "",
  cache_write_5m_per_million: "",
  cache_write_1h_per_million: "",
  cache_read_per_million: "",
  display_name: "",
  family: "",
  provider: "anthropic",
  note: "",
};

function toNumberOrNull(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function AdminMetricsPricingPage({ isAuthed, getAccessToken, apiBase, setActivePage }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [editing, setEditing] = useState(null); // model_pattern being edited
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [newDraft, setNewDraft] = useState({ ...EMPTY_DRAFT });
  const fetchToken = useRef(0);

  async function reload() {
    if (!isAuthed) return;
    const myToken = ++fetchToken.current;
    setBusy(true);
    setError("");
    try {
      const payload = await getAdminApi({
        apiBase,
        path: "/admin/pricing_overrides",
        getAccessToken,
      });
      if (myToken !== fetchToken.current) return;
      setData(payload);
    } catch (e) {
      if (myToken !== fetchToken.current) return;
      setError(e?.message || String(e));
    } finally {
      if (myToken === fetchToken.current) setBusy(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, isAuthed]);

  function startEdit(row) {
    setEditing(row.model_pattern);
    setDraft({
      model_pattern: row.model_pattern || "",
      input_per_million: row.input_per_million ?? "",
      output_per_million: row.output_per_million ?? "",
      cache_write_5m_per_million: row.cache_write_5m_per_million ?? "",
      cache_write_1h_per_million: row.cache_write_1h_per_million ?? "",
      cache_read_per_million: row.cache_read_per_million ?? "",
      display_name: row.display_name || "",
      family: row.family || "",
      provider: row.provider || "anthropic",
      note: row.note || "",
    });
  }

  function startEditFromDefault(record) {
    setEditing("__new__");
    setDraft({
      model_pattern: record.family || "",
      input_per_million: record.input_per_million ?? "",
      output_per_million: record.output_per_million ?? "",
      cache_write_5m_per_million: record.cache_write_5m_per_million ?? "",
      cache_write_1h_per_million: record.cache_write_1h_per_million ?? "",
      cache_read_per_million: record.cache_read_per_million ?? "",
      display_name: record.display_name || "",
      family: record.family || "",
      provider: record.provider || "anthropic",
      note: `Override seeded from default for ${record.display_name || record.family}`,
    });
  }

  function startEditForUnknown(modelId) {
    setEditing("__new__");
    setDraft({ ...EMPTY_DRAFT, model_pattern: modelId, note: `Seen in recent token usage` });
  }

  async function saveDraft(d) {
    setSaveStatus("");
    setError("");
    const inp = toNumberOrNull(d.input_per_million);
    const out = toNumberOrNull(d.output_per_million);
    if (inp == null || out == null) {
      setError("Input and output prices are required (USD per 1M tokens).");
      return;
    }
    try {
      await putAdminApi({
        apiBase,
        path: "/admin/pricing_overrides",
        getAccessToken,
        body: {
          model_pattern: (d.model_pattern || "").trim().toLowerCase(),
          input_per_million: inp,
          output_per_million: out,
          cache_write_5m_per_million: toNumberOrNull(d.cache_write_5m_per_million),
          cache_write_1h_per_million: toNumberOrNull(d.cache_write_1h_per_million),
          cache_read_per_million: toNumberOrNull(d.cache_read_per_million),
          display_name: (d.display_name || "").trim() || null,
          family: (d.family || "").trim() || null,
          provider: (d.provider || "").trim() || null,
          note: (d.note || "").trim() || null,
        },
      });
      setSaveStatus(`Saved override for ${d.model_pattern}.`);
      setEditing(null);
      setDraft({ ...EMPTY_DRAFT });
      setNewDraft({ ...EMPTY_DRAFT });
      await reload();
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function removeOverride(modelPattern) {
    if (!modelPattern) return;
    if (!window.confirm(`Delete pricing override for "${modelPattern}"?`)) return;
    setError("");
    setSaveStatus("");
    try {
      await deleteAdminApi({
        apiBase,
        path: "/admin/pricing_overrides",
        getAccessToken,
        body: { model_pattern: modelPattern },
      });
      setSaveStatus(`Deleted ${modelPattern}.`);
      await reload();
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  const defaults = data?.defaults || [];
  const overrides = data?.overrides || [];
  const unknownModels = data?.unknown_models_recent || [];

  const overridesByPattern = useMemo(() => {
    const map = new Map();
    for (const row of overrides) {
      map.set(row.model_pattern, row);
    }
    return map;
  }, [overrides]);

  return (
    <MetricsShell
      eyebrow="Admin · Metrics"
      title={<>Pricing Overrides</>}
      subtitle="Register pricing for any Bedrock / inference-profile model id that the built-in defaults don't already cover. Stored in DynamoDB so admins can update prices without redeploying."
      onBack={() => setActivePage("admin-metrics")}
    >
      {error ? (
        <Banner tone="danger">
          <span><strong>Error.</strong> {error}</span>
        </Banner>
      ) : null}
      {saveStatus ? (
        <Banner tone="info">
          <span>{saveStatus}</span>
        </Banner>
      ) : null}

      {/* Unknown models alert */}
      {unknownModels.length ? (
        <ChartFrame
          eyebrow="Action required"
          title="Unregistered model IDs seen recently"
          description="These model IDs appeared in token usage in the last 30 days but don't match the defaults or any existing override. Cost dashboards report them as 'Unknown' until you register a price."
          exportName="pricing-unknown"
          noExport
        >
          <table className="km-metrics-table">
            <thead>
              <tr>
                <th>Model ID</th>
                <th className="num">Recent calls</th>
                <th>Sample agent roles</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {unknownModels.map((u) => (
                <tr key={u.model_id}>
                  <td style={{ wordBreak: "break-all", maxWidth: 380 }}>{u.model_id}</td>
                  <td className="num">{u.calls.toLocaleString("en-US")}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)" }}>
                    {(u.sample_agent_roles || []).join(", ")}
                  </td>
                  <td>
                    <Button variant="primary" onClick={() => startEditForUnknown(u.model_id)} size="sm">
                      Register
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartFrame>
      ) : null}

      {/* New / editing override form */}
      <ChartFrame
        eyebrow={editing === "__new__" ? "New override" : editing ? "Edit override" : "Add override"}
        title={editing ? `Pricing for "${draft.model_pattern || "—"}"` : "Add a new pricing override"}
        description="Patterns match model IDs as a case-insensitive substring. The longest matching pattern wins."
        exportName="pricing-form"
        noExport
      >
        <PricingForm
          draft={editing ? draft : newDraft}
          setDraft={editing ? setDraft : setNewDraft}
          onSubmit={() => saveDraft(editing ? draft : newDraft)}
          onCancel={
            editing
              ? () => {
                  setEditing(null);
                  setDraft({ ...EMPTY_DRAFT });
                }
              : null
          }
        />
      </ChartFrame>

      {/* Active overrides */}
      <ChartFrame
        eyebrow="Active overrides"
        title="Custom pricing"
        description="These override the built-in defaults. Anything not listed here uses the defaults below."
        exportName="pricing-overrides"
        noExport
      >
        {busy && !data ? (
          <div style={{ padding: 16, display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        ) : (
          <table className="km-metrics-table">
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Family</th>
                <th>Display name</th>
                <th className="num">Input / 1M</th>
                <th className="num">Output / 1M</th>
                <th className="num">Cache read / 1M</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {overrides.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 20, color: "var(--ink-faint)", fontStyle: "italic" }}>
                    No overrides yet. Built-in defaults are in effect.
                  </td>
                </tr>
              ) : null}
              {overrides.map((row) => (
                <tr key={row.model_pattern}>
                  <td style={{ wordBreak: "break-all", maxWidth: 280 }}>{row.model_pattern}</td>
                  <td>{row.family || "—"}</td>
                  <td>{row.display_name || "—"}</td>
                  <td className="num">{fmtUsd(row.input_per_million)}</td>
                  <td className="num">{fmtUsd(row.output_per_million)}</td>
                  <td className="num">{row.cache_read_per_million != null ? fmtUsd(row.cache_read_per_million) : "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)" }}>
                    {row.updated_at || "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(row)}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => removeOverride(row.model_pattern)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChartFrame>

      {/* Built-in defaults */}
      <ChartFrame
        eyebrow="Built-in defaults"
        title="Anthropic Claude family pricing"
        description="Source: Anthropic's public price sheet / Bedrock global-endpoint on-demand rates (verified May 2026). Click 'Override' to create a tweaked override for a specific model id."
        exportName="pricing-defaults"
        noExport
      >
        <table className="km-metrics-table">
          <thead>
            <tr>
              <th>Family</th>
              <th>Display name</th>
              <th className="num">Input / 1M</th>
              <th className="num">Output / 1M</th>
              <th className="num">Cache write 5m / 1h</th>
              <th className="num">Cache read</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {defaults.map((d) => (
              <tr key={d.family}>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)" }}>{d.family}</td>
                <td>{d.display_name}</td>
                <td className="num">{fmtUsd(d.input_per_million)}</td>
                <td className="num">{fmtUsd(d.output_per_million)}</td>
                <td className="num">
                  {d.cache_write_5m_per_million != null ? fmtUsd(d.cache_write_5m_per_million) : "—"}
                  {" / "}
                  {d.cache_write_1h_per_million != null ? fmtUsd(d.cache_write_1h_per_million) : "—"}
                </td>
                <td className="num">
                  {d.cache_read_per_million != null ? fmtUsd(d.cache_read_per_million) : "—"}
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditFromDefault(d)}
                    disabled={overridesByPattern.has(d.family)}
                    title={overridesByPattern.has(d.family) ? "Override already exists" : "Create an override seeded from this default"}
                  >
                    Override
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartFrame>
    </MetricsShell>
  );
}

function PricingForm({ draft, setDraft, onSubmit, onCancel }) {
  function set(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }
  const inputStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    padding: "8px 10px",
    background: "var(--cream)",
    border: "1px solid var(--thread)",
    color: "var(--ink)",
    width: "100%",
  };
  const labelStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 9.5,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--ink-faint)",
    marginBottom: 4,
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{ display: "grid", gap: 14 }}
    >
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label>
          <div style={labelStyle}>Model pattern *</div>
          <input
            value={draft.model_pattern}
            onChange={(e) => set("model_pattern", e.target.value)}
            placeholder="claude-haiku-4-5"
            style={inputStyle}
            required
          />
        </label>
        <label>
          <div style={labelStyle}>Display name</div>
          <input
            value={draft.display_name}
            onChange={(e) => set("display_name", e.target.value)}
            placeholder="Claude Haiku 4.5"
            style={inputStyle}
          />
        </label>
        <label>
          <div style={labelStyle}>Family</div>
          <input
            value={draft.family}
            onChange={(e) => set("family", e.target.value)}
            placeholder="claude-haiku-4-5"
            style={inputStyle}
          />
        </label>
        <label>
          <div style={labelStyle}>Provider</div>
          <input
            value={draft.provider}
            onChange={(e) => set("provider", e.target.value)}
            placeholder="anthropic"
            style={inputStyle}
          />
        </label>
        <label>
          <div style={labelStyle}>Input $ / 1M *</div>
          <input
            type="number" min="0" step="0.01"
            value={draft.input_per_million}
            onChange={(e) => set("input_per_million", e.target.value)}
            placeholder="1.00"
            style={inputStyle}
            required
          />
        </label>
        <label>
          <div style={labelStyle}>Output $ / 1M *</div>
          <input
            type="number" min="0" step="0.01"
            value={draft.output_per_million}
            onChange={(e) => set("output_per_million", e.target.value)}
            placeholder="5.00"
            style={inputStyle}
            required
          />
        </label>
        <label>
          <div style={labelStyle}>Cache write 5m $ / 1M</div>
          <input
            type="number" min="0" step="0.01"
            value={draft.cache_write_5m_per_million}
            onChange={(e) => set("cache_write_5m_per_million", e.target.value)}
            placeholder="1.25"
            style={inputStyle}
          />
        </label>
        <label>
          <div style={labelStyle}>Cache write 1h $ / 1M</div>
          <input
            type="number" min="0" step="0.01"
            value={draft.cache_write_1h_per_million}
            onChange={(e) => set("cache_write_1h_per_million", e.target.value)}
            placeholder="2.00"
            style={inputStyle}
          />
        </label>
        <label>
          <div style={labelStyle}>Cache read $ / 1M</div>
          <input
            type="number" min="0" step="0.01"
            value={draft.cache_read_per_million}
            onChange={(e) => set("cache_read_per_million", e.target.value)}
            placeholder="0.10"
            style={inputStyle}
          />
        </label>
      </div>

      <label>
        <div style={labelStyle}>Note</div>
        <textarea
          value={draft.note}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
          placeholder="Why is this override needed?"
          style={{ ...inputStyle, fontFamily: "var(--font-body)", fontSize: 14 }}
        />
      </label>

      <div style={{ display: "flex", gap: 10 }}>
        <Button variant="primary" type="submit">
          Save override
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
