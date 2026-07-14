export function streamTurn({
  wsUrl,
  accessToken,
  message,
  sessionId,
  clientRequestId,
  mode,
  onDelta,
  timeoutMs = 30000,
}) {
  return new Promise((resolve, reject) => {
    if (!wsUrl) {
      reject(new Error("stream_ws_url_missing"));
      return;
    }
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      reject(e);
      return;
    }
    let closed = false;
    let finalPayload = null;
    const timer = setTimeout(() => {
      if (closed) return;
      closed = true;
      try {
        ws.close();
      } catch {
        // Ignore close failures.
      }
      reject(new Error("stream_timeout"));
    }, timeoutMs);

    function done(fn) {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      fn();
    }

    ws.onopen = () => {
      const payload = {
        action: "turn.stream",
        access_token: accessToken,
        message,
        client_request_id: clientRequestId,
      };
      if (sessionId) payload.session_id = sessionId;
      if (mode) payload.mode = mode;
      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (event) => {
      let parsed = null;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        parsed = null;
      }
      if (!parsed || typeof parsed !== "object") return;
      const type = parsed.type;
      if (type === "stream.delta") {
        const delta = typeof parsed.delta === "string" ? parsed.delta : "";
        if (delta && typeof onDelta === "function") onDelta(delta);
        return;
      }
      if (type === "stream.final") {
        finalPayload = parsed;
        return;
      }
      // A meta-help short-circuit: the interviewer didn't answer; instead the
      // backend is offering to switch into help mode. Carry the whole payload
      // (assistant handoff line + meta_suggestion) through so App can render the
      // offer. stream.done resolves it just like a normal final.
      if (type === "stream.meta_suggestion") {
        finalPayload = parsed;
        return;
      }
      if (type === "stream.error") {
        done(() => reject(new Error(parsed.error || "stream_error")));
        return;
      }
      if (type === "stream.done") {
        if (parsed.ok && finalPayload) {
          done(() => resolve(finalPayload));
        } else if (parsed.ok) {
          done(() => resolve(parsed));
        } else {
          done(() => reject(new Error("stream_done_not_ok")));
        }
      }
    };

    ws.onerror = () => {
      done(() => reject(new Error("stream_socket_error")));
    };

    ws.onclose = () => {
      if (!closed) {
        done(() => reject(new Error("stream_socket_closed")));
      }
    };
  });
}
