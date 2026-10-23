---
name: SANAD Vercel API dependency packaging
description: Runtime dependency packaging for SANAD's Vercel API service.
---

Bundle the MongoDB driver with the API server output for Vercel. Do not externalize it unless the final deployed function is verified to include the package. For the Express entrypoint, preserve `PORT` when provided but use port `3000` when it is absent; Vercel's Express runtime supports a fixed-port listener.

**Why:** the deployed API returned `ERR_MODULE_NOT_FOUND` for `mongodb` even though it was listed as a runtime dependency, causing all API-driven pages to fail. Bundling the driver restored local API operation.

**How to apply:** when changing esbuild externals or Vercel service packaging, verify there is no unresolved bare MongoDB import in the output and exercise the health and public-worker endpoints through the running server.

**Why:** an entrypoint that throws before listening when `PORT` is absent can fail before any API route, including `/api/healthz`, is reached. Vercel's Express examples use a fixed port listener; the production exception was not available in runtime logs to confirm this was the live trigger.

**How to apply:** keep Replit's configured `PORT` behavior, use a `3000` fallback only when it is absent, and test `/api/healthz` with `PORT` unset before pushing the Vercel fix.
