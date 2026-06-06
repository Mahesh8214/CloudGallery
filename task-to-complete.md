# Implementation Plan — Personal Cloud Gallery Optimizations

This document outlines the architecture, database changes, and frontend/backend modifications required to optimize the speed, reliability, robustness, scalability, and deployment readiness of the Personal Cloud Gallery.

## User Review Required

> [!WARNING]
> **Database Schema Migration**: Changing IDs of `Folder` and `Image` from `Integer` (autoincrement) to `UUID` (string of 36 chars) is a breaking schema change. Existing SQLite/PostgreSQL databases will need to be recreated or migrated. Since this is an audit and optimization task, we will modify the models and provide automatic table drop/creation or schema compatibility.
> 
> **Soft Delete System**: Trashed files/folders will remain on GitHub but will be marked as deleted in the database. A background worker (or startup task) will clean them up after 30 days.

---

## Proposed Changes

### 1. Database & Core Abstractions

#### [MODIFY] [models.py](file:///d:/pwskills/Temp/git-photos/backend/app/models.py)
- Change primary keys `id` in `Folder` and `Image` to `String(36)` with a default uuid generator (`lambda: str(uuid.uuid4())`).
- Change foreign keys `parent_id` (in `Folder`) and `folder_id` (in `Image`) to `String(36)`.
- Add `deleted_at: Mapped[Optional[datetime]]` to `Folder` and `Image` for soft-deletion.
- Add `ActivityLog` model to store structured audit logs.
- Update relationship definitions to match the new string-based UUID foreign keys.

#### [MODIFY] [database.py](file:///d:/pwskills/Temp/git-photos/backend/app/database.py)
- Adjust `create_engine` connect arguments: only apply `check_same_thread=False` if using SQLite, allowing out-of-the-box compatibility with PostgreSQL.

#### [NEW] [storage.py](file:///d:/pwskills/Temp/git-photos/backend/app/services/storage.py)
- Abstraction service layer (`StorageService`) encapsulating all GitHub API calls.
- Implement transaction-safe operations:
  - **Upload**: Upload to GitHub, rollback DB transaction if GitHub upload fails. If DB commit fails after GitHub upload, delete the uploaded file from GitHub to maintain consistency.
  - **Rename/Move**: Copy file to new path on GitHub, delete the old file, update database.
  - **Delete**: Soft-delete in DB. Permanent deletion removes the file from GitHub and DB.
- Exponential backoff retry logic for GitHub operations (maximum 3 retries).

---

### 2. Backend Routes

#### [MODIFY] [schemas.py](file:///d:/pwskills/Temp/git-photos/backend/app/schemas.py)
- Change `id` and foreign key fields from `int` to `str` in Pydantic schemas.
- Add schemas for trash responses and activity logs.

#### [MODIFY] [folders.py](file:///d:/pwskills/Temp/git-photos/backend/app/routers/folders.py)
- Update parameter types from `int` to `str`.
- Update all queries to filter out soft-deleted items (`deleted_at.is_(None)`).
- Implement soft-delete logic for folders: recursively mark the folder and all its child folders and images as deleted.
- Move direct GitHub calls to `StorageService`.

#### [MODIFY] [images.py](file:///d:/pwskills/Temp/git-photos/backend/app/routers/images.py)
- Update parameter types from `int` to `str`.
- Generate thumbnail during file upload and upload it to GitHub as `[filename_without_ext]_thumbnail.jpg`.
- Save the thumbnail's GitHub path in the database.
- Update `/api/images/{id}/thumbnail` to download and stream the pre-generated thumbnail directly from GitHub rather than generating it on-the-fly from the original media.
- Return HTTP `Cache-Control` headers for assets:
  - Thumbnails: `public, max-age=31536000, immutable`.
  - Folder contents & Image metadata: `private, max-age=15, must-revalidate`.
- Implement soft-delete logic for images.

#### [NEW] [trash.py](file:///d:/pwskills/Temp/git-photos/backend/app/routers/trash.py)
- Endpoints to manage soft-deleted files:
  - `GET /api/trash` -> List all soft-deleted folders & images.
  - `POST /api/trash/restore/{id}` -> Restore a soft-deleted item.
  - `DELETE /api/trash/permanent/{id}` -> Permanently delete from DB and GitHub.
  - Background task / startup cleanup task: Auto-delete items older than 30 days.

#### [MODIFY] [main.py](file:///d:/pwskills/Temp/git-photos/backend/app/main.py)
- Register `trash` router.
- Validate required environment variables at startup (`validate_settings()`).
- Enhance `/api/health` check endpoint to return application, database, and storage statuses.
- Periodically prune items soft-deleted for > 30 days.

---

### 3. Frontend Integration

#### [MODIFY] [index.ts](file:///d:/pwskills/Temp/git-photos/frontend/app/types/index.ts)
- Update types: change IDs and parent/folder references from `number` to `string`.

#### [MODIFY] [api.ts](file:///d:/pwskills/Temp/git-photos/frontend/app/lib/api.ts)
- Update type signatures to use `string` instead of `number` for IDs.
- Add calls for new trash, restore, permanent deletion, search, and health endpoints.

#### [MODIFY] [page.tsx](file:///d:/pwskills/Temp/git-photos/frontend/app/folder/[id]/page.tsx) & [page.tsx](file:///d:/pwskills/Temp/git-photos/frontend/app/dashboard/page.tsx)
- Use UUID strings for folder and image IDs.
- Implement **Infinite Scrolling**: Replace standard pagination buttons with an scroll/IntersectionObserver pattern that triggers fetching next pages.
- Implement **Lazy Loading** on images: Add native `loading="lazy"` to `img` tags.
- Implement **Drag-and-Drop** upload queue: Limit concurrency to a maximum of 3 uploads at once to prevent browser/server choke.
- Track upload progress per file with real-time percentage indicators.
- Implement a search bar using the partial matching indexed search API.
- Support Trash/Restore actions.

---

### 4. Deployment & Infrastructure

#### [NEW] [Dockerfile](file:///d:/pwskills/Temp/git-photos/frontend/Dockerfile)
- Multi-stage Next.js production-ready Dockerfile leveraging `standalone` output for minimal image size.

#### [MODIFY] [next.config.ts](file:///d:/pwskills/Temp/git-photos/frontend/next.config.ts)
- Add `output: "standalone"` to the configuration.

---

## Verification Plan

### Automated Tests
- Validate database schema changes using python interactive shell.
- Run tests on API health check: `/api/health`.

### Manual Verification
- Perform manual uploads of large images and MP4 files, verifying that:
  - Both original and thumbnail are uploaded to GitHub.
  - The gallery grid loads thumbnails only.
  - Viewports load images lazily.
- Delete folders and files, verifying they move to Trash and can be recovered or permanently deleted.
- Test drag and drop functionality with a batch of 10+ files to verify upload queue and concurrency limits.
