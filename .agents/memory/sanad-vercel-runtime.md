---
name: SANAD Vercel API dependency packaging
description: Runtime dependency packaging for SANAD's Vercel API service.
---

Bundle the MongoDB driver with the API server output for Vercel. Do not externalize it unless the final deployed function is verified to include the package.

**Why:** the deployed API returned `ERR_MODULE_NOT_FOUND` for `mongodb` even though it was listed as a runtime dependency, causing all API-driven pages to fail. Bundling the driver restored local API operation.

**How to apply:** when changing esbuild externals or Vercel service packaging, verify there is no unresolved bare MongoDB import in the output and exercise the health and public-worker endpoints through the running server.
