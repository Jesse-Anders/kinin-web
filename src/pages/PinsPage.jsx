import { useCallback, useEffect, useState } from "react";
import { Check, HeartHandshake, MapPin, MessageCircle, NotebookPen, RotateCcw, Trash2 } from "lucide-react";
import { Banner, Button, Frame, Section, Spinner, TextArea } from "../theme";
import { createPin, deletePin, listPins, updatePin } from "../services/pinsClient";

const PIN_TEXT_MAX_CHARS = 2000;

const STATUS_TABS = [
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
];

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(dt);
}

export default function PinsPage({
  isAuthed,
  getAccessToken,
  apiBase,
  onStartChatFromPin,
  onStartJournalFromPin,
  startingPinId = "",
  startingJournalPinId = "",
}) {
  const [filter, setFilter] = useState("active");
  const [pins, setPins] = useState([]);
  const [newPinText, setNewPinText] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingPinId, setUpdatingPinId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const loadPins = useCallback(async () => {
    if (!isAuthed) return;
    setError("");
    setLoading(true);
    try {
      const token = await getAccessToken();
      const data = await listPins({ apiBase, token, status: filter });
      setPins(Array.isArray(data?.pins) ? data.pins : []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [isAuthed, getAccessToken, apiBase, filter]);

  useEffect(() => {
    loadPins();
  }, [loadPins]);

  async function handleCreate() {
    const text = newPinText.trim();
    if (!text) return;
    if (text.length > PIN_TEXT_MAX_CHARS) {
      setError(`Pin is too long. Maximum is ${PIN_TEXT_MAX_CHARS} characters.`);
      return;
    }
    setError("");
    setStatus("");
    setCreating(true);
    try {
      const token = await getAccessToken();
      const data = await createPin({ apiBase, token, text });
      // New pins are always active; only surface immediately on the Active tab.
      if (data?.pin && filter === "active") {
        setPins((prev) => [data.pin, ...prev]);
      }
      setNewPinText("");
      setStatus("Pin saved.");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  }

  async function changeStatus(pin, newStatus, doneMessage) {
    if (!pin?.pin_id) return;
    setError("");
    setStatus("");
    setUpdatingPinId(pin.pin_id);
    try {
      const token = await getAccessToken();
      await updatePin({ apiBase, token, pinId: pin.pin_id, updates: { status: newStatus } });
      // The pin no longer belongs to the current tab, so drop it from view.
      setPins((prev) => prev.filter((p) => p.pin_id !== pin.pin_id));
      setStatus(doneMessage);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setUpdatingPinId("");
    }
  }

  async function handleDelete(pin) {
    if (!pin?.pin_id) return;
    const confirmed = window.confirm(
      "You are about to delete this pin. This action cannot be undone."
    );
    if (!confirmed) return;
    setError("");
    setStatus("");
    setUpdatingPinId(pin.pin_id);
    try {
      const token = await getAccessToken();
      await deletePin({ apiBase, token, pinId: pin.pin_id });
      setPins((prev) => prev.filter((p) => p.pin_id !== pin.pin_id));
      setStatus("Pin deleted.");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setUpdatingPinId("");
    }
  }

  function handleStartChat(pin) {
    if (!pin) return;
    if (typeof onStartChatFromPin === "function") {
      onStartChatFromPin(pin);
    }
  }

  function handleStartJournal(pin) {
    if (!pin) return;
    if (typeof onStartJournalFromPin === "function") {
      onStartJournalFromPin(pin);
    }
  }

  const remaining = PIN_TEXT_MAX_CHARS - newPinText.length;
  const launching = Boolean(startingPinId) || Boolean(startingJournalPinId);

  const emptyCopy = {
    active: "No pins yet. Add one above to remember a story for later.",
    completed: "No completed pins yet. Mark a pin complete once you've shared its story.",
  }[filter];

  return (
    <Section
      eyebrow="Memory Pins"
      title={
        <>
          A quick note now,
          <br />
          <em>a story when you're ready.</em>
        </>
      }
    >
      <div className="km-prose" style={{ maxWidth: 680, marginBottom: 32 }}>
        <p>
          Jot down a memory you want to share later. When you have time, tap a
          pin and Kinin will help you tell that story. Mark it complete once
          you're done, or delete pins you no longer need.
        </p>
      </div>

      <div data-help-anchor="pins-new">
      <Frame label="New pin">
        <div className="km-stack" style={{ gap: 12 }}>
          <TextArea
            value={newPinText}
            onChange={(e) => setNewPinText(e.target.value)}
            placeholder="A sentence or two about the memory you want to share..."
            rows={3}
            maxLength={PIN_TEXT_MAX_CHARS}
            disabled={!isAuthed || creating}
          />
          <div className="km-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span className="km-form-help">{remaining} characters left</span>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!isAuthed || creating || !newPinText.trim()}
            >
              {creating ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Add pin"
              )}
            </Button>
          </div>
        </div>
      </Frame>
      </div>

      {status ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone="info">{status}</Banner>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 20 }}>
          <Banner tone="danger">{error}</Banner>
        </div>
      ) : null}

      <div style={{ marginTop: 32 }} data-help-anchor="pins-list">
        <div className="km-row" style={{ gap: 8, marginBottom: 16 }}>
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.id}
              size="sm"
              variant={filter === tab.id ? "primary" : "ghost"}
              onClick={() => setFilter(tab.id)}
              disabled={loading}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="km-chat-empty">
            <Spinner /> Loading pins...
          </div>
        ) : pins.length ? (
          <div className="km-stack" style={{ gap: 12 }}>
            {pins.map((pin) => {
              const isLaunching = startingPinId === pin.pin_id;
              const isLaunchingJournal = startingJournalPinId === pin.pin_id;
              const isUpdating = updatingPinId === pin.pin_id;
              const rowBusy = isLaunching || isLaunchingJournal || isUpdating || launching;
              const isRequest = pin.source === "story_request";
              const requesterName = (pin.requester_name || "").trim() || "A family member";
              return (
                <Frame
                  key={pin.pin_id}
                  label={isRequest ? "Story request" : undefined}
                  className={isRequest ? "km-pin-request" : ""}
                >
                  <div className="km-row" style={{ gap: 12, alignItems: "flex-start" }}>
                    {isRequest ? (
                      <HeartHandshake size={20} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
                    ) : (
                      <MapPin size={20} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isRequest ? (
                        <div className="km-mono-label" style={{ marginBottom: 6 }}>
                          Memory requested by {requesterName}
                          {pin.created_at ? ` on ${formatDate(pin.created_at)}` : ""}
                        </div>
                      ) : null}
                      <div style={{ whiteSpace: "pre-wrap" }}>{pin.text}</div>
                      <div className="km-mono-label" style={{ marginTop: 8 }}>
                        Pinned {formatDate(pin.created_at)}
                        {pin.status === "completed" && pin.completed_at
                          ? ` · Completed ${formatDate(pin.completed_at)}`
                          : ""}
                      </div>

                      <div className="km-row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleStartChat(pin)}
                          disabled={!isAuthed || rowBusy}
                        >
                          {isLaunching ? (
                            <>
                              <Spinner /> Starting chat...
                            </>
                          ) : (
                            <>
                              <MessageCircle size={16} strokeWidth={1.5} /> Start chat from pin
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => handleStartJournal(pin)}
                          disabled={!isAuthed || rowBusy}
                        >
                          {isLaunchingJournal ? (
                            <>
                              <Spinner /> Starting...
                            </>
                          ) : (
                            <>
                              <NotebookPen size={16} strokeWidth={1.5} /> Start journal from pin
                            </>
                          )}
                        </Button>

                        {filter === "active" ? (
                          <Button
                            size="sm"
                            onClick={() => changeStatus(pin, "completed", "Marked complete.")}
                            disabled={!isAuthed || rowBusy}
                          >
                            <Check size={16} strokeWidth={1.5} /> Mark complete
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => changeStatus(pin, "active", "Reopened pin.")}
                            disabled={!isAuthed || rowBusy}
                          >
                            <RotateCcw size={16} strokeWidth={1.5} /> Reopen
                          </Button>
                        )}

                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(pin)}
                          disabled={!isAuthed || rowBusy}
                        >
                          <Trash2 size={16} strokeWidth={1.5} /> Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </Frame>
              );
            })}
          </div>
        ) : (
          <div className="km-chat-empty">{emptyCopy}</div>
        )}
      </div>
    </Section>
  );
}
