import {
  isPermanentTransactionalEmailError,
  type TransactionalEmailMessage,
  type TransactionalEmailResult
} from "@/lib/email-delivery";
import type { Order } from "@/lib/types";

export type OrderNotificationConfig = {
  adminEmail: string;
  siteUrl: string;
};

type OrderNotificationDependencies = {
  loadOrder(orderId: string): Promise<{
    order: Order;
    status: "pending" | "enqueued" | "sent" | "suppressed";
  } | null>;
  markEnqueued(orderId: string): Promise<void>;
  getConfig(): OrderNotificationConfig;
  sendMany(
    messages: readonly TransactionalEmailMessage[],
    options: { operationId: string }
  ): Promise<TransactionalEmailResult>;
};

export type OrderNotificationPermanentCode = "customer_email_missing" | "order_not_found";

export class OrderNotificationPermanentError extends Error {
  constructor(public readonly code: OrderNotificationPermanentCode) {
    super(`Order notification cannot be sent (${code}).`);
    this.name = "OrderNotificationPermanentError";
  }
}

export function isPermanentOrderNotificationError(error: unknown) {
  return error instanceof OrderNotificationPermanentError || isPermanentTransactionalEmailError(error);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] || character);
}

const currencyFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos"
});

function formatCurrency(amount: number) {
  return currencyFormatter.format(amount);
}

function orderNumber(order: Order) {
  return order.id.slice(-8).toUpperCase();
}

function fulfillmentDetails(order: Order) {
  if (order.fulfillmentMethod === "customer-rider") {
    const pickup = order.pickupAddress || "Ebika's Place";
    return {
      label: "Customer rider pickup",
      location: pickup,
      payment: "Your rider can pay when they collect the order."
    };
  }

  return {
    label: "Store delivery",
    location: order.deliveryDetails?.address || "The delivery address saved with this order",
    payment: "Payment is due to the store rider when the order arrives."
  };
}

function itemText(order: Order) {
  return order.items.map((item) => {
    const size = item.selectedSize ? `, size ${item.selectedSize}` : "";
    return `${item.name}${size} × ${item.quantity} — ${formatCurrency(item.lineTotal)}`;
  });
}

function itemRows(order: Order) {
  return order.items.map((item) => {
    const size = item.selectedSize ? ` · Size ${escapeHtml(item.selectedSize)}` : "";
    return `<tr>
      <td style="padding:12px 0;border-bottom:1px solid #e6e8ee;color:#182033;">${escapeHtml(item.name)}<br><span style="font-size:12px;color:#687086;">Qty ${item.quantity}${size}</span></td>
      <td style="padding:12px 0;border-bottom:1px solid #e6e8ee;text-align:right;color:#182033;white-space:nowrap;">${escapeHtml(formatCurrency(item.lineTotal))}</td>
    </tr>`;
  }).join("");
}

function emailShell(preheader: string, heading: string, content: string) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f3f5f9;font-family:Arial,sans-serif;color:#182033;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f9;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(21,31,54,.08);">
          <tr><td style="background:#172033;padding:22px 28px;color:#ffffff;font-size:20px;font-weight:700;">Ebika's Place</td></tr>
          <tr><td style="padding:30px 28px;">
            <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#172033;">${escapeHtml(heading)}</h1>
            ${content}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function buildOrderNotificationEmails(
  order: Order,
  config: Pick<OrderNotificationConfig, "adminEmail" | "siteUrl">
): [TransactionalEmailMessage, TransactionalEmailMessage] {
  const number = orderNumber(order);
  const total = formatCurrency(order.subtotal);
  const fulfillment = fulfillmentDetails(order);
  const placedAt = dateFormatter.format(new Date(order.createdAt));
  const rows = itemRows(order);
  const lines = itemText(order).join("\n");
  const customerEmail = order.customerContact.email || order.customerEmail || "";

  const customerHtml = emailShell(
    `We received order #${number}.`,
    `Thanks, ${order.customerContact.fullName}`,
    `<p style="margin:0 0 18px;line-height:1.65;color:#4d566b;">We received your order <strong>#${escapeHtml(number)}</strong> on ${escapeHtml(placedAt)}. We will contact you when it is confirmed.</p>
     <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:8px 0 18px;">${rows}
       <tr><td style="padding:16px 0 0;font-weight:700;">Total</td><td style="padding:16px 0 0;text-align:right;font-size:18px;font-weight:700;">${escapeHtml(total)}</td></tr>
     </table>
     <div style="padding:16px;border-radius:12px;background:#f4f7fb;color:#3e485e;line-height:1.55;"><strong>${escapeHtml(fulfillment.label)}</strong><br>${escapeHtml(fulfillment.location)}<br>${escapeHtml(fulfillment.payment)}</div>`
  );

  const customerText = [
    `Thanks, ${order.customerContact.fullName}.`,
    `We received order #${number} on ${placedAt}. We will contact you when it is confirmed.`,
    "",
    lines,
    `Total: ${total}`,
    "",
    fulfillment.label,
    fulfillment.location,
    fulfillment.payment
  ].join("\n");

  const adminHtml = emailShell(
    `New order #${number} for ${total}.`,
    `New order #${number}`,
    `<p style="margin:0 0 18px;line-height:1.65;color:#4d566b;"><strong>${escapeHtml(order.customerContact.fullName)}</strong> placed an order on ${escapeHtml(placedAt)}.</p>
     <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:8px 0 18px;">${rows}
       <tr><td style="padding:16px 0 0;font-weight:700;">Total</td><td style="padding:16px 0 0;text-align:right;font-size:18px;font-weight:700;">${escapeHtml(total)}</td></tr>
     </table>
     <div style="padding:16px;border-radius:12px;background:#f4f7fb;color:#3e485e;line-height:1.55;">
       <strong>Customer</strong><br>${escapeHtml(order.customerContact.email)}<br>${escapeHtml(order.customerContact.phone)} · WhatsApp ${escapeHtml(order.customerContact.whatsapp)}<br><br>
       <strong>${escapeHtml(fulfillment.label)}</strong><br>${escapeHtml(fulfillment.location)}<br>${escapeHtml(fulfillment.payment)}
     </div>
     <p style="margin:22px 0 0;"><a href="${escapeHtml(config.siteUrl)}/admin/orders" style="display:inline-block;border-radius:10px;background:#172033;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:700;">Review order</a></p>`
  );

  const adminText = [
    `New order #${number} — ${total}`,
    `${order.customerContact.fullName} placed this order on ${placedAt}.`,
    `${order.customerContact.email} | ${order.customerContact.phone} | WhatsApp ${order.customerContact.whatsapp}`,
    "",
    lines,
    `Total: ${total}`,
    "",
    fulfillment.label,
    fulfillment.location,
    fulfillment.payment,
    `${config.siteUrl}/admin/orders`
  ].join("\n");

  return [
    {
      to: customerEmail,
      toName: order.customerContact.fullName,
      replyTo: config.adminEmail,
      subject: `We received your Ebika's Place order #${number}`,
      html: customerHtml,
      text: customerText,
      tags: ["order", "customer"]
    },
    {
      to: config.adminEmail,
      replyTo: customerEmail,
      subject: `New order #${number} — ${total}`,
      html: adminHtml,
      text: adminText,
      tags: ["order", "admin"]
    }
  ];
}

export function createOrderNotificationDispatcher(dependencies: OrderNotificationDependencies) {
  return async function dispatchOrderNotification(orderId: string) {
    const record = await dependencies.loadOrder(orderId);
    if (!record) throw new OrderNotificationPermanentError("order_not_found");
    const { order } = record;

    if (record.status === "sent" || record.status === "suppressed") {
      return { orderId: order.id, emailIds: [], outcome: "already-handled" as const };
    }

    if (order.status === "cancelled" || order.status === "rejected") {
      return { orderId: order.id, emailIds: [], outcome: "suppressed" as const };
    }

    // If Inngest accepted the event but the producer lost its acknowledgement,
    // repair the state before any email side effect. Recovery then cannot replay
    // a provider-successful run after the provider's 24-hour dedupe expires.
    if (record.status === "pending") {
      await dependencies.markEnqueued(order.id);
    }

    const customerEmail = order.customerContact.email || order.customerEmail;
    if (!customerEmail) throw new OrderNotificationPermanentError("customer_email_missing");

    const config = dependencies.getConfig();
    const messages = buildOrderNotificationEmails(order, config);
    const response = await dependencies.sendMany(messages, {
      operationId: `order-placed:${order.id}`
    });

    return {
      orderId: order.id,
      emailIds: response.messageIds,
      outcome: "sent" as const
    };
  };
}
