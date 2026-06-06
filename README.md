# ☁️ CloudGallery — Personal Photo Vault

CloudGallery is a full-stack, self-hosted photo storage and folder management platform designed to give you a Google Photos/Drive-like experience while using your own **private GitHub repository** as the primary storage engine. 

All your media files, folder hierarchies, and metadata are securely persisted. Security keys and GitHub OAuth tokens are encrypted at rest, ensuring absolute ownership and control over your files.

---

## 🏗️ Architecture & Component Detail

```
                     ┌────────────────────────┐
                     │    Next.js Frontend    │
                     │    (Port 3000 / Web)   │
                     └───────────┬────────────┘
                                 │ HTTP / JSON
                                 ▼
                     ┌────────────────────────┐
                     │    FastAPI Backend     │
                     │  (Port 8000 / Uvicorn)  │
                     └───────┬──────────┬─────┘
                             │          │
         SQLite / PostgreSQL │          │ GitHub Contents API
          (Metadata Indexes) │          │ (Token Encrypted)
                             ▼          ▼
                     ┌───────────┐  ┌───────────┐
                     │ Database  │  │  GitHub   │
                     └───────────┘  └───────────┘
```

### 1. Backend Components (`backend/app`)

*   **`services/storage.py` (`StorageService`):** Crucial transaction-safety engine. It pairs database commits with GitHub API commits. If a file upload to GitHub succeeds but the database registration fails, it triggers an automatic compensation rollback on GitHub to prevent orphaned files.
*   **`services/github.py` (`GitHubService`):** Interface to GitHub's REST API. It handles directory content fetching, repository creation, token validation, and raw content downloads with built-in rate-limiting detection and exponential backoff retry.
*   **`services/thumbnail.py` (`ThumbnailService`):** Auto-generates lightweight JPEG thumbnails. Integrates Pillow for photos (JPEG, PNG, WebP) and executes background `ffmpeg` subprocesses to extract the first frame of MP4 videos.
*   **`services/encryption.py` (`EncryptionService`):** Secures access tokens. It uses Fernet symmetric cryptography to ensure GitHub OAuth tokens are never saved as plain text.
*   **`routers/trash.py` & `main.py` Cleanup:** Manages the recovery trash bin. A background worker runs every 24 hours to automatically prune items that have been soft-deleted (`deleted_at` timestamp) for more than 30 days.

### 2. Frontend Components (`frontend/app`)

*   **`/folder/[id]/page.tsx` (Folder View):** The primary workspace. Includes an `IntersectionObserver` sentinel for infinite scroll pagination, a drag-and-drop file uploader, and a **concurrent upload queue** that manages up to 3 parallel uploads with independent progress tracking.
*   **`/search/page.tsx` (Global Search):** Performs index lookup against the database, enabling instant search by filename keyword or extension without stressing the GitHub API.
*   **`/trash/page.tsx` (Trash Bin):** Displays soft-deleted items. Restoring a file automatically reconstructs its folder ancestry if the parent folders were also deleted.
*   **`/activity/page.tsx` (Activity Log):** Displays chronological logs of uploads, renames, deletes, and restores.

---

## ⚡ Key Features

*   🔐 **Secure GitHub OAuth & Token Encryption:** Log in with GitHub or register using local credentials and securely link a Personal Access Token.
*   📁 **Nested Folder Architectures:** Create, rename, delete, and navigate recursive directory structures.
*   📤 **Concurrent Uploads with Speed Tracking:** Batch-upload photos and videos in parallel (max 3) with real-time speed calculation (e.g., `MB/s`) and individual progress bars.
*   🎥 **Multi-media Lightbox:** Fluid lightbox gallery with support for image zoom and inline video playback.
*   🗑️ **Trash Bin & Safe Recovery:** Restore soft-deleted items or let the backend auto-clean items older than 30 days.

---

## ⚙️ Local Development Setup

### Prerequisites
*   Node.js 18+ & npm
*   Python 3.11+
*   FFmpeg (optional, required to generate video thumbnails)

### 1. Configure the Environment
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```

Generate a secure Fernet Encryption Key:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
Place the generated key under `ENCRYPTION_KEY` in your `.env`.

### 2. Set up GitHub OAuth
1. Create a developer OAuth App in [GitHub Developer Settings](https://github.com/settings/developers).
2. Set the Authorization Callback URL to `http://localhost:8000/api/auth/callback`.
3. Set the Homepage URL to `http://localhost:3000`.
4. Copy the Client ID and Secret to `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`.

### 3. Run the Backend
```bash
cd backend
python -m venv venv
# On Windows
.\venv\Scripts\activate
# On macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 4. Run the Frontend
```bash
cd ../frontend
npm install
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 🐳 Running with Docker

Deploy locally in a single command using Docker Compose:
```bash
docker-compose up --build
```
This launches the database, runs migrations, exposes the frontend at `http://localhost:3000` and the backend at `http://localhost:8000`.

---

## 🚀 Step-by-Step Free Cloud Deployment

Follow these instructions to host the entire stack for free without credit card constraints.

### 1. Database (Supabase Free PostgreSQL)
*Render's free tier is stateless and does not support persistent SQLite files. We will use Supabase instead.*
1. Create an account on [Supabase](https://supabase.com/).
2. Start a new database project. Note down your **Database Password**.
3. Under **Project Settings ➔ Database**, copy your connection string URI:
   `postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres`

### 2. Backend (Render Free Web Service)
1. Sign up on [Render](https://render.com/).
2. Create a **New Web Service** and connect your GitHub repository.
3. Configure the settings:
   * **Root Directory:** `backend`
   * **Runtime:** `Python`
   * **Build Command:** `pip install -r requirements.txt`
   * **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port 10000`
4. Under **Environment**, add the keys:
   * `DATABASE_URL` = (Your Supabase PostgreSQL URI string)
   * `GITHUB_CLIENT_ID` = (Your production GitHub OAuth client ID)
   * `GITHUB_CLIENT_SECRET` = (Your production GitHub OAuth client secret)
   * `SECRET_KEY` = (A secure random string)
   * `ENCRYPTION_KEY` = (Your generated Fernet key)
   * `FRONTEND_URL` = `https://your-app.vercel.app` *(update later with Vercel's domain)*
   * `GITHUB_REDIRECT_URI` = `https://your-backend.onrender.com/api/auth/callback` *(update with your Render URL)*

### 3. Frontend (Vercel Free Hosting)
1. Go to [Vercel](https://vercel.com/) and connect your GitHub repository.
2. Select the repository and edit the **Root Directory** settings to point to `frontend`.
3. Add the environment variable:
   * `NEXT_PUBLIC_API_URL` = `https://your-backend.onrender.com/api` (Your backend Render URL)
4. Click **Deploy**. Vercel will build and assign you a free `vercel.app` domain. 
5. Go back to Render and GitHub developer settings to replace any placeholder URL with your final Vercel frontend URL.

---

## 🔮 Future Roadmap

*   **⚡ AI Semantic Search:** Integrates CLIP embeddings + ChromaDB vector indexes to search your gallery using descriptive natural language query prompts (e.g., "sunset on the beach").
*   **👥 Shared Galleries:** Create private access links for specific folders to securely share selected albums with family or collaborators.
*   **🏷️ EXIF Metadata Extractor:** Extracts GPS coordinates, camera models, and shoot timestamps to generate map views and search filters.
*   **🔄 Automatic sync client:** Desktop/Mobile cron services to automatically back up local camera rolls directly to your private GitHub vault.
