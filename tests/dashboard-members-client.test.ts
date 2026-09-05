import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deactivateWorkspaceMember,
  inviteWorkspaceMember,
  listWorkspaceMembers,
} from "@/lib/dashboard-members";

const mockFetch = vi.fn();

describe("dashboard members client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists workspace members with the workspace API key headers", async () => {
    const members = [{ user_id: "00000000-0000-0000-0000-000000000011", role: "operator", is_active: true }];
    mockFetch.mockResolvedValueOnce(Response.json({ members }));

    await expect(listWorkspaceMembers("ig_live_test")).resolves.toEqual(members);

    expect(mockFetch).toHaveBeenCalledWith("/api/workspace/members", {
      headers: { "x-api-key": "ig_live_test" },
    });
  });

  it("invites a dashboard member by email and role", async () => {
    const member = { user_id: "00000000-0000-0000-0000-000000000011", role: "admin", is_active: true };
    mockFetch.mockResolvedValueOnce(Response.json({ member }, { status: 201 }));

    await expect(inviteWorkspaceMember("ig_live_test", {
      email: "ops@example.com",
      role: "admin",
    })).resolves.toEqual(member);

    expect(mockFetch).toHaveBeenCalledWith("/api/workspace/members", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "ig_live_test" },
      body: JSON.stringify({ email: "ops@example.com", role: "admin" }),
    });
  });

  it("deactivates a dashboard member by Supabase user id", async () => {
    mockFetch.mockResolvedValueOnce(Response.json({ success: true }));

    await expect(deactivateWorkspaceMember("ig_live_test", "00000000-0000-0000-0000-000000000011")).resolves.toEqual({
      success: true,
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/workspace/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-api-key": "ig_live_test" },
      body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000011" }),
    });
  });

  it("surfaces API errors for operator feedback", async () => {
    mockFetch.mockResolvedValueOnce(Response.json({ error: "Admin role required" }, { status: 403 }));

    await expect(listWorkspaceMembers("ig_live_test")).rejects.toThrow("Admin role required");
  });
});
