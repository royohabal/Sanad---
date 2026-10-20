---
name: SANAD payment integrity
description: Product rule for demo tip statuses, provider-confirmed payments, and payroll records.
---

For SANAD, customer card tips settle to the project's connected Stripe account; employer payouts remain manually recorded payroll entries. A demo or Stripe test-mode tip is never a real payment. A real tip must not be shown as successful until Stripe confirms it. A payroll payout marked paid means the employer recorded it; SANAD does not claim that it transferred or verified funds.

**Why:** the user chose this settlement path and requires clear separation between demo data, gateway-settled tips, and employer-recorded payroll, with no simulated production payments.

**How to apply:** keep checkout fail-closed when Stripe is unavailable or cannot accept KWD; never silently convert tip currency; persist test-mode tips as demo-only; mark real success only after verified Stripe status.
