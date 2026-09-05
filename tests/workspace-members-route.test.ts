import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
  requireRole: mocks.requireRole,
}));

import { DELETE, GET, POST } from "@/app/api/v1/workspace/members/route";

function request(method: string, body?: unknown): NextRequest {
  return new Request("http://localhost/api/v1/workspace/members", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("workspace members route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockReturnValue(null);
  });

  it("lists workspace members for admins", async () => {
    const members = [{ user_id: "00000000-0000-0000-0000-000000000011", role: "operator", is_active: true }];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn().mockResolvedValue({ data: members, error: null }),
    };
    const db = { from: vi.fn(() => query) };
    mocks.authenticateRequest.mockResolvedValue({ db, workspace_id: "00000000-0000-0000-0000-000000000001", role: "admin" });

    const response = await GET(request("GET"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ members });
    expect(db.from).toHaveBeenCalledWith("workspace_members");
  });

  it("invites a Supabase Auth user and links the user to the current workspace", async () => {
    const inserted = { user_id: "00000000-0000-0000-0000-000000000011", role: "admin", is_active: true };
    const mutation = {
      upsert: vi.fn(() => mutation),
      select: vi.fn(() => mutation),
      single: vi.fn().mockResolvedValue({ data: inserted, error: null }),
    };
    const db = {
      auth: {
        admin: {
          inviteUserByEmail: vi.fn().mockResolvedValue({ data: { user: { id: "00000000-0000-0000-0000-000000000011" } }, error: null }),
        },
      },
      from: vi.fn(() => mutation),
    };
    mocks.authenticateRequest.mockResolvedValue({ db, workspace_id: "00000000-0000-0000-0000-000000000001", role: "admin" });

    const response = await POST(request("POST", { email: "ops@example.com", role: "admin" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ member: inserted });
    expect(db.auth.admin.inviteUserByEmail).toHaveBeenCalledWith("ops@example.com", {
      redirectTo: "http://localhost/auth/callback",
    });
    expect(mutation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: "00000000-0000-0000-0000-000000000001",
      user_id: "00000000-0000-0000-0000-000000000011",
      role: "admin",
      is_active: true,
    }), { onConflict: "workspace_id,user_id" });
  });

  it("does not allow Supabase Auth members to remove their own dashboard access", async () => {
    const db = { from: vi.fn() };
    mocks.authenticateRequest.mockResolvedValue({
      db,
      workspace_id: "00000000-0000-0000-0000-000000000001",
      role: "admin",
      supabase_user_id: "00000000-0000-0000-0000-000000000011",
    });

    const response = await DELETE(request("DELETE", { user_id: "00000000-0000-0000-0000-000000000011" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Cannot remove the dashboard user used for this request" });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("does not allow Supabase Auth members to downgrade their own dashboard role", async () => {
    const db = { from: vi.fn() };
    mocks.authenticateRequest.mockResolvedValue({
      db,
      workspace_id: "00000000-0000-0000-0000-000000000001",
      role: "admin",
      supabase_user_id: "00000000-0000-0000-0000-000000000011",
    });

    const response = await POST(request("POST", {
      user_id: "00000000-0000-0000-0000-000000000011",
      role: "viewer",
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Cannot change the dashboard role used for this request" });
    expect(db.from).not.toHaveBeenCalled();
  });
});
