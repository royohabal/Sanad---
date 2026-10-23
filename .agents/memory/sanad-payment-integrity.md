---
name: SANAD payment integrity
description: Product rule for demo tip statuses, provider-confirmed payments, and payroll records.
---

For SANAD, the user wants Stripe test-only checkout on the public Vercel demo and does not want to activate a live account. Vercel environment variables are separate from Replit secrets. Employer payouts remain manually recorded payroll entries. Customer amounts and stored tip records remain in KWD. If Stripe checkout requires USD, show the server-calculated conversion before redirecting and retain the KWD amount, USD checkout amount, exchange rate, and source together. Only accept test-mode API keys and test-mode sessions/events. A demo or Stripe test-mode tip is never a real payment. A real tip must not be shown as successful until Stripe confirms it. A payroll payout marked paid means the employer recorded it; SANAD does not claim that it transferred or verified funds.

For an empty company dashboard, any user-approved demo preview must be clearly labeled and read-only. Sample workers, tips, and payroll entries should be shown separately from production records and never persisted as real company data.

**Why:** a Stripe test-mode session can have a succeeded status without representing real money; status-only aggregates would incorrectly raise live totals and ratings.

**How to apply:** keep checkout fail-closed unless production test mode is explicitly enabled and a test-only key is present; never accept live-mode keys or events; persist confirmed test tips as demo-only; mark success only after verified test-mode Stripe status. Filter by both status and `isDemo` for totals, ratings, reports, and recent transactions, including legacy records without that field. Keep the signed USD conversion visible before redirecting and preserve KWD as the customer-facing amount.

**Why:** the user chose labeled sample company-dashboard data that does not create or alter real production records.

**How to apply:** render any company-dashboard preview only when the account is empty, keep its fixtures out of API mutations and reports, and explain in both languages that the examples are not saved or paid.
