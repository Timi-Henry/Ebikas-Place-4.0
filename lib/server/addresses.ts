import "server-only";
import { ObjectId } from "mongodb";
import { normalizePageSize, type CursorPage } from "@/lib/cursor-pagination";
import { ensureAddressIndexes } from "@/lib/server/database-indexes";
import { createdBefore, decodeMongoCursor, toCursorPage } from "@/lib/server/mongo-pagination";
import { getDb } from "@/lib/server/mongodb";
import type { DeliveryDetails, SavedAddress } from "@/lib/types";

type AddressDocument = Omit<SavedAddress, "id" | "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  houseNumber?: string;
  createdAt: Date;
  updatedAt?: Date;
};

function toAddress(doc: AddressDocument): SavedAddress {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    label: doc.label,
    fullName: doc.fullName,
    email: doc.email,
    phone: doc.phone,
    whatsapp: doc.whatsapp,
    addressLine: doc.addressLine || doc.houseNumber || "",
    street: doc.street,
    area: doc.area,
    state: "Lagos",
    address: doc.address,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt?.toISOString()
  };
}

export async function getUserAddresses(userId: string) {
  await ensureAddressIndexes();
  const db = await getDb();
  const docs = await db.collection<AddressDocument>("addresses").find({ userId }).sort({ updatedAt: -1, createdAt: -1 }).toArray();
  return docs.map(toAddress);
}

export async function getUserAddressesPage(
  userId: string,
  options: { cursor?: string; limit?: number } = {}
): Promise<CursorPage<SavedAddress>> {
  const limit = normalizePageSize(options.limit, 20, 50);
  const cursor = decodeMongoCursor(options.cursor);
  await ensureAddressIndexes();
  const db = await getDb();
  const docs = await db
    .collection<AddressDocument>("addresses")
    .find({ userId, ...createdBefore(cursor) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  return toCursorPage(docs, limit, toAddress);
}

export async function createUserAddress(userId: string, details: DeliveryDetails, label?: string) {
  await ensureAddressIndexes();
  const db = await getDb();
  const createdAt = new Date();
  const result = await db.collection<Omit<AddressDocument, "_id">>("addresses").insertOne({
    userId,
    label,
    ...details,
    createdAt,
    updatedAt: createdAt
  });

  return {
    id: result.insertedId.toString(),
    userId,
    label,
    ...details,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString()
  };
}

export async function updateUserAddress(userId: string, addressId: string, details: DeliveryDetails, label?: string) {
  if (!ObjectId.isValid(addressId)) {
    throw new Error("Address not found.");
  }

  await ensureAddressIndexes();
  const db = await getDb();
  const updatedAt = new Date();
  const result = await db.collection<AddressDocument>("addresses").findOneAndUpdate(
    { _id: new ObjectId(addressId), userId },
    { $set: { label, ...details, updatedAt } },
    { returnDocument: "after" }
  );

  if (!result) {
    throw new Error("Address not found.");
  }

  return toAddress(result);
}

export async function deleteUserAddress(userId: string, addressId: string) {
  if (!ObjectId.isValid(addressId)) {
    throw new Error("Address not found.");
  }

  await ensureAddressIndexes();
  const db = await getDb();
  const result = await db.collection("addresses").deleteOne({ _id: new ObjectId(addressId), userId });
  if (result.deletedCount === 0) {
    throw new Error("Address not found.");
  }
}
