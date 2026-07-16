import { useMemo, useRef, useState } from "react";
import { Banner, Button, Frame, Section, Spinner } from "../theme";

function normalizeEmail(value) {
  return (value || "").trim().toLowerCase();
}

function parseBulkLines(raw) {
  const lines = (raw || "").split(/\r?\n/);
  const out = [];
  const seen = new Set();
  const invalid = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [emailRaw, firstNameRaw] = trimmed.split(",").map((v) => (v || "").trim());
    const email = normalizeEmail(emailRaw);
    if (!email || !email.includes("@")) {
      invalid.push(trimmed);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      first_name: firstNameRaw || undefined,
    });
  }
  return { items: out, invalid };
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export default function AdminCrmPage({ isAuthed, getAccessToken, apiBase }) {
  const [bulkInput, setBulkInput] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [bulkSendEmail, setBulkSendEmail] = useState(true);
  const [listStatusFilter, setListStatusFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [invites, setInvites] = useState([]);
  const [nextKey, setNextKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [emailPrefsEmail, setEmailPrefsEmail] = useState("");
  const [emailPrefsNote, setEmailPrefsNote] = useState("");
  const [emailPrefsRecord, setEmailPrefsRecord] = useState(null);

  // Live access (entitlements) — governs already-signed-up users
  const [accessEmail, setAccessEmail] = useState("");
  const [accessPlan, setAccessPlan] = useState("beta_invited");
  const [accessRecord, setAccessRecord] = useState(null);
  const [accessResolvedUserId, setAccessResolvedUserId] = useState("");
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const accessFrameRef = useRef(null);

  const filteredInvites = useMemo(() => {
    const q = (searchFilter || "").trim().toLowerCase();
    if (!q) return invites;
    return invites.filter((item) => {
      const email = (item?.email || "").toLowerCase();
      const status = (item?.access_status || item?.status || "").toLowerCase();
      const emailStatus = (item?.email_status || "").toLowerCase();
      const note = (item?.note || "").toLowerCase();
      const firstName = (item?.metadata?.first_name || "").toLowerCase();
      return (
        email.includes(q) ||
        status.includes(q) ||
        emailStatus.includes(q) ||
        note.includes(q) ||
        firstName.includes(q)
      );
    });
  }, [invites, searchFilter]);

  async function listInvites({ append = false } = {}) {
    setErrorMessage("");
    setStatusMessage("");
    setBusy(true);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`${apiBase}/admin/invites/list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          limit: 50,
          status: listStatusFilter || undefined,
          start_key: append ? nextKey || undefined : undefined,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API error ${res.status}: ${t}`);
      }
      const data = await res.json();
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data;
      const items = parsed.items || [];
      setInvites((prev) => (append ? [...prev, ...items] : items));
      setNextKey(parsed.next_start_key || null);
      setStatusMessage(`Loaded ${items.length} invite records.`);
    } catch (e) {
      setErrorMessage(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addOrUpdateInvite({ email, firstName, sendEmail = false, note = "" }) {
    const accessToken = await getAccessToken();
    const res = await fetch(`${apiBase}/admin/invites/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        email,
        first_name: firstName || undefined,
        note: note || undefined,
        send_email: Boolean(sendEmail),
        source: "admin_crm_ui",
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`API error ${res.status}: ${t}`);
    }
    const data = await res.json();
    return typeof data.body === "string" ? JSON.parse(data.body) : data;
  }

  async function adminPost(endpoint, payload) {
    const accessToken = await getAccessToken();
    const res = await fetch(`${apiBase}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload || {}),
    });
    const text = await res.text();
    let parsed = null;
    try {
      const outer = JSON.parse(text);
      parsed = typeof outer?.body === "string" ? JSON.parse(outer.body) : outer;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const detail = parsed ? JSON.stringify(parsed) : text;
      throw new Error(`API error ${res.status}: ${detail}`);
    }
    return parsed || {};
  }

  async function loadEmailPrefs() {
    const email = normalizeEmail(emailPrefsEmail);
    if (!email || !email.includes("@")) {
      setErrorMessage("Enter a valid email for preferences lookup.");
      return;
    }
    setErrorMessage("");
    setStatusMessage("");
    setBusy(true);
    try {
      const out = await adminPost("/admin/email_prefs/get", { email });
      setEmailPrefsRecord(out?.email_preferences || null);
      setStatusMessage(`Loaded email preferences for ${email}.`);
    } catch (e) {
      setErrorMessage(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function setEmailPrefs(globalUnsubscribed) {
    const email = normalizeEmail(emailPrefsEmail);
    if (!email || !email.includes("@")) {
      setErrorMessage("Enter a valid email before updating preferences.");
      return;
    }
    setErrorMessage("");
    setStatusMessage("");
    setBusy(true);
    try {
      const out = await adminPost("/admin/email_prefs/set", {
        email,
        global_unsubscribed: Boolean(globalUnsubscribed),
        note: emailPrefsNote || undefined,
        source: "admin_crm_ui",
      });
      const rec = out?.email_preferences || null;
      setEmailPrefsRecord(rec);
      setStatusMessage(
        rec?.global_unsubscribed
          ? `Set ${email} to unsubscribed for non-essential emails.`
          : `Set ${email} to subscribed for non-essential emails.`
      );
    } catch (e) {
      setErrorMessage(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function checkAccess(emailArg) {
    const email = normalizeEmail(emailArg ?? accessEmail);
    if (!email || !email.includes("@")) {
      setErrorMessage("Enter a valid email to check live access.");
      return;
    }
    setErrorMessage("");
    setStatusMessage("");
    setAccessBusy(true);
    try {
      const out = await adminPost("/admin/entitlements/get", { email });
      setAccessRecord(out?.entitlement || null);
      setAccessResolvedUserId(out?.user_id || "");
      setAccessLoaded(true);
      if (out?.entitlement?.plan_state) setAccessPlan(out.entitlement.plan_state);
      setStatusMessage(
        out?.entitlement
          ? `Loaded live access for ${email}.`
          : `No entitlement record for ${email}. They may not have signed up yet.`
      );
    } catch (e) {
      setAccessRecord(null);
      setAccessResolvedUserId("");
      setAccessLoaded(false);
      setErrorMessage(e?.message || String(e));
    } finally {
      setAccessBusy(false);
    }
  }

  async function setAccess(nextState) {
    const email = normalizeEmail(accessEmail);
    if (!email || !email.includes("@")) {
      setErrorMessage("Enter a valid email before changing access.");
      return;
    }
    setErrorMessage("");
    setStatusMessage("");
    setAccessBusy(true);
    try {
      const payload = {
        email,
        access_state: nextState,
        source: "admin_crm_ui",
      };
      if (nextState === "allowed") {
        payload.plan_state = accessPlan || "beta_invited";
      } else {
        payload.plan_state = accessRecord?.plan_state || "none";
        payload.block_reason = "admin_blocked";
      }
      const out = await adminPost("/admin/entitlements/upsert", payload);
      setAccessRecord(out?.entitlement || null);
      setAccessLoaded(true);
      if (out?.entitlement?.plan_state) setAccessPlan(out.entitlement.plan_state);
      setStatusMessage(
        nextState === "allowed"
          ? `Granted access to ${email}.`
          : `Blocked access for ${email}.`
      );
    } catch (e) {
      setErrorMessage(e?.message || String(e));
    } finally {
      setAccessBusy(false);
    }
  }

  async function syncAccessFromInvite() {
    const email = normalizeEmail(accessEmail);
    if (!email || !email.includes("@")) {
      setErrorMessage("Enter a valid email to sync from invite.");
      return;
    }
    setErrorMessage("");
    setStatusMessage("");
    setAccessBusy(true);
    try {
      const out = await adminPost("/admin/entitlements/sync_invite", { email, source: "admin_crm_ui" });
      setAccessRecord(out?.entitlement || null);
      setAccessResolvedUserId(out?.user_id || "");
      setAccessLoaded(true);
      if (out?.entitlement?.plan_state) setAccessPlan(out.entitlement.plan_state);
      setStatusMessage(
        out?.invite_found
          ? `Synced ${email} from their invite (access = ${out?.entitlement?.access_state || "?"}).`
          : `No invite found for ${email}; access set to blocked.`
      );
    } catch (e) {
      setErrorMessage(e?.message || String(e));
    } finally {
      setAccessBusy(false);
    }
  }

  function manageAccessFor(email) {
    const normalized = normalizeEmail(email);
    setAccessEmail(normalized);
    setAccessRecord(null);
    setAccessResolvedUserId("");
    setAccessLoaded(false);
    if (accessFrameRef.current) {
      accessFrameRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    checkAccess(normalized);
  }

  async function exportAllInvitesCsv() {
    setErrorMessage("");
    setStatusMessage("");
    setExportBusy(true);
    try {
      const allInvites = [];
      let startKey = undefined;
      while (true) {
        const out = await adminPost("/admin/invites/list", {
          limit: 200,
          status: listStatusFilter || undefined,
          start_key: startKey,
        });
        const batch = Array.isArray(out?.items) ? out.items : [];
        allInvites.push(...batch);
        startKey = out?.next_start_key || null;
        if (!startKey) break;
      }

      const prefsByEmail = {};
      for (const row of allInvites) {
        const email = normalizeEmail(row?.email);
        if (!email || prefsByEmail[email]) continue;
        try {
          const out = await adminPost("/admin/email_prefs/get", { email });
          prefsByEmail[email] = out?.email_preferences || null;
        } catch {
          prefsByEmail[email] = null;
        }
      }

      const headers = [
        "email",
        "first_name",
        "access_status",
        "email_status",
        "global_unsubscribed",
        "prefs_updated_at",
        "prefs_source",
        "prefs_note",
        "invite_note",
        "invite_source",
        "invited_at",
        "last_sent_at",
        "updated_at",
        "invite_send_count",
        "invite_history_count",
      ];
      const lines = [headers.map(csvCell).join(",")];
      for (const row of allInvites) {
        const email = normalizeEmail(row?.email);
        const prefs = prefsByEmail[email] || {};
        const values = [
          email,
          row?.metadata?.first_name || "",
          row?.access_status || row?.status || "",
          row?.email_status || "",
          typeof prefs?.global_unsubscribed === "boolean" ? String(prefs.global_unsubscribed) : "",
          prefs?.updated_at || "",
          prefs?.source || "",
          prefs?.note || "",
          row?.note || "",
          row?.source || "",
          row?.invited_at || "",
          row?.last_sent_at || "",
          row?.updated_at || "",
          row?.invite_send_count || 0,
          Array.isArray(row?.invite_history) ? row.invite_history.length : 0,
        ];
        lines.push(values.map(csvCell).join(","));
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadTextFile(`kinin-admin-invites-${stamp}.csv`, `${lines.join("\n")}\n`, "text/csv;charset=utf-8");
      setStatusMessage(`Exported ${allInvites.length} records to CSV.`);
    } catch (e) {
      setErrorMessage(e?.message || String(e));
    } finally {
      setExportBusy(false);
    }
  }

  async function runBulkAdd() {
    setErrorMessage("");
    setStatusMessage("");
    const { items, invalid } = parseBulkLines(bulkInput);
    if (!items.length) {
      setErrorMessage("Enter one email per line. Optionally use: email,first_name");
      return;
    }

    setBusy(true);
    try {
      let created = 0;
      let updated = 0;
      let emailSent = 0;
      const failed = [];

      for (const row of items) {
        try {
          const result = await addOrUpdateInvite({
            email: row.email,
            firstName: row.first_name,
            sendEmail: bulkSendEmail,
            note: bulkNote,
          });
          if (result?.invite_existed) updated += 1;
          else created += 1;
          if (result?.email_sent) emailSent += 1;
        } catch (e) {
          failed.push({ email: row.email, error: e?.message || String(e) });
        }
      }

      const invalidMsg = invalid.length ? ` Invalid lines: ${invalid.length}.` : "";
      const failedMsg = failed.length ? ` Failed: ${failed.length}.` : "";
      const warningMsg = updated ? ` Updated existing: ${updated}.` : "";
      setStatusMessage(
        `Bulk complete. Created: ${created}.${warningMsg} Emails sent: ${emailSent}.${failedMsg}${invalidMsg}`
      );
      if (failed.length) {
        setErrorMessage(failed.slice(0, 5).map((x) => `${x.email}: ${x.error}`).join(" | "));
      }
      await listInvites({ append: false });
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(email) {
    setErrorMessage("");
    setStatusMessage("");
    setBusy(true);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`${apiBase}/admin/invites/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API error ${res.status}: ${t}`);
      }
      setInvites((prev) =>
        prev.map((x) =>
          x.email === email ? { ...x, status: "blocked", access_status: "blocked" } : x
        )
      );
      setStatusMessage(`Blocked ${email} for new signups.`);
    } catch (e) {
      setErrorMessage(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resendInvite(invite) {
    setErrorMessage("");
    setStatusMessage("");
    setBusy(true);
    try {
      const response = await addOrUpdateInvite({
        email: invite?.email,
        firstName: invite?.metadata?.first_name,
        sendEmail: true,
        note: invite?.note || "",
      });
      setStatusMessage(
        response?.invite_existed
          ? `Invite re-sent for ${invite.email}.`
          : `Invite sent for ${invite.email}.`
      );
      await listInvites({ append: false });
    } catch (e) {
      setErrorMessage(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      eyebrow="Admin · CRM"
      title={
        <>
          Invites &amp;<br />
          <em>access</em>.
        </>
      }
    >
    <div className="km-admin-page">
      <div className="km-prose" style={{ maxWidth: 720, marginBottom: 16, fontSize: 15 }}>
        Bulk add emails, list and filter invites, revoke access, and resend
        invite emails.
      </div>

      <div style={{ maxWidth: 720, marginBottom: 24 }}>
        <Banner tone="info">
          <strong>Two different controls.</strong> Sections A–D manage{" "}
          <strong>invites</strong> — the pre-signup allowlist that decides who
          may create an account. Section F manages <strong>live access</strong>{" "}
          (entitlements) for people who have <em>already signed up</em>. Changing
          an invite does <em>not</em> change access for someone who already has
          an account — use Section F for that.
        </Banner>
      </div>

      <Frame label="A — Bulk add / update">
        <textarea
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
          placeholder={"one@example.com\none@example.com,Jess\nanother@example.com,Sam"}
          style={{ width: "100%", minHeight: 120, boxSizing: "border-box", padding: 10, marginBottom: 8 }}
          disabled={!isAuthed || busy}
        />
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={bulkNote}
            onChange={(e) => setBulkNote(e.target.value)}
            placeholder="Optional note for these invites"
            style={{ flex: 1, padding: 8 }}
            disabled={!isAuthed || busy}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={bulkSendEmail}
              onChange={(e) => setBulkSendEmail(e.target.checked)}
              disabled={!isAuthed || busy}
            />
            Send invite email now
          </label>
          <Button variant="primary" onClick={runBulkAdd} disabled={!isAuthed || busy}>
            {busy ? (
              <>
                <Spinner /> Processing...
              </>
            ) : (
              "Run bulk add"
            )}
          </Button>
        </div>
      </Frame>

      <div style={{ height: 24 }} />

      <Frame label="B · C · D — List, filter, revoke, resend">
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select
            value={listStatusFilter}
            onChange={(e) => setListStatusFilter(e.target.value)}
            disabled={!isAuthed || busy}
          >
            <option value="">All statuses</option>
            <option value="allowed">allowed</option>
            <option value="blocked">blocked</option>
          </select>
          <input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search email, first name, note, status"
            style={{ flex: 1, padding: 8 }}
            disabled={!isAuthed || busy}
          />
          <Button size="sm" variant="primary" onClick={() => listInvites({ append: false })} disabled={!isAuthed || busy}>
            {busy ? "Loading..." : "Load"}
          </Button>
          <Button size="sm" onClick={() => listInvites({ append: true })} disabled={!isAuthed || busy || !nextKey}>
            Load more
          </Button>
          <Button size="sm" onClick={exportAllInvitesCsv} disabled={!isAuthed || busy || exportBusy}>
            {exportBusy ? "Exporting..." : "Export all CSV"}
          </Button>
        </div>

        <div className="km-table-wrap" style={{ marginTop: 14 }}>
          <table className="km-table" style={{ minWidth: 1150 }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>First name</th>
                <th>Allowed / blocked</th>
                <th>Email status</th>
                <th>Last sent</th>
                <th>Updated</th>
                <th>Invite history</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvites.length ? (
                filteredInvites.map((row) => (
                  <tr key={row.email}>
                    <td>{row.email}</td>
                    <td>{row?.metadata?.first_name || "-"}</td>
                    <td>{row.access_status || row.status || "-"}</td>
                    <td>{row.email_status || "-"}</td>
                    <td>{row.last_sent_at || "-"}</td>
                    <td>{row.updated_at || "-"}</td>
                    <td style={{ maxWidth: 260 }}>
                      {Array.isArray(row.invite_history) && row.invite_history.length ? (
                        <details>
                          <summary style={{ cursor: "pointer" }}>{row.invite_history.length} send(s)</summary>
                          <div style={{ marginTop: 6, maxHeight: 120, overflow: "auto", fontSize: 12 }}>
                            {row.invite_history
                              .slice()
                              .reverse()
                              .map((h, idx) => (
                                <div key={`${row.email}-h-${idx}`}>
                                  {h?.sent_at || "-"} {h?.source ? `(${h.source})` : ""}
                                </div>
                              ))}
                          </div>
                        </details>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <div className="km-row" style={{ gap: 6 }}>
                        <Button size="sm" onClick={() => resendInvite(row)} disabled={!isAuthed || busy}>
                          Resend
                        </Button>
                        <Button size="sm" onClick={() => revokeInvite(row.email)} disabled={!isAuthed || busy}>
                          Revoke
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => manageAccessFor(row.email)}
                          disabled={!isAuthed || busy || accessBusy}
                          title="Manage live access (entitlement) for this signed-up user"
                        >
                          Access
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="km-table-empty">
                    No invite records loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Frame>

      <div style={{ height: 24 }} />

      <Frame label="E — Email preferences (exact email)">
        <div style={{ display: "grid", gap: 8 }}>
          <input
            value={emailPrefsEmail}
            onChange={(e) => setEmailPrefsEmail(e.target.value)}
            placeholder="Email address"
            style={{ width: "100%", padding: 8 }}
            disabled={!isAuthed || busy}
          />
          <input
            value={emailPrefsNote}
            onChange={(e) => setEmailPrefsNote(e.target.value)}
            placeholder="Optional admin note (saved with update)"
            style={{ width: "100%", padding: 8 }}
            disabled={!isAuthed || busy}
          />
          <div className="km-row" style={{ gap: 8 }}>
            <Button size="sm" variant="primary" onClick={loadEmailPrefs} disabled={!isAuthed || busy}>
              Load status
            </Button>
            <Button size="sm" onClick={() => setEmailPrefs(true)} disabled={!isAuthed || busy}>
              Unsubscribe
            </Button>
            <Button size="sm" onClick={() => setEmailPrefs(false)} disabled={!isAuthed || busy}>
              Resubscribe
            </Button>
          </div>
          <div className="km-form-help" style={{ fontStyle: "italic" }}>
            {emailPrefsRecord ? (
              <>
                Status: <strong>{emailPrefsRecord.global_unsubscribed ? "unsubscribed" : "subscribed"}</strong> ·
                Updated: {emailPrefsRecord.updated_at || "-"} · Source: {emailPrefsRecord.source || "-"}
                {emailPrefsRecord.note ? ` · Note: ${emailPrefsRecord.note}` : ""}
              </>
            ) : (
              "Load an email to view current non-essential email preference."
            )}
          </div>
        </div>
      </Frame>

      <div style={{ height: 24 }} />

      <div ref={accessFrameRef}>
        <Frame label="F — Live access (already signed-up users)">
          <div
            className="km-form-help"
            style={{ marginBottom: 12, maxWidth: 640 }}
          >
            Use this to grant or block <strong>someone who has already created
            an account</strong> (e.g. they signed up without an invite). This
            edits their entitlement record directly — the same thing you were
            changing by hand in DynamoDB. Look up by email; the account is
            resolved automatically.
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input
              value={accessEmail}
              onChange={(e) => setAccessEmail(e.target.value)}
              placeholder="Email address"
              style={{ flex: 1, minWidth: 220, padding: 8 }}
              disabled={!isAuthed || accessBusy}
            />
            <Button
              size="sm"
              variant="primary"
              onClick={() => checkAccess()}
              disabled={!isAuthed || accessBusy}
            >
              {accessBusy ? "Checking..." : "Check access"}
            </Button>
            <Button size="sm" onClick={syncAccessFromInvite} disabled={!isAuthed || accessBusy}>
              Sync from invite
            </Button>
          </div>

          {accessLoaded && accessRecord ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                padding: "10px 12px",
                borderRadius: 8,
                background: accessRecord.access_state === "allowed" ? "#f0fdf4" : "#fef2f2",
                border: `1px solid ${accessRecord.access_state === "allowed" ? "#bbf7d0" : "#fecaca"}`,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                Access:{" "}
                <span style={{ color: accessRecord.access_state === "allowed" ? "#15803d" : "#b91c1c" }}>
                  {accessRecord.access_state === "allowed" ? "ALLOWED" : "BLOCKED"}
                </span>
              </span>
              <span style={{ opacity: 0.75, fontSize: 13 }}>Plan: {accessRecord.plan_state || "—"}</span>
              {accessRecord.block_reason ? (
                <span style={{ opacity: 0.75, fontSize: 13 }}>Reason: {accessRecord.block_reason}</span>
              ) : null}
              <span style={{ flex: 1 }} />
              {accessRecord.access_state === "allowed" ? (
                <Button size="sm" variant="danger" onClick={() => setAccess("blocked")} disabled={accessBusy}>
                  {accessBusy ? "..." : "Block access"}
                </Button>
              ) : (
                <Button size="sm" variant="primary" onClick={() => setAccess("allowed")} disabled={accessBusy}>
                  {accessBusy ? "..." : "Grant access"}
                </Button>
              )}
            </div>
          ) : null}

          {accessLoaded && !accessRecord ? (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fde68a",
                fontSize: 13,
              }}
            >
              No entitlement record for this email. They likely have not signed
              up yet — add them as an invite above. You can still grant access
              now, which will create the record if the account already exists.
              <div className="km-row" style={{ gap: 8, marginTop: 8 }}>
                <Button size="sm" variant="primary" onClick={() => setAccess("allowed")} disabled={accessBusy}>
                  Grant access
                </Button>
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <span style={{ opacity: 0.7 }}>Plan when granting:</span>
              <select
                value={accessPlan}
                onChange={(e) => setAccessPlan(e.target.value)}
                disabled={!isAuthed || accessBusy}
                style={{ padding: 6 }}
              >
                <option value="beta_invited">beta_invited</option>
                <option value="reunion_only">reunion_only</option>
                <option value="trialing">trialing</option>
                <option value="active">active</option>
                <option value="none">none</option>
              </select>
            </label>
            {accessResolvedUserId ? (
              <span style={{ fontSize: 12, opacity: 0.6 }}>
                user_id: <code>{accessResolvedUserId}</code>
              </span>
            ) : null}
          </div>

          {accessLoaded && accessRecord ? (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.75 }}>
                Full entitlement record
              </summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  margin: "8px 0 0",
                  background: "#fafafa",
                  padding: 8,
                  borderRadius: 6,
                  border: "1px solid #eee",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(accessRecord, null, 2)}
              </pre>
            </details>
          ) : null}
        </Frame>
      </div>

      {statusMessage ? (
        <div style={{ marginTop: 16 }}>
          <Banner tone="info">{statusMessage}</Banner>
        </div>
      ) : null}
      {errorMessage ? (
        <div style={{ marginTop: 16 }}>
          <Banner tone="danger">{errorMessage}</Banner>
        </div>
      ) : null}
    </div>
    </Section>
  );
}

