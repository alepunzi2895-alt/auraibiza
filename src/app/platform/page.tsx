"use client";

import { useState, useMemo, useEffect, useRef, CSSProperties } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import "leaflet/dist/leaflet.css";
import {
  getDashboardData, createBooking, updateBookingStatus,
  addProperty, addRoomWithPricing, updatePricingAction, getRoomAvailability,
  initDatabase, resetDatabase, toggleAvailabilityAction, batchUpdateAvailabilityAction,
  updateRoomAction, addCollaboration, removeCollaboration,
  addPricingMonthAction, deleteBookingAction,
  submitPaymentProposal, confirmPaymentAndBlock, recordFinalBalance, registerUser, completeGoogleRegistration,
  updateBookingPriceAdjustment, updateRoomImage,
  addPaymentMethod, deletePaymentMethod,
  updatePropertyAction, updatePropertyImage,
  removePropertyImage, removeRoomImage,
  updatePropertyPdf, removePropertyPdf,
  deletePropertyAction, deleteRoomAction,
  changePasswordAction, approveUser, rejectUser, updateUserRole, deleteUserAction,
  updateOwnProfile, requestPasswordReset, resetPasswordWithToken,
  setCommissionRule, updatePropertyAssetType,
  createManagedUser, bulkSetRoomPricing,
  getBookingRequests, updateBookingRequestStatus,
  getPlatformCommissions, upsertPlatformCommission, deletePlatformCommission,
  togglePropertyPublic, togglePropertyManagesAvailability,
  addAgentToConcierge, removeAgentFromConcierge, updateAgentCommissionRate,
  setRoomIcalUrl, syncRoomIcal, getPropertyGallery,
} from "../actions";
import { LANGUAGES, DEFAULT_LANG, t, monthNames, dayAbbrevs, unitLabel, unitSuffix, isDayBasedAsset, isVehicleAsset, type Lang } from "@/lib/i18n";
import { COUNTRY_CODES } from "@/lib/countryCodes";

const IBIZA_CENTER: [number, number] = [38.9067, 1.4206];

function LocationPicker({ lat, lng, onChange }: { lat: string; lng: string; onChange: (lat: string, lng: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || mapInstance.current) return;
      const icon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41], iconAnchor: [12, 41],
      });
      const initial: [number, number] = lat && lng ? [parseFloat(lat), parseFloat(lng)] : IBIZA_CENTER;
      const map = L.map(mapRef.current, { center: initial, zoom: lat && lng ? 13 : 10 });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap contributors © CARTO",
        maxZoom: 19,
      }).addTo(map);
      if (lat && lng) {
        markerRef.current = L.marker(initial, { icon }).addTo(map);
      }
      map.on("click", (e: any) => {
        const { lat: clat, lng: clng } = e.latlng;
        if (markerRef.current) map.removeLayer(markerRef.current);
        markerRef.current = L.marker([clat, clng], { icon }).addTo(map);
        onChange(clat.toFixed(6), clng.toFixed(6));
      });
      mapInstance.current = map;
    });
    return () => {
      cancelled = true;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div ref={mapRef} style={{ height: 200, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(200,169,110,0.25)" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input placeholder="Latitudine" value={lat} onChange={e => onChange(e.target.value, lng)} style={{ flex: 1, padding: "8px 10px", fontSize: 12, borderRadius: 6, border: "1px solid #1E2433", background: "#161C28", color: "#EDE9E1" }} />
        <input placeholder="Longitudine" value={lng} onChange={e => onChange(lat, e.target.value)} style={{ flex: 1, padding: "8px 10px", fontSize: 12, borderRadius: 6, border: "1px solid #1E2433", background: "#161C28", color: "#EDE9E1" }} />
      </div>
      <div style={{ fontSize: 10, color: "#8A8678", marginTop: 6 }}>Clicca sulla mappa per posizionare il pin, oppure inserisci le coordinate manualmente.</div>
    </div>
  );
}

const calcSplit = (ownerPriceTotal: number, conciergeFee: number, rate: number) => {
  const platformFee = Math.round(ownerPriceTotal * rate / 100 * 100) / 100;
  return { platformFee, ownerNet: Math.round((ownerPriceTotal - platformFee) * 100) / 100, total: ownerPriceTotal + conciergeFee };
};

// ============================================================
// AURA IBIZA — Concierge Booking & Property Management
// ============================================================

const LOGO = "/logo.png";

// --- TYPES ---
type UserRole = "owner" | "concierge" | "admin" | "agent";
interface User { id: string; nickname: string; role: UserRole; status?: string; managed_by?: string; created_at: number; }

const ASSET_TYPES = [
  { v: "apartment", l: "🏠 Appartamento" },
  { v: "villa", l: "🏡 Villa" },
  { v: "boat", l: "⛵ Barca" },
  { v: "car", l: "🚗 Auto" },
  { v: "scooter", l: "🛵 Scooter" },
];
const assetLabel = (type?: string) => ASSET_TYPES.find(a => a.v === type)?.l || "🏠 Appartamento";

const ASSET_CATEGORIES = [
  { key: "residenze", label: "Residenze", icon: "🏠", types: ["apartment", "villa"], defaultType: "apartment" },
  { key: "marine", label: "Marine", icon: "⛵", types: ["boat"], defaultType: "boat" },
  { key: "mobilita", label: "Mobilità", icon: "🚗", types: ["car", "scooter"], defaultType: "car" },
];

const CONCIERGE_SERVICES = [
  { id: "transfer" }, { id: "charter" }, { id: "restaurants" }, { id: "tours" }, { id: "shopping" },
  { id: "wellness" }, { id: "nightlife" }, { id: "diving" }, { id: "rental" }, { id: "events" },
];

const OWNER_SERVICES = [
  { id: "properties" }, { id: "apartments" }, { id: "villas" }, { id: "boats" },
  { id: "cars" }, { id: "scooters" }, { id: "pool" }, { id: "beach" },
];
const serviceLabel = (lang: Lang, id: string) => t(lang, `p_svc_${id}`);
interface Property { id: string; owner_id: string; name: string; location: string; description?: string; image?: string; }
interface Room { id: string; property_id: string; name: string; capacity: number; image?: string; description?: string; }
interface Pricing { id: string; room_id: string; month: string; base_price: number; cleaning_fee: number; }
interface Avail { id: string; room_id: string; date: string; status: "available" | "blocked"; price_snapshot: string; }
interface Booking {
  id: string; room_id: string; concierge_id: string; client_name: string; client_surname: string;
  start_date: string; end_date: string; notes: string; owner_price_total: number;
  concierge_fee: number; total_price: number; status: string; created_at: number;
  guests_count?: number; stay_price_total?: number; cleaning_fee_total?: number;
  fee_mode?: string; fee_value?: number; asset_type?: string;
}

// --- UTILS ---
const formatDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
const getDaysBetween = (s: string, e: string) => Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / (1000 * 60 * 60 * 48) + 13);

const compressImage = (base64: string, maxWidth = 1920, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
  });
};

const parseImages = (raw?: string): string[] => {
  if (!raw) return [];
  try {
    if (raw.startsWith('[')) return JSON.parse(raw);
    return [raw];
  } catch(e) { return [raw]; }
};

// --- DESIGN TOKENS ---
const C = {
  bg: "#080B0F", surface: "#10141C", surfaceAlt: "#161C28", surfaceGlass: "rgba(16,20,28,0.85)",
  border: "#1E2433", borderLight: "#2A3348", borderGold: "rgba(200,169,110,0.25)",
  gold: "#C8A96E", goldLight: "#E8D5A8", goldDark: "#8A6A30", goldGlow: "rgba(200,169,110,0.12)",
  text: "#EDE9E1", textMuted: "#8A8678", textDim: "#484540",
  success: "#3D9E6A", warning: "#C89A30", danger: "#B84444", info: "#4A7EC4",
  available: "#1E3D2A", blocked: "#3D1E1E",
};

const FONT = `'Cormorant Garamond', Georgia, serif`;
const FONT_B = `'DM Sans', 'Helvetica Neue', sans-serif`;

const btn = (v = "default"): CSSProperties => ({
  padding: "8px 20px", border: v === "gold" ? "none" : `1px solid ${C.border}`, borderRadius: 6,
  background: v === "gold" ? `linear-gradient(135deg, ${C.goldDark}, ${C.gold})` : "rgba(255,255,255,0.04)",
  color: v === "gold" ? "#0B0E11" : C.text, cursor: "pointer", fontFamily: FONT_B,
  fontSize: 11, fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", transition: "all 0.2s",
  boxShadow: v === "gold" ? "0 2px 12px rgba(200,169,110,0.3)" : "none",
});
const card: CSSProperties = {
  background: `linear-gradient(160deg, ${C.surface} 0%, rgba(14,18,26,0.9) 100%)`,
  border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16,
  boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
};
const cardGlass: CSSProperties = {
  background: "rgba(16,20,28,0.75)", backdropFilter: "blur(24px) saturate(1.2)",
  border: `1px solid rgba(200,169,110,0.15)`, borderRadius: 16, padding: 28, marginBottom: 16,
  boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
};
const input: CSSProperties = {
  width: "100%", padding: "11px 16px", background: C.surfaceAlt, border: `1px solid ${C.border}`,
  borderRadius: 8, color: C.text, fontFamily: FONT_B, fontSize: 13, outline: "none", boxSizing: "border-box",
  transition: "border-color 0.2s",
};
const label: CSSProperties = { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px", color: C.textMuted, marginBottom: 8, display: "block" };
const h2Style: CSSProperties = { fontFamily: FONT, fontSize: 28, fontWeight: 300, color: C.goldLight, marginBottom: 20, letterSpacing: "1.5px" };
const h3Style: CSSProperties = { fontFamily: FONT, fontSize: 20, fontWeight: 400, color: C.gold, marginBottom: 14 };
const badge = (color: string): CSSProperties => ({
  display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.8px", background: color + "18", color, border: `1px solid ${color}35`,
});
const grid = (cols = 2): CSSProperties => ({ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: 16 });
const nav: CSSProperties = {
  display: "flex", flexWrap: "nowrap", overflowX: "auto", gap: 4, padding: "10px 20px",
  borderBottom: `1px solid ${C.border}`, background: "rgba(8,11,15,0.97)",
  backdropFilter: "blur(20px)", msOverflowStyle: "none", scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
};
const navItem = (active: boolean): CSSProperties => ({
  flexShrink: 0, padding: "9px 18px", borderRadius: 8, fontSize: 11, fontWeight: 600, letterSpacing: "0.8px",
  textTransform: "uppercase", cursor: "pointer",
  background: active ? C.goldGlow : "transparent",
  color: active ? C.gold : C.textMuted,
  border: active ? `1px solid ${C.borderGold}` : "1px solid transparent",
  transition: "all 0.2s",
  boxShadow: active ? `0 0 20px ${C.goldGlow}` : "none",
});
const th: CSSProperties = { textAlign: "left", padding: "11px 14px", borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px" };
const td: CSSProperties = { padding: "11px 14px", borderBottom: `1px solid rgba(30,36,51,0.5)` };
const sel: CSSProperties = { ...input, appearance: "none" as const };

// --- Campi specifici auto/scooter (riusati in Add Room ed Edit Room, Owner e Admin) ---
interface CarFieldsValue {
  carModel: string; carCategory: string; airportDelivery: boolean;
  securityDeposit: string; kaskoIncluded: boolean; deductibleAmount: string; documentsRequired: string;
}
const emptyCarFields: CarFieldsValue = {
  carModel: "", carCategory: "compact", airportDelivery: false,
  securityDeposit: "", kaskoIncluded: false, deductibleAmount: "", documentsRequired: "",
};
function CarFieldsForm({ value, onChange, lang }: { value: CarFieldsValue; onChange: (v: CarFieldsValue) => void; lang: Lang }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16, padding: 14, background: "rgba(200,169,110,0.04)", border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={label}>{t(lang, "p_od_car_model_label")}</label>
          <input style={input} value={value.carModel} onChange={e => onChange({ ...value, carModel: e.target.value })} placeholder={t(lang, "p_od_car_model_ph")} />
        </div>
        <div>
          <label style={label}>{t(lang, "p_od_car_category_label")}</label>
          <select style={sel} value={value.carCategory} onChange={e => onChange({ ...value, carCategory: e.target.value })}>
            <option value="compact">{t(lang, "car_category_compact")}</option>
            <option value="midsize">{t(lang, "car_category_midsize")}</option>
            <option value="luxury">{t(lang, "car_category_luxury")}</option>
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={label}>{t(lang, "p_od_security_deposit_label")}</label>
          <input style={input} type="number" min="0" value={value.securityDeposit} onChange={e => onChange({ ...value, securityDeposit: e.target.value })} placeholder="0" />
        </div>
        <div>
          <label style={label}>{t(lang, "p_od_deductible_label")}</label>
          <input style={input} type="number" min="0" value={value.deductibleAmount} onChange={e => onChange({ ...value, deductibleAmount: e.target.value })} placeholder="0" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 20 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.text, cursor: "pointer" }}>
          <input type="checkbox" checked={value.airportDelivery} onChange={e => onChange({ ...value, airportDelivery: e.target.checked })} style={{ accentColor: C.gold, width: 14, height: 14 }} />
          {t(lang, "p_od_airport_delivery_label")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.text, cursor: "pointer" }}>
          <input type="checkbox" checked={value.kaskoIncluded} onChange={e => onChange({ ...value, kaskoIncluded: e.target.checked })} style={{ accentColor: C.gold, width: 14, height: 14 }} />
          {t(lang, "p_od_kasko_label")}
        </label>
      </div>
      <div>
        <label style={label}>{t(lang, "p_od_documents_required_label")}</label>
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={value.documentsRequired} onChange={e => onChange({ ...value, documentsRequired: e.target.value })} placeholder={t(lang, "p_od_documents_required_ph")} />
      </div>
    </div>
  );
}

// Suggerimenti indirizzo via Nominatim (OpenStreetMap, nessuna chiave API),
// limitati al riquadro geografico di Ibiza per evitare risultati fuori zona.
const IBIZA_VIEWBOX = "1.15,39.15,1.65,38.85";
function AddressAutocomplete({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [suggestions, setSuggestions] = useState<{ label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = (query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&viewbox=${IBIZA_VIEWBOX}&bounded=1`;
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        setSuggestions((data || []).map((d: any) => ({ label: d.display_name })));
        setOpen(true);
      } catch (_e) { /* richiesta annullata o rete assente: nessun suggerimento, non bloccante */ }
      setLoading(false);
    }, 400);
  };

  return (
    <div style={{ position: "relative" }}>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }` }} />
      <input
        style={input}
        value={value}
        onChange={e => { onChange(e.target.value); search(e.target.value); }}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loading && (
        <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${C.border}`, borderTopColor: C.gold, animation: "spin 0.8s linear infinite" }} />
        </div>
      )}
      {open && suggestions.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: C.surfaceAlt, border: `1px solid ${C.borderGold}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", overflow: "hidden" }}>
          {suggestions.map((s, i) => (
            <div key={i}
              onMouseDown={() => { onChange(s.label); setOpen(false); }}
              style={{ padding: "9px 14px", fontSize: 12, color: C.text, cursor: "pointer", borderBottom: i < suggestions.length - 1 ? `1px solid ${C.border}` : "none" }}
              onMouseEnter={e => (e.currentTarget.style.background = C.goldGlow)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >{s.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

const statusMap = (lang: Lang): Record<string, { label: string; color: string }> => ({
  draft: { label: t(lang, "p_status_draft"), color: C.textDim },
  sent: { label: t(lang, "p_status_sent"), color: C.info },
  payment_submitted: { label: t(lang, "p_status_payment_submitted"), color: C.gold },
  confirmed_owner: { label: t(lang, "p_status_confirmed_owner"), color: C.success },
  evaso: { label: t(lang, "p_status_evaso"), color: C.success },
});

const YEARS = [2024, 2025, 2026, 2027];
const monthsList = (lang: Lang) => monthNames(lang).map((l, i) => ({ v: String(i + 1).padStart(2, "0"), l }));

// --- COMPONENTS ---
interface Range { start: string | null; end: string | null; }

function LogoFull({ size = 38, isMobile = false }: { size?: number, isMobile?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
      <img src={LOGO} alt="Aura Ibiza" style={{ height: isMobile ? size * 0.8 : size, width: isMobile ? size * 0.8 : size, borderRadius: "50%", objectFit: "cover" }} />
      <div>
        <div style={{ fontFamily: FONT, fontSize: (isMobile ? size * 0.35 : size * 0.45), fontWeight: 300, color: C.gold, letterSpacing: "3px", textTransform: "uppercase", lineHeight: 1 }}>Aura Ibiza</div>
        {!isMobile && <div style={{ fontSize: size * 0.2, color: C.textMuted, letterSpacing: "2px", textTransform: "uppercase", marginTop: 2 }}>Experience</div>}
      </div>
    </div>
  );
}

function CalendarView({
  roomId, onSelectRange, selectedRange, mode = "booking", onRefresh, roomBookings, users, allPricing, isMobile = false, onEditBooking, lang = DEFAULT_LANG
}: {
  roomId: string; onSelectRange?: (r: Range) => void; selectedRange?: Range;
  mode?: "booking" | "manager"; onRefresh?: () => void; roomBookings?: any[]; users?: User[]; allPricing?: any[];
  isMobile?: boolean; onEditBooking?: (b: any) => void; lang?: Lang;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [availability, setAvailability] = useState<Avail[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const fetchMonth = async () => {
    const data = await getRoomAvailability(roomId, currentMonth);
    setAvailability(data as any);
    setDrafts({});
  };

  useEffect(() => {
    if (drafts && Object.keys(drafts).length > 0) {
      if (!confirm(t(lang, "p_cal_unsaved_confirm"))) return;
    }
    fetchMonth();
  }, [roomId, currentMonth]);

  const monthData = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    const firstDay = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    return { y, m, daysInMonth, startOffset };
  }, [currentMonth]);

  const currentMonthPricing = useMemo(() => {
    return allPricing?.find((p: any) => p.room_id === roomId && p.month === currentMonth);
  }, [allPricing, roomId, currentMonth]);

  const isInRange = (date: string) => {
    if (mode === "manager") return false;
    if (!selectedRange?.start) return false;
    if (!selectedRange?.end) return date === selectedRange.start;
    return date >= selectedRange.start && date <= selectedRange.end;
  };

  const handleDayClick = async (date: string, curAv?: Avail) => {
    if (mode !== "manager") {
      // booking mode: select range
      if (!selectedRange?.start || (selectedRange.start && selectedRange.end)) {
        onSelectRange?.({ start: date, end: null });
      } else {
        if (date < selectedRange.start) onSelectRange?.({ start: date, end: null });
        else if (date === selectedRange.start) onSelectRange?.({ start: null, end: null });
        else onSelectRange?.({ start: selectedRange.start, end: date });
      }
      return;
    }
    // manager mode: toggle or draft
    const current = drafts[date] || curAv?.status || "available";
    const next = current === "available" ? "blocked" : "available";
    setDrafts(prev => ({ ...prev, [date]: next }));
  };

  const handleSaveDrafts = async () => {
    if (Object.keys(drafts).length === 0) return;
    setIsSaving(true);
    await batchUpdateAvailabilityAction(roomId, drafts);
    setIsSaving(false);
    await fetchMonth();
    onRefresh?.();
  };

  const monthAbbrevs = Array.from({ length: 12 }, (_, i) => t(lang, `month_abbr_${i + 1}`));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button style={btn()} onClick={() => {
          const [y, m] = currentMonth.split("-").map(Number);
          setCurrentMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`);
        }}>◂</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FONT, fontSize: 18, color: C.goldLight, lineHeight: 1 }}>{monthAbbrevs[monthData.m - 1]} {monthData.y}</div>
          {currentMonthPricing && (
            <div style={{ fontSize: 9, color: C.textDim, marginTop: 4, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              {t(lang, "p_cal_price")}: <span style={{ color: C.gold }}>€{currentMonthPricing.base_price}</span> | {t(lang, "p_cd_cleaning")}: <span style={{ color: C.gold }}>€{currentMonthPricing.cleaning_fee}</span>
            </div>
          )}
        </div>
        <button style={btn()} onClick={() => {
          const [y, m] = currentMonth.split("-").map(Number);
          setCurrentMonth(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`);
        }}>▸</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {dayAbbrevs(lang).map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, color: C.textDim, padding: 4, fontWeight: 600 }}>{d}</div>
        ))}
        {Array.from({ length: monthData.startOffset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: monthData.daysInMonth }).map((_, i) => {
          const day = i + 1;
          const date = `${currentMonth}-${String(day).padStart(2, "0")}`;
          const pending = roomBookings?.find(b => 
            date >= b.start_date && date < b.end_date
          );

          const av = availability.find(a => a.date === date);
          const currentStatus = drafts[date] || av?.status;
          const isAvail = currentStatus === "available";
          const inRange = isInRange(date);
          const [baseP] = (av?.price_snapshot || "0+0").split("+").map(Number);
          
          let bgColor = isAvail ? C.available + "60" : C.blocked + "60";
          if (pending) {
            if (pending.status === "confirmed_owner" || pending.status === "evaso") bgColor = C.blocked;
            else bgColor = C.warning + "90";
          }
          if (inRange) bgColor = C.gold + "30";

          const concierge = pending ? users?.find(u => u.id === pending.concierge_id) : null;

          return (
            <div key={day} onClick={() => {
              // When selecting end date and the clicked day is the check-in of another booking,
              // treat it as end date (checkout morning / check-in afternoon on same day is allowed)
              const isSelectingEnd = !!(selectedRange?.start && !selectedRange?.end);
              if (isSelectingEnd && pending && pending.start_date === date) handleDayClick(date, av);
              else if (pending && onEditBooking) onEditBooking(pending);
              else handleDayClick(date, av);
            }} style={{
              padding: isMobile ? "4px 0" : "6px 2px", textAlign: "center", borderRadius: 3,
              cursor: (av || pending) ? "pointer" : "default",
              background: bgColor,
              border: drafts[date] ? `1px solid ${C.warning}` : inRange ? `1px solid ${C.gold}` : "1px solid transparent",
              opacity: av || pending ? 1 : 0.4, transition: "all 0.15s",
              position: "relative", minHeight: isMobile ? 32 : 40, display: "flex", flexDirection: "column", justifyContent: "center"
            }}>
              <div style={{ fontSize: isMobile ? 11 : 13, fontWeight: inRange || drafts[date] || pending ? 600 : 400, color: inRange ? C.gold : drafts[date] ? C.warning : C.text }}>{day}</div>
              {pending && !isMobile ? (
                <div style={{ fontSize: 7, color: C.bg, background: C.goldLight, fontWeight: 700, padding: "1px 2px", marginTop: 2, borderRadius: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {concierge ? concierge.nickname : pending.client_name}
                </div>
              ) : pending && isMobile ? (
                 <div style={{ height: 3, width: 3, borderRadius: "50%", background: C.gold, margin: "2px auto 0" }} />
              ) : (
                <div style={{ minHeight: isMobile ? 0 : 12 }}></div>
              )}
              {mode === "manager" && isAvail && !pending && <div style={{ position: "absolute", top: 2, right: 2, width: 4, height: 4, background: C.success, borderRadius: "50%" }} />}
            </div>
          );
        })}
      </div>
      
      {mode === "manager" && Object.keys(drafts).length > 0 && (
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button style={btn("gold")} onClick={handleSaveDrafts} disabled={isSaving}>
            {isSaving ? t(lang, "p_cal_saving") : t(lang, "p_cal_save_n_changes", { n: Object.keys(drafts).length })}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16, fontSize: 10, color: C.textDim, justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 10, height: 10, background: C.available + "60", borderRadius: 2 }} /> {t(lang, "cal_available")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 10, height: 10, background: C.blocked + "60", borderRadius: 2 }} /> {t(lang, "p_cal_blocked")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 10, height: 10, background: C.warning + "90", borderRadius: 2 }} /> {t(lang, "p_cal_pending")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 10, height: 10, background: C.blocked, borderRadius: 2 }} /> {t(lang, "cal_booked")}</div>
        {mode === "manager" && <div style={{ color: C.goldLight, marginLeft: 8 }}>{t(lang, "p_cal_click_hint")}</div>}
      </div>
    </div>
  );
}

function PdfPreview({ data, onClose }: { data: { booking: Booking; room: Room | undefined; property: Property | undefined } | null; onClose: () => void }) {
  if (!data) return null;
  const { booking, room, property } = data;
    const originalTitle = typeof document !== "undefined" ? document.title : "";
    useEffect(() => {
      document.title = `Preventivo_${booking.client_name}_${booking.client_surname || ""}`.replace(/\s+/g, "_");
      return () => { document.title = originalTitle; };
    }, [booking, originalTitle]);

  return (
    <div id="pdf-overlay-root" className="pdf-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", justifyContent: "center", alignItems: "flex-start", zIndex: 600, backdropFilter: "blur(12px)", padding: "20px", overflowY: "auto" }} onClick={onClose}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { 
            height: auto !important; 
            margin: 0 !important; 
            padding: 0 !important; 
            overflow: visible !important; 
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* NUCLEAR REDACT: Hide everything except the PDF Overlay */
          body > :not(#pdf-overlay-root) { display: none !important; }
          #pdf-overlay-root {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            overflow: visible !important;
            z-index: 9999999 !important;
            backdrop-filter: none !important;
          }
          .app-container { display: none !important; }
          #pdf-wrapper { 
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            width: 210mm !important; 
            margin: 0 auto !important;
            padding: 0 !important;
          }
          .pdf-page {
            width: 210mm !important;
            height: 297mm !important;
            padding: 10mm 20mm 20mm !important;
            box-sizing: border-box !important;
            break-after: page !important;
            page-break-after: always !important;
            position: relative !important;
            background: #FDFBF7 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            visibility: visible !important;
            display: block !important;
          }
          .pdf-page:last-child { break-after: auto !important; page-break-after: auto !important; }
          .no-print { display: none !important; }
        }
      `}} />
      <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }} onClick={e => e.stopPropagation()}>
        <div id="pdf-wrapper" style={{ display: "flex", flexDirection: "column", gap: 0, alignItems: "center" }}>
        {/* PAGE 1: DETAILS */}
        <div className="pdf-page" style={{ 
          width: "210mm", height: "auto", minHeight: "297mm", 
          background: "#FDFBF7", color: "#1A1A1A", 
          borderRadius: 2, boxShadow: "0 0 50px rgba(0,0,0,0.3)", position: "relative",
          padding: "36px"
        }}>
          <div style={{ background: "#0B0E11", margin: "-36px -36px 36px", padding: "36px", display: "flex", alignItems: "center", gap: 16 }}>
            <img src={LOGO} alt="Aura Ibiza" style={{ height: 56, width: 56, borderRadius: "50%", objectFit: "cover" }} />
            <div>
              <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 300, color: "#C8A96E", letterSpacing: "4px", textTransform: "uppercase" }}>Aura Ibiza</div>
              <div style={{ fontSize: 10, color: "#8A8678", letterSpacing: "3px", textTransform: "uppercase" }}>Concierge · Preventivo</div>
            </div>
          </div>
          
          <div>
          
          <div style={{ fontFamily: FONT, fontSize: 22, color: "#333", marginBottom: 30, borderBottom: "1px solid #EEE", paddingBottom: 10 }}>Dettagli Soggiorno</div>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, fontSize: 13, lineHeight: 2 }}>
            <div><span style={{ color: "#999", fontSize: 11, textTransform: "uppercase", letterSpacing: "1px" }}>Cliente</span><br /><strong>{booking.client_name} {booking.client_surname}</strong></div>
            <div><span style={{ color: "#999", fontSize: 11, textTransform: "uppercase", letterSpacing: "1px" }}>Proprietà</span><br /><strong>{property?.name}</strong></div>
            <div><span style={{ color: "#999", fontSize: 11, textTransform: "uppercase", letterSpacing: "1px" }}>Stanza</span><br /><strong>{room?.name}</strong></div>
            <div><span style={{ color: "#999", fontSize: 11, textTransform: "uppercase", letterSpacing: "1px" }}>Ospiti</span><br /><strong>{booking.guests_count || 1} { (booking.guests_count||1) > 1 ? 'persone' : 'persona'}</strong></div>
            <div><span style={{ color: "#999", fontSize: 11, textTransform: "uppercase", letterSpacing: "1px" }}>Check-in</span><br /><strong>{formatDate(booking.start_date)}</strong></div>
            <div><span style={{ color: "#999", fontSize: 11, textTransform: "uppercase", letterSpacing: "1px" }}>Check-out</span><br /><strong>{formatDate(booking.end_date)}</strong></div>
            <div><span style={{ color: "#999", fontSize: 11, textTransform: "uppercase", letterSpacing: "1px" }}>{isDayBasedAsset(booking.asset_type) ? "Giorni" : "Notti"}</span><br /><strong>{getDaysBetween(booking.start_date, booking.end_date)}</strong></div>
            <div><span style={{ color: "#999", fontSize: 11, textTransform: "uppercase", letterSpacing: "1px" }}>Location</span><br /><strong>{property?.location}</strong></div>
          </div>

          <div style={{ marginTop: 40, background: "#F9F7F2", padding: 24, borderRadius: 4, border: "1px solid #EEE" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 15 }}>
              <span style={{ color: "#666" }}>Soggiorno ({getDaysBetween(booking.start_date, booking.end_date)} {isDayBasedAsset(booking.asset_type) ? (getDaysBetween(booking.start_date, booking.end_date) === 1 ? "giorno" : "giorni") : (getDaysBetween(booking.start_date, booking.end_date) === 1 ? "notte" : "notti")})</span>
              <span style={{ fontWeight: 600 }}>€{((booking.stay_price_total || 0) + (booking.concierge_fee || 0)) || booking.total_price - (booking.cleaning_fee_total || 0)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 0, fontSize: 15 }}>
              <span style={{ color: "#666" }}>Spese di Pulizia</span>
              <span style={{ fontWeight: 600 }}>€{booking.cleaning_fee_total || 0}</span>
            </div>
          </div>

            <div style={{ borderTop: "3px solid #C8A96E", marginTop: 30, paddingTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, fontFamily: FONT, color: "#1A1A1A" }}>
                <span style={{ fontWeight: 300, letterSpacing: "1px" }}>TOTALE</span>
                <span style={{ fontWeight: 700 }}>€{booking.total_price}</span>
              </div>
              <div style={{ textAlign: "right", fontSize: 14, color: "#8A8678", marginTop: 6 }}>
                Quota per persona: <strong>€{(booking.total_price / (booking.guests_count || 1)).toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <div style={{ position: "absolute", bottom: 40, left: 36, right: 36, textAlign: "center", borderTop: "1px solid #EEE", paddingTop: 20 }}>
            <img src={LOGO} alt="" style={{ height: 32, width: 32, borderRadius: "50%", opacity: 0.5, marginBottom: 8 }} />
            <div style={{ fontSize: 9, color: "#AAA", letterSpacing: "3px", textTransform: "uppercase" }}>Aura Ibiza · Personalized Quote</div>
          </div>
        </div>

        {/* PAGE 2+: DESCRIPTION & GALLERIES */}
        {(room?.description || room?.image || property?.description || property?.image) && (
          <div style={{ display: "contents" }}>
            <div className="pdf-page" style={{ 
              width: "210mm", height: "auto", minHeight: "297mm", 
              background: "#FDFBF7", color: "#1A1A1A", 
              borderRadius: 2, boxShadow: "0 0 50px rgba(0,0,0,0.3)",
              padding: "36px", paddingBottom: "80px",
              display: "flex", flexDirection: "column"
            }}>
              <div style={{ fontFamily: FONT, fontSize: 22, color: "#333", marginBottom: 24, borderBottom: "1px solid #EEE", paddingBottom: 10 }}>Oltre il Soggiorno</div>
              
              {/* PROPERTY SECTION */}
              <div style={{ marginBottom: 40, pageBreakInside: "avoid" }}>
                <h3 style={{ fontFamily: FONT, fontSize: 18, color: "#C8A96E", marginBottom: 12, textTransform: "uppercase", letterSpacing: "1px" }}>L'Atmosfera: {property?.name}</h3>
                {property?.description && (
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "#555", whiteSpace: "pre-wrap", marginBottom: 20 }}>
                    {property.description}
                  </div>
                )}
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {parseImages(property?.image).map((img, i) => (
                    <div key={i} style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #EEE", boxShadow: "0 4px 10px rgba(0,0,0,0.05)", pageBreakInside: "avoid" }}>
                       <img src={img} alt="" style={{ width: "100%", height: "auto", minHeight: 120, objectFit: "cover", display: "block" }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* ROOM SECTION */}
              <div style={{ marginBottom: 40, pageBreakInside: "avoid" }}>
                <h3 style={{ fontFamily: FONT, fontSize: 18, color: "#C8A96E", marginBottom: 12, textTransform: "uppercase", letterSpacing: "1px" }}>La Tua Dimora: {room?.name}</h3>
                {room?.description && (
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "#555", whiteSpace: "pre-wrap", marginBottom: 20 }}>
                    {room.description}
                  </div>
                )}
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {parseImages(room?.image).map((img, i) => (
                    <div key={i} style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #EEE", boxShadow: "0 4px 10px rgba(0,0,0,0.05)", pageBreakInside: "avoid" }}>
                       <img src={img} alt="" style={{ width: "100%", height: "auto", minHeight: 120, objectFit: "cover", display: "block" }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* FOOTER - FLOW POSITIONED */}
              <div style={{ marginTop: "auto", textAlign: "center", borderTop: "1px solid #EEE", paddingTop: 20 }}>
                <div style={{ fontSize: 9, color: "#AAA", letterSpacing: "3px", textTransform: "uppercase" }}>Aura Ibiza · Dream Destinations</div>
              </div>
            </div>
          </div>
        )}

        {/* CONTROLS */}
        <div className="no-print" style={{ width: "210mm", background: "rgba(11,14,17,0.95)", padding: "16px 24px", borderRadius: "0 0 8px 8px", display: "flex", gap: 12, border: `1px solid ${C.border}`, position: "sticky", bottom: 0, zIndex: 10 }}>
          <button style={{ ...btn("gold"), flex: 2, background: "linear-gradient(135deg, #A0844A, #C8A96E)", color: "#FFF", fontSize: 14 }} onClick={() => window.print()}>⬇ Scarica Preventivo (PDF)</button>
          <button style={{ ...btn(), flex: 1, color: "#FFF", borderColor: "#444" }} onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  </div>
);
}

// --- ASSET CATEGORY TABS component ---
function AssetCategoryTabs({ value, onChange, counts }: { value: string; onChange: (k: string) => void; counts?: Record<string, number> }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
      {ASSET_CATEGORIES.map(cat => {
        const active = value === cat.key;
        const count = counts?.[cat.key] ?? 0;
        return (
          <button key={cat.key} onClick={() => onChange(cat.key)} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
            borderRadius: 10, border: active ? `1px solid ${C.borderGold}` : `1px solid ${C.border}`,
            background: active ? C.goldGlow : "rgba(255,255,255,0.03)",
            color: active ? C.gold : C.textMuted, cursor: "pointer",
            fontFamily: FONT_B, fontSize: 12, fontWeight: 600, letterSpacing: "0.5px",
            transition: "all 0.2s", boxShadow: active ? `0 0 16px ${C.goldGlow}` : "none",
          }}>
            <span style={{ fontSize: 16 }}>{cat.icon}</span>
            <span style={{ textTransform: "uppercase", letterSpacing: "0.8px" }}>{cat.label}</span>
            {count > 0 && <span style={{ background: active ? C.gold : C.textDim, color: active ? C.bg : C.textMuted, borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: "center" }}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// --- CONCIERGE DASHBOARD ---
function ConciergeDashboard({ user, data, refresh, setPdfPreview, isMobile = false, lang }: { user: User, data: any, refresh: () => void, setPdfPreview: (v: any) => void, isMobile?: boolean, lang: Lang }) {
  const [tab, setTab] = useState("calendar");
  const [assetTab, setAssetTab] = useState("residenze");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [newAgentNick, setNewAgentNick] = useState("");
  const [newAgentCommRate, setNewAgentCommRate] = useState("10");
  const [selectedRange, setSelectedRange] = useState<Range>({ start: null, end: null });
  const [newMethodName, setNewMethodName] = useState("");

  useEffect(() => {
    if (!selectedRoom && data.rooms.length > 0) {
      setSelectedRoom(data.rooms[0].id);
    }
  }, [data.rooms, selectedRoom]);

  useEffect(() => {
    const cat = ASSET_CATEGORIES.find(c => c.key === assetTab);
    if (!cat) return;
    const first = data.rooms.find((r: any) => {
      const prop = [...(data.properties || []), ...(data.collaboratedProperties || [])].find((p: any) => p.id === r.property_id);
      return cat.types.includes(prop?.asset_type || "apartment");
    });
    if (first) setSelectedRoom(first.id);
  }, [assetTab]);
  const [clientName, setClientName] = useState("");
  const [clientSurname, setClientSurname] = useState("");
  const [notes, setNotes] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [dropoffTime, setDropoffTime] = useState("");
  const [guestsCount, setGuestsCount] = useState("1");
  const [conciergeFee, setConciergeFee] = useState("0");
  const [agentFeeVal, setAgentFeeVal] = useState("0");
  const [feeMode, setFeeMode] = useState<'per_night' | 'percentage'>('per_night');
  const [confirmModal, setConfirmModal] = useState<any>(null); // For "Invia al Proprietario"
  const [deleteBookingId, setDeleteBookingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [viewNotes, setViewNotes] = useState<string | null>(null);
  const [confirmingDeleteMethod, setConfirmingDeleteMethod] = useState<string | null>(null);

  // Filters
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  // Payment Modal State
  const [payModal, setPayModal] = useState<any>(null);
  const [accontoAmount, setAccontoAmount] = useState("");
  const [confirmData, setConfirmData] = useState({ date: new Date().toLocaleDateString('en-CA'), method: "" });
  const [accontoDate, setAccontoDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [accontoMethod, setAccontoMethod] = useState("Bonifico");
  
  // Owner Balance State
  const [balanceModal, setBalanceModal] = useState<any>(null);
  const [balanceData, setBalanceData] = useState({ amount: "", date: new Date().toLocaleDateString('en-CA'), method: "Contanti" });

  const rooms = data.rooms;
  const allProperties = [...(data.properties || []), ...(data.collaboratedProperties || [])];
  const currentAssetCat = ASSET_CATEGORIES.find(c => c.key === assetTab) || ASSET_CATEGORIES[0];
  const filteredRooms = rooms.filter((r: any) => {
    const prop = allProperties.find((p: any) => p.id === r.property_id);
    return currentAssetCat.types.includes(prop?.asset_type || "apartment");
  });
  const assetCategoryCounts = Object.fromEntries(ASSET_CATEGORIES.map(cat => [
    cat.key,
    rooms.filter((r: any) => {
      const prop = allProperties.find((p: any) => p.id === r.property_id);
      return cat.types.includes(prop?.asset_type || "apartment");
    }).length
  ]));
  const currentRoom = rooms.find((r: any) => r.id === selectedRoom);

  const displayBookings = useMemo(() => {
    const accessibleRoomIds = new Set(rooms.map((r: any) => r.id));
    return data.bookings.filter((b: any) => {
      if (!accessibleRoomIds.has(b.room_id)) return false;
      const isOwn = b.concierge_id === user.id;
      // Client name search only applies to own bookings (other clients are private)
      const matchSearch = isOwn
        ? (b.client_name + " " + (b.client_surname || "")).toLowerCase().includes(searchFilter.toLowerCase())
        : !searchFilter; // Hide others when searching by client name
      const matchStatus = statusFilter ? b.status === statusFilter : true;
      const matchRoom = roomFilter ? b.room_id === roomFilter : true;
      const matchYear = yearFilter ? b.start_date.startsWith(yearFilter) : true;
      const matchMonth = monthFilter ? b.start_date.slice(5, 7) === monthFilter : true;
      return matchSearch && matchStatus && matchRoom && matchYear && matchMonth;
    });
  }, [data.bookings, user.id, rooms, searchFilter, statusFilter, roomFilter, yearFilter, monthFilter]);

  const [reportStart, setReportStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [reportEnd, setReportEnd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-12-31`;
  });
  const selectedRoomAssetType = useMemo(() => {
    const room = data.rooms.find((r: any) => r.id === selectedRoom);
    const prop = [...(data.properties || []), ...(data.collaboratedProperties || [])].find((p: any) => p.id === room?.property_id);
    return prop?.asset_type;
  }, [selectedRoom, data.rooms, data.properties, data.collaboratedProperties]);

  const pricing = useMemo(() => {
    if (!selectedRange?.start || !selectedRange?.end || !selectedRoom) return null;
    const n = getDaysBetween(selectedRange.start, selectedRange.end);
    if (n <= 0) return null;

    let baseTotal = 0;
    const r = new Date(selectedRange.start + "T00:00:00");
    const e = new Date(selectedRange.end + "T00:00:00");
    let cFee = 0;

    while (r < e) {
       const ms = `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}`;
       const pr = data.pricing.find((p: any) => p.room_id === selectedRoom && p.month === ms);
       baseTotal += pr ? pr.base_price : 0;
       cFee = pr ? pr.cleaning_fee : 0;
       r.setDate(r.getDate() + 1);
    }

    return { baseTotal, cleaningFee: cFee, nights: n };
  }, [selectedRoom, selectedRange, data.pricing]);

  const totals = useMemo(() => {
    if (!pricing) return null;
    const ownerPrice = pricing.baseTotal + pricing.cleaningFee;
    const feeVal = Number(conciergeFee) || 0;
    const concFee = feeMode === 'percentage'
      ? Math.round(ownerPrice * feeVal / 100 * 100) / 100
      : feeVal * pricing.nights;
    const agFee = user.role === "agent" ? (Number(agentFeeVal) || 0) : 0;
    // find concierge commission on this agent
    const agentCollab = (data.agentConciergeCollabs || []).find((c: any) => c.agent_id === user.id);
    const concCommOnAgent = agentCollab ? Math.round(agFee * (agentCollab.commission_rate || 0) / 100 * 100) / 100 : 0;
    return {
      ownerPrice,
      conciergeFee: concFee,
      agentFee: agFee,
      conciergeCommissionOnAgent: concCommOnAgent,
      agentNet: agFee - concCommOnAgent,
      totalPrice: ownerPrice + concFee + agFee
    };
  }, [pricing, conciergeFee, feeMode, agentFeeVal, user.role, data.agentConciergeCollabs, user.id]);

  const handleCreateBooking = async () => {
    if (!clientName.trim() || !selectedRange?.start || !selectedRange?.end || !totals || !pricing) { setMsg(t(lang, "p_cd_fill_all_fields_warning")); return; }
    // For agents: find the concierge they're linked to for this property
    let conciergeIdForBooking = user.id;
    if (user.role === "agent") {
      const agentCollab = (data.agentConciergeCollabs || []).find((c: any) => c.agent_id === user.id);
      if (agentCollab) conciergeIdForBooking = agentCollab.concierge_id;
    }
    await createBooking({
      room_id: selectedRoom,
      concierge_id: conciergeIdForBooking,
      agent_id: user.role === "agent" ? user.id : null,
      client_name: clientName, client_surname: clientSurname,
      start_date: selectedRange.start, end_date: selectedRange.end, notes,
      owner_price_total: totals.ownerPrice,
      concierge_fee: totals.conciergeFee,
      agent_fee: totals.agentFee,
      total_price: totals.totalPrice,
      stay_price_total: pricing.baseTotal, cleaning_fee_total: pricing.cleaningFee,
      guests_count: parseInt(guestsCount) || 1,
      fee_mode: feeMode, fee_value: Number(conciergeFee) || 0,
      pickup_time: isVehicleAsset(selectedRoomAssetType) ? pickupTime : null,
      dropoff_time: isVehicleAsset(selectedRoomAssetType) ? dropoffTime : null,
    });
    setMsg(t(lang, "p_cd_booking_created"));
    setClientName(""); setClientSurname(""); setNotes(""); setPickupTime(""); setDropoffTime("");
    setSelectedRange({ start: null, end: null });
    refresh();
    setTab("bookings");
  };

  const generatePdf = async (b: any) => {
    const room = data.rooms.find((r: any) => r.id === b.room_id);
    const prop = data.properties.find((p: any) => p.id === room?.property_id)
      || (data.collaboratedProperties || []).find((p: any) => p.id === room?.property_id);
    let propFull = prop;
    if (prop) {
      const gallery = await getPropertyGallery(prop.id);
      if (gallery.image) propFull = { ...prop, image: gallery.image };
    }
    setPdfPreview({ booking: b, room, property: propFull });
  };

  const handleStatusChange = async (id: string, st: string) => {
    await updateBookingStatus(id, st);
    if (st === "confirmed_client") setMsg(t(lang, "p_cd_booking_confirmed_locked"));
    else setMsg(t(lang, "p_cd_status_updated_to", { status: st }));
    refresh();
  };
  const handleDelete = (id: string) => {
    setDeleteBookingId(id);
  };

  const performDelete = async (id: string) => {
    await deleteBookingAction(id);
    setDeleteBookingId(null);
    setMsg(t(lang, "p_cd_booking_deleted"));
    refresh();
  };

  const handleRegisterPayment = async () => {
    if (!accontoAmount) { setMsg(t(lang, "p_cd_enter_deposit_amount")); return; }

    // Identifica l'Owner corretto per questa prenotazione
    const room = data.rooms.find((r: any) => r.id === payModal.room_id);
    const property = data.properties.find((p: any) => p.id === room?.property_id);
    const ownerId = property?.owner_id;
    const ownerUser = data.users.find((u: any) => u.id === ownerId);
    const bOwnerName = ownerUser?.nickname || "Owner";

    if (!ownerId) {
      alert(t(lang, "p_cd_error_identify_owner"));
      return;
    }

    const acc = parseFloat(accontoAmount) || 0;
    const payments = [];

    // Alessandro (Concierge) is implicitly the collector
    const storno = Math.max(0, acc - payModal.concierge_fee);
    payments.push({ 
      booking_id: payModal.id, 
      type: 'acconto_concierge', 
      amount: acc, 
      date: accontoDate, 
      method: accontoMethod, 
      receiver: user.id,
      description: `Acconto incassato da Concierge`
    });

    if (storno > 0) {
      // Leg 2: Outflow from Concierge
      payments.push({ 
        booking_id: payModal.id, 
        type: 'storno_owner_out', 
        amount: storno, 
        date: accontoDate, 
        method: accontoMethod, 
        receiver: user.id,
        description: `Storno acconto inviato a Owner`
      });
      // Leg 3: Inflow to Owner (Method will be defined by Owner during verification)
      payments.push({ 
        booking_id: payModal.id, 
        type: 'storno_owner_in', 
        amount: storno, 
        date: accontoDate, 
        method: "", 
        receiver: ownerId,
        description: `Storno acconto ricevuto da Concierge`
      });
    }

    await submitPaymentProposal(payModal.id, payments);
    setMsg(t(lang, "p_cd_proposal_sent_to", { name: bOwnerName }));
    setPayModal(null);
    setAccontoAmount("");
    refresh();
  };

  const conciergeBookings = data.bookings.filter((b: any) => b.concierge_id === user.id);
  const totalCommissions = conciergeBookings.filter((b: any) => b.status === "confirmed_owner").reduce((s: number, b: any) => s + b.concierge_fee, 0);

  if (rooms.length === 0 && tab !== "report" && tab !== "bookings") {
    return (
      <div>
        <div style={nav}>
          {[{ key: "calendar", l: t(lang, "p_nav_calendar") }, { key: "booking", l: t(lang, "p_nav_new") }, { key: "bookings", l: t(lang, "p_nav_bookings") }, { key: "report", l: t(lang, "p_nav_report") }, { key: "settings", l: t(lang, "p_nav_settings") }].map(t2 => (
            <div key={t2.key} style={navItem(tab === t2.key)} onClick={() => setTab(t2.key)}>{t2.l}</div>
          ))}
        </div>
        <div style={{ padding: 40, textAlign: "center", maxWidth: 600, margin: "0 auto", ...card, marginTop: 40, borderColor: C.warning + "33" }}>
          <h2 style={{ ...h2Style, color: C.warning }}>{t(lang, "p_cd_no_structure_title")}</h2>
          <p style={{ color: C.textDim, marginTop: 16 }}>{t(lang, "p_cd_no_structure_desc")} <strong style={{ color: C.gold }}>{user.nickname}</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={nav}>
        {[{ key: "calendar", l: t(lang, "p_nav_calendar") }, { key: "booking", l: t(lang, "p_nav_new") }, { key: "bookings", l: t(lang, "p_nav_bookings") }, { key: "report", l: t(lang, "p_nav_report") }, { key: "settings", l: t(lang, "p_nav_settings") }].map(t2 => (
          <div key={t2.key} style={navItem(tab === t2.key)} onClick={() => setTab(t2.key)}>{t2.l}</div>
        ))}
      </div>
      <div style={{ padding: isMobile ? 12 : 24, maxWidth: 1100, margin: "0 auto" }}>
        {msg && (
          <div style={{ ...card, background: msg.startsWith("⚠") ? C.warning + "15" : C.success + "15", borderColor: msg.startsWith("⚠") ? C.warning + "44" : C.success + "44", fontSize: 12, color: msg.startsWith("⚠") ? C.warning : C.success }}>
            {msg} <span style={{ float: "right", cursor: "pointer" }} onClick={() => setMsg("")}>✕</span>
          </div>
        )}

        {tab === "calendar" && (
          <div>
            <h2 style={h2Style}>{t(lang, "p_cd_availability")}</h2>
            <AssetCategoryTabs value={assetTab} onChange={k => { setAssetTab(k); setSelectedRange({ start: null, end: null }); }} counts={assetCategoryCounts} />
            {filteredRooms.length === 0 ? (
              <div style={{ ...card, textAlign: "center", color: C.textDim, padding: 40 }}>
                {t(lang, "p_cd_no_asset_category")}
              </div>
            ) : (
            <div style={{ marginBottom: 16 }}>
              <label style={label}>{t(lang, "p_cd_select_room")}</label>
              <select style={sel} value={selectedRoom} onChange={e => { setSelectedRoom(e.target.value); setSelectedRange({ start: null, end: null }); }}>
                {filteredRooms.map((r: any) => {
                  const prop = allProperties.find((p: any) => p.id === r.property_id);
                  return <option key={r.id} value={r.id}>{prop?.name} — {r.name} (max {r.capacity} pax)</option>;
                })}
              </select>
            </div>
            )}
            {selectedRoom && filteredRooms.some((r: any) => r.id === selectedRoom) && (
            <div style={card}><CalendarView roomId={selectedRoom} onSelectRange={setSelectedRange} selectedRange={selectedRange} roomBookings={data.bookings.filter((b: any) => b.room_id === selectedRoom)} users={data.users} allPricing={data.pricing} lang={lang} /></div>
            )}
            {selectedRange?.start && (
              <div style={{ ...card, borderColor: C.gold + "44" }}>
                <div style={{ fontSize: 12, color: C.textMuted }}>
                  {t(lang, "p_cd_selection")}: <strong style={{ color: C.gold }}>{formatDate(selectedRange.start)}</strong>
                  {selectedRange.end ? <> → <strong style={{ color: C.gold }}>{formatDate(selectedRange.end)}</strong> ({getDaysBetween(selectedRange.start, selectedRange.end)} {t(lang, "p_cd_nights")})</> : <span style={{ color: C.textDim }}> {t(lang, "p_cd_select_end_date")}</span>}
                </div>
                {pricing && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}44`, paddingTop: 12, fontSize: 11, lineHeight: 1.8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t(lang, "p_cd_stay")} ({pricing.nights} {t(lang, "p_cd_nights")})</span>
                      <span>€{pricing.baseTotal}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t(lang, "p_cd_cleaning_fee")}</span>
                      <span>€{pricing.cleaningFee}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontWeight: 600, color: C.gold }}>
                      <span>{t(lang, "p_cd_owner_share")}</span>
                      <span>€{pricing.baseTotal + pricing.cleaningFee}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "booking" && (
          <div>
            <h2 style={h2Style}>{t(lang, "p_cd_new_booking")}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={card}>
                <h3 style={h3Style}>{t(lang, "p_cd_step1_title")}</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={label}>{t(lang, "p_cd_select_room")}</label>
                  <select style={sel} value={selectedRoom} onChange={e => { setSelectedRoom(e.target.value); setSelectedRange({ start: null, end: null }); }}>
                    {rooms.map((r: any) => {
                      const prop = data.properties.find((p: any) => p.id === r.property_id);
                      return <option key={r.id} value={r.id}>{prop?.name} — {r.name}</option>;
                    })}
                  </select>
                </div>
                <CalendarView roomId={selectedRoom} onSelectRange={setSelectedRange} selectedRange={selectedRange} roomBookings={data.bookings.filter((b: any) => b.room_id === selectedRoom)} users={data.users} allPricing={data.pricing} lang={lang} />
              </div>
              <div>
                <div style={card}>
                  <h3 style={h3Style}>{t(lang, "p_cd_step2_title")}</h3>
                  <div style={grid(2)}>
                    <div><label style={label}>{t(lang, "p_cd_first_name")}</label><input style={input} value={clientName} onChange={e => setClientName(e.target.value)} placeholder={t(lang, "p_first_name")} /></div>
                    <div><label style={label}>{t(lang, "p_cd_last_name")}</label><input style={input} value={clientSurname} onChange={e => setClientSurname(e.target.value)} placeholder={t(lang, "p_last_name")} /></div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label style={label}>{t(lang, "p_cd_guests_count")}</label>
                    <input style={input} type="number" min="1" value={guestsCount} onChange={e => setGuestsCount(e.target.value)} />
                    {selectedRoom && parseInt(guestsCount) > (currentRoom?.capacity || 0) && <div style={{ fontSize: 10, color: C.warning, marginTop: 4 }}>{t(lang, "p_cd_exceeds_capacity")} ({currentRoom?.capacity})</div>}
                  </div>
                  <div style={{ marginTop: 12 }}><label style={label}>{t(lang, "p_cd_notes")}</label><textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t(lang, "p_cd_notes_ph")} /></div>
                  {isVehicleAsset(selectedRoomAssetType) && (
                    <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                      <div style={{ flex: 1 }}><label style={label}>{t(lang, "p_od_pickup_time_label")}</label><input style={input} type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} /></div>
                      <div style={{ flex: 1 }}><label style={label}>{t(lang, "p_od_dropoff_time_label")}</label><input style={input} type="time" value={dropoffTime} onChange={e => setDropoffTime(e.target.value)} /></div>
                    </div>
                  )}
                </div>
                {/* Fee fields */}
                <div style={card}>
                  <h3 style={h3Style}>{t(lang, "p_cd_step3_title")}</h3>
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <label style={label}>{user.role === "agent" ? t(lang, "p_cd_fee_concierge_to_concierge") : t(lang, "p_cd_your_commission")}</label>
                      <input style={input} type="number" min="0" step="0.5" value={conciergeFee} onChange={e => setConciergeFee(e.target.value)} />
                    </div>
                    <div>
                      <label style={label}>{t(lang, "p_cd_mode")}</label>
                      <select style={sel} value={feeMode} onChange={e => setFeeMode(e.target.value as any)}>
                        <option value="per_night">{unitSuffix(lang, data.properties.find((p: any) => p.id === currentRoom?.property_id)?.asset_type).replace("/", "€/")}</option>
                        <option value="percentage">%</option>
                      </select>
                    </div>
                  </div>
                  {user.role === "agent" && (
                    <div style={{ marginBottom: 0 }}>
                      <label style={label}>{t(lang, "p_cd_your_agent_fee")}</label>
                      <input style={input} type="number" min="0" step="1" value={agentFeeVal} onChange={e => setAgentFeeVal(e.target.value)} placeholder="es. 50" />
                      {totals && totals.conciergeCommissionOnAgent > 0 && (
                        <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
                          {t(lang, "p_cd_concierge_keeps")} <span style={{ color: C.gold }}>{(data.agentConciergeCollabs || []).find((c: any) => c.agent_id === user.id)?.commission_rate || 0}%</span> = <span style={{ color: C.danger }}>-€{totals.conciergeCommissionOnAgent.toFixed(2)}</span> {t(lang, "p_cd_to_you")} <span style={{ color: C.success }}>€{totals.agentNet.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {pricing && totals && (
                  <div style={{ ...card, borderColor: C.gold + "44", background: C.gold + "08" }}>
                    <h3 style={h3Style}>{t(lang, "p_cd_split_summary")}</h3>
                    <div style={{ fontSize: 12, lineHeight: 2.2 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.textMuted }}>{t(lang, "p_cd_stay")} ({pricing.nights} {t(lang, "p_cd_nights")})</span>
                        <span>€{pricing.baseTotal}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.textMuted }}>{t(lang, "p_cd_cleaning")}</span>
                        <span>€{pricing.cleaningFee}</span>
                      </div>
                      {totals.conciergeFee > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", color: C.gold }}>
                          <span>{user.role === "agent" ? t(lang, "p_cd_fee_concierge_short") : t(lang, "p_cd_your_commission")}</span>
                          <span>+€{totals.conciergeFee.toFixed(2)}</span>
                        </div>
                      )}
                      {user.role === "agent" && totals.agentFee > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", color: C.info }}>
                          <span>{t(lang, "p_cd_your_agent_fee_short")}</span>
                          <span>+€{totals.agentFee.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 20, color: C.gold, fontWeight: 600 }}>
                        <span>{t(lang, "p_cd_client_total")}</span>
                        <span>€{totals.totalPrice.toFixed(2)}</span>
                      </div>
                      {user.role === "agent" && totals.agentNet !== undefined && (
                        <div style={{ fontSize: 11, marginTop: 8, padding: "8px 12px", background: C.surfaceAlt, borderRadius: 6 }}>
                          <div style={{ color: C.textDim }}>{t(lang, "p_cd_distribution", { owner: String(totals.ownerPrice), concierge: (totals.conciergeFee + totals.conciergeCommissionOnAgent).toFixed(2), you: totals.agentNet.toFixed(2) })}</div>
                        </div>
                      )}
                    </div>
                    <button style={{ ...btn("gold"), width: "100%", marginTop: 14 }} onClick={handleCreateBooking}>{t(lang, "p_cd_create_booking")}</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "bookings" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ ...h2Style, margin: 0 }}>{t(lang, "p_cd_bookings_title")}</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  placeholder={t(lang, "p_cd_search_client")}
                  style={{ ...input, width: 180, padding: "6px 12px" }}
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                />
                <select
                  style={{ ...sel, width: 140, padding: "6px 12px" }}
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="">{t(lang, "p_filter_all_statuses")}</option>
                  {Object.entries(statusMap(lang)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select
                  style={{ ...sel, width: 140, padding: "6px 12px" }}
                  value={roomFilter}
                  onChange={e => setRoomFilter(e.target.value)}
                >
                  <option value="">{t(lang, "p_filter_all_rooms")}</option>
                  {rooms.map((r: any) => {
                    const p = data.properties.find((prop: any) => prop.id === r.property_id);
                    return <option key={r.id} value={r.id}>{p ? `${p.name} - ` : ""}{r.name}</option>
                  })}
                </select>
                <select style={{ ...sel, width: 90, padding: "6px 12px" }} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                  <option value="">{t(lang, "p_filter_year")}</option>
                  {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                <select style={{ ...sel, width: 110, padding: "6px 12px" }} value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
                  <option value="">{t(lang, "p_filter_month")}</option>
                  {monthsList(lang).map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
            </div>

            {displayBookings.length === 0 ? <div style={{ ...card, textAlign: "center", color: C.textDim }}>{t(lang, "p_no_bookings_found")}</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {[t(lang, "p_common_client"), t(lang, "p_th_prop_room"), t(lang, "p_th_dates"), t(lang, "p_common_owner"), t(lang, "p_th_fee"), t(lang, "p_common_total"), t(lang, "p_th_collected"), t(lang, "p_th_quote"), t(lang, "p_common_status"), t(lang, "p_common_actions"), t(lang, "p_common_notes"), ""].map(h => (
                        <th key={h} style={{ ...th, fontSize: 9 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>{displayBookings.map((b: any) => {
                    const room = data.rooms.find((r: any) => r.id === b.room_id);
                    const prop = data.properties.find((p: any) => p.id === room?.property_id);
                    const owner = data.users.find((u: any) => u.id === prop?.owner_id);
                    const ownerNickname = owner?.nickname || t(lang, "p_common_owner");
                    const isOwn = b.concierge_id === user.id;
                    const conciergeUser = data.users.find((u: any) => u.id === b.concierge_id);

                    const st = statusMap(lang)[b.status] || { label: b.status, color: C.textDim };
                    const payments = data.payments.filter((p: any) => p.booking_id === b.id);
                    const receiver = payments[0]?.receiver;

                    if (!isOwn) {
                      // Privacy: show only dates, room, concierge nickname, total, status
                      return (
                        <tr key={b.id} style={{ opacity: 0.65 }}>
                          <td style={{ ...td, color: C.textDim, fontStyle: "italic", fontSize: 10 }}>🔒 {t(lang, "p_reserved")}</td>
                          <td style={td}>
                            <span style={{ fontSize: 10 }}>{prop ? `${prop.name} - ` : ""}{room?.name}</span>
                            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>{conciergeUser?.nickname || "—"}</div>
                          </td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>
                            {formatDate(b.start_date)} → {formatDate(b.end_date)}
                            <div style={{ fontSize: 9, color: C.textDim }}>({getDaysBetween(b.start_date, b.end_date)} {unitLabel(lang, b.asset_type, getDaysBetween(b.start_date, b.end_date))})</div>
                          </td>
                          <td style={{ ...td, color: C.textDim }}>—</td>
                          <td style={{ ...td, color: C.textDim }}>—</td>
                          <td style={{ ...td, fontWeight: 700, color: C.textMuted }}>€{b.total_price}</td>
                          <td style={{ ...td, color: C.textDim }}>—</td>
                          <td style={td}></td>
                          <td style={td}><span style={badge(st.color)}>{st.label}</span></td>
                          <td style={td}></td>
                          <td style={td}></td>
                          <td style={td}></td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={b.id}>
                        <td style={td}>{b.client_name} {b.client_surname}</td>
                        <td style={td}>
                          {(() => {
                            const p = data.properties.find((prop: any) => prop.id === room?.property_id);
                            return <span style={{ fontSize: 10 }}>{p ? `${p.name} - ` : ""}{room?.name}</span>
                          })()}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {formatDate(b.start_date)} → {formatDate(b.end_date)}
                          <div style={{ fontSize: 9, color: C.textDim }}>({getDaysBetween(b.start_date, b.end_date)} {unitLabel(lang, b.asset_type, getDaysBetween(b.start_date, b.end_date))})</div>
                        </td>
                        <td style={{ ...td, fontWeight: 600, color: C.success }}>€{b.owner_price_total}</td>
                        <td style={{ ...td, color: C.gold, fontSize: 10 }}>
                          €{b.concierge_fee}
                          <div style={{ fontSize: 8, opacity: 0.7 }}>({data.users.find((u:any)=>u.id===b.concierge_id)?.nickname || t(lang, "p_th_conc_short")})</div>
                        </td>
                        <td style={{ ...td, fontWeight: 700 }}>€{b.total_price}</td>
                        <td style={td}>
                          {(() => {
                            if (!receiver) return "-";
                            if (receiver === 'owner' || receiver === owner?.id) return <span style={{ color: C.success, fontWeight: 600, fontSize: 10 }}>{ownerNickname}</span>;
                            const c = data.users.find((u: any) => u.id === b.concierge_id);
                            return <span style={{ color: C.gold, fontWeight: 600, fontSize: 10 }}>{c?.nickname || "Concierge"}</span>;
                          })()}
                        </td>
                        <td style={td}>
                          <button style={{ ...btn(), fontSize: 9, padding: "3px 8px" }} onClick={() => generatePdf(b)}>PDF</button>
                        </td>
                        <td style={td}><span style={badge(st.color)}>{st.label}</span></td>
                        <td style={td}>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {b.status === "draft" && <button style={{ ...btn(), fontSize: 10, padding: "4px 10px" }} onClick={() => handleStatusChange(b.id, "sent")}>{t(lang, "p_send_to_client")}</button>}
                            {b.status === "sent" && <button style={{ ...btn("gold"), fontSize: 10, padding: "4px 10px" }} onClick={() => setPayModal(b)}>{t(lang, "p_od_pm_register_deposit_btn")}</button>}
                            {b.status === "payment_submitted" && <span style={{ fontSize: 10, color: C.textDim }}>{t(lang, "p_od_pm_awaiting_owner_confirmation")}</span>}
                          </div>
                        </td>
                        <td style={td}>
                          {b.notes && <button style={{ ...btn(), padding: "2px 8px", fontSize: 12, borderColor: C.gold + "44" }} onClick={() => setViewNotes(b.notes)} title={t(lang, "p_show_notes")}>👁️</button>}
                        </td>
                        <td style={td}>
                          {['draft', 'sent', 'payment_submitted'].includes(b.status) && (
                            <button style={{ ...btn(), fontSize: 10, padding: "4px 10px", color: C.danger, borderColor: C.danger + "44" }} onClick={() => handleDelete(b.id)}>{t(lang, "p_common_delete")}</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "report" && (() => {
          const filtered = conciergeBookings.filter((b: any) => 
            ["confirmed_owner", "evaso"].includes(b.status) && 
            b.start_date >= reportStart && b.start_date <= reportEnd
          );
          const totalFees = filtered.reduce((s: number, b: any) => s + b.concierge_fee, 0);

          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ ...h2Style, margin: 0 }}>{t(lang, "p_report_personal")}</h2>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="date" style={{ ...input, width: 140, padding: "4px 8px", fontSize: 11 }} value={reportStart} onChange={e => setReportStart(e.target.value)} />
                  <span style={{ color: C.textDim }}>→</span>
                  <input type="date" style={{ ...input, width: 140, padding: "4px 8px", fontSize: 11 }} value={reportEnd} onChange={e => setReportEnd(e.target.value)} />
                </div>
              </div>

              <div style={grid(3)}>
                <div style={card}>
                  <div style={label}>{t(lang, "p_closed_bookings")}</div>
                  <div style={{ fontFamily: FONT, fontSize: 32, color: C.success }}>{filtered.length}</div>
                </div>
                <div style={card}>
                  <div style={label}>{t(lang, "p_commissions_earned")}</div>
                  <div style={{ fontFamily: FONT, fontSize: 32, color: C.gold }}>€{totalFees}</div>
                </div>
                <div style={card}>
                  <div style={label}>{t(lang, "p_period_target")}</div>
                  <div style={{ fontFamily: FONT, fontSize: 32, color: C.textDim }}>{((filtered.length / 5) * 100).toFixed(0)}%</div>
                </div>
              </div>

              {(() => {
                const methods = data.userPaymentMethods.filter((m: any) => m.user_id === user.id);
                const uniqueNames = Array.from(new Set(methods.map((m: any) => m.name))) as string[];
                const rCards = uniqueNames.map((mtd: string) => {
                  const mm = methods.find((pm: any) => pm.name === mtd);
                  const mPayments = data.payments.filter((p: any) => 
                    p.method === mtd && 
                    filtered.some((b: any) => b.id === p.booking_id)
                  );
                  const inc = mPayments.filter((p: any) => 
                    ['acconto_concierge', 'saldo_concierge', 'storno_concierge_in', 'acconto_owner', 'storno_owner_in'].includes(p.type) && p.receiver === user.id
                  ).reduce((s: number, p: any) => s + p.amount, 0);
                  const out = mPayments.filter((p: any) => 
                    ['storno_owner_out', 'storno_concierge_out'].includes(p.type) && p.receiver === user.id
                  ).reduce((s: number, p: any) => s + p.amount, 0);

                  if (inc === 0 && out === 0) return null;
                  return (
                    <div key={mm?.id} style={{ border: `1px solid ${C.border}`, padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gold, borderBottom: `1px solid ${C.border}44`, paddingBottom: 6 }}>{mtd}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: C.textDim }}>{t(lang, "p_income")}</span>
                        <span style={{ color: C.success, fontWeight: 600 }}>€{inc.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: C.textDim }}>{t(lang, "p_outflow")}</span>
                        <span style={{ color: C.warning }}>€{out.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: `1px solid ${C.border}44`, paddingTop: 6, fontWeight: 700 }}>
                        <span style={{ color: C.text }}>{t(lang, "p_balance")}</span>
                        <span style={{ color: (inc - out) >= 0 ? C.success : C.warning }}>€{(inc - out).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                });

                if (rCards.filter(c => c !== null).length === 0) return null;
                return (
                  <div style={{ ...card, marginTop: 24 }}>
                    <h3 style={{ ...h3Style, fontSize: 15 }}>{t(lang, "p_summary_by_method")}</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
                      {rCards}
                    </div>
                  </div>
                );
              })()}

              {filtered.length > 0 && (
                <div style={{ ...card, marginTop: 20 }}>
                  <h3 style={h3Style}>{t(lang, "p_closed_commissions_detail")}</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>{[t(lang, "p_th_start_date"), t(lang, "p_common_client"), t(lang, "p_th_room"), t(lang, "p_th_commission")].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>{filtered.map((b: any) => (
                      <tr key={b.id}>
                        <td style={td}>{formatDate(b.start_date)}</td>
                        <td style={td}>{b.client_name} {b.client_surname}</td>
                        <td style={td}>{data.rooms.find((r:any)=>r.id===b.room_id)?.name}</td>
                        <td style={{ ...td, color: C.gold, fontWeight: 600 }}>€{b.concierge_fee}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              
            </div>
          );
        })()}
        {tab === "settings" && (
          <div>
            {/* I miei Agenti — solo per concierge */}
            {user.role === "concierge" && (
              <div style={{ ...card, marginBottom: 16 }}>
                <h3 style={h3Style}>{t(lang, "p_cd_my_agents")}</h3>
                <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 1.7 }}>
                  {t(lang, "p_cd_my_agents_desc")}
                </p>
                <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                  <input style={{ ...input, flex: 1, minWidth: 160 }} value={newAgentNick} onChange={e => setNewAgentNick(e.target.value)} placeholder={t(lang, "p_cd_agent_nick_ph")} />
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input style={{ ...input, width: 80 }} type="number" min="0" max="50" step="1" value={newAgentCommRate} onChange={e => setNewAgentCommRate(e.target.value)} />
                    <span style={{ fontSize: 12, color: C.textMuted, whiteSpace: "nowrap" }}>{t(lang, "p_cd_pct_on_fee")}</span>
                  </div>
                  <button style={btn("gold")} onClick={async () => {
                    if (!newAgentNick.trim()) return;
                    const res = await addAgentToConcierge(user.id, newAgentNick, parseFloat(newAgentCommRate) || 0);
                    if (!(res as any).success) { setMsg("⚠ " + (res as any).error); return; }
                    setNewAgentNick(""); setMsg(t(lang, "p_cd_agent_added"));
                    refresh();
                  }}>{t(lang, "p_cd_add_agent")}</button>
                </div>
                {/* Lista agenti sotto questo concierge */}
                {(data.agentConciergeCollabs || []).filter((c: any) => c.concierge_id === user.id).length === 0 ? (
                  <div style={{ fontSize: 12, color: C.textDim, fontStyle: "italic" }}>{t(lang, "p_cd_no_agents")}</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(data.agentConciergeCollabs || []).filter((c: any) => c.concierge_id === user.id).map((c: any) => (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: C.surfaceAlt, borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <div>
                          <span style={{ fontWeight: 700, color: C.gold }}>🌐 {c.agent_nickname}</span>
                          <span style={{ fontSize: 11, color: C.textDim, marginLeft: 12 }}>{t(lang, "p_cd_commission_on_fee")}</span>
                          <span style={{ fontSize: 13, color: C.text, marginLeft: 4, fontWeight: 600 }}>{c.commission_rate}%</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="number" min="0" max="50" defaultValue={c.commission_rate}
                            style={{ ...input, width: 70, padding: "4px 8px" }}
                            onBlur={async e => {
                              const rate = parseFloat(e.target.value) || 0;
                              await updateAgentCommissionRate(c.id, rate);
                              setMsg(t(lang, "p_cd_commission_updated"));
                              refresh();
                            }}
                          />
                          <span style={{ fontSize: 11, color: C.textDim }}>%</span>
                          <button style={{ ...btn(), color: C.danger, padding: "4px 10px", fontSize: 10, borderColor: C.danger + "44" }} onClick={async () => {
                            if (!confirm(t(lang, "p_cd_confirm_remove_agent", { name: c.agent_nickname }))) return;
                            await removeAgentFromConcierge(c.id);
                            setMsg(t(lang, "p_cd_agent_removed"));
                            refresh();
                          }}>{t(lang, "p_cd_remove")}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Referral link box */}
            <div style={{ ...card, background: C.goldGlow, borderColor: C.borderGold, marginBottom: 16 }}>
              <h3 style={h3Style}>{t(lang, "p_cd_referral_link")}</h3>
              <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 1.7 }}>
                {t(lang, "p_cd_referral_desc")}
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, padding: "12px 16px", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "'DM Sans', monospace", fontSize: 13, color: C.gold, letterSpacing: "0.3px", minWidth: 200, wordBreak: "break-all" }}>
                  {typeof window !== "undefined" ? `${window.location.origin}?ref=${user.nickname}` : `https://auraibiza.com?ref=${user.nickname}`}
                </div>
                <button style={btn("gold")} onClick={() => {
                  const url = `${window.location.origin}?ref=${user.nickname}`;
                  navigator.clipboard.writeText(url).then(() => setMsg(t(lang, "p_cd_link_copied")));
                }}>{t(lang, "p_cd_copy_link")}</button>
              </div>
            </div>

            <div style={card}>
              <h2 style={h2Style}>{t(lang, "p_cd_payment_methods_settings")}</h2>
              <p style={{ color: C.textDim, fontSize: 13, marginBottom: 20 }}>{t(lang, "p_cd_payment_methods_desc")}</p>
              <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                <input style={{ ...input, flex: 1 }} value={newMethodName} onChange={e => setNewMethodName(e.target.value)} placeholder={t(lang, "p_cd_add_method_ph")} />
                <button style={btn("gold")} onClick={async () => {
                  if (!newMethodName.trim()) return;
                  await addPaymentMethod(user.id, newMethodName);
                  setNewMethodName("");
                  refresh();
                }}>{t(lang, "p_common_add")}</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {data.userPaymentMethods.filter((m: any) => m.user_id === user.id).map((m: any) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.surfaceAlt, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <span style={{ fontWeight: 600 }}>{m.name}</span>
                    <button style={{ ...btn(), color: C.danger, padding: "2px 8px" }} onClick={() => setConfirmingDeleteMethod(m.id)}>{t(lang, "p_common_delete")}</button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
        {viewNotes && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, backdropFilter: "blur(8px)" }} onClick={() => setViewNotes(null)}>
            <div style={{ ...card, width: 400, background: C.bg }} onClick={e => e.stopPropagation()}>
              <h3 style={h3Style}>{t(lang, "p_cd_booking_notes")}</h3>
              <div style={{ background: C.surfaceAlt, padding: 16, borderRadius: 8, fontSize: 13, color: C.text, whiteSpace: "pre-wrap", minHeight: 100, border: `1px solid ${C.border}` }}>
                {viewNotes}
              </div>
              <button style={{ ...btn(), width: "100%", marginTop: 20 }} onClick={() => setViewNotes(null)}>{t(lang, "p_common_close")}</button>
            </div>
          </div>
        )}
        {deleteBookingId && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100, backdropFilter: "blur(8px)" }}>
            <div style={{ ...card, width: 320, textAlign: "center", animation: "modalIn 0.2s ease-out" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
              <h3 style={{ ...h3Style, marginBottom: 8 }}>{t(lang, "p_cd_confirm_delete_title")}</h3>
              <p style={{ color: C.textDim, fontSize: 13, marginBottom: 24 }}>{t(lang, "p_cd_confirm_delete_booking_desc")}</p>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...btn(), flex: 1 }} onClick={() => setDeleteBookingId(null)}>{t(lang, "p_common_cancel")}</button>
                <button style={{ ...btn(C.danger), flex: 1 }} onClick={() => performDelete(deleteBookingId)}>{t(lang, "p_common_delete")}</button>
              </div>
            </div>
          </div>
        )}
        {confirmingDeleteMethod && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1200, backdropFilter: "blur(8px)" }} onClick={() => setConfirmingDeleteMethod(null)}>
            <div style={{ ...card, width: 350, background: C.bg, textAlign: "center" }} onClick={e => e.stopPropagation()}>
              <h3 style={h3Style}>{t(lang, "p_cd_confirm_delete_method_title")}</h3>
              <p style={{ fontSize: 14, color: C.textDim, marginBottom: 24 }}>{t(lang, "p_cd_confirm_delete_method_desc")}</p>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...btn(), flex: 1 }} onClick={() => setConfirmingDeleteMethod(null)}>{t(lang, "p_common_cancel")}</button>
                <button style={{ ...btn(), background: C.danger, color: "#fff", flex: 1, border: "none" }} onClick={async () => {
                  if (confirmingDeleteMethod) {
                    await deletePaymentMethod(confirmingDeleteMethod);
                    setConfirmingDeleteMethod(null);
                    refresh();
                  }
                }}>{t(lang, "p_common_delete")}</button>
              </div>
            </div>
          </div>
        )}
        {payModal && (() => {
          const accAmt = parseFloat(accontoAmount) || 0;
          const room = data.rooms.find((r: any) => r.id === payModal.room_id);
          const property = data.properties.find((p: any) => p.id === room?.property_id);
          const ownerUser = data.users.find((u: any) => u.id === property?.owner_id);
          const storno = Math.max(0, accAmt - payModal.concierge_fee);
          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 500, backdropFilter: "blur(8px)" }} onClick={() => setPayModal(null)}>
              <div style={{ ...card, width: 500, background: C.bg }} onClick={e => e.stopPropagation()}>
                <h3 style={h3Style}>{t(lang, "p_od_pm_deposit_title")}</h3>
                <p style={{ fontSize: 12, color: C.textDim, marginTop: -4, marginBottom: 20 }}>{t(lang, "p_od_pm_booking_total")} <strong style={{color: C.gold}}>€{payModal.total_price}</strong></p>

                <div style={{ ...card, background: C.surfaceAlt }}>
                  <h4 style={{ ...h3Style, fontSize: 13, marginBottom: 12 }}>{t(lang, "p_od_pm_deposit_details_heading")}</h4>
                  <div style={grid(3)}>
                    <div>
                      <label style={label}>{t(lang, "p_od_pm_amount_label")}</label>
                      <input style={input} type="number" value={accontoAmount} onChange={e => setAccontoAmount(e.target.value)} placeholder="€ 0.00" />
                    </div>
                    <div>
                      <label style={label}>{t(lang, "p_od_pm_date_short")}</label>
                      <input style={input} type="date" value={accontoDate} onChange={e => setAccontoDate(e.target.value)} />
                    </div>
                    <div>
                      <label style={label}>{t(lang, "p_od_pm_collection_method")}</label>
                      <select style={sel} value={accontoMethod} onChange={e => setAccontoMethod(e.target.value)}>
                        <option value="">{t(lang, "p_od_pm_select_placeholder")}</option>
                        {data.userPaymentMethods
                          .filter((m: any) => m.user_id === user.id)
                          .map((m: any) => (
                            <option key={m.id} value={m.name}>{m.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {storno > 0 && (
                    <div style={{ marginTop: 15, paddingTop: 15, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim }}>
                       ℹ️ {t(lang, "p_od_pm_storno_incoming_info", { amount: storno.toFixed(2) })}
                    </div>
                  )}
                </div>

                <div style={{ ...card, background: C.surfaceAlt, marginTop: 20, borderColor: C.gold + "22" }}>
                  <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>{t(lang, "p_od_pm_your_commission")}</span> <span>€{payModal.concierge_fee}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: C.gold }}>
                      <span>{t(lang, "p_od_pm_retained_commission")}</span>
                      <strong>€{Math.min(accAmt, payModal.concierge_fee).toFixed(2)}</strong>
                    </div>
                    {storno > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: C.info }}>
                        <span>{t(lang, "p_od_pm_transfer_to_owner", { name: ownerUser?.nickname || t(lang, "p_common_owner") })}</span>
                        <strong>€{storno.toFixed(2)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
                  <button style={{ ...btn("gold"), flex: 1 }} onClick={handleRegisterPayment}>{t(lang, "p_od_pm_save_deposit")}</button>
                  <button style={{ ...btn(), flex: 1 }} onClick={() => setPayModal(null)}>{t(lang, "p_common_cancel")}</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// --- OWNER DASHBOARD ---
function OwnerDashboard({ user, data, refresh, setPdfPreview, isMobile = false, lang }: { user: User, data: any, refresh: () => void, setPdfPreview: (v: any) => void, isMobile?: boolean, lang: Lang }) {
  const [tab, setTab] = useState("properties");
  const [assetTab, setAssetTab] = useState("residenze");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCap, setNewRoomCap] = useState("2");
  const [newRoomDesc, setNewRoomDesc] = useState("");
  const [newRoomCarFields, setNewRoomCarFields] = useState<CarFieldsValue>(emptyCarFields);
  const [newMethodName, setNewMethodName] = useState("");
  const [newPropName, setNewPropName] = useState("");
  const [newPropLoc, setNewPropLoc] = useState("");
  const [newPropDesc, setNewPropDesc] = useState("");
  const [newPropAssetType, setNewPropAssetType] = useState("apartment");
  const [newPropLat, setNewPropLat] = useState("");
  const [newPropLng, setNewPropLng] = useState("");
  const [editPricing, setEditPricing] = useState<{ roomId: string; month: string; basePrice: string; cleaningFee: string } | null>(null);
  const [addPricing, setAddPricing] = useState<{ roomId: string; month: string; basePrice: string; cleaningFee: string } | null>(null);
  const [editRoom, setEditRoom] = useState<{ id: string; name: string; capacity: string; description: string; bedrooms: string; bathrooms: string; assetType: string; carFields: CarFieldsValue } | null>(null);
  const [editProperty, setEditProperty] = useState<{ id: string; name: string; location: string; description: string; latitude: string; longitude: string } | null>(null);
  const [viewCalendar, setViewCalendar] = useState<string | null>(null);
  const [collaboratorNick, setCollaboratorNick] = useState("");
  const [msg, setMsg] = useState("");
  const [icalInputs, setIcalInputs] = useState<Record<string, string>>({});
  const [icalSyncing, setIcalSyncing] = useState<string | null>(null);

  // Payment Balance State
  const [balanceModal, setBalanceModal] = useState<any>(null);
  const [balanceData, setBalanceData] = useState({ amount: "", date: new Date().toLocaleDateString('en-CA'), method: "Contanti", stornoMethod: "Zen" });
  const [confirmModal, setConfirmModal] = useState<any>(null);
  const [confirmData, setConfirmData] = useState({ date: new Date().toLocaleDateString('en-CA'), method: "Bonifico" });
  const [deleteBookingId, setDeleteBookingId] = useState<string | null>(null);

  // Reporting filters
  const [reportStart, setReportStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [reportEnd, setReportEnd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-12-31`;
  });
  const [ownerConciergeFee, setOwnerConciergeFee] = useState("0");
  const [ownerFeeMode, setOwnerFeeMode] = useState<'per_night' | 'percentage'>('per_night');

  const [adjModal, setAdjModal] = useState<any>(null);
  const [localAdjs, setLocalAdjs] = useState<Record<string, string>>({});
  const [localFee, setLocalFee] = useState("0");
  const [viewNotes, setViewNotes] = useState<string | null>(null);
  const [confirmingDeleteMethod, setConfirmingDeleteMethod] = useState<string | null>(null);

  const [payModal, setPayModal] = useState<any>(null);
  const [payModalIsCollab, setPayModalIsCollab] = useState(false);
  const [accontoAmount, setAccontoAmount] = useState("");
  const [accontoDate, setAccontoDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [accontoMethod, setAccontoMethod] = useState("");

  // Filters
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  const properties = data.properties.filter((p: any) => p.owner_id === user.id);
  const allRooms = data.rooms.filter((r: any) => properties.some((p: any) => p.id === r.property_id));
  const ownerAssetCat = ASSET_CATEGORIES.find(c => c.key === assetTab) || ASSET_CATEGORIES[0];
  const filteredProperties = properties.filter((p: any) => ownerAssetCat.types.includes(p.asset_type || "apartment"));

  // Il payload del dashboard ora contiene solo la cover_image (fix perf.):
  // carichiamo la galleria completa on-demand per le proprietà mostrate nel tab Proprietà.
  const [galleryMap, setGalleryMap] = useState<Record<string, string>>({});
  const refreshGallery = async (propId: string) => {
    const g = await getPropertyGallery(propId);
    if (g.image) setGalleryMap(prev => ({ ...prev, [propId]: g.image as string }));
  };
  useEffect(() => {
    if (tab !== "properties") return;
    filteredProperties.forEach((prop: any) => {
      if (!galleryMap[prop.id]) refreshGallery(prop.id);
    });
  }, [tab, filteredProperties.map((p: any) => p.id).join(",")]);
  const ownerAssetCounts = Object.fromEntries(ASSET_CATEGORIES.map(cat => [
    cat.key, properties.filter((p: any) => cat.types.includes(p.asset_type || "apartment")).length
  ]));
  const collaboratedProperties = data.collaboratedProperties || [];
  const collaboratedRooms = data.collaboratedRooms || [];
  const collaboratedPricing = data.collaboratedPricing || [];
  const collaboratedBookings = data.collaboratedBookings || [];

  const filteredBookings = useMemo(() => {
    const ownBookings = data.bookings.filter((b: any) => {
      const room = allRooms.find((r: any) => r.id === b.room_id);
      if (!room) return false;
      const matchSearch = (b.client_name + " " + (b.client_surname || "")).toLowerCase().includes(searchFilter.toLowerCase());
      const matchStatus = statusFilter ? b.status === statusFilter : true;
      const matchRoom = roomFilter ? b.room_id === roomFilter : true;
      const matchYear = yearFilter ? b.start_date.startsWith(yearFilter) : true;
      const matchMonth = monthFilter ? b.start_date.slice(5, 7) === monthFilter : true;
      return matchSearch && matchStatus && matchRoom && matchYear && matchMonth;
    });
    const ownCollabBookings = collaboratedBookings.filter((b: any) => {
      if (b.concierge_id !== user.id) return false;
      const matchSearch = (b.client_name + " " + (b.client_surname || "")).toLowerCase().includes(searchFilter.toLowerCase());
      const matchStatus = statusFilter ? b.status === statusFilter : true;
      const matchYear = yearFilter ? b.start_date.startsWith(yearFilter) : true;
      const matchMonth = monthFilter ? b.start_date.slice(5, 7) === monthFilter : true;
      return matchSearch && matchStatus && matchYear && matchMonth;
    });
    return [...ownBookings, ...ownCollabBookings];
  }, [data.bookings, collaboratedBookings, allRooms, user.id, searchFilter, statusFilter, roomFilter, yearFilter, monthFilter]);

  const ownerBookings = filteredBookings;

  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedRange, setSelectedRange] = useState<Range>({ start: null, end: null });

  useEffect(() => {
    if (!selectedRoom) {
      if (allRooms.length > 0) setSelectedRoom(allRooms[0].id);
      else if (collaboratedRooms.length > 0) setSelectedRoom(collaboratedRooms[0].id);
    }
  }, [allRooms, collaboratedRooms, selectedRoom]);

  const handleImageUpload = async (roomId: string, file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      alert(t(lang, "p_od_image_too_large_20mb"));
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      let base64 = e.target?.result as string;
      if (file.size > 1 * 1024 * 1024) {
        base64 = await compressImage(base64);
      }
      await updateRoomImage(roomId, base64);
      setMsg(t(lang, "p_od_room_photo_updated"));
      refresh();
    };
    reader.readAsDataURL(file);
  };
  
  const handlePropertyImageUpload = async (propId: string, file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      alert(t(lang, "p_od_image_too_large_20mb"));
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      let base64 = e.target?.result as string;
      if (file.size > 1 * 1024 * 1024) {
        base64 = await compressImage(base64);
      }
      await updatePropertyImage(propId, base64);
      await refreshGallery(propId);
      setMsg(t(lang, "p_od_property_photo_updated"));
      refresh();
    };
    reader.readAsDataURL(file);
  };

  const handlePropertyPdfUpload = async (propId: string, file: File) => {
    if (file.type !== "application/pdf") {
      alert(t(lang, "p_ad_file_must_be_pdf"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert(t(lang, "p_ad_pdf_too_large_10mb"));
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      await updatePropertyPdf(propId, base64, file.name);
      setMsg(t(lang, "p_od_pdf_updated"));
      refresh();
    };
    reader.readAsDataURL(file);
  };

  const [clientName, setClientName] = useState("");
  const [clientSurname, setClientSurname] = useState("");
  const [notes, setNotes] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [dropoffTime, setDropoffTime] = useState("");
  const [guestsCount, setGuestsCount] = useState("1");

  const handleSaveAdjustments = async () => {
    if (!adjModal) return;
    const finalAdjs: Record<string, number> = {};
    Object.entries(localAdjs).forEach(([d, v]) => {
      const val = parseFloat(v);
      if (val !== 0 && !isNaN(val)) finalAdjs[d] = val;
    });
    const valFee = parseFloat(localFee);
    setMsg(t(lang, "p_od_saving_in_progress"));
    await updateBookingPriceAdjustment(adjModal.id, finalAdjs, isNaN(valFee) ? undefined : valFee);
    setAdjModal(null);
    setMsg(t(lang, "p_od_adjustments_saved"));
    refresh();
  };

  const selectedRoomAssetType = useMemo(() => {
    const room = [...allRooms, ...collaboratedRooms].find((r: any) => r.id === selectedRoom);
    const prop = [...properties, ...collaboratedProperties].find((p: any) => p.id === room?.property_id);
    return prop?.asset_type;
  }, [selectedRoom, allRooms, collaboratedRooms, properties, collaboratedProperties]);

  const pricing = useMemo(() => {
    if (!selectedRange.start || !selectedRange.end || !selectedRoom) return null;
    const n = getDaysBetween(selectedRange.start, selectedRange.end);
    if (n <= 0) return null;
    let baseTotal = 0;
    const r = new Date(selectedRange.start + "T00:00:00");
    const e = new Date(selectedRange.end + "T00:00:00");
    let cFee = 0;
    const allPricingMerged = [...data.pricing, ...collaboratedPricing];
    while (r < e) {
      const ms = `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}`;
      const pr = allPricingMerged.find((p: any) => p.room_id === selectedRoom && p.month === ms);
      baseTotal += pr ? pr.base_price : 0;
      cFee = pr ? pr.cleaning_fee : 0;
      r.setDate(r.getDate() + 1);
    }
    return { nights: n, baseTotal, cleaningFee: cFee };
  }, [selectedRange, selectedRoom, data.pricing, collaboratedPricing]);

  const handleCreateBookingOwner = async () => {
    if (!selectedRange.start || !selectedRange.end || !pricing) return alert(t(lang, "p_od_select_dates"));
    if (!clientName.trim()) return alert(t(lang, "p_od_enter_client_name"));
    const ownerPrice = pricing.baseTotal + pricing.cleaningFee;
    const rawFeeVal = Number(ownerConciergeFee) || 0;
    const conciergeFeeValue = ownerFeeMode === 'percentage'
      ? Math.round(ownerPrice * rawFeeVal / 100 * 100) / 100
      : rawFeeVal * pricing.nights;
    const res = await createBooking({
      room_id: selectedRoom,
      concierge_id: user.id,
      client_name: clientName,
      client_surname: clientSurname,
      guests_count: Number(guestsCount),
      start_date: selectedRange.start,
      end_date: selectedRange.end,
      notes,
      owner_price_total: ownerPrice,
      stay_price_total: pricing.baseTotal,
      cleaning_fee_total: pricing.cleaningFee,
      concierge_fee: conciergeFeeValue,
      total_price: ownerPrice + conciergeFeeValue,
      fee_mode: ownerFeeMode,
      fee_value: rawFeeVal,
      pickup_time: isVehicleAsset(selectedRoomAssetType) ? pickupTime : null,
      dropoff_time: isVehicleAsset(selectedRoomAssetType) ? dropoffTime : null,
    });
    // Proprietario crea inizialmente una bozza
    setMsg(t(lang, "p_od_booking_draft_registered"));
    setSelectedRange({ start: null, end: null });
    setClientName(""); setClientSurname(""); setNotes(""); setGuestsCount("1"); setPickupTime(""); setDropoffTime("");
    setTab("bookings");
    refresh();
  };

  const handleDelete = (id: string) => {
    setDeleteBookingId(id);
  };

  const performDeleteBooking = async (id: string) => {
    await deleteBookingAction(id);
    setDeleteBookingId(null);
    setMsg(t(lang, "p_od_booking_cancelled"));
    refresh();
  };

  const handleConfirmOwner = async (id: string) => { await updateBookingStatus(id, "confirmed_owner"); refresh(); setMsg(t(lang, "p_od_confirmed_calendar_locked")); };

  const handleRegisterPayment = async () => {
    if (!accontoAmount) { setMsg(t(lang, "p_od_enter_deposit_amount_warn")); return; }
    
    const acc = parseFloat(accontoAmount) || 0;
    const payments = [];

    // Owner (Silvia) is implicitly the collector
    payments.push({
      booking_id: payModal.id, amount: acc, date: accontoDate, method: accontoMethod,
      type: 'acconto_owner', receiver: user.id,
      description: `Acconto incassato da Owner`
    });

    // If receipt >= concierge fee, trigger automated storno to concierge
    if (acc >= payModal.concierge_fee) {
      const stornoVal = payModal.concierge_fee;
      // Leg 2: Outflow from Owner
      payments.push({
        booking_id: payModal.id, amount: stornoVal, date: accontoDate, method: accontoMethod,
        type: 'storno_concierge_out', receiver: user.id,
        description: `Storno acconto dovuto a Concierge`
      });
      // Leg 3: Inflow to Concierge (Method will be defined by Concierge during verification)
      payments.push({
        booking_id: payModal.id, amount: stornoVal, date: accontoDate, method: "",
        type: 'storno_concierge_in', receiver: payModal.concierge_id,
        description: `Storno acconto ricevuto da Owner`
      });
    }

    await submitPaymentProposal(payModal.id, payments);
    setPayModal(null);
    setAccontoAmount("");
    setMsg(t(lang, "p_od_deposit_registered_pending"));
    refresh();
  };

  const handleRegisterCollabPayment = async () => {
    if (!accontoAmount) { setMsg(t(lang, "p_od_enter_deposit_amount_warn")); return; }
    const collabRoom = collaboratedRooms.find((r: any) => r.id === payModal.room_id);
    const collabProp = collaboratedProperties.find((p: any) => p.id === collabRoom?.property_id);
    const actualOwnerId = collabProp?.owner_id;
    if (!actualOwnerId) { alert(t(lang, "p_cd_error_identify_owner")); return; }
    const acc = parseFloat(accontoAmount) || 0;
    const payments: any[] = [];
    payments.push({ booking_id: payModal.id, amount: acc, date: accontoDate, method: accontoMethod, type: 'acconto_concierge', receiver: user.id });
    const stornoVal = Math.max(0, acc - payModal.concierge_fee);
    if (stornoVal > 0) {
      payments.push({ booking_id: payModal.id, amount: stornoVal, date: accontoDate, method: accontoMethod, type: 'storno_owner_out', receiver: user.id });
      payments.push({ booking_id: payModal.id, amount: stornoVal, date: accontoDate, method: "", type: 'storno_owner_in', receiver: actualOwnerId });
    }
    await submitPaymentProposal(payModal.id, payments);
    setPayModal(null); setPayModalIsCollab(false); setAccontoAmount("");
    setMsg(t(lang, "p_od_deposit_registered_owner_verify"));
    refresh();
  };

  const handleStatusChange = async (id: string, s: string) => { await updateBookingStatus(id, s); refresh(); };

  const handleRecordFinalBalance = async (bookingId: string, userId: string, data: any) => {
    await recordFinalBalance(bookingId, { amount: data.amount, date: data.date, method: data.method });
    setBalanceModal(null);
    setMsg(t(lang, "p_od_balance_closed"));
    refresh();
  };

  const generatePdf = async (b: any) => {
    const room = data.rooms.find((r: any) => r.id === b.room_id);
    const prop = data.properties.find((p: any) => p.id === room?.property_id)
      || (data.collaboratedProperties || []).find((p: any) => p.id === room?.property_id);
    let propFull = prop;
    if (prop) {
      const gallery = await getPropertyGallery(prop.id);
      if (gallery.image) propFull = { ...prop, image: gallery.image };
    }
    setPdfPreview({ booking: b, room, property: propFull });
  };

  const handleAddProperty = async () => {
    if (!newPropName || !newPropLoc) return alert(t(lang, "p_ad_enter_name_location"));
    const lat = newPropLat ? parseFloat(newPropLat) : null;
    const lng = newPropLng ? parseFloat(newPropLng) : null;
    await addProperty(user.id, newPropName, newPropLoc, newPropDesc, newPropAssetType, lat, lng);
    setNewPropName(""); setNewPropLoc(""); setNewPropDesc(""); setNewPropAssetType("apartment"); setNewPropLat(""); setNewPropLng("");
    setMsg(t(lang, "p_od_property_created"));
    refresh();
  };

  const handleAddRoom = async (propertyId: string) => {
    if (!newRoomName.trim()) { alert(t(lang, "p_od_enter_room_name")); return; }
    const prop = data.properties.find((p: any) => p.id === propertyId);
    const carFields = isVehicleAsset(prop?.asset_type) ? {
      carModel: newRoomCarFields.carModel, carCategory: newRoomCarFields.carCategory,
      airportDelivery: newRoomCarFields.airportDelivery,
      securityDeposit: newRoomCarFields.securityDeposit ? Number(newRoomCarFields.securityDeposit) : undefined,
      kaskoIncluded: newRoomCarFields.kaskoIncluded,
      deductibleAmount: newRoomCarFields.deductibleAmount ? Number(newRoomCarFields.deductibleAmount) : undefined,
      documentsRequired: newRoomCarFields.documentsRequired,
    } : undefined;
    await addRoomWithPricing(propertyId, newRoomName, Number(newRoomCap), newRoomDesc, carFields);
    setNewRoomName(""); setNewRoomCap("2"); setNewRoomDesc(""); setNewRoomCarFields(emptyCarFields); setMsg(t(lang, "p_od_room_added"));
    refresh();
  };

  const handleUpdateRoom = async () => {
    if (!editRoom) return;
    const isVehicle = isVehicleAsset(editRoom.assetType);
    await updateRoomAction(editRoom.id, {
      name: editRoom.name, capacity: Number(editRoom.capacity), description: editRoom.description,
      bedrooms: !isVehicle && editRoom.bedrooms ? Number(editRoom.bedrooms) : null,
      bathrooms: !isVehicle && editRoom.bathrooms ? Number(editRoom.bathrooms) : null,
      carModel: isVehicle ? editRoom.carFields.carModel : null,
      carCategory: isVehicle ? editRoom.carFields.carCategory : null,
      airportDelivery: isVehicle ? editRoom.carFields.airportDelivery : false,
      securityDeposit: isVehicle && editRoom.carFields.securityDeposit ? Number(editRoom.carFields.securityDeposit) : null,
      kaskoIncluded: isVehicle ? editRoom.carFields.kaskoIncluded : false,
      deductibleAmount: isVehicle && editRoom.carFields.deductibleAmount ? Number(editRoom.carFields.deductibleAmount) : null,
      documentsRequired: isVehicle ? editRoom.carFields.documentsRequired : null,
    });
    setEditRoom(null); setMsg(t(lang, "p_od_room_updated"));
    refresh();
  };

  const handleAddCollab = async (propertyId: string) => {
    if (!collaboratorNick.trim()) return;
    const res = await addCollaboration(propertyId, collaboratorNick);
    if (!(res as any).success) { alert((res as any).error); return; }
    setCollaboratorNick(""); setMsg(t(lang, "p_od_collaborator_added"));
    refresh();
  };

  const handleRemoveCollab = async (id: string) => {
    await removeCollaboration(id);
    setMsg(t(lang, "p_od_collaborator_removed"));
    refresh();
  };

  const handleSavePricing = async () => {
    if (!editPricing) return;
    await updatePricingAction(editPricing.roomId, editPricing.month, Number(editPricing.basePrice), Number(editPricing.cleaningFee));
    setEditPricing(null); setMsg(t(lang, "p_od_pricing_updated"));
    refresh();
  };

  const handleAddPricingMonth = async () => {
    if (!addPricing) return;
    const res = await addPricingMonthAction(addPricing.roomId, addPricing.month, Number(addPricing.basePrice), Number(addPricing.cleaningFee));
    if (!(res as any).success) { alert((res as any).error); return; }
    setAddPricing(null); setMsg(t(lang, "p_od_new_month_added"));
    refresh();
  };
  const totalRevenue = ownerBookings.filter((b: any) => b.status === "confirmed_owner").reduce((s: number, b: any) => s + b.owner_price_total, 0);

  return (
    <div>
      <div style={nav}>
        {[{ key: "properties", l: t(lang, "p_nav_properties") }, { key: "bookings", l: t(lang, "p_nav_bookings") }, { key: "new_booking", l: t(lang, "p_nav_new_booking") }, { key: "report", l: t(lang, "p_nav_report") }, { key: "settings", l: t(lang, "p_nav_settings") }].map(t2 => (
          <div key={t2.key} style={navItem(tab === t2.key)} onClick={() => setTab(t2.key)}>{t2.l}</div>
        ))}
      </div>
      <div style={{ padding: isMobile ? 12 : 24, maxWidth: 1100, margin: "0 auto" }}>
        {msg && (
          <div style={{ ...card, background: C.success + "15", borderColor: C.success + "44", fontSize: 12, color: C.success }}>
            ✓ {msg} <span style={{ float: "right", cursor: "pointer" }} onClick={() => setMsg("")}>✕</span>
          </div>
        )}

        {tab === "properties" && (
          <div>
            <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ ...h2Style, marginBottom: 0 }}>{t(lang, "p_od_your_properties")}</h2>
              <button style={{ ...btn("gold"), padding: "10px 20px" }} onClick={() => document.getElementById("new-prop-form")?.scrollIntoView({ behavior: "smooth" })}>{t(lang, "p_od_new_property")}</button>
            </div>
            <AssetCategoryTabs value={assetTab} onChange={setAssetTab} counts={ownerAssetCounts} />
            {filteredProperties.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: C.textDim, padding: 40, borderStyle: "dashed" }}>
                {t(lang, "p_od_no_props_category")}
              </div>
            )}
            {filteredProperties.map((prop: any) => {
              const propRooms = data.rooms.filter((r: any) => r.property_id === prop.id);
              return (
                <div key={prop.id} style={{ ...card, marginBottom: 30, borderLeft: `4px solid ${C.gold}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20 }}>
                      <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 12 }}>
                        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                          <h3 style={{ ...h3Style, fontSize: 22, margin: 0 }}>{prop.name}</h3>
                          <span style={badge(C.goldDark)}>{assetLabel(prop.asset_type)}</span>
                          <div style={{ fontSize: 12, color: C.textDim }}>📍 {prop.location}</div>
                        </div>
                        {prop.description && <div style={{ fontSize: 12, color: C.textMuted, maxWidth: 800, lineHeight: 1.6 }}>{prop.description}</div>}
                        
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                          {parseImages(galleryMap[prop.id] || prop.image).map((img, idx) => (
                            <div key={idx} style={{ position: "relative", width: 80, height: 80, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
                               <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                               <button
                                 onClick={async () => { if(confirm(t(lang, "p_od_delete_photo_confirm"))) { await removePropertyImage(prop.id, idx); await refreshGallery(prop.id); refresh(); } }}
                                 style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", color: "#FF4D4D", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}
                               >✕</button>
                            </div>
                          ))}
                          <label style={{ width: 80, height: 80, borderRadius: 6, border: `2px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.textMuted, fontSize: 20 }}>
                            +
                            <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePropertyImageUpload(prop.id, f); }} />
                          </label>
                        </div>

                        {/* Scheda PDF */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                          {prop.pdf_name ? (
                            <>
                              <span style={{ fontSize: 12, color: C.gold }}>📄 {prop.pdf_name}</span>
                              <a href={prop.pdf_document} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: C.textMuted }}>{t(lang, "p_od_open")}</a>
                              <button onClick={async () => { if (confirm(t(lang, "p_od_remove_pdf_confirm"))) { await removePropertyPdf(prop.id); setMsg(t(lang, "p_od_pdf_removed")); refresh(); } }} style={{ ...btn(), padding: "3px 10px", fontSize: 10, color: C.danger, borderColor: C.danger + "55" }}>{t(lang, "p_common_remove")}</button>
                            </>
                          ) : (
                            <label style={{ ...btn(), padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>
                              {t(lang, "p_od_upload_pdf")}
                              <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePropertyPdfUpload(prop.id, f); }} />
                            </label>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 4, flexWrap: "wrap" }}>
                        {/* Toggle visibilità vetrina */}
                        <button
                          title={prop.is_public === 0 ? t(lang, "p_od_hidden_from_showcase") : t(lang, "p_od_visible_in_showcase")}
                          onClick={async () => { await togglePropertyPublic(prop.id, prop.is_public === 0); refresh(); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                            border: prop.is_public === 0 ? `1px solid ${C.textDim}` : `1px solid ${C.success}55`,
                            background: prop.is_public === 0 ? "rgba(255,255,255,0.03)" : `${C.success}12`,
                            color: prop.is_public === 0 ? C.textDim : C.success,
                            fontFamily: FONT_B, fontSize: 10, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", transition: "all 0.2s",
                          }}>
                          <span>{prop.is_public === 0 ? "🔒" : "🌐"}</span>
                          <span>{prop.is_public === 0 ? t(lang, "p_od_hidden") : t(lang, "p_od_in_showcase")}</span>
                        </button>
                        {/* Toggle gestione disponibilità */}
                        <button
                          title={prop.manages_availability ? t(lang, "p_od_live_calendar_tooltip") : t(lang, "p_od_whatsapp_only_tooltip")}
                          onClick={async () => { await togglePropertyManagesAvailability(prop.id, !prop.manages_availability); refresh(); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                            border: prop.manages_availability ? `1px solid ${C.info}55` : `1px solid ${C.textDim}`,
                            background: prop.manages_availability ? `${C.info}12` : "rgba(255,255,255,0.03)",
                            color: prop.manages_availability ? C.info : C.textDim,
                            fontFamily: FONT_B, fontSize: 10, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", transition: "all 0.2s",
                          }}>
                          <span>{prop.manages_availability ? "📅" : "💬"}</span>
                          <span>{prop.manages_availability ? t(lang, "p_od_live_calendar") : t(lang, "p_od_whatsapp_only")}</span>
                        </button>
                        <button style={{ ...btn(), padding: "6px 12px", fontSize: 11 }} onClick={() => setEditProperty({ id: prop.id, name: prop.name, location: prop.location, description: prop.description || "", latitude: prop.latitude != null ? String(prop.latitude) : "", longitude: prop.longitude != null ? String(prop.longitude) : "" })}>✏️ {t(lang, "p_common_edit")}</button>
                        <button style={{ ...btn(), padding: "6px 10px", fontSize: 14, borderColor: C.danger + "55", color: C.danger }} title={t(lang, "p_od_delete_property_title")} onClick={async () => { if(confirm(t(lang, "p_od_confirm_delete_property", { name: prop.name }))) { await deletePropertyAction(prop.id); refresh(); } }}>🗑</button>
                        <span style={badge(C.goldLight)}>{propRooms.length} {t(lang, "p_od_units")}</span>
                      </div>
                    </div>

                  <div style={grid(2)}>
                    {propRooms.map((room: any) => {
                      const roomPricing = data.pricing.filter((p: any) => p.room_id === room.id);
                      return (
                        <div key={room.id} style={{ background: C.surfaceAlt, borderRadius: 6, padding: 16, border: `1px solid ${C.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                            <div>
                               <strong style={{ fontSize: 15, color: C.goldLight }}>{room.name}</strong>
                               <div style={{ color: C.textMuted, fontSize: 11 }}>{t(lang, "p_od_capacity")}: {room.capacity} {t(lang, "guests")}{room.bedrooms ? ` · ${room.bedrooms} ${t(lang, "bedrooms")}` : ""}{room.bathrooms ? ` · ${room.bathrooms} ${t(lang, "bathrooms")}` : ""}</div>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                               <button style={{ ...btn(), padding: "4px 8px", fontSize: 10 }} onClick={() => setEditRoom({
                                 id: room.id, name: room.name, capacity: String(room.capacity), description: room.description || "",
                                 bedrooms: room.bedrooms != null ? String(room.bedrooms) : "", bathrooms: room.bathrooms != null ? String(room.bathrooms) : "",
                                 assetType: prop.asset_type,
                                 carFields: {
                                   carModel: room.car_model || "", carCategory: room.car_category || "compact",
                                   airportDelivery: !!room.airport_delivery,
                                   securityDeposit: room.security_deposit != null ? String(room.security_deposit) : "",
                                   kaskoIncluded: !!room.kasko_included,
                                   deductibleAmount: room.deductible_amount != null ? String(room.deductible_amount) : "",
                                   documentsRequired: room.documents_required || "",
                                 },
                               })}>✏️ {t(lang, "p_common_edit")}</button>
                               <button style={{ ...btn(), padding: "4px 10px", fontSize: 10 }} onClick={() => setViewCalendar(room.id)}>{t(lang, "p_od_calendar_btn")}</button>
                               <button style={{ ...btn(), padding: "4px 8px", fontSize: 13, borderColor: C.danger + "55", color: C.danger }} title={t(lang, "p_od_delete_room_title")} onClick={async () => { if(confirm(t(lang, "p_od_confirm_delete_room", { name: room.name }))) { await deleteRoomAction(room.id); refresh(); } }}>🗑</button>
                            </div>
                          </div>

                          {/* Sync iCal disponibilità */}
                          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                            <input
                              type="text"
                              placeholder={t(lang, "p_od_ical_url_ph")}
                              value={icalInputs[room.id] ?? room.ical_url ?? ""}
                              onChange={e => setIcalInputs(v => ({ ...v, [room.id]: e.target.value }))}
                              style={{ flex: "1 1 220px", minWidth: 180, padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 11 }}
                            />
                            <button
                              style={{ ...btn(), padding: "6px 10px", fontSize: 10 }}
                              onClick={async () => {
                                const url = icalInputs[room.id] ?? room.ical_url ?? "";
                                await setRoomIcalUrl(room.id, url);
                                setMsg(t(lang, "p_od_ical_saved"));
                                refresh();
                              }}
                            >💾 {t(lang, "p_common_save")}</button>
                            <button
                              disabled={icalSyncing === room.id || !(room.ical_url || icalInputs[room.id])}
                              style={{ ...btn(), padding: "6px 10px", fontSize: 10, opacity: icalSyncing === room.id ? 0.6 : 1 }}
                              onClick={async () => {
                                setIcalSyncing(room.id);
                                const res = await syncRoomIcal(room.id);
                                setIcalSyncing(null);
                                setMsg(res.success ? t(lang, "p_od_sync_result", { blocked: res.datesBlocked ?? 0, events: res.eventsFound ?? 0 }) : t(lang, "p_od_sync_error", { error: res.error ?? "" }));
                                refresh();
                              }}
                            >{icalSyncing === room.id ? t(lang, "p_od_syncing") : t(lang, "p_od_sync")}</button>
                            {room.ical_last_synced ? (
                              <span style={{ fontSize: 10, color: C.textDim }}>{t(lang, "p_od_last_sync")} {new Date(room.ical_last_synced).toLocaleString('it-IT')}</span>
                            ) : null}
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                            {parseImages(room.image).map((img, idx) => (
                              <div key={idx} style={{ position: "relative", width: 60, height: 60, borderRadius: 4, overflow: "hidden", border: `1px solid ${C.border}` }}>
                                 <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                 <button
                                   onClick={async () => { if(confirm(t(lang, "p_od_delete_photo_confirm"))) { await removeRoomImage(room.id, idx); refresh(); } }}
                                   style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", color: "#FF4D4D", border: "none", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
                                 >✕</button>
                              </div>
                            ))}
                            <label style={{ width: 60, height: 60, borderRadius: 4, border: `2px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.textMuted, fontSize: 16 }}>
                              +
                              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(room.id, f); }} />
                            </label>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                            <div style={{ ...label, fontSize: 10, opacity: 0.6, marginBottom: 0 }}>{t(lang, "p_od_monthly_price_list")}</div>
                            <button style={{ ...btn(), padding: "2px 6px", fontSize: 10 }}
                              onClick={() => {
                                const d = new Date();
                                const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                setAddPricing({ roomId: room.id, month: ms, basePrice: "100", cleaningFee: "30" });
                              }}>{t(lang, "p_od_add_month")}</button>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                            {roomPricing.map((pr: any) => (
                              <div key={pr.id} onClick={() => setEditPricing({ roomId: room.id, month: pr.month, basePrice: String(pr.base_price), cleaningFee: String(pr.cleaning_fee) })}
                                style={{ padding: "5px 10px", borderRadius: 4, fontSize: 10, cursor: "pointer", background: C.bg, border: `1px solid ${C.border}`, transition: "all 0.2s" }}>
                                <span style={{ color: C.textMuted }}>{pr.month}</span>
                                <span style={{ color: C.gold, marginLeft: 5 }}>€{pr.base_price}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ ...card, background: "rgba(200,169,110,0.03)", borderStyle: "dashed", marginBottom: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ marginBottom: 10 }}><label style={label}>{t(lang, "p_od_new_room")}</label><input style={input} value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder={t(lang, "p_od_new_room_ph")} /></div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          <div style={{ flex: 1 }}><label style={label}>{t(lang, "p_od_capacity")}</label><input style={input} type="number" value={newRoomCap} onChange={e => setNewRoomCap(e.target.value)} /></div>
                      </div>
                      <div style={{ marginBottom: 10 }}><label style={label}>{t(lang, "p_od_description")}</label><textarea style={{ ...input, minHeight: 60, fontSize: 12 }} value={newRoomDesc} onChange={e => setNewRoomDesc(e.target.value)} placeholder={t(lang, "p_od_initial_desc_ph")} /></div>
                      {isVehicleAsset(prop.asset_type) && (
                        <CarFieldsForm value={newRoomCarFields} onChange={setNewRoomCarFields} lang={lang} />
                      )}
                      <button style={{ ...btn("gold"), width: "100%" }} onClick={() => handleAddRoom(prop.id)}>{t(lang, "p_od_add_room")}</button>
                    </div>
                  </div>

                  {/* Collaborators Management */}
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                    <label style={label}>{t(lang, "p_od_collaborators")}</label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                      <input style={{ ...input, flex: 1 }} value={collaboratorNick} onChange={e => setCollaboratorNick(e.target.value)} placeholder={t(lang, "p_od_collaborator_nick_ph")} />
                      <button style={btn("gold")} onClick={() => handleAddCollab(prop.id)}>{t(lang, "p_common_add")}</button>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {data.collaborations.filter((c: any) => c.property_id === prop.id).map((c: any) => (
                        <div key={c.id} style={{ background: C.surfaceAlt, padding: "4px 10px", borderRadius: 100, fontSize: 11, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                           <span style={{ color: C.gold }}>{c.concierge_nickname}</span>
                           <span style={{ cursor: "pointer", opacity: 0.6 }} onClick={() => handleRemoveCollab(c.id)}>✕</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            <div id="new-prop-form" style={{ ...card, borderStyle: "dashed", background: "rgba(255,255,255,0.02)", borderColor: C.borderGold }}>
              <h3 style={h3Style}>+ {t(lang, "p_common_add")} {ownerAssetCat.label} — {ownerAssetCat.icon}</h3>
              <div style={grid(2)}>
                <div><label style={label}>{t(lang, "p_od_name")}</label><input style={input} value={newPropName} onChange={e => setNewPropName(e.target.value)} placeholder={assetTab === "marine" ? "es. Aura Of The Sea" : assetTab === "mobilita" ? "es. Range Rover Aura" : "es. Villa Aura"} /></div>
                <div><label style={label}>{t(lang, "p_od_location_ph_label")}</label><input style={input} value={newPropLoc} onChange={e => setNewPropLoc(e.target.value)} placeholder={t(lang, "p_od_location_ph")} /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={label}>{t(lang, "p_od_type")}</label>
                <select style={sel} value={newPropAssetType} onChange={e => setNewPropAssetType(e.target.value)}>
                  {ASSET_TYPES.filter(a => ownerAssetCat.types.includes(a.v)).map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
                </select>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={label}>{t(lang, "p_od_description")}</label>
                <textarea style={{ ...input, minHeight: 80, fontSize: 12 }} value={newPropDesc} onChange={e => setNewPropDesc(e.target.value)} placeholder={t(lang, "p_od_short_desc_ph")} />
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={label}>{t(lang, "p_od_map_position")}</label>
                <LocationPicker lat={newPropLat} lng={newPropLng} onChange={(la, lo) => { setNewPropLat(la); setNewPropLng(lo); }} />
              </div>
              <button style={{ ...btn("gold"), marginTop: 16 }} onClick={handleAddProperty}>{t(lang, "p_od_create_property")}</button>
            </div>

            {/* Edit Property Modal */}
            {editProperty && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                <div style={{ ...card, width: "100%", maxWidth: 500, background: C.surface }}>
                  <h3 style={h3Style}>{t(lang, "p_od_edit_property_title")}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div><label style={label}>{t(lang, "p_od_name")}</label><input style={input} value={editProperty.name} onChange={e => setEditProperty({ ...editProperty, name: e.target.value })} /></div>
                    <div><label style={label}>{t(lang, "p_od_location_label")}</label><input style={input} value={editProperty.location} onChange={e => setEditProperty({ ...editProperty, location: e.target.value })} /></div>
                    <div><label style={label}>{t(lang, "p_od_description")}</label><textarea style={{ ...input, minHeight: 120 }} value={editProperty.description} onChange={e => setEditProperty({ ...editProperty, description: e.target.value })} /></div>
                    <div><label style={label}>{t(lang, "p_od_map_position")}</label>
                      <LocationPicker lat={editProperty.latitude} lng={editProperty.longitude} onChange={(la, lo) => setEditProperty({ ...editProperty, latitude: la, longitude: lo })} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                    <button style={{ ...btn("gold"), flex: 1 }} onClick={async () => {
                      const lat = editProperty.latitude ? parseFloat(editProperty.latitude) : null;
                      const lng = editProperty.longitude ? parseFloat(editProperty.longitude) : null;
                      await updatePropertyAction(editProperty.id, editProperty.name, editProperty.location, editProperty.description, lat, lng);
                      setEditProperty(null);
                      setMsg(t(lang, "p_od_property_updated"));
                      refresh();
                    }}>{t(lang, "p_od_save_changes")}</button>
                    <button style={{ ...btn(), flex: 1 }} onClick={() => setEditProperty(null)}>{t(lang, "p_common_cancel")}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "bookings" && (
          <div>

            {/* Commission split summary — solo prenotazioni confermate */}
            {(() => {
              const confirmed = ownerBookings.filter((b: any) => ["confirmed_owner","evaso"].includes(b.status));
              if (confirmed.length === 0) return null;
              const totClient     = confirmed.reduce((s: number, b: any) => s + b.total_price, 0);
              const totOwnerGross = confirmed.reduce((s: number, b: any) => s + b.owner_price_total, 0);
              const totPlatFee    = confirmed.reduce((s: number, b: any) => s + (b.platform_fee || calcSplit(b.owner_price_total, b.concierge_fee, b.platform_fee_rate || 0).platformFee), 0);
              const totOwnerNet   = totOwnerGross - totPlatFee;
              const totConc       = confirmed.reduce((s: number, b: any) => s + b.concierge_fee, 0);
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 12, marginBottom: 24 }}>
                  {[
                    { label: t(lang, "p_od_client_total_label"), value: totClient,     color: C.text },
                    { label: t(lang, "p_od_owner_gross"),        value: totOwnerGross, color: C.textMuted },
                    { label: t(lang, "p_od_platform_fee"),       value: totPlatFee,    color: C.danger },
                    { label: t(lang, "p_od_owner_net"),          value: totOwnerNet,   color: C.success },
                    { label: t(lang, "p_od_concierge_fee_label"),value: totConc,       color: C.gold },
                  ].map(item => (
                    <div key={item.label} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px" }}>
                      <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 6 }}>{item.label}</div>
                      <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 400, color: item.color }}>€{item.value.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ ...h2Style, margin: 0 }}>{t(lang, "p_cd_bookings_title")}</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  placeholder={t(lang, "p_cd_search_client")}
                  style={{ ...input, width: 180, padding: "6px 12px" }}
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                />
                <select
                  style={{ ...sel, width: 140, padding: "6px 12px" }}
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="">{t(lang, "p_filter_all_statuses")}</option>
                  {Object.entries(statusMap(lang)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select
                  style={{ ...sel, width: 140, padding: "6px 12px" }}
                  value={roomFilter}
                  onChange={e => setRoomFilter(e.target.value)}
                >
                  <option value="">{t(lang, "p_filter_all_rooms")}</option>
                  {allRooms.map((r: any) => {
                    const p = data.properties.find((prop: any) => prop.id === r.property_id);
                    return <option key={r.id} value={r.id}>{p ? `${p.name} - ` : ""}{r.name}</option>
                  })}
                </select>
                <select style={{ ...sel, width: 90, padding: "6px 12px" }} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                  <option value="">{t(lang, "p_filter_year")}</option>
                  {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                <select style={{ ...sel, width: 110, padding: "6px 12px" }} value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
                  <option value="">{t(lang, "p_filter_month")}</option>
                  {monthsList(lang).map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
            </div>

            {ownerBookings.length === 0 ? <div style={{ ...card, textAlign: "center", color: C.textDim }}>{t(lang, "p_od_no_bookings_filtered")}</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {[t(lang, "p_common_client"), t(lang, "p_th_prop_room"), t(lang, "p_th_dates"), t(lang, "p_cd_stay"), t(lang, "p_cd_cleaning"), t(lang, "p_od_owner_gross"), t(lang, "p_th_platform_fee_short"), t(lang, "p_od_owner_net"), t(lang, "p_th_conc_short"), t(lang, "p_od_client_total_label"), t(lang, "p_th_collected"), t(lang, "p_th_quote"), t(lang, "p_common_status"), t(lang, "p_common_actions"), t(lang, "p_common_notes")].map((h, i) => (
                        <th key={i} style={{ ...th, fontSize: 9 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>{ownerBookings.map((b: any) => {
                    const isOwnRoom = allRooms.some((r: any) => r.id === b.room_id);
                    const room = isOwnRoom
                      ? data.rooms.find((r: any) => r.id === b.room_id)
                      : collaboratedRooms.find((r: any) => r.id === b.room_id);
                    const prop = isOwnRoom
                      ? data.properties.find((p: any) => p.id === room?.property_id)
                      : collaboratedProperties.find((p: any) => p.id === room?.property_id);
                    const st = statusMap(lang)[b.status] || { label: b.status, color: C.textDim };
                    const payments = data.payments.filter((p: any) => p.booking_id === b.id);
                    const receiver = payments[0]?.receiver;
                    const collabPropOwner = !isOwnRoom ? data.users.find((u: any) => u.id === prop?.owner_id) : null;
                    return (<tr key={b.id} style={!isOwnRoom ? { borderLeft: `3px solid ${C.info}44` } : undefined}>
                      <td style={td}>
                        {b.client_name} {b.client_surname}
                        {!isOwnRoom && <div style={{ fontSize: 9, color: C.info, marginTop: 2 }}>{t(lang, "p_od_collaboration_tag")}</div>}
                      </td>
                      <td style={td}>
                        <div style={{ fontSize: 10 }}>{prop ? `${prop.name} - ` : ""}{room?.name}</div>
                        {!isOwnRoom && collabPropOwner && <div style={{ fontSize: 9, color: C.textDim }}>{t(lang, "p_od_owner_label")} {collabPropOwner.nickname}</div>}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {formatDate(b.start_date)} → {formatDate(b.end_date)}
                        <div style={{ fontSize: 9, color: C.textDim }}>({getDaysBetween(b.start_date, b.end_date)} {unitLabel(lang, b.asset_type, getDaysBetween(b.start_date, b.end_date))})</div>
                      </td>
                      <td style={td}>€{b.stay_price_total}</td>
                      <td style={td}>€{b.cleaning_fee_total}</td>
                      <td style={{ ...td, color: C.text }}>€{b.owner_price_total}</td>
                      <td style={{ ...td, fontSize: 10 }}>
                        {b.platform_fee_rate > 0 ? (
                          <div>
                            <span style={{ color: C.danger }}>-€{(b.platform_fee || calcSplit(b.owner_price_total, b.concierge_fee, b.platform_fee_rate).platformFee).toFixed(2)}</span>
                            <div style={{ fontSize: 8, color: C.textDim }}>{b.platform_fee_rate}%</div>
                          </div>
                        ) : <span style={{ color: C.textDim }}>—</span>}
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: C.success }}>
                        €{b.platform_fee_rate > 0 ? calcSplit(b.owner_price_total, b.concierge_fee, b.platform_fee_rate).ownerNet.toFixed(2) : b.owner_price_total}
                      </td>
                      <td style={{ ...td, color: C.gold, fontSize: 10 }}>
                        €{b.concierge_fee}
                        <div style={{ fontSize: 8, opacity: 0.7 }}>({data.users.find((u:any)=>u.id===b.concierge_id)?.nickname || t(lang, "p_th_conc_short")})</div>
                      </td>
                      <td style={{ ...td, fontWeight: 700 }}>€{b.total_price}</td>
                      <td style={td}>
                        {(() => {
                           if (!receiver) return "-";
                           if (!isOwnRoom) {
                             if (receiver === user.id) return <span style={{ color: C.gold, fontWeight: 600, fontSize: 10 }}>{user.nickname} {t(lang, "p_od_you")}</span>;
                             const ownerU = data.users.find((u: any) => u.id === collabPropOwner?.id);
                             return <span style={{ color: C.success, fontWeight: 600, fontSize: 10 }}>{collabPropOwner?.nickname || t(lang, "p_common_owner")}</span>;
                           }
                           if (receiver === 'owner' || receiver === user.id) return <span style={{ color: C.success, fontWeight: 600, fontSize: 10 }}>{user?.nickname || t(lang, "p_common_owner")}</span>;
                           const c = data.users.find((u: any) => u.id === b.concierge_id);
                           return <span style={{ color: C.gold, fontWeight: 600, fontSize: 10 }}>{c?.nickname || "Concierge"}</span>;
                        })()}
                      </td>
                      <td style={td}>
                        <button style={{ ...btn(), fontSize: 9, padding: "3px 8px" }} onClick={() => generatePdf(b)}>PDF</button>
                      </td>
                      <td style={td}><span style={badge(st.color)}>{st.label}</span></td>
                        <td style={td}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            {!isOwnRoom ? (
                              // Collaborated booking — concierge-level actions
                              <>
                                {b.status === "draft" && <button style={{ ...btn(), fontSize: 10, padding: "4px 10px" }} onClick={() => handleStatusChange(b.id, "sent")}>{t(lang, "p_send_to_client")}</button>}
                                {b.status === "sent" && <button style={{ ...btn("gold"), fontSize: 10, padding: "4px 10px" }} onClick={() => { setPayModal(b); setPayModalIsCollab(true); }}>{t(lang, "p_od_pm_register_deposit_btn")}</button>}
                                {b.status === "payment_submitted" && <span style={{ fontSize: 10, color: C.textDim }}>{t(lang, "p_od_pm_awaiting_owner_confirmation")}</span>}
                                {b.status === "confirmed_owner" && <span style={{ fontSize: 10, color: C.success }}>{t(lang, "p_od_confirmed")}</span>}
                                {b.status === "evaso" && <span style={{ fontSize: 10, color: C.success }}>{t(lang, "p_od_completed_check")}</span>}
                              </>
                            ) : (
                              // Own property — full owner actions
                              <>
                                {b.status === "draft" && (
                                  <button style={{ ...btn(), fontSize: 10, padding: "4px 10px" }} onClick={() => handleStatusChange(b.id, "sent")}>{t(lang, "p_send_to_client")}</button>
                                )}
                                {b.status === "sent" && <button style={{ ...btn("gold"), fontSize: 10, padding: "4px 10px" }} onClick={() => { setPayModal(b); setPayModalIsCollab(false); }}>{t(lang, "p_od_pm_register_deposit_btn")}</button>}
                                {b.status === "payment_submitted" && <button style={{ ...btn("gold"), fontSize: 10, padding: "4px 10px" }} onClick={() => setConfirmModal(b)}>{t(lang, "p_od_pm_confirm_payment_btn")}</button>}
                                {b.status === "confirmed_owner" && <button style={{ ...btn("gold"), fontSize: 10, padding: "4px 10px" }} onClick={() => setBalanceModal(b)}>{t(lang, "p_od_pm_register_balance_btn")}</button>}
                                {b.status === "evaso" && <span style={{ fontSize: 10, color: C.textDim }}>-</span>}
                              </>
                            )}
                          </div>
                        </td>
                        <td style={td}>
                          {b.notes && <button style={{ ...btn(), padding: "2px 8px", fontSize: 12, borderColor: C.gold + "44" }} onClick={() => setViewNotes(b.notes)} title={t(lang, "p_show_notes")}>👁️</button>}
                        </td>
                        <td style={td}>
                          {(isOwnRoom || ['draft', 'sent'].includes(b.status)) && (
                            <button style={{ ...btn(), fontSize: 10, padding: "4px 10px", color: C.danger, borderColor: C.danger + "44" }} onClick={() => handleDelete(b.id)}>{t(lang, "p_common_delete")}</button>
                          )}
                        </td>
                    </tr>);
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "new_booking" && (
          <div>
            <h2 style={h2Style}>{t(lang, "p_od_add_direct_booking")}</h2>
            <div style={grid(2)}>
              <div style={card}>
                <h3 style={h3Style}>{t(lang, "p_cd_step1_title")}</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={label}>{t(lang, "p_cd_select_room")}</label>
                  <select style={sel} value={selectedRoom} onChange={e => { setSelectedRoom(e.target.value); setSelectedRange({ start: null, end: null }); }}>
                    {allRooms.length > 0 && (
                      <optgroup label={t(lang, "p_od_my_properties_group")}>
                        {allRooms.map((r: any) => {
                          const prop = properties.find((p: any) => p.id === r.property_id);
                          return <option key={r.id} value={r.id}>{prop?.name} — {r.name}</option>;
                        })}
                      </optgroup>
                    )}
                    {collaboratedRooms.length > 0 && (
                      <optgroup label={t(lang, "p_od_collabs_other_owners")}>
                        {collaboratedRooms.map((r: any) => {
                          const prop = collaboratedProperties.find((p: any) => p.id === r.property_id);
                          const propOwner = data.users.find((u: any) => u.id === prop?.owner_id);
                          return <option key={r.id} value={r.id}>[{propOwner?.nickname || t(lang, "p_common_owner")}] {prop?.name} — {r.name}</option>;
                        })}
                      </optgroup>
                    )}
                  </select>
                </div>
                <CalendarView
                  roomId={selectedRoom}
                  onSelectRange={setSelectedRange}
                  selectedRange={selectedRange}
                  roomBookings={[...data.bookings, ...collaboratedBookings].filter((b: any) => b.room_id === selectedRoom)}
                  users={data.users}
                  allPricing={[...data.pricing, ...collaboratedPricing]}
                  isMobile={isMobile}
                  onEditBooking={(b) => {
                    setAdjModal(b);
                    setLocalAdjs(JSON.parse(b.price_adjustments || "{}"));
                  }}
                  lang={lang}
                />
              </div>
              <div>
                <div style={card}>
                  <h3 style={h3Style}>{t(lang, "p_od_client_data_ref")}</h3>
                  <div style={grid(2)}>
                    <div><label style={label}>{t(lang, "p_cd_first_name")}</label><input style={input} value={clientName} onChange={e => setClientName(e.target.value)} placeholder={t(lang, "p_first_name")} /></div>
                    <div><label style={label}>{t(lang, "p_cd_last_name")}</label><input style={input} value={clientSurname} onChange={e => setClientSurname(e.target.value)} placeholder={t(lang, "p_last_name")} /></div>
                  </div>
                  <div style={grid(2)}>
                    <div style={{ marginTop: 12 }}>
                      <label style={label}>{t(lang, "p_cd_guests_count")}</label>
                      <input style={input} type="number" min="1" value={guestsCount} onChange={e => setGuestsCount(e.target.value)} />
                      {selectedRoom && (() => { const rm = [...allRooms, ...collaboratedRooms].find((r:any)=>r.id === selectedRoom); return rm && parseInt(guestsCount) > (rm.capacity || 0) ? <div style={{ fontSize: 10, color: C.warning, marginTop: 4 }}>{t(lang, "p_cd_exceeds_capacity")} ({rm.capacity})</div> : null; })()}
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}><label style={label}>{t(lang, "p_od_notes_extra")}</label><textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t(lang, "p_od_notes_extra_ph")} /></div>
                  {isVehicleAsset(selectedRoomAssetType) && (
                    <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                      <div style={{ flex: 1 }}><label style={label}>{t(lang, "p_od_pickup_time_label")}</label><input style={input} type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} /></div>
                      <div style={{ flex: 1 }}><label style={label}>{t(lang, "p_od_dropoff_time_label")}</label><input style={input} type="time" value={dropoffTime} onChange={e => setDropoffTime(e.target.value)} /></div>
                    </div>
                  )}
                </div>
                {pricing && (() => {
                  const ownerTot = pricing.baseTotal + pricing.cleaningFee;
                  const rawVal = Number(ownerConciergeFee) || 0;
                  const fee = ownerFeeMode === 'percentage'
                    ? Math.round(ownerTot * rawVal / 100 * 100) / 100
                    : rawVal * pricing.nights;
                  return (
                    <div style={{ ...card, borderColor: C.success + "44", background: C.success + "08" }}>
                      <h3 style={h3Style}>{t(lang, "p_od_summary")}</h3>
                      <div style={{ fontSize: 12, lineHeight: 2 }}>
                        <div>{t(lang, "p_cd_nights")}: <strong>{pricing.nights}</strong></div>
                        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                            <span style={{ color: C.textDim }}>{t(lang, "p_od_base_stay")}</span>
                            <span>€{pricing.baseTotal}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                            <span style={{ color: C.textDim }}>{t(lang, "p_cd_cleaning_fee")}</span>
                            <span>€{pricing.cleaningFee}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: C.success, fontWeight: 700, margin: "4px 0" }}>
                            <span>{t(lang, "p_cd_owner_share")}</span>
                            <span>€{ownerTot}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontFamily: FONT, color: C.text, marginTop: 8, paddingTop: 8, borderTop: `2px solid ${C.success}55` }}>
                            <span style={{ fontWeight: 800 }}>{t(lang, "p_od_total_caps")}</span>
                            <span style={{ fontWeight: 800 }}>€{ownerTot}</span>
                          </div>
                        </div>
                      </div>
                      <button style={{ ...btn("gold"), width: "100%", marginTop: 16, background: C.success, color: C.bg }} onClick={handleCreateBookingOwner}>{t(lang, "p_od_register_to_calendar")}</button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {tab === "report" && (() => {
          const filtered = ownerBookings.filter((b: any) => 
            ["confirmed_owner", "evaso"].includes(b.status) && 
            b.start_date >= reportStart && b.start_date <= reportEnd
          );
          
          const totalRevenueFiltered = filtered.reduce((s: number, b: any) => s + b.owner_price_total, 0);
          const totalFeesPaid = filtered.reduce((s: number, b: any) => s + b.concierge_fee, 0);

          // Calcolo Incasso Reale (Saldo effettivo in cassa)
          const allPaymentsFiltered = data.payments.filter((p: any) => filtered.some((b: any) => b.id === p.booking_id));
          const realIncTotal = allPaymentsFiltered.filter((p: any) => 
            ['acconto_owner', 'saldo_owner', 'storno_owner_in', 'acconto_concierge', 'storno_concierge_in'].includes(p.type) && (p.receiver === user.id || p.receiver === 'owner')
          ).reduce((s: number, p: any) => s + p.amount, 0);
          const realOutTotal = allPaymentsFiltered.filter((p: any) => 
            ['storno_owner_out', 'storno_concierge_out'].includes(p.type) && (p.receiver === user.id || p.receiver === 'owner')
          ).reduce((s: number, p: any) => s + p.amount, 0);
          const totalRealCollected = realIncTotal - realOutTotal;

          // Group per Concierge/Agent
          const conciergeStats = data.users.filter((u: any) => ["concierge","agent"].includes(u.role)).map((u: any) => {
            const bookings = filtered.filter((b: any) => b.concierge_id === u.id);
            const fees = bookings.reduce((s: number, b: any) => s + b.concierge_fee, 0);
            
            const totalDays = bookings.reduce((s: number, b: any) => s + getDaysBetween(b.start_date, b.end_date), 0);
            const avgDays = bookings.length > 0 ? (totalDays / bookings.length).toFixed(1) : "0.0";
            const avgFee = bookings.length > 0 ? (fees / bookings.length).toFixed(2) : "0.00";
            
            return { nickname: u.nickname, count: bookings.length, fees, avgDays, avgFee };
          }).filter((s: any) => s.count > 0);

          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ ...h2Style, margin: 0 }}>{t(lang, "p_od_analytical_report")}</h2>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="date" style={{ ...input, width: 140, padding: "4px 8px", fontSize: 11 }} value={reportStart} onChange={e => setReportStart(e.target.value)} />
                  <span style={{ color: C.textDim }}>→</span>
                  <input type="date" style={{ ...input, width: 140, padding: "4px 8px", fontSize: 11 }} value={reportEnd} onChange={e => setReportEnd(e.target.value)} />
                </div>
              </div>

              <div style={grid(5)}>
                <div style={card}><div style={label}>{t(lang, "p_od_gross_revenue")}</div><div style={{ fontFamily: FONT, fontSize: 24, color: C.text }}>€{filtered.reduce((s: number, b: any) => s + b.total_price, 0)}</div></div>
                <div style={card}><div style={label}>{t(lang, "p_od_expected_net")}</div><div style={{ fontFamily: FONT, fontSize: 24, color: C.textDim }}>€{totalRevenueFiltered}</div></div>
                <div style={card}>
                  <div style={label}>{t(lang, "p_od_real_collected")}</div>
                  <div style={{ fontFamily: FONT, fontSize: 32, color: C.success }}>€{totalRealCollected.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: totalRevenueFiltered > 0 ? (totalRealCollected >= totalRevenueFiltered ? C.success : C.warning) : C.textDim, marginTop: 4 }}>
                    {totalRevenueFiltered > 0 ? t(lang, "p_od_pct_of_expected", { pct: ((totalRealCollected / totalRevenueFiltered) * 100).toFixed(0) }) : t(lang, "p_od_no_forecast")}
                  </div>
                </div>
                <div style={card}><div style={label}>{t(lang, "p_od_fees_paid")}</div><div style={{ fontFamily: FONT, fontSize: 24, color: C.warning }}>€{totalFeesPaid}</div></div>
                <div style={card}><div style={label}>{t(lang, "p_od_finalized_bookings")}</div><div style={{ fontFamily: FONT, fontSize: 24, color: C.textDim }}>{filtered.length}</div></div>
              </div>

              <div style={grid(2)}>
                <div style={card}>
                  <h3 style={h3Style}>{t(lang, "p_od_collaborator_performance")}</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>{[t(lang, "p_th_nick"), t(lang, "p_th_bookings_short"), t(lang, "p_th_total_fee"), t(lang, "p_th_avg_nights"), t(lang, "p_th_avg_fee")].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>{conciergeStats.map((s: any) => (
                      <tr key={s.nickname}>
                        <td style={td}><strong>{s.nickname}</strong></td>
                        <td style={td}>{s.count}</td>
                        <td style={{ ...td, color: C.gold, fontWeight: 600 }}>€{s.fees}</td>
                        <td style={td}>{s.avgDays} {t(lang, "p_od_days_abbrev")}</td>
                        <td style={{ ...td, color: C.success }}>€{s.avgFee}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>

                <div style={card}>
                  <h3 style={h3Style}>{t(lang, "p_od_revenue_by_property")}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {properties.map((prop: any) => {
                      const propRooms = data.rooms.filter((r: any) => r.property_id === prop.id);
                      const propRev = filtered.filter((b: any) => propRooms.some((r: any) => r.id === b.room_id)).reduce((s: number, b: any) => s + b.owner_price_total, 0);
                      return (
                        <div key={prop.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}44`, paddingBottom: 8 }}>
                          <span style={{ fontSize: 12 }}>{prop.name}</span>
                          <span style={{ fontFamily: FONT, fontSize: 16, color: C.gold }}>€{propRev}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={card}>
                <h3 style={h3Style}>{t(lang, "p_od_detail_by_room")}</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr>{[t(lang, "p_th_room"), t(lang, "p_th_property"), "Revenue"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>{allRooms.map((r: any) => {
                    const roomRev = filtered.filter((b: any) => b.room_id === r.id).reduce((s: number, b: any) => s + b.owner_price_total, 0);
                    const prop = properties.find((p: any) => p.id === r.property_id);
                    return (
                      <tr key={r.id}>
                        <td style={td}>{r.name}</td>
                        <td style={td}><span style={{ color: C.textDim }}>{prop?.name}</span></td>
                        <td style={{ ...td, color: C.success, fontWeight: 600 }}>€{roomRev}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>

              {(() => {
                const methods = data.userPaymentMethods.filter((m: any) => m.user_id === user.id);
                const uniqueNames = Array.from(new Set(methods.map((m: any) => m.name))) as string[];
                const rCards = uniqueNames.map((mtd: string) => {
                  const mm = methods.find((pm: any) => pm.name === mtd);
                  const mPayments = data.payments.filter((p: any) => 
                    p.method === mtd && 
                    filtered.some((b: any) => b.id === p.booking_id)
                  );
                  const inc = mPayments.filter((p: any) => 
                    ['acconto_owner', 'saldo_owner', 'storno_owner_in', 'acconto_concierge', 'storno_concierge_in'].includes(p.type) && (p.receiver === user.id || p.receiver === 'owner')
                  ).reduce((s: number, p: any) => s + p.amount, 0);
                  const out = mPayments.filter((p: any) => 
                    ['storno_owner_out', 'storno_concierge_out'].includes(p.type) && (p.receiver === user.id || p.receiver === 'owner')
                  ).reduce((s: number, p: any) => s + p.amount, 0);

                  if (inc === 0 && out === 0) return null;
                  return (
                    <div key={mm?.id} style={{ border: `1px solid ${C.border}`, padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.gold, borderBottom: `1px solid ${C.border}44`, paddingBottom: 6 }}>{mtd}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: C.textDim }}>{t(lang, "p_income")}</span>
                        <span style={{ color: C.success, fontWeight: 600 }}>€{inc.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: C.textDim }}>{t(lang, "p_outflow")}</span>
                        <span style={{ color: C.warning }}>€{out.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: `1px solid ${C.border}44`, paddingTop: 6, fontWeight: 700 }}>
                        <span style={{ color: C.text }}>{t(lang, "p_balance")}</span>
                        <span style={{ color: (inc - out) >= 0 ? C.success : C.warning }}>€{(inc - out).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                });

                if (rCards.filter(c => c !== null).length === 0) return null;
                return (
                  <div style={{ ...card, marginTop: 24 }}>
                    <h3 style={{ ...h3Style, fontSize: 15 }}>{t(lang, "p_summary_by_method")}</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
                      {rCards}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {balanceModal && (() => {
          const payments = data.payments.filter((p: any) => p.booking_id === balanceModal.id);
          const accontoOwner = payments.find((p: any) => p.type === 'acconto_owner')?.amount || 0;
          const accontoConcierge = payments.find((p: any) => p.type === 'acconto_concierge')?.amount || 0;
          const stornoOwner = payments.find((p: any) => p.type === 'storno_owner')?.amount || 0;
          const stornoConcierge = payments.find((p: any) => p.type === 'storno_concierge')?.amount || 0;
          const concierge = data.users.find((u: any) => u.id === balanceModal.concierge_id);
          const conciergeName = concierge?.nickname || "Concierge";
          const ownerName = user?.nickname || "Silvia";

          const collected = payments.reduce((s: number, p: any) => s + p.amount, 0); // Not strictly accurate with stornos
          
          const totale = balanceModal.total_price;
          // Calculate remaining differently based on the business logic.
          // The total that remains to be paid to the owner for the stay.
          // If concierge collected initial deposit, they've subtracted their fee and sent "stornoOwner" to owner.
          // Real remaining from guest = Totale - accontoConcierge - accontoOwner
          const remainingFromGuest = totale - accontoConcierge - accontoOwner;

          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 500, backdropFilter: "blur(8px)" }} onClick={() => setBalanceModal(null)}>
              <div style={{ ...card, width: 450, background: C.bg }} onClick={e => e.stopPropagation()}>
                <h3 style={h3Style}>{t(lang, "p_od_pm_balance_title")}</h3>
                <p style={{ fontSize: 12, color: C.textDim, marginTop: -10, marginBottom: 20 }}>{t(lang, "p_od_pm_balance_subtitle", { name: balanceModal.client_name })}</p>

                <div style={{ ...card, background: C.surfaceAlt, marginBottom: 20, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: C.textDim }}>{t(lang, "p_od_pm_original_stay_total")}</span>
                    <strong>€{totale}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: C.textDim }}>{t(lang, "p_od_pm_concierge_commission")}</span>
                    <strong>€{balanceModal.concierge_fee}</strong>
                  </div>
                  <hr style={{ border: `1px solid ${C.border}44`, margin: "8px 0" }} />
                  {accontoConcierge > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: C.textDim }}>{t(lang, "p_od_pm_deposit_paid_by_client_to", { name: conciergeName })}</span>
                      <strong style={{ color: C.gold }}>€{accontoConcierge}</strong>
                    </div>
                  )}
                  {accontoOwner > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: C.textDim }}>{t(lang, "p_od_pm_deposit_paid_by_client_to_you", { name: ownerName })}</span>
                      <strong style={{ color: C.success }}>€{accontoOwner}</strong>
                    </div>
                  )}

                  {(stornoOwner > 0 || stornoConcierge > 0) && (
                    <div style={{ padding: "8px 12px", marginTop: 12, borderRadius: 6, borderLeft: `3px solid ${stornoOwner > 0 ? C.success : C.warning}`, background: "rgba(255,255,255,0.02)" }}>
                       {stornoOwner > 0 && (
                         <>
                           <div style={{ color: C.textDim, fontSize: 12, display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                             <span>{t(lang, "p_od_pm_retained_by_for_commission", { name: conciergeName })}</span>
                             <strong style={{ color: C.gold }}>€{balanceModal.concierge_fee}</strong>
                           </div>
                           <div style={{ color: C.textDim, fontSize: 12, display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                             <span>{t(lang, "p_od_pm_deposit_share_already_collected", { name: conciergeName })}</span>
                             <strong style={{ color: C.success }}>€{stornoOwner}</strong>
                           </div>
                         </>
                       )}
                       {stornoConcierge > 0 && (
                         <>
                           <div style={{ color: C.textDim, fontSize: 12, display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                             <span>{t(lang, "p_od_pm_retained_by_you_partial")}</span>
                             <strong style={{ color: C.success }}>€{(accontoOwner - stornoConcierge).toFixed(2)}</strong>
                           </div>
                           <div style={{ color: C.textDim, fontSize: 12, display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                             <span>{t(lang, "p_od_pm_storno_paid_to", { name: conciergeName })}</span>
                             <strong style={{ color: C.warning }}>€{stornoConcierge}</strong>
                           </div>
                         </>
                       )}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 14 }}>
                    <span>{t(lang, "p_od_pm_balance_due_checkin")}</span>
                    <strong style={{ color: C.info }}>€{remainingFromGuest.toFixed(2)}</strong>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={label}>{t(lang, "p_od_pm_amount_received")}</label>
                  <input style={input} type="number" value={balanceData.amount || remainingFromGuest.toFixed(2)} onChange={e => setBalanceData({...balanceData, amount: e.target.value})} />
                </div>
                <div style={grid(2)}>
                  <div>
                    <label style={label}>{t(lang, "p_od_pm_collection_date")}</label>
                    <input style={input} type="date" value={balanceData.date} onChange={e => setBalanceData({...balanceData, date: e.target.value})} />
                  </div>
                  <div>
                    <label style={label}>{t(lang, "p_od_pm_collection_method")}</label>
                    <select style={sel} value={balanceData.method} onChange={e => setBalanceData({...balanceData, method: e.target.value})}>
                      <option value="">{t(lang, "p_od_pm_select_placeholder")}</option>
                      {data.userPaymentMethods.filter((m: any) => m.user_id === user.id).map((m: any) => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {balanceModal.concierge_id !== user.id && remainingFromGuest > (totale - balanceModal.concierge_fee - accontoOwner) && (
                  <div style={{ marginTop: 15, paddingTop: 15, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim }}>
                    ℹ️ {t(lang, "p_od_pm_storno_auto_concierge_info", { amount: Math.max(0, balanceModal.concierge_fee - accontoConcierge).toFixed(2) })}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
                  <button style={{ ...btn("gold"), flex: 1 }} onClick={async () => {
                    await handleRecordFinalBalance(balanceModal.id, user.id, {
                      amount: balanceData.amount || remainingFromGuest.toFixed(2),
                      date: balanceData.date,
                      method: balanceData.method
                    });
                  }}>{t(lang, "p_od_pm_register_and_close")}</button>
                  <button style={{ ...btn(), flex: 1 }} onClick={() => setBalanceModal(null)}>{t(lang, "p_common_close")}</button>
                </div>
              </div>
            </div>
          );
        })()}
        {confirmModal && (() => {
          const payments = data.payments.filter((p: any) => p.booking_id === confirmModal.id);
          const stornoOwner = payments.find((p: any) => p.type === 'storno_owner_in')?.amount || 0;
          const stornoConcierge = payments.find((p: any) => p.type === 'storno_concierge_in')?.amount || 0;
          const accontoConcierge = payments.find((p: any) => p.type === 'acconto_concierge')?.amount || 0;
          const accontoOwner = payments.find((p: any) => p.type === 'acconto_owner')?.amount || 0;
          const isConciergeCollector = accontoConcierge > 0;
          const concierge = data.users.find((u: any) => u.id === confirmModal.concierge_id);
          const conciergeName = concierge?.nickname || "Concierge";

          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 500, backdropFilter: "blur(8px)" }} onClick={() => setConfirmModal(null)}>
              <div style={{ ...card, width: 400, background: C.bg }} onClick={e => e.stopPropagation()}>
                <h3 style={h3Style}>{t(lang, "p_od_pm_verify_title")}</h3>
                <p style={{ fontSize: 12, color: C.textDim, marginTop: -10, marginBottom: 20 }}>{t(lang, "p_od_pm_verify_subtitle", { name: confirmModal.client_name })}</p>

                <div style={{ ...card, background: C.surfaceAlt, marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: C.textDim }}>{t(lang, "p_od_pm_original_total")}</span>
                    <strong>€{confirmModal.total_price}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: C.textDim }}>{t(lang, "p_od_pm_collected_by")}</span>
                    <strong style={{ color: isConciergeCollector ? C.gold : C.success }}>{isConciergeCollector ? t(lang, "p_od_pm_collected_by_concierge", { name: conciergeName }) : t(lang, "p_od_pm_collected_by_owner", { name: user.nickname })}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: C.textDim }}>{t(lang, "p_od_pm_amount_collected")}</span>
                    <strong>€{isConciergeCollector ? accontoConcierge : accontoOwner}</strong>
                  </div>
                </div>

                <div style={{ ...card, background: C.surfaceAlt, borderColor: C.gold + "44", marginBottom: 20 }}>
                  {isConciergeCollector && stornoOwner > 0 && (
                    <div style={{ fontSize: 13, color: C.gold }}>
                      <strong style={{ display: "block", marginBottom: 6 }}>{t(lang, "p_od_pm_storno_favor_you", { name: user.nickname, amount: stornoOwner })}</strong>
                      <span style={{ fontSize: 11, color: C.textDim }}>{t(lang, "p_od_pm_storno_favor_you_desc", { name: conciergeName })}</span>
                    </div>
                  )}
                  {isConciergeCollector && stornoOwner === 0 && (
                    <div style={{ fontSize: 13, color: C.textDim }}>
                      {t(lang, "p_od_pm_no_storno_commission_only")}
                    </div>
                  )}

                  {!isConciergeCollector && stornoConcierge > 0 && (
                    <div style={{ fontSize: 13, color: C.warning }}>
                      <strong style={{ display: "block", marginBottom: 6 }}>{t(lang, "p_od_pm_storno_outgoing_warning", { amount: stornoConcierge })}</strong>
                      <span style={{ fontSize: 11, color: C.textDim }}>{t(lang, "p_od_pm_storno_outgoing_desc", { name: conciergeName })}</span>
                    </div>
                  )}
                  {!isConciergeCollector && stornoConcierge === 0 && (
                    <div style={{ fontSize: 13, color: C.textDim }}>
                      {t(lang, "p_od_pm_no_amount_retained")}
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 24, textAlign: "center" }}>
                  {t(lang, "p_od_pm_confirm_lock_warning")}
                </div>

                <div style={{ ...card, background: "rgba(255,255,255,0.02)", marginBottom: 24 }}>
                  <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>{t(lang, "p_od_pm_confirm_receipt_label")}</p>
                  <div style={grid(2)}>
                    <div>
                      <label style={label}>{t(lang, "p_od_pm_receipt_date")}</label>
                      <input style={{ ...input, padding: "6px 8px", fontSize: 12 }} type="date" value={confirmData.date} onChange={e => setConfirmData({...confirmData, date: e.target.value})} />
                    </div>
                    <div>
                      <label style={label}>{t(lang, "p_od_pm_method_label")}</label>
                      <select style={{ ...sel, padding: "6px 8px", fontSize: 12 }} value={confirmData.method} onChange={e => setConfirmData({...confirmData, method: e.target.value})}>
                        <option value="">{t(lang, "p_od_pm_select_placeholder")}</option>
                        {data.userPaymentMethods.filter((m: any) => m.user_id === user.id).map((m: any) => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{ ...btn("gold"), flex: 1 }} onClick={async () => {
                    await confirmPaymentAndBlock(confirmModal.id, user.id, confirmData);
                    setMsg(t(lang, "p_od_confirmed_calendar_locked"));
                    setConfirmModal(null);
                    refresh();
                  }}>{t(lang, "p_od_pm_confirm_and_lock")}</button>
                  <button style={{ ...btn(), flex: 1 }} onClick={() => setConfirmModal(null)}>{t(lang, "p_common_cancel")}</button>
                </div>
              </div>
            </div>
          );
        })()}

        {payModal && (() => {
          const accAmt = parseFloat(accontoAmount) || 0;
          const collabRoom = payModalIsCollab ? collaboratedRooms.find((r: any) => r.id === payModal.room_id) : null;
          const collabProp = collabRoom ? collaboratedProperties.find((p: any) => p.id === collabRoom.property_id) : null;
          const collabOwner = collabProp ? data.users.find((u: any) => u.id === collabProp.owner_id) : null;
          const stornoForOwner = payModalIsCollab ? Math.max(0, accAmt - payModal.concierge_fee) : 0;

          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 500, backdropFilter: "blur(8px)" }} onClick={() => { setPayModal(null); setPayModalIsCollab(false); }}>
              <div style={{ ...card, width: 500, background: C.bg }} onClick={e => e.stopPropagation()}>
                <h3 style={h3Style}>{t(lang, "p_od_pm_deposit_title")}</h3>
                {payModalIsCollab && (
                  <div style={{ fontSize: 11, color: C.info, background: C.info + "11", border: `1px solid ${C.info}33`, borderRadius: 4, padding: "6px 10px", marginBottom: 12 }}>
                    {t(lang, "p_od_pm_collab_banner", { name: collabOwner?.nickname || t(lang, "p_common_owner") })}
                  </div>
                )}
                <p style={{ fontSize: 12, color: C.textDim, marginTop: -4, marginBottom: 20 }}>{t(lang, "p_od_pm_booking_total")} <strong style={{color: C.gold}}>€{payModal.total_price}</strong></p>

                <div style={{ ...card, background: C.surfaceAlt }}>
                  <h4 style={{ ...h3Style, fontSize: 13, marginBottom: 12 }}>{t(lang, "p_od_pm_deposit_details_heading")}</h4>
                  <div style={grid(3)}>
                    <div>
                      <label style={label}>{t(lang, "p_od_pm_amount_label")}</label>
                      <input style={input} type="number" value={accontoAmount} onChange={e => setAccontoAmount(e.target.value)} placeholder="€ 0.00" />
                    </div>
                    <div>
                      <label style={label}>{t(lang, "p_od_pm_date_short")}</label>
                      <input style={input} type="date" value={accontoDate} onChange={e => setAccontoDate(e.target.value)} />
                    </div>
                    <div>
                      <label style={label}>{t(lang, "p_od_pm_collection_method")}</label>
                      <select style={sel} value={accontoMethod} onChange={e => setAccontoMethod(e.target.value)}>
                        <option value="">{t(lang, "p_od_pm_select_placeholder")}</option>
                        {data.userPaymentMethods
                          .filter((m: any) => m.user_id === user.id)
                          .map((m: any) => (
                            <option key={m.id} value={m.name}>{m.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {!payModalIsCollab && accAmt >= payModal.concierge_fee && payModal.concierge_id !== user.id && (
                    <div style={{ marginTop: 15, paddingTop: 15, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim }}>
                       ℹ️ {t(lang, "p_od_pm_storno_incoming_info", { amount: payModal.concierge_fee.toFixed(2) })}
                    </div>
                  )}
                </div>

                <div style={{ ...card, background: C.surfaceAlt, marginTop: 20, borderColor: C.gold + "22" }}>
                  <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>{t(lang, "p_od_pm_your_commission")}</span> <span>€{payModal.concierge_fee}</span></div>
                    {payModalIsCollab ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", color: C.gold }}>
                          <span>{t(lang, "p_od_pm_retained_commission")}</span>
                          <strong>€{Math.min(accAmt, payModal.concierge_fee).toFixed(2)}</strong>
                        </div>
                        {stornoForOwner > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", color: C.info }}>
                            <span>{t(lang, "p_od_pm_transfer_to_owner", { name: collabOwner?.nickname || t(lang, "p_common_owner") })}</span>
                            <strong>€{stornoForOwner.toFixed(2)}</strong>
                          </div>
                        )}
                      </>
                    ) : payModal.concierge_id === user.id ? (
                      <div style={{ display: "flex", justifyContent: "space-between", color: C.success }}>
                        <span>{t(lang, "p_od_pm_retained_direct_owner")}</span>
                        <strong>€{accAmt.toFixed(2)}</strong>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", color: C.gold }}>
                        <span>{t(lang, "p_od_pm_storno_to_pay_concierge")}</span>
                        <strong>€{Math.min(accAmt, payModal.concierge_fee).toFixed(2)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
                  <button style={{ ...btn("gold"), flex: 1 }} onClick={payModalIsCollab ? handleRegisterCollabPayment : handleRegisterPayment}>{t(lang, "p_od_pm_save_deposit")}</button>
                  <button style={{ ...btn(), flex: 1 }} onClick={() => { setPayModal(null); setPayModalIsCollab(false); }}>{t(lang, "p_common_cancel")}</button>
                </div>
              </div>
            </div>
          );
        })()}

        {viewCalendar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 300, backdropFilter: "blur(10px)" }}>
          <div style={{ ...card, width: 500, background: C.bg }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ ...h3Style, margin: 0 }}>{t(lang, "p_od_manage_room")} {allRooms.find((r: any) => r.id === viewCalendar)?.name}</h3>
              <button style={btn()} onClick={() => setViewCalendar(null)}>{t(lang, "p_common_close")}</button>
            </div>
            <CalendarView 
              roomId={viewCalendar} 
              mode="manager" 
              onRefresh={refresh} 
              roomBookings={data.bookings.filter((b: any) => b.room_id === viewCalendar)} 
              users={data.users} 
              allPricing={data.pricing}
              isMobile={isMobile}
              onEditBooking={(b) => {
                setAdjModal(b);
                setLocalAdjs(JSON.parse(b.price_adjustments || "{}"));
              }}
              lang={lang}
            />
          </div>
        </div>
      )}

      {editPricing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 200 }} onClick={() => setEditPricing(null)}>
          <div style={{ ...card, width: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={h3Style}>{t(lang, "p_od_price_month")} {editPricing.month}</h3>
            <div style={{ marginBottom: 12 }}><label style={label}>{t(lang, "p_od_base_label")}{unitSuffix(lang, data.properties.find((p: any) => p.id === allRooms.find((r: any) => r.id === editPricing.roomId)?.property_id)?.asset_type)} (€)</label><input style={input} type="number" value={editPricing.basePrice} onChange={e => setEditPricing({ ...editPricing, basePrice: e.target.value })} /></div>
            {!isVehicleAsset(data.properties.find((p: any) => p.id === allRooms.find((r: any) => r.id === editPricing.roomId)?.property_id)?.asset_type) && (
              <div style={{ marginBottom: 16 }}><label style={label}>{t(lang, "p_od_cleaning_label")}</label><input style={input} type="number" value={editPricing.cleaningFee} onChange={e => setEditPricing({ ...editPricing, cleaningFee: e.target.value })} /></div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn("gold"), flex: 1 }} onClick={handleSavePricing}>{t(lang, "p_common_save")}</button>
              <button style={{ ...btn(), flex: 1 }} onClick={() => setEditPricing(null)}>{t(lang, "p_common_cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {editRoom && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 400, backdropFilter: "blur(5px)" }}>
          <div style={{ ...card, width: isVehicleAsset(editRoom.assetType) ? 420 : 360, maxHeight: "85vh", overflowY: "auto" }}>
            <h3 style={h3Style}>{t(lang, "p_od_edit_room_title")}</h3>
            <div style={{ marginBottom: 12 }}><label style={label}>{t(lang, "p_od_name")}</label><input style={input} value={editRoom.name} onChange={e => setEditRoom({ ...editRoom, name: e.target.value })} /></div>
            <div style={{ marginBottom: 12 }}><label style={label}>{t(lang, "p_od_capacity")}</label><input style={input} type="number" value={editRoom.capacity} onChange={e => setEditRoom({ ...editRoom, capacity: e.target.value })} /></div>
            {isVehicleAsset(editRoom.assetType) ? (
              <CarFieldsForm value={editRoom.carFields} onChange={carFields => setEditRoom({ ...editRoom, carFields })} lang={lang} />
            ) : (
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}><label style={label}>{t(lang, "p_od_bedrooms_label")}</label><input style={input} type="number" value={editRoom.bedrooms} onChange={e => setEditRoom({ ...editRoom, bedrooms: e.target.value })} /></div>
                <div style={{ flex: 1 }}><label style={label}>{t(lang, "p_od_bathrooms_label")}</label><input style={input} type="number" value={editRoom.bathrooms} onChange={e => setEditRoom({ ...editRoom, bathrooms: e.target.value })} /></div>
              </div>
            )}
            <div style={{ marginBottom: 16 }}><label style={label}>{t(lang, "p_od_description")}</label><textarea style={{ ...input, minHeight: 80, resize: "vertical" }} value={editRoom.description} onChange={e => setEditRoom({ ...editRoom, description: e.target.value })} placeholder={t(lang, "p_od_apartment_desc_ph")} /></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn("gold"), flex: 1 }} onClick={handleUpdateRoom}>{t(lang, "p_common_save")}</button>
              <button style={{ ...btn(), flex: 1 }} onClick={() => setEditRoom(null)}>{t(lang, "p_common_cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {addPricing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 450, backdropFilter: "blur(5px)" }}>
          <div style={{ ...card, width: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={h3Style}>{t(lang, "p_od_add_month_to_list")}</h3>
            <div style={{ marginBottom: 12 }}><label style={label}>{t(lang, "p_od_month_label")}</label><input style={input} type="month" value={addPricing.month} onChange={e => setAddPricing({ ...addPricing, month: e.target.value })} /></div>
            <div style={{ marginBottom: 12 }}><label style={label}>{t(lang, "p_od_base_label")}{unitSuffix(lang, data.properties.find((p: any) => p.id === allRooms.find((r: any) => r.id === addPricing.roomId)?.property_id)?.asset_type)} (€)</label><input style={input} type="number" value={addPricing.basePrice} onChange={e => setAddPricing({ ...addPricing, basePrice: e.target.value })} /></div>
            {!isVehicleAsset(data.properties.find((p: any) => p.id === allRooms.find((r: any) => r.id === addPricing.roomId)?.property_id)?.asset_type) && (
              <div style={{ marginBottom: 16 }}><label style={label}>{t(lang, "p_od_cleaning_label")}</label><input style={input} type="number" value={addPricing.cleaningFee} onChange={e => setAddPricing({ ...addPricing, cleaningFee: e.target.value })} /></div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn("gold"), flex: 1 }} onClick={handleAddPricingMonth}>{t(lang, "p_common_add")}</button>
              <button style={{ ...btn(), flex: 1 }} onClick={() => setAddPricing(null)}>{t(lang, "p_common_cancel")}</button>
            </div>
          </div>
        </div>
      )}
      {adjModal && (() => {
          const days: string[] = [];
          let d = new Date(adjModal.start_date + "T00:00:00");
          const end = new Date(adjModal.end_date + "T00:00:00");
          while (d < end) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            days.push(`${y}-${m}-${day}`);
            d.setDate(d.getDate() + 1);
          }

          // Ricalcolo Live per trasparenza utente
          const oldAdjs = JSON.parse(adjModal.price_adjustments || "{}");
          const oldAdjSum = Object.values(oldAdjs).reduce((acc: number, v: any) => acc + (parseFloat(v) || 0), 0);
          const baseStay = adjModal.stay_price_total - oldAdjSum;
          const cleaning = adjModal.cleaning_fee_total;
          const currentFee = parseFloat(localFee) || 0;

          const currentAdjSum = Object.values(localAdjs).reduce((acc: number, v: any) => acc + (parseFloat(v) || 0), 0);
          const liveStay = baseStay + currentAdjSum;
          const liveOwner = liveStay + cleaning;
          const liveTotal = liveOwner + currentFee;
          const nightlyBase = days.length > 0 ? (baseStay / days.length) : 0;
          const nightlyNew = days.length > 0 ? (liveStay / days.length) : 0;

          // Calcolo Storno
          const bPayments = data.payments.filter((p: any) => p.booking_id === adjModal.id);
          const firstPayment = bPayments[0];
          const receiver = firstPayment?.receiver || 'owner';
          const accAmt = bPayments.reduce((acc: number, p: any) => acc + (p.amount || 0), 0);
          
          let stornoLabel = "";
          let stornoVal = 0;
          if (receiver === 'concierge') {
             stornoLabel = t(lang, "p_od_storno_due_to", { name: user?.nickname || 'Silvia' });
             stornoVal = Math.max(0, accAmt - currentFee);
          } else {
             stornoLabel = t(lang, "p_od_storno_due_to_concierge");
             stornoVal = currentFee;
          }

          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 600, backdropFilter: "blur(8px)" }} onClick={() => setAdjModal(null)}>
              <div style={{ ...card, width: 450, background: C.bg, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                <h3 style={h3Style}>{t(lang, "p_od_price_adjustments")}</h3>
                <p style={{ fontSize: 12, color: C.textDim, marginTop: -10, marginBottom: 20 }}>{t(lang, "p_od_adjustments_desc")}</p>

                <label style={label}>{t(lang, "p_od_daily_variations")}</label>
                <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 4, padding: 8, marginBottom: 20 }}>
                  {days.map(date => (
                    <div key={date} style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}44` }}>
                      <div style={{ fontSize: 12 }}>{formatDate(date)}</div>
                      <input 
                        type="number" 
                        style={{ ...input, padding: "4px 8px" }} 
                        placeholder="+/- €" 
                        value={localAdjs[date] || ""} 
                        onChange={e => setLocalAdjs({ ...localAdjs, [date]: e.target.value })} 
                      />
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={label}>{t(lang, "p_od_concierge_commission_label")}</label>
                  <input
                    type="number"
                    style={{ ...input, borderColor: C.gold + "66" }}
                    placeholder={t(lang, "p_cd_your_commission")}
                    value={localFee}
                    onChange={e => setLocalFee(e.target.value)}
                  />
                  <p style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{t(lang, "p_od_edit_commission_hint")}</p>
                </div>

                <div style={{ ...card, background: "rgba(200,169,110,0.05)", borderColor: C.gold + "44" }}>
                  <h4 style={{ ...h3Style, fontSize: 13, marginBottom: 12, color: C.gold }}>{t(lang, "p_od_live_financial_summary")}</h4>
                  <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.textDim }}>{t(lang, "p_od_base_price_x", { unit: unitSuffix(lang, adjModal?.asset_type) })}</span>
                      <strong style={{ color: C.text }}>€{nightlyBase.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.textDim }}>{t(lang, "p_od_final_price_x", { unit: unitSuffix(lang, adjModal?.asset_type) })}</span>
                      <strong style={{ color: C.gold }}>€{nightlyNew.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}44`, paddingTop: 8 }}>
                      <span style={{ color: C.textDim }}>{t(lang, "p_od_stay_paren", { n: days.length, unit: unitLabel(lang, adjModal?.asset_type, days.length) })}</span>
                      <strong style={{ color: C.text }}>€{liveStay.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.textDim }}>{t(lang, "p_od_cleaning_fixed")}</span>
                      <strong style={{ color: C.text }}>€{cleaning.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}44`, paddingTop: 8 }}>
                      <span style={{ color: C.gold, fontWeight: 600 }}>{t(lang, "p_od_total_for", { name: user?.nickname || 'Owner' })}</span>
                      <strong style={{ color: C.gold, fontSize: 14 }}>€{liveOwner.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.textDim }}>{t(lang, "p_od_concierge_fee_label")}:</span>
                      <strong style={{ color: C.text }}>€{currentFee.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}44`, paddingTop: 8, marginTop: 4 }}>
                      <span style={{ color: C.textDim }}>{stornoLabel}</span>
                      <strong style={{ color: C.gold }}>€{stornoVal.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: `2px solid ${C.gold}44`, paddingTop: 10, marginTop: 4 }}>
                      <span style={{ fontWeight: 700, color: C.gold }}>{t(lang, "p_od_total_booking_caps")}</span>
                      <strong style={{ fontSize: 18, color: C.gold }}>€{liveTotal.toFixed(2)}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
                  <button style={{ ...btn("gold"), flex: 1 }} onClick={handleSaveAdjustments}>{t(lang, "p_od_save_and_update")}</button>
                  <button style={{ ...btn(), flex: 1 }} onClick={() => setAdjModal(null)}>{t(lang, "p_common_cancel")}</button>
                </div>
              </div>
            </div>
          );
        })()}
        {tab === "settings" && (
          <div>
            {/* Referral link — owner */}
            <div style={{ ...card, background: C.goldGlow, borderColor: C.borderGold, marginBottom: 16 }}>
              <h3 style={h3Style}>{t(lang, "p_cd_referral_link")}</h3>
              <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 1.7 }}>
                {t(lang, "p_cd_referral_desc")}
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, padding: "12px 16px", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "'DM Sans', monospace", fontSize: 13, color: C.gold, minWidth: 200, wordBreak: "break-all" }}>
                  {typeof window !== "undefined" ? `${window.location.origin}?ref=${user.nickname}` : `https://auraibiza.com?ref=${user.nickname}`}
                </div>
                <button style={btn("gold")} onClick={() => {
                  const url = `${window.location.origin}?ref=${user.nickname}`;
                  navigator.clipboard.writeText(url).then(() => setMsg(t(lang, "p_cd_link_copied")));
                }}>{t(lang, "p_cd_copy_link")}</button>
              </div>
            </div>

            <div style={card}>
              <h2 style={h2Style}>{t(lang, "p_cd_payment_methods_settings")}</h2>
              <p style={{ color: C.textDim, fontSize: 13, marginBottom: 20 }}>{t(lang, "p_cd_payment_methods_desc")}</p>
              <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                <input style={{ ...input, flex: 1 }} value={newMethodName} onChange={e => setNewMethodName(e.target.value)} placeholder={t(lang, "p_cd_add_method_ph")} />
                <button style={btn("gold")} onClick={async () => {
                  if (!newMethodName.trim()) return;
                  await addPaymentMethod(user.id, newMethodName);
                  setNewMethodName("");
                  refresh();
                }}>{t(lang, "p_common_add")}</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {data.userPaymentMethods.filter((m: any) => m.user_id === user.id).map((m: any) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.surfaceAlt, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <span style={{ fontWeight: 600 }}>{m.name}</span>
                    <button style={{ ...btn(), color: C.danger, padding: "2px 8px" }} onClick={() => setConfirmingDeleteMethod(m.id)}>{t(lang, "p_common_delete")}</button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
        {viewNotes && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, backdropFilter: "blur(8px)" }} onClick={() => setViewNotes(null)}>
            <div style={{ ...card, width: 400, background: C.bg }} onClick={e => e.stopPropagation()}>
              <h3 style={h3Style}>📝 Note Prenotazione</h3>
              <div style={{ background: C.surfaceAlt, padding: 16, borderRadius: 8, fontSize: 13, color: C.text, whiteSpace: "pre-wrap", minHeight: 100, border: `1px solid ${C.border}` }}>
                {viewNotes}
              </div>
              <button style={{ ...btn(), width: "100%", marginTop: 20 }} onClick={() => setViewNotes(null)}>{t(lang, "p_common_close")}</button>
            </div>
          </div>
        )}
        {deleteBookingId && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100, backdropFilter: "blur(8px)" }}>
            <div style={{ ...card, width: 320, textAlign: "center", animation: "modalIn 0.2s ease-out" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
              <h3 style={{ ...h3Style, marginBottom: 8 }}>{t(lang, "p_cd_confirm_delete_title")}</h3>
              <p style={{ color: C.textDim, fontSize: 13, marginBottom: 24 }}>{t(lang, "p_od_confirm_delete_booking_desc2")}</p>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...btn(), flex: 1 }} onClick={() => setDeleteBookingId(null)}>{t(lang, "p_common_cancel")}</button>
                <button style={{ ...btn(C.danger), flex: 1 }} onClick={() => performDeleteBooking(deleteBookingId)}>{t(lang, "p_common_delete")}</button>
              </div>
            </div>
          </div>
        )}
        {confirmingDeleteMethod && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1200, backdropFilter: "blur(8px)" }} onClick={() => setConfirmingDeleteMethod(null)}>
            <div style={{ ...card, width: 350, background: C.bg, textAlign: "center" }} onClick={e => e.stopPropagation()}>
              <h3 style={h3Style}>{t(lang, "p_cd_confirm_delete_method_title")}</h3>
              <p style={{ fontSize: 14, color: C.textDim, marginBottom: 24 }}>{t(lang, "p_cd_confirm_delete_method_desc")}</p>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...btn(), flex: 1 }} onClick={() => setConfirmingDeleteMethod(null)}>{t(lang, "p_common_cancel")}</button>
                <button style={{ ...btn(), background: C.danger, color: "#fff", flex: 1, border: "none" }} onClick={async () => {
                  if (confirmingDeleteMethod) {
                    await deletePaymentMethod(confirmingDeleteMethod);
                    setConfirmingDeleteMethod(null);
                    refresh();
                  }
                }}>{t(lang, "p_common_delete")}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- ADMIN DASHBOARD ---
function AdminDashboard({ user, data, refresh, lang }: { user: User; data: any; refresh: () => void; lang: Lang }) {
  const [tab, setTab] = useState("users");
  const [msg, setMsg] = useState("");
  const [commRates, setCommRates] = useState<Record<string, string>>({});

  // Platform commissions state
  const [platComms, setPlatComms] = useState<any[]>([]);
  const [newCommOwnerId, setNewCommOwnerId] = useState<string>("__global__");
  const [newCommAssetType, setNewCommAssetType] = useState<string>("__all__");
  const [newCommRate, setNewCommRate] = useState("10");

  // Booking requests state
  const [bookingReqs, setBookingReqs] = useState<any[]>([]);
  const [reqFilter, setReqFilter] = useState("all");

  useEffect(() => {
    if (tab === "platform") {
      getPlatformCommissions().then(setPlatComms);
      getBookingRequests().then(setBookingReqs);
    }
    if (tab === "requests") {
      getBookingRequests().then(setBookingReqs);
    }
  }, [tab]);

  const allUsers: User[] = data.users || [];
  const pendingUsers: User[] = data.pendingUsers || [];
  const commissionRules: any[] = data.commissionRules || [];

  // Prenotazioni: visibilità/editing totale per l'admin
  const [bkSearch, setBkSearch] = useState("");
  const [bkStatus, setBkStatus] = useState("");
  const [bkRoom, setBkRoom] = useState("");
  const [bkYear, setBkYear] = useState("");
  const [bkMonth, setBkMonth] = useState("");
  const allBookings: any[] = data.bookings || [];
  const filteredBookings = useMemo(() => {
    return allBookings.filter((b: any) => {
      const matchSearch = bkSearch ? (b.client_name + " " + (b.client_surname || "")).toLowerCase().includes(bkSearch.toLowerCase()) : true;
      const matchStatus = bkStatus ? b.status === bkStatus : true;
      const matchRoom = bkRoom ? b.room_id === bkRoom : true;
      const matchYear = bkYear ? b.start_date.startsWith(bkYear) : true;
      const matchMonth = bkMonth ? b.start_date.slice(5, 7) === bkMonth : true;
      return matchSearch && matchStatus && matchRoom && matchYear && matchMonth;
    }).sort((a: any, b: any) => b.start_date.localeCompare(a.start_date));
  }, [allBookings, bkSearch, bkStatus, bkRoom, bkYear, bkMonth]);

  const handleAdminStatusChange = async (id: string, status: string) => {
    await updateBookingStatus(id, status);
    setMsg(t(lang, "p_ad_status_updated"));
    refresh();
  };
  const handleAdminDeleteBooking = async (id: string) => {
    if (!confirm(t(lang, "p_ad_confirm_delete_booking"))) return;
    await deleteBookingAction(id);
    setMsg(t(lang, "p_cd_booking_deleted"));
    refresh();
  };

  // Gestione asset (tutte le proprietà, non solo quelle dell'admin): editing
  // completo di residenze/barche/auto da un'unica vista trasversale.
  const [assetMgmtTab, setAssetMgmtTab] = useState("residenze");
  const [assetSearch, setAssetSearch] = useState("");
  const [editAsset, setEditAsset] = useState<{ id: string; name: string; location: string; description: string; asset_type: string } | null>(null);
  const [editAssetRoom, setEditAssetRoom] = useState<{ id: string; name: string; capacity: string; description: string; bedrooms: string; bathrooms: string; assetType: string; carFields: CarFieldsValue } | null>(null);
  const [editAssetPricing, setEditAssetPricing] = useState<{ roomId: string; month: string; basePrice: string; cleaningFee: string; assetType: string } | null>(null);
  const allProperties: any[] = data.properties || [];
  const allRoomsForAssets: any[] = data.rooms || [];
  const allPricingForAssets: any[] = data.pricing || [];
  const assetCatCounts = Object.fromEntries(ASSET_CATEGORIES.map(cat => [
    cat.key, cat.types.length === 0 ? allProperties.length : allProperties.filter((p: any) => cat.types.includes(p.asset_type || "apartment")).length,
  ]));
  const currentAssetMgmtCat = ASSET_CATEGORIES.find(c => c.key === assetMgmtTab) || ASSET_CATEGORIES[0];
  const filteredAssets = allProperties.filter((p: any) => {
    if (currentAssetMgmtCat.types.length > 0 && !currentAssetMgmtCat.types.includes(p.asset_type || "apartment")) return false;
    if (assetSearch.trim() && !p.name.toLowerCase().includes(assetSearch.toLowerCase()) && !(p.location || "").toLowerCase().includes(assetSearch.toLowerCase())) return false;
    return true;
  });

  // Il payload del dashboard ora contiene solo la cover_image (fix perf.):
  // carichiamo la galleria completa on-demand per le proprietà mostrate in Gestisci Asset.
  const [assetGalleryMap, setAssetGalleryMap] = useState<Record<string, string>>({});
  const refreshAssetGallery = async (propId: string) => {
    const g = await getPropertyGallery(propId);
    if (g.image) setAssetGalleryMap(prev => ({ ...prev, [propId]: g.image as string }));
  };
  useEffect(() => {
    if (tab !== "manageassets") return;
    filteredAssets.forEach((prop: any) => {
      if (!assetGalleryMap[prop.id]) refreshAssetGallery(prop.id);
    });
  }, [tab, filteredAssets.map((p: any) => p.id).join(",")]);

  const handleAssetImageUpload = async (propId: string, file: File) => {
    if (file.size > 20 * 1024 * 1024) { alert(t(lang, "p_ad_file_too_large_20mb", { file: file.name })); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      const compressed = file.size > 1024 * 1024 ? await compressImage(base64) : base64;
      await updatePropertyImage(propId, compressed);
      await refreshAssetGallery(propId);
      refresh();
    };
    reader.readAsDataURL(file);
  };
  const handleAssetPdfUpload = async (propId: string, file: File) => {
    if (file.type !== "application/pdf") { alert(t(lang, "p_ad_file_must_be_pdf")); return; }
    if (file.size > 10 * 1024 * 1024) { alert(t(lang, "p_ad_pdf_too_large_10mb")); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      await updatePropertyPdf(propId, e.target?.result as string, file.name);
      refresh();
    };
    reader.readAsDataURL(file);
  };

  const handleApprove = async (userId: string) => {
    await approveUser(userId);
    setMsg(t(lang, "p_ad_user_approved"));
    refresh();
  };
  const handleReject = async (userId: string) => {
    if (!confirm(t(lang, "p_ad_confirm_reject_user"))) return;
    await rejectUser(userId);
    setMsg(t(lang, "p_ad_user_rejected"));
    refresh();
  };
  const handleRoleChange = async (userId: string, newRole: string) => {
    await updateUserRole(userId, newRole);
    setMsg(t(lang, "p_ad_role_updated"));
    refresh();
  };
  const handleDeleteUser = async (userId: string, nick: string) => {
    if (!confirm(t(lang, "p_ad_confirm_delete_user", { nick }))) return;
    await deleteUserAction(userId);
    setMsg(t(lang, "p_ad_user_deleted", { nick }));
    refresh();
  };
  const handleSaveCommission = async (userId: string) => {
    const rate = parseFloat(commRates[userId] || "0");
    if (isNaN(rate) || rate < 0 || rate > 100) { setMsg(t(lang, "p_ad_invalid_percentage_range")); return; }
    await setCommissionRule(userId, rate, 'percentage');
    setMsg(t(lang, "p_ad_commission_rule_saved"));
    refresh();
  };

  // Add-asset form state
  const [naOwnerMode, setNaOwnerMode] = useState<"existing" | "new">("existing");
  const [naOwnerId, setNaOwnerId] = useState("");
  const [naNewNick, setNaNewNick] = useState("");
  const [naNewRole, setNaNewRole] = useState<"owner" | "concierge">("owner");
  const [naConciergeNick, setNaConciergeNick] = useState("");
  const [naAssetType, setNaAssetType] = useState("villa");
  const [naName, setNaName] = useState("");
  const [naLoc, setNaLoc] = useState("");
  const [naDesc, setNaDesc] = useState("");
  const [naCapacity, setNaCapacity] = useState("2");
  const [naCarFields, setNaCarFields] = useState<CarFieldsValue>(emptyCarFields);
  const [naImages, setNaImages] = useState<string[]>([]);
  const [naPdf, setNaPdf] = useState<{ base64: string; name: string } | null>(null);
  const [naPricingMode, setNaPricingMode] = useState<"seasonal" | "monthly">("seasonal");
  const [naPriceLow, setNaPriceLow] = useState("");
  const [naPriceMid, setNaPriceMid] = useState("");
  const [naPriceHigh, setNaPriceHigh] = useState("");
  const [naMonthlyPrices, setNaMonthlyPrices] = useState<string[]>(Array(12).fill(""));
  const [naCleaningFee, setNaCleaningFee] = useState("0");
  const [naSubmitting, setNaSubmitting] = useState(false);

  const handleNaImageFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) { alert(t(lang, "p_ad_file_too_large_20mb", { file: file.name })); continue; }
      const base64: string = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      const compressed = file.size > 1024 * 1024 ? await compressImage(base64) : base64;
      setNaImages(prev => [...prev, compressed]);
    }
  };

  const handleNaPdfFile = (file: File) => {
    if (file.type !== "application/pdf") { alert(t(lang, "p_ad_file_must_be_pdf")); return; }
    if (file.size > 10 * 1024 * 1024) { alert(t(lang, "p_ad_pdf_too_large_10mb")); return; }
    const reader = new FileReader();
    reader.onload = (e) => setNaPdf({ base64: e.target?.result as string, name: file.name });
    reader.readAsDataURL(file);
  };

  const handleAddAsset = async () => {
    if (!naName.trim() || !naLoc.trim()) { alert(t(lang, "p_ad_enter_name_location")); return; }
    if (naOwnerMode === "existing" && !naOwnerId) { alert(t(lang, "p_ad_select_owner")); return; }
    if (naOwnerMode === "new" && !naNewNick.trim()) { alert(t(lang, "p_ad_enter_new_owner_nick")); return; }
    const low = parseFloat(naPriceLow || "0") || 0;
    const mid = naPriceMid ? (parseFloat(naPriceMid) || low) : low;
    const high = naPriceHigh ? (parseFloat(naPriceHigh) || low) : low;
    const cleaning = parseFloat(naCleaningFee || "0") || 0;

    setNaSubmitting(true);
    try {
      let ownerId = naOwnerId;
      if (naOwnerMode === "new") {
        const res = await createManagedUser(naNewNick, naNewRole);
        if (!res.success || !res.id) { alert(t(lang, "p_ad_error_creating_owner", { error: (res as any).error })); return; }
        ownerId = res.id;
      }
      const propId = await addProperty(ownerId, naName, naLoc, naDesc, naAssetType);
      if (!propId) { alert(t(lang, "p_ad_error_creating_asset")); return; }

      const naCarFieldsPayload = isVehicleAsset(naAssetType) ? {
        carModel: naCarFields.carModel, carCategory: naCarFields.carCategory,
        airportDelivery: naCarFields.airportDelivery,
        securityDeposit: naCarFields.securityDeposit ? Number(naCarFields.securityDeposit) : undefined,
        kaskoIncluded: naCarFields.kaskoIncluded,
        deductibleAmount: naCarFields.deductibleAmount ? Number(naCarFields.deductibleAmount) : undefined,
        documentsRequired: naCarFields.documentsRequired,
      } : undefined;
      const roomId = await addRoomWithPricing(propId, naName, Number(naCapacity) || 1, naDesc, naCarFieldsPayload);
      if (roomId) {
        const now = new Date();
        const monthly: { month: string; basePrice: number; cleaningFee: number }[] = [];
        for (let i = 0; i < 12; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
          const mm = d.getMonth() + 1;
          const price = naPricingMode === "monthly"
            ? (parseFloat(naMonthlyPrices[i] || "0") || 0)
            : (mm === 7 || mm === 8) ? high : (mm === 6 || mm === 9) ? mid : low;
          monthly.push({ month: `${d.getFullYear()}-${String(mm).padStart(2, "0")}`, basePrice: price, cleaningFee: cleaning });
        }
        await bulkSetRoomPricing(roomId, monthly);
      }

      for (const img of naImages) await updatePropertyImage(propId, img);
      if (naPdf) await updatePropertyPdf(propId, naPdf.base64, naPdf.name);
      if (naConciergeNick.trim()) await addCollaboration(propId, naConciergeNick.trim());

      setNaName(""); setNaLoc(""); setNaDesc(""); setNaImages([]); setNaPdf(null);
      setNaPriceLow(""); setNaPriceMid(""); setNaPriceHigh(""); setNaMonthlyPrices(Array(12).fill("")); setNaCleaningFee("0");
      setNaConciergeNick(""); setNaOwnerId(""); setNaNewNick(""); setNaCarFields(emptyCarFields);
      setMsg(t(lang, "p_ad_asset_created"));
      refresh();
    } finally {
      setNaSubmitting(false);
    }
  };

  const roleIcon = (r: string) => ({ admin: "👑", owner: "🏠", concierge: "🤵", agent: "👤" }[r] || "👤");
  const totalBookings = (data.bookings || []).length;
  const confirmedBookings = (data.bookings || []).filter((b: any) => b.status === "confirmed_owner" || b.status === "evaso").length;
  const totalRevenue = (data.bookings || []).filter((b: any) => ["confirmed_owner","evaso"].includes(b.status)).reduce((s: number, b: any) => s + b.total_price, 0);

  return (
    <div>
      <div style={nav}>
        {[
          { key: "users", l: t(lang, "p_nav_users") },
          { key: "pending", l: `${t(lang, "p_ad_nav_pending")}${pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ""}` },
          { key: "addasset", l: t(lang, "p_nav_addasset") },
          { key: "manageassets", l: `🏠 ${t(lang, "p_nav_manageassets")} (${allProperties.length})` },
          { key: "bookings", l: `${t(lang, "p_ad_nav_bookings")} (${allBookings.length})` },
          { key: "requests", l: t(lang, "p_ad_nav_requests") },
          { key: "platform", l: t(lang, "p_ad_nav_commissions") },
          { key: "commissions", l: t(lang, "p_ad_nav_concierge_fees") },
          { key: "overview", l: t(lang, "p_ad_nav_overview") },
        ].map(nv => (
          <div key={nv.key} style={navItem(tab === nv.key)} onClick={() => setTab(nv.key)}>{nv.l}</div>
        ))}
      </div>
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        {msg && <div style={{ ...card, background: msg.startsWith("⚠") ? C.warning + "15" : C.success + "15", borderColor: msg.startsWith("⚠") ? C.warning + "44" : C.success + "44", fontSize: 12, color: msg.startsWith("⚠") ? C.warning : C.success }}>{msg} <span style={{ float: "right", cursor: "pointer" }} onClick={() => setMsg("")}>✕</span></div>}

        {tab === "pending" && (
          <div>
            <h2 style={h2Style}>{t(lang, "p_ad_pending_registrations")}</h2>
            {pendingUsers.length === 0 ? (
              <div style={{ ...card, textAlign: "center", color: C.textDim }}>{t(lang, "p_ad_no_pending_registrations")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {pendingUsers.map((u: any) => (
                  <div key={u.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: `4px solid ${C.warning}`, gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                      <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden", border: `2px solid ${C.warning}55`, flexShrink: 0, background: C.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                        {u.avatar ? <img src={u.avatar} alt={u.nickname} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : roleIcon(u.role)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: C.gold, fontSize: 15 }}>{u.nickname}</div>
                        {(u.first_name || u.last_name) && <div style={{ fontSize: 12, color: C.text }}>{[u.first_name, u.last_name].filter(Boolean).join(" ")}</div>}
                        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{t(lang, "p_ad_role_colon")} <span style={{ color: C.text }}>{roleIcon(u.role)} {u.role}</span></div>
                        {u.email && <div style={{ fontSize: 11, color: C.textDim }}>{u.email}</div>}
                        {u.phone && <div style={{ fontSize: 11, color: C.textDim }}>{u.phone}</div>}
                        <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{t(lang, "p_ad_registered_on")} {new Date(u.created_at).toLocaleDateString("it-IT")}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select style={{ ...sel, width: 130, padding: "4px 8px", fontSize: 11 }} defaultValue={u.role} onChange={e => updateUserRole(u.id, e.target.value)}>
                        {["owner", "concierge", "agent"].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button style={{ ...btn("gold"), fontSize: 11 }} onClick={() => handleApprove(u.id)}>{t(lang, "p_ad_approve")}</button>
                      <button style={{ ...btn(), fontSize: 11, color: C.danger, borderColor: C.danger + "44" }} onClick={() => handleReject(u.id)}>{t(lang, "p_ad_reject")}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "bookings" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ ...h2Style, margin: 0 }}>{t(lang, "p_ad_bookings_all_properties")}</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input placeholder={t(lang, "p_cd_search_client")} style={{ ...input, width: 180, padding: "6px 12px" }} value={bkSearch} onChange={e => setBkSearch(e.target.value)} />
                <select style={{ ...sel, width: 140, padding: "6px 12px" }} value={bkStatus} onChange={e => setBkStatus(e.target.value)}>
                  <option value="">{t(lang, "p_filter_all_statuses")}</option>
                  {Object.entries(statusMap(lang)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select style={{ ...sel, width: 160, padding: "6px 12px" }} value={bkRoom} onChange={e => setBkRoom(e.target.value)}>
                  <option value="">{t(lang, "p_filter_all_rooms")}</option>
                  {(data.rooms || []).map((r: any) => {
                    const p = (data.properties || []).find((prop: any) => prop.id === r.property_id);
                    return <option key={r.id} value={r.id}>{p ? `${p.name} - ` : ""}{r.name}</option>;
                  })}
                </select>
                <select style={{ ...sel, width: 90, padding: "6px 12px" }} value={bkYear} onChange={e => setBkYear(e.target.value)}>
                  <option value="">{t(lang, "p_filter_year")}</option>
                  {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                <select style={{ ...sel, width: 110, padding: "6px 12px" }} value={bkMonth} onChange={e => setBkMonth(e.target.value)}>
                  <option value="">{t(lang, "p_filter_month")}</option>
                  {monthsList(lang).map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
            </div>

            {filteredBookings.length === 0 ? <div style={{ ...card, textAlign: "center", color: C.textDim }}>{t(lang, "p_no_bookings_found")}</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {[t(lang, "p_common_client"), t(lang, "p_ad_th_property_unit"), t(lang, "p_th_dates"), t(lang, "p_common_owner"), t(lang, "p_ad_th_concierge_agent"), t(lang, "p_common_total"), t(lang, "p_common_status"), t(lang, "p_common_actions")].map(h => (
                        <th key={h} style={{ ...th, fontSize: 9 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>{filteredBookings.map((b: any) => {
                    const room = (data.rooms || []).find((r: any) => r.id === b.room_id);
                    const prop = (data.properties || []).find((p: any) => p.id === room?.property_id);
                    const owner = (data.users || []).find((u: any) => u.id === prop?.owner_id);
                    const concierge = (data.users || []).find((u: any) => u.id === b.concierge_id);
                    const st = statusMap(lang)[b.status] || { label: b.status, color: C.textDim };
                    return (
                      <tr key={b.id}>
                        <td style={td}>{b.client_name} {b.client_surname}</td>
                        <td style={td}>
                          <span style={{ fontSize: 10 }}>{prop ? `${prop.name} - ` : ""}{room?.name}</span>
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {formatDate(b.start_date)} → {formatDate(b.end_date)}
                          <div style={{ fontSize: 9, color: C.textDim }}>({getDaysBetween(b.start_date, b.end_date)} {unitLabel(lang, b.asset_type, getDaysBetween(b.start_date, b.end_date))})</div>
                        </td>
                        <td style={{ ...td, fontSize: 10 }}>{owner?.nickname || "—"}</td>
                        <td style={{ ...td, fontSize: 10 }}>{concierge?.nickname || "—"}</td>
                        <td style={{ ...td, fontWeight: 700 }}>€{b.total_price}</td>
                        <td style={td}>
                          <select style={{ ...sel, fontSize: 10, padding: "4px 8px", width: 130 }} value={b.status} onChange={e => handleAdminStatusChange(b.id, e.target.value)}>
                            {Object.entries(statusMap(lang)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </td>
                        <td style={td}>
                          <button style={{ ...btn(), fontSize: 10, padding: "4px 10px", color: C.danger, borderColor: C.danger + "44" }} onClick={() => handleAdminDeleteBooking(b.id)}>{t(lang, "p_common_delete")}</button>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "manageassets" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ ...h2Style, margin: 0 }}>{t(lang, "p_ad_manage_assets_all")}</h2>
              <input placeholder={t(lang, "p_ad_search_name_zone")} style={{ ...input, width: 220, padding: "6px 12px" }} value={assetSearch} onChange={e => setAssetSearch(e.target.value)} />
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {ASSET_CATEGORIES.map(cat => (
                <div key={cat.key} onClick={() => setAssetMgmtTab(cat.key)} style={{
                  padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600,
                  border: assetMgmtTab === cat.key ? `1px solid ${C.borderGold}` : `1px solid ${C.border}`,
                  background: assetMgmtTab === cat.key ? C.goldGlow : "rgba(255,255,255,0.03)",
                  color: assetMgmtTab === cat.key ? C.gold : C.textMuted,
                }}>
                  {cat.icon} {cat.label} <span style={badge(C.textDim)}>{assetCatCounts[cat.key]}</span>
                </div>
              ))}
            </div>

            {filteredAssets.length === 0 ? (
              <div style={{ ...card, textAlign: "center", color: C.textDim }}>{t(lang, "p_ad_no_assets_found")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {filteredAssets.map((prop: any) => {
                  const propRooms = allRoomsForAssets.filter((r: any) => r.property_id === prop.id);
                  const images = parseImages(assetGalleryMap[prop.id] || prop.image);
                  const owner = allUsers.find((u: any) => u.id === prop.owner_id);
                  return (
                    <div key={prop.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                          <div style={{ width: 90, height: 70, borderRadius: 8, overflow: "hidden", background: C.surfaceAlt, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {images[0] ? <img src={images[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 24, opacity: 0.4 }}>{assetLabel(prop.asset_type).split(" ")[0]}</span>}
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <strong style={{ fontSize: 16, color: C.goldLight }}>{prop.name}</strong>
                              <span style={badge(C.goldDark)}>{assetLabel(prop.asset_type)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: C.textMuted }}>📍 {prop.location}</div>
                            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{t(lang, "p_ad_owner_units_photos", { owner: owner?.nickname || "—", units: propRooms.length, photos: images.length })}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button style={{ ...btn(), padding: "6px 12px", fontSize: 11 }} onClick={() => setEditAsset({ id: prop.id, name: prop.name, location: prop.location, description: prop.description || "", asset_type: prop.asset_type || "apartment" })}>✏️ {t(lang, "p_common_edit")}</button>
                          <button
                            title={prop.is_public === 0 ? t(lang, "p_od_hidden_from_showcase") : t(lang, "p_od_visible_in_showcase")}
                            onClick={async () => { await togglePropertyPublic(prop.id, prop.is_public === 0); refresh(); }}
                            style={{ ...btn(), padding: "6px 12px", fontSize: 11, color: prop.is_public === 0 ? C.textDim : C.success }}>
                            {prop.is_public === 0 ? `🔒 ${t(lang, "p_od_hidden")}` : `🌐 ${t(lang, "p_od_in_showcase")}`}
                          </button>
                          <button style={{ ...btn(), padding: "6px 10px", fontSize: 13, borderColor: C.danger + "55", color: C.danger }} title={t(lang, "p_od_delete_property_title")}
                            onClick={async () => { if (confirm(t(lang, "p_od_confirm_delete_property", { name: prop.name }))) { await deletePropertyAction(prop.id); refresh(); } }}>🗑</button>
                        </div>
                      </div>

                      {/* Galleria foto */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {images.map((img, idx) => (
                          <div key={idx} style={{ position: "relative", width: 64, height: 64, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
                            <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <button onClick={async () => { if (confirm(t(lang, "p_od_delete_photo_confirm"))) { await removePropertyImage(prop.id, idx); await refreshAssetGallery(prop.id); refresh(); } }}
                              style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", color: "#FF4D4D", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 9 }}>✕</button>
                          </div>
                        ))}
                        <label style={{ width: 64, height: 64, borderRadius: 6, border: `2px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.textMuted, fontSize: 18 }}>
                          +
                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleAssetImageUpload(prop.id, f); }} />
                        </label>
                      </div>

                      {/* PDF */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {prop.pdf_name ? (
                          <>
                            <span style={{ fontSize: 12, color: C.gold }}>📄 {prop.pdf_name}</span>
                            <button onClick={async () => { if (confirm(t(lang, "p_od_remove_pdf_confirm"))) { await removePropertyPdf(prop.id); refresh(); } }} style={{ ...btn(), padding: "3px 10px", fontSize: 10, color: C.danger, borderColor: C.danger + "55" }}>{t(lang, "p_common_remove")}</button>
                          </>
                        ) : (
                          <label style={{ ...btn(), padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>
                            {t(lang, "p_od_upload_pdf")}
                            <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleAssetPdfUpload(prop.id, f); }} />
                          </label>
                        )}
                      </div>

                      {/* Unità / prezzi */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {propRooms.map((room: any) => {
                          const roomPricing = allPricingForAssets.filter((p: any) => p.room_id === room.id).sort((a: any, b: any) => a.month.localeCompare(b.month));
                          const current = roomPricing[0];
                          return (
                            <div key={room.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: C.surfaceAlt, borderRadius: 6, flexWrap: "wrap", gap: 8 }}>
                              <div style={{ fontSize: 12 }}>
                                <strong style={{ color: C.text }}>{room.name}</strong>
                                <span style={{ color: C.textDim, marginLeft: 8 }}>{room.capacity} {t(lang, "guests")}{room.bedrooms ? ` · ${room.bedrooms} ${t(lang, "bedrooms")}` : ""}{room.bathrooms ? ` · ${room.bathrooms} ${t(lang, "bathrooms")}` : ""}</span>
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                {current && <span style={{ fontSize: 12, color: C.gold }}>€{current.base_price}{unitSuffix(lang, prop.asset_type)}</span>}
                                <button style={{ ...btn(), padding: "3px 10px", fontSize: 10 }} onClick={() => setEditAssetRoom({
                                  id: room.id, name: room.name, capacity: String(room.capacity), description: room.description || "",
                                  bedrooms: room.bedrooms != null ? String(room.bedrooms) : "", bathrooms: room.bathrooms != null ? String(room.bathrooms) : "",
                                  assetType: prop.asset_type,
                                  carFields: {
                                    carModel: room.car_model || "", carCategory: room.car_category || "compact",
                                    airportDelivery: !!room.airport_delivery,
                                    securityDeposit: room.security_deposit != null ? String(room.security_deposit) : "",
                                    kaskoIncluded: !!room.kasko_included,
                                    deductibleAmount: room.deductible_amount != null ? String(room.deductible_amount) : "",
                                    documentsRequired: room.documents_required || "",
                                  },
                                })}>{t(lang, "p_ad_edit_unit_btn")}</button>
                                {current && <button style={{ ...btn(), padding: "3px 10px", fontSize: 10 }} onClick={() => setEditAssetPricing({ roomId: room.id, month: current.month, basePrice: String(current.base_price), cleaningFee: String(current.cleaning_fee), assetType: prop.asset_type })}>{t(lang, "p_ad_edit_price_btn")}</button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Modale modifica proprietà */}
            {editAsset && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }} onClick={() => setEditAsset(null)}>
                <div style={{ ...card, width: 440, maxWidth: "92vw" }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ ...h2Style, fontSize: 18, marginBottom: 16 }}>{t(lang, "p_od_edit_property_title")}</h3>
                  <div style={{ marginBottom: 12 }}><label style={label}>{t(lang, "p_od_name")}</label><input style={input} value={editAsset.name} onChange={e => setEditAsset({ ...editAsset, name: e.target.value })} /></div>
                  <div style={{ marginBottom: 12 }}><label style={label}>{t(lang, "p_od_location_label")}</label><input style={input} value={editAsset.location} onChange={e => setEditAsset({ ...editAsset, location: e.target.value })} /></div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={label}>{t(lang, "p_ad_asset_type_label")}</label>
                    <select style={sel} value={editAsset.asset_type} onChange={e => setEditAsset({ ...editAsset, asset_type: e.target.value })}>
                      {ASSET_TYPES.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 16 }}><label style={label}>{t(lang, "p_od_description")}</label><textarea style={{ ...input, minHeight: 100 }} value={editAsset.description} onChange={e => setEditAsset({ ...editAsset, description: e.target.value })} /></div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={{ ...btn("gold"), flex: 1 }} onClick={async () => {
                      await updatePropertyAction(editAsset.id, editAsset.name, editAsset.location, editAsset.description);
                      await updatePropertyAssetType(editAsset.id, editAsset.asset_type);
                      setEditAsset(null); setMsg(t(lang, "p_od_property_updated")); refresh();
                    }}>{t(lang, "p_common_save")}</button>
                    <button style={{ ...btn(), flex: 1 }} onClick={() => setEditAsset(null)}>{t(lang, "p_common_cancel")}</button>
                  </div>
                </div>
              </div>
            )}

            {/* Modale modifica unità */}
            {editAssetRoom && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }} onClick={() => setEditAssetRoom(null)}>
                <div style={{ ...card, width: isVehicleAsset(editAssetRoom.assetType) ? 440 : 400, maxWidth: "92vw", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ ...h2Style, fontSize: 18, marginBottom: 16 }}>{t(lang, "p_ad_edit_unit_title")}</h3>
                  <div style={{ marginBottom: 12 }}><label style={label}>{t(lang, "p_od_name")}</label><input style={input} value={editAssetRoom.name} onChange={e => setEditAssetRoom({ ...editAssetRoom, name: e.target.value })} /></div>
                  <div style={{ marginBottom: 12 }}><label style={label}>{t(lang, "p_ad_capacity_guests_label")}</label><input style={input} type="number" value={editAssetRoom.capacity} onChange={e => setEditAssetRoom({ ...editAssetRoom, capacity: e.target.value })} /></div>
                  {isVehicleAsset(editAssetRoom.assetType) ? (
                    <CarFieldsForm value={editAssetRoom.carFields} onChange={carFields => setEditAssetRoom({ ...editAssetRoom, carFields })} lang={lang} />
                  ) : (
                    <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}><label style={label}>{t(lang, "p_od_bedrooms_label")}</label><input style={input} type="number" value={editAssetRoom.bedrooms} onChange={e => setEditAssetRoom({ ...editAssetRoom, bedrooms: e.target.value })} /></div>
                      <div style={{ flex: 1 }}><label style={label}>{t(lang, "p_od_bathrooms_label")}</label><input style={input} type="number" value={editAssetRoom.bathrooms} onChange={e => setEditAssetRoom({ ...editAssetRoom, bathrooms: e.target.value })} /></div>
                    </div>
                  )}
                  <div style={{ marginBottom: 16 }}><label style={label}>{t(lang, "p_od_description")}</label><textarea style={{ ...input, minHeight: 80 }} value={editAssetRoom.description} onChange={e => setEditAssetRoom({ ...editAssetRoom, description: e.target.value })} /></div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={{ ...btn("gold"), flex: 1 }} onClick={async () => {
                      const isVehicle = isVehicleAsset(editAssetRoom.assetType);
                      await updateRoomAction(editAssetRoom.id, {
                        name: editAssetRoom.name, capacity: Number(editAssetRoom.capacity), description: editAssetRoom.description,
                        bedrooms: !isVehicle && editAssetRoom.bedrooms ? Number(editAssetRoom.bedrooms) : null,
                        bathrooms: !isVehicle && editAssetRoom.bathrooms ? Number(editAssetRoom.bathrooms) : null,
                        carModel: isVehicle ? editAssetRoom.carFields.carModel : null,
                        carCategory: isVehicle ? editAssetRoom.carFields.carCategory : null,
                        airportDelivery: isVehicle ? editAssetRoom.carFields.airportDelivery : false,
                        securityDeposit: isVehicle && editAssetRoom.carFields.securityDeposit ? Number(editAssetRoom.carFields.securityDeposit) : null,
                        kaskoIncluded: isVehicle ? editAssetRoom.carFields.kaskoIncluded : false,
                        deductibleAmount: isVehicle && editAssetRoom.carFields.deductibleAmount ? Number(editAssetRoom.carFields.deductibleAmount) : null,
                        documentsRequired: isVehicle ? editAssetRoom.carFields.documentsRequired : null,
                      });
                      setEditAssetRoom(null); setMsg(t(lang, "p_ad_unit_updated")); refresh();
                    }}>{t(lang, "p_common_save")}</button>
                    <button style={{ ...btn(), flex: 1 }} onClick={() => setEditAssetRoom(null)}>{t(lang, "p_common_cancel")}</button>
                  </div>
                </div>
              </div>
            )}

            {/* Modale modifica prezzo */}
            {editAssetPricing && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }} onClick={() => setEditAssetPricing(null)}>
                <div style={{ ...card, width: 360, maxWidth: "92vw" }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ ...h2Style, fontSize: 18, marginBottom: 16 }}>{t(lang, "p_ad_edit_price_title", { month: editAssetPricing.month })}</h3>
                  <div style={{ marginBottom: 12 }}><label style={label}>{t(lang, "p_ad_base_price_label")}</label><input style={input} type="number" value={editAssetPricing.basePrice} onChange={e => setEditAssetPricing({ ...editAssetPricing, basePrice: e.target.value })} /></div>
                  {!isVehicleAsset(editAssetPricing.assetType) && (
                    <div style={{ marginBottom: 16 }}><label style={label}>{t(lang, "p_od_cleaning_label")}</label><input style={input} type="number" value={editAssetPricing.cleaningFee} onChange={e => setEditAssetPricing({ ...editAssetPricing, cleaningFee: e.target.value })} /></div>
                  )}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={{ ...btn("gold"), flex: 1 }} onClick={async () => {
                      await updatePricingAction(editAssetPricing.roomId, editAssetPricing.month, Number(editAssetPricing.basePrice), Number(editAssetPricing.cleaningFee));
                      setEditAssetPricing(null); setMsg(t(lang, "p_ad_price_updated")); refresh();
                    }}>{t(lang, "p_common_save")}</button>
                    <button style={{ ...btn(), flex: 1 }} onClick={() => setEditAssetPricing(null)}>{t(lang, "p_common_cancel")}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "addasset" && (
          <div>
            <h2 style={h2Style}>{t(lang, "p_ad_add_asset_title")}</h2>
            <div style={{ ...card, borderStyle: "dashed", background: "rgba(255,255,255,0.02)", borderColor: C.borderGold }}>
              <h3 style={h3Style}>{t(lang, "p_common_owner")}</h3>
              <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.textMuted }}>
                  <input type="radio" checked={naOwnerMode === "existing"} onChange={() => setNaOwnerMode("existing")} /> {t(lang, "p_ad_existing_user")}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.textMuted }}>
                  <input type="radio" checked={naOwnerMode === "new"} onChange={() => setNaOwnerMode("new")} /> {t(lang, "p_ad_create_new")}
                </label>
              </div>
              {naOwnerMode === "existing" ? (
                <select style={sel} value={naOwnerId} onChange={e => setNaOwnerId(e.target.value)}>
                  <option value="">{t(lang, "p_ad_select_owner_concierge")}</option>
                  {allUsers.filter(u => ["owner", "concierge", "agent"].includes(u.role)).map(u => (
                    <option key={u.id} value={u.id}>{roleIcon(u.role)} {u.nickname}</option>
                  ))}
                </select>
              ) : (
                <div style={grid(2)}>
                  <div><label style={label}>{t(lang, "p_nickname")}</label><input style={input} value={naNewNick} onChange={e => setNaNewNick(e.target.value)} placeholder="es. classyibiza" /></div>
                  <div>
                    <label style={label}>{t(lang, "p_ad_role")}</label>
                    <select style={sel} value={naNewRole} onChange={e => setNaNewRole(e.target.value as any)}>
                      <option value="owner">🏠 {t(lang, "p_role_owner")}</option>
                      <option value="concierge">🤵 {t(lang, "p_role_concierge")}</option>
                    </select>
                  </div>
                </div>
              )}

              <h3 style={{ ...h3Style, marginTop: 24 }}>{t(lang, "p_ad_asset_data")}</h3>
              <div style={grid(2)}>
                <div><label style={label}>{t(lang, "p_od_name")}</label><input style={input} value={naName} onChange={e => setNaName(e.target.value)} placeholder="es. Villa Roca" /></div>
                <div><label style={label}>{t(lang, "p_od_location_ph_label")}</label><AddressAutocomplete value={naLoc} onChange={setNaLoc} placeholder="Città, Zona, Porto" /></div>
              </div>
              <div style={{ ...grid(2), marginTop: 12 }}>
                <div>
                  <label style={label}>{t(lang, "p_od_type")}</label>
                  <select style={sel} value={naAssetType} onChange={e => setNaAssetType(e.target.value)}>
                    {ASSET_TYPES.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
                  </select>
                </div>
                <div><label style={label}>{t(lang, "p_ad_capacity_guests_seats")}</label><input style={input} type="number" min="1" value={naCapacity} onChange={e => setNaCapacity(e.target.value)} /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={label}>{t(lang, "p_od_description")}</label>
                <textarea style={{ ...input, minHeight: 80, fontSize: 12 }} value={naDesc} onChange={e => setNaDesc(e.target.value)} placeholder={t(lang, "p_ad_brief_desc_ph")} />
              </div>
              {isVehicleAsset(naAssetType) && (
                <div style={{ marginTop: 12 }}>
                  <CarFieldsForm value={naCarFields} onChange={setNaCarFields} lang={lang} />
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <label style={label}>{t(lang, "p_ad_concierge_collab_optional")}</label>
                <input style={input} value={naConciergeNick} onChange={e => setNaConciergeNick(e.target.value)} placeholder={t(lang, "p_ad_concierge_nick_ph")} />
              </div>

              <h3 style={{ ...h3Style, marginTop: 24 }}>{t(lang, "p_ad_seasonal_prices", { unit: unitSuffix(lang, naAssetType).replace("/", "") })}</h3>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button type="button" onClick={() => setNaPricingMode("seasonal")} style={{ ...btn(naPricingMode === "seasonal" ? "gold" : "outline"), padding: "6px 16px", fontSize: 11 }}>{t(lang, "p_ad_pricing_seasonal")}</button>
                <button type="button" onClick={() => setNaPricingMode("monthly")} style={{ ...btn(naPricingMode === "monthly" ? "gold" : "outline"), padding: "6px 16px", fontSize: 11 }}>{t(lang, "p_ad_pricing_monthly")}</button>
              </div>
              {naPricingMode === "seasonal" ? (
                <div style={grid(2)}>
                  <div><label style={label}>{t(lang, "p_ad_low_season")}</label><input style={input} type="number" value={naPriceLow} onChange={e => setNaPriceLow(e.target.value)} /></div>
                  <div><label style={label}>{t(lang, "p_ad_mid_season")}</label><input style={input} type="number" value={naPriceMid} onChange={e => setNaPriceMid(e.target.value)} placeholder={t(lang, "p_ad_default_low")} /></div>
                  <div><label style={label}>{t(lang, "p_ad_high_season")}</label><input style={input} type="number" value={naPriceHigh} onChange={e => setNaPriceHigh(e.target.value)} placeholder={t(lang, "p_ad_default_low")} /></div>
                </div>
              ) : (
                <div style={grid(3)}>
                  {Array.from({ length: 12 }, (_, i) => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                    const monthLabel = `${monthNames(lang)[d.getMonth()]} ${d.getFullYear()}`;
                    return (
                      <div key={i}>
                        <label style={label}>{monthLabel}</label>
                        <input style={input} type="number" value={naMonthlyPrices[i]} onChange={e => setNaMonthlyPrices(prev => { const next = [...prev]; next[i] = e.target.value; return next; })} placeholder="0" />
                      </div>
                    );
                  })}
                </div>
              )}
              {!isVehicleAsset(naAssetType) && (
                <div style={{ marginTop: 14 }}><label style={label}>{t(lang, "p_ad_cleaning_fee_eur")}</label><input style={input} type="number" value={naCleaningFee} onChange={e => setNaCleaningFee(e.target.value)} /></div>
              )}

              <h3 style={{ ...h3Style, marginTop: 24 }}>{t(lang, "p_ad_photos")}</h3>
              <label style={{ ...btn("outline"), padding: "8px 16px", fontSize: 11, cursor: "pointer", display: "inline-block" }}>
                {t(lang, "p_common_choose_file")}
                <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { if (e.target.files) handleNaImageFiles(e.target.files); }} />
              </label>
              {naImages.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {naImages.map((img, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={img} style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />
                      <span style={{ position: "absolute", top: -6, right: -6, background: C.bg, borderRadius: "50%", width: 18, height: 18, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: `1px solid ${C.border}` }} onClick={() => setNaImages(prev => prev.filter((_, idx) => idx !== i))}>✕</span>
                    </div>
                  ))}
                </div>
              )}

              <h3 style={{ ...h3Style, marginTop: 24 }}>{t(lang, "p_ad_pdf_sheet_optional")}</h3>
              <label style={{ ...btn("outline"), padding: "8px 16px", fontSize: 11, cursor: "pointer", display: "inline-block" }}>
                {t(lang, "p_common_choose_file")}
                <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleNaPdfFile(f); }} />
              </label>
              {naPdf && (
                <div style={{ fontSize: 12, color: C.gold, marginTop: 8 }}>📄 {naPdf.name} <span style={{ cursor: "pointer", opacity: 0.7 }} onClick={() => setNaPdf(null)}>✕</span></div>
              )}

              <div style={{ fontSize: 11, color: C.textDim, marginTop: 18 }}>{t(lang, "p_ad_asset_publish_note")}</div>
              <button style={{ ...btn("gold"), marginTop: 12 }} disabled={naSubmitting} onClick={handleAddAsset}>{naSubmitting ? t(lang, "p_ad_creating") : t(lang, "p_ad_create_asset")}</button>
            </div>
          </div>
        )}

        {tab === "users" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ ...h2Style, marginBottom: 0 }}>{t(lang, "p_ad_user_management")}</h2>
              <div style={{ fontSize: 12, color: C.textDim }}>{t(lang, "p_ad_total_users", { n: allUsers.length })}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {allUsers.filter((u: any) => u.id !== user.id).map((u: any) => {
                const services: string[] = (() => { try { return u.services ? JSON.parse(u.services) : []; } catch { return []; } })();
                const agentCollabs = (data.agentConciergeCollabs || []).filter((c: any) => c.agent_id === u.id || c.concierge_id === u.id);
                const userProps = (data.properties || []).filter((p: any) => p.owner_id === u.id);
                return (
                  <div key={u.id} style={{ ...card, borderLeft: `4px solid ${u.status === 'active' ? (u.role === 'admin' ? C.gold : u.role === 'owner' ? C.success : u.role === 'concierge' ? C.info : C.textMuted) : C.warning}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>

                      {/* Colonna sinistra: identità */}
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                          <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.surfaceAlt, border: `1px solid ${u.avatar ? C.borderGold : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0, overflow: "hidden" }}>
                            {u.avatar ? <img src={u.avatar} alt={u.nickname} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : roleIcon(u.role)}
                          </div>
                          <div>
                            <div style={{ fontFamily: FONT, fontSize: 20, color: C.goldLight, lineHeight: 1 }}>{u.nickname}</div>
                            {(u.first_name || u.last_name) && (
                              <div style={{ fontSize: 13, color: C.text, marginTop: 3 }}>{[u.first_name, u.last_name].filter(Boolean).join(" ")}</div>
                            )}
                          </div>
                          <span style={badge(u.status === 'active' ? C.success : C.warning)}>{u.status || 'active'}</span>
                        </div>

                        {/* Contatti */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                          {u.email && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ color: C.textDim, width: 14 }}>✉</span>
                              <a href={`mailto:${u.email}`} style={{ color: C.gold, textDecoration: "none" }}>{u.email}</a>
                            </div>
                          )}
                          {u.phone && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ color: C.textDim, width: 14 }}>📞</span>
                              <a href={`tel:${u.phone}`} style={{ color: C.gold, textDecoration: "none" }}>{u.phone}</a>
                            </div>
                          )}
                          {!u.email && !u.phone && (
                            <div style={{ fontSize: 11, color: C.textDim, fontStyle: "italic" }}>{t(lang, "p_ad_no_contact")}</div>
                          )}
                        </div>
                      </div>

                      {/* Colonna centrale: dettagli ruolo + servizi */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>{t(lang, "p_ad_profile_label")}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, marginBottom: 12 }}>
                          <div><span style={{ color: C.textDim }}>{t(lang, "p_ad_role")}</span><br /><strong style={{ color: C.text }}>{roleIcon(u.role)} {u.role}</strong></div>
                          <div><span style={{ color: C.textDim }}>{t(lang, "p_ad_registered")}</span><br /><strong style={{ color: C.text }}>{new Date(u.created_at).toLocaleDateString("it-IT")}</strong></div>
                          {u.managed_by && <div><span style={{ color: C.textDim }}>{t(lang, "p_ad_managed_by")}</span><br /><strong style={{ color: C.text }}>{u.managed_by}</strong></div>}
                          {userProps.length > 0 && <div><span style={{ color: C.textDim }}>{t(lang, "p_svc_properties")}</span><br /><strong style={{ color: C.success }}>{userProps.length}</strong></div>}
                        </div>
                        {services.length > 0 && (
                          <div>
                            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 6 }}>{t(lang, "p_services_offered")}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {services.map((s: string) => (
                                <span key={s} style={{ padding: "3px 10px", borderRadius: 20, background: C.surfaceAlt, border: `1px solid ${C.border}`, fontSize: 10, color: C.textMuted }}>{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {agentCollabs.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 6 }}>{t(lang, "p_ad_agent_collabs")}</div>
                            {agentCollabs.map((c: any) => (
                              <div key={c.id} style={{ fontSize: 11, color: C.textMuted }}>
                                {c.concierge_id === u.id ? t(lang, "p_ad_arrow_agent", { name: c.agent_nickname }) : t(lang, "p_ad_arrow_concierge", { name: c.concierge_nickname })}
                                <span style={{ color: C.gold, marginLeft: 6 }}>{c.commission_rate}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Colonna destra: azioni */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 150 }}>
                        <div>
                          <label style={{ ...label, marginBottom: 4 }}>{t(lang, "p_ad_change_role")}</label>
                          <select style={{ ...sel, padding: "6px 10px", fontSize: 11 }} value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}>
                            {["owner", "concierge", "agent", "admin"].map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        {u.email && (
                          <a href={`mailto:${u.email}`} style={{ ...btn(), textDecoration: "none", textAlign: "center", padding: "7px 12px", fontSize: 10 }}>{t(lang, "p_ad_write_email")}</a>
                        )}
                        <button style={{ ...btn(), fontSize: 10, padding: "7px 12px", color: C.danger, borderColor: C.danger + "44" }} onClick={() => handleDeleteUser(u.id, u.nickname)}>{t(lang, "p_ad_delete_user_btn")}</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "requests" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <h2 style={h2Style}>{t(lang, "p_ad_site_requests")}</h2>
              <div style={{ display: "flex", gap: 8 }}>
                {["all","new","read","replied","declined"].map(s => (
                  <button key={s} onClick={() => setReqFilter(s)} style={{ ...btn(reqFilter === s ? "gold" : "default"), padding: "6px 14px", fontSize: 10 }}>
                    {s === "all" ? t(lang, "p_ad_filter_all") : s === "new" ? t(lang, "p_ad_filter_new") : s === "read" ? t(lang, "p_ad_filter_read") : s === "replied" ? t(lang, "p_ad_filter_replied") : t(lang, "p_ad_filter_declined")}
                  </button>
                ))}
              </div>
            </div>
            {bookingReqs.filter((r: any) => reqFilter === "all" || r.status === reqFilter).length === 0 ? (
              <div style={{ ...card, textAlign: "center", color: C.textDim, padding: 48 }}>{t(lang, "p_ad_no_requests_found")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {bookingReqs.filter((r: any) => reqFilter === "all" || r.status === reqFilter).map((req: any) => {
                  const statusColors: Record<string, string> = { new: C.warning, read: C.info, replied: C.success, declined: C.danger };
                  const statusLabels: Record<string, string> = { new: t(lang, "p_ad_status_new"), read: t(lang, "p_ad_status_read"), replied: t(lang, "p_ad_status_replied_full"), declined: t(lang, "p_ad_status_declined") };
                  const split = req.platform_fee_rate > 0 && req.guests
                    ? null // full calc needs total which we don't have yet
                    : null;
                  return (
                    <div key={req.id} style={{ ...card, borderLeft: `4px solid ${statusColors[req.status] || C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                            <div style={{ fontFamily: FONT, fontSize: 18, color: C.goldLight }}>{req.client_name}</div>
                            <span style={badge(statusColors[req.status] || C.textDim)}>{statusLabels[req.status] || req.status}</span>
                            {req.referral_code && <span style={{ ...badge(C.info), gap: 4 }}>🤝 {t(lang, "p_ad_via")} {req.referral_code}</span>}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, fontSize: 12 }}>
                            {req.property_name && <div><span style={{ color: C.textDim }}>{t(lang, "p_ad_property_label")}</span> <strong style={{ color: C.text }}>{req.property_name}</strong></div>}
                            {req.room_name && <div><span style={{ color: C.textDim }}>{t(lang, "p_ad_unit_label")}</span> <strong style={{ color: C.text }}>{req.room_name}</strong></div>}
                            {req.client_email && <div><span style={{ color: C.textDim }}>{t(lang, "p_email")}:</span> <a href={`mailto:${req.client_email}`} style={{ color: C.gold }}>{req.client_email}</a></div>}
                            {req.client_phone && <div><span style={{ color: C.textDim }}>{t(lang, "p_ad_tel_label")}</span> <a href={`tel:${req.client_phone}`} style={{ color: C.gold }}>{req.client_phone}</a></div>}
                            {req.check_in && <div><span style={{ color: C.textDim }}>{t(lang, "req_checkin")}:</span> <strong>{req.check_in}</strong></div>}
                            {req.check_out && <div><span style={{ color: C.textDim }}>{t(lang, "req_checkout")}:</span> <strong>{req.check_out}</strong></div>}
                            {req.guests > 1 && <div><span style={{ color: C.textDim }}>{t(lang, "p_ad_guests_label")}</span> <strong>{req.guests}</strong></div>}
                            {req.platform_fee_rate > 0 && <div><span style={{ color: C.textDim }}>{t(lang, "p_ad_platform_comm_label")}</span> <strong style={{ color: C.gold }}>{req.platform_fee_rate}%</strong></div>}
                          </div>
                          {req.message && <div style={{ marginTop: 12, padding: "10px 14px", background: C.surfaceAlt, borderRadius: 8, fontSize: 12, color: C.textMuted, fontStyle: "italic", borderLeft: `2px solid ${C.border}` }}>"{req.message}"</div>}
                          <div style={{ fontSize: 10, color: C.textDim, marginTop: 8 }}>{t(lang, "p_ad_received_on")} {new Date(req.created_at).toLocaleDateString("it-IT", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 120 }}>
                          <select style={{ ...sel, padding: "6px 10px", fontSize: 11 }} value={req.status} onChange={async e => { await updateBookingRequestStatus(req.id, e.target.value); getBookingRequests().then(setBookingReqs); }}>
                            <option value="new">{t(lang, "p_ad_status_new")}</option>
                            <option value="read">{t(lang, "p_ad_status_read")}</option>
                            <option value="replied">{t(lang, "p_ad_status_replied_full")}</option>
                            <option value="declined">{t(lang, "p_ad_status_declined")}</option>
                          </select>
                          {req.client_email && <a href={`mailto:${req.client_email}?subject=${encodeURIComponent(t(lang, "p_ad_email_reply_subject"))}`} style={{ ...btn("gold"), textDecoration: "none", textAlign: "center", padding: "7px 12px", fontSize: 10 }}>{t(lang, "p_ad_reply_btn")}</a>}
                          {req.client_phone && <a href={`https://wa.me/${req.client_phone.replace(/\D/g,"")}`} target="_blank" rel="noopener" style={{ ...btn(), textDecoration: "none", textAlign: "center", padding: "7px 12px", fontSize: 10, borderColor: "#25D366", color: "#25D366" }}>WhatsApp</a>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "platform" && (
          <div>
            <h2 style={h2Style}>{t(lang, "p_ad_platform_commissions_title")}</h2>
            <p style={{ color: C.textDim, fontSize: 13, marginBottom: 28, lineHeight: 1.7 }}>
              {t(lang, "p_ad_platform_comm_desc")}<br />
              <strong style={{ color: C.gold }}>{t(lang, "p_ad_priority_label")}</strong> {t(lang, "p_ad_priority_order")}
            </p>

            {/* Add new commission */}
            <div style={{ ...card, borderColor: C.borderGold, marginBottom: 28 }}>
              <h3 style={h3Style}>{t(lang, "p_ad_add_update_rule")}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px auto", gap: 12, alignItems: "flex-end" }}>
                <div>
                  <label style={label}>{t(lang, "p_common_owner")}</label>
                  <select style={sel} value={newCommOwnerId} onChange={e => setNewCommOwnerId(e.target.value)}>
                    <option value="__global__">{t(lang, "p_ad_global_default")}</option>
                    {(data.users || []).filter((u: any) => u.role === "owner").map((u: any) => (
                      <option key={u.id} value={u.id}>🏠 {u.nickname}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={label}>{t(lang, "p_ad_asset_type_label")}</label>
                  <select style={sel} value={newCommAssetType} onChange={e => setNewCommAssetType(e.target.value)}>
                    <option value="__all__">{t(lang, "p_ad_all_types")}</option>
                    <option value="apartment">{t(lang, "p_ad_type_apartment")}</option>
                    <option value="villa">{t(lang, "p_ad_type_villa")}</option>
                    <option value="boat">{t(lang, "p_ad_type_boat")}</option>
                    <option value="car">{t(lang, "p_ad_type_car")}</option>
                    <option value="scooter">{t(lang, "p_ad_type_scooter")}</option>
                  </select>
                </div>
                <div>
                  <label style={label}>{t(lang, "p_ad_pct_commission")}</label>
                  <input style={input} type="number" min="0" max="50" step="0.5" value={newCommRate} onChange={e => setNewCommRate(e.target.value)} placeholder={t(lang, "p_ad_eg_10")} />
                </div>
                <div>
                  <button style={{ ...btn("gold"), padding: "11px 20px" }} onClick={async () => {
                    const ownerId = newCommOwnerId === "__global__" ? null : newCommOwnerId;
                    const assetType = newCommAssetType === "__all__" ? null : newCommAssetType;
                    const rate = parseFloat(newCommRate);
                    if (isNaN(rate) || rate < 0) { setMsg(t(lang, "p_ad_invalid_percentage")); return; }
                    const res = await upsertPlatformCommission(ownerId, assetType, rate);
                    if ((res as any).success) { setMsg(t(lang, "p_ad_rule_saved")); getPlatformCommissions().then(setPlatComms); }
                    else setMsg(t(lang, "p_ad_error_prefix", { error: (res as any).error }));
                  }}>{t(lang, "p_ad_save_rule")}</button>
                </div>
              </div>
            </div>

            {/* Commission rules table */}
            {platComms.length === 0 ? (
              <div style={{ ...card, textAlign: "center", color: C.textDim, padding: 40 }}>{t(lang, "p_ad_no_rules_configured")}</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr>
                    {[t(lang, "p_common_owner"), t(lang, "p_ad_asset_type_label"), t(lang, "p_ad_th_commission_pct"), t(lang, "p_ad_th_example_1000"), ""].map(h => <th key={h} style={th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {platComms.map((c: any) => (
                      <tr key={c.id}>
                        <td style={td}>{c.owner_nickname ? <><span style={{ color: C.gold }}>🏠 {c.owner_nickname}</span></> : <span style={{ color: C.textDim }}>{t(lang, "p_ad_global_default")}</span>}</td>
                        <td style={td}>{c.asset_type ? <span style={{ color: C.text }}>{c.asset_type}</span> : <span style={{ color: C.textDim }}>{t(lang, "p_ad_all_types")}</span>}</td>
                        <td style={{ ...td, fontFamily: FONT, fontSize: 18, color: C.gold }}>{c.rate}%</td>
                        <td style={td}>
                          <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                            <div>{t(lang, "p_ad_owner_receives")} <strong style={{ color: C.success }}>€{(1000 - 1000 * c.rate / 100).toFixed(0)}</strong></div>
                            <div>{t(lang, "p_ad_platform_label")} <strong style={{ color: C.gold }}>€{(1000 * c.rate / 100).toFixed(0)}</strong></div>
                          </div>
                        </td>
                        <td style={td}><button style={{ ...btn(), color: C.danger, padding: "4px 10px", fontSize: 10, borderColor: C.danger + "44" }} onClick={async () => { await deletePlatformCommission(c.id); getPlatformCommissions().then(setPlatComms); setMsg(t(lang, "p_ad_rule_deleted")); }}>{t(lang, "p_common_delete")}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Referral info box */}
            <div style={{ ...card, marginTop: 28, background: C.goldGlow, borderColor: C.borderGold }}>
              <h3 style={h3Style}>{t(lang, "p_ad_referral_how_title")}</h3>
              <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 2 }}>
                <div>• {t(lang, "p_ad_referral_b1")} <code style={{ color: C.gold, background: C.surfaceAlt, padding: "2px 8px", borderRadius: 4 }}>auraibiza.com?ref=<em>nickname</em></code></div>
                <div>• {t(lang, "p_ad_referral_b2")}</div>
                <div>• {t(lang, "p_ad_referral_b3")}</div>
                <div>• {t(lang, "p_ad_referral_b4")}</div>
              </div>
            </div>
          </div>
        )}

        {tab === "commissions" && (
          <div>
            <h2 style={h2Style}>{t(lang, "p_ad_commission_rules_title")}</h2>
            <p style={{ color: C.textDim, fontSize: 12, marginBottom: 20 }}>{t(lang, "p_ad_commission_rules_desc")}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {allUsers.filter((u: any) => ["concierge", "agent"].includes(u.role) && u.status === 'active').map((u: any) => {
                const rule = commissionRules.find((r: any) => r.user_id === u.id);
                const current = commRates[u.id] !== undefined ? commRates[u.id] : String(rule?.rate || "");
                return (
                  <div key={u.id} style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ minWidth: 140 }}>
                      <div style={{ fontWeight: 600, color: C.gold }}>{u.nickname}</div>
                      <div style={{ fontSize: 10, color: C.textDim }}>{roleIcon(u.role)} {u.role}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...label, fontSize: 9 }}>{t(lang, "p_ad_split_pct_label")}</label>
                      <input style={{ ...input, width: 100 }} type="number" min="0" max="100" placeholder="es. 20" value={current} onChange={e => setCommRates(prev => ({ ...prev, [u.id]: e.target.value }))} />
                    </div>
                    <button style={btn("gold")} onClick={() => handleSaveCommission(u.id)}>{t(lang, "p_common_save")}</button>
                    {rule && <span style={{ fontSize: 11, color: C.success }}>{t(lang, "p_ad_current_pct", { rate: rule.rate })}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "overview" && (
          <div>
            <h2 style={h2Style}>{t(lang, "p_ad_overview_title")}</h2>

            {/* Admin referral link */}
            <div style={{ ...card, background: C.goldGlow, borderColor: C.borderGold, marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h3 style={{ ...h3Style, marginBottom: 4 }}>{t(lang, "p_ad_admin_referral_title")}</h3>
                  <p style={{ fontSize: 12, color: C.textMuted }}>{t(lang, "p_ad_admin_referral_desc")}</p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ padding: "10px 16px", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 12, color: C.gold, wordBreak: "break-all" }}>
                    {typeof window !== "undefined" ? `${window.location.origin.replace("/platform","")}?ref=${user.nickname}` : `https://auraibiza.com?ref=${user.nickname}`}
                  </div>
                  <button style={btn("gold")} onClick={() => {
                    const base = window.location.origin.replace("/platform","");
                    navigator.clipboard.writeText(`${base}?ref=${user.nickname}`).then(() => setMsg(t(lang, "p_cd_link_copied")));
                  }}>{t(lang, "p_ad_copy")}</button>
                </div>
              </div>
            </div>

            <div style={grid(4)}>
              <div style={card}><div style={label}>{t(lang, "p_ad_total_users_label")}</div><div style={{ fontFamily: FONT, fontSize: 32, color: C.gold }}>{allUsers.length}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{t(lang, "p_ad_users_breakdown", { owners: allUsers.filter((u:any)=>u.role==='owner').length, concierges: allUsers.filter((u:any)=>u.role==='concierge').length, agents: allUsers.filter((u:any)=>u.role==='agent').length })}</div>
              </div>
              <div style={card}><div style={label}>{t(lang, "p_svc_properties")}</div><div style={{ fontFamily: FONT, fontSize: 32, color: C.goldLight }}>{(data.properties || []).length}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{t(lang, "p_ad_in_showcase_count", { n: (data.properties||[]).filter((p:any)=>p.is_public!==0).length })}</div>
              </div>
              <div style={card}><div style={label}>{t(lang, "p_ad_bookings_label")}</div><div style={{ fontFamily: FONT, fontSize: 32, color: C.text }}>{totalBookings}</div><div style={{ fontSize: 10, color: C.success, marginTop: 4 }}>{t(lang, "p_ad_confirmed_count", { n: confirmedBookings })}</div></div>
              <div style={card}>
                <div style={label}>{t(lang, "p_ad_confirmed_revenue")}</div>
                <div style={{ fontFamily: FONT, fontSize: 24, color: C.success }}>€{totalRevenue.toFixed(0)}</div>
                {(() => {
                  const confirmed = (data.bookings||[]).filter((b:any)=>["confirmed_owner","evaso"].includes(b.status));
                  const platFees = confirmed.reduce((s:number,b:any)=>s+(b.platform_fee||0),0);
                  return platFees > 0 ? <div style={{ fontSize: 10, color: C.gold, marginTop: 4 }}>{t(lang, "p_ad_of_which_platform_fees", { amount: platFees.toFixed(0) })}</div> : null;
                })()}
              </div>
            </div>
            <div style={card}>
              <h3 style={h3Style}>{t(lang, "p_ad_asset_distribution")}</h3>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {ASSET_TYPES.map(at => {
                  const count = (data.properties || []).filter((p: any) => (p.asset_type || 'apartment') === at.v).length;
                  return count > 0 ? (
                    <div key={at.v} style={{ padding: "8px 16px", background: C.surfaceAlt, borderRadius: 8, border: `1px solid ${C.border}`, textAlign: "center" }}>
                      <div style={{ fontSize: 20 }}>{at.l.split(' ')[0]}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{at.l.split(' ').slice(1).join(' ')}</div>
                      <div style={{ fontFamily: FONT, fontSize: 24, color: C.gold }}>{count}</div>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
            <div style={card}>
              <h3 style={h3Style}>{t(lang, "p_ad_latest_bookings")}</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr>{[t(lang, "p_common_client"), t(lang, "p_role_concierge"), t(lang, "p_ad_th_property"), t(lang, "p_th_dates"), t(lang, "p_common_total"), t(lang, "p_common_status")].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{(data.bookings || []).slice(0, 10).map((b: any) => {
                  const conc = allUsers.find((u: any) => u.id === b.concierge_id);
                  const room = (data.rooms || []).find((r: any) => r.id === b.room_id);
                  const prop = (data.properties || []).find((p: any) => p.id === room?.property_id);
                  const st = statusMap(lang)[b.status] || { label: b.status, color: C.textDim };
                  return (
                    <tr key={b.id}>
                      <td style={td}>{b.client_name} {b.client_surname}</td>
                      <td style={{ ...td, color: C.gold }}>{conc?.nickname || "—"}</td>
                      <td style={td}>{prop?.name || "—"}</td>
                      <td style={{ ...td, fontSize: 10 }}>{b.start_date} → {b.end_date}</td>
                      <td style={{ ...td, fontWeight: 700 }}>€{b.total_price}</td>
                      <td style={td}><span style={badge(st.color)}>{st.label}</span></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- MAIN APP ---
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.4 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 5.4 29.5 3 24 3 16.3 3 9.6 7.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 45c5.4 0 10.3-1.8 14.1-5.1l-6.5-5.5C29.6 36 26.9 37 24 37c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5c3.3 6.6 10 10.9 17.8 10.9z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.5 5.5C40.9 36.4 45 30.9 45 24c0-1.2-.1-2.4-.4-3.5z"/>
    </svg>
  );
}

function GoogleDivider({ lang, onClick }: { lang: Lang; onClick: () => void }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
        <div style={{ flex: 1, height: 1, background: C.border }} />
        <span style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: "1px" }}>{t(lang, "p_or_divider")}</span>
        <div style={{ flex: 1, height: 1, background: C.border }} />
      </div>
      <button type="button" onClick={onClick} style={{
        width: "100%", padding: "12px 20px", fontSize: 12, letterSpacing: "0.5px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        background: "rgba(255,255,255,0.04)", color: C.text, border: `1px solid ${C.borderGold}`, borderRadius: 8,
        cursor: "pointer", fontFamily: FONT_B, fontWeight: 600, transition: "all 0.2s",
      }}>
        <GoogleIcon />
        {t(lang, "p_continue_with_google")}
      </button>
    </div>
  );
}

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
};

function MyProfileModal({ user, allUsers, refresh, lang, onClose }: { user: User; allUsers: any[]; refresh: () => void; lang: Lang; onClose: () => void }) {
  const me = useMemo(() => allUsers.find((u: any) => u.id === user.id) || {}, [allUsers, user.id]);
  const myServices: string[] = useMemo(() => { try { return me.services ? JSON.parse(me.services) : []; } catch { return []; } }, [me.services]);
  const [initialPrefix, initialPhone] = useMemo(() => {
    const raw = (me.phone || "").trim();
    if (!raw) return ["+39", ""];
    const parts = raw.split(" ");
    if (COUNTRY_CODES.some(c => c.code === parts[0])) return [parts[0], parts.slice(1).join(" ")];
    return ["+39", raw];
  }, [me.phone]);

  const [firstName, setFirstName] = useState(me.first_name || "");
  const [lastName, setLastName] = useState(me.last_name || "");
  const [email, setEmail] = useState(me.email || "");
  const [phonePrefix, setPhonePrefix] = useState(initialPrefix);
  const [phone, setPhone] = useState(initialPhone);
  const [avatar, setAvatar] = useState<string | null>(me.avatar || null);
  const [services, setServices] = useState<string[]>(myServices);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  const isGoogleOnly = !me.password;
  const servicesList = user.role === "owner" ? OWNER_SERVICES : CONCIERGE_SERVICES;
  const toggleService = (id: string) => setServices(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const handleSave = async () => {
    setMsg(null);
    if (!email.trim()) { setMsg({ text: t(lang, "p_err_email_required"), ok: false }); return; }
    setSaving(true);
    const res = await updateOwnProfile(user.id, {
      firstName, lastName, email,
      phone: phone.trim() ? `${phonePrefix} ${phone.trim()}` : "",
      services: user.role === "admin" ? [] : services,
      avatar: avatar || undefined,
    });
    setSaving(false);
    if ((res as any).error) setMsg({ text: (res as any).error, ok: false });
    else { setMsg({ text: t(lang, "p_profile_updated"), ok: true }); refresh(); }
  };

  const handlePasswordChange = async () => {
    setPwMsg(null);
    if (!pwCurrent || !pwNew || !pwConfirm) { setPwMsg({ text: t(lang, "p_cd_fill_all_fields"), ok: false }); return; }
    if (pwNew !== pwConfirm) { setPwMsg({ text: t(lang, "p_cd_passwords_dont_match"), ok: false }); return; }
    setPwSaving(true);
    const res = await changePasswordAction(user.id, pwCurrent, pwNew);
    setPwSaving(false);
    if ((res as any).error) setPwMsg({ text: (res as any).error, ok: false });
    else { setPwMsg({ text: t(lang, "p_cd_password_updated"), ok: true }); setPwCurrent(""); setPwNew(""); setPwConfirm(""); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2000, backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div style={{ ...cardGlass, width: 480, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", textAlign: "left" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ ...h2Style, marginBottom: 0, fontSize: 22 }}>{t(lang, "p_profile_title")}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textDim, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Avatar */}
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 20 }}>
          <label style={{ cursor: "pointer", flexShrink: 0 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden", border: `2px dashed ${avatar ? C.gold : C.border}`, background: C.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {avatar ? <img src={avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ fontSize: 22 }}>📸</div>}
            </div>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => {
                const base64 = ev.target?.result as string;
                const img = new Image();
                img.src = base64;
                img.onload = () => {
                  const canvas = document.createElement("canvas");
                  const size = Math.min(img.width, img.height, 400);
                  canvas.width = size; canvas.height = size;
                  const ctx = canvas.getContext("2d")!;
                  const ox = (img.width - size) / 2;
                  const oy = (img.height - size) / 2;
                  ctx.drawImage(img, ox, oy, size, size, 0, 0, size, size);
                  setAvatar(canvas.toDataURL("image/jpeg", 0.75));
                };
              };
              reader.readAsDataURL(file);
            }} />
          </label>
          <div>
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 6 }}>{t(lang, "p_profile_photo")}</div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.7 }}>{t(lang, "p_profile_photo_hint")}</div>
            {avatar && <button type="button" onClick={() => setAvatar(null)} style={{ marginTop: 8, background: "none", border: "none", color: C.danger, fontSize: 11, cursor: "pointer", padding: 0 }}>{t(lang, "p_remove_photo")}</button>}
          </div>
        </div>

        {/* Nickname (read-only) */}
        <div style={{ marginBottom: 16 }}>
          <label style={label}>{t(lang, "p_nickname_required")}</label>
          <input style={{ ...input, opacity: 0.6, cursor: "not-allowed" }} value={user.nickname} disabled />
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{t(lang, "p_profile_nickname_locked_hint")}</div>
        </div>

        {/* Personal info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><label style={label}>{t(lang, "p_first_name")}</label><input style={input} value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
          <div><label style={label}>{t(lang, "p_last_name")}</label><input style={input} value={lastName} onChange={e => setLastName(e.target.value)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div><label style={label}>{t(lang, "p_email_required")}</label><input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div>
            <label style={label}>{t(lang, "p_phone")}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select style={{ ...sel, width: 100, flexShrink: 0 }} value={phonePrefix} onChange={e => setPhonePrefix(e.target.value)}>
                {COUNTRY_CODES.map(c => <option key={c.code + c.name} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
              <input style={{ ...input, flex: 1, minWidth: 0 }} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="340 1234567" />
            </div>
          </div>
        </div>

        {/* Services — non per admin */}
        {user.role !== "admin" && (
          <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>
              {user.role === "owner" ? t(lang, "p_what_do_you_offer") : t(lang, "p_services_offered")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {servicesList.map(s => {
                const active = services.includes(s.id);
                return (
                  <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, cursor: "pointer", border: active ? `1px solid ${C.borderGold}` : `1px solid ${C.border}`, background: active ? C.goldGlow : "rgba(255,255,255,0.02)" }}>
                    <input type="checkbox" checked={active} onChange={() => toggleService(s.id)} style={{ accentColor: C.gold, width: 14, height: 14 }} />
                    <span style={{ fontSize: 12, color: active ? C.gold : C.textMuted, fontFamily: FONT_B, fontWeight: active ? 600 : 400 }}>{serviceLabel(lang, s.id)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {msg && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 4, marginBottom: 14, background: msg.ok ? C.success + "20" : C.danger + "20", color: msg.ok ? C.success : C.danger, border: `1px solid ${msg.ok ? C.success : C.danger}44` }}>{msg.text}</div>}
        <button style={{ ...btn("gold"), width: "100%", marginBottom: 8, opacity: saving ? 0.7 : 1, cursor: saving ? "wait" : "pointer" }} disabled={saving} onClick={handleSave}>{saving ? t(lang, "p_common_saving") : t(lang, "p_common_save")}</button>

        {/* Password */}
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
          <h3 style={{ ...h3Style, fontSize: 16 }}>{t(lang, "p_cd_change_password")}</h3>
          {isGoogleOnly ? (
            <p style={{ fontSize: 12, color: C.textDim, lineHeight: 1.7 }}>{t(lang, "p_profile_google_only_password")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={label}>{t(lang, "p_cd_current_password")}</label><input type="password" style={input} value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="••••••••" /></div>
              <div><label style={label}>{t(lang, "p_cd_new_password")}</label><input type="password" style={input} value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder={t(lang, "p_password_ph")} /></div>
              <div><label style={label}>{t(lang, "p_cd_confirm_new_password")}</label><input type="password" style={input} value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="••••••••" /></div>
              {pwMsg && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 4, background: pwMsg.ok ? C.success + "20" : C.danger + "20", color: pwMsg.ok ? C.success : C.danger, border: `1px solid ${pwMsg.ok ? C.success : C.danger}44` }}>{pwMsg.text}</div>}
              <button style={{ ...btn("gold"), alignSelf: "flex-start", opacity: pwSaving ? 0.7 : 1, cursor: pwSaving ? "wait" : "pointer" }} disabled={pwSaving} onClick={handlePasswordChange}>{pwSaving ? t(lang, "p_common_saving") : t(lang, "p_cd_update_password")}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const isMobile = useIsMobile();
  const { data: session } = useSession();
  const sessionUser = session?.user as any;
  const isNewGoogleUser = !!sessionUser?.isNewGoogleUser;
  const user = sessionUser && !isNewGoogleUser ? (sessionUser as User) : null;
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbData, setDbData] = useState<any>(null);
  const [pdfPreview, setPdfPreview] = useState<{ booking: Booking; room: Room | undefined; property: Property | undefined } | null>(null);
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetMsg, setResetMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("aura_platform_lang") : null;
    if (saved && LANGUAGES.some(l => l.code === saved)) setLang(saved as Lang);
  }, []);
  const changeLang = (l: Lang) => {
    setLang(l);
    setLangMenuOpen(false);
    if (typeof window !== "undefined") window.localStorage.setItem("aura_platform_lang", l);
  };

  // Registration extended fields
  const [regRole, setRegRole] = useState<"owner" | "concierge" | "agent">("concierge");
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPhonePrefix, setRegPhonePrefix] = useState("+39");
  const [regServices, setRegServices] = useState<string[]>([]);
  const [regAvatar, setRegAvatar] = useState<string | null>(null);
  const [regStep, setRegStep] = useState<1 | 2>(1);

  // Apri direttamente il form di registrazione se arriva da ?register=1, o
  // mostra l'avviso di account in attesa di approvazione se arriva da un
  // login Google con ?error=pending (redirect impostato in src/lib/auth.ts).
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("register") === "1") {
        setIsRegister(true);
        setRegStep(1);
      }
      const authError = params.get("error");
      if (authError === "pending") {
        alert(t(lang, "p_login_pending"));
        window.history.replaceState({}, "", window.location.pathname);
      } else if (authError) {
        alert(t(lang, "p_oauth_error_generic"));
        window.history.replaceState({}, "", window.location.pathname);
      }
      const rt = params.get("resetToken");
      if (rt) setResetToken(rt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResetPassword = async () => {
    setResetMsg(null);
    if (!resetToken) return;
    if (resetNewPassword.length < 6) { setResetMsg({ text: t(lang, "p_cd_fill_all_fields"), ok: false }); return; }
    if (resetNewPassword !== resetConfirmPassword) { setResetMsg({ text: t(lang, "p_reset_password_mismatch"), ok: false }); return; }
    setResetLoading(true);
    const res = await resetPasswordWithToken(resetToken, resetNewPassword);
    setResetLoading(false);
    if ((res as any).error) { setResetMsg({ text: (res as any).error, ok: false }); return; }
    setResetDone(true);
    window.history.replaceState({}, "", window.location.pathname);
  };

  // Precompila i dati del profilo Google (nome, avatar) quando arriva una
  // nuova identità Google non ancora legata a nessun account.
  useEffect(() => {
    if (!isNewGoogleUser || !sessionUser) return;
    if (!regFirstName && !regLastName && sessionUser.name) {
      const parts = String(sessionUser.name).trim().split(/\s+/);
      setRegFirstName(parts[0] || "");
      setRegLastName(parts.slice(1).join(" "));
    }
    if (!regAvatar && sessionUser.googlePicture) setRegAvatar(sessionUser.googlePicture);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewGoogleUser, sessionUser?.googleId]);

  const fetchAll = async (silent = false) => {
    if (!dbData && !silent) setLoading(true);
    try {
      const data = await getDashboardData(user?.id, user?.role as string);
      setDbData(data);
    } catch (e) {
      console.error(e);
    }
    if (!dbData && !silent) setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    if (user) {
      const interval = setInterval(() => fetchAll(true), 10000); // 10s background polling
      return () => clearInterval(interval);
    }
  }, [user?.id, user?.role]);

  const handleLogin = async () => {
    if (!nickname.trim() || !password.trim()) { alert(t(lang, "p_err_enter_credentials")); return; }
    setLoading(true);
    const res = await signIn("credentials", { nickname, password, redirect: false });
    setLoading(false);
    if (res?.error) alert(res.error);
  };

  const handleGoogleSignIn = () => signIn("google", { callbackUrl: "/platform" });

  const handleRegister = async () => {
    if (!nickname.trim() || !password.trim()) { alert(t(lang, "p_err_enter_credentials")); return; }
    if (!regEmail.trim()) { alert(t(lang, "p_err_email_required")); return; }
    setLoading(true);
    const res = await registerUser(nickname, password, regRole, {
      firstName: regFirstName, lastName: regLastName,
      email: regEmail, phone: regPhone.trim() ? `${regPhonePrefix} ${regPhone.trim()}` : "", services: regServices,
      avatar: regAvatar || undefined,
    });
    if ((res as any).error) {
      alert((res as any).error);
      setLoading(false);
      return;
    }
    alert(t(lang, "p_register_success"));
    setIsRegister(false);
    setPassword(""); setRegFirstName(""); setRegLastName(""); setRegEmail(""); setRegPhone(""); setRegPhonePrefix("+39"); setRegServices([]); setRegAvatar(null);
    setRegStep(1);
    setLoading(false);
  };

  // Completa la registrazione avviata con "Continua con Google": stessa logica
  // di handleRegister ma senza password (l'utente autentica sempre via Google)
  // ed email/identità già verificate da Google.
  const handleGoogleClaimSubmit = async () => {
    if (!nickname.trim()) { alert(t(lang, "p_err_enter_credentials")); return; }
    setLoading(true);
    const res = await completeGoogleRegistration(
      sessionUser.googleId, sessionUser.email, nickname, regRole,
      { firstName: regFirstName, lastName: regLastName, phone: regPhone.trim() ? `${regPhonePrefix} ${regPhone.trim()}` : "", services: regServices, avatar: regAvatar || undefined }
    );
    if ((res as any).error) {
      alert((res as any).error);
      setLoading(false);
      return;
    }
    alert(t(lang, "p_register_success"));
    await signOut({ redirect: false });
    setNickname(""); setRegFirstName(""); setRegLastName(""); setRegPhone(""); setRegPhonePrefix("+39"); setRegServices([]); setRegAvatar(null);
    setRegStep(1);
    setLoading(false);
  };

  const handleInit = async () => {
    setLoading(true);
    const res = await initDatabase();
    if (!res.success) {
      alert(t(lang, "p_err_init") + res.error);
    } else {
      await fetchAll();
    }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!user || user.role !== "admin") return;
    if (!confirm(t(lang, "p_confirm_reset"))) return;
    setLoading(true);
    const res = await resetDatabase(user.id);
    if (!res.success) {
      alert(t(lang, "p_err_reset") + res.error);
    } else {
      await signOut({ redirect: false });
      await fetchAll();
    }
    setLoading(false);
  };

  if (loading || !dbData) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.gold, display: "flex", justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
        {t(lang, "p_loading_app")}
      </div>
    );
  }

  if (dbData && dbData._error) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.danger, padding: 40, fontFamily: FONT }}>
        <h2 style={h2Style}>{t(lang, "p_server_error_title")}</h2>
        <p style={{ color: C.text, marginBottom: 20 }}>{t(lang, "p_server_error_desc")}</p>
        <div style={{ padding: 20, background: "rgba(255,0,0,0.1)", border: `1px solid ${C.danger}`, borderRadius: 8, fontFamily: "monospace", color: C.danger }}>
          {dbData._error}
        </div>
      </div>
    );
  }

  if (dbData && dbData.users?.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.gold, display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 20 }}>
        <h2 style={h2Style}>{t(lang, "p_db_empty_title")}</h2>
        <button style={btn("gold")} onClick={handleInit}>{t(lang, "p_db_init_button")}</button>
      </div>
    );
  }

  const servicesList = regRole === "owner" ? OWNER_SERVICES : CONCIERGE_SERVICES;
  const toggleService = (id: string) => setRegServices(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  if (!user) {
    return (
      <div style={{
        minHeight: "100vh",
        background: `radial-gradient(ellipse at 20% 50%, rgba(200,169,110,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(74,126,196,0.04) 0%, transparent 50%), linear-gradient(170deg, ${C.bg} 0%, #0A0D12 60%, #080B0F 100%)`,
        display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", position: "relative",
      }}>
        <div style={{ position: "absolute", top: 20, right: 20 }}>
          <div style={{ position: "relative" }}>
            <button onClick={() => setLangMenuOpen(v => !v)} style={{
              display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)",
              border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 12px", cursor: "pointer",
              color: C.textMuted, fontSize: 13,
            }}>
              <span>{LANGUAGES.find(l => l.code === lang)?.flag}</span>
              <span style={{ fontSize: 9 }}>▾</span>
            </button>
            {langMenuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 1 }} onClick={() => setLangMenuOpen(false)} />
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 2,
                  background: C.surface, border: `1px solid ${C.borderGold}`, borderRadius: 10,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.5)", overflow: "hidden", minWidth: 150,
                }}>
                  {LANGUAGES.map(l => (
                    <div key={l.code} onClick={() => changeLang(l.code)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer",
                      background: l.code === lang ? C.goldGlow : "transparent",
                      color: l.code === lang ? C.gold : C.text, fontSize: 12,
                    }}>
                      <span style={{ fontSize: 16 }}>{l.flag}</span><span>{l.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{ width: "100%", maxWidth: isRegister || isNewGoogleUser ? 520 : 400, textAlign: "center" }}>
          {/* Logo */}
          <div style={{ marginBottom: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative", display: "inline-block" }}>
              <div style={{ position: "absolute", inset: -6, borderRadius: "50%", background: `conic-gradient(${C.gold}33 0deg, transparent 120deg, ${C.gold}22 240deg, transparent 360deg)`, animation: "spin 12s linear infinite" }} />
              <img src={LOGO} alt="Aura Ibiza" style={{ height: 90, width: 90, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 40px rgba(200,169,110,0.2)", position: "relative" }} />
            </div>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 28, fontWeight: 300, color: C.goldLight, letterSpacing: "5px", textTransform: "uppercase", lineHeight: 1 }}>Aura Ibiza</div>
              <div style={{ fontSize: 10, color: C.textDim, letterSpacing: "4px", textTransform: "uppercase", marginTop: 6 }}>Concierge Management</div>
            </div>
          </div>

          <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }` }} />

          {resetToken ? (
            <div style={cardGlass}>
              <h2 style={{ ...h2Style, textAlign: "center", marginBottom: 12, fontSize: 18, letterSpacing: "2px" }}>{t(lang, "p_reset_password_title")}</h2>
              {resetDone ? (
                <>
                  <div style={{ fontSize: 13, color: C.success, textAlign: "center", padding: "16px 0" }}>{t(lang, "p_reset_password_success")}</div>
                  <button type="button" style={{ ...btn("gold"), width: "100%", marginTop: 12 }} onClick={() => setResetToken(null)}>{t(lang, "p_back_to_login")}</button>
                </>
              ) : (
                <form onSubmit={e => { e.preventDefault(); handleResetPassword(); }}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={label}>{t(lang, "p_reset_password_new")}</label>
                    <input style={input} type="password" value={resetNewPassword} onChange={e => setResetNewPassword(e.target.value)} placeholder={t(lang, "p_password_ph")} autoComplete="new-password" />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={label}>{t(lang, "p_reset_password_confirm")}</label>
                    <input style={input} type="password" value={resetConfirmPassword} onChange={e => setResetConfirmPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
                  </div>
                  {resetMsg && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 4, marginBottom: 16, background: resetMsg.ok ? C.success + "20" : C.danger + "20", color: resetMsg.ok ? C.success : C.danger, border: `1px solid ${resetMsg.ok ? C.success : C.danger}44` }}>{resetMsg.text}</div>}
                  <button style={{ ...btn("gold"), width: "100%", padding: "14px 20px", fontSize: 12, letterSpacing: "2px", opacity: resetLoading ? 0.7 : 1, cursor: resetLoading ? "wait" : "pointer" }} type="submit" disabled={resetLoading}>
                    {resetLoading ? t(lang, "p_common_saving") : t(lang, "p_reset_password_submit")}
                  </button>
                </form>
              )}
            </div>
          ) : isNewGoogleUser ? (
            <div style={{ ...cardGlass, textAlign: "left", maxHeight: "85vh", overflowY: "auto" }}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontFamily: FONT, fontSize: 18, color: C.goldLight }}>{t(lang, "p_complete_profile")}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>{t(lang, "p_google_email_locked_hint", { email: sessionUser?.email || "" })}</div>
              </div>

              <form onSubmit={e => { e.preventDefault(); handleGoogleClaimSubmit(); }}>
                {/* Avatar (da Google, sostituibile) */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{
                    width: 88, height: 88, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                    border: `2px solid ${C.borderGold}`, background: C.surfaceAlt,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {regAvatar ? <img src={regAvatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ fontSize: 24 }}>📸</div>}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.7 }}>{sessionUser?.email}</div>
                </div>

                {/* Ruolo */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>{t(lang, "p_google_role_prompt")}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {([
                      { key: "owner", icon: "🏠", label: t(lang, "p_role_owner") },
                      { key: "concierge", icon: "🤵", label: t(lang, "p_role_concierge") },
                      { key: "agent", icon: "🌐", label: t(lang, "p_role_agent") },
                    ] as const).map(r => (
                      <button key={r.key} onClick={() => setRegRole(r.key)} type="button" style={{
                        padding: "14px 10px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                        border: regRole === r.key ? `1px solid ${C.borderGold}` : `1px solid ${C.border}`,
                        background: regRole === r.key ? C.goldGlow : "rgba(255,255,255,0.03)",
                        color: regRole === r.key ? C.gold : C.textMuted, transition: "all 0.2s",
                        fontFamily: FONT_B,
                      }}>
                        <div style={{ fontSize: 20, marginBottom: 6 }}>{r.icon}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>{r.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Credenziali (solo nickname: l'autenticazione resta Google) */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>{t(lang, "p_login_credentials")}</div>
                  <div><label style={label}>{t(lang, "p_nickname_required")}</label><input style={input} value={nickname} onChange={e => setNickname(e.target.value)} placeholder={t(lang, "p_nickname_ph2")} autoComplete="username" /></div>
                </div>

                {/* Dati personali */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>{t(lang, "p_personal_data")}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div><label style={label}>{t(lang, "p_first_name")}</label><input style={input} value={regFirstName} onChange={e => setRegFirstName(e.target.value)} placeholder="Mario" /></div>
                    <div><label style={label}>{t(lang, "p_last_name")}</label><input style={input} value={regLastName} onChange={e => setRegLastName(e.target.value)} placeholder="Rossi" /></div>
                  </div>
                  <div>
                    <label style={label}>{t(lang, "p_phone")}</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select style={{ ...sel, width: 110, flexShrink: 0 }} value={regPhonePrefix} onChange={e => setRegPhonePrefix(e.target.value)}>
                        {COUNTRY_CODES.map(c => <option key={c.code + c.name} value={c.code}>{c.flag} {c.code}</option>)}
                      </select>
                      <input style={{ ...input, flex: 1 }} type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="340 1234567" />
                    </div>
                  </div>
                </div>

                {/* Servizi */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 4 }}>
                    {regRole === "owner" ? t(lang, "p_what_do_you_offer") : t(lang, "p_services_offered")}
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>
                    {regRole === "owner" ? t(lang, "p_select_asset_types") : t(lang, "p_select_services")}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {servicesList.map(s => {
                      const active = regServices.includes(s.id);
                      return (
                        <label key={s.id} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                          border: active ? `1px solid ${C.borderGold}` : `1px solid ${C.border}`,
                          background: active ? C.goldGlow : "rgba(255,255,255,0.02)", transition: "all 0.15s",
                        }}>
                          <input type="checkbox" checked={active} onChange={() => toggleService(s.id)} style={{ accentColor: C.gold, width: 14, height: 14 }} />
                          <span style={{ fontSize: 12, color: active ? C.gold : C.textMuted, fontFamily: FONT_B, fontWeight: active ? 600 : 400 }}>{serviceLabel(lang, s.id)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button style={{ ...btn("gold"), width: "100%", padding: "14px 20px", fontSize: 12, letterSpacing: "1.5px" }} type="submit">
                  {t(lang, "p_submit_request")}
                </button>
                <p style={{ fontSize: 10, color: C.textDim, textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>
                  {t(lang, "p_account_activated_note")}
                </p>
              </form>
              <div style={{ marginTop: 16, textAlign: "center" }}>
                <button type="button" style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }} onClick={() => signOut({ redirect: false })}>
                  {t(lang, "p_back_to_login")}
                </button>
              </div>
            </div>
          ) : (
          <>
          {/* Login form */}
          {!isRegister && !forgotPasswordOpen && (
            <div style={cardGlass}>
              <h2 style={{ ...h2Style, textAlign: "center", marginBottom: 28, fontSize: 18, letterSpacing: "3px" }}>{t(lang, "p_login_title")}</h2>
              <form onSubmit={e => { e.preventDefault(); handleLogin(); }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>{t(lang, "p_nickname")}</label>
                  <input style={input} value={nickname} onChange={e => setNickname(e.target.value)} placeholder={t(lang, "p_nickname_ph")} autoComplete="username" />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={label}>{t(lang, "p_password")}</label>
                  <input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                </div>
                <div style={{ textAlign: "right", marginBottom: 18 }}>
                  <button type="button" style={{ background: "none", border: "none", color: C.textDim, fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" }} onClick={() => { setForgotPasswordOpen(true); setForgotSent(false); setForgotIdentifier(""); }}>
                    {t(lang, "p_forgot_password_link")}
                  </button>
                </div>
                <button style={{ ...btn("gold"), width: "100%", padding: "14px 20px", fontSize: 12, letterSpacing: "2px" }} type="submit">{t(lang, "p_login_button")}</button>
              </form>
              <GoogleDivider lang={lang} onClick={handleGoogleSignIn} />
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                <span style={{ fontSize: 12, color: C.textDim }}>{t(lang, "p_no_account")}</span>
                <button style={{ background: "none", border: "none", color: C.gold, fontSize: 12, cursor: "pointer", marginLeft: 8, padding: 0, textDecoration: "underline" }} onClick={() => { setIsRegister(true); setRegStep(1); }}>
                  {t(lang, "p_register_link")}
                </button>
              </div>
              <div style={{ marginTop: 12, fontSize: 10, color: C.textDim, textAlign: "center", fontStyle: "italic" }}>{t(lang, "p_login_footer")}</div>
            </div>
          )}

          {/* Forgot password mini-form */}
          {!isRegister && forgotPasswordOpen && (
            <div style={cardGlass}>
              <h2 style={{ ...h2Style, textAlign: "center", marginBottom: 12, fontSize: 18, letterSpacing: "2px" }}>{t(lang, "p_forgot_password_title")}</h2>
              <p style={{ color: C.textDim, fontSize: 12, marginBottom: 24, textAlign: "center", lineHeight: 1.7 }}>{t(lang, "p_forgot_password_desc")}</p>
              {forgotSent ? (
                <>
                  <div style={{ fontSize: 13, color: C.success, textAlign: "center", padding: "16px 0" }}>{t(lang, "p_forgot_password_sent")}</div>
                  <button type="button" style={{ ...btn(), width: "100%", marginTop: 12 }} onClick={() => { setForgotPasswordOpen(false); setForgotSent(false); }}>{t(lang, "p_back_to_login")}</button>
                </>
              ) : (
                <form onSubmit={async e => {
                  e.preventDefault();
                  if (!forgotIdentifier.trim()) return;
                  setForgotLoading(true);
                  await requestPasswordReset(forgotIdentifier.trim(), lang);
                  setForgotLoading(false);
                  setForgotSent(true);
                }}>
                  <div style={{ marginBottom: 24 }}>
                    <label style={label}>{t(lang, "p_nickname")} / Email</label>
                    <input style={input} value={forgotIdentifier} onChange={e => setForgotIdentifier(e.target.value)} placeholder={t(lang, "p_nickname_ph")} autoComplete="username" />
                  </div>
                  <button style={{ ...btn("gold"), width: "100%", padding: "14px 20px", fontSize: 12, letterSpacing: "2px", opacity: forgotLoading ? 0.7 : 1, cursor: forgotLoading ? "wait" : "pointer" }} type="submit" disabled={forgotLoading}>
                    {forgotLoading ? t(lang, "p_common_sending") : t(lang, "p_forgot_password_submit")}
                  </button>
                  <div style={{ marginTop: 16, textAlign: "center" }}>
                    <button type="button" style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }} onClick={() => setForgotPasswordOpen(false)}>
                      {t(lang, "p_back_to_login")}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Registration form — Step 1: role */}
          {isRegister && regStep === 1 && (
            <div style={cardGlass}>
              <h2 style={{ ...h2Style, textAlign: "center", marginBottom: 8, fontSize: 18, letterSpacing: "2px" }}>{t(lang, "p_create_account")}</h2>
              <p style={{ color: C.textDim, fontSize: 12, marginBottom: 28, textAlign: "center" }}>{t(lang, "p_select_role")}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
                {([
                  { key: "owner", icon: "🏠", label: t(lang, "p_role_owner"), desc: t(lang, "p_role_owner_desc") },
                  { key: "concierge", icon: "🤵", label: t(lang, "p_role_concierge"), desc: t(lang, "p_role_concierge_desc") },
                  { key: "agent", icon: "🌐", label: t(lang, "p_role_agent"), desc: t(lang, "p_role_agent_desc") },
                ] as const).map(r => (
                  <button key={r.key} onClick={() => setRegRole(r.key)} type="button" style={{
                    padding: "16px 12px", borderRadius: 12, cursor: "pointer", textAlign: "center",
                    border: regRole === r.key ? `1px solid ${C.borderGold}` : `1px solid ${C.border}`,
                    background: regRole === r.key ? C.goldGlow : "rgba(255,255,255,0.03)",
                    color: regRole === r.key ? C.gold : C.textMuted, transition: "all 0.2s",
                    fontFamily: FONT_B,
                  }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{r.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>{r.label}</div>
                    <div style={{ fontSize: 9, opacity: 0.7, lineHeight: 1.4 }}>{r.desc}</div>
                  </button>
                ))}
              </div>
              <button style={{ ...btn("gold"), width: "100%", padding: "13px 20px", fontSize: 12, letterSpacing: "1.5px" }} onClick={() => setRegStep(2)}>
                {t(lang, "p_continue")}
              </button>
              <GoogleDivider lang={lang} onClick={handleGoogleSignIn} />
              <div style={{ marginTop: 20, textAlign: "center" }}>
                <button style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }} onClick={() => setIsRegister(false)}>
                  {t(lang, "p_back_to_login")}
                </button>
              </div>
            </div>
          )}

          {/* Registration form — Step 2: details + services */}
          {isRegister && regStep === 2 && (
            <div style={{ ...cardGlass, textAlign: "left", maxHeight: "85vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => setRegStep(1)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMuted, cursor: "pointer", padding: "6px 12px", fontFamily: FONT_B, fontSize: 11 }}>{t(lang, "p_back")}</button>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 18, color: C.goldLight }}>{t(lang, "p_complete_profile")}</div>
                  <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "1px" }}>
                    {{owner:`🏠 ${t(lang, "p_role_owner")}`, concierge:`🤵 ${t(lang, "p_role_concierge")}`, agent:`🌐 ${t(lang, "p_role_agent")}`}[regRole]}
                  </div>
                </div>
              </div>

              <form onSubmit={e => { e.preventDefault(); handleRegister(); }}>
                {/* Avatar */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 20 }}>
                  <label style={{ cursor: "pointer", flexShrink: 0 }}>
                    <div style={{
                      width: 88, height: 88, borderRadius: "50%", overflow: "hidden",
                      border: `2px dashed ${regAvatar ? C.gold : C.border}`,
                      background: C.surfaceAlt,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "border-color 0.2s", position: "relative",
                    }}>
                      {regAvatar ? (
                        <img src={regAvatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 24, marginBottom: 4 }}>📸</div>
                          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.5px" }}>Foto</div>
                        </div>
                      )}
                    </div>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const base64 = ev.target?.result as string;
                        const img = new Image();
                        img.src = base64;
                        img.onload = () => {
                          const canvas = document.createElement("canvas");
                          const size = Math.min(img.width, img.height, 400);
                          canvas.width = size; canvas.height = size;
                          const ctx = canvas.getContext("2d")!;
                          const ox = (img.width - size) / 2;
                          const oy = (img.height - size) / 2;
                          ctx.drawImage(img, ox, oy, size, size, 0, 0, size, size);
                          setRegAvatar(canvas.toDataURL("image/jpeg", 0.75));
                        };
                      };
                      reader.readAsDataURL(file);
                    }} />
                  </label>
                  <div>
                    <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 6 }}>{t(lang, "p_profile_photo")}</div>
                    <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.7 }}>{t(lang, "p_profile_photo_hint")}</div>
                    {regAvatar && <button type="button" onClick={() => setRegAvatar(null)} style={{ marginTop: 8, background: "none", border: "none", color: C.danger, fontSize: 11, cursor: "pointer", padding: 0 }}>{t(lang, "p_remove_photo")}</button>}
                  </div>
                </div>

                {/* Credentials */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>{t(lang, "p_login_credentials")}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={label}>{t(lang, "p_nickname_required")}</label><input style={input} value={nickname} onChange={e => setNickname(e.target.value)} placeholder={t(lang, "p_nickname_ph2")} autoComplete="username" /></div>
                    <div><label style={label}>{t(lang, "p_password_required")}</label><input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t(lang, "p_password_ph")} autoComplete="new-password" /></div>
                  </div>
                </div>

                {/* Personal info */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>{t(lang, "p_personal_data")}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div><label style={label}>{t(lang, "p_first_name")}</label><input style={input} value={regFirstName} onChange={e => setRegFirstName(e.target.value)} placeholder="Mario" /></div>
                    <div><label style={label}>{t(lang, "p_last_name")}</label><input style={input} value={regLastName} onChange={e => setRegLastName(e.target.value)} placeholder="Rossi" /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={label}>{t(lang, "p_email_required")}</label><input style={input} type="email" required value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="mario@email.com" /></div>
                    <div>
                      <label style={label}>{t(lang, "p_phone")}</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <select style={{ ...sel, width: 100, flexShrink: 0 }} value={regPhonePrefix} onChange={e => setRegPhonePrefix(e.target.value)}>
                          {COUNTRY_CODES.map(c => <option key={c.code + c.name} value={c.code}>{c.flag} {c.code}</option>)}
                        </select>
                        <input style={{ ...input, flex: 1, minWidth: 0 }} type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="340 1234567" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Services */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 4 }}>
                    {regRole === "owner" ? t(lang, "p_what_do_you_offer") : t(lang, "p_services_offered")}
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>
                    {regRole === "owner" ? t(lang, "p_select_asset_types") : t(lang, "p_select_services")}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {servicesList.map(s => {
                      const active = regServices.includes(s.id);
                      return (
                        <label key={s.id} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                          border: active ? `1px solid ${C.borderGold}` : `1px solid ${C.border}`,
                          background: active ? C.goldGlow : "rgba(255,255,255,0.02)", transition: "all 0.15s",
                        }}>
                          <input type="checkbox" checked={active} onChange={() => toggleService(s.id)} style={{ accentColor: C.gold, width: 14, height: 14 }} />
                          <span style={{ fontSize: 12, color: active ? C.gold : C.textMuted, fontFamily: FONT_B, fontWeight: active ? 600 : 400 }}>{serviceLabel(lang, s.id)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button style={{ ...btn("gold"), width: "100%", padding: "14px 20px", fontSize: 12, letterSpacing: "1.5px" }} type="submit">
                  {t(lang, "p_submit_request")}
                </button>
                <p style={{ fontSize: 10, color: C.textDim, textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>
                  {t(lang, "p_account_activated_note")}
                </p>
              </form>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-container" style={{ minHeight: "100vh", background: `linear-gradient(170deg, ${C.bg} 0%, #0A0D12 60%, #080B0F 100%)` }}>
        <header className="no-print" style={{
          padding: isMobile ? "10px 16px" : "14px 28px", borderBottom: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "rgba(8,11,15,0.97)", backdropFilter: "blur(24px)",
          position: "sticky", top: 0, zIndex: 100,
          boxShadow: "0 1px 20px rgba(0,0,0,0.4)",
        }}>
          <LogoFull size={38} isMobile={isMobile} />
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setProfileModalOpen(true)} title={t(lang, "p_profile_title")}>
              {/* Avatar o emoji ruolo */}
              {(user as any).avatar ? (
                <img src={(user as any).avatar} alt={user.nickname} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: `1px solid ${C.borderGold}`, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.surfaceAlt, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                  {({ admin: "👑", owner: "🏠", concierge: "🤵", agent: "🌐" } as any)[user.role] || "👤"}
                </div>
              )}
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: isMobile ? 11 : 12, color: C.gold, fontWeight: 600, lineHeight: 1 }}>{user.nickname}</div>
                {!isMobile && <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "1.5px", marginTop: 2 }}>{user.role}</div>}
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <button onClick={() => setLangMenuOpen(v => !v)} style={{
                display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)",
                border: `1px solid ${C.border}`, borderRadius: 20, padding: isMobile ? "5px 8px" : "6px 12px", cursor: "pointer",
                color: C.textMuted, fontSize: 13,
              }}>
                <span>{LANGUAGES.find(l => l.code === lang)?.flag}</span>
                <span style={{ fontSize: 9 }}>▾</span>
              </button>
              {langMenuOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 100 }} onClick={() => setLangMenuOpen(false)} />
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 101,
                    background: C.surface, border: `1px solid ${C.borderGold}`, borderRadius: 10,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.5)", overflow: "hidden", minWidth: 150,
                  }}>
                    {LANGUAGES.map(l => (
                      <div key={l.code} onClick={() => changeLang(l.code)} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer",
                        background: l.code === lang ? C.goldGlow : "transparent",
                        color: l.code === lang ? C.gold : C.text, fontSize: 12,
                      }}>
                        <span style={{ fontSize: 16 }}>{l.flag}</span><span>{l.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button style={{ ...btn(), padding: isMobile ? "6px 12px" : "8px 18px", fontSize: 11 }} onClick={() => signOut({ redirect: false })}>{t(lang, "p_logout")}</button>
          </div>
        </header>
        {user.role === "admin" && <div className="no-print"><AdminDashboard user={user} data={dbData} refresh={fetchAll} lang={lang} /></div>}
        {user.role === "concierge" && <div className="no-print"><ConciergeDashboard user={user} data={dbData} refresh={fetchAll} setPdfPreview={setPdfPreview} isMobile={isMobile} lang={lang} /></div>}
        {user.role === "agent" && <div className="no-print"><ConciergeDashboard user={user} data={dbData} refresh={fetchAll} setPdfPreview={setPdfPreview} isMobile={isMobile} lang={lang} /></div>}
        {user.role === "owner" && <div className="no-print"><OwnerDashboard user={user} data={dbData} refresh={fetchAll} setPdfPreview={setPdfPreview} isMobile={isMobile} lang={lang} /></div>}
        {(user.role === "concierge" || user.role === "agent" || user.role === "owner") && <div className="no-print"><HelperBot role={user.role} lang={lang} /></div>}
      </div>
      <PdfPreview data={pdfPreview} onClose={() => setPdfPreview(null)} />
      {profileModalOpen && (
        <MyProfileModal user={user} allUsers={dbData?.users || []} refresh={fetchAll} lang={lang} onClose={() => setProfileModalOpen(false)} />
      )}
    </>
  );
}

// --- HELPER BOT COMPONENT ---
function HelperBot({ role, lang }: { role: UserRole; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "bot" | "user", text: string }[]>([]);
  const [inputValue, setInputValue] = useState("");

  const ownerHelp = [
    { q: t(lang, "p_bot_o_q1"), a: t(lang, "p_bot_o_a1") },
    { q: t(lang, "p_bot_o_q2"), a: t(lang, "p_bot_o_a2") },
    { q: t(lang, "p_bot_o_q3"), a: t(lang, "p_bot_o_a3") },
    { q: t(lang, "p_bot_o_q4"), a: t(lang, "p_bot_o_a4") },
    { q: t(lang, "p_bot_o_q5"), a: t(lang, "p_bot_o_a5") },
  ];

  const conciergeHelp = [
    { q: t(lang, "p_bot_c_q1"), a: t(lang, "p_bot_c_a1") },
    { q: t(lang, "p_bot_c_q2"), a: t(lang, "p_bot_c_a2") },
    { q: t(lang, "p_bot_c_q3"), a: t(lang, "p_bot_c_a3") },
    { q: t(lang, "p_bot_c_q4"), a: t(lang, "p_bot_c_a4") },
    { q: t(lang, "p_bot_c_q5"), a: t(lang, "p_bot_c_a5") },
  ];

  const helpItems = role === "owner" ? ownerHelp : conciergeHelp;

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    const userMsg = { role: "user" as const, text };
    let botResponse = t(lang, "p_bot_fallback");

    const low = text.toLowerCase();
    if (/pdf|preventivo|scarica|quote|download|devis|angebot|presupuesto/.test(low)) {
      botResponse = t(lang, "p_bot_a_pdf");
    } else if (/foto|immagine|rimuovi|photo|image|remove|bild|entfernen|photo|retirer/.test(low)) {
      botResponse = t(lang, "p_bot_a_photo");
    } else if (/prezzo|costo|listino|price|rate|preis|precio|prix|tarif/.test(low)) {
      botResponse = t(lang, "p_bot_a_price");
    } else if (/collaborat|concierge|invito|invite|einladung|invitación|invitation/.test(low)) {
      botResponse = t(lang, "p_bot_a_collab");
    } else if (/pagamento|incasso|saldo|metodo|payment|balance|method|zahlung|pago|paiement/.test(low)) {
      botResponse = t(lang, "p_bot_a_payment");
    }

    setMessages([...messages, userMsg, { role: "bot", text: botResponse }]);
    setInputValue("");
  };

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "bot", text: t(lang, "p_bot_greeting") }]);
    }
  }, [open, messages, role]);

  return (
    <>
      {/* Floating Button */}
      <div 
        onClick={() => setOpen(!open)}
        style={{ 
          position: "fixed", bottom: 25, right: 25, width: 60, height: 60, 
          background: "linear-gradient(135deg, #A0844A, #C8A96E)", 
          borderRadius: "50%", cursor: "pointer", display: "flex", justifyContent: "center", 
          alignItems: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.4)", zIndex: 1000, 
          transition: "transform 0.3s ease", border: "2px solid rgba(255,255,255,0.2)"
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
      >
        <span style={{ fontSize: 28, color: "#FFF" }}>{open ? "✕" : "✨"}</span>
      </div>

      {open && (
        <div style={{ 
          position: "fixed", bottom: 100, right: 25, width: 350, maxHeight: 600, 
          background: "rgba(11,14,17,0.95)", backdropFilter: "blur(20px)", 
          borderRadius: 20, display: "flex", flexDirection: "column", 
          zIndex: 1000, border: `1px solid ${C.border}`, overflow: "hidden",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}>
          <div style={{ background: "rgba(200,169,110,0.1)", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
             <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#4CAF50" }}></div>
             <strong style={{ color: C.gold, fontSize: 14, letterSpacing: 1 }}>AURA GUIDE</strong>
          </div>

          <div style={{ flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 15 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ 
                alignSelf: m.role === "bot" ? "flex-start" : "flex-end",
                background: m.role === "bot" ? "rgba(255,255,255,0.05)" : C.gold,
                color: m.role === "bot" ? "#EEE" : "#000",
                padding: "10px 14px", borderRadius: 12, fontSize: 13, maxWidth: "85%",
                lineHeight: 1.4
              }}>
                {m.text}
              </div>
            ))}
          </div>

          <div style={{ padding: 15, borderTop: `1px solid ${C.border}`, background: "rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 15 }}>
              <input 
                style={{ ...input, flex: 1, height: 36, fontSize: 13 }} 
                value={inputValue} 
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSend(inputValue)}
                placeholder={t(lang, "p_bot_placeholder")}
              />
              <button style={{ ...btn("gold"), padding: "0 12px" }} onClick={() => handleSend(inputValue)}>➡️</button>
            </div>

            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>{t(lang, "p_bot_faq_label")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto", paddingRight: 5 }}>
              {helpItems.map((item, i) => (
                <div key={i} 
                  onClick={() => {
                    setMessages([...messages, { role: "user", text: item.q }, { role: "bot", text: item.a }]);
                  }}
                  style={{ 
                    fontSize: 12, color: C.goldLight, cursor: "pointer", 
                    padding: "8px 10px", background: "rgba(255,255,255,0.03)", 
                    borderRadius: 6, border: "1px solid rgba(200,169,110,0.15)",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.gold}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(200,169,110,0.15)"}
                >
                  {item.q}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
