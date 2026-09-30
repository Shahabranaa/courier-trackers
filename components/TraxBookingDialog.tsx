"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Plus, X } from "lucide-react";

type OptionRow = Record<string, unknown>;
type CityOption = { id: string; label: string };
type PickupOption = { id: string; label: string };

const productTypes = [
  "Apparel", "Automotive Parts", "Accessories", "Personal Electronics (Mobile Phones, Laptops, etc.)",
  "Electronics Accessories (Cases, Chargers, etc.)", "Gadgets", "Jewellery", "Cosmetics", "Stationery",
  "Handicrafts", "Home-made Items", "Footwear", "Watches", "Leather Items", "Organic and Health Products",
  "Appliances and Consumer Electronics", "Home Decor and Interior Items", "Toys", "Pet Supplies",
  "Athletics and Fitness Items", "Vouchers and Coupons", "Marketplace", "Documents and Letters", "Other",
].map((label, index) => ({ id: String(index + 1), label }));

const readText = (row: OptionRow, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
};

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

function TextField({ label, value, onChange, type = "text", placeholder, required = false, min, step, maxLength }: {
  label: string; value: string; onChange: (value: string) => void; type?: string;
  placeholder?: string; required?: boolean; min?: string; step?: string; maxLength?: number;
}) {
  return <label className="block">
    <span className={labelClass}>{label}{required && <span className="text-red-500"> *</span>}</span>
    <input className={inputClass} type={type} value={value} onChange={event => onChange(event.target.value)}
      placeholder={placeholder} required={required} min={min} step={step} maxLength={maxLength} />
  </label>;
}

function SelectField({ label, value, onChange, options, required = false, placeholder = "Select…" }: {
  label: string; value: string; onChange: (value: string) => void;
  options: Array<{ id: string; label: string }>; required?: boolean; placeholder?: string;
}) {
  return <label className="block">
    <span className={labelClass}>{label}{required && <span className="text-red-500"> *</span>}</span>
    <select className={inputClass} value={value} onChange={event => onChange(event.target.value)} required={required}>
      <option value="">{placeholder}</option>
      {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>;
}

export default function TraxBookingDialog({ brandId, onClose, onBooked }: {
  brandId: string;
  onClose: () => void;
  onBooked: (trackingNumber: string) => void;
}) {
  const [cities, setCities] = useState<CityOption[]>([]);
  const [pickupAddresses, setPickupAddresses] = useState<PickupOption[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const [billingAccountType, setBillingAccountType] = useState<"" | "corporate_invoicing" | "reimbursement">("");
  const [addressForm, setAddressForm] = useState({ personOfContact: "", phoneNumber: "", emailAddress: "", address: "", cityId: "" });
  const [form, setForm] = useState<Record<string, string>>({
    service_type_id: "1", pickup_address_id: "", information_display: "1",
    consignee_city_id: "", consignee_name: "", consignee_address: "", consignee_phone_number_1: "",
    consignee_phone_number_2: "", consignee_email_address: "", item_product_type_id: "",
    item_description: "", item_quantity: "1", item_insurance: "0", item_price: "",
    pickup_date: localDate(),
    estimated_weight: "1", shipping_mode_id: "2", same_day_timing_id: "",
    amount: "", payment_mode_id: "1", charges_mode_id: "", delivery_type_id: "1",
    order_id: "", special_instructions: "", replacement_item_product_type_id: "",
    replacement_item_description: "", replacement_item_quantity: "1",
    open_shipment: "0", pieces_quantity: "",
    shipper_reference_number_1: "", shipper_reference_number_2: "",
    shipper_reference_number_3: "", shipper_reference_number_4: "", shipper_reference_number_5: "",
  });

  const update = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const updateAddress = (key: string, value: string) => setAddressForm(current => ({ ...current, [key]: value }));
  const cityName = useMemo(() => cities.find(city => city.id === form.consignee_city_id)?.label || "", [cities, form.consignee_city_id]);

  const loadLookups = useCallback(async () => {
    setLoadingLookups(true);
    setError("");
    try {
      const response = await fetch(`/api/trax/lookups?brandId=${encodeURIComponent(brandId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load TRAX cities and pickup addresses");
      const nextCities = (Array.isArray(data.cities) ? data.cities : []).map((value: OptionRow) => ({
        id: readText(value, "city_id", "cityId", "id"),
        label: readText(value, "city_name", "cityName", "name", "city"),
      })).filter((city: CityOption) => city.id && city.label);
      const nextAddresses = (Array.isArray(data.pickupAddresses) ? data.pickupAddresses : []).map((value: OptionRow) => ({
        id: readText(value, "pickup_address_id", "pickup_id", "id"),
        label: [
          readText(value, "person_of_contact", "contact_person", "name"),
          readText(value, "address", "pickup_address"),
          readText(value, "city_name", "city"),
        ].filter(Boolean).join(" · "),
      })).filter((address: PickupOption) => address.id);
      setCities(nextCities);
      setPickupAddresses(nextAddresses);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load TRAX setup data");
    } finally {
      setLoadingLookups(false);
    }
  }, [brandId]);

  useEffect(() => { void loadLookups(); }, [loadLookups]);

  const createPickupAddress = async (event: FormEvent) => {
    event.preventDefault();
    setAddressSaving(true);
    setError("");
    try {
      const response = await fetch("/api/trax/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, ...addressForm }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create pickup address");
      setShowAddressForm(false);
      setAddressForm({ personOfContact: "", phoneNumber: "", emailAddress: "", address: "", cityId: "" });
      await loadLookups();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create pickup address");
    } finally {
      setAddressSaving(false);
    }
  };

  const book = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload: Record<string, string | number> = {
      service_type_id: Number(form.service_type_id),
      pickup_address_id: Number(form.pickup_address_id),
      information_display: Number(form.information_display),
      consignee_city_id: Number(form.consignee_city_id),
      consignee_name: form.consignee_name.trim(),
      consignee_address: form.consignee_address.trim(),
      consignee_phone_number_1: form.consignee_phone_number_1,
      consignee_email_address: form.consignee_email_address.trim(),
      item_product_type_id: Number(form.item_product_type_id),
      item_description: form.item_description.trim(),
      item_quantity: Number(form.item_quantity),
      item_insurance: Number(form.item_insurance),
      estimated_weight: Number(form.estimated_weight),
      shipping_mode_id: Number(form.shipping_mode_id),
      amount: Number(form.amount),
      payment_mode_id: Number(form.payment_mode_id),
      charges_mode_id: Number(form.charges_mode_id),
      open_shipment: Number(form.open_shipment),
    };
    if (form.consignee_phone_number_2.trim()) payload.consignee_phone_number_2 = form.consignee_phone_number_2;
    if (form.order_id.trim()) payload.order_id = form.order_id.trim();
    if (form.item_insurance === "1" && form.item_price !== "") payload.item_price = Number(form.item_price);
    if (form.shipping_mode_id === "4" && form.same_day_timing_id !== "") payload.same_day_timing_id = Number(form.same_day_timing_id);
    if (form.service_type_id === "1") {
      payload.pickup_date = form.pickup_date;
      if (form.pieces_quantity !== "") payload.pieces_quantity = Number(form.pieces_quantity);
    }
    if (form.service_type_id === "2") {
      payload.replacement_item_product_type_id = Number(form.replacement_item_product_type_id);
      payload.replacement_item_description = form.replacement_item_description.trim();
      payload.replacement_item_quantity = Number(form.replacement_item_quantity);
    }
    if (billingAccountType === "corporate_invoicing") payload.delivery_type_id = Number(form.delivery_type_id);
    if (form.special_instructions.trim()) payload.special_instructions = form.special_instructions.trim();
    for (let index = 1; index <= 5; index += 1) {
      const key = `shipper_reference_number_${index}`;
      if (form[key].trim()) payload[key] = form[key].trim();
    }
    const accountType = billingAccountType;
    try {
      const response = await fetch("/api/trax/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, cityName, billingAccountType: accountType, payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "TRAX booking failed");
      onBooked(String(data.trackingNumber));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "TRAX booking failed");
    } finally {
      setSaving(false);
    }
  };

  const showReplacement = form.service_type_id === "2";

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="trax-book-title">
    <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600">TRAX courier</p><h2 id="trax-book-title" className="mt-1 text-xl font-bold text-slate-950">Book shipment</h2></div>
        <button type="button" onClick={onClose} aria-label="Close booking form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </header>

      <form onSubmit={book} className="min-h-0 overflow-y-auto">
        <div className="space-y-5 p-5 sm:p-7">
          {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          {loadingLookups && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading TRAX cities and pickup addresses…</div>}
          <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-900">
            Try &amp; Buy is not enabled here because the supplied guide uses inconsistent field names for that booking type. This form sends only documented Regular and Replacement fields.
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Service and pickup</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField label="Service type" required value={form.service_type_id} onChange={value => update("service_type_id", value)} options={[{ id: "1", label: "Regular" }, { id: "2", label: "Replacement" }]} />
              <div>
                <SelectField label="Pickup address" required value={form.pickup_address_id} onChange={value => update("pickup_address_id", value)} options={pickupAddresses} placeholder={loadingLookups ? "Loading…" : "Select pickup address"} />
                {pickupAddresses.length === 0 && !loadingLookups && <button type="button" onClick={() => setShowAddressForm(true)} className="mt-1 text-xs font-semibold text-sky-700 hover:underline">Add a pickup address</button>}
              </div>
              <SelectField label="Show contact details" required value={form.information_display} onChange={value => update("information_display", value)} options={[{ id: "1", label: "Show" }, { id: "0", label: "Hide" }]} />
              <SelectField label="Shipping mode" required value={form.shipping_mode_id} onChange={value => setForm(current => ({ ...current, shipping_mode_id: value, same_day_timing_id: value === "4" ? current.same_day_timing_id : "" }))} options={[
                { id: "1", label: "Rush" }, { id: "2", label: "Saver plus" }, { id: "3", label: "Swift" }, { id: "4", label: "Same day" },
              ]} />
              {form.shipping_mode_id === "4" && <SelectField label="Same-day timing" value={form.same_day_timing_id} onChange={value => update("same_day_timing_id", value)} options={[{ id: "1", label: "6 hours" }, { id: "2", label: "Same-day" }]} />}
            </div>
            {form.service_type_id === "1" && <div className="sm:max-w-xs">
              <TextField label="Pickup date" required type="date" value={form.pickup_date} onChange={value => update("pickup_date", value)} />
            </div>}
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-bold text-slate-900">Consignee</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextField label="Name" required maxLength={100} value={form.consignee_name} onChange={value => update("consignee_name", value)} />
              <TextField label="Primary phone" required type="tel" value={form.consignee_phone_number_1} onChange={value => update("consignee_phone_number_1", value)} placeholder="03XXXXXXXXX" />
              <TextField label="Secondary phone" type="tel" value={form.consignee_phone_number_2} onChange={value => update("consignee_phone_number_2", value)} placeholder="03XXXXXXXXX" />
              <TextField label="Email" required type="email" value={form.consignee_email_address} onChange={value => update("consignee_email_address", value)} />
              <SelectField label="Destination city" required value={form.consignee_city_id} onChange={value => update("consignee_city_id", value)} options={cities} placeholder={cities.length ? "Select city" : "No cities loaded"} />
              <TextField label="Order reference" maxLength={100} value={form.order_id} onChange={value => update("order_id", value)} placeholder="Your order number" />
              <div className="sm:col-span-2 lg:col-span-3">
                 <TextField label="Delivery address" required maxLength={190} value={form.consignee_address} onChange={value => update("consignee_address", value)} />
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-bold text-slate-900">Shipment details</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField label="Product type" required value={form.item_product_type_id} onChange={value => update("item_product_type_id", value)} options={productTypes} />
              <TextField label="Quantity" required type="number" min="1" step="1" value={form.item_quantity} onChange={value => update("item_quantity", value)} />
              <TextField label="Estimated weight (kg)" required type="number" min="0.01" step="0.01" value={form.estimated_weight} onChange={value => update("estimated_weight", value)} />
              <TextField label="Declared amount (PKR)" required type="number" min="0" step="1" value={form.amount} onChange={value => update("amount", value)} />
              <SelectField label="Insurance" required value={form.item_insurance} onChange={value => update("item_insurance", value)} options={[{ id: "0", label: "No" }, { id: "1", label: "Yes" }]} />
              {form.item_insurance === "1" && <TextField label="Item price for insurance (PKR)" required type="number" min="0" step="1" value={form.item_price} onChange={value => update("item_price", value)} />}
              <div className="sm:col-span-2 lg:col-span-3">
              <TextField label="Item description" required maxLength={190} value={form.item_description} onChange={value => update("item_description", value)} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <TextField label="Special instructions" maxLength={showReplacement ? 250 : undefined} value={form.special_instructions} onChange={value => update("special_instructions", value)} />
              </div>
              {!showReplacement && <TextField label="Pieces quantity (1–10)" type="number" min="1" step="1" value={form.pieces_quantity} onChange={value => update("pieces_quantity", value)} />}
              <SelectField label="Allow shipment to be opened" value={form.open_shipment} onChange={value => update("open_shipment", value)} options={[{ id: "0", label: "No" }, { id: "1", label: "Yes" }]} />
            </div>
          </section>

          {showReplacement && <section className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-bold text-slate-900">Replacement shipment item</h3>
            <p className="text-xs leading-5 text-slate-600">The guide lists an optional replacement image but does not specify how an image is encoded or uploaded, so this form does not submit one.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField label="Replacement product type" required value={form.replacement_item_product_type_id} onChange={value => update("replacement_item_product_type_id", value)} options={productTypes} />
              <TextField label="Replacement quantity" required type="number" min="1" step="1" value={form.replacement_item_quantity} onChange={value => update("replacement_item_quantity", value)} />
              <TextField label="Replacement description" required maxLength={190} value={form.replacement_item_description} onChange={value => update("replacement_item_description", value)} />
            </div>
          </section>}

          <section className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-bold text-slate-900">Payment and charges</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField label="Payment mode" required value={form.payment_mode_id} onChange={value => update("payment_mode_id", value)} options={[
                { id: "1", label: "COD" }, { id: "2", label: "CCD" }, { id: "4", label: "Prepaid" },
              ]} />
              <SelectField label="TRAX billing account" required value={billingAccountType} onChange={value => {
                const nextType = value as "" | "corporate_invoicing" | "reimbursement";
                setBillingAccountType(nextType);
                update("charges_mode_id", nextType === "corporate_invoicing" ? "3" : nextType === "reimbursement" ? "4" : "");
              }} options={[
                { id: "corporate_invoicing", label: "Corporate Invoicing" },
                { id: "reimbursement", label: "Reimbursement" },
              ]} />
              <SelectField label="Charges mode" required value={form.charges_mode_id} onChange={value => update("charges_mode_id", value)} options={billingAccountType === "corporate_invoicing"
                ? [{ id: "2", label: "2Pay" }, { id: "3", label: "Invoicing" }]
                : billingAccountType === "reimbursement" ? [{ id: "2", label: "2Pay" }, { id: "4", label: "Reimbursement" }] : []} />
              {billingAccountType === "corporate_invoicing" && <SelectField label="Delivery type" required value={form.delivery_type_id} onChange={value => update("delivery_type_id", value)} options={[
                { id: "1", label: "Doorstep" }, { id: "2", label: "Hub to Hub" },
              ]} />}
            </div>
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-bold text-slate-900">Shipper references (optional)</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5].map(index => <TextField
                key={index}
                label={`Shipper reference ${index}`}
                maxLength={index === 1 ? undefined : 190}
                value={form[`shipper_reference_number_${index}`]}
                onChange={value => update(`shipper_reference_number_${index}`, value)}
              />)}
            </div>
          </section>
        </div>

        <footer className="flex flex-col-reverse justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:px-7">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving || loadingLookups || !cities.length || !pickupAddresses.length} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Booking…</> : "Book with TRAX"}
          </button>
        </footer>
      </form>

      {showAddressForm && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6">
        <form onSubmit={createPickupAddress} className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-900">Add pickup address</h3><button type="button" onClick={() => setShowAddressForm(false)} aria-label="Close address form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Contact person" required value={addressForm.personOfContact} onChange={value => updateAddress("personOfContact", value)} />
            <TextField label="Phone" required type="tel" value={addressForm.phoneNumber} onChange={value => updateAddress("phoneNumber", value)} />
            <TextField label="Email" required type="email" value={addressForm.emailAddress} onChange={value => updateAddress("emailAddress", value)} />
            <SelectField label="City" required value={addressForm.cityId} onChange={value => updateAddress("cityId", value)} options={cities} />
            <div className="sm:col-span-2"><TextField label="Pickup address" required value={addressForm.address} onChange={value => updateAddress("address", value)} /></div>
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowAddressForm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button><button type="submit" disabled={addressSaving} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{addressSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Save address</button></div>
        </form>
      </div>}
    </div>
  </div>;
}