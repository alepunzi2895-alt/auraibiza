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

  // Form state
  const [form, setForm] = useState({ name:"", email:"", phone:"", checkIn:"", checkOut:"", guests:"1", message:"" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    getPublicListings().then(setListings);
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
          <a href="/platform" style={{ ...btn("outline"), textDecoration: "none", display: "inline-block", padding: "8px 20px" }}>Accedi</a>
        </nav>
      </header>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
        textAlign: "center", padding: "120px 24px 80px",
        background: `radial-gradient(ellipse at 30% 40%, rgba(200,169,110,0.08) 0%, transparent 55%),
                     radial-gradient(ellipse at 70% 70%, rgba(74,126,196,0.05) 0%, transparent 50%),
                     linear-gradient(180deg, ${C.bg} 0%, #0A0D12 100%)`,
        position: "relative", overflow: "hidden",
      }}>
        {/* decorative lines */}
        <div style={{ position: "absolute", top: "20%", left: "10%", width: 1, height: 120, background: `linear-gradient(to bottom, transparent, ${C.gold}33, transparent)` }} />
        <div style={{ position: "absolute", top: "60%", right: "8%", width: 1, height: 80, background: `linear-gradient(to bottom, transparent, ${C.gold}22, transparent)` }} />

        <div style={{ position: "relative", marginBottom: 32 }}>
          <div style={{ position: "absolute", inset: -10, borderRadius: "50%", background: `conic-gradient(${C.gold}22 0deg, transparent 90deg, ${C.gold}15 180deg, transparent 270deg, ${C.gold}22 360deg)`, animation: "spin 20s linear infinite" }} />
          <img src="/logo.png" alt="Aura Ibiza" style={{ height: 100, width: 100, borderRadius: "50%", objectFit: "cover", position: "relative", boxShadow: `0 0 60px ${C.goldGlow}` }} />
        </div>

        <div style={{ fontSize: 11, color: C.gold, letterSpacing: "6px", textTransform: "uppercase", marginBottom: 24, animation: "pulse 3s ease infinite" }}>
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

        {/* scroll indicator */}
        <div style={{ position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: 0.4 }}>
          <div style={{ fontSize: 10, letterSpacing: "3px", textTransform: "uppercase", color: C.textDim }}>Scorri</div>
          <div style={{ width: 1, height: 40, background: `linear-gradient(to bottom, ${C.gold}, transparent)` }} />
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
              <a href="/platform" style={{ ...btn("gold"), textDecoration: "none", display: "inline-block", padding: "14px 40px", fontSize: 13 }}>
                Accedi alla Piattaforma →
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
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "48px 32px 32px", background: C.surface }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 32 }}>
          <div>
            <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 300, color: C.gold, letterSpacing: "4px", textTransform: "uppercase", marginBottom: 8 }}>Aura Ibiza</div>
            <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.8 }}>Luxury Concierge · Ibiza<br />Esperienze su misura per i tuoi momenti più speciali</div>
          </div>
          <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, color: C.gold, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14 }}>Servizi</div>
              {["Residenze di lusso", "Yacht & Marine", "Auto & Transfer", "Esperienze"].map(s => (
                <div key={s} style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>{s}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.gold, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14 }}>Piattaforma</div>
              <a href="/platform" style={{ display: "block", fontSize: 12, color: C.textMuted, marginBottom: 8, textDecoration: "none" }}>Accedi</a>
              <a href="/platform" style={{ display: "block", fontSize: 12, color: C.textMuted, marginBottom: 8, textDecoration: "none" }}>Registrati</a>
              <a href="#collaborate" style={{ display: "block", fontSize: 12, color: C.textMuted, textDecoration: "none" }}>Collabora</a>
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: "32px auto 0", paddingTop: 24, borderTop: `1px solid ${C.border}`, textAlign: "center", fontSize: 11, color: C.textDim }}>
          © {new Date().getFullYear()} Aura Ibiza · Tutti i diritti riservati
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
