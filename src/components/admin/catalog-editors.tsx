"use client";

import { useState, type FormEvent } from "react";
import {
  ponyoApi,
  type AdminBrand,
  type AdminProduct,
  type ProductCategory,
} from "@/services/ponyo-api.client";
import { deliveryCountries, regionName } from "@/lib/localization-options";
import { orderProductCategories } from "@/lib/product-categories";
import { PonyoSelect } from "@/components/ui/ponyo-select";

const deliveryCountryCodes = new Set(deliveryCountries.map(({ code }) => code));

export function ProductCategoryEditor({
  product,
  categories,
  onSaved,
}: {
  product: AdminProduct;
  categories: ProductCategory[];
  onSaved: (product: AdminProduct) => void;
}) {
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const categoryIdsWithChildren = new Set(categories.filter((item) => item.parentId).map((item) => item.parentId));
  const leafCategories = orderProductCategories(categories.filter((item) => !categoryIdsWithChildren.has(item.id)));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId || categoryId === product.categoryId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await ponyoApi.setAdminProductCategory(product.id, categoryId);
      setCategoryId(updated.categoryId ?? "");
      onSaved(updated);
      setMessage("Product category saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Product category could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <details className="ad-inline-editor"><summary>Edit product category</summary><form onSubmit={save}>
    <label htmlFor={`product-category-${product.id}`}>Product category<PonyoSelect
      id={`product-category-${product.id}`}
      value={categoryId}
      onChange={setCategoryId}
      required
      placeholder="Select a category"
      label="Product category"
      searchable={leafCategories.length > 8}
      searchPlaceholder="Search categories"
      options={leafCategories.map((item) => {
        const parent = categories.find((category) => category.id === item.parentId);
        return { value: item.id, label: `${parent ? `${parent.name} › ` : ""}${item.name}` };
      })}
    /></label>
    {error && <p className="ad-inline-error" role="alert">{error}</p>}{message && <p className="ad-inline-success" role="status">{message}</p>}
    <button className="ad-row-action" type="submit" disabled={saving || !categoryId || categoryId === product.categoryId}>{saving ? "Saving…" : "Save category"}</button>
  </form></details>;
}

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
  const [deadline, setDeadline] = useState(product.reservationDeadline ?? "");
  const [productionStatus, setProductionStatus] = useState(product.productionStatus);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await ponyoApi.setAdminProductReservations(product.id, {
        reservationsOpen: open,
        reservationTarget: target.trim() ? Number(target) : null,
        reservationDeadline: deadline || null,
      });
      setOpen(saved.reservationsOpen);
      setDeadline(saved.reservationDeadline ?? "");
      setProductionStatus(saved.productionStatus);
      setMessage("Reservation settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Reservation settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function approveProduction() {
    setApproving(true);
    setError("");
    setMessage("");
    try {
      const result = await ponyoApi.approveAdminProductProduction(product.id);
      setProductionStatus(result.status);
      setMessage(`${result.invitationsQueued} priority invitations queued. Checkout and payment remain disabled.`);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Production approval could not be saved.");
    } finally {
      setApproving(false);
    }
  }

  return <div className="ad-reservation-editor">
    <form onSubmit={save}>
      <label className="ad-editor-check"><input type="checkbox" checked={open} onChange={(event) => setOpen(event.target.checked)} disabled={["preorder_invited", "target_missed"].includes(productionStatus)} /> Reservations open</label>
      <label>Reservation target<input type="number" min="1" step="1" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="No target set" disabled={["preorder_invited", "target_missed"].includes(productionStatus)} /></label>
      <label>Reservation deadline<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} disabled={["preorder_invited", "target_missed"].includes(productionStatus)} /></label>
      <button className="ad-row-action" type="submit" disabled={saving || ["preorder_invited", "target_missed"].includes(productionStatus)}>{saving ? "Saving…" : "Save campaign"}</button>
    </form>
    {productionStatus === "target_reached" && <button className="ad-row-action" type="button" onClick={() => void approveProduction()} disabled={approving}>{approving ? "Queueing invitations…" : "Confirm maker ready & invite reservers"}</button>}
    {productionStatus === "preorder_invited" && <small>Maker production approved and invitations queued. Paid checkout is disabled.</small>}
    {error && <p className="ad-inline-error" role="alert">{error}</p>}{message && <p className="ad-inline-success" role="status">{message}</p>}
  </div>;
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
