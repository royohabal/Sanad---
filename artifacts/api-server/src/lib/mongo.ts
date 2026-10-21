import { MongoClient } from "mongodb";

let client: MongoClient | null = null;

export async function verifyMongoConnection(): Promise<{
  databaseName: string;
  collectionNames: string[];
}> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  client ??= new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
  await client.connect();

  const database = client.db();
  await database.command({ ping: 1 });
  const collections = await database
    .listCollections({}, { nameOnly: true })
    .toArray();

  return {
    databaseName: database.databaseName,
    collectionNames: collections.map(({ name }) => name).sort(),
  };
}
