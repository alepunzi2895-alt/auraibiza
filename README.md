# Aura Ibiza — Concierge Booking & Property Management

Piattaforma di gestione prenotazioni e proprietà per concierge e owner, con supporto multi-ruolo (admin, owner, concierge, agent).

## Setup

```bash
npm install
```

Crea il file `.env.local` con le credenziali Turso:

```
TURSO_DATABASE_URL=libsql://<your-db>.turso.io
TURSO_AUTH_TOKEN=<your-token>
```

```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000)

## Account di default (seed automatico al primo avvio)

| Nickname    | Ruolo  | Password    |
|-------------|--------|-------------|
| alessandro  | admin  | Gianni95.   |
| silvia      | owner  | password123 |

Il seed viene eseguito automaticamente solo se il DB è vuoto.

## Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: React 18, inline styles, Cormorant Garamond + DM Sans
- **DB**: Turso (LibSQL / SQLite edge) via `@libsql/client`
- **Deploy**: Vercel

## Struttura DB

| Tabella               | Descrizione                                  |
|-----------------------|----------------------------------------------|
| `users`               | Utenti con ruolo e stato approvazione        |
| `properties`          | Proprietà degli owner                        |
| `rooms`               | Stanze/unità per ogni proprietà              |
| `pricing`             | Prezzi mensili per stanza                    |
| `availability`        | Calendario disponibilità giornaliera         |
| `bookings`            | Prenotazioni con fee concierge               |
| `payments`            | Pagamenti legati alle prenotazioni           |
| `collaborations`      | Relazione owner/concierge per proprietà      |
| `user_payment_methods`| Metodi di pagamento personalizzati           |
| `commission_rules`    | Regole commissione per utente                |

## Ruoli

- **admin**: visibilità totale su tutto il sistema
- **owner**: gestisce le proprie proprietà, vede le prenotazioni
- **concierge / agent**: crea prenotazioni sulle proprietà assegnate

## Deploy su Vercel

1. Push su GitHub
2. Vai su [vercel.com](https://vercel.com) → Import → seleziona repo
3. Aggiungi le variabili d'ambiente `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`
4. Deploy automatico

## Prossimi step

- [ ] PDF server-side per ricevute prenotazione
- [ ] Notifiche email ai clienti
- [ ] Stripe per pagamenti online
- [ ] Marketplace multi-concierge pubblico
