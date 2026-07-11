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

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomCode = Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => ROOM_CODE_ALPHABET[value & 31]).join("");
const wsUrl = new URL(`/rooms/${roomCode}/socket`, workerUrl);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

await new Promise((resolve, reject) => {
  const socket = new WebSocket(wsUrl);
  const timeout = setTimeout(() => {
    socket.close();
    reject(new Error("WebSocket smoke test timed out."));
  }, 5_000);

  socket.once("open", () => {
    socket.send(JSON.stringify({
      id: crypto.randomUUID(),
      type: "client:room:create",
      payload: {
        nickname: "Smoke",
        guestId: `smoke-${crypto.randomUUID()}`,
        sessionId: crypto.randomUUID(),
        deviceKind: "desktop"
      }
    }));
  });

  socket.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());
      if (message.type !== "server:ack" || !message.payload?.ok) {
        return;
      }
      clearTimeout(timeout);
      socket.send(JSON.stringify({
        id: crypto.randomUUID(),
        type: "client:room:leave",
        payload: { roomCode }
      }));
      socket.close();
      resolve();
    } catch (error) {
      clearTimeout(timeout);
      socket.close();
      reject(error);
    }
  });

  socket.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
});
