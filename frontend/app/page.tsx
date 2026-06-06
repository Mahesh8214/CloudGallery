"use client";

import { useEffect, useState } from "react";
import { getLoginUrl, getMe, loginPass, register } from "@/app/lib/api";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<"login" | "signup">("login");

  // Form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    getMe()
      .then((user) => {
        if (user.repository_name) {
          router.replace("/dashboard");
        } else {
          router.replace("/setup");
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      if (mode === "login") {
        await loginPass(username.trim(), password.trim());
        setSuccess("Login successful! Redirecting...");
        setTimeout(() => {
          router.push("/setup");
        }, 800);
      } else {
        await register(username.trim(), password.trim(), email.trim() || undefined);
        setSuccess("Account created successfully! Redirecting...");
        setTimeout(() => {
          router.push("/setup");
        }, 800);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setSubmitting(false);
    }
  }

  if (checking) {
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
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        padding: 20,
      }}
    >
      {/* Background gradient orbs */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
          top: "-200px",
          right: "-200px",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)",
          bottom: "-150px",
          left: "-150px",
          pointerEvents: "none",
        }}
      />

      {/* Main card */}
      <div
        className="glass-card animate-slide-up"
        style={{
          padding: "40px 36px",
          maxWidth: 460,
          width: "100%",
        }}
      >
        {/* Logo Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              fontSize: 48,
              marginBottom: 8,
              filter: "drop-shadow(0 0 20px rgba(139,92,246,0.3))",
            }}
          >
            ☁️
          </div>
          <h1
            className="gradient-text"
            style={{
              fontSize: "1.8rem",
              fontWeight: 800,
              marginBottom: 4,
              letterSpacing: "-0.02em",
            }}
          >
            CloudGallery
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>
            Personal secure vault powered by GitHub
          </p>
        </div>

        {/* Tab selector */}
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
          <button
            onClick={() => {
              setMode("login");
              setError("");
            }}
            style={{
              flex: 1,
              padding: "10px 16px",
              background: mode === "login" ? "var(--accent)" : "transparent",
              color: mode === "login" ? "white" : "var(--text-secondary)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
              transition: "all 0.2s ease",
            }}
          >
            Log In
          </button>
          <button
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            style={{
              flex: 1,
              padding: "10px 16px",
              background: mode === "signup" ? "var(--accent)" : "transparent",
              color: mode === "signup" ? "white" : "var(--text-secondary)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
              transition: "all 0.2s ease",
            }}
          >
            Create Account
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
              fontSize: "0.82rem",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(52,211,153,0.1)",
              border: "1px solid rgba(52,211,153,0.2)",
              borderRadius: "var(--radius-md)",
              color: "var(--success)",
              fontSize: "0.82rem",
              marginBottom: 16,
            }}
          >
            {success}
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {mode === "signup" && (
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                Email (Optional)
              </label>
              <input
                type="email"
                className="input-field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "12px 24px",
              fontSize: "0.95rem",
              marginTop: 10,
            }}
          >
            {submitting ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16 }} />
                Authenticating…
              </>
            ) : mode === "login" ? (
              "Log In"
            ) : (
              "Sign Up"
            )}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", margin: "24px 0", gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
        </div>

        {/* OAuth OAuth button */}
        <a
          href={getLoginUrl()}
          className="btn-secondary"
          style={{
            width: "100%",
            justifyContent: "center",
            padding: "12px 24px",
            fontSize: "0.9rem",
            textDecoration: "none",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Continue with GitHub
        </a>
      </div>
    </div>
  );
}
