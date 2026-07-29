# Aura Ibiza — CLAUDE.md

Piattaforma Next.js 14 per la gestione di prenotazioni, proprietà e asset di lusso a Ibiza. Sistema multi-ruolo (admin, owner, concierge, agent) con DB Turso (LibSQL) e deploy su Vercel.

## Variabili d'ambiente

File `.env.local` (escluso da git — aggiungere anche su Vercel dashboard):

```
TURSO_DATABASE_URL=libsql://auraibiza-therealmfkk.aws-eu-west-1.turso.io
TURSO_AUTH_TOKEN=<token jwt>
NEXTAUTH_SECRET=<stringa random, es. openssl rand -base64 33>
GOOGLE_CLIENT_ID=<da Google Cloud Console>
GOOGLE_CLIENT_SECRET=<da Google Cloud Console>
```

Il client Turso è in [src/lib/db.ts](src/lib/db.ts) con inizializzazione lazy via Proxy — lancia errore solo al momento della prima query, non al caricamento del modulo.

`NEXTAUTH_URL` va impostata esplicitamente su Vercel (Production) al dominio pubblico (es. `https://auraibiza.com`); in locale non serve, di default punta a `http://localhost:3000`.

## Architettura

Tutto il server-side passa da `actions.ts`, **tranne l'autenticazione**: `api/auth/[...nextauth]/route.ts` è l'unica API route separata, richiesta strutturalmente da NextAuth per il callback OAuth di Google (CSRF, redirect, scambio token). Vedi sezione "Autenticazione" sotto.

## Design system

Stile chiave: dark luxury, glassmorphism (`cardGlass`), gold accent, border-radius 12px.

## Database (Turso / LibSQL)

Schema auto-creato da `initDatabase()` in `actions.ts`. Migrazioni `ALTER TABLE` silenziate se la colonna esiste già.

### Tabelle

| Tabella                | Colonne chiave                                                                |
|------------------------|-------------------------------------------------------------------------------|
| `users`                | id, nickname, role, password (SHA-256, NULL per utenti Google), status, first_name, last_name, email (obbligatoria in registrazione, controllo unicità applicativo — nessun UNIQUE a DB), phone, services (JSON), managed_by, google_id (NULL se non collegato a Google), created_at |
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

## Autenticazione

Due metodi, entrambi passano da NextAuth v4 (`src/lib/auth.ts`), sessione JWT persistente (cookie, sopravvive al refresh) — nessun DB adapter, nessuna tabella NextAuth: tutto contro la tabella `users` esistente.

- **Nickname + password**: `CredentialsProvider` il cui `authorize()` chiama `loginOrRegister()` (`actions.ts`) esattamente come prima. Gli errori (`utente non trovato`, `password errata`, `account pending`) vengono rilanciati come `Error` e arrivano intatti al client via `signIn("credentials", { redirect: false }).error`.
- **Google**: `GoogleProvider`. Il collegamento account/creazione utente avviene nel callback `signIn` di `src/lib/auth.ts`, per `google_id` prima e per `email` poi (link automatico a un account nickname/password esistente con la stessa email). Un'identità Google mai vista prima non crea subito una riga in `users`: ottiene una sessione "transitoria" (`isNewGoogleUser: true`) che porta alla schermata di completamento profilo in `platform/page.tsx` (ruolo + dati, niente password) — il submit chiama la nuova action `completeGoogleRegistration()`.

In entrambi i casi un utente `status: 'pending'` non ottiene mai una sessione (stesso comportamento di sempre) — per Google, il `signIn` callback reindirizza a `/platform?error=pending`.

### Profilo personale e reset password

Ogni utente aggiorna i propri dati (nome, cognome, email, telefono, servizi, avatar) da **My Profile** (click su avatar/nickname nell'header di `Home`) — modale condivisa `MyProfileModal` in `platform/page.tsx`, action `updateOwnProfile()`. Nickname sempre read-only. Stesso modale include il cambio password (`changePasswordAction()`, unico punto d'accesso — non più duplicato in Concierge/Owner).

Reset password dimenticata via email (Resend, wrapper in `src/lib/email.ts`): link "Forgot your password?" in login → `requestPasswordReset(identifier, lang)` genera un token (`reset_token`/`reset_token_expires` su `users`, scadenza 1h) e invia l'email — risposta sempre generica per non rivelare quali account esistono. Account solo-Google (`password IS NULL`) ricevono un avviso a usare "Continua con Google", nessun token. Il link punta a `/platform?resetToken=<token>`, intercettato dallo stesso `useEffect` che legge `?register=1`/`?error=pending`, e mostra il form "Set a new password" → `resetPasswordWithToken()`.

## Registrazione utenti

Flow in 2 step:
- **Step 1**: selezione ruolo (owner / concierge / agent) con card visive, oppure bottone "Continua con Google" (salta lo Step 1 lato UI ma il ruolo va comunque scelto nella schermata di completamento profilo dopo il redirect)
- **Step 2**: credenziali (nickname + password, entrambi obbligatori) + dati personali (nome, cognome, **email obbligatoria**, telefono) + servizi selezionabili per tipo ruolo. Con Google, lo Step 2 equivalente non ha campi password (l'autenticazione resta sempre Google) ed email precompilata/bloccata dal profilo Google.

Email obbligatoria e controllata per unicità sia in `registerUser()` che in `completeGoogleRegistration()` (stesso stile del controllo unicità nickname già esistente — nessun vincolo `UNIQUE` a DB, SQLite/Turso non permette di aggiungerlo via `ALTER TABLE` senza riscrivere la tabella).

Nuovo utente (via nickname/password o via Google) → `status: 'pending'` → admin approva con `approveUser()` → `status: 'active'`.

### Servizi selezionabili

**Owner** (`OWNER_SERVICES`): Appartamenti, Ville, Barche/Yacht, Auto, Scooter, Piscina, Spiaggia privata

**Concierge/Agent** (`CONCIERGE_SERVICES`): Transfer, Charter, Ristoranti, Tour, Spesa, Wellness, Nightlife, Attività acquatiche, Noleggio, Organizzazione eventi

## Separazione asset (ASSET_CATEGORIES)

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

Vercel + Turso eu-west-1. Runbook completo (env vars, redirect URI Google, limiti Preview) nella skill `deploy-auraibiza`.

## Account default (seed)

| Nickname    | Ruolo  |
|-------------|--------|
| alessandro  | admin  |

Password non riportata in chiaro nella documentazione.

## Pattern da seguire

- Mutazioni DB → Server Actions in `actions.ts` con `revalidatePath("/")`
- ID generati lato server con `uid()` (base36 8 char), prefissati per tipo (`u`, `p`, `r`, `b`, `pr`, `av`)
- Password: SHA-256 senza salt — uso interno, non produzione pubblica. `password` è `NULL` per gli utenti che autenticano solo via Google (stesso pattern già usato per gli utenti creati da un admin con `createManagedUser`) — `loginOrRegister()` già gestisce questo caso
- Query parametrizzate sempre con `{ sql, args }` — no string interpolation
- Batch write con `db.batch([], "write")` per atomicità
- Immagini: `compressImage(base64, 1920, 0.7)` prima di salvare in DB

## TODO / Prossimi step

- [ ] Dashboard KPI per owner e admin (revenue mensile, occupancy rate, top concierge)
- [ ] Sezione dashboard ispirata a ibizabeyond.com/reseller (da analizzare con screenshot)
- [ ] PDF ricevute prenotazione (lato server con react-pdf)
- [ ] Notifiche email su nuova prenotazione / cambio status (a `info.auraibiza@gmail.com` + concierge/agent/cliente) — riusa `src/lib/email.ts` già introdotto per il reset password
- [ ] Stripe per pagamenti online
- [ ] Calendario vista mensile aggregata multi-property
- [ ] Export CSV prenotazioni e pagamenti
