import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { parseCustomerContact, parseDeliveryDetails } from "@/lib/address-validation";
import { storePickupAddress } from "@/lib/order-fulfillment";
import { createUserAddress, getUserAddresses } from "@/lib/server/addresses";
import { createOrder, getUserOrders } from "@/lib/server/orders";
import type { CustomerContact, DeliveryDetails, FulfillmentMethod, OrderItem, SavedAddress } from "@/lib/types";

function parseOrderItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const productId = String(record.productId || record.id || "").trim();
      const name = String(record.name || "").trim();
      const imageUrl = String(record.imageUrl || "").trim();
      const price = Number(record.price);
      const quantity = Number(record.quantity);
      const selectedSize = typeof record.selectedSize === "string" ? record.selectedSize : undefined;

      if (!productId || !name || !imageUrl || !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) {
        return null;
      }

      return { productId, name, imageUrl, price, quantity, selectedSize } as OrderItem;
    })
    .filter((item): item is OrderItem => Boolean(item));
}

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const orders = await getUserOrders(user.id);
  return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const items = parseOrderItems(body?.items);
  if (items.length === 0) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
  }

  const fulfillmentMethod: FulfillmentMethod = body?.fulfillmentMethod === "customer-rider" ? "customer-rider" : "store-delivery";
  const savedAddressId = typeof body?.addressId === "string" ? body.addressId : "";
  let savedAddress: SavedAddress | null | undefined = null;
  let customerContact: CustomerContact | null = null;
  let deliveryDetails: DeliveryDetails | undefined;

  if (fulfillmentMethod === "store-delivery" && savedAddressId) {
    savedAddress = (await getUserAddresses(user.id)).find((address) => address.id === savedAddressId);
    deliveryDetails = savedAddress || undefined;
    customerContact = deliveryDetails || null;
  } else if (fulfillmentMethod === "store-delivery") {
    const parsedDeliveryDetails = parseDeliveryDetails(body?.deliveryDetails);
    deliveryDetails = parsedDeliveryDetails || undefined;
    customerContact = parsedDeliveryDetails;
    if (deliveryDetails && body?.saveAddress !== false) {
      savedAddress = await createUserAddress(user.id, deliveryDetails, "Checkout address");
      deliveryDetails = savedAddress;
      customerContact = savedAddress;
    }
  } else {
    customerContact = parseCustomerContact(body?.customerContact || body?.deliveryDetails);
  }

  if (fulfillmentMethod === "store-delivery" && !deliveryDetails) {
    return NextResponse.json({ error: "Enter a valid Lagos delivery address and contact details." }, { status: 400 });
  }

  if (!customerContact) {
    return NextResponse.json({ error: "Enter your full name, email, phone number, and WhatsApp number." }, { status: 400 });
  }

  const order = await createOrder({
    userId: user.id,
    customerEmail: customerContact.email,
    customerName: customerContact.fullName,
    customerContact,
    fulfillmentMethod,
    deliveryDetails,
    pickupAddress: fulfillmentMethod === "customer-rider" ? storePickupAddress : undefined,
    items
  });

  return NextResponse.json({ order, savedAddress: savedAddress || null }, { status: 201 });
}
