"use client";

import { useEffect, useState } from "react";
import { LANGUAGES, DEFAULT_LANG, t, type Lang } from "@/lib/i18n";

const C = {
  bg: "#080B0F", surface: "#10141C",
  gold: "#C8A96E", goldLight: "#E8D5A8",
  border: "#1E2433", borderGold: "rgba(200,169,110,0.22)",
  text: "#EDE9E1", textMuted: "#8A8678", textDim: "#484540",
};
const FONT = `'Cormorant Garamond', Georgia, serif`;
const FONT_B = `'DM Sans', 'Helvetica Neue', sans-serif`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 400, color: C.goldLight, marginBottom: 12, letterSpacing: "0.5px" }}>
        {title}
      </h2>
      <div style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.8 }}>{children}</div>
    </section>
  );
}

export default function PrivacyPageClient() {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  useEffect(() => {
    // Stessa chiave usata da homepage e piattaforma: la lingua scelta lì vale anche qui.
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("aura_lang") as Lang | null : null;
    if (stored && LANGUAGES.some(l => l.code === stored)) setLang(stored);
  }, []);
  const changeLang = (l: Lang) => {
    setLang(l);
    setLangMenuOpen(false);
    if (typeof window !== "undefined") window.localStorage.setItem("aura_lang", l);
  };

  const email = <a href="mailto:info.auraibiza@gmail.com" style={{ color: C.gold }}>info.auraibiza@gmail.com</a>;

  return (
    <div style={{
      minHeight: "100vh", background: `linear-gradient(170deg, ${C.bg} 0%, #0A0D12 60%, #080B0F 100%)`,
      padding: "60px 20px", fontFamily: FONT_B, position: "relative",
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
                    background: l.code === lang ? "rgba(200,169,110,0.12)" : "transparent",
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

      <div style={{
        maxWidth: 780, margin: "0 auto", background: C.surface,
        border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: "48px 40px",
      }}>
        <div style={{ marginBottom: 8, fontSize: 10, color: C.gold, letterSpacing: "3px", textTransform: "uppercase" }}>{t(lang, "privacy_kicker")}</div>
        <h1 style={{ fontFamily: FONT, fontSize: 34, fontWeight: 300, color: C.text, marginBottom: 8, letterSpacing: "1px" }}>
          {t(lang, "privacy_title")}
        </h1>
        <p style={{ fontSize: 12, color: C.textDim, marginBottom: 40 }}>{t(lang, "privacy_updated")}</p>

        <Section title={t(lang, "privacy_s1_title")}>
          <p>{t(lang, "privacy_s1_body").split("{email}").map((part, i, arr) => (
            <span key={i}>{part}{i < arr.length - 1 ? email : null}</span>
          ))}</p>
        </Section>

        <Section title={t(lang, "privacy_s2_title")}>
          <p style={{ marginBottom: 12 }}>{t(lang, "privacy_s2_body1")}</p>
          <p style={{ marginBottom: 12 }}>{t(lang, "privacy_s2_body2")}</p>
          <p>{t(lang, "privacy_s2_body3")}</p>
        </Section>

        <Section title={t(lang, "privacy_s3_title")}>
          <p>{t(lang, "privacy_s3_body")}</p>
        </Section>

        <Section title={t(lang, "privacy_s4_title")}>
          <p>{t(lang, "privacy_s4_body")}</p>
        </Section>

        <Section title={t(lang, "privacy_s5_title")}>
          <p>{t(lang, "privacy_s5_body")}</p>
        </Section>

        <Section title={t(lang, "privacy_s6_title")}>
          <p>{t(lang, "privacy_s6_body")}</p>
        </Section>

        <Section title={t(lang, "privacy_s7_title")}>
          <p>{t(lang, "privacy_s7_body")}</p>
        </Section>

        <Section title={t(lang, "privacy_s8_title")}>
          <p>{t(lang, "privacy_s8_body")}</p>
        </Section>

        <Section title={t(lang, "privacy_s9_title")}>
          <p>{t(lang, "privacy_s9_body")}</p>
        </Section>

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
          <a href="/" style={{ color: C.gold, fontSize: 13, textDecoration: "none" }}>{t(lang, "privacy_back_home")}</a>
        </div>
      </div>
    </div>
  );
}
