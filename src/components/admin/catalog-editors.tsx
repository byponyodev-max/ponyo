"use client";

import { useState, type FormEvent } from "react";
import {
  ponyoApi,
  type AdminBrand,
  type AdminProduct,
} from "@/services/ponyo-api.client";
import { deliveryCountries, regionName } from "@/lib/localization-options";

const deliveryCountryCodes = new Set(deliveryCountries.map(({ code }) => code));

export function ProductProofEditor({ product }: { product: AdminProduct }) {
  const [shippingConfirmed, setShippingConfirmed] = useState(product.shippingCountries != null);
  const [shippingCountries, setShippingCountries] = useState(
    (product.shippingCountries ?? []).filter((code) => deliveryCountryCodes.has(code)),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const shippingStatus = !shippingConfirmed
    ? "Not confirmed — configure destinations"
    : shippingCountries.length
      ? `Ships to ${shippingCountries.map((code) => regionName(code, "en", code)).join(", ")}`
      : "Confirmed unavailable in all listed countries";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await ponyoApi.updateAdminProductProof(product.id, {
        materials: String(values.get("materials") ?? "").trim() || null,
        weightGrams: optionalNumber(values.get("weightGrams")),
        editionCount: optionalNumber(values.get("editionCount")),
        estimatedDeliveryDate: String(values.get("estimatedDeliveryDate") ?? "") || null,
        onlyAtPonyo: values.get("onlyAtPonyo") === "on",
        shippingCountries: shippingConfirmed ? shippingCountries : null,
      });
      setMessage("Product details and shipping destinations saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Product details could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <details className="ad-inline-editor"><summary>Shipping: {shippingStatus} · Manage</summary><form onSubmit={save}>
    <label>Materials<textarea name="materials" rows={2} defaultValue={product.materials ?? ""} maxLength={3000} placeholder="Only enter maker-confirmed details" /></label>
    <div className="ad-editor-fields"><label>Weight (grams)<input name="weightGrams" type="number" min="0" step="1" defaultValue={product.weightGrams ?? ""} /></label><label>Edition count<input name="editionCount" type="number" min="1" step="1" defaultValue={product.editionCount ?? ""} /></label><label>Estimated delivery date<input name="estimatedDeliveryDate" type="date" defaultValue={product.estimatedDeliveryDate ?? ""} /></label></div>
    <label className="ad-editor-check"><input name="onlyAtPonyo" type="checkbox" defaultChecked={product.onlyAtPonyo} /> Confirmed exclusive to Ponyo</label>
    <fieldset><legend>Shipping destinations for this product (Japan / South Korea)</legend>
      <label className="ad-editor-check"><input type="checkbox" checked={shippingConfirmed} onChange={(event) => setShippingConfirmed(event.target.checked)} /> I confirmed these destinations with the maker</label>
      <div className="ad-editor-fields">{deliveryCountries.map((destination) => <label className="ad-editor-check" key={destination.code}><input type="checkbox" checked={shippingCountries.includes(destination.code)} disabled={!shippingConfirmed} onChange={(event) => setShippingCountries((current) => event.target.checked ? [...current, destination.code] : current.filter((code) => code !== destination.code))} /> {regionName(destination.code, "en", destination.label)}</label>)}</div>
      <small>{shippingConfirmed
        ? shippingCountries.length
          ? "Selected countries can reserve when reservations are open. Other countries can only register interest."
          : "No countries selected means shipping is confirmed unavailable in all listed countries."
        : "Unconfirmed means reservations are blocked for every country; customers can still register interest."}</small>
    </fieldset>
    {error && <p className="ad-inline-error" role="alert">{error}</p>}{message && <p className="ad-inline-success" role="status">{message}</p>}
    <button className="ad-row-action" type="submit" disabled={saving}>{saving ? "Saving…" : "Save product and shipping details"}</button>
  </form></details>;
}

export function ReservationSettingsEditor({ product }: { product: AdminProduct }) {
  const [open, setOpen] = useState(product.reservationsOpen);
  const [target, setTarget] = useState(product.reservationTarget?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await ponyoApi.setAdminProductReservations(product.id, {
        reservationsOpen: open,
        reservationTarget: target.trim() ? Number(target) : null,
      });
      setMessage("Reservation settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Reservation settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="ad-reservation-editor" onSubmit={save}>
    <label className="ad-editor-check"><input type="checkbox" checked={open} onChange={(event) => setOpen(event.target.checked)} /> Reservations open</label>
    <label>Reservation target<input type="number" min="1" step="1" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="No target set" /></label>
    <button className="ad-row-action" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
    {error && <p className="ad-inline-error" role="alert">{error}</p>}{message && <p className="ad-inline-success" role="status">{message}</p>}
  </form>;
}

export function BrandProfileEditor({ brand }: { brand: AdminBrand }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await ponyoApi.updateAdminBrandProfile(brand.id, {
        profileImageUrl: optionalText(values.get("profileImageUrl")),
        makerStory: optionalText(values.get("makerStory")),
        philosophy: optionalText(values.get("philosophy")),
        process: optionalText(values.get("process")),
        location: optionalText(values.get("location")),
        specialties: String(values.get("specialties") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        website: optionalText(values.get("website")),
        socialMedia: optionalText(values.get("socialMedia")),
      });
      setMessage("Maker profile saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Maker profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <details className="ad-inline-editor"><summary>Edit maker profile</summary><form onSubmit={save}>
    <label>Profile image URL<input name="profileImageUrl" type="url" defaultValue={brand.profileImageUrl ?? ""} placeholder="https://" /></label>
    <label>Maker story<textarea name="makerStory" rows={3} maxLength={4000} defaultValue={brand.makerStory ?? ""} /></label>
    <label>Philosophy<textarea name="philosophy" rows={2} maxLength={3000} defaultValue={brand.philosophy ?? ""} /></label>
    <label>Making process<textarea name="process" rows={2} maxLength={3000} defaultValue={brand.process ?? ""} /></label>
    <div className="ad-editor-fields"><label>Location<input name="location" maxLength={180} defaultValue={brand.location ?? ""} /></label><label>Specialties (comma-separated)<input name="specialties" defaultValue={brand.specialties.join(", ")} /></label></div>
    <div className="ad-editor-fields"><label>Website<input name="website" type="url" defaultValue={brand.website ?? ""} placeholder="https://" /></label><label>Social media<input name="socialMedia" type="url" defaultValue={brand.socialMedia ?? ""} placeholder="https://" /></label></div>
    {error && <p className="ad-inline-error" role="alert">{error}</p>}{message && <p className="ad-inline-success" role="status">{message}</p>}
    <button className="ad-row-action" type="submit" disabled={saving}>{saving ? "Saving…" : "Save maker profile"}</button>
  </form></details>;
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}
