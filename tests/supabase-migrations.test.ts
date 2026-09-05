import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const script = resolve(process.cwd(), "scripts", "verify-supabase-migrations.mjs");

describe("Supabase migration verifier", () => {
  it("accepts the repository migration history", () => {
    expect(() => execFileSync("node", [script], { cwd: process.cwd(), stdio: "pipe" })).not.toThrow();
  });

  it("ships an intent-bound atomic entitlement reservation function", async () => {
    const sql = await readFile(resolve(process.cwd(), "supabase", "migrations", "011_atomic_entitlements.sql"), "utf8");
    expect(sql).toContain("create table if not exists verification_usage_reservations");
    expect(sql).toContain("create or replace function reserve_workspace_verification");
    expect(sql).toContain("primary key (workspace_id, period_start, intent_id)");
    expect(sql).toContain("for update");
  });

  it("ships idempotent provider billing entitlement persistence", async () => {
    const sql = await readFile(resolve(process.cwd(), "supabase", "migrations", "012_billing_events.sql"), "utf8");
    expect(sql).toContain("create table if not exists billing_events");
    expect(sql).toContain("create or replace function apply_billing_entitlement");
    expect(sql).toContain("on conflict (event_id) do nothing");
    expect(sql).toContain("payload hash mismatch");
    expect(sql).toContain("when p_billing_plan is null then policy->'monthly_verification_limit'");
  });

  it("ships Supabase Auth workspace membership mapping", async () => {
    const migrationsDir = resolve(process.cwd(), "supabase", "migrations");
    const file = (await readdir(migrationsDir)).find((name) => name.endsWith("_workspace_members.sql"));
    expect(file).toBeTruthy();
    const sql = await readFile(resolve(migrationsDir, file!), "utf8");
    expect(sql).toContain("create table if not exists workspace_members");
    expect(sql).toContain("user_id uuid not null references auth.users(id) on delete cascade");
    expect(sql).toContain("unique (workspace_id, user_id)");
    expect(sql).toContain("alter table workspace_members enable row level security");
    expect(sql).toContain("grant select, insert, update, delete on workspace_members to service_role");
  });

  it("rejects gaps in numbered migrations", async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), "aurel-migrations-"));
    const dir = resolve(cwd, "migrations");
    await mkdir(dir);
    await writeFile(resolve(dir, "001_init.sql"), "select 1;");
    await writeFile(resolve(dir, "003_gap.sql"), "select 3;");
    await writeFile(resolve(dir, "20260901102012_signed_mandates.sql"), "select 4;");

    expect(() => execFileSync("node", [script, "--dir", dir], { stdio: "pipe" })).toThrow(/sequence has a gap/);
  });
});
