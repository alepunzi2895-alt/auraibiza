# Aura Ibiza — CLAUDE.md

Piattaforma Next.js 14 per la gestione di prenotazioni e proprietà vacanza a Ibiza, con sistema multi-ruolo (admin, owner, concierge, agent) e DB Turso (LibSQL).

## Comandi essenziali

```bash
npm run dev      # dev server su http://localhost:3000
npm run build    # build produzione
npm run lint     # linting TypeScript/ESLint
```

## Variabili d'ambiente

File `.env.local` (escluso da git):

```
TURSO_DATABASE_URL=libsql://conciergebookings-therealmfkk.aws-eu-west-1.turso.io
TURSO_AUTH_TOKEN=<token>
```

Il client Turso è in [src/lib/db.ts](src/lib/db.ts) — lancia errore se le env mancano, non fallisce silenziosamente.

## Architettura

```
src/
  app/
    layout.tsx       # layout root, font Google (Cormorant Garamond + DM Sans)
    page.tsx         # unica pagina, tutto il UI è qui (SPA-style)
    globals.css      # stili globali minimali
    actions.ts       # Server Actions Next.js — tutta la logica DB
  lib/
    db.ts            # client Turso (@libsql/client)
```

Tutta la logica server sta in `actions.ts` come Server Actions (`"use server"`). Non ci sono API routes separati.

## Database (Turso / LibSQL)

Schema auto-creato da `initDatabase()` in `actions.ts`. Le migrazioni `ALTER TABLE` vengono tentate a ogni avvio e silenziate se la colonna esiste già.

**Tabelle principali:**

| Tabella               | Note chiave                                            |
|-----------------------|--------------------------------------------------------|
| `users`               | ruoli: admin/owner/concierge/agent; status: active/pending |
| `properties`          | asset_type: apartment/boat/villa/etc; immagini in JSON array base64 |
| `rooms`               | collegate a properties; immagini in JSON array base64  |
| `pricing`             | base_price + cleaning_fee per mese (YYYY-MM)           |
| `availability`        | una riga per giorno, status: available/blocked         |
| `bookings`            | fee_mode: per_night/flat/percentage; status: draft→payment_submitted→confirmed_owner→evaso |
| `payments`            | type: acconto/saldo/saldo_owner; receiver: concierge/owner |
| `collaborations`      | property_id + concierge_nickname (non FK, cerca per nick) |
| `commission_rules`    | rate + mode per user_id                                |

## Logica ruoli

- **admin** (`u1` / `alessandro`): vede tutto
- **owner**: vede solo le proprie properties + quelle dove è concierge via `collaborations`
- **concierge / agent**: vede solo le properties dove ha una riga in `collaborations`

La funzione `getDashboardData(userId, role)` in `actions.ts` gestisce il filtering per ruolo — è il punto di ingresso principale per il caricamento dati.

## Registrazione utenti

I nuovi utenti si registrano con nickname + password e finiscono in status `pending`. L'admin li approva con `approveUser()` o li rifiuta con `rejectUser()`. Solo gli utenti `active` possono fare login.

## Prezzi e commissioni

La fee del concierge supporta 3 modalità (`fee_mode`):
- `per_night`: importo fisso per notte
- `flat`: importo fisso totale
- `percentage`: percentuale sul prezzo owner

Il `total_price` = `owner_price_total` + `concierge_fee`. Gli aggiustamenti prezzo (`price_adjustments`) sono un JSON `{label: importo}` sommato all'owner price.

## Immagini

Le immagini di properties e rooms sono storiate come array JSON di stringhe base64 direttamente in Turso. Non c'è upload su storage esterno. Limite pratico: evitare immagini > 500KB per riga DB.

## Deploy (Vercel)

Variabili da configurare nel progetto Vercel:
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

Il seed viene eseguito automaticamente al primo avvio se il DB è vuoto (`initDatabase()` controlla `COUNT(*) = 0` su `users`).

## Pattern da seguire

- Tutte le mutazioni DB passano per Server Actions in `actions.ts` con `revalidatePath("/")`
- Gli ID sono generati lato server con `uid()` (random base36 8 char), prefissati per tipo (`u`, `p`, `r`, `b`, `pr`, `av`)
- Le password sono hashate con SHA-256 (niente salt — sufficiente per uso interno, non produzione pubblica)
- Le query parametrizzate usano sempre `{ sql, args }` per prevenire SQL injection
- Il batch write usa `db.batch([], "write")` per atomicità
