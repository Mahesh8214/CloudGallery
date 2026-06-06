"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getMe,
  logout,
  listTrash,
  restoreTrashItem,
  emptyTrash,
  deleteTrashItemPermanently,
  getImageViewUrl,
  getThumbnailUrl,
} from "@/app/lib/api";
import type { User, FolderResponse, ImageResponse } from "@/app/types";

export default function TrashPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<FolderResponse[]>([]);
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const me = await getMe();
        if (!me.repository_name) {
          router.replace("/setup");
          return;
        }
        setUser(me);
        await loadTrash();
      } catch {
        router.replace("/");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  async function loadTrash() {
    try {
      const contents = await listTrash();
      setFolders(contents.folders || []);
      setImages(contents.images || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load trash contents");
    }
  }

  async function handleRestore(type: "folder" | "image", id: string) {
    setActioning(true);
    setError("");
    setSuccess("");
    try {
      await restoreTrashItem(type, id);
      setSuccess(`Successfully restored ${type}.`);
      await loadTrash();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to restore item");
    } finally {
      setActioning(false);
    }
  }

  async function handlePermanentDelete(type: "folder" | "image", id: string) {
    if (!confirm(`Are you sure you want to permanently delete this ${type}? This cannot be undone.`)) {
      return;
    }
    setActioning(true);
    setError("");
    setSuccess("");
    try {
      await deleteTrashItemPermanently(type, id);
      setSuccess(`Permanently deleted ${type}.`);
      await loadTrash();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
    } finally {
      setActioning(false);
    }
  }

  async function handleEmptyTrash() {
    if (!confirm("Are you sure you want to empty the trash? All items will be permanently deleted from GitHub and database.")) {
      return;
    }
    setActioning(true);
    setError("");
    setSuccess("");
    try {
      await emptyTrash();
      setSuccess("Trash emptied successfully.");
      setFolders([]);
      setImages([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to empty trash");
    } finally {
      setActioning(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  const isVideo = (mimeType: string) => mimeType.startsWith("video/") || mimeType.endsWith("mp4");

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
            style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 500 }}
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
            style={{ cursor: "pointer", color: "var(--text-primary)", fontSize: "0.85rem", fontWeight: 600 }}
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

      {/* Main Content */}
      <main style={{ flex: 1, padding: "32px 24px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        
        {/* Title bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 700 }}>Trash Bin</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 4 }}>
              Items in Trash will be automatically permanently deleted after 30 days.
            </p>
          </div>
          {(folders.length > 0 || images.length > 0) && (
            <button
              className="btn-danger"
              onClick={handleEmptyTrash}
              disabled={actioning}
            >
              🗑️ Empty Trash
            </button>
          )}
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

        {success && (
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.2)",
              borderRadius: "var(--radius-md)",
              color: "var(--success)",
              fontSize: "0.85rem",
              marginBottom: 20,
            }}
          >
            {success}
          </div>
        )}

        {folders.length === 0 && images.length === 0 ? (
          <div
            className="animate-fade-in"
            style={{
              textAlign: "center",
              padding: "80px 20px",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>🗑️</div>
            <p style={{ fontSize: "1.1rem", marginBottom: 8 }}>Trash is empty</p>
            <p style={{ fontSize: "0.85rem" }}>
              Deleted folders and images will appear here for 30 days before permanent removal.
            </p>
          </div>
        ) : (
          <div>
            {/* Deleted Folders */}
            {folders.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 }}>
                  Deleted Folders ({folders.length})
                </h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 16,
                  }}
                >
                  {folders.map((sf) => (
                    <div
                      key={sf.id}
                      className="glass-card animate-fade-in"
                      style={{
                        padding: "20px",
                        position: "relative",
                      }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 10 }}>📁</div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "0.95rem",
                          marginBottom: 4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sf.name}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 16 }}>
                        Path: {sf.github_path}
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          className="btn-secondary"
                          style={{ padding: "6px 12px", fontSize: "0.75rem" }}
                          onClick={() => handleRestore("folder", sf.id)}
                          disabled={actioning}
                        >
                          Restore
                        </button>
                        <button
                          className="btn-danger"
                          style={{ padding: "6px 12px", fontSize: "0.75rem" }}
                          onClick={() => handlePermanentDelete("folder", sf.id)}
                          disabled={actioning}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deleted Images */}
            {images.length > 0 && (
              <div>
                <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 }}>
                  Deleted Files ({images.length})
                </h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 20,
                  }}
                >
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="glass-card animate-fade-in"
                      style={{
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div style={{ aspectRatio: "1/1", width: "100%", position: "relative", background: "rgba(0,0,0,0.2)" }}>
                        <img
                          loading="lazy"
                          src={getThumbnailUrl(img.id)}
                          alt={img.filename}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getImageViewUrl(img.id);
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                        {isVideo(img.mime_type) && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: 8,
                              left: 8,
                              background: "rgba(0,0,0,0.6)",
                              borderRadius: "50%",
                              width: 24,
                              height: 24,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: 12, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "0.85rem",
                            marginBottom: 8,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {img.filename}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn-secondary"
                            style={{ padding: "4px 8px", fontSize: "0.7rem", flex: 1 }}
                            onClick={() => handleRestore("image", img.id)}
                            disabled={actioning}
                          >
                            Restore
                          </button>
                          <button
                            className="btn-danger"
                            style={{ padding: "4px 8px", fontSize: "0.7rem", flex: 1 }}
                            onClick={() => handlePermanentDelete("image", img.id)}
                            disabled={actioning}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
