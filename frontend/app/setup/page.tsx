"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, listRepos, selectRepo, createRepo, linkToken } from "@/app/lib/api";
import type { User, RepoInfo } from "@/app/types";

export default function SetupPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Custom token linking state
  const [hasToken, setHasToken] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [linking, setLinking] = useState(false);

  // Storage selection states
  const [selecting, setSelecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [tab, setTab] = useState<"select" | "create">("select");
  const [error, setError] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const me = await getMe();
        if (me.repository_name) {
          router.replace("/dashboard");
          return;
        }
        setUser(me);
        
        if (me.github_id) {
          setHasToken(true);
          const repoList = await listRepos();
          setRepos(repoList);
        } else {
          setHasToken(false);
        }
      } catch {
        router.replace("/");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  async function handleLinkToken(e: React.FormEvent) {
    e.preventDefault();
    if (!githubToken.trim()) return;

    setLinking(true);
    setError("");
    try {
      const updatedUser = await linkToken(githubToken.trim());
      setUser(updatedUser);
      setHasToken(true);
      
      // Immediately load repositories
      const repoList = await listRepos();
      setRepos(repoList);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to link GitHub token. Please verify it.");
    } finally {
      setLinking(false);
    }
  }

  async function handleSelect(repo: RepoInfo) {
    setSelecting(true);
    setError("");
    try {
      await selectRepo(repo.name, repo.owner);
      router.replace("/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to select repository");
      setSelecting(false);
    }
  }

  async function handleCreate() {
    if (!newRepoName.trim()) return;
    setCreating(true);
    setError("");
    try {
      await createRepo(newRepoName.trim());
      router.replace("/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create repository");
      setCreating(false);
    }
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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="glass-card animate-slide-up"
        style={{ maxWidth: 540, width: "100%", padding: "40px 36px" }}
      >
        
        {/* STEP 1: Link GitHub Personal Access Token */}
        {!hasToken ? (
          <div>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🔑</div>
              <h1
                className="gradient-text"
                style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 8 }}
              >
                Link GitHub Storage
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
                Since you signed in with credentials, you need to link your GitHub Personal Access Token (PAT) so we can sync your cloud gallery securely.
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
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleLinkToken} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                  Personal Access Token (PAT)
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  required
                />
              </div>

              <div
                style={{
                  fontSize: "0.78rem",
                  color: "var(--text-muted)",
                  background: "rgba(255,255,255,0.02)",
                  padding: 12,
                  borderRadius: "var(--radius-md)",
                  lineHeight: 1.5,
                  border: "1px solid var(--border-subtle)",
                }}
              >
                💡 <strong>How to create a PAT:</strong>
                <ol style={{ paddingLeft: 16, marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                  <li>Go to <strong>GitHub settings</strong> &gt; <strong>Developer Settings</strong>.</li>
                  <li>Click <strong>Personal Access Tokens</strong> &gt; <strong>Tokens (classic)</strong>.</li>
                  <li>Click <strong>Generate new token (classic)</strong>.</li>
                  <li>Choose the <strong><code>repo</code></strong> scope (enables folder/file management) and generate.</li>
                </ol>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={linking || !githubToken.trim()}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  padding: "12px 24px",
                  marginTop: 8,
                }}
              >
                {linking ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16 }} />
                    Validating & Linking…
                  </>
                ) : (
                  "Link GitHub Account"
                )}
              </button>
            </form>
          </div>
        ) : (
          
          /* STEP 2: Choose Repository (Original select/create UI) */
          <div>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
              <h1
                className="gradient-text"
                style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 8 }}
              >
                Select Storage
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Choose a private GitHub repository to store your photos
              </p>
            </div>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: 4,
                marginBottom: 24,
                background: "rgba(255,255,255,0.03)",
                borderRadius: "var(--radius-md)",
                padding: 4,
              }}
            >
              {(["select", "create"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    background:
                      tab === t ? "var(--accent)" : "transparent",
                    color: tab === t ? "white" : "var(--text-secondary)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    transition: "all 0.2s ease",
                  }}
                >
                  {t === "select" ? "Use Existing" : "Create New"}
                </button>
              ))}
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
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            {tab === "select" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {repos.length === 0 ? (
                  <p
                    style={{
                      color: "var(--text-muted)",
                      textAlign: "center",
                      padding: 24,
                    }}
                  >
                    No private repositories found. Create a new one!
                  </p>
                ) : (
                  repos.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => handleSelect(repo)}
                      disabled={selecting}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "14px 16px",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                        color: "var(--text-primary)",
                        cursor: selecting ? "wait" : "pointer",
                        transition: "all 0.2s ease",
                        textAlign: "left",
                        width: "100%",
                        fontSize: "0.9rem",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.borderColor = "var(--border-glow)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.borderColor = "var(--border-subtle)")
                      }
                    >
                      <span style={{ fontSize: 20 }}>📁</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {repo.name}
                        </div>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--text-muted)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {repo.full_name}
                        </div>
                      </div>
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: "0.7rem",
                          background: "rgba(52,211,153,0.15)",
                          color: "var(--success)",
                          padding: "3px 8px",
                          borderRadius: 99,
                          whiteSpace: "nowrap",
                        }}
                      >
                        private
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div>
                <input
                  className="input-field"
                  placeholder="e.g. my-photo-vault"
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  style={{ marginBottom: 12 }}
                />
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    marginBottom: 16,
                  }}
                >
                  A new <strong>private</strong> repository will be created on your
                  GitHub account.
                </p>
                <button
                  className="btn-primary"
                  onClick={handleCreate}
                  disabled={creating || !newRepoName.trim()}
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    opacity: creating || !newRepoName.trim() ? 0.5 : 1,
                  }}
                >
                  {creating ? (
                    <>
                      <div className="spinner" style={{ width: 16, height: 16 }} />
                      Creating…
                    </>
                  ) : (
                    "Create Repository"
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* User info footer */}
        {user && (
          <div
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
            }}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                style={{ width: 28, height: 28, borderRadius: "50%" }}
              />
            ) : (
              <span style={{ fontSize: 20 }}>👤</span>
            )}
            <span>Signed in as <strong style={{ color: "var(--text-primary)" }}>{user.username}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
