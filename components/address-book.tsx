"use client";

import { MapPin, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { SameAsPhoneControl } from "@/components/same-as-phone-control";
import type { DeliveryDetails, SavedAddress } from "@/lib/types";
import { buildLagosAddress, deliveryValidationMessage } from "@/lib/address-validation";

type AddressForm = DeliveryDetails & { label: string };

function emptyForm(defaults?: Partial<DeliveryDetails>): AddressForm {
  const form = {
    label: "",
    fullName: defaults?.fullName || "",
    email: defaults?.email || "",
    phone: "",
    whatsapp: "",
    addressLine: "",
    street: "",
    area: "",
    state: "Lagos" as const,
    address: ""
  };
  return { ...form, address: buildLagosAddress(form) };
}

function addressToForm(address: SavedAddress): AddressForm {
  return {
    label: "",
    fullName: address.fullName,
    email: address.email,
    phone: address.phone,
    whatsapp: address.whatsapp,
    addressLine: address.addressLine,
    street: address.street,
    area: address.area,
    state: "Lagos",
    address: address.address
  };
}

export function AddressBook({
  initialAddresses,
  userDefaults
}: {
  initialAddresses: SavedAddress[];
  userDefaults?: Partial<DeliveryDetails>;
}) {
  const [addresses, setAddresses] = useState(initialAddresses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(() => emptyForm(userDefaults));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState(false);

  function updateForm(field: keyof AddressForm, value: string) {
    setForm((current) => {
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
      setForm((current) => ({ ...current, whatsapp: current.phone }));
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm(userDefaults));
    setWhatsappSameAsPhone(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const details = { ...form, label: "", address: buildLagosAddress(form) };
    const validationMessage = deliveryValidationMessage(details);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setSaving(true);
    setMessage(editingId ? "Updating address..." : "Saving address...");
    const response = await fetch(editingId ? `/api/addresses/${editingId}` : "/api/addresses", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(details)
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error || "Address could not be saved.");
      return;
    }

    setAddresses((current) => {
      if (editingId) {
        return current.map((address) => (address.id === editingId ? data.address : address));
      }
      return [data.address, ...current];
    });
    resetForm();
    setMessage("Address saved.");
  }

  async function deleteAddress(addressId: string) {
    const confirmed = window.confirm("Delete this saved address?");
    if (!confirmed) return;

    setMessage("Deleting address...");
    const response = await fetch(`/api/addresses/${addressId}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "Address could not be deleted.");
      return;
    }

    setAddresses((current) => current.filter((address) => address.id !== addressId));
    if (editingId === addressId) resetForm();
    setMessage("Address deleted.");
  }

  return (
    <div className="address-layout">
      <section className="address-panel">
        <div className="admin-section-head">
          <div>
            <span className="eyebrow">{editingId ? "Edit" : "Add"}</span>
            <h2>{editingId ? "Update address" : "New address"}</h2>
            <p>We deliver anywhere in Lagos State.</p>
          </div>
          {editingId ? (
            <button className="secondary-button" type="button" onClick={resetForm}>
              <X size={16} />
              Cancel
            </button>
          ) : null}
        </div>
        <form className="address-form" onSubmit={onSubmit}>
          <label>
            Full name
            <input value={form.fullName} onChange={(event) => updateForm("fullName", event.target.value)} required />
          </label>
          <label>
            Email address
            <input type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} required />
          </label>
          <label>
            Phone number
            <input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} required />
          </label>
          <div className="field-with-inline-check">
            <label>
              WhatsApp number
              <input value={form.whatsapp} onChange={(event) => updateForm("whatsapp", event.target.value)} disabled={whatsappSameAsPhone} required />
            </label>
            <SameAsPhoneControl checked={whatsappSameAsPhone} onChange={updateWhatsappSameAsPhone} />
          </div>
          <label>
            Address line
            <input value={form.addressLine} onChange={(event) => updateForm("addressLine", event.target.value)} placeholder="Flat, building, estate, or landmark" required />
          </label>
          <label>
            Street
            <input value={form.street} onChange={(event) => updateForm("street", event.target.value)} required />
          </label>
          <label>
            Area
            <input value={form.area} onChange={(event) => updateForm("area", event.target.value)} placeholder="Ikeja, Lekki, Yaba..." required />
          </label>
          <label>
            State
            <input value="Lagos" disabled />
          </label>
          <div className="wide">
            <button className="btn-primary" type="submit" disabled={saving}>
              {editingId ? <Save size={17} /> : <Plus size={17} />}
              {saving ? "Saving..." : editingId ? "Update address" : "Save address"}
            </button>
            {message ? <p className="notice">{message}</p> : null}
          </div>
        </form>
      </section>

      <section className="address-panel">
        <div className="admin-section-head">
          <div>
            <span className="eyebrow">Saved</span>
            <h2>Your addresses</h2>
            <p>{addresses.length} saved address{addresses.length === 1 ? "" : "es"}</p>
          </div>
        </div>
        <div className="address-list">
          {addresses.map((address) => (
            <article className="address-card" key={address.id}>
              <div>
                <strong><MapPin size={16} /> {address.area}</strong>
                <span>{address.fullName} - {address.phone}</span>
                <p>{address.address}</p>
              </div>
              <div className="admin-row-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEditingId(address.id);
                    setForm(addressToForm(address));
                    setWhatsappSameAsPhone(Boolean(address.phone && address.phone === address.whatsapp));
                    setMessage("");
                  }}
                >
                  <Pencil size={15} />
                  Edit
                </button>
                <button className="secondary-button danger-button" type="button" onClick={() => deleteAddress(address.id)}>
                  <Trash2 size={15} />
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        {addresses.length === 0 ? <p className="notice">No saved addresses yet.</p> : null}
      </section>
    </div>
  );
}
