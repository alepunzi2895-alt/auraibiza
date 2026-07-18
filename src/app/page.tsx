"use client";

import { useState, useEffect, useMemo, useRef, CSSProperties } from "react";
import "leaflet/dist/leaflet.css";
import { getPublicListings, createBookingRequest, getPublicRoomAvailability, getPropertyPdf, getPropertyGallery } from "./actions";

// ─── Design tokens (standalone, no import from platform) ─────────────────────
const C = {
  bg: "#080B0F", surface: "#10141C", surfaceAlt: "#161C28",
  border: "#1E2433", borderGold: "rgba(200,169,110,0.22)",
  gold: "#C8A96E", goldLight: "#E8D5A8", goldDark: "#8A6A30",
  goldGlow: "rgba(200,169,110,0.10)",
  text: "#EDE9E1", textMuted: "#8A8678", textDim: "#484540",
  success: "#3D9E6A", danger: "#B84444",
};
const FONT  = `'Cormorant Garamond', Georgia, serif`;
const FONT_B = `'DM Sans', 'Helvetica Neue', sans-serif`;

const ASSET_CATS = [
  { key: "all",       icon: "✦",  label: "Tutto",      types: [] },
  { key: "residenze", icon: "🏠", label: "Residenze",  types: ["apartment","villa"] },
  { key: "marine",    icon: "⛵", label: "Marine",     types: ["boat"] },
  { key: "mobilita",  icon: "🚗", label: "Mobilità",   types: ["car","scooter"] },
];

const assetIcon: Record<string, string> = {
  apartment:"🏠", villa:"🏡", boat:"⛵", car:"🚗", scooter:"🛵",
};

// Auto, scooter e barche si prenotano a giorno (non a notte come ville/appartamenti)
const isDayBasedAsset = (assetType?: string) => assetType === "car" || assetType === "scooter" || assetType === "boat";
const unitLabel = (assetType: string | undefined, count: number) => {
  const day = isDayBasedAsset(assetType);
  if (day) return count === 1 ? "giorno" : "giorni";
  return count === 1 ? "notte" : "notti";
};
const unitSuffix = (assetType?: string) => isDayBasedAsset(assetType) ? "/giorno" : "/notte";

// ─── Utils ───────────────────────────────────────────────────────────────────
const parseImages = (raw?: string): string[] => {
  if (!raw) return [];
  try { return raw.startsWith("[") ? JSON.parse(raw) : [raw]; }
  catch { return [raw]; }
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const btn = (v = "ghost"): CSSProperties => ({
  padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontFamily: FONT_B,
  fontSize: 12, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase",
  transition: "all 0.2s", border: "none",
  background: v === "gold"
    ? `linear-gradient(135deg, ${C.goldDark}, ${C.gold})`
    : v === "outline"
    ? "transparent"
    : "rgba(255,255,255,0.06)",
  color: v === "gold" ? "#080B0F" : C.text,
  boxShadow: v === "gold" ? "0 2px 16px rgba(200,169,110,0.35)" : "none",
  ...(v === "outline" ? { border: `1px solid ${C.borderGold}`, color: C.gold } : {}),
});

const inputStyle: CSSProperties = {
  width: "100%", padding: "12px 16px", background: C.surfaceAlt,
  border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
  fontFamily: FONT_B, fontSize: 13, outline: "none", boxSizing: "border-box",
};
const labelStyle: CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "1.2px", color: C.textMuted, marginBottom: 6, display: "block",
};

const WA_NUMBER = "34645265430";
const MONTH_NAMES = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

// ─── Public Calendar ─────────────────────────────────────────────────────────
function PublicCalendar({ roomId, onRangeSelect, selectedRange, assetType }: {
  roomId: string;
  onRangeSelect: (start: string | null, end: string | null) => void;
  selectedRange: { start: string | null; end: string | null };
  assetType?: string;
}) {
  const today = new Date();
  const [ym, setYm] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [avail, setAvail] = useState<Record<string, "available" | "blocked" | "booked">>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getPublicRoomAvailability(roomId, ym).then(data => {
      const map: Record<string, "available" | "blocked" | "booked"> = {};
      (data.availability || []).forEach((a: any) => { map[a.date] = a.status; });
      (data.bookings || []).forEach((b: any) => {
        const s = new Date(b.start_date + "T00:00:00");
        const e = new Date(b.end_date + "T00:00:00");
        for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
          map[d.toLocaleDateString("en-CA")] = "booked";
        }
      });
      setAvail(map);
      setLoading(false);
    });
  }, [roomId, ym]);

  const [year, month] = ym.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = today.toLocaleDateString("en-CA");

  const handleDay = (date: string) => {
    const s = avail[date];
    if (s === "booked" || s === "blocked") return;
    if (date < todayStr) return;
    if (!selectedRange.start || (selectedRange.start && selectedRange.end)) {
      onRangeSelect(date, null);
    } else {
      if (date < selectedRange.start) { onRangeSelect(date, null); return; }
      if (date === selectedRange.start) { onRangeSelect(null, null); return; }
      // Check no blocked/booked days in range
      let cursor = new Date(selectedRange.start + "T00:00:00");
      cursor.setDate(cursor.getDate() + 1);
      const end = new Date(date + "T00:00:00");
      let hasBlocked = false;
      while (cursor < end) {
        const d = cursor.toLocaleDateString("en-CA");
        if (avail[d] === "blocked" || avail[d] === "booked") { hasBlocked = true; break; }
        cursor.setDate(cursor.getDate() + 1);
      }
      if (hasBlocked) { onRangeSelect(date, null); return; }
      onRangeSelect(selectedRange.start, date);
    }
  };

  const isInRange = (date: string) => {
    if (!selectedRange.start || !selectedRange.end) return date === selectedRange.start;
    return date >= selectedRange.start && date <= selectedRange.end;
  };

  const nights = selectedRange.start && selectedRange.end
    ? Math.ceil((new Date(selectedRange.end).getTime() - new Date(selectedRange.start).getTime()) / 86400000)
    : 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={() => { const [y,m] = ym.split("-").map(Number); setYm(m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,"0")}`); }}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textMuted, cursor: "pointer", padding: "6px 12px", fontSize: 14 }}>◂</button>
        <div style={{ fontFamily: FONT, fontSize: 18, color: C.goldLight }}>{MONTH_NAMES[month - 1]} {year}</div>
        <button onClick={() => { const [y,m] = ym.split("-").map(Number); setYm(m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,"0")}`); }}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textMuted, cursor: "pointer", padding: "6px 12px", fontSize: 14 }}>▸</button>
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: C.textDim, fontSize: 12 }}>Caricamento...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
          {["Lu","Ma","Me","Gi","Ve","Sa","Do"].map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 10, color: C.textDim, padding: "4px 0", fontWeight: 600 }}>{d}</div>
          ))}
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const date = `${ym}-${String(day).padStart(2, "0")}`;
            const status = avail[date];
            const isPast = date < todayStr;
            const isBooked = status === "booked";
            const isBlocked = status === "blocked";
            const isAvail = !isPast && !isBooked && !isBlocked;
            const inRange = isInRange(date);
            const isStart = date === selectedRange.start;
            const isEnd = date === selectedRange.end;

            let bg = "transparent";
            if (isPast) bg = "rgba(255,255,255,0.02)";
            else if (isBooked) bg = "rgba(180,68,68,0.25)";
            else if (isBlocked) bg = "rgba(100,80,40,0.2)";
            else if (isStart || isEnd) bg = C.gold;
            else if (inRange) bg = "rgba(200,169,110,0.2)";
            else if (isAvail && status === "available") bg = "rgba(61,158,106,0.15)";

            const textColor = isStart || isEnd ? C.bg : isPast || isBooked || isBlocked ? C.textDim : inRange ? C.gold : C.text;
            const cursor = isAvail || inRange ? "pointer" : "default";

            return (
              <div key={day} onClick={() => handleDay(date)} style={{
                height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 6, background: bg, cursor,
                border: inRange && !isStart && !isEnd ? `1px solid rgba(200,169,110,0.3)` : "1px solid transparent",
                fontSize: 13, fontWeight: isStart || isEnd ? 700 : 400, color: textColor,
                opacity: isPast ? 0.35 : 1, transition: "all 0.15s",
                position: "relative",
              }}>
                {day}
                {isAvail && status === "available" && !inRange && (
                  <div style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", width: 3, height: 3, borderRadius: "50%", background: C.success }} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 10, color: C.textDim, flexWrap: "wrap", justifyContent: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(61,158,106,0.3)", display: "inline-block" }} />Disponibile</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(180,68,68,0.3)", display: "inline-block" }} />Occupato</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.gold, display: "inline-block" }} />Selezionato</span>
      </div>
      {nights > 0 && (
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 13, color: C.gold, fontFamily: FONT }}>
          {nights} {unitLabel(assetType, nights)} selezionate
        </div>
      )}
    </div>
  );
}

// ─── Property Map View ─────────────────────────────────────────────────────────
const IBIZA_CENTER: [number, number] = [38.9067, 1.4206];

function PropertyMapView({ properties, getRoomsForProperty, getPricing, onSelect }: {
  properties: any[];
  getRoomsForProperty: (id: string) => any[];
  getPricing: (roomId: string) => any;
  onSelect: (prop: any) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersLayer = useRef<any>(null);

  const geoProperties = useMemo(() => properties.filter((p: any) => p.latitude != null && p.longitude != null), [properties]);
  const missingCount = properties.length - geoProperties.length;

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      if (!mapInstance.current) {
        const map = L.map(mapRef.current, { center: IBIZA_CENTER, zoom: 10 });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          attribution: "© OpenStreetMap contributors © CARTO",
          maxZoom: 19,
        }).addTo(map);
        mapInstance.current = map;
        markersLayer.current = L.layerGroup().addTo(map);
      }
      const map = mapInstance.current;
      markersLayer.current.clearLayers();
      const icon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41], iconAnchor: [12, 41],
      });
      const bounds: [number, number][] = [];
      geoProperties.forEach((prop: any) => {
        const lat = parseFloat(prop.latitude);
        const lng = parseFloat(prop.longitude);
        bounds.push([lat, lng]);
        const rooms = getRoomsForProperty(prop.id);
        const images = parseImages(prop.image);
        const cover = images[0];
        const minPrice = rooms.reduce((min: number, r: any) => {
          const pr = getPricing(r.id);
          const p = pr?.min_price ?? Infinity;
          return p < min ? p : min;
        }, Infinity);
        const popupId = `map-popup-${prop.id}`;
        const popupHtml = `
          <div style="font-family: ${FONT_B}; width: 200px;">
            ${cover ? `<img src="${cover}" style="width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:8px;" />` : ""}
            <div style="font-family:${FONT};font-size:16px;color:${C.goldLight};margin-bottom:4px;">${prop.name}</div>
            <div style="font-size:11px;color:${C.textMuted};margin-bottom:6px;">📍 ${prop.location}</div>
            ${minPrice < Infinity ? `<div style="font-size:12px;color:${C.gold};margin-bottom:8px;">da €${minPrice}${unitSuffix(prop.asset_type)}</div>` : ""}
            <button id="${popupId}" style="width:100%;padding:8px;border:none;border-radius:6px;background:linear-gradient(135deg, ${C.goldDark}, ${C.gold});color:#080B0F;font-weight:600;font-size:11px;cursor:pointer;">Vedi dettagli →</button>
          </div>
        `;
        const marker = L.marker([lat, lng], { icon }).addTo(markersLayer.current);
        marker.bindPopup(popupHtml);
        marker.on("popupopen", () => {
          const btn = document.getElementById(popupId);
          if (btn) btn.onclick = () => onSelect(prop);
        });
      });
      if (bounds.length > 0) {
        map.fitBounds(bounds as any, { padding: [40, 40], maxZoom: 14 });
      } else {
        map.setView(IBIZA_CENTER, 10);
      }
    });
    return () => { cancelled = true; };
  }, [geoProperties, getRoomsForProperty, getPricing, onSelect]);

  useEffect(() => {
    return () => {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, []);

  return (
    <div>
      <div ref={mapRef} style={{ height: 520, borderRadius: 16, overflow: "hidden", border: `1px solid ${C.border}` }} />
      {missingCount > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: C.textDim, textAlign: "center" }}>
          {missingCount} {missingCount === 1 ? "proprietà non è" : "proprietà non sono"} ancora geolocalizzata — visibile solo in griglia.
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [listings, setListings] = useState<any>({ properties: [], rooms: [], pricing: [], referralValid: false });
  const [activeCat, setActiveCat] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  // modal prenotazione form (vecchio)
  const [modal, setModal] = useState<{ property: any; room: any } | null>(null);
  // modal dettaglio asset (nuovo)
  const [detailModal, setDetailModal] = useState<any>(null); // property
  const [detailRoom, setDetailRoom] = useState<any>(null);   // room selezionata nel modal
  const [detailRange, setDetailRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  // Galleria completa dell'asset aperto nel modal, caricata on-demand (la lista pubblica
  // porta solo la cover per non scaricare tutte le foto di tutti gli asset ad ogni visita)
  const [detailGallery, setDetailGallery] = useState<string[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralReady, setReferralReady] = useState(false);

  // Form state
  const [form, setForm] = useState({ name:"", email:"", phone:"", checkIn:"", checkOut:"", guests:"1", message:"" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formErr, setFormErr] = useState("");

  // Step 1: capture referral code from URL/sessionStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      setReferralCode(ref);
      sessionStorage.setItem("aura_ref", ref);
    } else {
      const stored = sessionStorage.getItem("aura_ref");
      if (stored) setReferralCode(stored);
    }
    setReferralReady(true);
  }, []);

  // Carica la galleria completa dell'asset solo quando si apre il suo dettaglio
  useEffect(() => {
    if (!detailModal) { setDetailGallery(null); return; }
    setDetailGallery(parseImages(detailModal.image)); // intanto mostra la cover già in memoria
    getPropertyGallery(detailModal.id).then(res => {
      if (res.image) setDetailGallery(parseImages(res.image));
    });
  }, [detailModal?.id]);

  // Navigazione lightbox da tastiera (frecce + Escape)
  useEffect(() => {
    if (lightboxIndex === null) return;
    const images = detailGallery || parseImages(detailModal?.image);
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      else if (e.key === "ArrowRight") setLightboxIndex(i => i === null ? i : (i + 1) % images.length);
      else if (e.key === "ArrowLeft") setLightboxIndex(i => i === null ? i : (i - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, detailModal, detailGallery]);

  // Step 2: fetch listings once referral code is known (pass it to show hidden assets)
  useEffect(() => {
    if (!referralReady) return;
    getPublicListings(referralCode || undefined).then(setListings);
  }, [referralReady, referralCode]);

  const filteredProperties = useMemo(() => {
    const cat = ASSET_CATS.find(c => c.key === activeCat);
    if (!cat || cat.types.length === 0) return listings.properties;
    return listings.properties.filter((p: any) => cat.types.includes(p.asset_type || "apartment"));
  }, [listings.properties, activeCat]);

  const getRoomsForProperty = (propId: string) =>
    listings.rooms.filter((r: any) => r.property_id === propId);

  const getPricing = (roomId: string) =>
    listings.pricing.find((p: any) => p.room_id === roomId);

  const handleRequest = async () => {
    if (!form.name.trim()) { setFormErr("Inserisci il tuo nome."); return; }
    if (!form.email.trim() && !form.phone.trim()) { setFormErr("Inserisci email o telefono."); return; }
    setSending(true); setFormErr("");
    const res = await createBookingRequest({
      propertyId: modal?.property?.id,
      roomId: modal?.room?.id,
      clientName: form.name, clientEmail: form.email, clientPhone: form.phone,
      checkIn: form.checkIn, checkOut: form.checkOut,
      guests: parseInt(form.guests) || 1, message: form.message,
      referralCode: referralCode || undefined,
    });
    setSending(false);
    if (res.success) { setSent(true); }
    else { setFormErr("Errore nell'invio. Riprova."); }
  };

  const openModal = (property: any, room: any, checkIn?: string, checkOut?: string) => {
    setModal({ property, room });
    setSent(false); setFormErr("");
    setForm({ name:"", email:"", phone:"", checkIn: checkIn || "", checkOut: checkOut || "", guests:"1", message:"" });
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; color: ${C.text}; font-family: ${FONT_B}; }
        ::selection { background: ${C.gold}33; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${C.surface}; } ::-webkit-scrollbar-thumb { background: ${C.goldDark}; border-radius: 3px; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:.6; } 50% { opacity:1; } }
        .hero-text { animation: fadeUp 0.8s ease both; }
        .hero-sub  { animation: fadeUp 0.8s 0.15s ease both; }
        .hero-cta  { animation: fadeUp 0.8s 0.3s ease both; }
        .card-hover { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(0,0,0,0.5) !important; }
        input:focus, textarea:focus, select:focus { border-color: ${C.gold}55 !important; outline: none !important; }
        @media (max-width: 768px) { .grid-3 { grid-template-columns: 1fr !important; } .hero-title { font-size: 42px !important; } .hide-mobile { display: none !important; } }
      ` }} />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        background: "rgba(8,11,15,0.92)", backdropFilter: "blur(24px)",
        borderBottom: `1px solid ${C.border}`,
        padding: "14px 32px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo.png" alt="Aura Ibiza" style={{ height: 36, width: 36, borderRadius: "50%", objectFit: "cover" }} />
          <div>
            <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 300, color: C.gold, letterSpacing: "4px", textTransform: "uppercase", lineHeight: 1 }}>Aura Ibiza</div>
            <div style={{ fontSize: 8, color: C.textDim, letterSpacing: "3px", textTransform: "uppercase" }}>Luxury Concierge</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="#services" style={{ color: C.textMuted, textDecoration: "none", fontSize: 11, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", padding: "6px 12px" }} className="hide-mobile">Servizi</a>
          <a href="#how" style={{ color: C.textMuted, textDecoration: "none", fontSize: 11, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", padding: "6px 12px" }} className="hide-mobile">Come funziona</a>
          <a href="#collaborate" style={{ color: C.textMuted, textDecoration: "none", fontSize: 11, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", padding: "6px 12px" }} className="hide-mobile">Collabora</a>
        </nav>
      </header>

      {/* Banner accesso esclusivo via referral */}
      {listings.referralValid && referralCode && (
        <div style={{
          position: "fixed", top: 68, left: 0, right: 0, zIndex: 150,
          background: `linear-gradient(90deg, rgba(200,169,110,0.12) 0%, rgba(200,169,110,0.08) 50%, rgba(200,169,110,0.12) 100%)`,
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid rgba(200,169,110,0.25)`,
          padding: "10px 24px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        }}>
          <span style={{ fontSize: 14 }}>✨</span>
          <span style={{ fontSize: 12, color: C.goldLight, fontFamily: FONT_B, letterSpacing: "0.5px" }}>
            Stai esplorando il portfolio esclusivo di <strong style={{ color: C.gold }}>{referralCode}</strong> — inclusi gli asset riservati non visibili al pubblico
          </span>
          <span style={{ fontSize: 14 }}>✨</span>
        </div>
      )}

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
        textAlign: "center", padding: `${listings.referralValid ? 158 : 120}px 24px 80px`,
        background: `
          radial-gradient(ellipse 120% 55% at 50% -5%, rgba(5,18,48,0.95) 0%, transparent 65%),
          radial-gradient(ellipse 70% 50% at 88% 100%, rgba(160,90,10,0.55) 0%, transparent 55%),
          radial-gradient(ellipse 55% 40% at 12% 85%, rgba(6,22,55,0.6) 0%, transparent 50%),
          radial-gradient(ellipse 50% 35% at 50% 100%, rgba(120,65,8,0.45) 0%, transparent 55%),
          radial-gradient(ellipse 80% 60% at 50% 50%, rgba(12,8,4,0.3) 0%, transparent 80%),
          linear-gradient(165deg, #03060C 0%, #05091A 35%, #040608 70%, #060408 100%)
        `,
        position: "relative", overflow: "hidden",
      }}>
        {/* stelle decorative */}
        {[
          { top:"12%", left:"8%", size:1.5 }, { top:"25%", left:"18%", size:1 },
          { top:"8%", left:"72%", size:2 }, { top:"18%", right:"10%", size:1 },
          { top:"45%", left:"5%", size:1 }, { top:"65%", right:"6%", size:1.5 },
          { top:"30%", right:"22%", size:1 }, { top:"72%", left:"15%", size:1 },
        ].map((s, i) => (
          <div key={i} style={{
            position: "absolute", top: s.top, left: (s as any).left, right: (s as any).right,
            width: s.size, height: s.size, borderRadius: "50%",
            background: "rgba(200,169,110,0.6)", animation: `pulse ${3 + i * 0.4}s ease infinite`,
          }} />
        ))}
        {/* linea decorativa verticale sinistra */}
        <div style={{ position: "absolute", top: "15%", left: "10%", width: 1, height: 140, background: "linear-gradient(to bottom, transparent, rgba(200,169,110,0.25), transparent)" }} />
        <div style={{ position: "absolute", top: "55%", right: "8%", width: 1, height: 100, background: "linear-gradient(to bottom, transparent, rgba(200,169,110,0.18), transparent)" }} />

        {/* Logo con anelli */}
        <div style={{ position: "relative", display: "inline-flex", marginBottom: 44 }}>
          {/* glow di sfondo */}
          <div style={{
            position: "absolute", top: -50, left: -50, right: -50, bottom: -50,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(200,169,110,0.14) 0%, rgba(200,169,110,0.04) 50%, transparent 70%)",
            animation: "pulse 4s ease infinite",
          }} />
          {/* anello esterno — tratteggiato, lento */}
          <div style={{
            position: "absolute", top: -26, left: -26, right: -26, bottom: -26,
            borderRadius: "50%",
            border: "1px dashed rgba(200,169,110,0.35)",
            animation: "spin 28s linear infinite",
          }} />
          {/* anello medio — continuo, verso opposto */}
          <div style={{
            position: "absolute", top: -14, left: -14, right: -14, bottom: -14,
            borderRadius: "50%",
            border: "1px solid rgba(200,169,110,0.5)",
            animation: "spin 16s linear infinite reverse",
          }} />
          {/* anello interno — sottile, veloce */}
          <div style={{
            position: "absolute", top: -5, left: -5, right: -5, bottom: -5,
            borderRadius: "50%",
            border: "1px solid rgba(200,169,110,0.25)",
            animation: "spin 8s linear infinite",
          }} />
          <img
            src="/logo.png"
            alt="Aura Ibiza"
            style={{ height: 140, width: 140, borderRadius: "50%", objectFit: "cover", position: "relative", zIndex: 1, boxShadow: "0 0 50px rgba(200,169,110,0.28), 0 0 100px rgba(200,169,110,0.1), 0 0 1px rgba(200,169,110,0.6)" }}
          />
        </div>

        <div style={{ fontSize: 10, color: C.gold, letterSpacing: "8px", textTransform: "uppercase", marginBottom: 28, animation: "pulse 3s ease infinite" }}>
          Ibiza · Luxury Experience
        </div>

        <h1 className="hero-text hero-title" style={{
          fontFamily: FONT, fontSize: 68, fontWeight: 300, color: C.goldLight,
          letterSpacing: "3px", lineHeight: 1.1, marginBottom: 24, maxWidth: 800,
        }}>
          L'isola come<br />non l'hai mai vissuta
        </h1>

        <p className="hero-sub" style={{ fontSize: 16, color: C.textMuted, maxWidth: 560, lineHeight: 1.8, marginBottom: 48 }}>
          Ville esclusive, yacht privati, auto di lusso e esperienze su misura. Il tuo concierge personale per un soggiorno indimenticabile a Ibiza.
        </p>

        <div className="hero-cta" style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <a href="#services" style={{ ...btn("gold"), textDecoration: "none", padding: "14px 36px", fontSize: 13 }}>Scopri i Servizi</a>
          <a href="#collaborate" style={{ ...btn("outline"), textDecoration: "none", padding: "14px 36px", fontSize: 13 }}>Collabora con Noi</a>
        </div>

      </section>

      {/* ── SERVICES ───────────────────────────────────────────────────────── */}
      <section id="services" style={{ padding: "100px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <div style={{ fontSize: 10, color: C.gold, letterSpacing: "4px", textTransform: "uppercase", marginBottom: 16 }}>Il Nostro Portfolio</div>
          <h2 style={{ fontFamily: FONT, fontSize: 48, fontWeight: 300, color: C.goldLight, letterSpacing: "2px", marginBottom: 16 }}>Esperienze di Lusso</h2>
          <p style={{ color: C.textMuted, fontSize: 15, maxWidth: 500, margin: "0 auto", lineHeight: 1.7 }}>Ogni proprietà è selezionata per garantire il massimo comfort e l'esclusività che meriti.</p>
        </div>

        {/* Category tabs */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 48, flexWrap: "wrap" }}>
          {ASSET_CATS.map(cat => {
            const active = activeCat === cat.key;
            const count = cat.types.length === 0
              ? listings.properties.length
              : listings.properties.filter((p: any) => cat.types.includes(p.asset_type || "apartment")).length;
            return (
              <button key={cat.key} onClick={() => setActiveCat(cat.key)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: 100,
                border: active ? `1px solid ${C.borderGold}` : `1px solid ${C.border}`,
                background: active ? C.goldGlow : "rgba(255,255,255,0.03)",
                color: active ? C.gold : C.textMuted, cursor: "pointer",
                fontFamily: FONT_B, fontSize: 12, fontWeight: 600, letterSpacing: "0.5px",
                transition: "all 0.2s",
              }}>
                <span>{cat.icon}</span>
                <span style={{ textTransform: "uppercase", letterSpacing: "1px" }}>{cat.label}</span>
                {count > 0 && <span style={{ background: active ? C.gold : C.textDim, color: active ? C.bg : C.textMuted, borderRadius: 20, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* View toggle: grid / map */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 32 }}>
          {([{ key: "grid", icon: "🔲", label: "Griglia" }, { key: "map", icon: "🗺", label: "Mappa" }] as const).map(v => {
            const active = viewMode === v.key;
            return (
              <button key={v.key} onClick={() => setViewMode(v.key)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8,
                border: active ? `1px solid ${C.borderGold}` : `1px solid ${C.border}`,
                background: active ? C.goldGlow : "rgba(255,255,255,0.03)",
                color: active ? C.gold : C.textMuted, cursor: "pointer",
                fontFamily: FONT_B, fontSize: 11, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase",
                transition: "all 0.2s",
              }}>
                <span>{v.icon}</span><span>{v.label}</span>
              </button>
            );
          })}
        </div>

        {/* Property cards */}
        {filteredProperties.length === 0 ? (
          <div style={{ textAlign: "center", color: C.textDim, padding: "80px 0", fontSize: 15 }}>
            Nessun servizio disponibile in questa categoria al momento.
          </div>
        ) : viewMode === "map" ? (
          <PropertyMapView
            properties={filteredProperties}
            getRoomsForProperty={getRoomsForProperty}
            getPricing={getPricing}
            onSelect={(prop) => {
              setDetailModal(prop);
              setDetailRoom(getRoomsForProperty(prop.id)[0] || null);
              setDetailRange({ start: null, end: null });
            }}
          />
        ) : (
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {filteredProperties.map((prop: any) => {
              const rooms = getRoomsForProperty(prop.id);
              const images = parseImages(prop.image);
              const coverImg = images[0];
              const minPrice = rooms.reduce((min: number, r: any) => {
                const pr = getPricing(r.id);
                const p = pr?.min_price ?? Infinity;
                return p < min ? p : min;
              }, Infinity);

              const openDetail = () => {
                setDetailModal(prop);
                setDetailRoom(rooms[0] || null);
                setDetailRange({ start: null, end: null });
              };
              return (
                <div key={prop.id} className="card-hover" onClick={openDetail} style={{
                  background: `linear-gradient(160deg, ${C.surface} 0%, rgba(14,18,26,0.95) 100%)`,
                  border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.3)", cursor: "pointer",
                }}>
                  {/* Image */}
                  <div style={{ position: "relative", height: 220, background: C.surfaceAlt, overflow: "hidden" }}>
                    {coverImg ? (
                      <img src={coverImg} alt={prop.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56, opacity: 0.3 }}>
                        {assetIcon[prop.asset_type] || "🏠"}
                      </div>
                    )}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,11,15,0.8) 0%, transparent 50%)" }} />
                    <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <div style={{ background: "rgba(8,11,15,0.75)", backdropFilter: "blur(8px)", border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: "4px 12px", fontSize: 10, color: C.gold, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>
                        {assetIcon[prop.asset_type]} {prop.asset_type}
                      </div>
                      {prop.is_public === 0 && (
                        <div style={{ background: "rgba(200,169,110,0.15)", backdropFilter: "blur(8px)", border: `1px solid rgba(200,169,110,0.4)`, borderRadius: 20, padding: "4px 12px", fontSize: 10, color: C.goldLight, fontWeight: 700, letterSpacing: "1px" }}>
                          🔒 Esclusivo
                        </div>
                      )}
                      {prop.manages_availability ? (
                        <div style={{ background: "rgba(61,158,106,0.2)", backdropFilter: "blur(8px)", border: "1px solid rgba(61,158,106,0.4)", borderRadius: 20, padding: "4px 12px", fontSize: 10, color: "#5DD09A", fontWeight: 600, letterSpacing: "1px" }}>
                          📅 Disponibilità live
                        </div>
                      ) : null}
                    </div>
                    {minPrice < Infinity && (
                      <div style={{ position: "absolute", bottom: 14, right: 14, textAlign: "right" }}>
                        <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "1px", textTransform: "uppercase" }}>da</div>
                        <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 400, color: C.goldLight, lineHeight: 1 }}>€{minPrice}<span style={{ fontSize: 12, fontWeight: 300 }}>{unitSuffix(prop.asset_type)}</span></div>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ padding: "20px 22px 22px" }}>
                    <h3 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 400, color: C.goldLight, marginBottom: 6, letterSpacing: "0.5px" }}>{prop.name}</h3>
                    <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>📍</span> {prop.location}
                    </div>
                    {prop.description && (
                      <p style={{ fontSize: 12, color: C.textDim, lineHeight: 1.7, marginBottom: 16, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as any}>
                        {prop.description}
                      </p>
                    )}
                    <div style={{ fontSize: 11, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span>{rooms.length} {rooms.length === 1 ? "unità" : "unità disponibili"}</span>
                      <span>·</span>
                      <span>{prop.manages_availability ? "Disponibilità verificata" : "Su richiesta WhatsApp"}</span>
                    </div>
                    <div style={{ ...btn("gold"), textAlign: "center", padding: "10px", fontSize: 11, borderRadius: 8, marginTop: 8 }}>
                      {prop.manages_availability ? "📅 Vedi Disponibilità" : "💬 Richiedi via WhatsApp"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section id="how" style={{ background: `linear-gradient(180deg, transparent 0%, ${C.surface} 30%, ${C.surface} 70%, transparent 100%)`, padding: "100px 32px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.gold, letterSpacing: "4px", textTransform: "uppercase", marginBottom: 16 }}>Il Processo</div>
          <h2 style={{ fontFamily: FONT, fontSize: 44, fontWeight: 300, color: C.goldLight, letterSpacing: "2px", marginBottom: 60 }}>Come Funziona</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 40 }}>
            {[
              { n: "01", icon: "🔍", title: "Scegli", desc: "Sfoglia la nostra selezione di ville, yacht, auto e esperienze esclusive a Ibiza." },
              { n: "02", icon: "📩", title: "Richiedi", desc: "Invia una richiesta di disponibilità con le date e i dettagli del tuo soggiorno." },
              { n: "03", icon: "🤝", title: "Conferma", desc: "Il tuo concierge dedicato ti contatterà entro poche ore per finalizzare ogni dettaglio." },
              { n: "04", icon: "✨", title: "Goditi", desc: "Arriva, rilassati. Pensiamo noi a tutto il resto, dal check-in alle esperienze on demand." },
            ].map(s => (
              <div key={s.n} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: FONT, fontSize: 11, color: C.gold, letterSpacing: "3px", marginBottom: 16, opacity: 0.6 }}>{s.n}</div>
                <div style={{ fontSize: 40, marginBottom: 16 }}>{s.icon}</div>
                <h3 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 400, color: C.goldLight, marginBottom: 10 }}>{s.title}</h3>
                <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.8 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COLLABORATE ────────────────────────────────────────────────────── */}
      <section id="collaborate" style={{ padding: "100px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ background: `linear-gradient(135deg, ${C.surface} 0%, rgba(22,28,40,0.8) 100%)`, border: `1px solid ${C.borderGold}`, borderRadius: 24, padding: "64px 56px", display: "flex", gap: 64, alignItems: "center", flexWrap: "wrap", boxShadow: "0 8px 48px rgba(0,0,0,0.4)" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 10, color: C.gold, letterSpacing: "4px", textTransform: "uppercase", marginBottom: 20 }}>Per Professionisti</div>
              <h2 style={{ fontFamily: FONT, fontSize: 42, fontWeight: 300, color: C.goldLight, letterSpacing: "1.5px", lineHeight: 1.2, marginBottom: 24 }}>
                Collabora<br />con Aura Ibiza
              </h2>
              <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.9, marginBottom: 32 }}>
                Sei un agente immobiliare, un concierge professionista o un proprietario che vuole promuovere ville, barche o auto di lusso? Unisciti alla nostra rete e raggiungi clienti premium.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 40 }}>
                {[
                  { icon: "🏠", text: "Proprietari di ville, appartamenti o barche" },
                  { icon: "🤵", text: "Concierge e agenti di viaggio specializzati" },
                  { icon: "🚗", text: "Provider di auto di lusso, transfer e noleggi" },
                  { icon: "🌅", text: "Organizzatori di esperienze ed eventi" },
                ].map(item => (
                  <div key={item.icon} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontSize: 20 }}>{item.icon}</span>
                    <span style={{ fontSize: 13, color: C.text }}>{item.text}</span>
                  </div>
                ))}
              </div>
              <a href="/platform?register=1" style={{ ...btn("gold"), textDecoration: "none", display: "inline-block", padding: "14px 40px", fontSize: 13 }}>
                Registrati ora →
              </a>
            </div>

            <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 20 }}>
              {[
                { title: "Visibilità Premium", desc: "Le tue proprietà e servizi vengono mostrati a clienti selezionati con alto potere d'acquisto.", icon: "📈" },
                { title: "Gestione Semplice", desc: "Dashboard completa per gestire prenotazioni, pagamenti e collaboratori in un unico posto.", icon: "⚙️" },
                { title: "Rete Professionale", desc: "Entra in un ecosistema di professionisti del lusso che collaborano per offrire il meglio.", icon: "🤝" },
              ].map(b => (
                <div key={b.title} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 22px", display: "flex", gap: 16 }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{b.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.goldLight, marginBottom: 6 }}>{b.title}</div>
                    <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>{b.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "56px 32px 32px", background: C.surface }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 40 }}>

          {/* Brand */}
          <div style={{ minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <img src="/logo.png" alt="Aura Ibiza" style={{ height: 36, width: 36, borderRadius: "50%", objectFit: "cover" }} />
              <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 300, color: C.gold, letterSpacing: "4px", textTransform: "uppercase" }}>Aura Ibiza</div>
            </div>
            <div style={{ fontSize: 12, color: C.textDim, lineHeight: 2 }}>
              Luxury Concierge · Ibiza<br />
              Esperienze su misura per i tuoi<br />momenti più speciali
            </div>
          </div>

          {/* Servizi */}
          <div>
            <div style={{ fontSize: 10, color: C.gold, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 16 }}>Servizi</div>
            {["Residenze di lusso", "Yacht & Marine", "Auto & Transfer", "Esperienze"].map(s => (
              <div key={s} style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>{s}</div>
            ))}
          </div>

          {/* Piattaforma */}
          <div>
            <div style={{ fontSize: 10, color: C.gold, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 16 }}>Piattaforma</div>
            <a href="/platform" style={{ display: "block", fontSize: 12, color: C.textMuted, marginBottom: 10, textDecoration: "none" }}>Accedi</a>
            <a href="/platform?register=1" style={{ display: "block", fontSize: 12, color: C.textMuted, marginBottom: 10, textDecoration: "none" }}>Registrati</a>
            <a href="#collaborate" style={{ display: "block", fontSize: 12, color: C.textMuted, textDecoration: "none" }}>Collabora</a>
          </div>

          {/* Contatti */}
          <div>
            <div style={{ fontSize: 10, color: C.gold, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 16 }}>Contatti</div>
            <a href="mailto:info.auraibiza@gmail.com" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.textMuted, marginBottom: 12, textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.color = C.gold)} onMouseLeave={e => (e.currentTarget.style.color = C.textMuted)}>
              <span style={{ fontSize: 16 }}>✉</span>
              <span>info.auraibiza@gmail.com</span>
            </a>
            <a href="https://wa.me/34645265430" target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.textMuted, marginBottom: 12, textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#25D366")} onMouseLeave={e => (e.currentTarget.style.color = C.textMuted)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              <span>+34 645 265 430</span>
            </a>
            <a href="https://www.instagram.com/_aura_ibiza_/" target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.textMuted, textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#E1306C")} onMouseLeave={e => (e.currentTarget.style.color = C.textMuted)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              <span>@_aura_ibiza_</span>
            </a>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "40px auto 0", paddingTop: 24, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 11, color: C.textDim }}>© {new Date().getFullYear()} Aura Ibiza · Tutti i diritti riservati</div>
          <div style={{ display: "flex", gap: 20 }}>
            <a href="mailto:info.auraibiza@gmail.com" style={{ color: C.textDim, fontSize: 11, textDecoration: "none" }}>info.auraibiza@gmail.com</a>
            <a href="https://www.instagram.com/_aura_ibiza_/" target="_blank" rel="noopener noreferrer" style={{ color: C.textDim, fontSize: 11, textDecoration: "none" }}>Instagram</a>
          </div>
        </div>
      </footer>

      {/* ── DETAIL MODAL ───────────────────────────────────────────────────── */}
      {detailModal && (() => {
        const prop = detailModal;
        const rooms = getRoomsForProperty(prop.id);
        const images = detailGallery || parseImages(prop.image);
        const managedAvail = !!prop.manages_availability;
        const waText = encodeURIComponent(`Ciao! Sono interessato/a a *${prop.name}*${detailRoom ? ` — *${detailRoom.name}*` : ""}.\n\nPotreste indicarmi la disponibilità? Sto cercando queste date: `);
        const waUrl = `https://wa.me/${WA_NUMBER}?text=${waText}`;

        const nights = detailRange.start && detailRange.end
          ? Math.ceil((new Date(detailRange.end).getTime() - new Date(detailRange.start).getTime()) / 86400000)
          : 0;

        return (
          <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(16px)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 500, padding: "24px 16px", overflowY: "auto" }}
            onClick={() => { setDetailModal(null); setDetailRange({ start: null, end: null }); setLightboxIndex(null); }}>
            <div style={{
              background: `linear-gradient(160deg, ${C.surface} 0%, rgba(10,14,22,0.99) 100%)`,
              border: `1px solid ${C.borderGold}`, borderRadius: 20, width: "100%", maxWidth: 840,
              boxShadow: "0 24px 80px rgba(0,0,0,0.7)", marginTop: 20,
            }} onClick={e => e.stopPropagation()}>

              {/* Cover image */}
              {images.length > 0 && (
                <div style={{ height: 280, borderRadius: "20px 20px 0 0", overflow: "hidden", position: "relative", cursor: "zoom-in" }} onClick={() => setLightboxIndex(0)}>
                  <img src={images[0]} alt={prop.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(10,14,22,0.7) 0%, transparent 60%)" }} />
                  <button onClick={(e) => { e.stopPropagation(); setDetailModal(null); setDetailRange({ start: null, end: null }); }}
                    style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  {prop.is_public === 0 && <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(200,169,110,0.2)", border: "1px solid rgba(200,169,110,0.5)", borderRadius: 20, padding: "4px 14px", fontSize: 11, color: C.goldLight, fontWeight: 700 }}>🔒 Esclusivo</div>}
                  {images.length > 1 && <div style={{ position: "absolute", bottom: 12, right: 16, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, padding: "3px 10px", borderRadius: 20 }}>🔍 {images.length} foto</div>}
                </div>
              )}

              <div style={{ padding: "28px 32px 32px" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.gold, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 6 }}>{assetIcon[prop.asset_type]} {prop.asset_type}</div>
                    <h2 style={{ fontFamily: FONT, fontSize: 30, fontWeight: 300, color: C.goldLight, marginBottom: 6, letterSpacing: "1px" }}>{prop.name}</h2>
                    <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 10 }}>📍 {prop.location}</div>
                    {prop.has_pdf ? (
                      <button
                        disabled={pdfLoadingId === prop.id}
                        onClick={async () => {
                          setPdfLoadingId(prop.id);
                          const res = await getPropertyPdf(prop.id);
                          setPdfLoadingId(null);
                          if (res.pdf_document) window.open(res.pdf_document, "_blank");
                        }}
                        style={{ ...btn("outline"), padding: "6px 14px", fontSize: 11 }}>
                        {pdfLoadingId === prop.id ? "Caricamento…" : "📄 Scheda PDF"}
                      </button>
                    ) : null}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: C.textDim, letterSpacing: "1px", textTransform: "uppercase" }}>da</div>
                    {(() => { const mp = rooms.reduce((min: number, r: any) => { const pr = getPricing(r.id); const p = pr?.min_price ?? Infinity; return p < min ? p : min; }, Infinity); return mp < Infinity ? <div style={{ fontFamily: FONT, fontSize: 28, color: C.gold }}>€{mp}<span style={{ fontSize: 13, color: C.textMuted }}>{unitSuffix(prop.asset_type)}</span></div> : null; })()}
                  </div>
                </div>

                {prop.description && <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.8, marginBottom: 24 }}>{prop.description}</p>}

                {/* Galleria miniature */}
                {images.length > 1 && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 24, overflowX: "auto" }}>
                    {images.map((img, i) => (
                      <img key={i} src={img} alt="" onClick={() => setLightboxIndex(i)} style={{ height: 64, width: 96, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: `1px solid ${C.border}`, cursor: "zoom-in" }} />
                    ))}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: rooms.length > 1 ? "1fr 1fr" : "1fr", gap: 20 }}>
                  {/* Colonna sinistra: selezione unità */}
                  <div>
                    <div style={{ fontSize: 10, color: C.gold, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 12 }}>Unità disponibili</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {rooms.map((r: any) => {
                        const pr = getPricing(r.id);
                        const isSelected = detailRoom?.id === r.id;
                        return (
                          <div key={r.id} onClick={() => { setDetailRoom(r); setDetailRange({ start: null, end: null }); }}
                            style={{ padding: "12px 16px", borderRadius: 10, cursor: "pointer",
                              border: isSelected ? `1px solid ${C.borderGold}` : `1px solid ${C.border}`,
                              background: isSelected ? C.goldGlow : "rgba(255,255,255,0.02)",
                              transition: "all 0.2s" }}>
                            <div style={{ fontWeight: 600, color: isSelected ? C.gold : C.text, fontSize: 13 }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                              {r.capacity} ospiti{r.bedrooms ? ` · ${r.bedrooms} camere` : ""}{r.bathrooms ? ` · ${r.bathrooms} bagni` : ""} {pr ? `· €${pr.min_price}${unitSuffix(prop.asset_type)}` : ""}
                            </div>
                            {r.description && <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{r.description}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Colonna destra: calendario o WhatsApp */}
                  <div>
                    {managedAvail && detailRoom ? (
                      <div>
                        <div style={{ fontSize: 10, color: C.gold, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 12 }}>Disponibilità</div>
                        <PublicCalendar
                          roomId={detailRoom.id}
                          selectedRange={detailRange}
                          onRangeSelect={(s, e) => setDetailRange({ start: s, end: e })}
                          assetType={prop.asset_type}
                        />
                        {nights > 0 && (
                          <button style={{ ...btn("gold"), width: "100%", marginTop: 16, padding: "14px" }}
                            onClick={() => {
                              openModal(prop, detailRoom, detailRange.start || undefined, detailRange.end || undefined);
                            }}>
                            Prenota {nights} {unitLabel(prop.asset_type, nights)} →
                          </button>
                        )}
                        {!detailRange.start && (
                          <div style={{ marginTop: 14, fontSize: 12, color: C.textDim, textAlign: "center" }}>
                            Clicca sul giorno di check-in per selezionare le date
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 32 }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 40, marginBottom: 16 }}>💬</div>
                          <div style={{ fontFamily: FONT, fontSize: 20, color: C.goldLight, marginBottom: 8 }}>Prenota via WhatsApp</div>
                          <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.8 }}>
                            Scrivici direttamente per verificare disponibilità e finalizzare la prenotazione. Risposta entro poche ore.
                          </p>
                        </div>
                        <a href={waUrl} target="_blank" rel="noopener noreferrer"
                          style={{ ...btn("gold"), textDecoration: "none", textAlign: "center", padding: "16px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 10, background: "linear-gradient(135deg, #128C7E, #25D366)" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          <span style={{ color: "#fff" }}>Scrivi su WhatsApp</span>
                        </a>
                        <a href={`mailto:info.auraibiza@gmail.com?subject=Richiesta disponibilità: ${encodeURIComponent(prop.name)}&body=${encodeURIComponent(`Ciao,\n\nSono interessato/a a ${prop.name}${detailRoom ? ` — ${detailRoom.name}` : ""}.\n\nVorrei verificare la disponibilità per le seguenti date:\n\nGrazie`)}`}
                          style={{ ...btn("outline"), textDecoration: "none", textAlign: "center", padding: "12px", fontSize: 12, display: "block" }}>
                          ✉ Oppure scrivi via email
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lightbox foto: scorrimento e ingrandimento */}
          {lightboxIndex !== null && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => setLightboxIndex(null)}
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (touchStartX.current === null) return;
                const dx = e.changedTouches[0].clientX - touchStartX.current;
                touchStartX.current = null;
                if (Math.abs(dx) < 40 || images.length < 2) return;
                setLightboxIndex(i => i === null ? i : dx < 0 ? (i + 1) % images.length : (i - 1 + images.length) % images.length);
              }}>
              <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
                style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✕</button>

              {images.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => i === null ? i : (i - 1 + images.length) % images.length); }}
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: "50%", width: 48, height: 48, cursor: "pointer", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>‹</button>
              )}

              <img src={images[lightboxIndex]} alt="" onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }} />

              {images.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => i === null ? i : (i + 1) % images.length); }}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: "50%", width: 48, height: 48, cursor: "pointer", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>›</button>
              )}

              {images.length > 1 && (
                <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, padding: "5px 14px", borderRadius: 20 }}>
                  {lightboxIndex + 1} / {images.length}
                </div>
              )}
            </div>
          )}
          </>
        );
      })()}

      {/* ── REQUEST MODAL ──────────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 20 }} onClick={() => setModal(null)}>
          <div style={{
            background: `linear-gradient(160deg, ${C.surface} 0%, rgba(14,18,26,0.98) 100%)`,
            border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: "40px 36px",
            width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
            boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          }} onClick={e => e.stopPropagation()}>

            {!sent ? (
              <>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 10, color: C.gold, letterSpacing: "3px", textTransform: "uppercase", marginBottom: 8 }}>Richiesta Disponibilità</div>
                  <h3 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 300, color: C.goldLight, marginBottom: 4 }}>{modal.property?.name}</h3>
                  {modal.room && <div style={{ fontSize: 13, color: C.textMuted }}>Unità: <strong style={{ color: C.gold }}>{modal.room.name}</strong></div>}
                  {referralCode && (
                    <div style={{ marginTop: 12, padding: "8px 14px", background: "rgba(200,169,110,0.08)", border: `1px solid ${C.borderGold}`, borderRadius: 8, fontSize: 11, color: C.textMuted, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>🤝</span> Stai prenotando tramite il concierge <strong style={{ color: C.gold }}>{referralCode}</strong>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Nome *</label>
                      <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mario Rossi" />
                    </div>
                    <div>
                      <label style={labelStyle}>Ospiti</label>
                      <select style={{ ...inputStyle, appearance: "none" } as any} value={form.guests} onChange={e => setForm(f => ({ ...f, guests: e.target.value }))}>
                        {[1,2,3,4,5,6,7,8,10,12,15,20].map(n => <option key={n} value={n}>{n} {n === 1 ? "persona" : "persone"}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="mario@email.com" />
                  </div>
                  <div>
                    <label style={labelStyle}>Telefono / WhatsApp</label>
                    <input style={inputStyle} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+39 340 ..." />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Check-in</label>
                      <input style={inputStyle} type="date" value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Check-out</label>
                      <input style={inputStyle} type="date" value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Messaggio</label>
                    <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" } as any} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Richieste speciali, domande, dettagli aggiuntivi..." />
                  </div>

                  {formErr && <div style={{ fontSize: 12, color: C.danger, padding: "10px 14px", background: `${C.danger}12`, borderRadius: 8, border: `1px solid ${C.danger}33` }}>{formErr}</div>}

                  <button style={{ ...btn("gold"), width: "100%", padding: "14px", fontSize: 13, marginTop: 4 }} onClick={handleRequest} disabled={sending}>
                    {sending ? "Invio in corso..." : "Invia Richiesta"}
                  </button>
                  <button style={{ ...btn(), width: "100%", padding: "10px", fontSize: 11 }} onClick={() => setModal(null)}>Annulla</button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 56, marginBottom: 24 }}>✅</div>
                <h3 style={{ fontFamily: FONT, fontSize: 28, fontWeight: 300, color: C.goldLight, marginBottom: 16 }}>Richiesta Inviata!</h3>
                <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.8, marginBottom: 32 }}>
                  Grazie {form.name}! Il nostro team ti contatterà entro poche ore per confermare la disponibilità e fornirti tutti i dettagli.
                </p>
                <button style={{ ...btn("gold"), padding: "12px 36px" }} onClick={() => setModal(null)}>Chiudi</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
