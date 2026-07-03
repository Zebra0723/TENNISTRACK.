import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// config.ts operates relative to process.cwd(), so we run each test in a temp dir.
let tmp: string;
let original: string;

beforeEach(() => {
  original = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "setup-agent-test-"));
  process.chdir(tmp);
});

afterEach(() => {
  process.chdir(original);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("config loading", () => {
  it("returns defaults when no config exists", async () => {
    const { loadConfig } = await import("../src/lib/config.js");
    const cfg = loadConfig();
    expect(cfg.version).toBe(1);
  });

  it("saves and reloads non-secret metadata", async () => {
    const { saveConfig, loadConfig } = await import("../src/lib/config.js");
    saveConfig({ version: 1, projectName: "demo", framework: "next" });
    const cfg = loadConfig();
    expect(cfg.projectName).toBe("demo");
    expect(cfg.framework).toBe("next");
    // config file physically exists under .setup-agent
    expect(fs.existsSync(path.join(tmp, ".setup-agent", "config.json"))).toBe(true);
  });

  it("scrubs accidentally-secret-looking string fields", async () => {
    const { saveConfig } = await import("../src/lib/config.js");
    // @ts-expect-error intentionally passing an off-schema secret-looking field
    saveConfig({ version: 1, projectName: "demo", GITHUB_TOKEN: "ghp_realsecret" });
    const raw = fs.readFileSync(path.join(tmp, ".setup-agent", "config.json"), "utf8");
    expect(raw).not.toContain("ghp_realsecret");
    expect(raw).not.toContain("GITHUB_TOKEN");
  });

  it("recovers from a corrupt config file", async () => {
    fs.mkdirSync(path.join(tmp, ".setup-agent"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".setup-agent", "config.json"), "{ not json");
    const { loadConfig } = await import("../src/lib/config.js");
    expect(loadConfig().version).toBe(1);
  });
});
