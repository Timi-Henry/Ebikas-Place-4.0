import { describe, expect, it, vi } from "vitest";
import { TransactionalEmailProviderError } from "@/lib/email-delivery";
import {
  OrderNotificationPermanentError,
  buildOrderNotificationEmails,
  createOrderNotificationDispatcher
} from "@/lib/order-notifications";
import type { Order } from "@/lib/types";

const order: Order = {
  id: "64b000000000000000000001",
  version: 1,
  userId: "user-1",
  customerEmail: "ada@example.com",
  customerName: "Ada <Customer>",
  customerContact: {
    fullName: "Ada <Customer>",
    email: "ada@example.com",
    phone: "+234 801 234 5678",
    whatsapp: "+234 801 234 5678"
  },
  fulfillmentMethod: "store-delivery",
  deliveryDetails: {
    fullName: "Ada <Customer>",
    email: "ada@example.com",
    phone: "+234 801 234 5678",
    whatsapp: "+234 801 234 5678",
    addressLine: "Flat 2",
    street: "Palm <script>alert(1)</script> Street",
    area: "Lekki",
    state: "Lagos",
    address: "Flat 2, Palm <script>alert(1)</script> Street, Lekki, Lagos"
  },
  items: [{
    productId: "64b000000000000000000002",
    name: "Silk <Dress>",
    price: 12_500,
    lineTotal: 25_000,
    quantity: 2,
    imageUrl: "https://example.com/dress.jpg",
    selectedSize: "M"
  }],
  subtotal: 25_000,
  currency: "NGN",
  status: "placed",
  createdAt: "2026-07-17T12:00:00.000Z",
  statusUpdatedAt: "2026-07-17T12:00:00.000Z"
};

const config = {
  adminEmail: "owner@example.com",
  siteUrl: "https://shop.example"
};

describe("order notification emails", () => {
  it("builds customer and admin messages with escaped HTML and payment-due wording", () => {
    const [customer, admin] = buildOrderNotificationEmails(order, config);

    expect(customer.to).toBe("ada@example.com");
    expect(admin.to).toBe("owner@example.com");
    expect(customer.text).toContain("Silk <Dress>, size M × 2");
    expect(customer.text).toContain("Payment is due to the store rider");
    expect(admin.text).toContain("https://shop.example/admin/orders");
    expect(customer.html).toContain("Silk &lt;Dress&gt;");
    expect(customer.html).not.toContain("<script>alert(1)</script>");
    expect(`${customer.text}\n${admin.text}`.toLowerCase()).not.toContain("payment received");
    expect(`${customer.text}\n${admin.text}\n${customer.html}\n${admin.html}`)
      .not.toMatch(/[ÃÂâ]/);
  });

  it("loads the order and sends both messages in one idempotent provider call", async () => {
    const sendMany = vi.fn().mockResolvedValue({
      messageIds: ["email-customer", "email-admin"]
    });
    const dispatch = createOrderNotificationDispatcher({
      loadOrder: vi.fn().mockResolvedValue({ order, status: "enqueued" }),
      markEnqueued: vi.fn(),
      getConfig: () => config,
      sendMany
    });

    await expect(dispatch(order.id)).resolves.toEqual({
      orderId: order.id,
      emailIds: ["email-customer", "email-admin"],
      outcome: "sent"
    });
    expect(sendMany).toHaveBeenCalledTimes(1);
    const messages = sendMany.mock.calls[0][0];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      to: "ada@example.com",
      replyTo: "owner@example.com"
    });
    expect(messages[1]).toMatchObject({
      to: "owner@example.com",
      replyTo: "ada@example.com"
    });
    expect(sendMany).toHaveBeenCalledWith(
      messages,
      { operationId: `order-placed:${order.id}` }
    );
  });

  it("surfaces retryable provider failures without including the raw provider message", async () => {
    const dispatch = createOrderNotificationDispatcher({
      loadOrder: vi.fn().mockResolvedValue({ order, status: "enqueued" }),
      markEnqueued: vi.fn(),
      getConfig: () => config,
      sendMany: vi.fn().mockRejectedValue(
        new TransactionalEmailProviderError("rate_limit_exceeded", 429)
      )
    });

    const error = await dispatch(order.id).catch((caught) => caught);
    expect(error).toBeInstanceOf(TransactionalEmailProviderError);
    expect(error).toMatchObject({ code: "rate_limit_exceeded", retryable: true });
    expect(error.message).not.toContain("provider detail");
  });

  it("treats a missing order as a permanent error without calling the provider", async () => {
    const sendMany = vi.fn();
    const dispatch = createOrderNotificationDispatcher({
      loadOrder: vi.fn().mockResolvedValue(null),
      markEnqueued: vi.fn(),
      getConfig: () => config,
      sendMany
    });

    await expect(dispatch(order.id)).rejects.toBeInstanceOf(OrderNotificationPermanentError);
    expect(sendMany).not.toHaveBeenCalled();
  });

  it("treats a missing customer email as permanent without calling the provider", async () => {
    const sendMany = vi.fn();
    const orderWithoutEmail = {
      ...order,
      customerEmail: "",
      customerContact: { ...order.customerContact, email: "" }
    };
    const dispatch = createOrderNotificationDispatcher({
      loadOrder: vi.fn().mockResolvedValue({ order: orderWithoutEmail, status: "enqueued" }),
      markEnqueued: vi.fn(),
      getConfig: () => config,
      sendMany
    });

    const error = await dispatch(order.id).catch((caught) => caught);
    expect(error).toBeInstanceOf(OrderNotificationPermanentError);
    expect(error).toMatchObject({ code: "customer_email_missing" });
    expect(sendMany).not.toHaveBeenCalled();
  });

  it("uses persistent sent state to suppress emails after provider dedupe expires", async () => {
    const sendMany = vi.fn();
    const dispatch = createOrderNotificationDispatcher({
      loadOrder: vi.fn().mockResolvedValue({ order, status: "sent" }),
      markEnqueued: vi.fn(),
      getConfig: () => config,
      sendMany
    });

    await expect(dispatch(order.id)).resolves.toEqual({
      orderId: order.id,
      emailIds: [],
      outcome: "already-handled"
    });
    expect(sendMany).not.toHaveBeenCalled();
  });

  it("suppresses stale placement email for a terminal order", async () => {
    const sendMany = vi.fn();
    const dispatch = createOrderNotificationDispatcher({
      loadOrder: vi.fn().mockResolvedValue({
        order: { ...order, status: "cancelled" },
        status: "enqueued"
      }),
      markEnqueued: vi.fn(),
      getConfig: () => config,
      sendMany
    });

    await expect(dispatch(order.id)).resolves.toEqual({
      orderId: order.id,
      emailIds: [],
      outcome: "suppressed"
    });
    expect(sendMany).not.toHaveBeenCalled();
  });

  it("repairs pending state before calling the email provider", async () => {
    const sequence: string[] = [];
    const dispatch = createOrderNotificationDispatcher({
      loadOrder: vi.fn().mockResolvedValue({ order, status: "pending" }),
      markEnqueued: vi.fn(async () => {
        sequence.push("enqueued");
      }),
      getConfig: () => config,
      sendMany: vi.fn(async () => {
        sequence.push("emailed");
        return { messageIds: ["email-customer", "email-admin"] };
      })
    });

    await dispatch(order.id);
    expect(sequence).toEqual(["enqueued", "emailed"]);
  });
});
