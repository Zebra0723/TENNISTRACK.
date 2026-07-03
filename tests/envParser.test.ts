import { describe, it, expect } from "vitest";
import {
  parseEnvLine,
  parseEnvFile,
  envKeys,
  serializeEnvValue,
  upsertEnvLine,
} from "../src/lib/envParser.js";

describe("parseEnvLine", () => {
  it("parses a simple assignment", () => {
    expect(parseEnvLine("KEY=value")).toEqual({ key: "KEY", value: "value" });
  });
  it("keeps '=' inside values", () => {
    expect(parseEnvLine("URL=postgres://a:b@h/db?x=1")).toEqual({
      key: "URL",
      value: "postgres://a:b@h/db?x=1",
    });
  });
  it("strips surrounding quotes", () => {
    expect(parseEnvLine('NAME="hello world"')).toEqual({ key: "NAME", value: "hello world" });
    expect(parseEnvLine("NAME='hi'")).toEqual({ key: "NAME", value: "hi" });
  });
  it("supports an export prefix", () => {
    expect(parseEnvLine("export TOKEN=abc")).toEqual({ key: "TOKEN", value: "abc" });
  });
  it("ignores comments and blanks", () => {
    expect(parseEnvLine("# a comment")).toBeNull();
    expect(parseEnvLine("   ")).toBeNull();
    expect(parseEnvLine("")).toBeNull();
  });
  it("rejects malformed keys", () => {
    expect(parseEnvLine("=nope")).toBeNull();
    expect(parseEnvLine("1BAD=nope")).toBeNull();
    expect(parseEnvLine("no-equals-here")).toBeNull();
  });
});

describe("parseEnvFile", () => {
  it("parses multiple lines, last duplicate wins", () => {
    const out = parseEnvFile("A=1\n# c\nB=2\nA=3\n");
    expect(out).toEqual([
      { key: "A", value: "3" },
      { key: "B", value: "2" },
    ]);
  });
  it("returns keys via envKeys", () => {
    expect(envKeys("A=1\nB=2\n")).toEqual(["A", "B"]);
  });
});

describe("serializeEnvValue", () => {
  it("leaves simple values unquoted", () => {
    expect(serializeEnvValue("abc123")).toBe("abc123");
  });
  it("quotes values with spaces or specials", () => {
    expect(serializeEnvValue("hello world")).toBe('"hello world"');
    expect(serializeEnvValue('a"b')).toBe('"a\\"b"');
  });
  it("empty stays empty", () => {
    expect(serializeEnvValue("")).toBe("");
  });
});

describe("upsertEnvLine", () => {
  it("adds a new key", () => {
    expect(upsertEnvLine("", "A", "1")).toBe("A=1\n");
  });
  it("replaces an existing key in place", () => {
    expect(upsertEnvLine("A=1\nB=2\n", "A", "9")).toBe("A=9\nB=2\n");
  });
  it("writes an empty placeholder", () => {
    expect(upsertEnvLine("", "SECRET", "")).toBe("SECRET=\n");
  });
});
