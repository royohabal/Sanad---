---
name: SANAD payment integrity
description: Product rule for demo tip statuses, provider-confirmed payments, and payroll records.
---

For SANAD, the user wants Stripe test-only checkout on the public Vercel demo and does not want to activate a live account. Vercel environment variables are separate from Replit secrets. Employer payouts remain manually recorded payroll entries. Customer amounts and stored tip records remain in KWD. If Stripe checkout requires USD, show the server-calculated conversion before redirecting and retain the KWD amount, USD checkout amount, exchange rate, and source together. Only accept test-mode API keys and test-mode sessions/events. A demo or Stripe test-mode tip is never a real payment. A real tip must not be shown as successful until Stripe confirms it. A payroll payout marked paid means the employer recorded it; SANAD does not claim that it transferred or verified funds.

For empty company and worker dashboards, any user-approved demo preview must be clearly labeled and read-only. Sample workers, tips, ratings, and payroll entries should be shown separately from production records and never persisted as real company data.

On public production worker pages, a non-demo worker may offer a local simulated-tip preview when checkout is disabled; this preview must never write a tip record. Keep persisted simulations restricted to workers explicitly marked as demo.

**Why:** a Stripe test-mode session can have a succeeded status without representing real money; status-only aggregates would incorrectly raise live totals and ratings.

**How to apply:** keep checkout fail-closed unless production test mode is explicitly enabled and a test-only key is present; never accept live-mode keys or events; persist confirmed test tips as demo-only; mark success only after verified test-mode Stripe status. Filter by both status and `isDemo` for totals, ratings, reports, and recent transactions, including legacy records without that field. Keep the signed USD conversion visible before redirecting and preserve KWD as the customer-facing amount.

**Why:** the user chose clearly labeled sample data for both company and worker dashboards without creating or altering real production records.

**How to apply:** render dashboard previews only when the account has no real activity, keep fixtures out of API mutations and reports, and explain in both languages that the examples are not saved or paid.

**Why:** the public Vercel demo needs a simulation action for real worker pages without introducing fake production tips.

**How to apply:** use browser-only state for non-demo production workers; do not call the persisted simulation endpoint unless the worker record is explicitly marked demo.

The university demonstration needs an explicit, safe production demo setup and saved simulations that update the appropriate demo totals/recent tips. Never copy development data into production automatically or seed duplicate records on deployment. Do not overwrite real workers, credentials, or payment records to make a demo account.

**Why:** the user requested the same intended demo experience on Vercel while protecting existing production data and keeping simulated tips distinct from real Stripe payments.

**How to apply:** require a company administrator's explicit opt-in in an empty/demo-only workspace; keep demo identities and activity labeled, retry-safe, and separate from real records. Provide demo access without shared credentials or access to real worker accounts.
