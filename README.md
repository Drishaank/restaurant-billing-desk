# Restaurant Billing Desk

Multi-business restaurant POS. Each business gets its own access key; menu, bills and invoice numbers are isolated per business.

- `server/`: Node + Express API on PostgreSQL. Tables are created on start. Env: `DATABASE_URL`. Start: `npm install` then `npm start`.
- `web/`: React + TypeScript (Vite). Env: `VITE_API_URL` (the API's public URL). Build: `npm run build`, output `dist`.
