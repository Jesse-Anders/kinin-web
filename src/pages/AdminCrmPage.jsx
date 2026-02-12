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

export default function AdminCrmPage({ isAuthed, getAccessToken, apiBase }) {
  const [bulkInput, setBulkInput] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [bulkSendEmail, setBulkSendEmail] = useState(true);
  const [listStatusFilter, setListStatusFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [invites, setInvites] = useState([]);
  const [nextKey, setNextKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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

      {statusMessage ? <div style={{ color: "#065f46", marginBottom: 8 }}>{statusMessage}</div> : null}
      {errorMessage ? <div style={{ color: "#b00020", marginBottom: 8 }}>{errorMessage}</div> : null}
    </div>
  );
}

