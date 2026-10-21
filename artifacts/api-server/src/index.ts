import app from "./app";
import { logger } from "./lib/logger";
import { verifyMongoConnection } from "./lib/mongo";

void verifyMongoConnection()
  .then(({ databaseName, collectionNames }) => {
    logger.info(
      { databaseName, collectionNames },
      "MongoDB Atlas connection and collection listing verified",
    );
  })
  .catch((error: unknown) => {
    logger.warn(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "MongoDB Atlas check failed; connection details were omitted",
    );
  });

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
