# SkillForge Arena

A real-money, multi-game competition platform — Ludo, Checkers, Chess, Billiards, and Solitaire — with M-Pesa deposits/withdrawals, live wallet sync, and player/admin dashboards.

**This package is the frontend only.** It covers auth, the player dashboard (game floor, wallet, match history) and the admin console (overview, players, transactions, games), all wired to Supabase. Game boards are shown as cards with no game logic yet — that's the next phase of work. See [What's stubbed vs. real](#whats-stubbed-vs-real) below.

## Stack

- **React 19** + **TanStack Router** (file-based routing, client-rendered SPA)
- **Tailwind CSS v4** with a custom design system (see `src/styles.css`)
- **shadcn/ui**-style primitives, hand-installed in `src/components/ui`
- **Supabase** — Postgres + Auth + Realtime, client in `src/utils/supabase.ts`
- **TypeScript** throughout, with hand-written DB types in `src/types/database.types.ts`

## Getting started

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

### Environment variables

A `.env` file is already included with the Supabase credentials you provided:

```
VITE_SUPABASE_URL=https://pgxvhwcztdvupqjphmcn.supabase.co
VITE_SUPABASE_KEY=sb_publishable_838f0LDsqgSvI6RboHQD_g_u6LWkXaj
```

If you rotate keys or point this at a different Supabase project, update `.env` (see `.env.example` for the shape).

### Running the first migration

The schema this frontend expects lives in `supabase/migrations/0001_init.sql`. Run it against your Supabase project before using the app:

```bash
npx supabase login
npx supabase link --project-ref pgxvhwcztdvupqjphmcn
npx supabase db push
```

Or paste the contents of `supabase/migrations/0001_init.sql` directly into the Supabase SQL editor (Dashboard → SQL Editor → New query → Run).

This migration creates:
- `profiles`, `wallets` — auto-created for every new user via a trigger (`handle_new_user`)
- `games` — seeded with the five games from the brief
- `matches`, `match_players` — hosted tables and seating
- `transactions` — the money ledger (deposits, withdrawals, stakes, payouts)
- Row Level Security policies for all of the above

After running it, **make your own user an admin** to see the admin console:

```sql
update public.profiles set role = 'admin' where username = 'your_username';
```

## Project structure

```
src/
  components/
    ui/            shadcn-style primitives (button, card, dialog, tabs, ...)
    layout/         sidebar, auth page shell
    dashboard/       game card, wallet HUD, M-Pesa dialog, stat card
  lib/
    auth-context.tsx  Supabase session/profile/wallet provider + realtime wallet sync
    game-catalogue.ts static metadata for the 5 games (names, glyphs, stakes)
    utils.ts          cn() class merger
  routes/
    index.tsx              marketing landing page
    signin.tsx / signup.tsx auth pages wired to supabase.auth
    _authed.tsx             route guard — redirects to /signin if no session
    _authed/dashboard*       player dashboard (floor, wallet, history)
    _authed/admin*           admin console (role-gated to role = 'admin')
  types/
    database.types.ts  hand-written types matching the migration (regenerate
                        with the Supabase CLI once your schema evolves)
supabase/
  migrations/0001_init.sql  first migration — run this against your project
```

## What's stubbed vs. real

This was scoped deliberately as a frontend-first pass. Here's exactly what's wired up versus mocked:

**Real / working:**
- Sign up, sign in, sign out via Supabase Auth
- Profile + wallet auto-provisioning on signup (via Postgres trigger)
- Player dashboard reads live data: wallet balance, transaction history, match history
- Admin console reads live data: player list, transaction ledger, platform stats
- Realtime wallet balance updates (Supabase Realtime subscription)
- Row Level Security so users can only see their own wallet/transactions, admins see everything
- Game on/off toggles in the admin console actually update the `games` table

**UI-only stubs (no backend logic yet):**
- The five game cards on the floor — no matchmaking, no game boards, no real game logic
- The M-Pesa deposit/withdraw dialog — collects phone + amount but doesn't call Daraja. STK Push (deposits) and B2C payouts (withdrawals) **must** be triggered from a trusted backend that holds your Daraja consumer key/secret; never from the browser. Wire the dialog's `handleSubmit` in `src/components/dashboard/mpesa-dialog.tsx` to a Supabase Edge Function once that exists.
- "Suspend/unsuspend player" button in admin → Players (UI present, no mutation yet)

## Design system

Dark, high-stakes aesthetic rather than a generic SaaS dashboard look:

- **Colors**: near-black base (`#0e0f12`), gold for stakes/wins (`#e8c547`), emerald for active/success states, red for loss/danger — all defined as Tailwind v4 `@theme` tokens in `src/styles.css`
- **Type**: Space Grotesk (display), Inter (body), JetBrains Mono (balances/stakes — tabular figures)
- **Signature element**: game cards styled like table placards, wallet balance styled like a scoreboard

## Next steps

1. Build the actual game boards/engines (chess rules, checkers rules, etc.) — each is its own substantial project
2. Build a backend service (Node/Express or Supabase Edge Functions) to handle Daraja STK Push + B2C callbacks and write verified transactions
3. Matchmaking: turn `matches` + `match_players` into real lobby/seating flows with Realtime
4. Escrow logic: lock stake into `wallets.locked_cents` on join, release to winner's `balance_cents` on match completion
