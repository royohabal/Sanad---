---
name: SANAD payment integrity
description: Product rule for demo tip statuses, provider-confirmed payments, and payroll records.
---

For SANAD, customer card tips use manual Stripe test-mode credentials for publishing; do not require or activate a live Stripe account. Employer payouts remain manually recorded payroll entries. Customer amounts and stored tip records remain in KWD. If Stripe checkout requires USD, show the server-calculated conversion before redirecting and retain the KWD amount, USD checkout amount, exchange rate, and source together. Only accept test-mode API keys and test-mode sessions/events. A demo or Stripe test-mode tip is never a real payment. A real tip must not be shown as successful until Stripe confirms it. A payroll payout marked paid means the employer recorded it; SANAD does not claim that it transferred or verified funds.

**Why:** the user requested KWD display/storage with a visible USD checkout conversion, wants the published app to remain test-only, and chose manual Stripe test credentials because Replit's publishing checklist requires live-account activation for its sandbox connector.

**How to apply:** keep checkout fail-closed if the rate or Stripe is unavailable; never convert without showing the signed quote first; use a test-only API key with an explicit mode guard; persist test-mode tips as demo-only; mark success only after verified test-mode Stripe status.
