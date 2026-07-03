// Secret handling helpers: masking and dangerous-name detection.
// Golden rule: real secret values must never be printed in full.

// Env var name prefixes/patterns that indicate a value is meant to be PUBLIC
// (safe to expose in browser bundles).
const PUBLIC_PREFIXES = ["NEXT_PUBLIC_", "VITE_", "PUBLIC_", "REACT_APP_", "EXPO_PUBLIC_", "NUXT_PUBLIC_"];

// Substrings that strongly suggest a value is a PRIVATE secret.
const PRIVATE_HINTS = [
  "SECRET",
  "SERVICE_ROLE",
  "PRIVATE",
  "TOKEN",
  "PASSWORD",
  "API_KEY",
  "APIKEY",
  "CLIENT_SECRET",
  "ACCESS_KEY",
  "DB_URL",
  "DATABASE_URL",
  "STRIPE_SECRET",
];

export function isPublicName(key: string): boolean {
  return PUBLIC_PREFIXES.some((p) => key.startsWith(p));
}

export function looksPrivate(key: string): boolean {
  const upper = key.toUpperCase();
  return PRIVATE_HINTS.some((h) => upper.includes(h));
}

// A "dangerous" name is a value that is almost certainly a private secret but is
// named with a PUBLIC prefix — meaning it would be shipped to the browser.
export function isDangerousPublicSecret(key: string): boolean {
  return isPublicName(key) && looksPrivate(key);
}

// Mask a secret value for display. Shows length only, never the content.
// e.g. "sk_live_abcd1234" -> "••••••• (17 chars)"
export function maskValue(value: string): string {
  if (value === "") return "(empty)";
  return `••••••• (${value.length} chars)`;
}

// Replace any occurrence of the given secret values inside an arbitrary string
// (e.g. captured CLI output) so nothing leaks into logs.
export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 4) {
      out = out.split(s).join("•••[redacted]•••");
    }
  }
  return out;
}
