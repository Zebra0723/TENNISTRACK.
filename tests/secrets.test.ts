import { describe, it, expect } from "vitest";
import {
  isPublicName,
  looksPrivate,
  isDangerousPublicSecret,
  maskValue,
  redact,
} from "../src/lib/secrets.js";

describe("public/private name detection", () => {
  it("detects public prefixes", () => {
    expect(isPublicName("NEXT_PUBLIC_SUPABASE_URL")).toBe(true);
    expect(isPublicName("VITE_API_URL")).toBe(true);
    expect(isPublicName("DATABASE_URL")).toBe(false);
  });
  it("detects private-looking names", () => {
    expect(looksPrivate("SUPABASE_SERVICE_ROLE_KEY")).toBe(true);
    expect(looksPrivate("STRIPE_SECRET_KEY")).toBe(true);
    expect(looksPrivate("NEXT_PUBLIC_SUPABASE_URL")).toBe(false);
  });
  it("flags dangerous public secrets", () => {
    // A private secret wearing a public prefix -> would leak to the browser.
    expect(isDangerousPublicSecret("NEXT_PUBLIC_SERVICE_ROLE_KEY")).toBe(true);
    expect(isDangerousPublicSecret("NEXT_PUBLIC_STRIPE_SECRET")).toBe(true);
    expect(isDangerousPublicSecret("NEXT_PUBLIC_SUPABASE_URL")).toBe(false);
    expect(isDangerousPublicSecret("SUPABASE_SERVICE_ROLE_KEY")).toBe(false);
  });
});

describe("masking", () => {
  it("never reveals the value, only length", () => {
    const masked = maskValue("sk_live_supersecret");
    expect(masked).not.toContain("supersecret");
    expect(masked).toContain("19 chars");
  });
  it("handles empty", () => {
    expect(maskValue("")).toBe("(empty)");
  });
  it("redacts occurrences in arbitrary text", () => {
    const out = redact("token=abcd1234 and again abcd1234", ["abcd1234"]);
    expect(out).not.toContain("abcd1234");
    expect(out).toContain("[redacted]");
  });
  it("does not redact very short strings", () => {
    expect(redact("hi ab", ["ab"])).toBe("hi ab");
  });
});
