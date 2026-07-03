// Turn a plain-English table description into a safe CREATE TABLE migration.
// Design goals: deterministic, non-destructive, sensible type inference.

export interface Column {
  name: string;
  type: string;
}

export interface ParsedTable {
  tableName: string;
  columns: Column[];
  // True when we could not confidently find a table name or any columns.
  vague: boolean;
  reason?: string;
}

// Pad a number to 2 digits.
function p2(n: number): string {
  return n.toString().padStart(2, "0");
}

// Format a Date as a 14-digit timestamp: YYYYMMDDHHMMSS (Supabase convention).
export function formatTimestamp(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    p2(date.getUTCMonth() + 1) +
    p2(date.getUTCDate()) +
    p2(date.getUTCHours()) +
    p2(date.getUTCMinutes()) +
    p2(date.getUTCSeconds())
  );
}

// Sanitize an identifier to a safe snake_case SQL name.
export function sanitizeIdentifier(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  return cleaned;
}

// Build the migration filename for a table + timestamp.
export function migrationFilename(tableName: string, date: Date): string {
  const safe = sanitizeIdentifier(tableName) || "table";
  return `${formatTimestamp(date)}_create_${safe}.sql`;
}

// Map a user-provided or inferred type word to a Postgres type.
function normalizeType(word: string): string | null {
  const t = word.toLowerCase();
  const map: Record<string, string> = {
    text: "text",
    string: "text",
    varchar: "text",
    uuid: "uuid",
    int: "integer",
    integer: "integer",
    bigint: "bigint",
    serial: "bigint",
    number: "numeric",
    numeric: "numeric",
    float: "double precision",
    double: "double precision",
    bool: "boolean",
    boolean: "boolean",
    json: "jsonb",
    jsonb: "jsonb",
    date: "date",
    timestamp: "timestamptz",
    timestamptz: "timestamptz",
    datetime: "timestamptz",
  };
  return map[t] ?? null;
}

// Infer a type from a column name when the user did not give one.
function inferTypeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n === "id") return "uuid";
  if (n.endsWith("_id") || n === "user_id") return "uuid";
  if (n === "created_at" || n === "updated_at" || n.endsWith("_at")) return "timestamptz";
  if (n.startsWith("is_") || n.startsWith("has_") || n === "completed" || n === "done" || n === "active") {
    return "boolean";
  }
  if (n === "xp" || n === "count" || n === "quantity" || n === "qty" || n.endsWith("_count")) return "integer";
  if (n === "amount" || n === "price" || n === "total") return "numeric";
  if (n === "email") return "text";
  if (n === "metadata" || n === "data" || n === "settings") return "jsonb";
  return "text";
}

// Parse "profiles: id uuid, username text" or "lesson_progress with user_id, xp".
export function parseTableDescription(description: string): ParsedTable {
  const desc = description.trim();
  if (!desc) return { tableName: "", columns: [], vague: true, reason: "empty description" };

  let namePart = "";
  let columnPart = "";

  if (desc.includes(":")) {
    const idx = desc.indexOf(":");
    namePart = desc.slice(0, idx);
    columnPart = desc.slice(idx + 1);
  } else {
    const withMatch = desc.match(/^(.*?)\b(?:with|having|containing|:|-)\b(.*)$/i);
    if (withMatch) {
      namePart = withMatch[1];
      columnPart = withMatch[2];
    } else {
      // Try "create <name> table" / "<name> table"
      const tableMatch = desc.match(/([a-z0-9_]+)\s+table/i) || desc.match(/table\s+(?:called|named)\s+([a-z0-9_]+)/i);
      namePart = tableMatch ? tableMatch[1] : desc.split(/\s+/)[0];
      columnPart = "";
    }
  }

  // The table name is the last identifier-ish word in namePart (handles
  // "a table called profiles" -> "profiles").
  const nameTokens = namePart.trim().split(/\s+/).filter(Boolean);
  const rawName = nameTokens.length ? nameTokens[nameTokens.length - 1] : "";
  const tableName = sanitizeIdentifier(rawName);

  const columns: Column[] = [];
  if (columnPart.trim()) {
    for (const chunk of columnPart.split(/[,;]/)) {
      const tokens = chunk.trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) continue;
      const colName = sanitizeIdentifier(tokens[0]);
      if (!colName || colName === "and") continue;
      let type: string | null = null;
      if (tokens.length > 1) {
        type = normalizeType(tokens[1]);
      }
      if (!type) type = inferTypeFromName(colName);
      // Skip reserved auto columns; we add them ourselves.
      if (colName === "id" || colName === "created_at" || colName === "updated_at") continue;
      if (!columns.some((c) => c.name === colName)) columns.push({ name: colName, type });
    }
  }

  const vague = !tableName || columns.length === 0;
  const reason = !tableName
    ? "could not determine a table name"
    : columns.length === 0
      ? "no columns were described"
      : undefined;

  return { tableName, columns, vague, reason };
}

// Generate the SQL for a parsed table. Always includes id (uuid PK),
// created_at, and updated_at. Never emits destructive statements.
export function generateCreateTableSql(parsed: ParsedTable): string {
  const { tableName, columns } = parsed;
  const lines: string[] = [];
  lines.push(`-- Migration: create the "${tableName}" table`);
  lines.push(`-- Generated by setup-agent. Review before applying.`);
  lines.push(`-- This migration is additive only (no DROP / DELETE statements).`);
  lines.push("");
  lines.push(`create table if not exists public.${tableName} (`);

  const colLines: string[] = [];
  colLines.push(`  id uuid primary key default gen_random_uuid()`);
  for (const c of columns) {
    colLines.push(`  ${c.name} ${c.type}`);
  }
  colLines.push(`  created_at timestamptz not null default now()`);
  colLines.push(`  updated_at timestamptz not null default now()`);
  lines.push(colLines.join(",\n"));
  lines.push(`);`);
  lines.push("");
  lines.push(`-- Keep updated_at fresh on every update.`);
  lines.push(`create or replace function public.set_updated_at()`);
  lines.push(`returns trigger as $$`);
  lines.push(`begin`);
  lines.push(`  new.updated_at = now();`);
  lines.push(`  return new;`);
  lines.push(`end;`);
  lines.push(`$$ language plpgsql;`);
  lines.push("");
  lines.push(`drop trigger if exists set_${tableName}_updated_at on public.${tableName};`);
  lines.push(`create trigger set_${tableName}_updated_at`);
  lines.push(`  before update on public.${tableName}`);
  lines.push(`  for each row execute function public.set_updated_at();`);
  lines.push("");
  return lines.join("\n");
}
