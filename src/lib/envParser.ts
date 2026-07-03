// Parse and serialize .env-style files. Deliberately small and predictable.

import type { ParsedEnvVar } from "../types.js";

// Parse a single "KEY=value" assignment. Returns null if it is not an assignment
// (blank line, comment, or malformed). Surrounding quotes on the value are
// stripped. Values may contain "=" characters.
export function parseEnvLine(line: string): ParsedEnvVar | null {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return null;

  // Support an optional "export " prefix.
  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;

  const eq = withoutExport.indexOf("=");
  if (eq <= 0) return null;

  const key = withoutExport.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = withoutExport.slice(eq + 1).trim();
  // Strip a single pair of matching surrounding quotes.
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

// Parse the full contents of an env file / pasted block into KEY=value pairs.
// Later duplicates win (same as dotenv/shell behavior).
export function parseEnvFile(contents: string): ParsedEnvVar[] {
  const map = new Map<string, string>();
  for (const line of contents.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed) map.set(parsed.key, parsed.value);
  }
  return Array.from(map, ([key, value]) => ({ key, value }));
}

// Get just the KEY names present in an env file's contents.
export function envKeys(contents: string): string[] {
  return parseEnvFile(contents).map((v) => v.key);
}

// Serialize a value for writing into a .env file, quoting when needed.
export function serializeEnvValue(value: string): string {
  if (value === "") return "";
  // Quote if it contains whitespace, quotes, or shell-sensitive characters.
  if (/[\s"'#$`\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

// Given existing file contents and a KEY/value, return updated contents with the
// key added or replaced in place. Preserves other lines and comments.
export function upsertEnvLine(contents: string, key: string, value: string): string {
  const serialized = `${key}=${serializeEnvValue(value)}`;
  const lines = contents.length ? contents.split(/\r?\n/) : [];
  let replaced = false;
  const out = lines.map((line) => {
    const parsed = parseEnvLine(line);
    if (parsed && parsed.key === key) {
      replaced = true;
      return serialized;
    }
    return line;
  });
  // Drop trailing empty lines (the split of a trailing "\n" leaves one).
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  if (!replaced) out.push(serialized);
  return out.join("\n") + "\n";
}
