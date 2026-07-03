import { describe, it, expect } from "vitest";
import {
  formatTimestamp,
  sanitizeIdentifier,
  migrationFilename,
  parseTableDescription,
  generateCreateTableSql,
} from "../src/lib/migrationGenerator.js";

describe("formatTimestamp", () => {
  it("formats a UTC date as 14 digits", () => {
    const d = new Date(Date.UTC(2025, 0, 2, 3, 4, 5)); // 2025-01-02 03:04:05
    expect(formatTimestamp(d)).toBe("20250102030405");
  });
});

describe("sanitizeIdentifier", () => {
  it("snake-cases and strips junk", () => {
    expect(sanitizeIdentifier("Lesson Progress")).toBe("lesson_progress");
    expect(sanitizeIdentifier("  weird--name!! ")).toBe("weird_name");
  });
});

describe("migrationFilename", () => {
  it("builds a timestamped create filename", () => {
    const d = new Date(Date.UTC(2025, 5, 7, 8, 9, 10));
    expect(migrationFilename("profiles", d)).toBe("20250607080910_create_profiles.sql");
  });
  it("sanitizes the table name in the filename", () => {
    const d = new Date(Date.UTC(2025, 5, 7, 8, 9, 10));
    expect(migrationFilename("Lesson Progress", d)).toBe("20250607080910_create_lesson_progress.sql");
  });
});

describe("parseTableDescription", () => {
  it("parses 'name: col type' form", () => {
    const p = parseTableDescription("profiles: username text, bio text");
    expect(p.tableName).toBe("profiles");
    expect(p.vague).toBe(false);
    expect(p.columns.map((c) => c.name)).toEqual(["username", "bio"]);
    expect(p.columns[0].type).toBe("text");
  });
  it("parses 'name with cols' and infers types", () => {
    const p = parseTableDescription("lesson_progress with user_id, lesson_id, completed, xp, updated_at");
    expect(p.tableName).toBe("lesson_progress");
    const byName = Object.fromEntries(p.columns.map((c) => [c.name, c.type]));
    expect(byName["user_id"]).toBe("uuid");
    expect(byName["completed"]).toBe("boolean");
    expect(byName["xp"]).toBe("integer");
    // updated_at is a reserved auto column and should be dropped from the list.
    expect(p.columns.some((c) => c.name === "updated_at")).toBe(false);
  });
  it("flags vague descriptions", () => {
    expect(parseTableDescription("").vague).toBe(true);
    expect(parseTableDescription("a table for stuff").vague).toBe(true);
  });
});

describe("generateCreateTableSql", () => {
  it("is additive and includes id/created_at/updated_at", () => {
    const p = parseTableDescription("profiles: username text");
    const sql = generateCreateTableSql(p);
    expect(sql).toContain("create table if not exists public.profiles");
    expect(sql).toContain("id uuid primary key default gen_random_uuid()");
    expect(sql).toContain("created_at timestamptz");
    expect(sql).toContain("updated_at timestamptz");
    expect(sql).toContain("username text");
    // Never destructive.
    expect(sql.toLowerCase()).not.toContain("drop table");
    expect(sql.toLowerCase()).not.toContain("delete from");
  });
});
