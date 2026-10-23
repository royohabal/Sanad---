import { getAuth } from "@clerk/express";
import { Router, type Request } from "express";
import { DemoSetupConflict, setupCompanyDemoData } from "../lib/demoSetup";
import { getCompanyMembership, getCompanyById, getWorkerById } from "../lib/mongoStore";
import { createWorkerSession } from "../lib/workerAuth";

const router = Router();

function sameOrigin(req: Request) {
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    return [req.get("host"), req.get("x-forwarded-host")?.split(",")[0]?.trim()]
      .includes(new URL(origin).host);
  } catch { return false; }
}

router.post("/company/demo-setup", async (req, res) => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  if (!sameOrigin(req) || !req.is("application/json") || req.body?.confirm !== true) {
    res.status(400).json({ error: "Explicit confirmation is required." }); return;
  }
  const membership = await getCompanyMembership(userId);
  if (!membership || membership.role !== "company_admin") {
    res.status(403).json({ error: "Company administrator access is required." }); return;
  }
  if (!await getCompanyById(membership.companyId)) {
    res.status(404).json({ error: "Company not found." }); return;
  }
  try {
    res.json(await setupCompanyDemoData(membership.companyId, userId));
  } catch (error) {
    if (error instanceof DemoSetupConflict) {
      res.status(409).json({ error: error.message }); return;
    }
    req.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Demo setup failed");
    res.status(503).json({ error: "Demo setup could not finish. It is safe to retry." });
  }
});

// A company owner may enter only their own active demo worker's account.
// This never grants access to a real worker and never changes worker credentials.
router.post("/company/workers/:workerId/demo-session", async (req, res) => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  if (!sameOrigin(req) || !req.is("application/json")) {
    res.status(400).json({ error: "Use this SANAD site to open the demo." }); return;
  }
  const membership = await getCompanyMembership(userId);
  const worker = await getWorkerById(String(req.params.workerId));
  if (!membership || membership.role !== "company_admin" || !worker ||
    worker.companyId !== membership.companyId || worker.isDemo !== true ||
    worker.status !== "active" || worker.passwordChangeRequired) {
    res.status(403).json({ error: "Only your company's active demo workers can be opened here." }); return;
  }
  await createWorkerSession(req, res, worker.id, "active", 30 * 60 * 1000);
  res.json({ isDemo: true });
});

export default router;
