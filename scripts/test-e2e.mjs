import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("npm_execpath is unavailable. Run E2E through `npm run test:e2e`.");
}
const realtimeUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL ?? "ws://127.0.0.1:8787";
const environment = {
  ...process.env,
  NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL: realtimeUrl
};

await run(process.execPath, [npmCli, "run", "build"]);
await run(process.execPath, [
  path.join(repositoryRoot, "node_modules", "@playwright", "test", "cli.js"),
  "test",
  ...process.argv.slice(2)
]);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit"
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(
        signal
          ? `${command} was terminated by ${signal}.`
          : `${command} exited with code ${code ?? "unknown"}.`
      ));
    });
  });
}
