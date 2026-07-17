import { spawn } from "node:child_process";

const port = process.env.CLOUDFLARE_WORKER_PORT ?? "8787";
const wranglerCommand = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
const child = spawn(wranglerCommand, ["dev", "--local", "--port", port], {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
