import { describe, it, expect } from "vitest";
import { routePlainEnglish, extractTableDescription } from "../src/lib/plainEnglishRouter.js";

function intents(instruction: string): string[] {
  return routePlainEnglish(instruction).steps.map((s) => s.intent);
}

describe("routePlainEnglish", () => {
  it("routes 'add supabase to this project' to supabase.prepare", () => {
    expect(intents("add supabase to this project")).toContain("supabase.prepare");
  });
  it("routes supabase auth requests", () => {
    expect(intents("set up supabase auth")).toContain("supabase.setup-auth");
  });
  it("routes env sync to vercel", () => {
    expect(intents("sync my env variables to vercel")).toContain("env.sync-vercel");
  });
  it("routes deployment readiness to doctor + deploy-check", () => {
    const got = intents("check if this app is ready for deployment");
    expect(got).toContain("doctor");
    expect(got).toContain("vercel.deploy-check");
  });
  it("routes create-table and marks it needing detail when vague", () => {
    const res = routePlainEnglish("make a table for saving user progress");
    expect(res.steps[0].intent).toBe("supabase.create-table");
    expect(res.steps[0].clarify).toBeTruthy();
  });
  it("captures a table description when provided", () => {
    const res = routePlainEnglish('create a table lesson_progress with user_id, xp');
    expect(res.steps[0].intent).toBe("supabase.create-table");
    expect(res.steps[0].payload).toContain("user_id");
    expect(res.steps[0].clarify).toBeFalsy();
  });
  it("marks apply-migrations as risky", () => {
    const res = routePlainEnglish("apply migrations to the database");
    expect(res.steps[0].intent).toBe("supabase.apply-migrations");
    expect(res.steps[0].risky).toBe(true);
  });
  it("routes connection status", () => {
    expect(intents("which services are connected")).toContain("connect.status");
  });
  it("returns unmatched for gibberish", () => {
    expect(routePlainEnglish("xyzzy foobar nonsense").matched).toBe(false);
  });
});

describe("extractTableDescription", () => {
  it("pulls a 'with' description", () => {
    expect(extractTableDescription("create a table profiles with username, bio")).toContain("username");
  });
  it("returns undefined when there is no detail", () => {
    expect(extractTableDescription("make a table")).toBeUndefined();
  });
});
