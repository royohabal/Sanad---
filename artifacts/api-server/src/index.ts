import app from "./app";
import { logger } from "./lib/logger";
import { initializeMongoStore } from "./lib/mongoStore";

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
    logger.info(
      { databaseName, collectionNames },
      "MongoDB SANAD data store initialized",
    );
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
