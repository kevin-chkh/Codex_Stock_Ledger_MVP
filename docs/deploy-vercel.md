# Vercel Deployment Guide

## 1) Prepare

- Ensure `npm run build` passes locally.
- Ensure Supabase project is ready.

## 2) Environment Variables (Vercel Project Settings)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3) Deploy

1. Connect repository to Vercel.
2. Set production branch.
3. Trigger deploy.

## 4) Post Deploy Checks

1. Open production URL.
2. Login flow works.
3. `Dashboard/Trades/Holdings/Analytics` render correctly.
4. Add/edit/delete trade works.
5. Stock catalog reload works.
6. JSON backup and CSV import/export work.

## 5) Rollback

- Use Vercel Deployments page to rollback to previous successful build.
