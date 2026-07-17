import type { OrderStatus } from "@/lib/types";

export const orderStatusLabels: Record<OrderStatus, string> = {
  placed: "Order placed",
  confirmed: "Order confirmed",
  rejected: "Order rejected",
  "out-for-delivery": "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

export const cancellableOrderStatuses: OrderStatus[] = ["placed", "confirmed"];

export type OrderStatusCategory = "all" | "cancelled" | "rejected" | "out-for-delivery" | "delivered";

export const orderStatusCategories: Array<{ value: OrderStatusCategory; label: string; status?: OrderStatus }> = [
  { value: "all", label: "All orders" },
  { value: "cancelled", label: "Canceled", status: "cancelled" },
  { value: "rejected", label: "Rejected", status: "rejected" },
  { value: "out-for-delivery", label: "Out for delivery", status: "out-for-delivery" },
  { value: "delivered", label: "Delivered", status: "delivered" }
];

export function canCustomerCancelOrder(status: OrderStatus) {
  return cancellableOrderStatuses.includes(status);
}

export function matchesOrderStatusCategory(status: OrderStatus, category: OrderStatusCategory) {
  if (category === "all") return true;
  return status === category;
}
