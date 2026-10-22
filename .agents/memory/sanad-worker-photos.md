---
name: SANAD worker photos
description: Persistent worker profile photo storage and access constraints.
---

Keep worker photo bytes in MongoDB GridFS and store only a GridFS reference on the worker record. Expose photos through the API only when the reference still belongs to an active worker. Uploads must be authenticated as that worker or by a company member authorized for that worker.

**Why:** SANAD's API runs on Vercel and MongoDB Atlas is already the shared data store; a Replit-side storage service would not be reliably reachable by the deployed API.

**How to apply:** Reuse GridFS for future worker-photo changes, validate uploads server-side, and keep public QR links stable by resolving the worker's current photo through the API rather than embedding a photo in the QR.
