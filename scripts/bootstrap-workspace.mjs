#!/usr/bin/env node

import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const args = {
    workspaceId: process.env.AUREL_BOOTSTRAP_WORKSPACE_ID,
    workspaceName: process.env.AUREL_BOOTSTRAP_WORKSPACE_NAME ?? "Production Workspace",
    keyName: process.env.AUREL_BOOTSTRAP_KEY_NAME ?? "Initial admin key",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    const next = argv[i + 1];
    if (value === "--workspace-id" && next) {
      args.workspaceId = next;
      i += 1;
    } else if (value === "--workspace-name" && next) {
      args.workspaceName = next;
      i += 1;
    } else if (value === "--key-name" && next) {
      args.keyName = next;
      i += 1;
    } else if (value === "--help" || value === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${value}`);
    }
  }

  return args;
}

function usage() {
  return `Usage: npm run bootstrap:workspace -- [--workspace-name "Acme Pilot"] [--workspace-id uuid] [--key-name "Initial admin key"]

Required environment:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Recommended environment:
  INTENTGUARD_SECRET

The raw admin API key is printed once. Store it in a secret manager before closing the terminal.`;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function generateApiKey() {
  return `ig_live_${randomBytes(32).toString("hex")}`;
}

function hashApiKey(rawKey, secret = process.env.INTENTGUARD_SECRET) {
  if (secret) return createHmac("sha256", secret).update(rawKey).digest("hex");
  return createHash("sha256").update(rawKey).digest("hex");
}

async function upsertWorkspace(db, { workspaceId, workspaceName }) {
  if (workspaceId) {
    const { data, error } = await db
      .from("workspaces")
      .upsert({ id: workspaceId, name: workspaceName }, { onConflict: "id" })
      .select("id, name")
      .single();
    if (error) throw new Error(`Failed to upsert workspace: ${error.message}`);
    return data;
  }

  const { data, error } = await db.from("workspaces").insert({ name: workspaceName }).select("id, name").single();
  if (error) throw new Error(`Failed to create workspace: ${error.message}`);
  return data;
}

async function createAdminKey(db, { workspaceId, keyName }) {
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const { data, error } = await db
    .from("api_keys")
    .insert({
      workspace_id: workspaceId,
      name: keyName,
      role: "admin",
      key_hash: keyHash,
      is_active: true,
    })
    .select("id, name, role, created_at")
    .single();

  if (error) throw new Error(`Failed to create admin API key: ${error.message}`);
  return { apiKey: data, rawKey };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  if (!process.env.INTENTGUARD_SECRET) {
    console.warn("WARNING: INTENTGUARD_SECRET is not set. The key will use the legacy SHA-256 hash format.");
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const workspace = await upsertWorkspace(db, args);
  const { apiKey, rawKey } = await createAdminKey(db, {
    workspaceId: workspace.id,
    keyName: args.keyName,
  });

  console.log(JSON.stringify(
    {
      workspace,
      api_key: apiKey,
      raw_key: rawKey,
      warning: "The raw_key is shown once. Store it securely now.",
    },
    null,
    2
  ));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
