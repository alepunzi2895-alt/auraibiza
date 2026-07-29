import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Aura Ibiza",
  description: "Informativa sulla privacy di Aura Ibiza",
};

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

export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: "100vh", background: `linear-gradient(170deg, ${C.bg} 0%, #0A0D12 60%, #080B0F 100%)`,
      padding: "60px 20px", fontFamily: FONT_B,
    }}>
      <div style={{
        maxWidth: 780, margin: "0 auto", background: C.surface,
        border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: "48px 40px",
      }}>
        <div style={{ marginBottom: 8, fontSize: 10, color: C.gold, letterSpacing: "3px", textTransform: "uppercase" }}>Aura Ibiza</div>
        <h1 style={{ fontFamily: FONT, fontSize: 34, fontWeight: 300, color: C.text, marginBottom: 8, letterSpacing: "1px" }}>
          Informativa sulla Privacy
        </h1>
        <p style={{ fontSize: 12, color: C.textDim, marginBottom: 40 }}>Ultimo aggiornamento: 29 luglio 2026</p>

        <Section title="Titolare del trattamento">
          <p>
            Il titolare del trattamento dei dati raccolti tramite questo sito e la piattaforma gestionale
            Aura Ibiza è raggiungibile all&apos;indirizzo email{" "}
            <a href="mailto:info.auraibiza@gmail.com" style={{ color: C.gold }}>info.auraibiza@gmail.com</a>.
          </p>
        </Section>

        <Section title="Quali dati raccogliamo">
          <p style={{ marginBottom: 12 }}>
            <strong style={{ color: C.text }}>Visitatori del sito pubblico</strong> (ricerca ville, appartamenti,
            barche e altri servizi): non raccogliamo dati personali per la sola navigazione. I dati di contatto
            forniti volontariamente per una richiesta di disponibilità o prenotazione (nome, email, telefono,
            date, messaggio) vengono usati esclusivamente per rispondere alla richiesta.
          </p>
          <p style={{ marginBottom: 12 }}>
            <strong style={{ color: C.text }}>Utenti registrati alla piattaforma gestionale</strong> (proprietari,
            concierge, agenti): nickname, password (memorizzata in forma cifrata, mai in chiaro), nome, cognome,
            email, numero di telefono, foto profilo (facoltativa), servizi offerti e dati relativi alle proprietà,
            prenotazioni e pagamenti gestiti sulla piattaforma.
          </p>
          <p>
            <strong style={{ color: C.text }}>Accesso tramite Google</strong>: se scegli di registrarti o accedere
            con il tuo account Google, riceviamo da Google nome, indirizzo email e foto profilo associati
            all&apos;account che utilizzi per l&apos;accesso. Non riceviamo né richiediamo la tua password Google.
          </p>
        </Section>

        <Section title="Perché usiamo questi dati">
          <p>
            I dati sono trattati per: gestire la registrazione e l&apos;autenticazione degli utenti della
            piattaforma; consentire la gestione di proprietà, disponibilità, prenotazioni e pagamenti; rispondere
            a richieste di disponibilità o prenotazione ricevute tramite il sito pubblico; comunicazioni
            strettamente legate al servizio (es. approvazione account, notifiche di prenotazione).
          </p>
        </Section>

        <Section title="Con chi condividiamo i dati">
          <p>
            Non vendiamo né condividiamo i tuoi dati con terze parti a fini di marketing. I dati sono trattati
            dai fornitori tecnici che erogano il servizio in nostra vece, in qualità di responsabili del
            trattamento: hosting e infrastruttura applicativa (Vercel), database (Turso), e — se scegli
            l&apos;accesso con Google — l&apos;autenticazione tramite Google LLC secondo i termini del tuo account
            Google.
          </p>
        </Section>

        <Section title="Cookie">
          <p>
            Utilizziamo un unico cookie tecnico necessario per mantenere la sessione di accesso alla piattaforma
            gestionale (evita di dover effettuare nuovamente il login ad ogni visita). Non utilizziamo cookie di
            profilazione o di terze parti a fini pubblicitari.
          </p>
        </Section>

        <Section title="Conservazione dei dati">
          <p>
            I dati dell&apos;account vengono conservati per tutta la durata dell&apos;iscrizione alla piattaforma.
            Puoi richiedere la cancellazione del tuo account e dei relativi dati in qualsiasi momento scrivendo
            all&apos;indirizzo email indicato sopra.
          </p>
        </Section>

        <Section title="I tuoi diritti">
          <p>
            In qualità di interessato hai diritto di accedere ai tuoi dati, richiederne la rettifica o la
            cancellazione, opporti al trattamento o richiederne la limitazione, e ottenere la portabilità dei
            dati, scrivendo all&apos;indirizzo email indicato sopra.
          </p>
        </Section>

        <Section title="Minori">
          <p>
            Il servizio non è rivolto a persone di età inferiore ai 18 anni e non raccogliamo consapevolmente
            dati relativi a minori.
          </p>
        </Section>

        <Section title="Modifiche a questa informativa">
          <p>
            Questa informativa può essere aggiornata periodicamente per riflettere cambiamenti nel servizio o
            nella normativa applicabile. La data di ultimo aggiornamento è indicata in cima alla pagina.
          </p>
        </Section>

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
          <a href="/" style={{ color: C.gold, fontSize: 13, textDecoration: "none" }}>← Torna alla home</a>
        </div>
      </div>
    </div>
  );
}
