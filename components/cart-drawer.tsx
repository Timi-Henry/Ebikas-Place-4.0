"use client";

import { MapPin, Minus, Plus, ShoppingBag, Trash2, Truck, X } from "lucide-react";
import { SignInButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { CopyTextButton } from "@/components/copy-text-button";
import { SameAsPhoneControl } from "@/components/same-as-phone-control";
import { useToast } from "@/components/toast-provider";
import { useOverlayDialog } from "@/components/use-overlay-dialog";
import { buildLagosAddress, contactValidationMessage, deliveryValidationMessage } from "@/lib/address-validation";
import { fulfillmentPaymentNotes, storePickupAddress } from "@/lib/order-fulfillment";
import { formatPrice, getCurrentPrice } from "@/lib/pricing";
import type { CustomerContact, DeliveryDetails, FulfillmentMethod, SavedAddress } from "@/lib/types";

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useOverlayDialog<HTMLElement>(open, onClose);
  const { items, subtotal, changeQuantity, removeItem, clear } = useCart();
  const { showToast } = useToast();
  const { isLoaded, isSignedIn, user } = useUser();
  const [placingOrder, setPlacingOrder] = useState(false);
  const checkoutAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const [message, setMessage] = useState("");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [useNewAddress, setUseNewAddress] = useState(true);
  const [saveAddress, setSaveAddress] = useState(true);
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState(false);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>("store-delivery");
  const [deliveryDetails, setDeliveryDetails] = useState<DeliveryDetails>({
    fullName: "",
    email: "",
    phone: "",
    whatsapp: "",
    addressLine: "",
    street: "",
    area: "",
    state: "Lagos",
    address: ""
  });

  useEffect(() => {
    if (!user) return;
    setDeliveryDetails((current) => ({
      ...current,
      fullName: current.fullName || user.fullName || "",
      email:
        current.email ||
        user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ||
        user.primaryEmailAddress?.emailAddress ||
        ""
    }));
  }, [user]);

  useEffect(() => {
    if (!open || !isSignedIn) return;

    fetch("/api/addresses")
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) return;
        const savedAddresses = data.addresses || [];
        setAddresses(savedAddresses);
        if (savedAddresses.length && !selectedAddressId) {
          setSelectedAddressId(savedAddresses[0].id);
          setUseNewAddress(false);
          setDeliveryDetails(savedAddresses[0]);
        }
      })
      .catch(() => undefined);
  }, [open, isSignedIn, selectedAddressId]);

  function resetNewAddressFields() {
    setUseNewAddress(true);
    setSelectedAddressId("");
    setWhatsappSameAsPhone(false);
    setDeliveryDetails((current) => ({
      ...current,
      phone: "",
      whatsapp: "",
      addressLine: "",
      street: "",
      area: "",
      state: "Lagos",
      address: ""
    }));
  }

  function selectSavedAddress(address: SavedAddress) {
    setSelectedAddressId(address.id);
    setUseNewAddress(false);
    setWhatsappSameAsPhone(Boolean(address.phone && address.phone === address.whatsapp));
    setDeliveryDetails(address);
  }

  function updateDeliveryDetail(field: keyof typeof deliveryDetails, value: string) {
    setDeliveryDetails((current) => {
      const next = { ...current, [field]: value };
      if (field === "phone" && whatsappSameAsPhone) {
        next.whatsapp = value;
      }
      if (field === "addressLine" || field === "street" || field === "area") {
        next.address = buildLagosAddress(next);
      }
      return next;
    });
  }

  function updateWhatsappSameAsPhone(checked: boolean) {
    setWhatsappSameAsPhone(checked);
    if (checked) {
      setDeliveryDetails((current) => ({ ...current, whatsapp: current.phone }));
    }
  }

  function customerContactPayload(): CustomerContact {
    return {
      fullName: deliveryDetails.fullName,
      email: deliveryDetails.email,
      phone: deliveryDetails.phone,
      whatsapp: deliveryDetails.whatsapp
    };
  }

  function validateCheckoutDetails() {
    if (fulfillmentMethod === "customer-rider") {
      return contactValidationMessage(customerContactPayload());
    }
    if (!useNewAddress && selectedAddressId) return "";
    return deliveryValidationMessage(deliveryDetails);
  }

  function checkoutPayload() {
    return {
      items: items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        selectedSize: item.selectedSize
      })),
      fulfillment:
        fulfillmentMethod === "customer-rider"
          ? { method: "customer-rider" as const, contact: customerContactPayload() }
          : {
              method: "store-delivery" as const,
              destination:
                !useNewAddress && selectedAddressId
                  ? { source: "saved" as const, addressId: selectedAddressId }
                  : { source: "new" as const, details: deliveryDetails, saveAddress }
            }
    };
  }

  function checkoutKey(payload: ReturnType<typeof checkoutPayload>) {
    const fingerprint = JSON.stringify(payload);
    if (checkoutAttemptRef.current?.fingerprint === fingerprint) {
      return checkoutAttemptRef.current.key;
    }
    const key = globalThis.crypto.randomUUID();
    checkoutAttemptRef.current = { fingerprint, key };
    return key;
  }

  async function placeOrder() {
    const checkoutError = validateCheckoutDetails();
    if (checkoutError) {
      setMessage(checkoutError);
      return;
    }
    const payload = checkoutPayload();
    setPlacingOrder(true);
    setMessage("Placing order...");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": checkoutKey(payload),
          "X-Ebikas-Request": "checkout"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Order could not be placed.");
        showToast({
          title: "Order not placed",
          message: data.error || "Check your checkout details and try again.",
          tone: "error"
        });
        return;
      }

      if (data.savedAddress) {
        setAddresses((current) => {
          if (current.some((address) => address.id === data.savedAddress.id)) return current;
          return [data.savedAddress, ...current];
        });
        selectSavedAddress(data.savedAddress);
      }
      checkoutAttemptRef.current = null;
      clear();
      setMessage(`Order placed. Order #${String(data.order?.id || "").slice(-6).toUpperCase()}.`);
      showToast({
        title: "Order placed",
        message: `Order #${String(data.order?.id || "").slice(-6).toUpperCase()} has been sent to Ebikas Place.`,
        tone: "success"
      });
    } catch {
      setMessage("The network interrupted checkout. Your cart is safe; try again.");
      showToast({
        title: "Order not placed",
        message: "The network interrupted checkout. Try again when you are connected.",
        tone: "error"
      });
    } finally {
      setPlacingOrder(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <button className="drawer-backdrop" type="button" aria-label="Close cart" onClick={onClose} />
      <aside ref={dialogRef} className="drawer" role="dialog" aria-modal="true" aria-label="Shopping cart" tabIndex={-1}>
        <div className="drawer-head">
          <strong><ShoppingBag size={18} /> Your Cart</strong>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close cart" data-dialog-close>
            <X size={16} />
          </button>
        </div>
        <div className="cart-list">
          {items.length === 0 ? (
            <div className="cart-empty">
              <ShoppingBag size={36} />
              <p>Your cart is empty</p>
              <span>Discover our latest collection and find your style.</span>
            </div>
          ) : (
            items.map((item) => (
              <article className="cart-item" key={`${item.id}-${item.selectedSize || "none"}`}>
                <Image src={item.imageUrl} alt="" width={86} height={104} sizes="86px" />
                <div>
                  <strong>{item.name}</strong>
                  {item.selectedSize ? <span className="cart-size">Size {item.selectedSize}</span> : null}
                  <p>{formatPrice(getCurrentPrice(item))}</p>
                  <div className="cart-controls">
                    <button className="qty-btn" type="button" onClick={() => changeQuantity(item.id, -1, item.selectedSize)} aria-label="Decrease quantity">
                      <Minus size={14} />
                    </button>
                    <span>{item.quantity}</span>
                    <button className="qty-btn" type="button" onClick={() => changeQuantity(item.id, 1, item.selectedSize)} aria-label="Increase quantity">
                      <Plus size={14} />
                    </button>
                    <button className="qty-btn" type="button" onClick={() => removeItem(item.id, item.selectedSize)} aria-label="Remove item">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
          {items.length > 0 ? (
            <form
              id="checkout-form"
              className="checkout-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!isSignedIn) {
                  setMessage("Sign in to place your order.");
                  return;
                }
                void placeOrder();
              }}
            >
              <div className="checkout-section">
                <div className="checkout-section-head">
                  <strong>Choose delivery method</strong>
                  <p>Choose delivery inside Lagos or send your own rider to pick up from Ebikas Place.</p>
                </div>
                <div className="fulfillment-options" role="radiogroup" aria-label="Order fulfillment method">
                  <button
                    className={fulfillmentMethod === "store-delivery" ? "active" : ""}
                    type="button"
                    role="radio"
                    aria-checked={fulfillmentMethod === "store-delivery"}
                    onClick={() => setFulfillmentMethod("store-delivery")}
                  >
                    <Truck size={17} />
                    <span>
                      <strong>Have us deliver to you</strong>
                      <small>{fulfillmentPaymentNotes["store-delivery"]}</small>
                    </span>
                  </button>
                  <button
                    className={fulfillmentMethod === "customer-rider" ? "active" : ""}
                    type="button"
                    role="radio"
                    aria-checked={fulfillmentMethod === "customer-rider"}
                    onClick={() => setFulfillmentMethod("customer-rider")}
                  >
                    <MapPin size={17} />
                    <span>
                      <strong>Send your own rider</strong>
                      <small>{fulfillmentPaymentNotes["customer-rider"]}</small>
                    </span>
                  </button>
                </div>
              </div>
              {fulfillmentMethod === "customer-rider" ? (
                <div className="checkout-section">
                  <div className="checkout-info-box">
                    <strong>Pickup location</strong>
                    <CopyTextButton
                      className="copy-text-button copy-block-button"
                      value={storePickupAddress}
                      label={`Copy pickup address: ${storePickupAddress}`}
                      copiedLabel="Pickup location"
                    />
                    <span>Your rider must pay when they get to us before the product is released.</span>
                  </div>
                  <div className="checkout-section-head">
                    <strong className="checkout-subhead">Contact details</strong>
                    <p>We will use this to confirm the order and identify your rider.</p>
                  </div>
                  <div className="checkout-field-group">
                    <label>
                      Full name
                      <input name="fullName" autoComplete="name" value={deliveryDetails.fullName} onChange={(event) => updateDeliveryDetail("fullName", event.target.value)} required />
                    </label>
                    <label>
                      Email address
                      <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        spellCheck={false}
                        value={deliveryDetails.email}
                        onChange={(event) => updateDeliveryDetail("email", event.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Phone number
                      <input name="phone" type="tel" inputMode="tel" autoComplete="tel" value={deliveryDetails.phone} onChange={(event) => updateDeliveryDetail("phone", event.target.value)} required />
                    </label>
                    <div className="field-with-inline-check">
                      <label>
                        WhatsApp number
                        <input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" value={deliveryDetails.whatsapp} onChange={(event) => updateDeliveryDetail("whatsapp", event.target.value)} disabled={whatsappSameAsPhone} required />
                      </label>
                      <SameAsPhoneControl checked={whatsappSameAsPhone} onChange={updateWhatsappSameAsPhone} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="checkout-section">
                  <div className="checkout-section-head">
                    <strong className="checkout-subhead">Delivery address</strong>
                    <p>{fulfillmentPaymentNotes["store-delivery"]}</p>
                  </div>
                  {addresses.length > 0 ? (
                    <label>
                      Saved address
                      <select
                        name="savedAddress"
                        autoComplete="off"
                        value={useNewAddress ? "new" : selectedAddressId}
                        onChange={(event) => {
                          if (event.target.value === "new") {
                            resetNewAddressFields();
                            return;
                          }
                          const address = addresses.find((item) => item.id === event.target.value);
                          if (address) selectSavedAddress(address);
                        }}
                      >
                        {addresses.map((address) => (
                          <option value={address.id} key={address.id}>
                            {address.label || address.area} - {address.address}
                          </option>
                        ))}
                        <option value="new">Add a new address</option>
                      </select>
                    </label>
                  ) : null}
                  <a className="checkout-manage-link" href="/addresses">
                    Manage saved addresses
                  </a>
                  {!useNewAddress ? (
                    <div className="checkout-selected-address">
                      <strong>{deliveryDetails.fullName}</strong>
                      <span>{deliveryDetails.phone} - WhatsApp: {deliveryDetails.whatsapp}</span>
                      <p>{deliveryDetails.address}</p>
                    </div>
                  ) : (
                    <div className="checkout-field-group">
                      <strong className="checkout-subhead">Add new address</strong>
                      <label>
                        Full name
                        <input name="fullName" autoComplete="name" value={deliveryDetails.fullName} onChange={(event) => updateDeliveryDetail("fullName", event.target.value)} required />
                      </label>
                      <label>
                        Email address
                        <input
                          type="email"
                          name="email"
                          autoComplete="email"
                          spellCheck={false}
                          value={deliveryDetails.email}
                          onChange={(event) => updateDeliveryDetail("email", event.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Phone number
                        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" value={deliveryDetails.phone} onChange={(event) => updateDeliveryDetail("phone", event.target.value)} required />
                      </label>
                      <div className="field-with-inline-check">
                        <label>
                          WhatsApp number
                          <input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" value={deliveryDetails.whatsapp} onChange={(event) => updateDeliveryDetail("whatsapp", event.target.value)} disabled={whatsappSameAsPhone} required />
                        </label>
                        <SameAsPhoneControl checked={whatsappSameAsPhone} onChange={updateWhatsappSameAsPhone} />
                      </div>
                      <label>
                        Address line
                        <input name="addressLine" autoComplete="address-line1" value={deliveryDetails.addressLine} onChange={(event) => updateDeliveryDetail("addressLine", event.target.value)} placeholder="e.g. Flat 2, Palm Estate…" required />
                      </label>
                      <label>
                        Street
                        <input name="street" autoComplete="address-line2" value={deliveryDetails.street} onChange={(event) => updateDeliveryDetail("street", event.target.value)} required />
                      </label>
                      <label>
                        Area
                        <input name="area" autoComplete="address-level2" value={deliveryDetails.area} onChange={(event) => updateDeliveryDetail("area", event.target.value)} required />
                      </label>
                      <label>
                        State
                        <input name="state" autoComplete="address-level1" value="Lagos" disabled />
                      </label>
                    </div>
                  )}
                  {useNewAddress ? (
                    <label className="form-toggle form-toggle-card checkout-save-address">
                      <input name="saveAddress" checked={saveAddress} type="checkbox" onChange={(event) => setSaveAddress(event.target.checked)} />
                      <span className="form-toggle-copy">
                        <strong>Save this address</strong>
                        <small>Keep it ready for your next order.</small>
                      </span>
                      <span className="form-toggle-switch" aria-hidden="true">
                        <span />
                      </span>
                    </label>
                  ) : null}
                </div>
              )}
            </form>
          ) : null}
        </div>
        <div className="drawer-foot">
          <div>
            <span>Subtotal</span>
            <strong style={{ display: "block" }}>{formatPrice(subtotal)}</strong>
            {message ? <small className="drawer-message" role="status" aria-live="polite">{message}</small> : null}
          </div>
          <div className="drawer-actions">
            {isLoaded && !isSignedIn ? (
              <SignInButton mode="modal">
                <button className="btn-primary" type="button" disabled={items.length === 0}>
                  Sign in to order
                </button>
              </SignInButton>
            ) : (
              <button className="btn-primary" type="submit" form="checkout-form" disabled={items.length === 0 || placingOrder}>
                {placingOrder ? "Placing…" : "Place order"}
              </button>
            )}
            <button className="btn-ghost" type="button" onClick={clear} disabled={items.length === 0}>
              Clear
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
