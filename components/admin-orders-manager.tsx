"use client";

import { CheckCircle2, PackageCheck, Search, Send, XCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CopyTextButton } from "@/components/copy-text-button";
import { useToast } from "@/components/toast-provider";
import { fulfillmentLabels, fulfillmentPaymentNotes } from "@/lib/order-fulfillment";
import {
  matchesOrderStatusCategory,
  orderStatusCategories,
  orderStatusLabels,
  type OrderStatusCategory
} from "@/lib/order-status";
import { formatPrice } from "@/lib/pricing";
import type { Order } from "@/lib/types";

type AdminOrderAction = "accept" | "reject" | "out-for-delivery" | "delivered";

function canReject(order: Order) {
  return order.status === "placed" || order.status === "confirmed";
}

function canSendOut(order: Order) {
  return order.status === "confirmed" && order.fulfillmentMethod === "store-delivery";
}

function canMarkDelivered(order: Order) {
  return order.status === "out-for-delivery" || (order.status === "confirmed" && order.fulfillmentMethod === "customer-rider");
}

export function AdminOrdersManager({ orders: initialOrders }: { orders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [updatingId, setUpdatingId] = useState("");
  const [message, setMessage] = useState("");
  const [activeCategory, setActiveCategory] = useState<OrderStatusCategory>("all");
  const [query, setQuery] = useState("");
  const [rejectingId, setRejectingId] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesCategory = matchesOrderStatusCategory(order.status, activeCategory);
      const matchesQuery =
        !normalizedQuery ||
        order.id.toLowerCase().includes(normalizedQuery) ||
        order.id.slice(-6).toLowerCase().includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, orders, query]);
  const categoryCounts = useMemo(
    () =>
      orderStatusCategories.reduce<Record<OrderStatusCategory, number>>(
        (counts, category) => ({
          ...counts,
          [category.value]: orders.filter((order) => matchesOrderStatusCategory(order.status, category.value)).length
        }),
        { all: 0, cancelled: 0, rejected: 0, "out-for-delivery": 0, delivered: 0 }
      ),
    [orders]
  );

  async function updateOrder(order: Order, action: AdminOrderAction, rejectionReason = "") {
    if (action === "reject") {
      rejectionReason = rejectionReason.trim();
      if (!rejectionReason) {
        setMessage("Enter a rejection reason before rejecting an order.");
        showToast({
          title: "Rejection reason required",
          message: "Type the reason before rejecting this order.",
          tone: "warning"
        });
        return;
      }
    }

    setUpdatingId(order.id);
    setMessage("Updating order...");
    const response = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, rejectionReason, expectedVersion: order.version })
    });
    const data = await response.json().catch(() => ({}));
    setUpdatingId("");

    if (!response.ok) {
      setMessage(data.error || "Order could not be updated.");
      showToast({
        title: "Order not updated",
        message: data.error || "The order status could not be changed.",
        tone: "error"
      });
      return;
    }

    setOrders((current) => current.map((item) => (item.id === order.id ? data.order : item)));
    if (action === "reject") {
      setRejectingId("");
      setRejectionReasons((current) => ({ ...current, [order.id]: "" }));
    }
    setMessage(orderStatusLabels[data.order.status as Order["status"]] || "Order updated.");
    showToast({
      title: orderStatusLabels[data.order.status as Order["status"]] || "Order updated",
      message:
        data.order.status === "rejected" && data.order.rejectionReason
          ? `Reason: ${data.order.rejectionReason}`
          : `Order #${order.id.slice(-6).toUpperCase()} status updated.`,
      tone: data.order.status === "rejected" ? "warning" : "success"
    });
  }

  return (
    <section className="admin-inventory">
      <div className="admin-section-head">
        <div>
          <span className="eyebrow">Orders</span>
          <h2>Customer orders</h2>
          <p>{visibleOrders.length} of {orders.length} order{orders.length === 1 ? "" : "s"} shown</p>
        </div>
        <div className="admin-sort-controls">
          <label>
            Order ID
            <span className="admin-search-control">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order ID" />
            </span>
          </label>
        </div>
      </div>
      <div className="order-filter-tabs admin-order-tabs" aria-label="Order categories">
        {orderStatusCategories.map((category) => (
          <button
            className={activeCategory === category.value ? "active" : ""}
            key={category.value}
            type="button"
            onClick={() => setActiveCategory(category.value)}
          >
            {category.label}
            <span>{categoryCounts[category.value]}</span>
          </button>
        ))}
      </div>
      <div className="admin-product-list">
        {visibleOrders.map((order) => {
          const contact = order.customerContact;
          const destination =
            order.fulfillmentMethod === "customer-rider"
              ? order.pickupAddress || "Ebikas Place pickup"
              : order.deliveryDetails?.address || "Delivery address unavailable";
          const isUpdating = updatingId === order.id;
          const isRejecting = rejectingId === order.id;

          return (
            <article className="admin-order-row" key={order.id}>
              <div className="admin-order-customer">
                <CopyTextButton
                  className="copy-text-button copy-strong-button"
                  value={order.id}
                  label={`Order #${order.id.slice(-6).toUpperCase()}`}
                  copiedLabel="Order ID"
                />
                <span>{contact.fullName || order.customerName || "Customer"}</span>
                {contact.email || order.customerEmail ? (
                  <CopyTextButton
                    className="copy-text-button copy-meta-button"
                    value={contact.email || order.customerEmail || ""}
                    label={`Email: ${contact.email || order.customerEmail}`}
                    copiedLabel="Email"
                  />
                ) : null}
                {contact.phone ? (
                  <CopyTextButton
                    className="copy-text-button copy-meta-button"
                    value={contact.phone}
                    label={`Phone: ${contact.phone}`}
                    copiedLabel="Phone number"
                  />
                ) : (
                  <small>No phone</small>
                )}
                {contact.whatsapp ? (
                  <CopyTextButton
                    className="copy-text-button copy-meta-button"
                    value={contact.whatsapp}
                    label={`WhatsApp: ${contact.whatsapp}`}
                    copiedLabel="WhatsApp number"
                  />
                ) : (
                  <small>No WhatsApp</small>
                )}
                <small>
                  User: {order.userId.startsWith("deleted-user:") ? "Deleted account" : order.userId}
                </small>
                <small>{new Date(order.createdAt).toLocaleString()} - {orderStatusLabels[order.status]}</small>
                <span className={`order-status-pill status-${order.status}`}>{orderStatusLabels[order.status]}</span>
                {order.status === "rejected" && order.rejectionReason ? (
                  <small className="order-rejection">Reason: {order.rejectionReason}</small>
                ) : null}
              </div>
              <div className="admin-order-details">
                <span className="order-item-line">Method: {fulfillmentLabels[order.fulfillmentMethod]}</span>
                {order.fulfillmentMethod === "store-delivery" && order.deliveryDetails?.address ? (
                  <CopyTextButton
                    className="copy-text-button copy-block-button"
                    value={order.deliveryDetails.address}
                    label={`Address: ${order.deliveryDetails.address}`}
                    copiedLabel="Customer address"
                  />
                ) : (
                  <span className="order-item-line">Pickup: {destination}</span>
                )}
                <span className="order-item-line">{fulfillmentPaymentNotes[order.fulfillmentMethod]}</span>
                <div className="admin-order-products">
                  {order.items.map((item) => (
                    <div className="admin-order-product" key={`${order.id}-${item.productId}-${item.selectedSize || "none"}`}>
                      <Link href={`/products/${item.productId}`} aria-label={`Open ${item.name} product page`}>
                        <Image src={item.imageUrl} alt={item.name} width={52} height={64} sizes="52px" />
                      </Link>
                      <div>
                        <Link href={`/products/${item.productId}`}>{item.name}</Link>
                        <small>{item.quantity}x{item.selectedSize ? ` - Size ${item.selectedSize}` : ""}</small>
                        <CopyTextButton
                          className="copy-text-button copy-product-id-button"
                          value={item.productId}
                          label={`Product ID: ${item.productId}`}
                          copiedLabel="Product ID"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="admin-order-side">
                <strong>{formatPrice(order.subtotal)}</strong>
                <div className="admin-order-actions">
                  <button className="secondary-button" type="button" onClick={() => updateOrder(order, "accept")} disabled={order.status !== "placed" || isUpdating}>
                    <CheckCircle2 size={15} />
                    Accept
                  </button>
                  <button
                    className="secondary-button danger-button"
                    type="button"
                    onClick={() => setRejectingId(order.id)}
                    disabled={!canReject(order) || isUpdating}
                  >
                    <XCircle size={15} />
                    Reject
                  </button>
                  <button className="secondary-button" type="button" onClick={() => updateOrder(order, "out-for-delivery")} disabled={!canSendOut(order) || isUpdating}>
                    <Send size={15} />
                    Out for delivery
                  </button>
                  <button className="secondary-button" type="button" onClick={() => updateOrder(order, "delivered")} disabled={!canMarkDelivered(order) || isUpdating}>
                    <PackageCheck size={15} />
                    Delivered
                  </button>
                </div>
                {isRejecting ? (
                  <div className="admin-reject-panel">
                    <label>
                      Rejection reason
                      <textarea
                        value={rejectionReasons[order.id] || ""}
                        onChange={(event) => setRejectionReasons((current) => ({ ...current, [order.id]: event.target.value }))}
                        placeholder="Tell the customer why this order was rejected"
                        rows={3}
                      />
                    </label>
                    <div>
                      <button
                        className="secondary-button danger-button"
                        type="button"
                        onClick={() => updateOrder(order, "reject", rejectionReasons[order.id])}
                        disabled={isUpdating}
                      >
                        Confirm rejection
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          setRejectingId("");
                          setRejectionReasons((current) => ({ ...current, [order.id]: "" }));
                        }}
                        disabled={isUpdating}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {orders.length === 0 ? <p className="notice">No orders have been placed yet.</p> : null}
      {orders.length > 0 && visibleOrders.length === 0 ? <p className="notice">No orders match this category or order ID.</p> : null}
      {message ? <p className="notice">{message}</p> : null}
    </section>
  );
}
