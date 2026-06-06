"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  getMe,
  logout,
  getFolderContents,
  createFolder,
  renameFolder,
  deleteFolder,
  uploadImage,
  renameImage,
  deleteImage,
  getImageViewUrl,
  getThumbnailUrl,
  initiateUpload,
  uploadChunk,
  completeUpload,
} from "@/app/lib/api";
import type {
  User,
  FolderResponse,
  ImageResponse,
  BreadcrumbItem,
} from "@/app/types";

export default function FolderPage() {
  const router = useRouter();
  const params = useParams();
  const folderId = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [currentFolder, setCurrentFolder] = useState<FolderResponse | null>(null);
  const [subfolders, setSubfolders] = useState<FolderResponse[]>([]);
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  
  // Pagination / Scroll
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalImages, setTotalImages] = useState(0);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{
    id: string;
    fileName: string;
    progress: number;
    speed: string;
    status: "pending" | "uploading" | "paused" | "success" | "error";
    errorMsg?: string;
    uploadId?: string;
    chunkIndex?: number;
    totalChunks?: number;
  }[]>([]);
  const [error, setError] = useState("");

  const filesRef = useRef<Record<string, File>>({});
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  // Modals — Subfolder
  const [showCreateSub, setShowCreateSub] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState("");
  const [creatingSub, setCreatingSub] = useState(false);

  const [showRenameFolder, setShowRenameFolder] = useState<FolderResponse | null>(null);
  const [renameFolderNameVal, setRenameFolderNameVal] = useState("");

  const [showDeleteFolder, setShowDeleteFolder] = useState<FolderResponse | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  // Modals — Image
  const [showRenameImg, setShowRenameImg] = useState<ImageResponse | null>(null);
  const [renameImgNameVal, setRenameImgNameVal] = useState("");

  const [showDeleteImg, setShowDeleteImg] = useState<ImageResponse | null>(null);
  const [deletingImg, setDeletingImg] = useState(false);

  // Lightbox Modal
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Drag and Drop Upload
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Context Menu
  const [ctxFolderMenu, setCtxFolderMenu] = useState<{
    folder: FolderResponse;
    x: number;
    y: number;
  } | null>(null);

  const [ctxImageMenu, setCtxImageMenu] = useState<{
    image: ImageResponse;
    index: number;
    x: number;
    y: number;
  } | null>(null);

  // Initial authentication check & user fetch
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
      });
  }, [router]);

  // Reset scroll and page when folderId changes
  useEffect(() => {
    setPage(1);
    setImages([]);
    setCurrentFolder(null);
    setSubfolders([]);
  }, [folderId]);

  // Fetch folder contents whenever folderId or page changes
  useEffect(() => {
    if (!folderId) return;

    async function fetchContents() {
      setLoading(true);
      setError("");
      try {
        const contents = await getFolderContents(folderId, page);
        setCurrentFolder(contents.folder);
        setSubfolders(contents.subfolders);
        setTotalPages(contents.images.total_pages);
        setTotalImages(contents.images.total);
        setBreadcrumbs(contents.breadcrumbs);

        if (page === 1) {
          setImages(contents.images.items);
        } else {
          setImages((prev) => {
            const existingIds = new Set(prev.map((img) => img.id));
            const newItems = contents.images.items.filter((img) => !existingIds.has(img.id));
            return [...prev, ...newItems];
          });
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load folder contents");
      } finally {
        setLoading(false);
      }
    }

    fetchContents();
  }, [folderId, page]);

  // Infinite scroll intersection observer
  useEffect(() => {
    if (loading || page >= totalPages) return;

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
  }, [loading, page, totalPages]);


  // Close context menus on document click
  useEffect(() => {
    const closeMenus = () => {
      setCtxFolderMenu(null);
      setCtxImageMenu(null);
    };
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") handleNextImage();
      if (e.key === "ArrowLeft") handlePrevImage();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, images]);

  // Create Subfolder
  async function handleCreateSubfolder() {
    if (!newSubfolderName.trim()) return;
    setCreatingSub(true);
    setError("");
    try {
      const sf = await createFolder(newSubfolderName.trim(), folderId);
      setSubfolders((prev) => [...prev, sf].sort((a, b) => a.name.localeCompare(b.name)));
      setShowCreateSub(false);
      setNewSubfolderName("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setCreatingSub(false);
    }
  }

  // Rename Subfolder
  async function handleRenameFolder() {
    if (!showRenameFolder || !renameFolderNameVal.trim()) return;
    try {
      const updated = await renameFolder(showRenameFolder.id, renameFolderNameVal.trim());
      setSubfolders((prev) =>
        prev.map((sf) => (sf.id === updated.id ? updated : sf))
      );
      setShowRenameFolder(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to rename folder");
    }
  }

  // Delete Subfolder
  async function handleDeleteFolder() {
    if (!showDeleteFolder) return;
    setDeletingFolder(true);
    try {
      await deleteFolder(showDeleteFolder.id);
      setSubfolders((prev) => prev.filter((sf) => sf.id !== showDeleteFolder.id));
      setShowDeleteFolder(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete folder");
    } finally {
      setDeletingFolder(false);
    }
  }

  // File Upload Handlers — Concurrent queue with max 3 parallel uploads
  const MAX_CONCURRENT = 3;
  const queueRef = useRef<any[]>([]);

  function syncQueue() {
    setUploadQueue([...queueRef.current]);
  }

  async function handleFilesUpload(files: FileList) {
    if (files.length === 0) return;
    setUploading(true);
    setError("");

    const fileArray = Array.from(files);
    const newItems = fileArray.map((file, idx) => {
      const itemId = `upload-${Date.now()}-${idx}`;
      filesRef.current[itemId] = file;
      return {
        id: itemId,
        fileName: file.name,
        progress: 0,
        speed: "",
        status: "pending" as const,
      };
    });

    queueRef.current = [...queueRef.current, ...newItems];
    syncQueue();
    runQueue();
  }

  function runQueue() {
    // Check if all items in queue are successfully done
    const allDone = queueRef.current.length > 0 && queueRef.current.every(item => item.status === "success");
    if (allDone) {
      filesRef.current = {};
      abortControllersRef.current = {};
      setTimeout(() => {
        const currentAllDone = queueRef.current.every(item => item.status === "success");
        if (currentAllDone) {
          setUploading(false);
          queueRef.current = [];
          syncQueue();
        }
      }, 3000);
      return;
    }

    const running = queueRef.current.filter(item => item.status === "uploading").length;
    let slots = MAX_CONCURRENT - running;

    if (slots <= 0) return;

    for (const item of queueRef.current) {
      if (slots <= 0) break;
      if (item.status === "pending") {
        item.status = "uploading";
        item.speed = "Starting...";
        slots--;
        syncQueue();
        processFileItem(item.id);
      }
    }
  }

  async function processFileItem(itemId: string) {
    const file = filesRef.current[itemId];
    if (!file) return;

    const updateItem = (updates: Partial<typeof queueRef.current[0]>) => {
      queueRef.current = queueRef.current.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      );
      syncQueue();
    };

    const getItem = () => queueRef.current.find(item => item.id === itemId);

    try {
      const storageKey = `upload_session_${folderId}_${file.name}_${file.size}`;
      const cachedUploadId = localStorage.getItem(storageKey) || undefined;

      // 1. Initiate upload session
      const initRes = await initiateUpload(
        folderId,
        file.name,
        file.size,
        file.type || "application/octet-stream",
        cachedUploadId
      );

      const uploadId = initRes.upload_id;
      const chunkSize = initRes.chunk_size;
      const uploadedChunks = initRes.uploaded_chunks;
      const totalChunks = Math.ceil(file.size / chunkSize);

      updateItem({
        uploadId,
        totalChunks,
        progress: totalChunks > 0 ? Math.round((uploadedChunks.length / totalChunks) * 100) : 0,
      });

      localStorage.setItem(storageKey, uploadId);

      const completedChunks = new Set<number>(uploadedChunks);
      const speedStartTime = Date.now();

      // 2. Chunk loop
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        let currentItem = getItem();
        if (!currentItem || currentItem.status !== "uploading") {
          return;
        }

        if (completedChunks.has(chunkIndex)) {
          continue;
        }

        const chunkBlob = file.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
        const controller = new AbortController();
        abortControllersRef.current[itemId] = controller;

        try {
          await uploadChunk(
            uploadId,
            chunkIndex,
            chunkBlob,
            (progressEvent) => {
              const currentChunkFraction = progressEvent.loaded / progressEvent.total;
              const totalProgress = Math.min(
                99,
                Math.round(((completedChunks.size + currentChunkFraction) / totalChunks) * 100)
              );

              const elapsedSeconds = (Date.now() - speedStartTime) / 1000;
              let speedStr = "Calculating...";
              if (elapsedSeconds > 0) {
                const uploadedInSession = (completedChunks.size - uploadedChunks.length) * chunkSize + progressEvent.loaded;
                const bytesPerSec = uploadedInSession / elapsedSeconds;
                if (bytesPerSec > 1024 * 1024) {
                  speedStr = `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
                } else {
                  speedStr = `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
                }
              }

              updateItem({
                progress: totalProgress,
                speed: speedStr,
              });
            },
            controller.signal
          );

          completedChunks.add(chunkIndex);
          delete abortControllersRef.current[itemId];
        } catch (chunkErr: any) {
          delete abortControllersRef.current[itemId];
          if (chunkErr.name === "AbortError" || chunkErr.message === "Aborted") {
            return;
          }
          throw chunkErr;
        }
      }

      // 3. Complete session
      let currentItem = getItem();
      if (!currentItem || currentItem.status !== "uploading") {
        return;
      }

      updateItem({ progress: 99, speed: "Completing..." });

      const newImg = await completeUpload(uploadId);
      localStorage.removeItem(storageKey);

      setImages((prev) => {
        if (prev.some(img => img.id === newImg.id)) return prev;
        return [newImg, ...prev];
      });
      setTotalImages((prev) => prev + 1);

      updateItem({
        status: "success",
        progress: 100,
        speed: "",
      });

      runQueue();
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : "Upload failed";
      updateItem({
        status: "error",
        errorMsg: errMsg,
        speed: "",
      });
      runQueue();
    }
  }

  function handlePause(itemId: string) {
    const item = queueRef.current.find(x => x.id === itemId);
    if (item && (item.status === "uploading" || item.status === "pending")) {
      item.status = "paused";
      item.speed = "Paused";
      const controller = abortControllersRef.current[itemId];
      if (controller) {
        controller.abort();
        delete abortControllersRef.current[itemId];
      }
      syncQueue();
      runQueue();
    }
  }

  function handleResume(itemId: string) {
    const item = queueRef.current.find(x => x.id === itemId);
    if (item && (item.status === "paused" || item.status === "error")) {
      item.status = "pending";
      item.errorMsg = undefined;
      item.speed = "Queued";
      syncQueue();
      runQueue();
    }
  }

  function handleRetry(itemId: string) {
    handleResume(itemId);
  }

  function handleClearQueue() {
    // Abort all running uploads
    Object.keys(abortControllersRef.current).forEach(itemId => {
      abortControllersRef.current[itemId].abort();
    });
    filesRef.current = {};
    abortControllersRef.current = {};
    queueRef.current = [];
    setUploading(false);
    syncQueue();
  }



  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  // Rename Image
  async function handleRenameImage() {
    if (!showRenameImg || !renameImgNameVal.trim()) return;
    try {
      const updated = await renameImage(showRenameImg.id, renameImgNameVal.trim());
      setImages((prev) =>
        prev.map((img) => (img.id === updated.id ? updated : img))
      );
      setShowRenameImg(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to rename file");
    }
  }

  // Delete Image
  async function handleDeleteImage() {
    if (!showDeleteImg) return;
    setDeletingImg(true);
    try {
      await deleteImage(showDeleteImg.id);
      setImages((prev) => prev.filter((img) => img.id !== showDeleteImg.id));
      setTotalImages((prev) => Math.max(0, prev - 1));
      setShowDeleteImg(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    } finally {
      setDeletingImg(false);
    }
  }

  // Lightbox Cycling
  function handleNextImage() {
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => (prev! + 1) % images.length);
  }

  function handlePrevImage() {
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => (prev! - 1 + images.length) % images.length);
  }

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

  if (loading && !currentFolder) {
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
            style={{ cursor: "pointer", color: "var(--text-secondary)", fontSize: "0.85rem", fontWeight: 500 }}
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

      {/* Main Content */}
      <main style={{ flex: 1, padding: "24px 24px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        
        {/* Breadcrumbs Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            marginBottom: 20,
          }}
        >
          <span
            style={{ cursor: "pointer", color: "var(--text-secondary)" }}
            onClick={() => router.push("/dashboard")}
          >
            My Gallery
          </span>
          {breadcrumbs.map((crumb) => {
            const isLast = crumb.id === folderId;
            return (
              <span key={crumb.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>/</span>
                <span
                  style={{
                    cursor: isLast ? "default" : "pointer",
                    color: isLast ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: isLast ? 600 : 400,
                  }}
                  onClick={() => !isLast && router.push(`/folder/${crumb.id}`)}
                >
                  {crumb.name}
                </span>
              </span>
            );
          })}
        </div>

        {/* Title and Top actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 700 }}>{currentFolder?.name}</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 4 }}>
              {subfolders.length} folder{subfolders.length !== 1 ? "s" : ""} • {totalImages} file{totalImages !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-secondary" onClick={() => setShowCreateSub(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Subfolder
            </button>
            <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload Files
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              multiple
              accept="image/*,video/mp4"
              onChange={(e) => e.target.files && handleFilesUpload(e.target.files)}
            />
          </div>
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

        {/* Uploading progress panel — per-file tracking */}
        {uploading && uploadQueue.length > 0 && (
          <div
            className="glass-card animate-fade-in"
            style={{
              padding: "16px 20px",
              marginBottom: 24,
              borderLeft: "4px solid var(--accent)",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                Uploading {uploadQueue.filter(x => x.status !== "success").length} / {uploadQueue.length} file{uploadQueue.length !== 1 ? "s" : ""}
                <span style={{ fontWeight: 400, fontSize: "0.78rem", color: "var(--text-muted)", marginLeft: 8 }}>
                  (max {MAX_CONCURRENT} concurrent)
                </span>
              </div>
              <button
                onClick={handleClearQueue}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  textDecoration: "underline",
                }}
              >
                Close Panel
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
              {uploadQueue.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                      {item.status === "success" && "✅ "}
                      {item.status === "error" && "❌ "}
                      {item.status === "paused" && "⏸️ "}
                      {item.status === "uploading" && "📤 "}
                      {item.status === "pending" && "⏳ "}
                      {item.fileName}
                    </span>
                    <span style={{ color: "var(--text-muted)", flexShrink: 0, fontSize: "0.78rem" }}>
                      {item.status === "uploading" && `${item.progress}% (${item.speed})`}
                      {item.status === "paused" && `Paused at ${item.progress}%`}
                      {item.status === "success" && "Done"}
                      {item.status === "error" && "Failed"}
                      {item.status === "pending" && (item.speed || "Queued")}
                    </span>
                  </div>
                  
                  {/* Progress Bar */}
                  {item.status !== "success" && item.status !== "pending" && (
                    <div className="progress-bar" style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden", margin: "6px 0" }}>
                      <div
                        className="fill"
                        style={{
                          width: `${item.progress}%`,
                          height: "100%",
                          background: item.status === "error"
                            ? "var(--danger)"
                            : item.status === "paused"
                            ? "#f59e0b" // Warm orange/amber for paused
                            : "var(--accent)", // Standard theme accent for uploading
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  )}

                  {item.status === "error" && item.errorMsg && (
                    <p style={{ fontSize: "0.72rem", color: "var(--danger)", marginTop: 2, marginBottom: 6 }}>
                      {item.errorMsg}
                    </p>
                  )}

                  {/* Controls */}
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    {(item.status === "uploading" || item.status === "pending") && (
                      <button
                        onClick={() => handlePause(item.id)}
                        style={{
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-secondary)",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "0.72rem",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        ⏸️ Pause
                      </button>
                    )}
                    {item.status === "paused" && (
                      <button
                        onClick={() => handleResume(item.id)}
                        style={{
                          background: "rgba(59, 130, 246, 0.15)",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                          color: "#60a5fa",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "0.72rem",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        ▶️ Resume
                      </button>
                    )}
                    {item.status === "error" && (
                      <button
                        onClick={() => handleRetry(item.id)}
                        style={{
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          color: "#f87171",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "0.72rem",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        🔄 Retry
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nested Subfolders Grid */}
        {subfolders.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 }}>
              Subfolders
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 16,
              }}
            >
              {subfolders.map((sf, i) => (
                <div
                  key={sf.id}
                  className="glass-card animate-fade-in"
                  style={{
                    padding: "16px 20px",
                    cursor: "pointer",
                    position: "relative",
                    animationDelay: `${i * 0.04}s`,
                    animationFillMode: "both",
                  }}
                  onClick={() => {
                    setPage(1);
                    router.push(`/folder/${sf.id}`);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxFolderMenu({ folder: sf, x: e.clientX, y: e.clientY });
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📁</div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      marginBottom: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sf.name}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    {sf.subfolder_count} folders • {sf.image_count} files
                  </div>

                  {/* Context three dot */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCtxFolderMenu({ folder: sf, x: e.clientX, y: e.clientY });
                    }}
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 16,
                    }}
                  >
                    ⋮
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Media Zone */}
        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 }}>
          Media files
        </h2>

        {/* Drag and Drop Zone */}
        <div
          className={`drop-zone ${dragActive ? "dragging" : ""} animate-fade-in`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ marginBottom: 32 }}
        >
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📤</div>
          <p style={{ fontSize: "0.95rem", fontWeight: 500, marginBottom: 6 }}>
            Drag & drop images/videos here
          </p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Supports JPEG, PNG, WEBP and MP4 up to 100MB
          </p>
        </div>

        {/* Image/Video Grid */}
        {loading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 20,
            }}
          >
            {[...Array(6)].map((_, idx) => (
              <div
                key={idx}
                className="skeleton"
                style={{ aspectRatio: "1/1", height: "auto" }}
              />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🖼️</div>
            <p style={{ fontSize: "0.95rem", marginBottom: 4 }}>This folder is empty</p>
            <p style={{ fontSize: "0.78rem" }}>Upload images or videos to build your vault.</p>
          </div>
        ) : (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 20,
              }}
            >
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  className="glass-card animate-fade-in"
                  style={{
                    overflow: "hidden",
                    cursor: "pointer",
                    position: "relative",
                    aspectRatio: "1/1",
                  }}
                  onClick={() => setLightboxIndex(idx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxImageMenu({ image: img, index: idx, x: e.clientX, y: e.clientY });
                  }}
                >
                  <img
                    loading="lazy"
                    src={getThumbnailUrl(img.id)}
                    alt={img.filename}
                    onError={(e) => {
                      // Fallback to view URL if thumbnail is still generating
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

                  {/* Video indicator overlay */}
                  {isVideo(img.mime_type) && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 8,
                        left: 8,
                        background: "rgba(0,0,0,0.6)",
                        borderRadius: "50%",
                        width: 28,
                        height: 28,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid rgba(255,255,255,0.2)",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                  )}

                  {/* Options contextual dots trigger */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCtxImageMenu({ image: img, index: idx, x: e.clientX, y: e.clientY });
                    }}
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      background: "rgba(0,0,0,0.5)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "white",
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                    }}
                  >
                    ⋮
                  </button>
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

      {/* Subfolder Context Menu */}
      {ctxFolderMenu && (
        <div
          className="context-menu"
          style={{ left: ctxFolderMenu.x, top: ctxFolderMenu.y, position: "fixed" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setShowRenameFolder(ctxFolderMenu.folder);
              setRenameFolderNameVal(ctxFolderMenu.folder.name);
              setCtxFolderMenu(null);
            }}
          >
            ✏️ Rename
          </button>
          <button
            className="danger"
            onClick={() => {
              setShowDeleteFolder(ctxFolderMenu.folder);
              setCtxFolderMenu(null);
            }}
          >
            🗑️ Delete
          </button>
        </div>
      )}

      {/* Image Context Menu */}
      {ctxImageMenu && (
        <div
          className="context-menu"
          style={{ left: ctxImageMenu.x, top: ctxImageMenu.y, position: "fixed" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setLightboxIndex(ctxImageMenu.index);
              setCtxImageMenu(null);
            }}
          >
            🔍 View Full Size
          </button>
          <a
            href={getImageViewUrl(ctxImageMenu.image.id)}
            download={ctxImageMenu.image.filename}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none" }}
          >
            <button>💾 Download</button>
          </a>
          <button
            onClick={() => {
              setShowRenameImg(ctxImageMenu.image);
              setRenameImgNameVal(ctxImageMenu.image.filename);
              setCtxImageMenu(null);
            }}
          >
            ✏️ Rename
          </button>
          <button
            className="danger"
            onClick={() => {
              setShowDeleteImg(ctxImageMenu.image);
              setCtxImageMenu(null);
            }}
          >
            🗑️ Delete
          </button>
        </div>
      )}

      {/* Create Subfolder Modal */}
      {showCreateSub && (
        <div className="modal-overlay" onClick={() => setShowCreateSub(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 20 }}>
              Create Nested Folder
            </h2>
            <input
              className="input-field"
              placeholder="Subfolder name"
              value={newSubfolderName}
              onChange={(e) => setNewSubfolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateSubfolder()}
              autoFocus
              style={{ marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => setShowCreateSub(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateSubfolder}
                disabled={creatingSub || !newSubfolderName.trim()}
              >
                {creatingSub ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Subfolder Modal */}
      {showRenameFolder && (
        <div className="modal-overlay" onClick={() => setShowRenameFolder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 20 }}>
              Rename Subfolder
            </h2>
            <input
              className="input-field"
              value={renameFolderNameVal}
              onChange={(e) => setRenameFolderNameVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameFolder()}
              autoFocus
              style={{ marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => setShowRenameFolder(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleRenameFolder}
                disabled={!renameFolderNameVal.trim()}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Folder Modal */}
      {showDeleteFolder && (
        <div className="modal-overlay" onClick={() => setShowDeleteFolder(null)}>
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
              <strong style={{ color: "var(--text-primary)" }}>{showDeleteFolder.name}</strong>
              ? This will recursively delete all nested items on GitHub.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => setShowDeleteFolder(null)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleDeleteFolder} disabled={deletingFolder}>
                {deletingFolder ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Image/File Modal */}
      {showRenameImg && (
        <div className="modal-overlay" onClick={() => setShowRenameImg(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 20 }}>
              Rename File
            </h2>
            <input
              className="input-field"
              value={renameImgNameVal}
              onChange={(e) => setRenameImgNameVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameImage()}
              autoFocus
              style={{ marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => setShowRenameImg(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleRenameImage}
                disabled={!renameImgNameVal.trim()}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Image Modal */}
      {showDeleteImg && (
        <div className="modal-overlay" onClick={() => setShowDeleteImg(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 12 }}>
              Delete File
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
              <strong style={{ color: "var(--text-primary)" }}>{showDeleteImg.filename}</strong>
              ? This action will permanently remove the file from your GitHub vault.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => setShowDeleteImg(null)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleDeleteImage} disabled={deletingImg}>
                {deletingImg ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full screen Lightbox Modal */}
      {lightboxIndex !== null && (
        <div
          className="modal-overlay"
          style={{ background: "rgba(0,0,0,0.95)", backdropFilter: "blur(8px)" }}
          onClick={() => setLightboxIndex(null)}
        >
          {/* Lightbox content */}
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
              onClick={handlePrevImage}
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
            <div
              style={{
                maxWidth: "85vw",
                maxHeight: "72vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
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
              onClick={handleNextImage}
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
