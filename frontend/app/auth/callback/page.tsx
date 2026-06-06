"use client";

import { useEffect } from "react";

/**
 * OAuth callback page.
 *
 * The backend handles the redirect and sets the session cookie,
 * then redirects to /setup or /dashboard.
 * This page exists only as a fallback loading indicator.
 */
export default function AuthCallback() {
  useEffect(() => {
    // The backend should redirect automatically via the cookie flow.
    // If we land here somehow, just wait a moment then redirect.
    const timer = setTimeout(() => {
      window.location.href = "/dashboard";
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <div className="spinner" style={{ width: 32, height: 32 }} />
      <p style={{ color: "var(--text-secondary)" }}>Authenticating…</p>
    </div>
  );
}
