# PrivChat

> Minimal end-to-end encrypted chat (Google Chat-like UX)

- Frontend: Next.js + Tailwind
- Backend: Node.js + Express + Socket.IO + PostgreSQL
- Auth: Google OAuth (passport-google-oauth20)
- E2EE: AES-GCM per-message keys wrapped with RSA-OAEP per recipient

## Quick start

1. Copy `.env.example` to `.env` and fill values (Google client id/secret, DB url, session secret, VAPID keys). On Replit put these in the Secrets pane instead of a file.
2. Install deps and initialize the DB and run in dev locally:

```bash
# at repo root
npm install
npm run install:all
# init DB (server will run migrations from schema.sql)
cd server && npm run init-db
# run both server and web in dev
cd ..
npm run dev
```

3. Open the web app at http://localhost:3000 and click "Sign in with Google".

## Notes
- RSA keypair is generated and stored in the browser's IndexedDB (never sent to server). Public key is uploaded automatically after first sign-in.
- Server stores only ciphertext, IV, and per-recipient encrypted AES keys (in `message_keys`). Messages' plaintext is never stored on server.
- Default rooms `General`, `Random`, `Support` are created automatically.

## Replit
To deploy to Replit, set secrets (env vars) in the Replit Secrets pane and enable port-based deployment. The app uses the Replit PostgreSQL if `DATABASE_URL` points to it.

## Next steps and caveats
- Production hardening (CORS, HTTPS, secure cookies, CSP, rate-limiting), testing, and device-key management are not yet implemented. Use this code as a scaffold and follow security best practices before production use.
