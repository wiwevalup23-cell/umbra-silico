# Umbra Silico

Local-first application for notes with the Silicon Nostalgia interface.

The application itself lives in [`apps/app`](apps/app). It is built with React,
TypeScript, Vite and Tauri; notes are stored locally first and can be
synchronized with Supabase.

## Development

```bash
cd apps/app
npm install
npm run dev
```

Further technical details and available commands are in
[`apps/app/README.md`](apps/app/README.md). Database migrations for Supabase
are kept in [`supabase/migrations`](supabase/migrations).
