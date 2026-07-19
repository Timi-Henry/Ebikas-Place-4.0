import "server-only";
import { MongoClient, ServerApiVersion } from "mongodb";
import { getMongoEnvironment } from "@/lib/server/env";

let clientPromise: Promise<MongoClient> | undefined;

export async function getMongoClient() {
  if (!clientPromise) {
    const { uri } = getMongoEnvironment();
    const client = new MongoClient(uri, {
      serverApi: ServerApiVersion.v1,
      connectTimeoutMS: 10_000,
      serverSelectionTimeoutMS: 10_000
    });
    clientPromise = client.connect().catch((error) => {
      clientPromise = undefined;
      void client.close().catch(() => undefined);
      throw error;
    });
  }

  return clientPromise;
}

export async function getDb() {
  const client = await getMongoClient();
  const { dbName } = getMongoEnvironment();
  return client.db(dbName);
}
