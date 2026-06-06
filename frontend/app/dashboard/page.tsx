"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getMe,
  logout,
  listRootFolders,
  createFolder,
  renameFolder,
  deleteFolder,
} from "@/app/lib/api";
import type { User, FolderResponse } from "@/app/types";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<FolderResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  const [showRename, setShowRename] = useState<FolderResponse | null>(null);
  const [renameName, setRenameName] = useState("");

  const [showDelete, setShowDelete] = useState<FolderResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{
    folder: FolderResponse;
    x: number;
    y: number;
  } | null>(null);

  const [error, setError] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const me = await getMe();
        if (!me.repository_name) {
          router.replace("/setup");
          return;
        }
        setUser(me);
        const f = await listRootFolders();
        setFolders(f);
      } catch {
        router.replace("/");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setCtxMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  async function handleCreate() {
    if (!newFolderName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const f = await createFolder(newFolderName.trim());
      setFolders((prev) => [...prev, f].sort((a, b) => a.name.localeCompare(b.name)));
      setShowCreate(false);
      setNewFolderName("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename() {
    if (!showRename || !renameName.trim()) return;
    try {
      const updated = await renameFolder(showRename.id, renameName.trim());
      setFolders((prev) =>
        prev.map((f) => (f.id === updated.id ? updated : f))
      );
      setShowRename(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleDelete() {
    if (!showDelete) return;
    setDeleting(true);
    try {
      await deleteFolder(showDelete.id);
      setFolders((prev) => prev.filter((f) => f.id !== showDelete.id));
      setShowDelete(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "rgba(10,10,15,0.8)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 40,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onClick={() => router.push("/dashboard")}
        >
          <span style={{ fontSize: 24 }}>☁️</span>
          <span className="gradient-text" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            CloudGallery
          </span>
        </div>

        {/* Navigation Links */}
        <div style={{ display: "flex", gap: 16, marginLeft: 20 }}>
          <span
            style={{ cursor: "pointer", color: "var(--text-primary)", fontSize: "0.85rem", fontWeight: 600 }}
            onClick={() => router.push("/dashboard")}
          >
            📁 Folders
          </span>
          <span
            style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 500 }}
            onClick={() => router.push("/search")}
          >
            🔍 Search
          </span>
          <span
            style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 500 }}
            onClick={() => router.push("/trash")}
          >
            🗑️ Trash
          </span>
          <span
            style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 500 }}
            onClick={() => router.push("/activity")}
          >
            📜 Activity
          </span>
        </div>

        {user?.repository_name && (
          <span
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              background: "rgba(255,255,255,0.04)",
              padding: "4px 10px",
              borderRadius: 99,
              border: "1px solid var(--border-subtle)",
            }}
          >
            📦 {user.repository_owner}/{user.repository_name}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {user?.avatar_url && (
            <img
              src={user.avatar_url}
              alt=""
              style={{ width: 30, height: 30, borderRadius: "50%" }}
            />
          )}
          <button
            onClick={handleLogout}
            style={{
              background: "none",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
              padding: "6px 14px",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "0.8rem",
              transition: "all 0.2s ease",
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, padding: "32px 24px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        {/* Title bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>My Gallery</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 4 }}>
              {folders.length} folder{folders.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => setShowCreate(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Folder
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: "var(--radius-md)",
              color: "var(--danger)",
              fontSize: "0.85rem",
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {/* Folder grid */}
        {folders.length === 0 ? (
          <div
            className="animate-fade-in"
            style={{
              textAlign: "center",
              padding: "80px 20px",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>📁</div>
            <p style={{ fontSize: "1.1rem", marginBottom: 8 }}>No folders yet</p>
            <p style={{ fontSize: "0.85rem" }}>
              Create your first folder to start organizing your photos
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 16,
            }}
          >
            {folders.map((folder, i) => (
              <div
                key={folder.id}
                className="glass-card animate-fade-in"
                style={{
                  padding: "20px",
                  cursor: "pointer",
                  animationDelay: `${i * 0.05}s`,
                  animationFillMode: "both",
                  position: "relative",
                }}
                onClick={() => router.push(`/folder/${folder.id}`)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCtxMenu({ folder, x: e.clientX, y: e.clientY });
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "0.95rem",
                    marginBottom: 6,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {folder.name}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    display: "flex",
                    gap: 12,
                  }}
                >
                  <span>{folder.subfolder_count} folders</span>
                  <span>{folder.image_count} files</span>
                </div>

                {/* Three-dot menu button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCtxMenu({ folder, x: e.clientX, y: e.clientY });
                  }}
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 18,
                    padding: "4px 6px",
                    borderRadius: "var(--radius-sm)",
                    lineHeight: 1,
                  }}
                >
                  ⋮
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className="context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y, position: "fixed" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setShowRename(ctxMenu.folder);
              setRenameName(ctxMenu.folder.name);
              setCtxMenu(null);
            }}
          >
            ✏️ Rename
          </button>
          <button
            className="danger"
            onClick={() => {
              setShowDelete(ctxMenu.folder);
              setCtxMenu(null);
            }}
          >
            🗑️ Delete
          </button>
        </div>
      )}

      {/* Create folder modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 20 }}>
              Create New Folder
            </h2>
            <input
              className="input-field"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
              style={{ marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                className="btn-secondary"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={creating || !newFolderName.trim()}
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename modal */}
      {showRename && (
        <div className="modal-overlay" onClick={() => setShowRename(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 20 }}>
              Rename Folder
            </h2>
            <input
              className="input-field"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
              style={{ marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                className="btn-secondary"
                onClick={() => setShowRename(null)}
              >
                Cancel
              </button>
              <button className="btn-primary" onClick={handleRename}>
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDelete && (
        <div className="modal-overlay" onClick={() => setShowDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 12 }}>
              Delete Folder
            </h2>
            <p
              style={{
                color: "var(--text-secondary)",
                marginBottom: 24,
                fontSize: "0.9rem",
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to delete{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {showDelete.name}
              </strong>
              ? This will permanently delete the folder and all its contents from
              GitHub.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                className="btn-secondary"
                onClick={() => setShowDelete(null)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
