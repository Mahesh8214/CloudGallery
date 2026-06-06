"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, logout, listActivity } from "@/app/lib/api";
import type { User, ActivityLogResponse } from "@/app/types";

const ACTION_LABELS: Record<string, { emoji: string; label: string; color: string }> = {
  upload_image: { emoji: "📤", label: "Uploaded file", color: "rgba(99,102,241,0.15)" },
  delete_image: { emoji: "🗑️", label: "Deleted file", color: "rgba(248,113,113,0.12)" },
  delete_folder: { emoji: "🗑️", label: "Deleted folder", color: "rgba(248,113,113,0.12)" },
  create_folder: { emoji: "📁", label: "Created folder", color: "rgba(16,185,129,0.12)" },
  rename_folder: { emoji: "✏️", label: "Renamed folder", color: "rgba(251,191,36,0.12)" },
  rename_image: { emoji: "✏️", label: "Renamed file", color: "rgba(251,191,36,0.12)" },
  restore_folder: { emoji: "♻️", label: "Restored folder", color: "rgba(59,130,246,0.12)" },
  restore_image: { emoji: "♻️", label: "Restored file", color: "rgba(59,130,246,0.12)" },
  permanent_delete_folder: { emoji: "💥", label: "Permanently deleted folder", color: "rgba(239,68,68,0.15)" },
  permanent_delete_image: { emoji: "💥", label: "Permanently deleted file", color: "rgba(239,68,68,0.15)" },
  empty_trash: { emoji: "🧹", label: "Emptied trash", color: "rgba(239,68,68,0.15)" },
  login: { emoji: "🔑", label: "Logged in", color: "rgba(16,185,129,0.12)" },
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseDetails(details: string | null): Record<string, string> {
  if (!details) return {};
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return {};
  } catch {
    return { info: details };
  }
}

export default function ActivityPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [logs, setLogs] = useState<ActivityLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
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
        const actLogs = await listActivity(100);
        setLogs(actLogs);
      } catch {
        router.replace("/");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

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
            style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 500 }}
            onClick={() => router.push("/trash")}
          >
            🗑️ Trash
          </span>
          <span
            style={{ cursor: "pointer", color: "var(--text-primary)", fontSize: "0.85rem", fontWeight: 600 }}
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
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, marginBottom: 8 }}>Activity Log</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Recent actions across your gallery — uploads, deletes, renames, and more.
          </p>
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

        {logs.length === 0 ? (
          <div
            className="animate-fade-in"
            style={{
              textAlign: "center",
              padding: "80px 20px",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>📜</div>
            <p style={{ fontSize: "1.1rem", marginBottom: 8 }}>No activity yet</p>
            <p style={{ fontSize: "0.85rem" }}>
              Your gallery actions will appear here as you upload, delete, and organize files.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {logs.map((log, i) => {
              const meta = ACTION_LABELS[log.action] || {
                emoji: "📝",
                label: log.action.replace(/_/g, " "),
                color: "rgba(255,255,255,0.04)",
              };
              const details = parseDetails(log.details);
              const detailKeys = Object.keys(details).filter(
                (k) => k !== "folder_id" && k !== "image_id" && k !== "user_id"
              );

              return (
                <div
                  key={log.id}
                  className="glass-card animate-fade-in"
                  style={{
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 16,
                    animationDelay: `${i * 0.03}s`,
                    animationFillMode: "both",
                  }}
                >
                  {/* Action icon badge */}
                  <div
                    style={{
                      minWidth: 44,
                      height: 44,
                      borderRadius: "var(--radius-md)",
                      background: meta.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                  >
                    {meta.emoji}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        marginBottom: 4,
                        color: "var(--text-primary)",
                      }}
                    >
                      {meta.label}
                    </div>

                    {/* Detail chips */}
                    {detailKeys.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          marginTop: 4,
                        }}
                      >
                        {detailKeys.map((key) => (
                          <span
                            key={key}
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-secondary)",
                              background: "rgba(255,255,255,0.04)",
                              padding: "2px 8px",
                              borderRadius: 99,
                              border: "1px solid var(--border-subtle)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 320,
                            }}
                          >
                            {key}: {details[key]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                    title={new Date(log.created_at).toLocaleString()}
                  >
                    {formatRelativeTime(log.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
