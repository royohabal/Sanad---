import app from "./app";
import { logger } from "./lib/logger";
import {
  initializeMongoStore,
  normalizeDemoCompanyTransactionSamples,
  normalizeDemoWorkerNames,
} from "./lib/mongoStore";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  try {
    const { databaseName, collectionNames } = await initializeMongoStore();
    const renamedDemoWorkers = await normalizeDemoWorkerNames();
    const demoSampleUpdates = await normalizeDemoCompanyTransactionSamples();
    logger.info(
      { databaseName, collectionNames },
      "MongoDB SANAD data store initialized",
    );
    if (renamedDemoWorkers > 0) {
      logger.info(
        { renamedDemoWorkers },
        "Updated demo worker names",
      );
    }
    if (demoSampleUpdates.addedWorkers > 0 || demoSampleUpdates.reassignedTips > 0) {
      logger.info(
        demoSampleUpdates,
        "Updated development demo transaction samples",
      );
    }
  } catch (error) {
    logger.fatal(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "MongoDB SANAD data store initialization failed; connection details were omitted",
    );
    process.exit(1);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void startServer();
