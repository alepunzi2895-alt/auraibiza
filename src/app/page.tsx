"use client";

import { useState, useEffect, useMemo, CSSProperties } from "react";
import { getPublicListings, createBookingRequest } from "./actions";

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

// ─── Component ───────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [listings, setListings] = useState<any>({ properties: [], rooms: [], pricing: [] });
  const [activeCat, setActiveCat] = useState("all");
  const [modal, setModal] = useState<{ property: any; room: any } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({ name:"", email:"", phone:"", checkIn:"", checkOut:"", guests:"1", message:"" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    getPublicListings().then(setListings);
    // Capture referral code from URL ?ref=nickname
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      setReferralCode(ref);
      sessionStorage.setItem("aura_ref", ref);
    } else {
      const stored = sessionStorage.getItem("aura_ref");
      if (stored) setReferralCode(stored);
    }
  }, []);

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

  const openModal = (property: any, room: any) => {
    setModal({ property, room });
    setSent(false); setFormErr("");
    setForm({ name:"", email:"", phone:"", checkIn:"", checkOut:"", guests:"1", message:"" });
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

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
        textAlign: "center", padding: "120px 24px 80px",
        background: `
          linear-gradient(180deg, rgba(8,11,15,0.72) 0%, rgba(8,11,15,0.52) 45%, rgba(8,11,15,0.82) 100%),
          radial-gradient(ellipse at 30% 40%, rgba(200,169,110,0.06) 0%, transparent 55%),
          url('/hero-bg.jpg') center / cover no-repeat
        `,
        backgroundColor: C.bg,
        position: "relative", overflow: "hidden",
      }}>
        {/* decorative lines */}
        <div style={{ position: "absolute", top: "20%", left: "10%", width: 1, height: 120, background: `linear-gradient(to bottom, transparent, ${C.gold}33, transparent)` }} />
        <div style={{ position: "absolute", top: "60%", right: "8%", width: 1, height: 80, background: `linear-gradient(to bottom, transparent, ${C.gold}22, transparent)` }} />

        {/* Logo centrale grande con doppio anello */}
        <div style={{ position: "relative", marginBottom: 44 }}>
          {/* anello esterno lento */}
          <div style={{
            position: "absolute", inset: -22, borderRadius: "50%",
            background: `conic-gradient(${C.gold}18 0deg, transparent 80deg, ${C.gold}12 180deg, transparent 260deg, ${C.gold}18 360deg)`,
            animation: "spin 28s linear infinite",
          }} />
          {/* anello interno veloce inverso */}
          <div style={{
            position: "absolute", inset: -10, borderRadius: "50%",
            background: `conic-gradient(transparent 0deg, ${C.gold}30 60deg, transparent 120deg, transparent 180deg, ${C.gold}20 240deg, transparent 300deg)`,
            animation: "spin 12s linear infinite reverse",
          }} />
          {/* glow dietro */}
          <div style={{
            position: "absolute", inset: -30, borderRadius: "50%",
            background: `radial-gradient(circle, ${C.gold}15 0%, transparent 70%)`,
            animation: "pulse 4s ease infinite",
          }} />
          <img
            src="/logo.png"
            alt="Aura Ibiza"
            style={{ height: 140, width: 140, borderRadius: "50%", objectFit: "cover", position: "relative", boxShadow: `0 0 60px rgba(200,169,110,0.22), 0 0 120px rgba(200,169,110,0.08)` }}
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

        {/* Property cards */}
        {filteredProperties.length === 0 ? (
          <div style={{ textAlign: "center", color: C.textDim, padding: "80px 0", fontSize: 15 }}>
            Nessun servizio disponibile in questa categoria al momento.
          </div>
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

              return (
                <div key={prop.id} className="card-hover" style={{
                  background: `linear-gradient(160deg, ${C.surface} 0%, rgba(14,18,26,0.95) 100%)`,
                  border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
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
                    <div style={{ position: "absolute", top: 14, left: 14, background: "rgba(8,11,15,0.75)", backdropFilter: "blur(8px)", border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: "4px 12px", fontSize: 10, color: C.gold, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" }}>
                      {assetIcon[prop.asset_type]} {prop.asset_type}
                    </div>
                    {minPrice < Infinity && (
                      <div style={{ position: "absolute", bottom: 14, right: 14, textAlign: "right" }}>
                        <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "1px", textTransform: "uppercase" }}>da</div>
                        <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 400, color: C.goldLight, lineHeight: 1 }}>€{minPrice}<span style={{ fontSize: 12, fontWeight: 300 }}>/notte</span></div>
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

                    {/* Rooms */}
                    {rooms.length > 0 && (
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginBottom: 16 }}>
                        <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 8 }}>Unità disponibili</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {rooms.map((r: any) => {
                            const pr = getPricing(r.id);
                            return (
                              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                  <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{r.name}</span>
                                  <span style={{ fontSize: 10, color: C.textDim, marginLeft: 8 }}>· {r.capacity} ospiti</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  {pr && <span style={{ fontSize: 11, color: C.gold, fontWeight: 600 }}>€{pr.min_price}/notte</span>}
                                  <button onClick={() => openModal(prop, r)} style={{ ...btn("gold"), padding: "5px 14px", fontSize: 10, borderRadius: 6 }}>
                                    Richiedi
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button onClick={() => openModal(prop, rooms[0] || null)} style={{ ...btn("outline"), width: "100%", padding: "10px", fontSize: 11 }}>
                      Richiedi Disponibilità
                    </button>
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
            <a href="https://wa.me/3454265430" target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.textMuted, marginBottom: 12, textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#25D366")} onMouseLeave={e => (e.currentTarget.style.color = C.textMuted)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              <span>+39 345 426 5430</span>
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
