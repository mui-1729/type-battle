import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const smokeScript = join(process.cwd(), "scripts/smoke-worker.mjs");
let server: ReturnType<typeof createServer> | undefined;

afterEach(async () => {
  if (server?.listening) {
    server.close();
    await once(server, "close");
  }
  server = undefined;
});

describe("worker smoke health probe", () => {
  it("uses a unique cache-busting query and no-cache request directives", async () => {
    let receivedUrl = "";
    let receivedCacheControl = "";
    let receivedPragma = "";
    server = createServer((request, response) => {
      receivedUrl = request.url ?? "";
      receivedCacheControl = request.headers["cache-control"] ?? "";
      receivedPragma = request.headers.pragma ?? "";
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, commitSha: "stale-commit" }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Smoke test server did not expose a TCP port.");
    }

    const child = spawn(process.execPath, [smokeScript], {
      env: {
        ...process.env,
        CLOUDFLARE_WORKER_URL: `http://127.0.0.1:${address.port}`,
        COMMIT_SHA: "expected-commit"
      },
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const [exitCode] = await once(child, "exit") as [number];

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Deployed commit mismatch");
    const probeUrl = new URL(receivedUrl, "http://localhost");
    expect(probeUrl.pathname).toBe("/health");
    expect(probeUrl.searchParams.get("probe")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(receivedCacheControl).toContain("no-cache");
    expect(receivedPragma).toBe("no-cache");
  });
});
