---
name: SANAD payment integrity
description: Product rule for demo tip statuses, provider-confirmed payments, and payroll records.
---

For SANAD, customer card tips settle to the project's connected Stripe account; employer payouts remain manually recorded payroll entries. Customer amounts and stored tip records remain in KWD. If Stripe checkout requires USD, show the server-calculated conversion before redirecting and retain the KWD amount, USD checkout amount, exchange rate, and source together. Use the connected account's payment-method configuration rather than hard-coding a `payment_method_types` list; the SANAD test connector rejects that override. A demo or Stripe test-mode tip is never a real payment. A real tip must not be shown as successful until Stripe confirms it. A payroll payout marked paid means the employer recorded it; SANAD does not claim that it transferred or verified funds.

**Why:** the user chose SANAD's connected Stripe account and later requested KWD display/storage with a visible USD checkout conversion, while keeping payment test-only and distinguishing demo data from real payments. The connected test account returned a Stripe 400 when the app explicitly set card-only payment methods.

**How to apply:** keep checkout fail-closed if the rate or Stripe is unavailable; never convert without showing the signed quote first; let the Stripe account control available payment methods; persist test-mode tips as demo-only; mark real success only after verified Stripe status.
