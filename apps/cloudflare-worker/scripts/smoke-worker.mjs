import WebSocket from "ws";

const workerUrl = process.env.CLOUDFLARE_WORKER_URL?.replace(/\/$/, "");

if (!workerUrl) {
  console.error("CLOUDFLARE_WORKER_URL is required for smoke tests.");
  process.exit(1);
}

const healthResponse = await fetch(`${workerUrl}/health`);
if (!healthResponse.ok) {
  console.error(`Health check failed: ${healthResponse.status}`);
  process.exit(1);
}

const health = await healthResponse.json();
const expectedCommitSha = process.env.COMMIT_SHA;

if (expectedCommitSha && health.commitSha !== expectedCommitSha) {
  console.error(`Deployed commit mismatch: expected ${expectedCommitSha}, received ${health.commitSha ?? "unknown"}`);
  process.exit(1);
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomCode = Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => ROOM_CODE_ALPHABET[value & 31]).join("");
const wsUrl = new URL(`/rooms/${roomCode}/socket`, workerUrl);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

await new Promise((resolve, reject) => {
  const socket = new WebSocket(wsUrl);
  const guestId = `smoke-${crypto.randomUUID()}`;
  const sessionId = crypto.randomUUID();
  let playerId = "";
  let prompt = null;
  let startSent = false;
  let progressSent = false;
  let settled = false;
  const timeout = setTimeout(() => {
    socket.close();
    reject(new Error("WebSocket progress smoke test timed out."));
  }, 15_000);

  const finish = (error) => {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timeout);

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        id: crypto.randomUUID(),
        type: "client:room:leave",
        payload: { roomCode }
      }));
      socket.close();
    }

    if (error) {
      reject(error);
    } else {
      resolve();
    }
  };

  socket.once("open", () => {
    socket.send(JSON.stringify({
      id: crypto.randomUUID(),
      type: "client:room:create",
      payload: {
        roomCode,
        nickname: "Smoke",
        guestId,
        sessionId,
        deviceKind: "desktop"
      }
    }));
  });

  socket.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());

      if (message.type === "server:ack" && message.command === "client:room:create") {
        if (!message.payload?.ok) {
          finish(new Error(`Room creation failed: ${message.payload?.error ?? "unknown error"}`));
          return;
        }

        playerId = message.payload.data.playerId;
        socket.send(JSON.stringify({
          id: crypto.randomUUID(),
          type: "client:player:ready",
          payload: { roomCode, ready: true }
        }));
        return;
      }

      if (message.type === "server:room:state" && !startSent) {
        const player = message.payload?.players?.find((candidate) => candidate.id === playerId);
        if (player?.ready) {
          startSent = true;
          socket.send(JSON.stringify({
            id: crypto.randomUUID(),
            type: "client:match:start",
            payload: { roomCode }
          }));
          return;
        }
      }

      if (message.type === "server:ack" && message.command === "client:match:start") {
        if (!message.payload?.ok) {
          finish(new Error(`Match start failed: ${message.payload?.error ?? "unknown error"}`));
          return;
        }

        prompt = message.payload.data.prompt ?? null;
        return;
      }

      if (message.type === "server:match:started" && !progressSent) {
        prompt = message.payload?.prompt ?? prompt;
        const typing = prompt?.typing?.romaji;

        if (!typing) {
          finish(new Error("Match started without a romaji prompt."));
          return;
        }

        progressSent = true;
        socket.send(JSON.stringify({
          id: crypto.randomUUID(),
          type: "client:typing:progress",
          payload: {
            roomCode,
            input: Array.from(typing).slice(0, 16).join(""),
            sequence: 1
          }
        }));
        return;
      }

      if (progressSent && (message.type === "server:room:state" || message.type === "server:player:progress")) {
        const player = message.payload?.players?.find((candidate) => candidate.id === playerId);
        if ((player?.progressIndex ?? 0) > 0) {
          finish();
        }
      }
    } catch (error) {
      finish(error);
    }
  });

  socket.once("error", (error) => {
    finish(error);
  });
});
