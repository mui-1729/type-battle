import net from "node:net";
import { spawn } from "node:child_process";

const DEFAULT_WEB_PORT = 3000;
const DEFAULT_WORKER_PORT = 8787;

function parsePort(value, fallback) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "0.0.0.0", () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port <= 65535; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found from ${startPort}`);
}

const requestedWebPort = parsePort(process.env.PORT, DEFAULT_WEB_PORT);
const requestedWorkerPort = parsePort(
  process.env.CLOUDFLARE_WORKER_PORT,
  DEFAULT_WORKER_PORT,
);
const webPort = await findAvailablePort(requestedWebPort);
const workerPort = await findAvailablePort(requestedWorkerPort);

if (webPort !== requestedWebPort) {
  console.log(`Web port ${requestedWebPort} is busy; using ${webPort}.`);
}
if (workerPort !== requestedWorkerPort) {
  console.log(`Cloudflare Worker port ${requestedWorkerPort} is busy; using ${workerPort}.`);
}

const turboCommand = process.platform === "win32" ? "turbo.cmd" : "turbo";
const child = spawn(turboCommand, ["dev"], {
  env: {
    ...process.env,
    PORT: String(webPort),
    CLOUDFLARE_WORKER_PORT: String(workerPort),
    NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL:
      process.env.NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL ?? `ws://127.0.0.1:${workerPort}`,
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
