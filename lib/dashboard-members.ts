import { apiKeyHeaders } from "@/app/dashboard/api-key";

export type DashboardMemberRole = "admin" | "operator" | "viewer";

export interface DashboardMember {
  id?: string;
  workspace_id?: string;
  user_id: string;
  role: DashboardMemberRole;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface MembersResponse {
  members?: DashboardMember[];
  error?: string;
}

interface MemberResponse {
  member?: DashboardMember;
  error?: string;
}

interface DeactivateResponse {
  success?: boolean;
  error?: string;
}

export interface InviteWorkspaceMemberInput {
  email?: string;
  user_id?: string;
  role: DashboardMemberRole;
}

const readJson = async <T>(response: Response): Promise<T & { error?: string }> => {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
};

const throwIfFailed = (response: Response, body: { error?: string }, fallback: string): void => {
  if (!response.ok) {
    throw new Error(body.error ?? fallback);
  }
};

export const listWorkspaceMembers = async (apiKey: string): Promise<DashboardMember[]> => {
  const response = await fetch("/api/workspace/members", {
    headers: apiKeyHeaders(apiKey),
  });
  const body = await readJson<MembersResponse>(response);
  throwIfFailed(response, body, "Failed to load workspace members");
  return body.members ?? [];
};

export const inviteWorkspaceMember = async (
  apiKey: string,
  input: InviteWorkspaceMemberInput,
): Promise<DashboardMember> => {
  const response = await fetch("/api/workspace/members", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
    body: JSON.stringify(input),
  });
  const body = await readJson<MemberResponse>(response);
  throwIfFailed(response, body, "Failed to invite workspace member");
  if (!body.member) throw new Error("Workspace member response was empty");
  return body.member;
};

export const deactivateWorkspaceMember = async (
  apiKey: string,
  userId: string,
): Promise<{ success: boolean }> => {
  const response = await fetch("/api/workspace/members", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = await readJson<DeactivateResponse>(response);
  throwIfFailed(response, body, "Failed to deactivate workspace member");
  return { success: body.success === true };
};
