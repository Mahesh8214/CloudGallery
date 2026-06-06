# Personal Cloud Gallery

## Project Overview

Build a full-stack web application that functions as a personal cloud photo storage platform similar to Google Drive.

The application will allow users to:

* Authenticate with GitHub
* Select an existing private GitHub repository or create a new private repository
* Create folders and nested folders
* Upload images
* Browse folders
* Preview images
* Rename folders
* Rename images
* Delete folders
* Delete images
* Download images
* Persist all image files inside the selected private GitHub repository

AI search functionality is NOT part of Version 1 and should be designed for future integration.

---

# Primary Goal

Create a personal cloud storage application where GitHub acts as the storage backend.

The user should experience the application like:

Google Drive

or

Google Photos folder management

while the actual files are stored inside a private GitHub repository.

---

# Version 1 Features

## Authentication

### GitHub OAuth Login

Requirements:

* Login with GitHub account
* Request repository permissions
* Store access token securely
* Create user session

After login:

Display dashboard.

---

## Repository Selection

After first login:

Display:

### Option 1

Use Existing Repository

Show all private repositories.

### Option 2

Create New Repository

User enters:

* Repository Name

Example:

personal-photo-storage

Repository must be:

* Private
* Owned by authenticated user

Store:

* Repository ID
* Repository Name
* Repository Owner

inside local database.

---

# Folder Management

Support:

* Create Folder
* Rename Folder
* Delete Folder
* Nested Folders

Example:

Travel/
Goa/
Beaches/

College/
Seminar/

Family/
Wedding/

Unlimited nesting depth.

---

# Image Management

Support:

* Upload Image
* Preview Image
* Rename Image
* Delete Image
* Download Image

Allowed Formats:

* jpg
* jpeg
* png
* webp
* mp4

Maximum File Size:

100 MB

---

# Storage Structure

The GitHub repository structure must mirror folder hierarchy.

Example:

Travel/
Goa/
beach.jpg

College/
Seminar/
presentation.jpg

Family/
Wedding/
photo1.jpg

No artificial file naming.

Preserve original filenames.

---

# Application Architecture

Frontend:

* Next.js
* TypeScript
* Tailwind CSS

Backend:

* FastAPI
* Python

Database:

* SQLite

Authentication:

* GitHub OAuth

Storage:

* GitHub Private Repository

---

# Database Schema

## Users

| Field           | Type    |
| --------------- | ------- |
| id              | integer |
| github_id       | string  |
| username        | string  |
| email           | string  |
| repository_id   | string  |
| repository_name | string  |

---

## Folders

| Field       | Type     |
| ----------- | -------- |
| id          | integer  |
| name        | string   |
| parent_id   | integer  |
| github_path | string   |
| created_at  | datetime |

---

## Images

| Field       | Type     |
| ----------- | -------- |
| id          | integer  |
| filename    | string   |
| folder_id   | integer  |
| github_path | string   |
| size        | integer  |
| uploaded_at | datetime |

---

# User Interface

## Dashboard

Display:

Folders Grid

Example:

📁 Travel

📁 College

📁 Family

---

## Folder View

Example:

Travel

📁 Goa

📁 Jaipur

🖼 image1.jpg

🖼 image2.jpg

---

## Image View

When image clicked:

Open image preview modal.

Display:

* Full image
* File name
* File size
* Upload date

Actions:

* Download
* Rename
* Delete

---

# Upload Flow

User selects folder.

User clicks Upload.

Application:

1. Upload file to backend
2. Backend uploads file to GitHub repository
3. Store metadata in SQLite
4. Refresh folder contents

---

# Folder Creation Flow

User enters folder name.

Backend:

1. Create folder record
2. Create folder path
3. Persist structure in database

Folder existence should not depend on images.

Empty folders must be supported.

---

# Delete Folder Flow

When deleting folder:

Show warning.

Options:

* Delete folder only
* Delete folder and all contents

Must support recursive deletion.

---

# Performance Requirements

Do not load all images on startup.

Dashboard:

Load folders only.

Folder View:

Load first page of images.

Use pagination.

Suggested:

50 images per page.

Use lazy loading.

Generate thumbnails.

Never load full-resolution images inside grid view.

---

# Security Requirements

Repository must always be private.

Never expose GitHub access token to frontend.

Store tokens encrypted.

Validate file type before upload.

Validate file size before upload.

Protect all API routes.

---

# Error Handling

Handle:

* GitHub API rate limits
* Upload failures
* Duplicate file names
* Invalid folder names
* Repository access loss
* Network interruptions

Provide user-friendly error messages.

---

# Future Architecture Preparation

Design codebase so these features can be added later:

## AI Search

Natural Language Queries:

* beach photos
* photos with laptop
* seminar images

Future Components:

* CLIP embeddings
* ChromaDB
* Vector search

The architecture must allow future indexing of uploaded images without changing the storage layer.

---

# Deliverables

Generate:

* Complete frontend
* Complete backend
* Database models
* GitHub integration
* Authentication system
* API routes
* File upload system
* Folder management system
* Image gallery system
* Docker setup
* README
* Installation guide
* Production deployment guide

Project must be fully functional end-to-end after setup.
