import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let connected: Promise<MongoClient> | null = null;

export function getMongoDatabaseName(): string {
  return process.env.NODE_ENV === "production" ? "sanad" : "sanad_dev";
}

export async function getMongoDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  client ??= new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
  connected ??= client.connect().catch((error: unknown) => {
    connected = null;
    throw error;
  });
  await connected;
  return client.db(getMongoDatabaseName());
}

export async function closeMongoConnection(): Promise<void> {
  if (client) await client.close();
  client = null;
  connected = null;
}

export async function verifyMongoConnection(): Promise<{
  databaseName: string;
  collectionNames: string[];
}> {
  const database = await getMongoDb();
  await database.command({ ping: 1 });
  const collections = await database
    .listCollections({}, { nameOnly: true })
    .toArray();

  return {
    databaseName: database.databaseName,
    collectionNames: collections.map(({ name }) => name).sort(),
  };
}
