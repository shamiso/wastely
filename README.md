# Wastely

Smart Waste Optimizer pilot built with SvelteKit remote functions, Turso, Better Auth, and S3-compatible media storage.

## Stack

- SvelteKit + Tailwind
- Better Auth (email/password)
- Drizzle ORM
- Turso (libSQL)
- S3-compatible object storage (Cloudflare R2 works)

## Environment

Copy `.env.example` to `.env` and fill all required values:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `BETTER_AUTH_SECRET`
- `ORIGIN`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_FORCE_PATH_STYLE`

## Install & Run

```bash
pnpm install
pnpm db:generate
pnpm db:push
pnpm auth:schema
pnpm dev
```

## Project Structure

- `src/lib/server/services`: business/domain services
- `src/lib/server/api/*.remote.ts`: SvelteKit remote functions (query/command/form)
- `src/lib/server/db`: Drizzle schema + connection
- `src/routes`: role-based UI sections

## Roles

Users are auto-provisioned as `citizen` on first login.

To promote a user:

```sql
update user_role set role = 'driver' where user_id = '<USER_ID>';
update user_role set role = 'admin' where user_id = '<USER_ID>';
```
