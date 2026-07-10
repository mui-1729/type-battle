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

const wsUrl = new URL("/rooms/AB23CD/socket", workerUrl);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

await new Promise((resolve, reject) => {
  const socket = new WebSocket(wsUrl);
  const timeout = setTimeout(() => {
    socket.close();
    reject(new Error("WebSocket smoke test timed out."));
  }, 5_000);

  socket.once("open", () => {
    clearTimeout(timeout);
    socket.close();
    resolve();
  });

  socket.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
});
