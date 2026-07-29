---
name: deploy-auraibiza
description: Deploy/hosting runbook for Aura Ibiza — Vercel env vars, Google OAuth redirect URI setup, Preview-deploy limitations. Use when setting up deploy infra, adding env vars, or debugging why Google login fails on a Vercel deployment.
---

## Deploy

- **Hosting**: Vercel (auto-deploy su push a `main` su GitHub `alepunzi2895-alt/auraibiza`)
- **DB**: Turso eu-west-1
- **Env vars Vercel**: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (= `https://auraibiza.com` in Production), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Google OAuth**: redirect URI autorizzato su Google Cloud Console: `https://auraibiza.com/api/auth/callback/google` (+ `http://localhost:3000/api/auth/callback/google` per lo sviluppo locale). Il login Google **non funziona sui deploy Preview di Vercel** (URL effimero non in whitelist) — va testato solo su `localhost` o produzione.
- **Seed automatico**: al primo avvio se DB vuoto — crea utenti demo + proprietà + pricing
