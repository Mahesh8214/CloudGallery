/* TypeScript interfaces matching the backend Pydantic schemas */

export interface User {
  id: number;
  github_id: number;
  username: string;
  email: string | null;
  avatar_url: string | null;
  repository_name: string | null;
  repository_owner: string | null;
}

export interface FolderResponse {
  id: string;
  name: string;
  parent_id: string | null;
  github_path: string;
  created_at: string;
  subfolder_count: number;
  image_count: number;
}

export interface ImageResponse {
  id: string;
  filename: string;
  folder_id: string | null;
  github_path: string;
  size: number;
  mime_type: string;
  thumbnail_path: string | null;
  uploaded_at: string;
}

export interface PaginatedImages {
  items: ImageResponse[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface FolderContents {
  folder: FolderResponse;
  subfolders: FolderResponse[];
  images: PaginatedImages;
  breadcrumbs: BreadcrumbItem[];
}

export interface RepoInfo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: string;
}

export interface ActivityLogResponse {
  id: number;
  user_id: number;
  action: string;
  details: string | null;
  created_at: string;
}

export interface TrashContents {
  folders: FolderResponse[];
  images: ImageResponse[];
}

