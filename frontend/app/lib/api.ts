/**
 * API client for the CloudGallery backend.
 *
 * All requests include credentials (cookies) for session-based auth.
 * The base URL is read from the NEXT_PUBLIC_API_URL env variable.
 */

import type {
  User,
  FolderResponse,
  FolderContents,
  ImageResponse,
  PaginatedImages,
  RepoInfo,
  TrashContents,
  ActivityLogResponse,
} from "@/app/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ── Auth ───────────────────────────────────────────────────

export function getLoginUrl(): string {
  return `${API}/auth/login`;
}

export async function getMe(): Promise<User> {
  return request<User>("/auth/me");
}

export async function logout(): Promise<void> {
  return request<void>("/auth/logout", { method: "POST" });
}

export async function register(username: string, password: string, email?: string): Promise<{ detail: string; user: User }> {
  return request<{ detail: string; user: User }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, email }),
  });
}

export async function loginPass(username: string, password: string): Promise<{ detail: string; user: User }> {
  return request<{ detail: string; user: User }>("/auth/login-pass", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function linkToken(token: string): Promise<User> {
  return request<User>("/auth/link-token", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}


// ── Repos ──────────────────────────────────────────────────

export async function listRepos(): Promise<RepoInfo[]> {
  return request<RepoInfo[]>("/repos/");
}

export async function selectRepo(
  repo_name: string,
  repo_owner: string
): Promise<RepoInfo> {
  return request<RepoInfo>("/repos/select", {
    method: "POST",
    body: JSON.stringify({ repo_name, repo_owner }),
  });
}

export async function createRepo(name: string): Promise<RepoInfo> {
  return request<RepoInfo>("/repos/create", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

// ── Folders ────────────────────────────────────────────────

export async function listRootFolders(): Promise<FolderResponse[]> {
  return request<FolderResponse[]>("/folders/");
}

export async function getFolderContents(
  folderId: string,
  page = 1,
  perPage = 50
): Promise<FolderContents> {
  return request<FolderContents>(`/folders/${folderId}?page=${page}&per_page=${perPage}`);
}

export async function createFolder(
  name: string,
  parent_id: string | null = null
): Promise<FolderResponse> {
  return request<FolderResponse>("/folders/", {
    method: "POST",
    body: JSON.stringify({ name, parent_id }),
  });
}

export async function renameFolder(
  id: string,
  name: string
): Promise<FolderResponse> {
  return request<FolderResponse>(`/folders/${id}/rename`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function deleteFolder(id: string): Promise<void> {
  return request<void>(`/folders/${id}`, { method: "DELETE" });
}

// ── Images ─────────────────────────────────────────────────

export async function uploadImage(
  folderId: string,
  file: File,
  onUploadProgress?: (progressEvent: { loaded: number; total: number }) => void
): Promise<ImageResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder_id", folderId);

  // Use XMLHttpRequest directly to track upload progress accurately
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/images/upload`);
    xhr.withCredentials = true;

    if (onUploadProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onUploadProgress({
            loaded: event.loaded,
            total: event.total,
          });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Failed to parse response"));
        }
      } else {
        try {
          const errBody = JSON.parse(xhr.responseText);
          reject(new Error(errBody.detail || `Upload failed: ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}

export interface UploadInitiateResponse {
  upload_id: string;
  chunk_size: number;
  uploaded_chunks: number[];
}

export async function initiateUpload(
  folderId: string,
  filename: string,
  totalSize: number,
  mimeType: string,
  uploadId?: string
): Promise<UploadInitiateResponse> {
  return request<UploadInitiateResponse>("/images/upload/initiate", {
    method: "POST",
    body: JSON.stringify({
      filename,
      folder_id: folderId,
      total_size: totalSize,
      mime_type: mimeType,
      upload_id: uploadId || null,
    }),
  });
}

export async function uploadChunk(
  uploadId: string,
  chunkIndex: number,
  chunkBlob: Blob,
  onProgress?: (progressEvent: { loaded: number; total: number }) => void,
  signal?: AbortSignal
): Promise<{ status: string; chunk_index: number }> {
  const formData = new FormData();
  formData.append("upload_id", uploadId);
  formData.append("chunk_index", chunkIndex.toString());
  formData.append("file", chunkBlob, `chunk_${chunkIndex}`);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/images/upload/chunk`);
    xhr.withCredentials = true;

    if (signal) {
      signal.addEventListener("abort", () => {
        xhr.abort();
        reject(new DOMException("Aborted", "AbortError"));
      });
    }

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress({
            loaded: event.loaded,
            total: event.total,
          });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Failed to parse response"));
        }
      } else {
        try {
          const errBody = JSON.parse(xhr.responseText);
          reject(new Error(errBody.detail || `Chunk upload failed: ${xhr.status}`));
        } catch {
          reject(new Error(`Chunk upload failed: ${xhr.statusText}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during chunk upload"));
    xhr.send(formData);
  });
}

export async function completeUpload(uploadId: string): Promise<ImageResponse> {
  return request<ImageResponse>("/images/upload/complete", {
    method: "POST",
    body: JSON.stringify({ upload_id: uploadId }),
  });
}


export async function renameImage(
  id: string,
  filename: string
): Promise<ImageResponse> {
  return request<ImageResponse>(`/images/${id}/rename`, {
    method: "PUT",
    body: JSON.stringify({ filename }),
  });
}

export async function deleteImage(id: string): Promise<void> {
  return request<void>(`/images/${id}`, { method: "DELETE" });
}

export function getImageViewUrl(imageId: string): string {
  return `${API}/images/${imageId}/view`;
}

export function getThumbnailUrl(imageId: string): string {
  return `${API}/images/${imageId}/thumbnail`;
}

// ── Trash & Activity ───────────────────────────────────────

export async function listTrash(): Promise<TrashContents> {
  return request<TrashContents>("/trash/");
}

export async function restoreTrashItem(
  itemType: "folder" | "image",
  itemId: string
): Promise<any> {
  return request<any>(`/trash/restore/${itemType}/${itemId}`, {
    method: "POST",
  });
}

export async function emptyTrash(): Promise<void> {
  return request<void>("/trash/empty", {
    method: "DELETE",
  });
}

export async function deleteTrashItemPermanently(
  itemType: "folder" | "image",
  itemId: string
): Promise<void> {
  return request<void>(`/trash/${itemType}/${itemId}`, {
    method: "DELETE",
  });
}

export async function searchImages(
  q: string,
  page = 1,
  perPage = 50
): Promise<PaginatedImages> {
  return request<PaginatedImages>(`/images/search?q=${encodeURIComponent(q)}&page=${page}&per_page=${perPage}`);
}

export async function listActivity(limit = 50): Promise<ActivityLogResponse[]> {
  return request<ActivityLogResponse[]>(`/activity/?limit=${limit}`);
}

