# Supabase QA Checklist

## Prerequisite

- `.env.local` has:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Schema applied from `supabase/schema.sql`
- RLS policies enabled

## Table Connectivity Check

Run:

```bash
npm run qa:supabase
```

Expected:
- `[OK] portfolios`
- `[OK] cash_movements`
- `[OK] stocks`
- `[OK] stock_tags`
- `[OK] trades`
- `[OK] settings`

## Functional QA

1. Sign in with magic link.
2. Create portfolio and deposit cash.
3. Add buy trade; refresh page and verify persistence.
4. Edit trade; verify cash and metrics update.
5. Delete trade; verify rollback.
6. Update stock price; verify unrealized PnL update.
7. Verify same account data on another browser session.
