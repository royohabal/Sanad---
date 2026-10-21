---
name: SANAD MongoDB migration
description: Data migration and rollback constraints for moving SANAD runtime storage to MongoDB.
---

Copy existing SANAD records into MongoDB, verify the copy, then use MongoDB for runtime data. Keep PostgreSQL records untouched as a rollback copy. Use separate Mongo databases for development and production.

**Why:** the user chose a copy-and-switch migration and explicitly required preserving existing data.

**How to apply:** never delete PostgreSQL records as part of this migration; verify collection counts and record contents before changing the active store or environment.
