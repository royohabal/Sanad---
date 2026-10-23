# SANAD Vercel demo diagnosis and deployment

## Confirmed differences (2026-10-23)

- GitHub `main` and Vercel's promoted production deployment were both at `c7287d45`. The workspace was two commits ahead: a company-tab demo-preview feature and an attachment cleanup. There were no uncommitted changes before this fix.
- The stable production domain is **https://sanad-beta-bay.vercel.app**. Old deployment-specific Vercel URLs continue serving their old builds; use the stable domain after a new deployment.
- Replit uses MongoDB database `sanad_dev`; production uses `sanad`. Creating a company in development auto-creates demo workers/tips/payroll. Production company onboarding does not do that.
- Empty-dashboard examples are client-side read-only fixtures. They are not MongoDB records or sign-in accounts. The two development worker slugs checked against production returned application JSON `404 Worker not found`.
- The persisted simulation endpoint exists on GitHub `main`. It is public but accepts only active `isDemo: true` workers. It stores `status: demo`, `isDemo: true`, and null Stripe identifiers. It does not call Stripe. Real-worker public previews remain browser-only.
- Vercel project configuration uses the repository root and `services` framework. `vercel.json` defines the API service under `artifacts/api-server` and Vite service under `artifacts/sanad`; frontend output is `dist/public`, `BASE_PATH=/`, and same-origin `/api/*` requests are routed to the API service. No API URL override is needed.
- Vercel reported the latest build READY/PROMOTED. Build events did not contain the old missing-MongoDB-module error. Runtime-log queries timed out after five minutes, so the earlier screenshot's 500 was not verified as a current failure. Unauthenticated dashboard checks correctly returned 401.

## Safe demo setup added

1. Sign in to an empty company workspace and open **Overview**.
2. Read and check the demo setup confirmation, then press **Set up demo team**.
3. The action adds six demo workers, labeled simulated tips, and sample payroll entries. It never sends money, changes real workers, or overwrites existing records. Stable record IDs and insert-only upserts make retries safe. Existing development demo teams are reused.
4. Select a demo worker, then choose **Open demo tip page** or **Open worker demo**.
5. The owner-only worker-demo action opens a 30-minute HttpOnly session for that company's active demo worker. It creates no shared password and grants no access to real workers.
6. On a demo tipping page, choose an amount and press **Simulate Tip**. The saved demo record updates worker/company totals and transaction lists on reload/refocus. Confirmation names the full demo worker and states that no real payment occurred.

The setup action is intentionally unavailable for a workspace containing real workers. Use a separate empty company account for the university demonstration. No setup runs during deployment. Existing production records were not changed during diagnosis or implementation.

## Environment variables

Vercel production/preview already had these key names configured; their values were not inspected:

- `MONGODB_URI`
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- `SESSION_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

**No new variables are required for simulation or explicit demo setup.**

Stripe test checkout remains separate. Only if test checkout is desired, configure both `SANAD_STRIPE_TEST_CHECKOUT_ENABLED=true` (API) and `VITE_STRIPE_TEST_CHECKOUT_ENABLED=true` (frontend build), with test-only Stripe keys/webhooks. These flags are not needed for simulated tips. Do not use live Stripe keys.

## Deploy

1. Commit the changed files in Replit's Git panel, then push `main` yourself (`git push origin main`). The existing local commits must be included too.
2. Let Vercel finish its automatic production deployment. Check that the deployment commit matches the pushed commit.
3. Open the stable production domain above, not a previous deployment-specific URL.
4. Sign in, open Company Overview, and explicitly set up the demo team once. Test its new tip link and worker-demo link.

No Vercel build-setting changes or production database migration are required.

## Verification commands

```sh
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/sanad run typecheck
pnpm --filter @workspace/api-server exec tsx --test src/lib/demoSetup.test.ts
pnpm --filter @workspace/api-server run build
PORT=26138 BASE_PATH=/ pnpm --filter @workspace/sanad run build
```

Unit checks cover deterministic demo-only documents, idempotent/partial retries, conflict protection for real records, and reuse of legacy demo teams. Browser testing is performed only against Replit development; the updated Vercel version cannot be verified until these changes are pushed and deployed.

### Completed verification

- Four native unit tests passed; API/client type checks and both production builds passed.
- A fresh, isolated company in `sanad_dev` went from zero workers to six workers, 36 demo tips, and two demo payroll examples. Retrying did not add records. Initial setup plus retry completed in about 3.3 seconds after batching database operations for serverless request limits.
- The browser journey passed: owner-only 30-minute demo worker session; Worker Earnings/Transactions/Payouts/QR; Company Workers/Transactions/Payouts/Reports; English/Arabic display.
- A KWD 0.500 simulation increased worker and company totals by exactly KWD 0.500 and added a Demo transaction. Identical request replay returned the same tip ID; changed details with that ID returned 409. No Stripe checkout/charge request was made.
- Anonymous demo-session access returned 401 and a non-owned/nonexistent demo worker returned 403.
- Test records were added only to isolated development companies. No production records were created, changed, or deleted.

## Files changed

Application code:

- `artifacts/api-server/src/lib/demoSetup.ts`
- `artifacts/api-server/src/lib/demoSetup.test.ts`
- `artifacts/api-server/src/lib/workerAuth.ts`
- `artifacts/api-server/src/routes/demoSetup.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/sanad.ts`
- `artifacts/sanad/src/components/company-demo-setup.tsx`
- `artifacts/sanad/src/App.tsx`
- `artifacts/sanad/src/sanad.css`
- `lib/api-client-react/src/index.ts`
- `lib/api-spec/openapi.yaml`

Regenerated API contracts:

- `lib/api-client-react/src/generated/api.ts`
- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/index.ts`
- `lib/api-zod/src/generated/types/companyDemoSetupRequest.ts`
- `lib/api-zod/src/generated/types/companyDemoWorkerSessionRequest.ts`
- `lib/api-zod/src/generated/types/openCompanyDemoWorkerSession200.ts`
- `lib/api-zod/src/generated/types/setupCompanyDemo200.ts`

Documentation/project guidance:

- `docs/vercel-demo-deployment.md`
- `.agents/memory/sanad-payment-integrity.md`

If a signed-in production request still returns 500 after deployment, provide its **Vercel Runtime Log** entry filtered to the new deployment and failing `/api/...` path: timestamp, status, request ID, and error/stack. Redact credentials and connection strings. Build warnings or an old deployment's browser console do not identify the current runtime error.
