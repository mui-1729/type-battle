import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(new URL("../scripts/load-baseline.mjs", import.meta.url));

function runLoadScript(env: Record<string, string>) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      CLOUDFLARE_WORKER_URL: "",
      TYPE_BATTLE_LOAD_CONFIRM: "",
      LOAD_ROOMS: "",
      LOAD_TIMEOUT_MS: "",
      LOAD_OUTPUT: "",
      ...env,
    },
  });
}

describe("load baseline safety gates", () => {
  it("refuses to run without an explicit target URL", () => {
    const result = runLoadScript({});

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("CLOUDFLARE_WORKER_URL is required");
  });

  it("refuses to run without ownership confirmation", () => {
    const result = runLoadScript({
      CLOUDFLARE_WORKER_URL: "http://127.0.0.1:8787",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("TYPE_BATTLE_LOAD_CONFIRM=I_OWN_THIS_TARGET");
  });

  it("refuses arbitrary third-party targets before opening sockets", () => {
    const result = runLoadScript({
      CLOUDFLARE_WORKER_URL: "https://example.com",
      TYPE_BATTLE_LOAD_CONFIRM: "I_OWN_THIS_TARGET",
      LOAD_ROOMS: "1",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("limited to localhost or an explicitly owned *.workers.dev Worker");
  });

  it("enforces the hard room cap before opening sockets", () => {
    const result = runLoadScript({
      CLOUDFLARE_WORKER_URL: "http://127.0.0.1:8787",
      TYPE_BATTLE_LOAD_CONFIRM: "I_OWN_THIS_TARGET",
      LOAD_ROOMS: "21",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("LOAD_ROOMS must be an integer between 1 and 20");
  });

  it("does not wait for acknowledgements from fire-and-forget room events", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain('host.send("client:player:ready"');
    expect(source).toContain('guest.send("client:player:ready"');
    expect(source).toContain('host.send("client:typing:progress"');
    expect(source).toContain('guest.send("client:typing:progress"');
    expect(source).not.toContain('command("client:player:ready"');
    expect(source).not.toContain('command("client:typing:progress"');
  });
});
