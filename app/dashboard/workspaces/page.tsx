"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/app/components/Sidebar";
import { Building2 } from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  created_at: string;
  api_keys_count: number;
  verify_count: number;
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([
    {
      id: "1",
      name: "Production",
      created_at: "2026-01-15T10:30:00Z",
      api_keys_count: 3,
      verify_count: 15420,
    },
    {
      id: "2",
      name: "Development",
      created_at: "2026-02-01T14:20:00Z",
      api_keys_count: 5,
      verify_count: 8932,
    },
  ]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  const handleCreateWorkspace = () => {
    if (!newWorkspaceName.trim()) return;

    const newWorkspace: Workspace = {
      id: Date.now().toString(),
      name: newWorkspaceName,
      created_at: new Date().toISOString(),
      api_keys_count: 0,
      verify_count: 0,
    };

    setWorkspaces([...workspaces, newWorkspace]);
    setNewWorkspaceName("");
    setShowCreateModal(false);
  };

  return (
    <div className="flex min-h-screen bg-[#09090e]">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Workspaces</h1>
              <p className="text-zinc-400">Manage your workspaces and their configurations</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + New Workspace
            </button>
          </div>

          {/* Workspaces Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.id}
                href={`/dashboard/workspaces/${workspace.id}`}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-violet-500/50 transition-colors group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-violet-600/20 rounded-lg flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-violet-400" />
                  </div>
                  <span className="text-xs text-zinc-500">
                    {new Date(workspace.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-violet-400 transition-colors">
                  {workspace.name}
                </h3>
                <div className="space-y-2 text-sm text-zinc-400">
                  <div className="flex justify-between">
                    <span>API Keys</span>
                    <span className="text-zinc-300">{workspace.api_keys_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Verifications</span>
                    <span className="text-zinc-300">{workspace.verify_count.toLocaleString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Create Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md">
                <h2 className="text-xl font-semibold text-white mb-4">Create New Workspace</h2>
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="Workspace name"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 mb-4"
                  autoFocus
                />
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewWorkspaceName("");
                    }}
                    className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateWorkspace}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
