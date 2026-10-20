---
name: SANAD payment integrity
description: Product rule for demo tip statuses, provider-confirmed payments, and payroll records.
---

For SANAD, a demo tip is never a real payment. A real tip must not be shown as successful until the payment provider confirms it. A payroll payout marked paid means the employer recorded it; SANAD does not claim that it transferred or verified funds.

**Why:** the user requires clear separation between demo data, gateway-settled tips, and employer-recorded payroll, with no simulated production payments.

**How to apply:** keep checkout fail-closed when no provider is configured; persist demos as demo-only records; when payments are connected, set real success only from a verified provider event.
