"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getMe,
  logout,
  searchImages,
  getImageViewUrl,
  getThumbnailUrl,
} from "@/app/lib/api";
import type { User, ImageResponse } from "@/app/types";

export default function SearchPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState("");

  // Pagination / Scroll
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalImages, setTotalImages] = useState(0);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Authentication check
  useEffect(() => {
    getMe()
      .then((me) => {
        if (!me.repository_name) {
          router.replace("/setup");
        } else {
          setUser(me);
        }
      })
      .catch(() => {
        router.replace("/");
      })
      .finally(() => {
        setInitLoading(false);
      });
  }, [router]);

  // Perform search when query or page changes
  useEffect(() => {
    if (!query.trim()) {
      setImages([]);
      setTotalImages(0);
      setTotalPages(1);
      return;
    }

    async function executeSearch() {
      setLoading(true);
      setError("");
      try {
        const res = await searchImages(query.trim(), page);
        setTotalPages(res.total_pages);
        setTotalImages(res.total);

        if (page === 1) {
          setImages(res.items);
        } else {
          setImages((prev) => {
            const existingIds = new Set(prev.map((img) => img.id));
            const newItems = res.items.filter((img) => !existingIds.has(img.id));
            return [...prev, ...newItems];
          });
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Search request failed.");
      } finally {
        setLoading(false);
      }
    }

    executeSearch();
  }, [query, page]);

  // Reset page when query changes
  const handleQueryChange = (val: string) => {
    setQuery(val);
    setPage(1);
    setImages([]);
  };

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") setLightboxIndex((prev) => (prev! + 1) % images.length);
      if (e.key === "ArrowLeft") setLightboxIndex((prev) => (prev! - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, images]);

  // Infinite scroll intersection observer
  useEffect(() => {
    if (loading || page >= totalPages || !query.trim()) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((p) => p + 1);
        }
      },
      { threshold: 0.1, rootMargin: "150px" }
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [loading, page, totalPages, query]);

  // Format Helper
  function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  const isVideo = (mimeType: string) => mimeType.startsWith("video/") || mimeType.endsWith("mp4");

  if (initLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
            style={{ cursor: "pointer", color: "var(--text-primary)", fontSize: "0.85rem", fontWeight: 600 }}
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

      {/* Main Content */}
      <main style={{ flex: 1, padding: "32px 24px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, marginBottom: 8 }}>Search Gallery</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 20 }}>
            Search images and videos by filename using indexed database lookup.
          </p>

          <input
            className="input-field"
            type="text"
            placeholder="Type filename prefix or keyword to search..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            style={{ width: "100%", maxWidth: 600, fontSize: "1rem", padding: "12px 18px" }}
            autoFocus
          />
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

        {!query.trim() ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.2 }}>🔍</div>
            <p style={{ fontSize: "0.95rem" }}>Enter a filename in the search bar above.</p>
          </div>
        ) : loading && page === 1 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 20 }}>
            {[...Array(6)].map((_, idx) => (
              <div key={idx} className="skeleton" style={{ aspectRatio: "1/1", height: "auto" }} />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>🖼️</div>
            <p style={{ fontSize: "0.95rem", marginBottom: 4 }}>No matching results found</p>
            <p style={{ fontSize: "0.78rem" }}>Try searching with a different filename or keyword.</p>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 16 }}>
              Found {totalImages} result{totalImages !== 1 ? "s" : ""}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 20 }}>
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  className="glass-card animate-fade-in"
                  style={{ overflow: "hidden", cursor: "pointer", position: "relative", aspectRatio: "1/1" }}
                  onClick={() => setLightboxIndex(idx)}
                >
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
                      transition: "transform 0.3s ease",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                    onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
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
              ))}
            </div>

            {/* Sentinel Element for Infinite Scroll */}
            <div
              ref={sentinelRef}
              style={{
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 30,
                paddingBottom: 20,
              }}
            >
              {page < totalPages && (
                <div className="spinner" style={{ width: 24, height: 24 }} />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && images[lightboxIndex] && (
        <div
          className="modal-overlay"
          style={{ background: "rgba(0,0,0,0.95)", backdropFilter: "blur(8px)" }}
          onClick={() => setLightboxIndex(null)}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setLightboxIndex(null)}
              style={{
                position: "absolute",
                top: 24,
                right: 24,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "white",
                fontSize: 24,
                width: 48,
                height: 48,
                borderRadius: "50%",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 110,
              }}
            >
              ×
            </button>

            {/* Left Nav Arrow */}
            <button
              onClick={() => setLightboxIndex((prev) => (prev! - 1 + images.length) % images.length)}
              style={{
                position: "absolute",
                left: 24,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "white",
                fontSize: 24,
                width: 56,
                height: 56,
                borderRadius: "50%",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 110,
              }}
            >
              ‹
            </button>

            {/* Media rendering */}
            <div style={{ maxWidth: "85vw", maxHeight: "72vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isVideo(images[lightboxIndex].mime_type) ? (
                <video
                  src={getImageViewUrl(images[lightboxIndex].id)}
                  controls
                  autoPlay
                  style={{
                    maxWidth: "100%",
                    maxHeight: "72vh",
                    borderRadius: "var(--radius-md)",
                    boxShadow: "0 24px 60px rgba(0,0,0,0.8)",
                  }}
                />
              ) : (
                <img
                  src={getImageViewUrl(images[lightboxIndex].id)}
                  alt={images[lightboxIndex].filename}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "72vh",
                    objectFit: "contain",
                    borderRadius: "var(--radius-md)",
                    boxShadow: "0 24px 60px rgba(0,0,0,0.8)",
                  }}
                />
              )}
            </div>

            {/* Right Nav Arrow */}
            <button
              onClick={() => setLightboxIndex((prev) => (prev! + 1) % images.length)}
              style={{
                position: "absolute",
                right: 24,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "white",
                fontSize: 24,
                width: 56,
                height: 56,
                borderRadius: "50%",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 110,
              }}
            >
              ›
            </button>

            {/* Info footer panel */}
            <div
              style={{
                marginTop: 24,
                textAlign: "center",
                maxWidth: 600,
                width: "90%",
                background: "rgba(255,255,255,0.03)",
                padding: "16px 24px",
                borderRadius: "var(--radius-lg)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {images[lightboxIndex].filename}
              </h3>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Size: {formatBytes(images[lightboxIndex].size)} • Uploaded on: {new Date(images[lightboxIndex].uploaded_at).toLocaleString()}
              </p>
              <div style={{ marginTop: 12, display: "flex", gap: 12, justifyContent: "center" }}>
                <a
                  href={getImageViewUrl(images[lightboxIndex].id)}
                  download={images[lightboxIndex].filename}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ padding: "8px 16px", fontSize: "0.8rem", borderRadius: "var(--radius-sm)" }}
                >
                  Download File
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
