import { describe, expect, it } from "vitest";
import {
  buildLagosAddress,
  parseCustomerContact,
  parseDeliveryDetails
} from "@/lib/address-validation";
import {
  getCompareAtPrice,
  getCurrentPrice,
  getDiscountPercent
} from "@/lib/pricing";
import {
  canCustomerCancelOrder,
  matchesOrderStatusCategory
} from "@/lib/order-status";

describe("pricing", () => {
  it("uses only a positive discount below the regular price", () => {
    expect(getCurrentPrice({ price: 10_000, salePrice: 7_500 })).toBe(7_500);
    expect(getCompareAtPrice({ price: 10_000, salePrice: 7_500 })).toBe(10_000);
    expect(getDiscountPercent({ price: 10_000, salePrice: 7_500 })).toBe(25);
    expect(getCurrentPrice({ price: 10_000, salePrice: 12_000 })).toBe(10_000);
    expect(getCompareAtPrice({ price: 10_000, salePrice: 12_000 })).toBeUndefined();
  });
});

describe("address validation", () => {
  const contact = {
    fullName: "  Ada Lovelace  ",
    email: " ADA@EXAMPLE.COM ",
    phone: "+234 801 234 5678",
    whatsapp: "+234 801 234 5678"
  };

  it("normalizes valid customer contact details", () => {
    expect(parseCustomerContact(contact)).toEqual({
      ...contact,
      fullName: "Ada Lovelace",
      email: "ada@example.com"
    });
  });

  it("builds and validates Lagos delivery details", () => {
    const details = parseDeliveryDetails({
      ...contact,
      addressLine: "19",
      street: "Remoye Street",
      area: "Akowonjo"
    });

    expect(details?.state).toBe("Lagos");
    expect(details?.address).toBe(buildLagosAddress({
      addressLine: "19",
      street: "Remoye Street",
      area: "Akowonjo"
    }));
    expect(parseDeliveryDetails({ ...contact, addressLine: "", street: "", area: "" })).toBeNull();
  });
});

describe("order status helpers", () => {
  it("keeps customer cancellation and category matching explicit", () => {
    expect(canCustomerCancelOrder("placed")).toBe(true);
    expect(canCustomerCancelOrder("delivered")).toBe(false);
    expect(matchesOrderStatusCategory("confirmed", "all")).toBe(true);
    expect(matchesOrderStatusCategory("rejected", "rejected")).toBe(true);
    expect(matchesOrderStatusCategory("placed", "delivered")).toBe(false);
  });
});
