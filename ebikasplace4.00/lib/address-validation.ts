import type { CustomerContact, DeliveryDetails } from "@/lib/types";

export type DeliveryInput = Partial<DeliveryDetails> & {
  label?: string;
};

export function normalizeText(value: unknown) {
  return String(value || "").trim();
}

export function buildLagosAddress(input: Pick<DeliveryDetails, "addressLine" | "street" | "area">) {
  return `${input.addressLine}, ${input.street}, ${input.area}, Lagos`;
}

export function parseCustomerContact(value: unknown): CustomerContact | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const contact: CustomerContact = {
    fullName: normalizeText(record.fullName),
    email: normalizeText(record.email).toLowerCase(),
    phone: normalizeText(record.phone),
    whatsapp: normalizeText(record.whatsapp)
  };

  return validateCustomerContact(contact) ? contact : null;
}

export function parseDeliveryDetails(value: unknown): DeliveryDetails | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const contact = parseCustomerContact(value);
  if (!contact) return null;

  const addressLine = normalizeText(record.addressLine || record.houseNumber);
  const street = normalizeText(record.street);
  const area = normalizeText(record.area);
  const details: DeliveryDetails = {
    ...contact,
    addressLine,
    street,
    area,
    state: "Lagos",
    address: buildLagosAddress({ addressLine, street, area })
  };

  return validateDeliveryDetails(details) ? details : null;
}

export function validateCustomerContact(contact: CustomerContact) {
  const requiredFields = [contact.fullName, contact.email, contact.phone, contact.whatsapp];
  const hasMissingField = requiredFields.some((item) => item.trim().length === 0);
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim());
  const phoneLooksValid = /^[+\d][\d\s()+-]{7,20}$/.test(contact.phone.trim());
  const whatsappLooksValid = /^[+\d][\d\s()+-]{7,20}$/.test(contact.whatsapp.trim());

  return !hasMissingField && emailLooksValid && phoneLooksValid && whatsappLooksValid;
}

export function validateDeliveryDetails(details: DeliveryDetails) {
  const hasMissingAddress = [details.addressLine, details.street, details.area].some((item) => item.trim().length === 0);
  const stateIsLagos = details.state === "Lagos";

  return validateCustomerContact(details) && !hasMissingAddress && stateIsLagos;
}

export function contactValidationMessage(contact: CustomerContact) {
  if ([contact.fullName, contact.email, contact.phone, contact.whatsapp].some((value) => !value.trim())) {
    return "Enter your full name, email, phone number, and WhatsApp number.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) {
    return "Enter a valid email address.";
  }
  if (!/^[+\d][\d\s()+-]{7,20}$/.test(contact.phone.trim())) {
    return "Enter a valid phone number.";
  }
  if (!/^[+\d][\d\s()+-]{7,20}$/.test(contact.whatsapp.trim())) {
    return "Enter a valid WhatsApp number.";
  }
  return "";
}

export function deliveryValidationMessage(details: DeliveryDetails) {
  const contactError = contactValidationMessage(details);
  if (contactError) return contactError;
  if ([details.addressLine, details.street, details.area].some((value) => !value.trim())) {
    return "Enter your address line, street, and area in Lagos.";
  }
  return "";
}
