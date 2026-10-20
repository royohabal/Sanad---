import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sanadRouter from "./sanad";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sanadRouter);

export default router;
