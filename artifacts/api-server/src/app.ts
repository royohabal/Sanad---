import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { isStripeCheckoutEnabled } from "./lib/stripePayments";
import { handleStripeWebhook, StripeWebhookError } from "./lib/stripeWebhook";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    if (!isStripeCheckoutEnabled()) {
      res.status(503).json({
        error: "Stripe payments are disabled in this public demo.",
      });
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Invalid webhook body" });
      return;
    }

    try {
      const result = await handleStripeWebhook(
        req.body,
        req.header("stripe-signature") ?? "",
      );
      req.log.info({ result }, "Stripe webhook received");
      res.status(200).json({ received: true });
    } catch (error) {
      if (error instanceof StripeWebhookError) {
        if (error.code === "configuration") {
          res.status(503).json({ error: "Stripe webhook is not configured" });
          return;
        }
        res.status(400).json({ error: "Invalid Stripe webhook" });
        return;
      }
      req.log.error(
        { errorType: error instanceof Error ? error.name : "UnknownError" },
        "Could not process Stripe webhook",
      );
      res.status(500).json({ error: "Could not process Stripe webhook" });
    }
  },
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
