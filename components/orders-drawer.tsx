"use client";

import { PackageCheck, RefreshCw, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { CopyTextButton } from "@/components/copy-text-button";
import { useCart } from "@/components/cart-provider";
import { useToast } from "@/components/toast-provider";
import { useOverlayDialog } from "@/components/use-overlay-dialog";
import { fulfillmentLabels, fulfillmentPaymentNotes } from "@/lib/order-fulfillment";
import {
  canCustomerCancelOrder,
  matchesOrderStatusCategory,
  orderStatusCategories,
  orderStatusLabels,
  type OrderStatusCategory
} from "@/lib/order-status";
import { formatPrice } from "@/lib/pricing";
import type { Order } from "@/lib/types";

export function OrdersDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useOverlayDialog<HTMLElement>(open, onClose);
  const { isLoaded, isSignedIn } = useUser();
  const { reorderItems } = useCart();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [message, setMessage] = useState("");
  const [activeCategory, setActiveCategory] = useState<OrderStatusCategory>("all");

  const visibleOrders = useMemo(
    () => orders.filter((order) => matchesOrderStatusCategory(order.status, activeCategory)),
    [activeCategory, orders]
  );
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

  useEffect(() => {
    if (!open || !isSignedIn) return;

    setLoading(true);
    setMessage("");
    fetch("/api/orders")
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setMessage(data.error || "Orders could not be loaded.");
          return;
        }
        setOrders(data.orders || []);
      })
      .catch(() => setMessage("Orders could not be loaded."))
      .finally(() => setLoading(false));
  }, [open, isSignedIn]);

  async function cancelOrder(order: Order) {
    if (!canCustomerCancelOrder(order.status)) return;

    setCancellingId(order.id);
    setMessage("Cancelling order...");
    const response = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", expectedVersion: order.version })
    });
    const data = await response.json().catch(() => ({}));
    setCancellingId("");

    if (!response.ok) {
      setMessage(data.error || "Order could not be cancelled.");
      showToast({
        title: "Order not cancelled",
        message: data.error || "This order could not be cancelled.",
        tone: "error"
      });
      return;
    }

    setOrders((current) => current.map((item) => (item.id === order.id ? data.order : item)));
    setMessage("Order cancelled.");
    showToast({
      title: "Order cancelled",
      message: `Order #${order.id.slice(-6).toUpperCase()} has been cancelled.`,
      tone: "info"
    });
  }

  if (!open) return null;

  return (
    <>
      <button className="drawer-backdrop" type="button" aria-label="Close orders" onClick={onClose} />
      <aside ref={dialogRef} className="drawer" role="dialog" aria-modal="true" aria-label="Your orders" tabIndex={-1}>
        <div className="drawer-head">
          <strong><PackageCheck size={18} /> Orders</strong>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close orders" data-dialog-close>
            <X size={16} />
          </button>
        </div>
        <div className="cart-list" aria-busy={!isLoaded || loading}>
          {!isLoaded || loading ? (
            <div className="cart-empty" role="status" aria-live="polite">
              <RefreshCw size={34} />
              <p>Loading orders</p>
              <span>Checking your recent purchases.</span>
            </div>
          ) : null}
          {isLoaded && !isSignedIn ? (
            <div className="cart-empty">
              <PackageCheck size={36} />
              <p>Sign in to view orders</p>
              <SignInButton mode="modal">
                <button className="btn-primary" type="button">Sign in</button>
              </SignInButton>
            </div>
          ) : null}
          {isLoaded && isSignedIn && !loading && orders.length === 0 ? (
            <div className="cart-empty">
              <PackageCheck size={36} />
              <p>No orders yet</p>
              <span>Orders appear here after checkout.</span>
            </div>
          ) : null}
          {isLoaded && isSignedIn && !loading && orders.length > 0 ? (
            <div className="order-filter-tabs" aria-label="Order categories">
              {orderStatusCategories.map((category) => (
                <button
                  aria-pressed={activeCategory === category.value}
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
          ) : null}
          {isLoaded && isSignedIn && !loading
            ? visibleOrders.map((order) => (
                <article className="order-card" key={order.id}>
                  <div className="order-card-header">
                    <strong>Order #{order.id.slice(-6).toUpperCase()}</strong>
                    <span>{new Date(order.createdAt).toLocaleDateString()} - {orderStatusLabels[order.status]}</span>
                  </div>
                  <span className={`order-status-pill status-${order.status}`}>{orderStatusLabels[order.status]}</span>
                  {order.status === "rejected" && order.rejectionReason ? (
                    <p className="order-rejection">Reason: {order.rejectionReason}</p>
                  ) : null}
                  <p className="order-summary">{order.items.length} item{order.items.length === 1 ? "" : "s"} - {formatPrice(order.subtotal)}</p>
                  <div className="order-product-list">
                    {order.items.map((item) => (
                      <Link className="order-product-link" href={`/products/${item.productId}`} key={`${order.id}-${item.productId}-${item.selectedSize || "none"}`} onClick={onClose}>
                        <Image src={item.imageUrl} alt={item.name} width={48} height={48} sizes="48px" />
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {item.quantity}x
                            {item.selectedSize ? ` - Size ${item.selectedSize}` : ""}
                          </small>
                        </span>
                      </Link>
                    ))}
                  </div>
                  <div className="order-fulfillment-block">
                    <span>{fulfillmentLabels[order.fulfillmentMethod]}</span>
                    {order.fulfillmentMethod === "customer-rider" ? (
                      <CopyTextButton
                        className="copy-text-button copy-block-button"
                        value={order.pickupAddress || "Ebikas Place pickup"}
                        label={order.pickupAddress || "Ebikas Place pickup"}
                        copiedLabel="Pickup location"
                      />
                    ) : (
                      <span>{order.deliveryDetails?.address || "Delivery address unavailable"}</span>
                    )}
                    <span>{fulfillmentPaymentNotes[order.fulfillmentMethod]}</span>
                  </div>
                  <button
                    className="order-cancel-button"
                    type="button"
                    onClick={() => cancelOrder(order)}
                    disabled={!canCustomerCancelOrder(order.status) || cancellingId === order.id}
                  >
                    {cancellingId === order.id ? "Cancelling…" : "Cancel order"}
                  </button>
                  <button
                    className="order-cancel-button order-buy-again"
                    type="button"
                    onClick={() => reorderItems(order.items)}
                  >
                    Buy again
                  </button>
                </article>
              ))
            : null}
          {isLoaded && isSignedIn && !loading && orders.length > 0 && visibleOrders.length === 0 ? (
            <p className="notice">No {orderStatusCategories.find((category) => category.value === activeCategory)?.label.toLowerCase()} yet.</p>
          ) : null}
          {message ? <p className="notice" role="status" aria-live="polite">{message}</p> : null}
        </div>
        <div className="drawer-foot">
          <span>{visibleOrders.length} of {orders.length} order{orders.length === 1 ? "" : "s"}</span>
          <Link className="btn-primary" href="/shop" onClick={onClose}>Shop</Link>
        </div>
      </aside>
    </>
  );
}
