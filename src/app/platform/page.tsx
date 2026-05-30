"use client";

import { useState, useMemo, useEffect, CSSProperties } from "react";
import {
  getDashboardData, loginOrRegister, createBooking, updateBookingStatus,
  addProperty, addRoomWithPricing, updatePricingAction, getRoomAvailability,
  initDatabase, resetDatabase, toggleAvailabilityAction, batchUpdateAvailabilityAction,
  updateRoomAction, addCollaboration, removeCollaboration,
  addPricingMonthAction, deleteBookingAction,
  submitPaymentProposal, confirmPaymentAndBlock, recordFinalBalance, registerUser,
  updateBookingPriceAdjustment, updateRoomImage,
  addPaymentMethod, deletePaymentMethod,
  updatePropertyAction, updatePropertyImage,
  removePropertyImage, removeRoomImage,
  deletePropertyAction, deleteRoomAction,
  changePasswordAction, approveUser, rejectUser, updateUserRole, deleteUserAction,
  setCommissionRule, updatePropertyAssetType,
  getBookingRequests, updateBookingRequestStatus,
  getPlatformCommissions, upsertPlatformCommission, deletePlatformCommission,
  togglePropertyPublic, togglePropertyManagesAvailability,
  addAgentToConcierge, removeAgentFromConcierge, updateAgentCommissionRate,
} from "../actions";

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
  { id: "transfer", label: "Transfer aeroporto" },
  { id: "charter", label: "Charter barca / Yacht" },
  { id: "restaurants", label: "Prenotazioni ristoranti" },
  { id: "tours", label: "Tour ed escursioni" },
  { id: "shopping", label: "Spesa e forniture" },
  { id: "wellness", label: "Massaggi e wellness" },
  { id: "nightlife", label: "Serate e nightlife" },
  { id: "diving", label: "Attività acquatiche" },
  { id: "rental", label: "Noleggio mezzi" },
  { id: "events", label: "Organizzazione eventi" },
];

const OWNER_SERVICES = [
  { id: "properties", label: "Proprietà" },
  { id: "apartments", label: "Appartamenti" },
  { id: "villas", label: "Ville" },
  { id: "boats", label: "Barche / Yacht" },
  { id: "cars", label: "Auto di lusso" },
  { id: "scooters", label: "Scooter / Moto" },
  { id: "pool", label: "Piscina privata" },
  { id: "beach", label: "Spiaggia privata" },
];
interface Property { id: string; owner_id: string; name: string; location: string; description?: string; image?: string; }
interface Room { id: string; property_id: string; name: string; capacity: number; image?: string; description?: string; }
interface Pricing { id: string; room_id: string; month: string; base_price: number; cleaning_fee: number; }
interface Avail { id: string; room_id: string; date: string; status: "available" | "blocked"; price_snapshot: string; }
interface Booking {
  id: string; room_id: string; concierge_id: string; client_name: string; client_surname: string;
  start_date: string; end_date: string; notes: string; owner_price_total: number;
  concierge_fee: number; total_price: number; status: string; created_at: number;
  guests_count?: number; stay_price_total?: number; cleaning_fee_total?: number;
  fee_mode?: string; fee_value?: number;
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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "Bozza", color: C.textDim },
  sent: { label: "Inviato", color: C.info },
  payment_submitted: { label: "Pagam. Inviato", color: C.gold },
  confirmed_owner: { label: "Confermato", color: C.success },
  evaso: { label: "Evaso", color: C.success },
};

const YEARS = [2024, 2025, 2026, 2027];
const MONTHS = [
  { v: "01", l: "Gennaio" }, { v: "02", l: "Febbraio" }, { v: "03", l: "Marzo" },
  { v: "04", l: "Aprile" }, { v: "05", l: "Maggio" }, { v: "06", l: "Giugno" },
  { v: "07", l: "Luglio" }, { v: "08", l: "Agosto" }, { v: "09", l: "Settembre" },
  { v: "10", l: "Ottobre" }, { v: "11", l: "Novembre" }, { v: "12", l: "Dicembre" }
];

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
  roomId, onSelectRange, selectedRange, mode = "booking", onRefresh, roomBookings, users, allPricing, isMobile = false, onEditBooking
}: { 
  roomId: string; onSelectRange?: (r: Range) => void; selectedRange?: Range; 
  mode?: "booking" | "manager"; onRefresh?: () => void; roomBookings?: any[]; users?: User[]; allPricing?: any[];
  isMobile?: boolean; onEditBooking?: (b: any) => void;
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
      if (!confirm("Hai delle modifiche non salvate. Vuoi abbandonarle?")) return;
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

  const monthNames = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button style={btn()} onClick={() => {
          const [y, m] = currentMonth.split("-").map(Number);
          setCurrentMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`);
        }}>◂</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FONT, fontSize: 18, color: C.goldLight, lineHeight: 1 }}>{monthNames[monthData.m - 1]} {monthData.y}</div>
          {currentMonthPricing && (
            <div style={{ fontSize: 9, color: C.textDim, marginTop: 4, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              Prezzo: <span style={{ color: C.gold }}>€{currentMonthPricing.base_price}</span> | Pulizie: <span style={{ color: C.gold }}>€{currentMonthPricing.cleaning_fee}</span>
            </div>
          )}
        </div>
        <button style={btn()} onClick={() => {
          const [y, m] = currentMonth.split("-").map(Number);
          setCurrentMonth(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`);
        }}>▸</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"].map(d => (
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
            {isSaving ? "Salvataggio in corso..." : `Salva ${Object.keys(drafts).length} modifiche`}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16, fontSize: 10, color: C.textDim, justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 10, height: 10, background: C.available + "60", borderRadius: 2 }} /> Disponibile</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 10, height: 10, background: C.blocked + "60", borderRadius: 2 }} /> Bloccato</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 10, height: 10, background: C.warning + "90", borderRadius: 2 }} /> In Trattativa</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 10, height: 10, background: C.blocked, borderRadius: 2 }} /> Prenotato</div>
        {mode === "manager" && <div style={{ color: C.goldLight, marginLeft: 8 }}>• Clicca un giorno per cambiare stato</div>}
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
            <div><span style={{ color: "#999", fontSize: 11, textTransform: "uppercase", letterSpacing: "1px" }}>Notti</span><br /><strong>{getDaysBetween(booking.start_date, booking.end_date)}</strong></div>
            <div><span style={{ color: "#999", fontSize: 11, textTransform: "uppercase", letterSpacing: "1px" }}>Location</span><br /><strong>{property?.location}</strong></div>
          </div>

          <div style={{ marginTop: 40, background: "#F9F7F2", padding: 24, borderRadius: 4, border: "1px solid #EEE" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 15 }}>
              <span style={{ color: "#666" }}>Soggiorno ({getDaysBetween(booking.start_date, booking.end_date)} notti)</span>
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
function ConciergeDashboard({ user, data, refresh, setPdfPreview, isMobile = false }: { user: User, data: any, refresh: () => void, setPdfPreview: (v: any) => void, isMobile?: boolean }) {
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
  const [guestsCount, setGuestsCount] = useState("1");
  const [conciergeFee, setConciergeFee] = useState("0");
  const [agentFeeVal, setAgentFeeVal] = useState("0");
  const [feeMode, setFeeMode] = useState<'per_night' | 'percentage'>('per_night');
  const [confirmModal, setConfirmModal] = useState<any>(null); // For "Invia al Proprietario"
  const [deleteBookingId, setDeleteBookingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [viewNotes, setViewNotes] = useState<string | null>(null);
  const [confirmingDeleteMethod, setConfirmingDeleteMethod] = useState<string | null>(null);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);

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
    if (!clientName.trim() || !selectedRange?.start || !selectedRange?.end || !totals || !pricing) { setMsg("⚠ Completa tutti i campi"); return; }
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
      fee_mode: feeMode, fee_value: Number(conciergeFee) || 0
    });
    setMsg("Prenotazione creata");
    setClientName(""); setClientSurname(""); setNotes("");
    setSelectedRange({ start: null, end: null });
    refresh();
    setTab("bookings");
  };

  const generatePdf = (b: any) => {
    const room = data.rooms.find((r: any) => r.id === b.room_id);
    const prop = data.properties.find((p: any) => p.id === room?.property_id)
      || (data.collaboratedProperties || []).find((p: any) => p.id === room?.property_id);
    setPdfPreview({ booking: b, room, property: prop });
  };

  const handleStatusChange = async (id: string, st: string) => { 
    await updateBookingStatus(id, st); 
    if (st === "confirmed_client") setMsg("Prenotazione confermata, calendario bloccato");
    else setMsg(`Stato aggiornato a ${st}`);
    refresh(); 
  };
  const handleDelete = (id: string) => {
    setDeleteBookingId(id);
  };

  const performDelete = async (id: string) => {
    await deleteBookingAction(id);
    setDeleteBookingId(null);
    setMsg("Prenotazione eliminata");
    refresh();
  };

  const handleRegisterPayment = async () => {
    if (!accontoAmount) { setMsg("⚠ Inserire l'importo dell'acconto"); return; }
    
    // Identifica l'Owner corretto per questa prenotazione
    const room = data.rooms.find((r: any) => r.id === payModal.room_id);
    const property = data.properties.find((p: any) => p.id === room?.property_id);
    const ownerId = property?.owner_id;
    const ownerUser = data.users.find((u: any) => u.id === ownerId);
    const bOwnerName = ownerUser?.nickname || "Owner";

    if (!ownerId) {
      alert("Errore: Impossibile identificare il proprietario per questa stanza.");
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
    setMsg(`Proposta inviata a ${bOwnerName} per conferma!`);
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
          {[{ key: "calendar", l: "📅 Calendario" }, { key: "booking", l: "➕ Nuova" }, { key: "bookings", l: "📋 Prenotazioni" }, { key: "report", l: "📊 Report" }, { key: "settings", l: "⚙️ Impostazioni" }].map(t => (
            <div key={t.key} style={navItem(tab === t.key)} onClick={() => setTab(t.key)}>{t.l}</div>
          ))}
        </div>
        <div style={{ padding: 40, textAlign: "center", maxWidth: 600, margin: "0 auto", ...card, marginTop: 40, borderColor: C.warning + "33" }}>
          <h2 style={{ ...h2Style, color: C.warning }}>Nessuna struttura autorizzata</h2>
          <p style={{ color: C.textDim, marginTop: 16 }}>Non hai ancora accesso a nessuna proprietà. Chiedi al proprietario di aggiungerti come collaboratore usando il tuo nickname: <strong style={{ color: C.gold }}>{user.nickname}</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={nav}>
        {[{ key: "calendar", l: "📅 Calendario" }, { key: "booking", l: "➕ Nuova" }, { key: "bookings", l: "📋 Prenotazioni" }, { key: "report", l: "📊 Report" }, { key: "settings", l: "⚙️ Impostazioni" }].map(t => (
          <div key={t.key} style={navItem(tab === t.key)} onClick={() => setTab(t.key)}>{t.l}</div>
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
            <h2 style={h2Style}>Disponibilità</h2>
            <AssetCategoryTabs value={assetTab} onChange={k => { setAssetTab(k); setSelectedRange({ start: null, end: null }); }} counts={assetCategoryCounts} />
            {filteredRooms.length === 0 ? (
              <div style={{ ...card, textAlign: "center", color: C.textDim, padding: 40 }}>
                Nessuna struttura in questa categoria. Chiedi al proprietario di aggiungerti come collaboratore.
              </div>
            ) : (
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Seleziona Struttura / Stanza</label>
              <select style={sel} value={selectedRoom} onChange={e => { setSelectedRoom(e.target.value); setSelectedRange({ start: null, end: null }); }}>
                {filteredRooms.map((r: any) => {
                  const prop = allProperties.find((p: any) => p.id === r.property_id);
                  return <option key={r.id} value={r.id}>{prop?.name} — {r.name} (max {r.capacity} pax)</option>;
                })}
              </select>
            </div>
            )}
            {selectedRoom && filteredRooms.some((r: any) => r.id === selectedRoom) && (
            <div style={card}><CalendarView roomId={selectedRoom} onSelectRange={setSelectedRange} selectedRange={selectedRange} roomBookings={data.bookings.filter((b: any) => b.room_id === selectedRoom)} users={data.users} allPricing={data.pricing} /></div>
            )}
            {selectedRange?.start && (
              <div style={{ ...card, borderColor: C.gold + "44" }}>
                <div style={{ fontSize: 12, color: C.textMuted }}>
                  Selezione: <strong style={{ color: C.gold }}>{formatDate(selectedRange.start)}</strong>
                  {selectedRange.end ? <> → <strong style={{ color: C.gold }}>{formatDate(selectedRange.end)}</strong> ({getDaysBetween(selectedRange.start, selectedRange.end)} notti)</> : <span style={{ color: C.textDim }}> — seleziona data fine</span>}
                </div>
                {pricing && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}44`, paddingTop: 12, fontSize: 11, lineHeight: 1.8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Soggiorno ({pricing.nights} notti)</span>
                      <span>€{pricing.baseTotal}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Spese Pulizia</span>
                      <span>€{pricing.cleaningFee}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontWeight: 600, color: C.gold }}>
                      <span>Spetta all'Owner</span>
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
            <h2 style={h2Style}>Nuova Prenotazione</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={card}>
                <h3 style={h3Style}>1. Stanza & Date</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={label}>Seleziona Struttura / Stanza</label>
                  <select style={sel} value={selectedRoom} onChange={e => { setSelectedRoom(e.target.value); setSelectedRange({ start: null, end: null }); }}>
                    {rooms.map((r: any) => {
                      const prop = data.properties.find((p: any) => p.id === r.property_id);
                      return <option key={r.id} value={r.id}>{prop?.name} — {r.name}</option>;
                    })}
                  </select>
                </div>
                <CalendarView roomId={selectedRoom} onSelectRange={setSelectedRange} selectedRange={selectedRange} roomBookings={data.bookings.filter((b: any) => b.room_id === selectedRoom)} users={data.users} allPricing={data.pricing} />
              </div>
              <div>
                <div style={card}>
                  <h3 style={h3Style}>2. Dati Cliente</h3>
                  <div style={grid(2)}>
                    <div><label style={label}>Nome *</label><input style={input} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nome" /></div>
                    <div><label style={label}>Cognome</label><input style={input} value={clientSurname} onChange={e => setClientSurname(e.target.value)} placeholder="Cognome" /></div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label style={label}>Numero Ospiti</label>
                    <input style={input} type="number" min="1" value={guestsCount} onChange={e => setGuestsCount(e.target.value)} />
                    {selectedRoom && parseInt(guestsCount) > (currentRoom?.capacity || 0) && <div style={{ fontSize: 10, color: C.warning, marginTop: 4 }}>⚠ Supera la capacità ({currentRoom?.capacity})</div>}
                  </div>
                  <div style={{ marginTop: 12 }}><label style={label}>Note</label><textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Richieste speciali..." /></div>
                </div>
                {/* Fee fields */}
                <div style={card}>
                  <h3 style={h3Style}>3. Commissioni</h3>
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <label style={label}>{user.role === "agent" ? "Fee Concierge (al concierge)" : "Tua Commissione"}</label>
                      <input style={input} type="number" min="0" step="0.5" value={conciergeFee} onChange={e => setConciergeFee(e.target.value)} />
                    </div>
                    <div>
                      <label style={label}>Modalità</label>
                      <select style={sel} value={feeMode} onChange={e => setFeeMode(e.target.value as any)}>
                        <option value="per_night">€/notte</option>
                        <option value="percentage">%</option>
                      </select>
                    </div>
                  </div>
                  {user.role === "agent" && (
                    <div style={{ marginBottom: 0 }}>
                      <label style={label}>La Mia Fee Agente (€ totale)</label>
                      <input style={input} type="number" min="0" step="1" value={agentFeeVal} onChange={e => setAgentFeeVal(e.target.value)} placeholder="es. 50" />
                      {totals && totals.conciergeCommissionOnAgent > 0 && (
                        <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
                          Il concierge trattiene <span style={{ color: C.gold }}>{(data.agentConciergeCollabs || []).find((c: any) => c.agent_id === user.id)?.commission_rate || 0}%</span> = <span style={{ color: C.danger }}>-€{totals.conciergeCommissionOnAgent.toFixed(2)}</span> → a te: <span style={{ color: C.success }}>€{totals.agentNet.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {pricing && totals && (
                  <div style={{ ...card, borderColor: C.gold + "44", background: C.gold + "08" }}>
                    <h3 style={h3Style}>Split Riepilogo</h3>
                    <div style={{ fontSize: 12, lineHeight: 2.2 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.textMuted }}>Soggiorno ({pricing.nights} notti)</span>
                        <span>€{pricing.baseTotal}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.textMuted }}>Pulizie</span>
                        <span>€{pricing.cleaningFee}</span>
                      </div>
                      {totals.conciergeFee > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", color: C.gold }}>
                          <span>{user.role === "agent" ? "Fee Concierge" : "Tua Commissione"}</span>
                          <span>+€{totals.conciergeFee.toFixed(2)}</span>
                        </div>
                      )}
                      {user.role === "agent" && totals.agentFee > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", color: C.info }}>
                          <span>Tua Fee Agente</span>
                          <span>+€{totals.agentFee.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 20, color: C.gold, fontWeight: 600 }}>
                        <span>Totale Cliente</span>
                        <span>€{totals.totalPrice.toFixed(2)}</span>
                      </div>
                      {user.role === "agent" && totals.agentNet !== undefined && (
                        <div style={{ fontSize: 11, marginTop: 8, padding: "8px 12px", background: C.surfaceAlt, borderRadius: 6 }}>
                          <div style={{ color: C.textDim }}>Distribuzione: Owner €{totals.ownerPrice} · Concierge €{(totals.conciergeFee + totals.conciergeCommissionOnAgent).toFixed(2)} · Tu €{totals.agentNet.toFixed(2)}</div>
                        </div>
                      )}
                    </div>
                    <button style={{ ...btn("gold"), width: "100%", marginTop: 14 }} onClick={handleCreateBooking}>Crea Prenotazione</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "bookings" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ ...h2Style, margin: 0 }}>Prenotazioni</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input 
                  placeholder="🔍 Cerca cliente..." 
                  style={{ ...input, width: 180, padding: "6px 12px" }} 
                  value={searchFilter} 
                  onChange={e => setSearchFilter(e.target.value)} 
                />
                <select 
                  style={{ ...sel, width: 140, padding: "6px 12px" }} 
                  value={statusFilter} 
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="">Tutti gli stati</option>
                  {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select 
                  style={{ ...sel, width: 140, padding: "6px 12px" }} 
                  value={roomFilter} 
                  onChange={e => setRoomFilter(e.target.value)}
                >
                  <option value="">Tutte le stanze</option>
                  {rooms.map((r: any) => {
                    const p = data.properties.find((prop: any) => prop.id === r.property_id);
                    return <option key={r.id} value={r.id}>{p ? `${p.name} - ` : ""}{r.name}</option>
                  })}
                </select>
                <select style={{ ...sel, width: 90, padding: "6px 12px" }} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                  <option value="">Anno</option>
                  {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                <select style={{ ...sel, width: 110, padding: "6px 12px" }} value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
                  <option value="">Mese</option>
                  {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
            </div>

            {displayBookings.length === 0 ? <div style={{ ...card, textAlign: "center", color: C.textDim }}>Nessuna prenotazione trovata.</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {["Cliente", "App./Stanza", "Date", "Owner", "Fee", "Totale", "Incasso", "Preventivo", "Status", "Azioni", "Note", ""].map(h => (
                        <th key={h} style={{ ...th, fontSize: 9 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>{displayBookings.map((b: any) => {
                    const room = data.rooms.find((r: any) => r.id === b.room_id);
                    const prop = data.properties.find((p: any) => p.id === room?.property_id);
                    const owner = data.users.find((u: any) => u.id === prop?.owner_id);
                    const ownerNickname = owner?.nickname || "Proprietario";
                    const isOwn = b.concierge_id === user.id;
                    const conciergeUser = data.users.find((u: any) => u.id === b.concierge_id);

                    const st = STATUS_MAP[b.status] || { label: b.status, color: C.textDim };
                    const payments = data.payments.filter((p: any) => p.booking_id === b.id);
                    const receiver = payments[0]?.receiver;

                    if (!isOwn) {
                      // Privacy: show only dates, room, concierge nickname, total, status
                      return (
                        <tr key={b.id} style={{ opacity: 0.65 }}>
                          <td style={{ ...td, color: C.textDim, fontStyle: "italic", fontSize: 10 }}>🔒 Riservato</td>
                          <td style={td}>
                            <span style={{ fontSize: 10 }}>{prop ? `${prop.name} - ` : ""}{room?.name}</span>
                            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>{conciergeUser?.nickname || "—"}</div>
                          </td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>
                            {formatDate(b.start_date)} → {formatDate(b.end_date)}
                            <div style={{ fontSize: 9, color: C.textDim }}>({getDaysBetween(b.start_date, b.end_date)} {getDaysBetween(b.start_date, b.end_date) === 1 ? 'notte' : 'notti'})</div>
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
                          <div style={{ fontSize: 9, color: C.textDim }}>({getDaysBetween(b.start_date, b.end_date)} {getDaysBetween(b.start_date, b.end_date) === 1 ? 'notte' : 'notti'})</div>
                        </td>
                        <td style={{ ...td, fontWeight: 600, color: C.success }}>€{b.owner_price_total}</td>
                        <td style={{ ...td, color: C.gold, fontSize: 10 }}>
                          €{b.concierge_fee}
                          <div style={{ fontSize: 8, opacity: 0.7 }}>({data.users.find((u:any)=>u.id===b.concierge_id)?.nickname || "Conc."})</div>
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
                            {b.status === "draft" && <button style={{ ...btn(), fontSize: 10, padding: "4px 10px" }} onClick={() => handleStatusChange(b.id, "sent")}>Invia al Cliente</button>}
                          </div>
                        </td>
                        <td style={td}>
                          {b.notes && <button style={{ ...btn(), padding: "2px 8px", fontSize: 12, borderColor: C.gold + "44" }} onClick={() => setViewNotes(b.notes)} title="Mostra Note">👁️</button>}
                        </td>
                        <td style={td}>
                          {['draft', 'sent', 'payment_submitted'].includes(b.status) && (
                            <button style={{ ...btn(), fontSize: 10, padding: "4px 10px", color: C.danger, borderColor: C.danger + "44" }} onClick={() => handleDelete(b.id)}>Elimina</button>
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
                <h2 style={{ ...h2Style, margin: 0 }}>Report Personale</h2>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="date" style={{ ...input, width: 140, padding: "4px 8px", fontSize: 11 }} value={reportStart} onChange={e => setReportStart(e.target.value)} />
                  <span style={{ color: C.textDim }}>→</span>
                  <input type="date" style={{ ...input, width: 140, padding: "4px 8px", fontSize: 11 }} value={reportEnd} onChange={e => setReportEnd(e.target.value)} />
                </div>
              </div>
              
              <div style={grid(3)}>
                <div style={card}>
                  <div style={label}>Prenotazioni Chiuse</div>
                  <div style={{ fontFamily: FONT, fontSize: 32, color: C.success }}>{filtered.length}</div>
                </div>
                <div style={card}>
                  <div style={label}>Commissioni Maturate</div>
                  <div style={{ fontFamily: FONT, fontSize: 32, color: C.gold }}>€{totalFees}</div>
                </div>
                <div style={card}>
                  <div style={label}>Target Periodo</div>
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
                        <span style={{ color: C.textDim }}>Entrate (+)</span>
                        <span style={{ color: C.success, fontWeight: 600 }}>€{inc.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: C.textDim }}>Uscite (-)</span>
                        <span style={{ color: C.warning }}>€{out.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: `1px solid ${C.border}44`, paddingTop: 6, fontWeight: 700 }}>
                        <span style={{ color: C.text }}>SALDO</span>
                        <span style={{ color: (inc - out) >= 0 ? C.success : C.warning }}>€{(inc - out).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                });

                if (rCards.filter(c => c !== null).length === 0) return null;
                return (
                  <div style={{ ...card, marginTop: 24 }}>
                    <h3 style={{ ...h3Style, fontSize: 15 }}>Riepilogo per Metodo di Pagamento</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
                      {rCards}
                    </div>
                  </div>
                );
              })()}

              {filtered.length > 0 && (
                <div style={{ ...card, marginTop: 20 }}>
                  <h3 style={h3Style}>Dettaglio Commissioni Chiuse</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>{["Data Inizio", "Cliente", "Stanza", "Commissione"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
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
                <h3 style={h3Style}>👥 I Miei Agenti</h3>
                <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 1.7 }}>
                  Aggiungi agenti al tuo team. Loro potranno prenotare sulle tue proprietà aggiungendo la propria fee. Tu prendi una commissione sulla loro fee.
                </p>
                <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                  <input style={{ ...input, flex: 1, minWidth: 160 }} value={newAgentNick} onChange={e => setNewAgentNick(e.target.value)} placeholder="Nickname agente..." />
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input style={{ ...input, width: 80 }} type="number" min="0" max="50" step="1" value={newAgentCommRate} onChange={e => setNewAgentCommRate(e.target.value)} />
                    <span style={{ fontSize: 12, color: C.textMuted, whiteSpace: "nowrap" }}>% su sua fee</span>
                  </div>
                  <button style={btn("gold")} onClick={async () => {
                    if (!newAgentNick.trim()) return;
                    const res = await addAgentToConcierge(user.id, newAgentNick, parseFloat(newAgentCommRate) || 0);
                    if (!(res as any).success) { setMsg("⚠ " + (res as any).error); return; }
                    setNewAgentNick(""); setMsg("Agente aggiunto al team");
                    refresh();
                  }}>Aggiungi Agente</button>
                </div>
                {/* Lista agenti sotto questo concierge */}
                {(data.agentConciergeCollabs || []).filter((c: any) => c.concierge_id === user.id).length === 0 ? (
                  <div style={{ fontSize: 12, color: C.textDim, fontStyle: "italic" }}>Nessun agente nel tuo team. Aggiungi agenti con il form qui sopra.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(data.agentConciergeCollabs || []).filter((c: any) => c.concierge_id === user.id).map((c: any) => (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: C.surfaceAlt, borderRadius: 8, border: `1px solid ${C.border}` }}>
                        <div>
                          <span style={{ fontWeight: 700, color: C.gold }}>🌐 {c.agent_nickname}</span>
                          <span style={{ fontSize: 11, color: C.textDim, marginLeft: 12 }}>Commissione sulla sua fee:</span>
                          <span style={{ fontSize: 13, color: C.text, marginLeft: 4, fontWeight: 600 }}>{c.commission_rate}%</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="number" min="0" max="50" defaultValue={c.commission_rate}
                            style={{ ...input, width: 70, padding: "4px 8px" }}
                            onBlur={async e => {
                              const rate = parseFloat(e.target.value) || 0;
                              await updateAgentCommissionRate(c.id, rate);
                              setMsg("Commissione aggiornata");
                              refresh();
                            }}
                          />
                          <span style={{ fontSize: 11, color: C.textDim }}>%</span>
                          <button style={{ ...btn(), color: C.danger, padding: "4px 10px", fontSize: 10, borderColor: C.danger + "44" }} onClick={async () => {
                            if (!confirm(`Rimuovere ${c.agent_nickname} dal tuo team?`)) return;
                            await removeAgentFromConcierge(c.id);
                            setMsg("Agente rimosso");
                            refresh();
                          }}>Rimuovi</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Referral link box */}
            <div style={{ ...card, background: C.goldGlow, borderColor: C.borderGold, marginBottom: 16 }}>
              <h3 style={h3Style}>🔗 Il Tuo Link Referral</h3>
              <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 1.7 }}>
                Condividi questo link con i tuoi clienti. Ogni prenotazione ricevuta tramite il tuo link verrà associata al tuo account e tracciata nelle richieste.
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, padding: "12px 16px", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "'DM Sans', monospace", fontSize: 13, color: C.gold, letterSpacing: "0.3px", minWidth: 200, wordBreak: "break-all" }}>
                  {typeof window !== "undefined" ? `${window.location.origin}?ref=${user.nickname}` : `https://auraibiza.com?ref=${user.nickname}`}
                </div>
                <button style={btn("gold")} onClick={() => {
                  const url = `${window.location.origin}?ref=${user.nickname}`;
                  navigator.clipboard.writeText(url).then(() => setMsg("✓ Link copiato negli appunti!"));
                }}>Copia Link</button>
              </div>
            </div>

            <div style={card}>
              <h2 style={h2Style}>⚙️ Impostazioni Metodi di Pagamento</h2>
              <p style={{ color: C.textDim, fontSize: 13, marginBottom: 20 }}>Gestisci i metodi di pagamento che potrai selezionare durante la registrazione degli incassi.</p>
              <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                <input style={{ ...input, flex: 1 }} value={newMethodName} onChange={e => setNewMethodName(e.target.value)} placeholder="Aggiungi metodo (es. Revolut, Zen...)" />
                <button style={btn("gold")} onClick={async () => {
                  if (!newMethodName.trim()) return;
                  await addPaymentMethod(user.id, newMethodName);
                  setNewMethodName("");
                  refresh();
                }}>Aggiungi</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {data.userPaymentMethods.filter((m: any) => m.user_id === user.id).map((m: any) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.surfaceAlt, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <span style={{ fontWeight: 600 }}>{m.name}</span>
                    <button style={{ ...btn(), color: C.danger, padding: "2px 8px" }} onClick={() => setConfirmingDeleteMethod(m.id)}>Elimina</button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...card, marginTop: 16 }}>
              <h3 style={h3Style}>🔑 Cambia Password</h3>
              <p style={{ color: C.textDim, fontSize: 13, marginBottom: 20 }}>Aggiorna la password del tuo account <strong style={{ color: C.gold }}>{user.nickname}</strong>.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
                <div><label style={label}>Password Attuale</label><input type="password" style={input} value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="••••••••" /></div>
                <div><label style={label}>Nuova Password</label><input type="password" style={input} value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="min. 6 caratteri" /></div>
                <div><label style={label}>Conferma Nuova Password</label><input type="password" style={input} value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="••••••••" /></div>
                {pwMsg && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 4, background: pwMsg.ok ? C.success + "20" : C.danger + "20", color: pwMsg.ok ? C.success : C.danger, border: `1px solid ${pwMsg.ok ? C.success : C.danger}44` }}>{pwMsg.text}</div>}
                <button style={{ ...btn("gold"), alignSelf: "flex-start" }} onClick={async () => {
                  setPwMsg(null);
                  if (!pwCurrent || !pwNew || !pwConfirm) { setPwMsg({ text: "Compila tutti i campi.", ok: false }); return; }
                  if (pwNew !== pwConfirm) { setPwMsg({ text: "Le nuove password non coincidono.", ok: false }); return; }
                  const res = await changePasswordAction(user.id, pwCurrent, pwNew);
                  if ((res as any).error) { setPwMsg({ text: (res as any).error, ok: false }); }
                  else { setPwMsg({ text: "Password aggiornata con successo!", ok: true }); setPwCurrent(""); setPwNew(""); setPwConfirm(""); }
                }}>Aggiorna Password</button>
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
              <button style={{ ...btn(), width: "100%", marginTop: 20 }} onClick={() => setViewNotes(null)}>Chiudi</button>
            </div>
          </div>
        )}
        {deleteBookingId && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100, backdropFilter: "blur(8px)" }}>
            <div style={{ ...card, width: 320, textAlign: "center", animation: "modalIn 0.2s ease-out" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
              <h3 style={{ ...h3Style, marginBottom: 8 }}>Conferma Eliminazione</h3>
              <p style={{ color: C.textDim, fontSize: 13, marginBottom: 24 }}>Sicuro di voler eliminare questa prenotazione? Le date verranno sbloccate sul calendario.</p>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...btn(), flex: 1 }} onClick={() => setDeleteBookingId(null)}>Annulla</button>
                <button style={{ ...btn(C.danger), flex: 1 }} onClick={() => performDelete(deleteBookingId)}>Elimina</button>
              </div>
            </div>
          </div>
        )}
        {confirmingDeleteMethod && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1200, backdropFilter: "blur(8px)" }} onClick={() => setConfirmingDeleteMethod(null)}>
            <div style={{ ...card, width: 350, background: C.bg, textAlign: "center" }} onClick={e => e.stopPropagation()}>
              <h3 style={h3Style}>Conferma Eliminazione Metodo</h3>
              <p style={{ fontSize: 14, color: C.textDim, marginBottom: 24 }}>Sei sicuro di voler eliminare questo metodo di pagamento?</p>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...btn(), flex: 1 }} onClick={() => setConfirmingDeleteMethod(null)}>Annulla</button>
                <button style={{ ...btn(), background: C.danger, color: "#fff", flex: 1, border: "none" }} onClick={async () => {
                  if (confirmingDeleteMethod) {
                    await deletePaymentMethod(confirmingDeleteMethod);
                    setConfirmingDeleteMethod(null);
                    refresh();
                  }
                }}>Elimina</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- OWNER DASHBOARD ---
function OwnerDashboard({ user, data, refresh, setPdfPreview, isMobile = false }: { user: User, data: any, refresh: () => void, setPdfPreview: (v: any) => void, isMobile?: boolean }) {
  const [tab, setTab] = useState("properties");
  const [assetTab, setAssetTab] = useState("residenze");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCap, setNewRoomCap] = useState("2");
  const [newRoomDesc, setNewRoomDesc] = useState("");
  const [newMethodName, setNewMethodName] = useState("");
  const [newPropName, setNewPropName] = useState("");
  const [newPropLoc, setNewPropLoc] = useState("");
  const [newPropDesc, setNewPropDesc] = useState("");
  const [newPropAssetType, setNewPropAssetType] = useState("apartment");
  const [editPricing, setEditPricing] = useState<{ roomId: string; month: string; basePrice: string; cleaningFee: string } | null>(null);
  const [addPricing, setAddPricing] = useState<{ roomId: string; month: string; basePrice: string; cleaningFee: string } | null>(null);
  const [editRoom, setEditRoom] = useState<{ id: string; name: string; capacity: string; description: string } | null>(null);
  const [editProperty, setEditProperty] = useState<{ id: string; name: string; location: string; description: string } | null>(null);
  const [viewCalendar, setViewCalendar] = useState<string | null>(null);
  const [collaboratorNick, setCollaboratorNick] = useState("");
  const [msg, setMsg] = useState("");

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
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);

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
      alert("L'immagine è troppo grande. Massimo 20MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      let base64 = e.target?.result as string;
      if (file.size > 1 * 1024 * 1024) {
        base64 = await compressImage(base64);
      }
      await updateRoomImage(roomId, base64);
      setMsg("Foto camera aggiornata con successo.");
      refresh();
    };
    reader.readAsDataURL(file);
  };
  
  const handlePropertyImageUpload = async (propId: string, file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      alert("L'immagine è troppo grande. Massimo 20MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      let base64 = e.target?.result as string;
      if (file.size > 1 * 1024 * 1024) {
        base64 = await compressImage(base64);
      }
      await updatePropertyImage(propId, base64);
      setMsg("Foto proprietà aggiornata con successo.");
      refresh();
    };
    reader.readAsDataURL(file);
  };

  const [clientName, setClientName] = useState("");
  const [clientSurname, setClientSurname] = useState("");
  const [notes, setNotes] = useState("");
  const [guestsCount, setGuestsCount] = useState("1");

  const handleSaveAdjustments = async () => {
    if (!adjModal) return;
    const finalAdjs: Record<string, number> = {};
    Object.entries(localAdjs).forEach(([d, v]) => {
      const val = parseFloat(v);
      if (val !== 0 && !isNaN(val)) finalAdjs[d] = val;
    });
    const valFee = parseFloat(localFee);
    setMsg("Salvataggio in corso...");
    await updateBookingPriceAdjustment(adjModal.id, finalAdjs, isNaN(valFee) ? undefined : valFee);
    setAdjModal(null);
    setMsg("Aggiustamenti e commissione salvati con successo.");
    refresh();
  };

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
    if (!selectedRange.start || !selectedRange.end || !pricing) return alert("Seleziona le date");
    if (!clientName.trim()) return alert("Inserisci il nome del cliente");
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
    });
    // Proprietario crea inizialmente una bozza
    setMsg("Prenotazione manuale registrata in bozza.");
    setSelectedRange({ start: null, end: null });
    setClientName(""); setClientSurname(""); setNotes(""); setGuestsCount("1");
    setTab("bookings");
    refresh();
  };

  const handleDelete = (id: string) => {
    setDeleteBookingId(id);
  };

  const performDeleteBooking = async (id: string) => {
    await deleteBookingAction(id);
    setDeleteBookingId(null);
    setMsg("Prenotazione cancellata");
    refresh();
  };

  const handleConfirmOwner = async (id: string) => { await updateBookingStatus(id, "confirmed_owner"); refresh(); setMsg("Confermata, calendario bloccato"); };

  const handleRegisterPayment = async () => {
    if (!accontoAmount) { setMsg("⚠ Inserire l'importo dell'acconto"); return; }
    
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
    setMsg("Acconto registrato. In attesa di verifica.");
    refresh();
  };

  const handleRegisterCollabPayment = async () => {
    if (!accontoAmount) { setMsg("⚠ Inserire l'importo dell'acconto"); return; }
    const collabRoom = collaboratedRooms.find((r: any) => r.id === payModal.room_id);
    const collabProp = collaboratedProperties.find((p: any) => p.id === collabRoom?.property_id);
    const actualOwnerId = collabProp?.owner_id;
    if (!actualOwnerId) { alert("Errore: impossibile identificare il proprietario della stanza."); return; }
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
    setMsg("Acconto registrato. Il proprietario verificherà la proposta.");
    refresh();
  };

  const handleStatusChange = async (id: string, s: string) => { await updateBookingStatus(id, s); refresh(); };

  const handleRecordFinalBalance = async (bookingId: string, userId: string, data: any) => {
    await recordFinalBalance(bookingId, { amount: data.amount, date: data.date, method: data.method });
    setBalanceModal(null);
    setMsg("Conto chiuso correttamente!");
    refresh();
  };

  const generatePdf = (b: any) => {
    const room = data.rooms.find((r: any) => r.id === b.room_id);
    const prop = data.properties.find((p: any) => p.id === room?.property_id)
      || (data.collaboratedProperties || []).find((p: any) => p.id === room?.property_id);
    setPdfPreview({ booking: b, room, property: prop });
  };

  const handleAddProperty = async () => {
    if (!newPropName || !newPropLoc) return alert("Inserisci nome e località");
    await addProperty(user.id, newPropName, newPropLoc, newPropDesc, newPropAssetType);
    setNewPropName(""); setNewPropLoc(""); setNewPropDesc(""); setNewPropAssetType("apartment");
    setMsg("Proprietà creata con successo");
    refresh();
  };

  const handleAddRoom = async (propertyId: string) => {
    if (!newRoomName.trim()) { alert("Inserisci il nome della camera"); return; }
    await addRoomWithPricing(propertyId, newRoomName, Number(newRoomCap), newRoomDesc);
    setNewRoomName(""); setNewRoomCap("2"); setNewRoomDesc(""); setMsg(`Stanza aggiunta`);
    refresh();
  };

  const handleUpdateRoom = async () => {
    if (!editRoom) return;
    await updateRoomAction(editRoom.id, editRoom.name, Number(editRoom.capacity), editRoom.description);
    setEditRoom(null); setMsg("Stanza aggiornata");
    refresh();
  };

  const handleAddCollab = async (propertyId: string) => {
    if (!collaboratorNick.trim()) return;
    const res = await addCollaboration(propertyId, collaboratorNick);
    if (!(res as any).success) { alert((res as any).error); return; }
    setCollaboratorNick(""); setMsg("Collaboratore aggiunto");
    refresh();
  };

  const handleRemoveCollab = async (id: string) => {
    await removeCollaboration(id);
    setMsg("Collaboratore rimosso");
    refresh();
  };

  const handleSavePricing = async () => {
    if (!editPricing) return;
    await updatePricingAction(editPricing.roomId, editPricing.month, Number(editPricing.basePrice), Number(editPricing.cleaningFee));
    setEditPricing(null); setMsg("Prezzi aggiornati");
    refresh();
  };

  const handleAddPricingMonth = async () => {
    if (!addPricing) return;
    const res = await addPricingMonthAction(addPricing.roomId, addPricing.month, Number(addPricing.basePrice), Number(addPricing.cleaningFee));
    if (!(res as any).success) { alert((res as any).error); return; }
    setAddPricing(null); setMsg("Nuovo mese aggiunto al listino");
    refresh();
  };
  const totalRevenue = ownerBookings.filter((b: any) => b.status === "confirmed_owner").reduce((s: number, b: any) => s + b.owner_price_total, 0);

  return (
    <div>
      <div style={nav}>
        {[{ key: "properties", l: "🏠 Proprietà" }, { key: "bookings", l: "📋 Prenotazioni" }, { key: "new_booking", l: "📅 Nuova Prenotazione" }, { key: "report", l: "📊 Report" }, { key: "settings", l: "⚙️ Impostazioni" }].map(t => (
          <div key={t.key} style={navItem(tab === t.key)} onClick={() => setTab(t.key)}>{t.l}</div>
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
              <h2 style={{ ...h2Style, marginBottom: 0 }}>Le Tue Proprietà</h2>
              <button style={{ ...btn("gold"), padding: "10px 20px" }} onClick={() => document.getElementById("new-prop-form")?.scrollIntoView({ behavior: "smooth" })}>+ Nuova proprietà</button>
            </div>
            <AssetCategoryTabs value={assetTab} onChange={setAssetTab} counts={ownerAssetCounts} />
            {filteredProperties.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: C.textDim, padding: 40, borderStyle: "dashed" }}>
                Nessuna proprietà in questa categoria. Aggiungi la prima qui sotto.
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
                          {parseImages(prop.image).map((img, idx) => (
                            <div key={idx} style={{ position: "relative", width: 80, height: 80, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
                               <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                               <button 
                                 onClick={async () => { if(confirm("Eliminare questa foto?")) { await removePropertyImage(prop.id, idx); refresh(); } }}
                                 style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", color: "#FF4D4D", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}
                               >✕</button>
                            </div>
                          ))}
                          <label style={{ width: 80, height: 80, borderRadius: 6, border: `2px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.textMuted, fontSize: 20 }}>
                            +
                            <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePropertyImageUpload(prop.id, f); }} />
                          </label>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 4, flexWrap: "wrap" }}>
                        {/* Toggle visibilità vetrina */}
                        <button
                          title={prop.is_public === 0 ? "Nascosto dalla vetrina pubblica" : "Visibile in vetrina"}
                          onClick={async () => { await togglePropertyPublic(prop.id, prop.is_public === 0); refresh(); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                            border: prop.is_public === 0 ? `1px solid ${C.textDim}` : `1px solid ${C.success}55`,
                            background: prop.is_public === 0 ? "rgba(255,255,255,0.03)" : `${C.success}12`,
                            color: prop.is_public === 0 ? C.textDim : C.success,
                            fontFamily: FONT_B, fontSize: 10, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", transition: "all 0.2s",
                          }}>
                          <span>{prop.is_public === 0 ? "🔒" : "🌐"}</span>
                          <span>{prop.is_public === 0 ? "Nascosto" : "In vetrina"}</span>
                        </button>
                        {/* Toggle gestione disponibilità */}
                        <button
                          title={prop.manages_availability ? "Aggiorno le disponibilità — i clienti vedono il calendario" : "Non gestisco le disponibilità — i clienti usano WhatsApp"}
                          onClick={async () => { await togglePropertyManagesAvailability(prop.id, !prop.manages_availability); refresh(); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                            border: prop.manages_availability ? `1px solid ${C.info}55` : `1px solid ${C.textDim}`,
                            background: prop.manages_availability ? `${C.info}12` : "rgba(255,255,255,0.03)",
                            color: prop.manages_availability ? C.info : C.textDim,
                            fontFamily: FONT_B, fontSize: 10, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", transition: "all 0.2s",
                          }}>
                          <span>{prop.manages_availability ? "📅" : "💬"}</span>
                          <span>{prop.manages_availability ? "Calendario live" : "Solo WhatsApp"}</span>
                        </button>
                        <button style={{ ...btn(), padding: "6px 12px", fontSize: 11 }} onClick={() => setEditProperty({ id: prop.id, name: prop.name, location: prop.location, description: prop.description || "" })}>✏️ Modifica</button>
                        <button style={{ ...btn(), padding: "6px 10px", fontSize: 14, borderColor: C.danger + "55", color: C.danger }} title="Elimina proprietà" onClick={async () => { if(confirm(`Eliminare la proprietà "${prop.name}" e tutte le sue camere/prenotazioni? Questa azione è irreversibile.`)) { await deletePropertyAction(prop.id); refresh(); } }}>🗑</button>
                        <span style={badge(C.goldLight)}>{propRooms.length} unità</span>
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
                               <div style={{ color: C.textMuted, fontSize: 11 }}>Capacità: {room.capacity} ospiti</div>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                               <button style={{ ...btn(), padding: "4px 8px", fontSize: 10 }} onClick={() => setEditRoom({ id: room.id, name: room.name, capacity: String(room.capacity), description: room.description || "" })}>✏️ Modifica</button>
                               <button style={{ ...btn(), padding: "4px 10px", fontSize: 10 }} onClick={() => setViewCalendar(room.id)}>📅 Calendario</button>
                               <button style={{ ...btn(), padding: "4px 8px", fontSize: 13, borderColor: C.danger + "55", color: C.danger }} title="Elimina camera" onClick={async () => { if(confirm(`Eliminare la camera "${room.name}" e tutte le sue prenotazioni? Questa azione è irreversibile.`)) { await deleteRoomAction(room.id); refresh(); } }}>🗑</button>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                            {parseImages(room.image).map((img, idx) => (
                              <div key={idx} style={{ position: "relative", width: 60, height: 60, borderRadius: 4, overflow: "hidden", border: `1px solid ${C.border}` }}>
                                 <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                 <button 
                                   onClick={async () => { if(confirm("Eliminare questa foto?")) { await removeRoomImage(room.id, idx); refresh(); } }}
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
                            <div style={{ ...label, fontSize: 10, opacity: 0.6, marginBottom: 0 }}>Listino Mensile</div>
                            <button style={{ ...btn(), padding: "2px 6px", fontSize: 10 }} 
                              onClick={() => {
                                const d = new Date();
                                const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                setAddPricing({ roomId: room.id, month: ms, basePrice: "100", cleaningFee: "30" });
                              }}>+ Mese</button>
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
                      <div style={{ marginBottom: 10 }}><label style={label}>Nuova camera</label><input style={input} value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder="es. Deluxe Suite" /></div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          <div style={{ flex: 1 }}><label style={label}>Capacità</label><input style={input} type="number" value={newRoomCap} onChange={e => setNewRoomCap(e.target.value)} /></div>
                      </div>
                      <div style={{ marginBottom: 10 }}><label style={label}>Descrizione</label><textarea style={{ ...input, minHeight: 60, fontSize: 12 }} value={newRoomDesc} onChange={e => setNewRoomDesc(e.target.value)} placeholder="Descrizione iniziale..." /></div>
                      <button style={{ ...btn("gold"), width: "100%" }} onClick={() => handleAddRoom(prop.id)}>Aggiungi Camera</button>
                    </div>
                  </div>

                  {/* Collaborators Management */}
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                    <label style={label}>Collaboratori (Concierge / Owner)</label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                      <input style={{ ...input, flex: 1 }} value={collaboratorNick} onChange={e => setCollaboratorNick(e.target.value)} placeholder="Inserisci nickname collaboratore..." />
                      <button style={btn("gold")} onClick={() => handleAddCollab(prop.id)}>Aggiungi</button>
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
              <h3 style={h3Style}>+ Aggiungi {ownerAssetCat.label} — {ownerAssetCat.icon}</h3>
              <div style={grid(2)}>
                <div><label style={label}>Nome</label><input style={input} value={newPropName} onChange={e => setNewPropName(e.target.value)} placeholder={assetTab === "marine" ? "es. Aura Of The Sea" : assetTab === "mobilita" ? "es. Range Rover Aura" : "es. Villa Aura"} /></div>
                <div><label style={label}>Località / Porto / Garage</label><input style={input} value={newPropLoc} onChange={e => setNewPropLoc(e.target.value)} placeholder="Città, Zona, Porto" /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={label}>Tipo</label>
                <select style={sel} value={newPropAssetType} onChange={e => setNewPropAssetType(e.target.value)}>
                  {ASSET_TYPES.filter(a => ownerAssetCat.types.includes(a.v)).map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
                </select>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={label}>Descrizione</label>
                <textarea style={{ ...input, minHeight: 80, fontSize: 12 }} value={newPropDesc} onChange={e => setNewPropDesc(e.target.value)} placeholder="Breve descrizione o note sulla proprietà..." />
              </div>
              <button style={{ ...btn("gold"), marginTop: 16 }} onClick={handleAddProperty}>Crea Proprietà</button>
            </div>

            {/* Edit Property Modal */}
            {editProperty && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                <div style={{ ...card, width: "100%", maxWidth: 500, background: C.surface }}>
                  <h3 style={h3Style}>Modifica Proprietà</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div><label style={label}>Nome</label><input style={input} value={editProperty.name} onChange={e => setEditProperty({ ...editProperty, name: e.target.value })} /></div>
                    <div><label style={label}>Località</label><input style={input} value={editProperty.location} onChange={e => setEditProperty({ ...editProperty, location: e.target.value })} /></div>
                    <div><label style={label}>Descrizione</label><textarea style={{ ...input, minHeight: 120 }} value={editProperty.description} onChange={e => setEditProperty({ ...editProperty, description: e.target.value })} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                    <button style={{ ...btn("gold"), flex: 1 }} onClick={async () => {
                      await updatePropertyAction(editProperty.id, editProperty.name, editProperty.location, editProperty.description);
                      setEditProperty(null);
                      setMsg("Proprietà aggiornata con successo");
                      refresh();
                    }}>Salva Modifiche</button>
                    <button style={{ ...btn(), flex: 1 }} onClick={() => setEditProperty(null)}>Annulla</button>
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
                    { label: "Totale Cliente",  value: totClient,     color: C.text },
                    { label: "Owner Lordo",      value: totOwnerGross, color: C.textMuted },
                    { label: "Fee Piattaforma",  value: totPlatFee,    color: C.danger },
                    { label: "Owner Netto",      value: totOwnerNet,   color: C.success },
                    { label: "Fee Concierge",    value: totConc,       color: C.gold },
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
              <h2 style={{ ...h2Style, margin: 0 }}>Prenotazioni</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input 
                  placeholder="🔍 Cerca cliente..." 
                  style={{ ...input, width: 180, padding: "6px 12px" }} 
                  value={searchFilter} 
                  onChange={e => setSearchFilter(e.target.value)} 
                />
                <select 
                  style={{ ...sel, width: 140, padding: "6px 12px" }} 
                  value={statusFilter} 
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="">Tutti gli stati</option>
                  {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select 
                  style={{ ...sel, width: 140, padding: "6px 12px" }} 
                  value={roomFilter} 
                  onChange={e => setRoomFilter(e.target.value)}
                >
                  <option value="">Tutte le stanze</option>
                  {allRooms.map((r: any) => {
                    const p = data.properties.find((prop: any) => prop.id === r.property_id);
                    return <option key={r.id} value={r.id}>{p ? `${p.name} - ` : ""}{r.name}</option>
                  })}
                </select>
                <select style={{ ...sel, width: 90, padding: "6px 12px" }} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                  <option value="">Anno</option>
                  {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                <select style={{ ...sel, width: 110, padding: "6px 12px" }} value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
                  <option value="">Mese</option>
                  {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
            </div>

            {ownerBookings.length === 0 ? <div style={{ ...card, textAlign: "center", color: C.textDim }}>Nessuna prenotazione trovata con questi filtri.</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {["Cliente", "App./Stanza", "Date", "Soggiorno", "Pulizie", "Owner Lordo", "Fee Piatt.", "Owner Netto", "Fee Conc.", "Totale Cliente", "Incasso", "Preventivo", "Status", "Azioni", "Note"].map((h, i) => (
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
                    const st = STATUS_MAP[b.status] || { label: b.status, color: C.textDim };
                    const payments = data.payments.filter((p: any) => p.booking_id === b.id);
                    const receiver = payments[0]?.receiver;
                    const collabPropOwner = !isOwnRoom ? data.users.find((u: any) => u.id === prop?.owner_id) : null;
                    return (<tr key={b.id} style={!isOwnRoom ? { borderLeft: `3px solid ${C.info}44` } : undefined}>
                      <td style={td}>
                        {b.client_name} {b.client_surname}
                        {!isOwnRoom && <div style={{ fontSize: 9, color: C.info, marginTop: 2 }}>🤝 Collaborazione</div>}
                      </td>
                      <td style={td}>
                        <div style={{ fontSize: 10 }}>{prop ? `${prop.name} - ` : ""}{room?.name}</div>
                        {!isOwnRoom && collabPropOwner && <div style={{ fontSize: 9, color: C.textDim }}>Owner: {collabPropOwner.nickname}</div>}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {formatDate(b.start_date)} → {formatDate(b.end_date)}
                        <div style={{ fontSize: 9, color: C.textDim }}>({getDaysBetween(b.start_date, b.end_date)} {getDaysBetween(b.start_date, b.end_date) === 1 ? 'notte' : 'notti'})</div>
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
                        <div style={{ fontSize: 8, opacity: 0.7 }}>({data.users.find((u:any)=>u.id===b.concierge_id)?.nickname || "Conc."})</div>
                      </td>
                      <td style={{ ...td, fontWeight: 700 }}>€{b.total_price}</td>
                      <td style={td}>
                        {(() => {
                           if (!receiver) return "-";
                           if (!isOwnRoom) {
                             if (receiver === user.id) return <span style={{ color: C.gold, fontWeight: 600, fontSize: 10 }}>{user.nickname} (te)</span>;
                             const ownerU = data.users.find((u: any) => u.id === collabPropOwner?.id);
                             return <span style={{ color: C.success, fontWeight: 600, fontSize: 10 }}>{collabPropOwner?.nickname || "Owner"}</span>;
                           }
                           if (receiver === 'owner' || receiver === user.id) return <span style={{ color: C.success, fontWeight: 600, fontSize: 10 }}>{user?.nickname || 'Owner'}</span>;
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
                                {b.status === "draft" && <button style={{ ...btn(), fontSize: 10, padding: "4px 10px" }} onClick={() => handleStatusChange(b.id, "sent")}>Invia al Cliente</button>}
                                {b.status === "confirmed_owner" && <span style={{ fontSize: 10, color: C.success }}>✓ Confermato</span>}
                                {b.status === "evaso" && <span style={{ fontSize: 10, color: C.success }}>✓ Evaso</span>}
                              </>
                            ) : (
                              // Own property — full owner actions
                              <>
                                {b.status === "draft" && (
                                  <button style={{ ...btn(), fontSize: 10, padding: "4px 10px" }} onClick={() => handleStatusChange(b.id, "sent")}>Invia al Cliente</button>
                                )}
                                {b.status === "confirmed_owner" && <span style={{ fontSize: 10, color: C.success }}>✓ Confermato</span>}
                                {b.status === "evaso" && <span style={{ fontSize: 10, color: C.textDim }}>-</span>}
                              </>
                            )}
                          </div>
                        </td>
                        <td style={td}>
                          {b.notes && <button style={{ ...btn(), padding: "2px 8px", fontSize: 12, borderColor: C.gold + "44" }} onClick={() => setViewNotes(b.notes)} title="Mostra Note">👁️</button>}
                        </td>
                        <td style={td}>
                          {(isOwnRoom || ['draft', 'sent'].includes(b.status)) && (
                            <button style={{ ...btn(), fontSize: 10, padding: "4px 10px", color: C.danger, borderColor: C.danger + "44" }} onClick={() => handleDelete(b.id)}>Elimina</button>
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
            <h2 style={h2Style}>Aggiungi Prenotazione Diretta</h2>
            <div style={grid(2)}>
              <div style={card}>
                <h3 style={h3Style}>1. Stanza & Date</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={label}>Seleziona Struttura / Stanza</label>
                  <select style={sel} value={selectedRoom} onChange={e => { setSelectedRoom(e.target.value); setSelectedRange({ start: null, end: null }); }}>
                    {allRooms.length > 0 && (
                      <optgroup label="Le mie proprietà">
                        {allRooms.map((r: any) => {
                          const prop = properties.find((p: any) => p.id === r.property_id);
                          return <option key={r.id} value={r.id}>{prop?.name} — {r.name}</option>;
                        })}
                      </optgroup>
                    )}
                    {collaboratedRooms.length > 0 && (
                      <optgroup label="Collaborazioni (altri owner)">
                        {collaboratedRooms.map((r: any) => {
                          const prop = collaboratedProperties.find((p: any) => p.id === r.property_id);
                          const propOwner = data.users.find((u: any) => u.id === prop?.owner_id);
                          return <option key={r.id} value={r.id}>[{propOwner?.nickname || "Owner"}] {prop?.name} — {r.name}</option>;
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
                />
              </div>
              <div>
                <div style={card}>
                  <h3 style={h3Style}>2. Dati Cliente</h3>
                  <div style={grid(2)}>
                    <div><label style={label}>Nome *</label><input style={input} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nome" /></div>
                    <div><label style={label}>Cognome</label><input style={input} value={clientSurname} onChange={e => setClientSurname(e.target.value)} placeholder="Cognome" /></div>
                  </div>
                  <div style={grid(2)}>
                    <div style={{ marginTop: 12 }}>
                      <label style={label}>Numero Ospiti</label>
                      <input style={input} type="number" min="1" value={guestsCount} onChange={e => setGuestsCount(e.target.value)} />
                      {selectedRoom && (() => { const rm = [...allRooms, ...collaboratedRooms].find((r:any)=>r.id === selectedRoom); return rm && parseInt(guestsCount) > (rm.capacity || 0) ? <div style={{ fontSize: 10, color: C.warning, marginTop: 4 }}>⚠ Supera la capacità ({rm.capacity})</div> : null; })()}
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}><label style={label}>Note / Riferimenti Extra</label><textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Valore concordato, note su pagamenti..." /></div>
                </div>
                {pricing && (() => {
                  const ownerTot = pricing.baseTotal + pricing.cleaningFee;
                  const rawVal = Number(ownerConciergeFee) || 0;
                  const fee = ownerFeeMode === 'percentage'
                    ? Math.round(ownerTot * rawVal / 100 * 100) / 100
                    : rawVal * pricing.nights;
                  return (
                    <div style={{ ...card, borderColor: C.success + "44", background: C.success + "08" }}>
                      <h3 style={h3Style}>Riepilogo</h3>
                      <div style={{ fontSize: 12, lineHeight: 2 }}>
                        <div>Notti: <strong>{pricing.nights}</strong></div>
                        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                            <span style={{ color: C.textDim }}>Soggiorno Base</span>
                            <span>€{pricing.baseTotal}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                            <span style={{ color: C.textDim }}>Spese Pulizia</span>
                            <span>€{pricing.cleaningFee}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: C.success, fontWeight: 700, margin: "4px 0" }}>
                            <span>Spetta all'Owner</span>
                            <span>€{ownerTot}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontFamily: FONT, color: C.text, marginTop: 8, paddingTop: 8, borderTop: `2px solid ${C.success}55` }}>
                            <span style={{ fontWeight: 800 }}>TOTALE</span>
                            <span style={{ fontWeight: 800 }}>€{ownerTot}</span>
                          </div>
                        </div>
                      </div>
                      <button style={{ ...btn("gold"), width: "100%", marginTop: 16, background: C.success, color: C.bg }} onClick={handleCreateBookingOwner}>Registra a Calendario</button>
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
                <h2 style={{ ...h2Style, margin: 0 }}>Report Analitico</h2>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="date" style={{ ...input, width: 140, padding: "4px 8px", fontSize: 11 }} value={reportStart} onChange={e => setReportStart(e.target.value)} />
                  <span style={{ color: C.textDim }}>→</span>
                  <input type="date" style={{ ...input, width: 140, padding: "4px 8px", fontSize: 11 }} value={reportEnd} onChange={e => setReportEnd(e.target.value)} />
                </div>
              </div>
              
              <div style={grid(5)}>
                <div style={card}><div style={label}>Fatturato Lordo</div><div style={{ fontFamily: FONT, fontSize: 24, color: C.text }}>€{filtered.reduce((s: number, b: any) => s + b.total_price, 0)}</div></div>
                <div style={card}><div style={label}>Netto Atteso</div><div style={{ fontFamily: FONT, fontSize: 24, color: C.textDim }}>€{totalRevenueFiltered}</div></div>
                <div style={card}>
                  <div style={label}>Incassato Reale</div>
                  <div style={{ fontFamily: FONT, fontSize: 32, color: C.success }}>€{totalRealCollected.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: totalRevenueFiltered > 0 ? (totalRealCollected >= totalRevenueFiltered ? C.success : C.warning) : C.textDim, marginTop: 4 }}>
                    {totalRevenueFiltered > 0 ? `${((totalRealCollected / totalRevenueFiltered) * 100).toFixed(0)}% del totale atteso` : "Nessuna previsione"}
                  </div>
                </div>
                <div style={card}><div style={label}>Commissioni Pagate</div><div style={{ fontFamily: FONT, fontSize: 24, color: C.warning }}>€{totalFeesPaid}</div></div>
                <div style={card}><div style={label}>Prenotazioni Finalizzate</div><div style={{ fontFamily: FONT, fontSize: 24, color: C.textDim }}>{filtered.length}</div></div>
              </div>

              <div style={grid(2)}>
                <div style={card}>
                  <h3 style={h3Style}>Performance Collaboratori</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>{["Nick", "Prenot.", "Tot. Fee", "Media Notti", "Fee Media"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>{conciergeStats.map((s: any) => (
                      <tr key={s.nickname}>
                        <td style={td}><strong>{s.nickname}</strong></td>
                        <td style={td}>{s.count}</td>
                        <td style={{ ...td, color: C.gold, fontWeight: 600 }}>€{s.fees}</td>
                        <td style={td}>{s.avgDays} gg</td>
                        <td style={{ ...td, color: C.success }}>€{s.avgFee}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>

                <div style={card}>
                  <h3 style={h3Style}>Revenue per Proprietà</h3>
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
                <h3 style={h3Style}>Dettaglio per Stanza</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr>{["Stanza", "Proprietà", "Revenue"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
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
                        <span style={{ color: C.textDim }}>Entrate (+)</span>
                        <span style={{ color: C.success, fontWeight: 600 }}>€{inc.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: C.textDim }}>Uscite (-)</span>
                        <span style={{ color: C.warning }}>€{out.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: `1px solid ${C.border}44`, paddingTop: 6, fontWeight: 700 }}>
                        <span style={{ color: C.text }}>SALDO</span>
                        <span style={{ color: (inc - out) >= 0 ? C.success : C.warning }}>€{(inc - out).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                });

                if (rCards.filter(c => c !== null).length === 0) return null;
                return (
                  <div style={{ ...card, marginTop: 24 }}>
                    <h3 style={{ ...h3Style, fontSize: 15 }}>Riepilogo per Metodo di Pagamento</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
                      {rCards}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {false && balanceModal && (() => {
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
                <h3 style={h3Style}>Registrazione Saldo Finale</h3>
                <p style={{ fontSize: 12, color: C.textDim, marginTop: -10, marginBottom: 20 }}>Riepilogo e incasso per {balanceModal.client_name}</p>

                <div style={{ ...card, background: C.surfaceAlt, marginBottom: 20, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: C.textDim }}>Totale Soggiorno Originario:</span>
                    <strong>€{totale}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: C.textDim }}>Commissione Concierge:</span>
                    <strong>€{balanceModal.concierge_fee}</strong>
                  </div>
                  <hr style={{ border: `1px solid ${C.border}44`, margin: "8px 0" }} />
                  {accontoConcierge > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: C.textDim }}>Acconto versato dal cliente a {conciergeName}:</span>
                      <strong style={{ color: C.gold }}>€{accontoConcierge}</strong>
                    </div>
                  )}
                  {accontoOwner > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: C.textDim }}>Acconto versato dal cliente a te ({ownerName}):</span>
                      <strong style={{ color: C.success }}>€{accontoOwner}</strong>
                    </div>
                  )}
                  
                  {(stornoOwner > 0 || stornoConcierge > 0) && (
                    <div style={{ padding: "8px 12px", marginTop: 12, borderRadius: 6, borderLeft: `3px solid ${stornoOwner > 0 ? C.success : C.warning}`, background: "rgba(255,255,255,0.02)" }}>
                       {stornoOwner > 0 && (
                         <>
                           <div style={{ color: C.textDim, fontSize: 12, display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                             <span>Di cui trattenuti da {conciergeName} per commissione:</span>
                             <strong style={{ color: C.gold }}>€{balanceModal.concierge_fee}</strong>
                           </div>
                           <div style={{ color: C.textDim, fontSize: 12, display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                             <span>Quota acconto già incassata da te (da {conciergeName}):</span>
                             <strong style={{ color: C.success }}>€{stornoOwner}</strong>
                           </div>
                         </>
                       )}
                       {stornoConcierge > 0 && (
                         <>
                           <div style={{ color: C.textDim, fontSize: 12, display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                             <span>Di cui trattenuti da te (tua quota parziale):</span>
                             <strong style={{ color: C.success }}>€{(accontoOwner - stornoConcierge).toFixed(2)}</strong>
                           </div>
                           <div style={{ color: C.textDim, fontSize: 12, display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                             <span>Storno (Commissione) versato a {conciergeName}:</span>
                             <strong style={{ color: C.warning }}>€{stornoConcierge}</strong>
                           </div>
                         </>
                       )}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 14 }}>
                    <span>Saldo da chiedere al check-in:</span>
                    <strong style={{ color: C.info }}>€{remainingFromGuest.toFixed(2)}</strong>
                  </div>
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <label style={label}>Importo Ricevuto (€)</label>
                  <input style={input} type="number" value={balanceData.amount || remainingFromGuest.toFixed(2)} onChange={e => setBalanceData({...balanceData, amount: e.target.value})} />
                </div>
                <div style={grid(2)}>
                  <div>
                    <label style={label}>Data Incasso</label>
                    <input style={input} type="date" value={balanceData.date} onChange={e => setBalanceData({...balanceData, date: e.target.value})} />
                  </div>
                  <div>
                    <label style={label}>Metodo Incasso</label>
                    <select style={sel} value={balanceData.method} onChange={e => setBalanceData({...balanceData, method: e.target.value})}>
                      <option value="">Seleziona...</option>
                      {data.userPaymentMethods.filter((m: any) => m.user_id === user.id).map((m: any) => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {balanceModal.concierge_id !== user.id && remainingFromGuest > (totale - balanceModal.concierge_fee - accontoOwner) && (
                  <div style={{ marginTop: 15, paddingTop: 15, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim }}>
                    ℹ️ Uno storno a favore del Concierge di <strong>€{Math.max(0, balanceModal.concierge_fee - accontoConcierge).toFixed(2)}</strong> verrà generato automaticamente. Il Concierge definirà il suo metodo di incasso.
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
                  <button style={{ ...btn("gold"), flex: 1 }} onClick={async () => {
                    await handleRecordFinalBalance(balanceModal.id, user.id, {
                      amount: balanceData.amount || remainingFromGuest.toFixed(2),
                      date: balanceData.date,
                      method: balanceData.method
                    });
                  }}>Registra ed Evadi</button>
                  <button style={{ ...btn(), flex: 1 }} onClick={() => setBalanceModal(null)}>Chiudi</button>
                </div>
              </div>
            </div>
          );
        })()}
        {false && confirmModal && (() => {
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
                <h3 style={h3Style}>Verifica Proposta</h3>
                <p style={{ fontSize: 12, color: C.textDim, marginTop: -10, marginBottom: 20 }}>Dettaglio incassi per {confirmModal.client_name}</p>
                
                <div style={{ ...card, background: C.surfaceAlt, marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: C.textDim }}>Totale originario:</span>
                    <strong>€{confirmModal.total_price}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: C.textDim }}>Incassato da:</span>
                    <strong style={{ color: isConciergeCollector ? C.gold : C.success }}>{isConciergeCollector ? `${conciergeName} (Concierge)` : `${user.nickname} (Owner)`}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: C.textDim }}>Importo Incassato:</span>
                    <strong>€{isConciergeCollector ? accontoConcierge : accontoOwner}</strong>
                  </div>
                </div>

                <div style={{ ...card, background: C.surfaceAlt, borderColor: C.gold + "44", marginBottom: 20 }}>
                  {isConciergeCollector && stornoOwner > 0 && (
                    <div style={{ fontSize: 13, color: C.gold }}>
                      <strong style={{ display: "block", marginBottom: 6 }}>Storno a tuo favore ({user.nickname}): €{stornoOwner}</strong>
                      <span style={{ fontSize: 11, color: C.textDim }}>Questo importo ti deve essere versato da {conciergeName} per coprire la tua quota prima del check-in.</span>
                    </div>
                  )}
                  {isConciergeCollector && stornoOwner === 0 && (
                    <div style={{ fontSize: 13, color: C.textDim }}>
                      Nessuno storno a tuo favore in questa fase. (L'acconto copre solo la commissione).
                    </div>
                  )}

                  {!isConciergeCollector && stornoConcierge > 0 && (
                    <div style={{ fontSize: 13, color: C.warning }}>
                      <strong style={{ display: "block", marginBottom: 6 }}>Attenzione: Storno in uscita (€{stornoConcierge})</strong>
                      <span style={{ fontSize: 11, color: C.textDim }}>Hai incassato tu l'acconto. Devi versare a {conciergeName} la sua provvigione generata.</span>
                    </div>
                  )}
                  {!isConciergeCollector && stornoConcierge === 0 && (
                    <div style={{ fontSize: 13, color: C.textDim }}>
                      Nessun importo trattenuto in questa fase.
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 24, textAlign: "center" }}>
                  Cliccando "Conferma" bloccherai definitivamente le date sul calendario (visibilità rossa).
                </div>

                <div style={{ ...card, background: "rgba(255,255,255,0.02)", marginBottom: 24 }}>
                  <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>Conferma ricezione Acconto / Storno:</p>
                  <div style={grid(2)}>
                    <div>
                      <label style={label}>Data ricezione</label>
                      <input style={{ ...input, padding: "6px 8px", fontSize: 12 }} type="date" value={confirmData.date} onChange={e => setConfirmData({...confirmData, date: e.target.value})} />
                    </div>
                    <div>
                      <label style={label}>Metodo</label>
                      <select style={{ ...sel, padding: "6px 8px", fontSize: 12 }} value={confirmData.method} onChange={e => setConfirmData({...confirmData, method: e.target.value})}>
                        <option value="">Seleziona...</option>
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
                    setMsg("Proposta confermata! Calendario bloccato.");
                    setConfirmModal(null);
                    refresh();
                  }}>Conferma & Blocca</button>
                  <button style={{ ...btn(), flex: 1 }} onClick={() => setConfirmModal(null)}>Annulla</button>
                </div>
              </div>
            </div>
          );
        })()}

        {false && payModal && (() => {
          const accAmt = parseFloat(accontoAmount) || 0;
          const collabRoom = payModalIsCollab ? collaboratedRooms.find((r: any) => r.id === payModal.room_id) : null;
          const collabProp = collabRoom ? collaboratedProperties.find((p: any) => p.id === collabRoom.property_id) : null;
          const collabOwner = collabProp ? data.users.find((u: any) => u.id === collabProp.owner_id) : null;
          const stornoForOwner = payModalIsCollab ? Math.max(0, accAmt - payModal.concierge_fee) : 0;

          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 500, backdropFilter: "blur(8px)" }} onClick={() => { setPayModal(null); setPayModalIsCollab(false); }}>
              <div style={{ ...card, width: 500, background: C.bg }} onClick={e => e.stopPropagation()}>
                <h3 style={h3Style}>Registrazione Acconto</h3>
                {payModalIsCollab && (
                  <div style={{ fontSize: 11, color: C.info, background: C.info + "11", border: `1px solid ${C.info}33`, borderRadius: 4, padding: "6px 10px", marginBottom: 12 }}>
                    🤝 Collaborazione — stai registrando come concierge per <strong>{collabOwner?.nickname || "Owner"}</strong>
                  </div>
                )}
                <p style={{ fontSize: 12, color: C.textDim, marginTop: -4, marginBottom: 20 }}>Totale Prenotazione: <strong style={{color: C.gold}}>€{payModal.total_price}</strong></p>

                <div style={{ ...card, background: C.surfaceAlt }}>
                  <h4 style={{ ...h3Style, fontSize: 13, marginBottom: 12 }}>Dettagli Acconto Ricevuto</h4>
                  <div style={grid(3)}>
                    <div>
                      <label style={label}>Importo</label>
                      <input style={input} type="number" value={accontoAmount} onChange={e => setAccontoAmount(e.target.value)} placeholder="€ 0.00" />
                    </div>
                    <div>
                      <label style={label}>Data</label>
                      <input style={input} type="date" value={accontoDate} onChange={e => setAccontoDate(e.target.value)} />
                    </div>
                    <div>
                      <label style={label}>Metodo Incasso</label>
                      <select style={sel} value={accontoMethod} onChange={e => setAccontoMethod(e.target.value)}>
                        <option value="">Seleziona...</option>
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
                       ℹ️ Hai incassato l'acconto. Uno storno di <strong>€{payModal.concierge_fee.toFixed(2)}</strong> verrà inviato automaticamente al Concierge, che definirà il proprio metodo di incasso in fase di verifica.
                    </div>
                  )}
                </div>

                <div style={{ ...card, background: C.surfaceAlt, marginTop: 20, borderColor: C.gold + "22" }}>
                  <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tua Commissione:</span> <span>€{payModal.concierge_fee}</span></div>
                    {payModalIsCollab ? (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", color: C.gold }}>
                          <span>Trattenuto da te (Commissione):</span>
                          <strong>€{Math.min(accAmt, payModal.concierge_fee).toFixed(2)}</strong>
                        </div>
                        {stornoForOwner > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", color: C.info }}>
                            <span>Da girare a {collabOwner?.nickname || "Owner"}:</span>
                            <strong>€{stornoForOwner.toFixed(2)}</strong>
                          </div>
                        )}
                      </>
                    ) : payModal.concierge_id === user.id ? (
                      <div style={{ display: "flex", justifyContent: "space-between", color: C.success }}>
                        <span>Trattenuto da te (Proprietario Diretto):</span>
                        <strong>€{accAmt.toFixed(2)}</strong>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", color: C.gold }}>
                        <span>Storno da pagare al Concierge:</span>
                        <strong>€{Math.min(accAmt, payModal.concierge_fee).toFixed(2)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
                  <button style={{ ...btn("gold"), flex: 1 }} onClick={payModalIsCollab ? handleRegisterCollabPayment : handleRegisterPayment}>Salva Registrazione Acconto</button>
                  <button style={{ ...btn(), flex: 1 }} onClick={() => { setPayModal(null); setPayModalIsCollab(false); }}>Annulla</button>
                </div>
              </div>
            </div>
          );
        })()}

        {viewCalendar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 300, backdropFilter: "blur(10px)" }}>
          <div style={{ ...card, width: 500, background: C.bg }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ ...h3Style, margin: 0 }}>Gestione {allRooms.find((r: any) => r.id === viewCalendar)?.name}</h3>
              <button style={btn()} onClick={() => setViewCalendar(null)}>Chiudi</button>
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
            />
          </div>
        </div>
      )}

      {editPricing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 200 }} onClick={() => setEditPricing(null)}>
          <div style={{ ...card, width: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={h3Style}>Prezzo — {editPricing.month}</h3>
            <div style={{ marginBottom: 12 }}><label style={label}>Base/notte (€)</label><input style={input} type="number" value={editPricing.basePrice} onChange={e => setEditPricing({ ...editPricing, basePrice: e.target.value })} /></div>
            <div style={{ marginBottom: 16 }}><label style={label}>Pulizia (€)</label><input style={input} type="number" value={editPricing.cleaningFee} onChange={e => setEditPricing({ ...editPricing, cleaningFee: e.target.value })} /></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn("gold"), flex: 1 }} onClick={handleSavePricing}>Salva</button>
              <button style={{ ...btn(), flex: 1 }} onClick={() => setEditPricing(null)}>Annulla</button>
            </div>
          </div>
        </div>
      )}

      {editRoom && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 400, backdropFilter: "blur(5px)" }}>
          <div style={{ ...card, width: 360 }}>
            <h3 style={h3Style}>Modifica Camera</h3>
            <div style={{ marginBottom: 12 }}><label style={label}>Nome</label><input style={input} value={editRoom.name} onChange={e => setEditRoom({ ...editRoom, name: e.target.value })} /></div>
            <div style={{ marginBottom: 12 }}><label style={label}>Capacità</label><input style={input} type="number" value={editRoom.capacity} onChange={e => setEditRoom({ ...editRoom, capacity: e.target.value })} /></div>
            <div style={{ marginBottom: 16 }}><label style={label}>Descrizione</label><textarea style={{ ...input, minHeight: 80, resize: "vertical" }} value={editRoom.description} onChange={e => setEditRoom({ ...editRoom, description: e.target.value })} placeholder="Descrizione dell'appartamento..." /></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn("gold"), flex: 1 }} onClick={handleUpdateRoom}>Salva</button>
              <button style={{ ...btn(), flex: 1 }} onClick={() => setEditRoom(null)}>Annulla</button>
            </div>
          </div>
        </div>
      )}

      {addPricing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 450, backdropFilter: "blur(5px)" }}>
          <div style={{ ...card, width: 360 }} onClick={e => e.stopPropagation()}>
            <h3 style={h3Style}>Aggiungi Mese al Listino</h3>
            <div style={{ marginBottom: 12 }}><label style={label}>Mese</label><input style={input} type="month" value={addPricing.month} onChange={e => setAddPricing({ ...addPricing, month: e.target.value })} /></div>
            <div style={{ marginBottom: 12 }}><label style={label}>Base/notte (€)</label><input style={input} type="number" value={addPricing.basePrice} onChange={e => setAddPricing({ ...addPricing, basePrice: e.target.value })} /></div>
            <div style={{ marginBottom: 16 }}><label style={label}>Pulizia (€)</label><input style={input} type="number" value={addPricing.cleaningFee} onChange={e => setAddPricing({ ...addPricing, cleaningFee: e.target.value })} /></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn("gold"), flex: 1 }} onClick={handleAddPricingMonth}>Aggiungi</button>
              <button style={{ ...btn(), flex: 1 }} onClick={() => setAddPricing(null)}>Annulla</button>
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
             stornoLabel = `Storno dovuto a ${user?.nickname || 'Silvia'} (Owner):`;
             stornoVal = Math.max(0, accAmt - currentFee);
          } else {
             stornoLabel = "Storno dovuto al Concierge:";
             stornoVal = currentFee;
          }

          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 600, backdropFilter: "blur(8px)" }} onClick={() => setAdjModal(null)}>
              <div style={{ ...card, width: 450, background: C.bg, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                <h3 style={h3Style}>Aggiustamenti Prezzo</h3>
                <p style={{ fontSize: 12, color: C.textDim, marginTop: -10, marginBottom: 20 }}>I totali e lo storno vengono ricalcolati automaticamente.</p>
                
                <label style={label}>Variazioni Giornaliere (€)</label>
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
                  <label style={label}>Commissione Concierge (€)</label>
                  <input 
                    type="number" 
                    style={{ ...input, borderColor: C.gold + "66" }} 
                    placeholder="Commissione" 
                    value={localFee} 
                    onChange={e => setLocalFee(e.target.value)} 
                  />
                  <p style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>Modifica la commissione concierge per questa prenotazione.</p>
                </div>

                <div style={{ ...card, background: "rgba(200,169,110,0.05)", borderColor: C.gold + "44" }}>
                  <h4 style={{ ...h3Style, fontSize: 13, marginBottom: 12, color: C.gold }}>Riepilogo Finanziario Live</h4>
                  <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.textDim }}>Prezzo Base (x notte):</span>
                      <strong style={{ color: C.text }}>€{nightlyBase.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.textDim }}>Prezzo Finale (x notte):</span>
                      <strong style={{ color: C.gold }}>€{nightlyNew.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}44`, paddingTop: 8 }}>
                      <span style={{ color: C.textDim }}>Soggiorno ({days.length} notti):</span>
                      <strong style={{ color: C.text }}>€{liveStay.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.textDim }}>Pulizie (Fisse):</span>
                      <strong style={{ color: C.text }}>€{cleaning.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}44`, paddingTop: 8 }}>
                      <span style={{ color: C.gold, fontWeight: 600 }}>Totale {user?.nickname || 'Owner'}:</span>
                      <strong style={{ color: C.gold, fontSize: 14 }}>€{liveOwner.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.textDim }}>Commissione Concierge:</span>
                      <strong style={{ color: C.text }}>€{currentFee.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}44`, paddingTop: 8, marginTop: 4 }}>
                      <span style={{ color: C.textDim }}>{stornoLabel}</span>
                      <strong style={{ color: C.gold }}>€{stornoVal.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: `2px solid ${C.gold}44`, paddingTop: 10, marginTop: 4 }}>
                      <span style={{ fontWeight: 700, color: C.gold }}>TOTALE PRENOTAZIONE:</span>
                      <strong style={{ fontSize: 18, color: C.gold }}>€{liveTotal.toFixed(2)}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
                  <button style={{ ...btn("gold"), flex: 1 }} onClick={handleSaveAdjustments}>Salva ed Aggiorna</button>
                  <button style={{ ...btn(), flex: 1 }} onClick={() => setAdjModal(null)}>Annulla</button>
                </div>
              </div>
            </div>
          );
        })()}
        {tab === "settings" && (
          <div>
            {/* Referral link — owner */}
            <div style={{ ...card, background: C.goldGlow, borderColor: C.borderGold, marginBottom: 16 }}>
              <h3 style={h3Style}>🔗 Il Tuo Link Referral</h3>
              <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 1.7 }}>
                Condividi questo link con i tuoi clienti. Le richieste ricevute vengono associate al tuo account e tracciate nella sezione Richieste Clienti.
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, padding: "12px 16px", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "'DM Sans', monospace", fontSize: 13, color: C.gold, minWidth: 200, wordBreak: "break-all" }}>
                  {typeof window !== "undefined" ? `${window.location.origin}?ref=${user.nickname}` : `https://auraibiza.com?ref=${user.nickname}`}
                </div>
                <button style={btn("gold")} onClick={() => {
                  const url = `${window.location.origin}?ref=${user.nickname}`;
                  navigator.clipboard.writeText(url).then(() => setMsg("✓ Link copiato!"));
                }}>Copia Link</button>
              </div>
            </div>

            <div style={card}>
              <h2 style={h2Style}>⚙️ Impostazioni Metodi di Pagamento</h2>
              <p style={{ color: C.textDim, fontSize: 13, marginBottom: 20 }}>Gestisci i metodi di pagamento che potrai selezionare durante la verifica degli incassi.</p>
              <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                <input style={{ ...input, flex: 1 }} value={newMethodName} onChange={e => setNewMethodName(e.target.value)} placeholder="Aggiungi metodo (es. Zen, Banca...)" />
                <button style={btn("gold")} onClick={async () => {
                  if (!newMethodName.trim()) return;
                  await addPaymentMethod(user.id, newMethodName);
                  setNewMethodName("");
                  refresh();
                }}>Aggiungi</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {data.userPaymentMethods.filter((m: any) => m.user_id === user.id).map((m: any) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.surfaceAlt, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <span style={{ fontWeight: 600 }}>{m.name}</span>
                    <button style={{ ...btn(), color: C.danger, padding: "2px 8px" }} onClick={() => setConfirmingDeleteMethod(m.id)}>Elimina</button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...card, marginTop: 16 }}>
              <h3 style={h3Style}>🔑 Cambia Password</h3>
              <p style={{ color: C.textDim, fontSize: 13, marginBottom: 20 }}>Aggiorna la password del tuo account <strong style={{ color: C.gold }}>{user.nickname}</strong>.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
                <div><label style={label}>Password Attuale</label><input type="password" style={input} value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="••••••••" /></div>
                <div><label style={label}>Nuova Password</label><input type="password" style={input} value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="min. 6 caratteri" /></div>
                <div><label style={label}>Conferma Nuova Password</label><input type="password" style={input} value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="••••••••" /></div>
                {pwMsg && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 4, background: pwMsg.ok ? C.success + "20" : C.danger + "20", color: pwMsg.ok ? C.success : C.danger, border: `1px solid ${pwMsg.ok ? C.success : C.danger}44` }}>{pwMsg.text}</div>}
                <button style={{ ...btn("gold"), alignSelf: "flex-start" }} onClick={async () => {
                  setPwMsg(null);
                  if (!pwCurrent || !pwNew || !pwConfirm) { setPwMsg({ text: "Compila tutti i campi.", ok: false }); return; }
                  if (pwNew !== pwConfirm) { setPwMsg({ text: "Le nuove password non coincidono.", ok: false }); return; }
                  const res = await changePasswordAction(user.id, pwCurrent, pwNew);
                  if ((res as any).error) { setPwMsg({ text: (res as any).error, ok: false }); }
                  else { setPwMsg({ text: "Password aggiornata con successo!", ok: true }); setPwCurrent(""); setPwNew(""); setPwConfirm(""); }
                }}>Aggiorna Password</button>
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
              <button style={{ ...btn(), width: "100%", marginTop: 20 }} onClick={() => setViewNotes(null)}>Chiudi</button>
            </div>
          </div>
        )}
        {deleteBookingId && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100, backdropFilter: "blur(8px)" }}>
            <div style={{ ...card, width: 320, textAlign: "center", animation: "modalIn 0.2s ease-out" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
              <h3 style={{ ...h3Style, marginBottom: 8 }}>Conferma Eliminazione</h3>
              <p style={{ color: C.textDim, fontSize: 13, marginBottom: 24 }}>Sicuro di voler eliminare questa prenotazione? Le date verranno sbloccate e i conti ripristinati.</p>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...btn(), flex: 1 }} onClick={() => setDeleteBookingId(null)}>Annulla</button>
                <button style={{ ...btn(C.danger), flex: 1 }} onClick={() => performDeleteBooking(deleteBookingId)}>Elimina</button>
              </div>
            </div>
          </div>
        )}
        {confirmingDeleteMethod && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1200, backdropFilter: "blur(8px)" }} onClick={() => setConfirmingDeleteMethod(null)}>
            <div style={{ ...card, width: 350, background: C.bg, textAlign: "center" }} onClick={e => e.stopPropagation()}>
              <h3 style={h3Style}>Conferma Eliminazione Metodo</h3>
              <p style={{ fontSize: 14, color: C.textDim, marginBottom: 24 }}>Sei sicuro di voler eliminare questo metodo di pagamento?</p>
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...btn(), flex: 1 }} onClick={() => setConfirmingDeleteMethod(null)}>Annulla</button>
                <button style={{ ...btn(), background: C.danger, color: "#fff", flex: 1, border: "none" }} onClick={async () => {
                  if (confirmingDeleteMethod) {
                    await deletePaymentMethod(confirmingDeleteMethod);
                    setConfirmingDeleteMethod(null);
                    refresh();
                  }
                }}>Elimina</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- ADMIN DASHBOARD ---
function AdminDashboard({ user, data, refresh }: { user: User; data: any; refresh: () => void }) {
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

  const handleApprove = async (userId: string) => {
    await approveUser(userId);
    setMsg("Utente approvato");
    refresh();
  };
  const handleReject = async (userId: string) => {
    if (!confirm("Rifiutare e rimuovere questo utente?")) return;
    await rejectUser(userId);
    setMsg("Utente rifiutato e rimosso");
    refresh();
  };
  const handleRoleChange = async (userId: string, newRole: string) => {
    await updateUserRole(userId, newRole);
    setMsg("Ruolo aggiornato");
    refresh();
  };
  const handleDeleteUser = async (userId: string, nick: string) => {
    if (!confirm(`Eliminare l'utente "${nick}"? L'azione è irreversibile.`)) return;
    await deleteUserAction(userId);
    setMsg(`Utente ${nick} eliminato`);
    refresh();
  };
  const handleSaveCommission = async (userId: string) => {
    const rate = parseFloat(commRates[userId] || "0");
    if (isNaN(rate) || rate < 0 || rate > 100) { setMsg("⚠ Percentuale non valida (0-100)"); return; }
    await setCommissionRule(userId, rate, 'percentage');
    setMsg("Regola commissione salvata");
    refresh();
  };

  const roleIcon = (r: string) => ({ admin: "👑", owner: "🏠", concierge: "🤵", agent: "👤" }[r] || "👤");
  const totalBookings = (data.bookings || []).length;
  const confirmedBookings = (data.bookings || []).filter((b: any) => b.status === "confirmed_owner" || b.status === "evaso").length;
  const totalRevenue = (data.bookings || []).filter((b: any) => ["confirmed_owner","evaso"].includes(b.status)).reduce((s: number, b: any) => s + b.total_price, 0);

  return (
    <div>
      <div style={nav}>
        {[
          { key: "users", l: "👥 Utenti" },
          { key: "pending", l: `⏳ In Attesa${pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ""}` },
          { key: "requests", l: "📥 Richieste Clienti" },
          { key: "platform", l: "⚙️ Commissioni" },
          { key: "commissions", l: "💰 Fee Concierge" },
          { key: "overview", l: "📊 Overview" },
        ].map(t => (
          <div key={t.key} style={navItem(tab === t.key)} onClick={() => setTab(t.key)}>{t.l}</div>
        ))}
      </div>
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        {msg && <div style={{ ...card, background: msg.startsWith("⚠") ? C.warning + "15" : C.success + "15", borderColor: msg.startsWith("⚠") ? C.warning + "44" : C.success + "44", fontSize: 12, color: msg.startsWith("⚠") ? C.warning : C.success }}>{msg} <span style={{ float: "right", cursor: "pointer" }} onClick={() => setMsg("")}>✕</span></div>}

        {tab === "pending" && (
          <div>
            <h2 style={h2Style}>Registrazioni in Attesa</h2>
            {pendingUsers.length === 0 ? (
              <div style={{ ...card, textAlign: "center", color: C.textDim }}>Nessuna registrazione in attesa.</div>
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
                        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Ruolo: <span style={{ color: C.text }}>{roleIcon(u.role)} {u.role}</span></div>
                        {u.email && <div style={{ fontSize: 11, color: C.textDim }}>{u.email}</div>}
                        {u.phone && <div style={{ fontSize: 11, color: C.textDim }}>{u.phone}</div>}
                        <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>Registrato il {new Date(u.created_at).toLocaleDateString("it-IT")}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select style={{ ...sel, width: 130, padding: "4px 8px", fontSize: 11 }} defaultValue={u.role} onChange={e => updateUserRole(u.id, e.target.value)}>
                        {["owner", "concierge", "agent"].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button style={{ ...btn("gold"), fontSize: 11 }} onClick={() => handleApprove(u.id)}>✓ Approva</button>
                      <button style={{ ...btn(), fontSize: 11, color: C.danger, borderColor: C.danger + "44" }} onClick={() => handleReject(u.id)}>✕ Rifiuta</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "users" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ ...h2Style, marginBottom: 0 }}>Gestione Utenti</h2>
              <div style={{ fontSize: 12, color: C.textDim }}>{allUsers.length} utenti totali</div>
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
                            <div style={{ fontSize: 11, color: C.textDim, fontStyle: "italic" }}>Nessun contatto registrato</div>
                          )}
                        </div>
                      </div>

                      {/* Colonna centrale: dettagli ruolo + servizi */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>Profilo</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, marginBottom: 12 }}>
                          <div><span style={{ color: C.textDim }}>Ruolo</span><br /><strong style={{ color: C.text }}>{roleIcon(u.role)} {u.role}</strong></div>
                          <div><span style={{ color: C.textDim }}>Registrato</span><br /><strong style={{ color: C.text }}>{new Date(u.created_at).toLocaleDateString("it-IT")}</strong></div>
                          {u.managed_by && <div><span style={{ color: C.textDim }}>Gestito da</span><br /><strong style={{ color: C.text }}>{u.managed_by}</strong></div>}
                          {userProps.length > 0 && <div><span style={{ color: C.textDim }}>Proprietà</span><br /><strong style={{ color: C.success }}>{userProps.length}</strong></div>}
                        </div>
                        {services.length > 0 && (
                          <div>
                            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 6 }}>Servizi offerti</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {services.map((s: string) => (
                                <span key={s} style={{ padding: "3px 10px", borderRadius: 20, background: C.surfaceAlt, border: `1px solid ${C.border}`, fontSize: 10, color: C.textMuted }}>{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {agentCollabs.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 6 }}>Collaborazioni agente</div>
                            {agentCollabs.map((c: any) => (
                              <div key={c.id} style={{ fontSize: 11, color: C.textMuted }}>
                                {c.concierge_id === u.id ? `→ Agente: ${c.agent_nickname}` : `← Concierge: ${c.concierge_nickname}`}
                                <span style={{ color: C.gold, marginLeft: 6 }}>{c.commission_rate}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Colonna destra: azioni */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 150 }}>
                        <div>
                          <label style={{ ...label, marginBottom: 4 }}>Cambia ruolo</label>
                          <select style={{ ...sel, padding: "6px 10px", fontSize: 11 }} value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}>
                            {["owner", "concierge", "agent", "admin"].map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        {u.email && (
                          <a href={`mailto:${u.email}`} style={{ ...btn(), textDecoration: "none", textAlign: "center", padding: "7px 12px", fontSize: 10 }}>✉ Scrivi email</a>
                        )}
                        <button style={{ ...btn(), fontSize: 10, padding: "7px 12px", color: C.danger, borderColor: C.danger + "44" }} onClick={() => handleDeleteUser(u.id, u.nickname)}>🗑 Elimina utente</button>
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
              <h2 style={h2Style}>Richieste dal Sito</h2>
              <div style={{ display: "flex", gap: 8 }}>
                {["all","new","read","replied","declined"].map(s => (
                  <button key={s} onClick={() => setReqFilter(s)} style={{ ...btn(reqFilter === s ? "gold" : "default"), padding: "6px 14px", fontSize: 10 }}>
                    {s === "all" ? "Tutte" : s === "new" ? "Nuove" : s === "read" ? "Lette" : s === "replied" ? "Risposte" : "Rifiutate"}
                  </button>
                ))}
              </div>
            </div>
            {bookingReqs.filter((r: any) => reqFilter === "all" || r.status === reqFilter).length === 0 ? (
              <div style={{ ...card, textAlign: "center", color: C.textDim, padding: 48 }}>Nessuna richiesta trovata.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {bookingReqs.filter((r: any) => reqFilter === "all" || r.status === reqFilter).map((req: any) => {
                  const statusColors: Record<string, string> = { new: C.warning, read: C.info, replied: C.success, declined: C.danger };
                  const statusLabels: Record<string, string> = { new: "Nuova", read: "Letta", replied: "Risposta inviata", declined: "Rifiutata" };
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
                            {req.referral_code && <span style={{ ...badge(C.info), gap: 4 }}>🤝 via {req.referral_code}</span>}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, fontSize: 12 }}>
                            {req.property_name && <div><span style={{ color: C.textDim }}>Proprietà:</span> <strong style={{ color: C.text }}>{req.property_name}</strong></div>}
                            {req.room_name && <div><span style={{ color: C.textDim }}>Unità:</span> <strong style={{ color: C.text }}>{req.room_name}</strong></div>}
                            {req.client_email && <div><span style={{ color: C.textDim }}>Email:</span> <a href={`mailto:${req.client_email}`} style={{ color: C.gold }}>{req.client_email}</a></div>}
                            {req.client_phone && <div><span style={{ color: C.textDim }}>Tel:</span> <a href={`tel:${req.client_phone}`} style={{ color: C.gold }}>{req.client_phone}</a></div>}
                            {req.check_in && <div><span style={{ color: C.textDim }}>Check-in:</span> <strong>{req.check_in}</strong></div>}
                            {req.check_out && <div><span style={{ color: C.textDim }}>Check-out:</span> <strong>{req.check_out}</strong></div>}
                            {req.guests > 1 && <div><span style={{ color: C.textDim }}>Ospiti:</span> <strong>{req.guests}</strong></div>}
                            {req.platform_fee_rate > 0 && <div><span style={{ color: C.textDim }}>Comm. piattaforma:</span> <strong style={{ color: C.gold }}>{req.platform_fee_rate}%</strong></div>}
                          </div>
                          {req.message && <div style={{ marginTop: 12, padding: "10px 14px", background: C.surfaceAlt, borderRadius: 8, fontSize: 12, color: C.textMuted, fontStyle: "italic", borderLeft: `2px solid ${C.border}` }}>"{req.message}"</div>}
                          <div style={{ fontSize: 10, color: C.textDim, marginTop: 8 }}>Ricevuta il {new Date(req.created_at).toLocaleDateString("it-IT", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 120 }}>
                          <select style={{ ...sel, padding: "6px 10px", fontSize: 11 }} value={req.status} onChange={async e => { await updateBookingRequestStatus(req.id, e.target.value); getBookingRequests().then(setBookingReqs); }}>
                            <option value="new">Nuova</option>
                            <option value="read">Letta</option>
                            <option value="replied">Risposta inviata</option>
                            <option value="declined">Rifiutata</option>
                          </select>
                          {req.client_email && <a href={`mailto:${req.client_email}?subject=Aura Ibiza – Risposta alla tua richiesta`} style={{ ...btn("gold"), textDecoration: "none", textAlign: "center", padding: "7px 12px", fontSize: 10 }}>✉ Rispondi</a>}
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
            <h2 style={h2Style}>Commissioni Piattaforma</h2>
            <p style={{ color: C.textDim, fontSize: 13, marginBottom: 28, lineHeight: 1.7 }}>
              Configura la percentuale che la piattaforma trattiene su ogni prenotazione. La commissione si applica sull&apos;importo owner (non sulla fee concierge).<br />
              <strong style={{ color: C.gold }}>Priorità:</strong> Owner+Tipo &gt; Solo Owner &gt; Solo Tipo &gt; Default globale
            </p>

            {/* Add new commission */}
            <div style={{ ...card, borderColor: C.borderGold, marginBottom: 28 }}>
              <h3 style={h3Style}>Aggiungi / Aggiorna Regola</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px auto", gap: 12, alignItems: "flex-end" }}>
                <div>
                  <label style={label}>Owner</label>
                  <select style={sel} value={newCommOwnerId} onChange={e => setNewCommOwnerId(e.target.value)}>
                    <option value="__global__">🌐 Default globale</option>
                    {(data.users || []).filter((u: any) => u.role === "owner").map((u: any) => (
                      <option key={u.id} value={u.id}>🏠 {u.nickname}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={label}>Tipo asset</label>
                  <select style={sel} value={newCommAssetType} onChange={e => setNewCommAssetType(e.target.value)}>
                    <option value="__all__">Tutti i tipi</option>
                    <option value="apartment">🏠 Appartamento</option>
                    <option value="villa">🏡 Villa</option>
                    <option value="boat">⛵ Barca</option>
                    <option value="car">🚗 Auto</option>
                    <option value="scooter">🛵 Scooter</option>
                  </select>
                </div>
                <div>
                  <label style={label}>% Commissione</label>
                  <input style={input} type="number" min="0" max="50" step="0.5" value={newCommRate} onChange={e => setNewCommRate(e.target.value)} placeholder="es. 10" />
                </div>
                <div>
                  <button style={{ ...btn("gold"), padding: "11px 20px" }} onClick={async () => {
                    const ownerId = newCommOwnerId === "__global__" ? null : newCommOwnerId;
                    const assetType = newCommAssetType === "__all__" ? null : newCommAssetType;
                    const rate = parseFloat(newCommRate);
                    if (isNaN(rate) || rate < 0) { setMsg("⚠ Percentuale non valida"); return; }
                    const res = await upsertPlatformCommission(ownerId, assetType, rate);
                    if ((res as any).success) { setMsg("Regola salvata"); getPlatformCommissions().then(setPlatComms); }
                    else setMsg("⚠ Errore: " + (res as any).error);
                  }}>Salva Regola</button>
                </div>
              </div>
            </div>

            {/* Commission rules table */}
            {platComms.length === 0 ? (
              <div style={{ ...card, textAlign: "center", color: C.textDim, padding: 40 }}>Nessuna regola configurata. Aggiungi un default globale per iniziare.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr>
                    {["Owner", "Tipo Asset", "Commissione %", "Esempio su €1000", ""].map(h => <th key={h} style={th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {platComms.map((c: any) => (
                      <tr key={c.id}>
                        <td style={td}>{c.owner_nickname ? <><span style={{ color: C.gold }}>🏠 {c.owner_nickname}</span></> : <span style={{ color: C.textDim }}>🌐 Default globale</span>}</td>
                        <td style={td}>{c.asset_type ? <span style={{ color: C.text }}>{c.asset_type}</span> : <span style={{ color: C.textDim }}>Tutti i tipi</span>}</td>
                        <td style={{ ...td, fontFamily: FONT, fontSize: 18, color: C.gold }}>{c.rate}%</td>
                        <td style={td}>
                          <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                            <div>Owner incassa: <strong style={{ color: C.success }}>€{(1000 - 1000 * c.rate / 100).toFixed(0)}</strong></div>
                            <div>Piattaforma: <strong style={{ color: C.gold }}>€{(1000 * c.rate / 100).toFixed(0)}</strong></div>
                          </div>
                        </td>
                        <td style={td}><button style={{ ...btn(), color: C.danger, padding: "4px 10px", fontSize: 10, borderColor: C.danger + "44" }} onClick={async () => { await deletePlatformCommission(c.id); getPlatformCommissions().then(setPlatComms); setMsg("Regola eliminata"); }}>Elimina</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Referral info box */}
            <div style={{ ...card, marginTop: 28, background: C.goldGlow, borderColor: C.borderGold }}>
              <h3 style={h3Style}>🔗 Come funziona il referral</h3>
              <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 2 }}>
                <div>• Ogni concierge/agente ha un link referral personale: <code style={{ color: C.gold, background: C.surfaceAlt, padding: "2px 8px", borderRadius: 4 }}>auraibiza.com?ref=<em>nickname</em></code></div>
                <div>• Il cliente arriva sul sito, clicca "Richiedi" — la richiesta viene associata automaticamente all&apos;agente</div>
                <div>• La piattaforma incassa il totale e distribuisce: owner (prezzo base − commissione piattaforma) + concierge/agente (fee referral) + piattaforma (commissione %)</div>
                <div>• Lo split viene calcolato e registrato in ogni prenotazione nella sezione pagamenti</div>
              </div>
            </div>
          </div>
        )}

        {tab === "commissions" && (
          <div>
            <h2 style={h2Style}>Regole di Commissione</h2>
            <p style={{ color: C.textDim, fontSize: 12, marginBottom: 20 }}>Configura la percentuale che ogni agente/concierge deve cedere al suo superiore diretto. La regola si applica sulla fee maturata da ogni prenotazione.</p>
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
                      <label style={{ ...label, fontSize: 9 }}>Split % verso superiore</label>
                      <input style={{ ...input, width: 100 }} type="number" min="0" max="100" placeholder="es. 20" value={current} onChange={e => setCommRates(prev => ({ ...prev, [u.id]: e.target.value }))} />
                    </div>
                    <button style={btn("gold")} onClick={() => handleSaveCommission(u.id)}>Salva</button>
                    {rule && <span style={{ fontSize: 11, color: C.success }}>Attuale: {rule.rate}%</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "overview" && (
          <div>
            <h2 style={h2Style}>Overview Piattaforma</h2>

            {/* Admin referral link */}
            <div style={{ ...card, background: C.goldGlow, borderColor: C.borderGold, marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h3 style={{ ...h3Style, marginBottom: 4 }}>🔗 Il Tuo Link Referral Admin</h3>
                  <p style={{ fontSize: 12, color: C.textMuted }}>Usa questo link per portare clienti direttamente sulla vetrina con il tuo codice referral.</p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ padding: "10px 16px", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "monospace", fontSize: 12, color: C.gold, wordBreak: "break-all" }}>
                    {typeof window !== "undefined" ? `${window.location.origin.replace("/platform","")}?ref=${user.nickname}` : `https://auraibiza.com?ref=${user.nickname}`}
                  </div>
                  <button style={btn("gold")} onClick={() => {
                    const base = window.location.origin.replace("/platform","");
                    navigator.clipboard.writeText(`${base}?ref=${user.nickname}`).then(() => setMsg("✓ Link copiato!"));
                  }}>Copia</button>
                </div>
              </div>
            </div>

            <div style={grid(4)}>
              <div style={card}><div style={label}>Utenti Totali</div><div style={{ fontFamily: FONT, fontSize: 32, color: C.gold }}>{allUsers.length}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{allUsers.filter((u:any)=>u.role==='owner').length} owner · {allUsers.filter((u:any)=>u.role==='concierge').length} concierge · {allUsers.filter((u:any)=>u.role==='agent').length} agenti</div>
              </div>
              <div style={card}><div style={label}>Proprietà</div><div style={{ fontFamily: FONT, fontSize: 32, color: C.goldLight }}>{(data.properties || []).length}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{(data.properties||[]).filter((p:any)=>p.is_public!==0).length} in vetrina</div>
              </div>
              <div style={card}><div style={label}>Prenotazioni</div><div style={{ fontFamily: FONT, fontSize: 32, color: C.text }}>{totalBookings}</div><div style={{ fontSize: 10, color: C.success, marginTop: 4 }}>{confirmedBookings} confermate</div></div>
              <div style={card}>
                <div style={label}>Fatturato Confermato</div>
                <div style={{ fontFamily: FONT, fontSize: 24, color: C.success }}>€{totalRevenue.toFixed(0)}</div>
                {(() => {
                  const confirmed = (data.bookings||[]).filter((b:any)=>["confirmed_owner","evaso"].includes(b.status));
                  const platFees = confirmed.reduce((s:number,b:any)=>s+(b.platform_fee||0),0);
                  return platFees > 0 ? <div style={{ fontSize: 10, color: C.gold, marginTop: 4 }}>di cui €{platFees.toFixed(0)} commissioni piattaforma</div> : null;
                })()}
              </div>
            </div>
            <div style={card}>
              <h3 style={h3Style}>Distribuzione Asset</h3>
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
              <h3 style={h3Style}>Ultime Prenotazioni</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr>{["Cliente","Concierge","Proprietà","Date","Totale","Status"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{(data.bookings || []).slice(0, 10).map((b: any) => {
                  const conc = allUsers.find((u: any) => u.id === b.concierge_id);
                  const room = (data.rooms || []).find((r: any) => r.id === b.room_id);
                  const prop = (data.properties || []).find((p: any) => p.id === room?.property_id);
                  const st = STATUS_MAP[b.status] || { label: b.status, color: C.textDim };
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

export default function Home() {
  const isMobile = useIsMobile();
  const [user, setUser] = useState<User | null>(null);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbData, setDbData] = useState<any>(null);
  const [pdfPreview, setPdfPreview] = useState<{ booking: Booking; room: Room | undefined; property: Property | undefined } | null>(null);

  // Registration extended fields
  const [regRole, setRegRole] = useState<"owner" | "concierge" | "agent">("concierge");
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regServices, setRegServices] = useState<string[]>([]);
  const [regAvatar, setRegAvatar] = useState<string | null>(null);
  const [regStep, setRegStep] = useState<1 | 2>(1);

  // Apri direttamente il form di registrazione se arriva da ?register=1
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("register") === "1") {
        setIsRegister(true);
        setRegStep(1);
      }
    }
  }, []);

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
    if (!nickname.trim() || !password.trim()) { alert("Inserisci nickname e password."); return; }
    setLoading(true);
    const res = await loginOrRegister(nickname, password);
    if ((res as any).error) {
      alert((res as any).error);
      setLoading(false);
      return;
    }
    setUser(res as any);
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!nickname.trim() || !password.trim()) { alert("Inserisci nickname e password."); return; }
    setLoading(true);
    const res = await registerUser(nickname, password, regRole, {
      firstName: regFirstName, lastName: regLastName,
      email: regEmail, phone: regPhone, services: regServices,
      avatar: regAvatar || undefined,
    });
    if ((res as any).error) {
      alert((res as any).error);
      setLoading(false);
      return;
    }
    alert("Registrazione inviata! Il tuo account è in attesa di approvazione dall'admin.");
    setIsRegister(false);
    setPassword(""); setRegFirstName(""); setRegLastName(""); setRegEmail(""); setRegPhone(""); setRegServices([]); setRegAvatar(null);
    setRegStep(1);
    setLoading(false);
  };

  const handleInit = async () => {
    setLoading(true);
    const res = await initDatabase();
    if (!res.success) {
      alert("Errore inizializzazione: " + res.error);
    } else {
      await fetchAll();
    }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!confirm("Sicuro di voler resettare tutto? I dati verranno riportati allo stato iniziale.")) return;
    setLoading(true);
    const res = await resetDatabase();
    if (!res.success) {
      alert("Errore reset: " + res.error);
    } else {
      setUser(null);
      await fetchAll();
    }
    setLoading(false);
  };

  if (loading || !dbData) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.gold, display: "flex", justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
        Caricamento Aura Ibiza...
      </div>
    );
  }

  if (dbData && dbData._error) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.danger, padding: 40, fontFamily: FONT }}>
        <h2 style={h2Style}>Errore Server</h2>
        <p style={{ color: C.text, marginBottom: 20 }}>Il server non è riuscito a connettersi al database (Turso) o ha riscontrato un'eccezione crititca durante l'avvio.</p>
        <div style={{ padding: 20, background: "rgba(255,0,0,0.1)", border: `1px solid ${C.danger}`, borderRadius: 8, fontFamily: "monospace", color: C.danger }}>
          {dbData._error}
        </div>
      </div>
    );
  }

  if (dbData && dbData.users?.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.gold, display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 20 }}>
        <h2 style={h2Style}>Database Vuoto</h2>
        <button style={btn("gold")} onClick={handleInit}>Inizializza Database</button>
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
        display: "flex", justifyContent: "center", alignItems: "center", padding: "20px",
      }}>
        <div style={{ width: "100%", maxWidth: isRegister ? 520 : 400, textAlign: "center" }}>
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

          {/* Login form */}
          {!isRegister && (
            <div style={cardGlass}>
              <h2 style={{ ...h2Style, textAlign: "center", marginBottom: 28, fontSize: 18, letterSpacing: "3px" }}>ACCESSO RISERVATO</h2>
              <form onSubmit={e => { e.preventDefault(); handleLogin(); }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Nickname</label>
                  <input style={input} value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Il tuo nickname..." autoComplete="username" />
                </div>
                <div style={{ marginBottom: 28 }}>
                  <label style={label}>Password</label>
                  <input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                </div>
                <button style={{ ...btn("gold"), width: "100%", padding: "14px 20px", fontSize: 12, letterSpacing: "2px" }} type="submit">Accedi</button>
              </form>
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                <span style={{ fontSize: 12, color: C.textDim }}>Non hai un account?</span>
                <button style={{ background: "none", border: "none", color: C.gold, fontSize: 12, cursor: "pointer", marginLeft: 8, padding: 0, textDecoration: "underline" }} onClick={() => { setIsRegister(true); setRegStep(1); }}>
                  Registrati
                </button>
              </div>
              <div style={{ marginTop: 12, fontSize: 10, color: C.textDim, textAlign: "center", fontStyle: "italic" }}>L&apos;accesso è consentito solo agli utenti autorizzati.</div>
            </div>
          )}

          {/* Registration form — Step 1: role */}
          {isRegister && regStep === 1 && (
            <div style={cardGlass}>
              <h2 style={{ ...h2Style, textAlign: "center", marginBottom: 8, fontSize: 18, letterSpacing: "2px" }}>CREA ACCOUNT</h2>
              <p style={{ color: C.textDim, fontSize: 12, marginBottom: 28, textAlign: "center" }}>Seleziona il tuo ruolo per personalizzare l&apos;accesso</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
                {([
                  { key: "owner", icon: "🏠", label: "Proprietario", desc: "Gestisco immobili e asset" },
                  { key: "concierge", icon: "🤵", label: "Concierge", desc: "Gestisco prenotazioni clienti" },
                  { key: "agent", icon: "🌐", label: "Agente", desc: "Collaboro con più owner" },
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
                Continua →
              </button>
              <div style={{ marginTop: 20, textAlign: "center" }}>
                <button style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }} onClick={() => setIsRegister(false)}>
                  ← Torna al login
                </button>
              </div>
            </div>
          )}

          {/* Registration form — Step 2: details + services */}
          {isRegister && regStep === 2 && (
            <div style={{ ...cardGlass, textAlign: "left", maxHeight: "85vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => setRegStep(1)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMuted, cursor: "pointer", padding: "6px 12px", fontFamily: FONT_B, fontSize: 11 }}>← Indietro</button>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 18, color: C.goldLight }}>Completa il profilo</div>
                  <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "1px" }}>
                    {{owner:"🏠 Proprietario", concierge:"🤵 Concierge", agent:"🌐 Agente"}[regRole]}
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
                    <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 6 }}>Foto profilo</div>
                    <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.7 }}>Clicca sul cerchio per caricare la tua foto. Verrà ritagliata in formato quadrato.</div>
                    {regAvatar && <button type="button" onClick={() => setRegAvatar(null)} style={{ marginTop: 8, background: "none", border: "none", color: C.danger, fontSize: 11, cursor: "pointer", padding: 0 }}>✕ Rimuovi foto</button>}
                  </div>
                </div>

                {/* Credentials */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>Credenziali di accesso</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={label}>Nickname *</label><input style={input} value={nickname} onChange={e => setNickname(e.target.value)} placeholder="es. mario_ibiza" autoComplete="username" /></div>
                    <div><label style={label}>Password *</label><input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="min. 6 caratteri" autoComplete="new-password" /></div>
                  </div>
                </div>

                {/* Personal info */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>Dati personali</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div><label style={label}>Nome</label><input style={input} value={regFirstName} onChange={e => setRegFirstName(e.target.value)} placeholder="Mario" /></div>
                    <div><label style={label}>Cognome</label><input style={input} value={regLastName} onChange={e => setRegLastName(e.target.value)} placeholder="Rossi" /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={label}>Email</label><input style={input} type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="mario@email.com" /></div>
                    <div><label style={label}>Telefono / WhatsApp</label><input style={input} type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="+39 340 ..." /></div>
                  </div>
                </div>

                {/* Services */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 4 }}>
                    {regRole === "owner" ? "Cosa offri?" : "Servizi offerti"}
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>
                    {regRole === "owner" ? "Seleziona le tipologie di asset che gestisci" : "Seleziona i servizi che puoi fornire ai clienti"}
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
                          <span style={{ fontSize: 12, color: active ? C.gold : C.textMuted, fontFamily: FONT_B, fontWeight: active ? 600 : 400 }}>{s.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button style={{ ...btn("gold"), width: "100%", padding: "14px 20px", fontSize: 12, letterSpacing: "1.5px" }} type="submit">
                  Invia Richiesta di Accesso
                </button>
                <p style={{ fontSize: 10, color: C.textDim, textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>
                  Il tuo account sarà attivato dall&apos;amministratore. Riceverai conferma prima di poter accedere.
                </p>
              </form>
            </div>
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
            <button style={{ ...btn(), padding: isMobile ? "6px 12px" : "8px 18px", fontSize: 11 }} onClick={() => setUser(null)}>Esci</button>
          </div>
        </header>
        {user.role === "admin" && <div className="no-print"><AdminDashboard user={user} data={dbData} refresh={fetchAll} /></div>}
        {user.role === "concierge" && <div className="no-print"><ConciergeDashboard user={user} data={dbData} refresh={fetchAll} setPdfPreview={setPdfPreview} isMobile={isMobile} /></div>}
        {user.role === "agent" && <div className="no-print"><ConciergeDashboard user={user} data={dbData} refresh={fetchAll} setPdfPreview={setPdfPreview} isMobile={isMobile} /></div>}
        {user.role === "owner" && <div className="no-print"><OwnerDashboard user={user} data={dbData} refresh={fetchAll} setPdfPreview={setPdfPreview} isMobile={isMobile} /></div>}
        {(user.role === "concierge" || user.role === "agent" || user.role === "owner") && <div className="no-print"><HelperBot role={user.role} /></div>}
      </div>
      <PdfPreview data={pdfPreview} onClose={() => setPdfPreview(null)} />
    </>
  );
}

// --- HELPER BOT COMPONENT ---
function HelperBot({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "bot" | "user", text: string }[]>([]);
  const [inputValue, setInputValue] = useState("");

  const ownerHelp = [
    { q: "Come aggiungo una camera?", a: "Vai nella sezione 'Le Tue Proprietà', scendi fino alla fine della proprietà desiderata e usa il form 'Nuova camera'." },
    { q: "Come gestisco i collaboratori?", a: "Sotto ogni proprietà trovi la sezione 'Collaboratori'. Inserisci il nickname del concierge per dargli accesso." },
    { q: "Come cambio i prezzi?", a: "I prezzi sono mensili. Clicca '+ Mese' nella camera per aggiungere un listino o clicca un mese esistente per modificarlo." },
    { q: "Come rimuovo una foto?", a: "Nella lista camere, accanto al pulsante carica foto, trovi l'icona 🗑️ per eliminare l'immagine attuale." },
    { q: "Come vedo i report?", a: "Usa il tab 'Report' per vedere statistiche di entrate e uscite filtrate per periodo e metodo di pagamento." },
  ];

  const conciergeHelp = [
    { q: "Come faccio una proposta?", a: "Nel Calendario, scelgli la camera, trascina le date, inserisci i dati del cliente e clicca 'Invia Proposta'." },
    { q: "Dove vedo le note?", a: "Nella Lista Prenotazioni, clicca l'icona 👁️ per aprire il popup con le note complete inserite per quel cliente." },
    { q: "Come registro un pagamento?", a: "Apri i dettagli di una prenotazione dalla lista e usa il modulo 'Registra Pagamento' per acconti o saldi." },
    { q: "Cosa sono i colori nel calendario?", a: "Giallo: Proposta inviata. Verde: Accettata dal proprietario. Rosso: Occupata (confermata)." },
    { q: "Come vedo le mie commissioni?", a: "Nella sezione Report trovi il riepilogo delle fee maturate per ogni prenotazione conclusa." },
  ];

  const helpItems = role === "owner" ? ownerHelp : conciergeHelp;

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    const userMsg = { role: "user" as const, text };
    let botResponse = "Non sono sicuro di come rispondere a questa richiesta specifica. Prova a usare una delle domande frequenti qui sotto o scrivi parole chiave come 'prezzo', 'pdf' o 'foto'.";
    
    const low = text.toLowerCase();
    if (low.includes("pdf") || low.includes("preventivo") || low.includes("scarica")) {
      botResponse = "Il preventivo PDF ora ha 2 pagine: la prima per i costi e la seconda per le foto e la descrizione dell'appartamento. Il tasto download è fisso in basso nell'anteprima.";
    } else if (low.includes("foto") || low.includes("immagine") || low.includes("rimuovi")) {
      botResponse = "Puoi gestire le foto dalle impostazioni camera del Proprietario: icona 📸 per caricare e 🗑️ per rimuovere.";
    } else if (low.includes("prezzo") || low.includes("costo") || low.includes("listino")) {
      botResponse = "I prezzi si gestiscono mensilmente nelle schede camera. Ogni mese può avere il suo prezzo base e le spese di pulizia dedicate.";
    } else if (low.includes("collaboratore") || low.includes("concierge") || low.includes("invito")) {
      botResponse = "I proprietari possono invitare i concierge inserendo il loro nickname nella sezione 'Collaboratori' sotto ogni proprietà.";
    } else if (low.includes("pagamento") || low.includes("incasso") || low.includes("saldo") || low.includes("metodo")) {
      botResponse = "Puoi gestire i pagamenti e i metodi (Zen, Revolut, etc) dalle impostazioni del profilo o direttamente nella gestione della singola prenotazione.";
    }

    setMessages([...messages, userMsg, { role: "bot", text: botResponse }]);
    setInputValue("");
  };

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: "bot", text: `Buongiorno! Sono la tua Aura Guide. Come posso aiutarti oggi? Puoi scegliere una domanda qui sotto o scrivere liberamente.` }]);
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
                placeholder="Scrivi qui la tua domanda..."
              />
              <button style={{ ...btn("gold"), padding: "0 12px" }} onClick={() => handleSend(inputValue)}>➡️</button>
            </div>

            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Domande frequenti</div>
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
