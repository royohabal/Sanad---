import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sanadRouter from "./sanad";
import workerAuthRouter from "./workerAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workerAuthRouter);
router.use(sanadRouter);

export default router;
