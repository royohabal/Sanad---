import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sanadRouter from "./sanad";
import workerAuthRouter from "./workerAuth";
import demoSetupRouter from "./demoSetup";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workerAuthRouter);
router.use(demoSetupRouter);
router.use(sanadRouter);

export default router;
