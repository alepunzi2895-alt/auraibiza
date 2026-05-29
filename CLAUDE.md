# Aura Ibiza — CLAUDE.md

Piattaforma Next.js 14 per la gestione di prenotazioni, proprietà e asset di lusso a Ibiza. Sistema multi-ruolo (admin, owner, concierge, agent) con DB Turso (LibSQL) e deploy su Vercel.

## Comandi essenziali

```bash
npm run dev      # dev server su http://localhost:3000
npm run build    # build produzione (verifica TypeScript)
npm run lint     # linting TypeScript/ESLint
```

## Variabili d'ambiente

File `.env.local` (escluso da git — aggiungere anche su Vercel dashboard):

```
TURSO_DATABASE_URL=libsql://conciergebookings-therealmfkk.aws-eu-west-1.turso.io
TURSO_AUTH_TOKEN=<token jwt>
```

Il client Turso è in [src/lib/db.ts](src/lib/db.ts) con inizializzazione lazy via Proxy — lancia errore solo al momento della prima query, non al caricamento del modulo.

## Architettura

```
src/
  app/
    layout.tsx       # metadata "Aura Ibiza", font Cormorant Garamond + DM Sans
    page.tsx         # unica pagina ~3400 righe — SPA completa client-side
    globals.css      # stili globali minimali
    actions.ts       # Server Actions ("use server") — tutta la logica DB
  lib/
    db.ts            # client Turso lazy (Proxy pattern)
```

Nessuna API route separata. Tutto il server-side passa da `actions.ts`.

## Componenti principali (page.tsx)

| Componente          | Riga circa | Descrizione                                               |
|---------------------|------------|-----------------------------------------------------------|
| `LogoFull`          | ~190       | Logo + wordmark Aura Ibiza                                |
| `CalendarView`      | ~205       | Calendario disponibilità con manager/booking mode         |
| `PdfPreview`        | ~375       | Anteprima preventivo stampabile A4 (2 pagine)             |
| `AssetCategoryTabs` | ~570       | Tab Residenze / Marine / Mobilità con contatori           |
| `ConciergeDashboard`| ~600       | Dashboard concierge/agent                                 |
| `OwnerDashboard`    | ~1260      | Dashboard owner con gestione proprietà e prenotazioni     |
| `AdminDashboard`    | ~2650      | Dashboard admin — visibilità totale                       |
| `Home`              | ~3080      | Entry point: login, registrazione multi-step, routing     |
| `HelperBot`         | ~3300      | Chat bot di supporto contestuale per ruolo                |

## Design system (design token in page.tsx riga ~85)

```typescript
C = {
  bg: "#080B0F", surface: "#10141C", surfaceAlt: "#161C28",
  gold: "#C8A96E", goldLight: "#E8D5A8", goldDark: "#8A6A30",
  goldGlow: "rgba(200,169,110,0.12)", borderGold: "rgba(200,169,110,0.25)",
  ...
}
FONT = Cormorant Garamond (serif, titoli)
FONT_B = DM Sans (sans-serif, corpo)
```

Stile chiave: dark luxury, glassmorphism (`cardGlass`), gold accent, border-radius 12px.

## Database (Turso / LibSQL)

Schema auto-creato da `initDatabase()` in `actions.ts`. Migrazioni `ALTER TABLE` silenziate se la colonna esiste già.

### Tabelle

| Tabella                | Colonne chiave                                                                |
|------------------------|-------------------------------------------------------------------------------|
| `users`                | id, nickname, role, password (SHA-256), status, first_name, last_name, email, phone, services (JSON), managed_by, created_at |
| `properties`           | id, owner_id, name, location, description, image (JSON base64[]), asset_type |
| `rooms`                | id, property_id, name, capacity, image (JSON base64[]), description           |
| `pricing`              | id, room_id, month (YYYY-MM), base_price, cleaning_fee                        |
| `availability`         | id, room_id, date (YYYY-MM-DD), status (available/blocked), price_snapshot    |
| `bookings`             | id, room_id, concierge_id, client_name/surname, dates, owner_price_total, concierge_fee, total_price, status, stay_price_total, cleaning_fee_total, guests_count, fee_mode, fee_value, asset_type, price_adjustments (JSON), created_at |
| `payments`             | id, booking_id, type, amount, payment_date, method, receiver, created_at      |
| `collaborations`       | id, property_id, concierge_nickname                                           |
| `user_payment_methods` | id, user_id, name, created_at                                                 |
| `commission_rules`     | id, user_id, rate, mode (percentage/per_night/flat), created_at               |

### Status booking flow

```
draft → payment_submitted → confirmed_owner → evaso
```

## Ruoli e accesso

| Ruolo      | Accesso                                                                      |
|------------|------------------------------------------------------------------------------|
| `admin`    | Tutto — utenti, proprietà, prenotazioni, pagamenti di tutti                  |
| `owner`    | Proprie properties + collaborazioni dove è concierge                         |
| `concierge`| Properties dove ha una riga in `collaborations`                              |
| `agent`    | Identico a concierge (usa stesso dashboard)                                  |

Accesso controllatoida `getDashboardData(userId, role)` — entry point principale.

## Registrazione utenti

Flow in 2 step:
- **Step 1**: selezione ruolo (owner / concierge / agent) con card visive
- **Step 2**: credenziali (nickname + password) + dati personali (nome, cognome, email, telefono) + servizi selezionabili per tipo ruolo

Nuovo utente → `status: 'pending'` → admin approva con `approveUser()` → `status: 'active'`.

### Servizi selezionabili

**Owner** (`OWNER_SERVICES`): Appartamenti, Ville, Barche/Yacht, Auto, Scooter, Piscina, Spiaggia privata

**Concierge/Agent** (`CONCIERGE_SERVICES`): Transfer, Charter, Ristoranti, Tour, Spesa, Wellness, Nightlife, Attività acquatiche, Noleggio, Organizzazione eventi

## Separazione asset (ASSET_CATEGORIES)

```typescript
[
  { key: "residenze", types: ["apartment", "villa"] },
  { key: "marine",    types: ["boat"] },
  { key: "mobilita",  types: ["car", "scooter"] },
]
```

Componente `AssetCategoryTabs` usato sia nel ConciergeDashboard (filtro camere nel calendario) che in OwnerDashboard (filtro proprietà). Cambiare tab aggiorna automaticamente la room selezionata.

## Prezzi e commissioni

Fee concierge in 3 modalità (`fee_mode`):
- `per_night`: importo fisso × notti
- `flat`: importo fisso totale
- `percentage`: % sul prezzo owner

`total_price` = `owner_price_total` + `concierge_fee`
`price_adjustments` = JSON `{label: importo}` sommato all'owner price.

## Immagini

Storiate come array JSON di stringhe base64 in Turso (sia properties che rooms). No storage esterno. Limite pratico: < 500KB per immagine prima della compressione (`compressImage()` in page.tsx).

## Deploy

- **Hosting**: Vercel (auto-deploy su push a `main` su GitHub `alepunzi2895-alt/auraibiza`)
- **DB**: Turso eu-west-1
- **Env vars Vercel**: `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`
- **Seed automatico**: al primo avvio se DB vuoto — crea utenti demo + proprietà + pricing

## Account default (seed)

| Nickname    | Ruolo  | Password    |
|-------------|--------|-------------|
| alessandro  | admin  | Gianni95.   |
| silvia      | owner  | password123 |

## Pattern da seguire

- Mutazioni DB → Server Actions in `actions.ts` con `revalidatePath("/")`
- ID generati lato server con `uid()` (base36 8 char), prefissati per tipo (`u`, `p`, `r`, `b`, `pr`, `av`)
- Password: SHA-256 senza salt — uso interno, non produzione pubblica
- Query parametrizzate sempre con `{ sql, args }` — no string interpolation
- Batch write con `db.batch([], "write")` per atomicità
- Immagini: `compressImage(base64, 1920, 0.7)` prima di salvare in DB

## TODO / Prossimi step

- [ ] Dashboard KPI per owner e admin (revenue mensile, occupancy rate, top concierge)
- [ ] Sezione dashboard ispirata a ibizabeyond.com/reseller (da analizzare con screenshot)
- [ ] PDF ricevute prenotazione (lato server con react-pdf)
- [ ] Notifiche email (Resend o Nodemailer)
- [ ] Stripe per pagamenti online
- [ ] Calendario vista mensile aggregata multi-property
- [ ] Export CSV prenotazioni e pagamenti
