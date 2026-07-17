import "server-only";
import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ebikas_place";

let clientPromise: Promise<MongoClient> | undefined;

export async function getDb() {
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (!clientPromise) {
    const client = new MongoClient(uri, {
      serverApi: ServerApiVersion.v1
    });
    clientPromise = client.connect();
  }

  const client = await clientPromise;
  return client.db(dbName);
}
