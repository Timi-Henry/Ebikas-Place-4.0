import type { FulfillmentMethod } from "@/lib/types";

export const storePickupAddress = "No. 19 Remoye Street, Akowonjo, Lagos State";

export const fulfillmentLabels: Record<FulfillmentMethod, string> = {
  "store-delivery": "Have Ebikas Place deliver",
  "customer-rider": "Send your own rider"
};

export const fulfillmentPaymentNotes: Record<FulfillmentMethod, string> = {
  "store-delivery": "Pay the rider when your order gets to you.",
  "customer-rider": "Your rider pays at our location before the product is released."
};
