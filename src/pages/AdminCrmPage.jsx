import { useMemo, useState } from "react";

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
    <div style={{ padding: 16, maxWidth: 980 }}>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 10 }}>Admin CRM - Invites</div>
      <div style={{ opacity: 0.7, marginBottom: 14 }}>
        Bulk add emails, list and filter invites, revoke access, and resend invite emails.
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>A) Bulk add / update</div>
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
          <button onClick={runBulkAdd} disabled={!isAuthed || busy}>
            {busy ? "Processing..." : "Run Bulk Add"}
          </button>
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>B/C/D) List, filter, revoke, resend</div>
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
          <button onClick={() => listInvites({ append: false })} disabled={!isAuthed || busy}>
            {busy ? "Loading..." : "Load"}
          </button>
          <button onClick={() => listInvites({ append: true })} disabled={!isAuthed || busy || !nextKey}>
            Load More
          </button>
          <button onClick={exportAllInvitesCsv} disabled={!isAuthed || busy || exportBusy}>
            {exportBusy ? "Exporting..." : "Export All CSV"}
          </button>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 10, overflowX: "auto", overflowY: "hidden" }}>
          <table style={{ width: "100%", minWidth: 1150, borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#fafafa" }}>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Email</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>First name</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Allowed/Blocked</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Email status</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Last sent</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Updated</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Invite history</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvites.length ? (
                filteredInvites.map((row) => (
                  <tr key={row.email}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{row.email}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{row?.metadata?.first_name || "-"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{row.access_status || row.status || "-"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{row.email_status || "-"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{row.last_sent_at || "-"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>{row.updated_at || "-"}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5", maxWidth: 260 }}>
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
                    <td style={{ padding: 8, borderBottom: "1px solid #f5f5f5" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => resendInvite(row)} disabled={!isAuthed || busy}>
                          Resend
                        </button>
                        <button onClick={() => revokeInvite(row.email)} disabled={!isAuthed || busy}>
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: 12, opacity: 0.7 }}>
                    No invite records loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>E) Email preferences (exact email)</div>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={loadEmailPrefs} disabled={!isAuthed || busy}>
              Load Status
            </button>
            <button onClick={() => setEmailPrefs(true)} disabled={!isAuthed || busy}>
              Unsubscribe
            </button>
            <button onClick={() => setEmailPrefs(false)} disabled={!isAuthed || busy}>
              Resubscribe
            </button>
          </div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            {emailPrefsRecord ? (
              <>
                Status: {emailPrefsRecord.global_unsubscribed ? "unsubscribed" : "subscribed"} | Updated:{" "}
                {emailPrefsRecord.updated_at || "-"} | Source: {emailPrefsRecord.source || "-"}
                {emailPrefsRecord.note ? ` | Note: ${emailPrefsRecord.note}` : ""}
              </>
            ) : (
              "Load an email to view current non-essential email preference."
            )}
          </div>
        </div>
      </div>

      {statusMessage ? <div style={{ color: "#065f46", marginBottom: 8 }}>{statusMessage}</div> : null}
      {errorMessage ? <div style={{ color: "#b00020", marginBottom: 8 }}>{errorMessage}</div> : null}
    </div>
  );
}

