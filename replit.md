# PostEx Dashboard (HubLogistic)

## Overview
A unified logistics dashboard for managing orders from PostEx, Tranzo, and Shopify. Built with Next.js 16, React 19, Prisma ORM, and PostgreSQL.

## Recent Changes
- **2026-02-09**: Added Shopify Orders page. Fetches orders via Shopify Admin API, compares daily Shopify orders vs dispatched orders by courier partner (PostEx/Tranzo). Includes DB-first architecture, daily comparison chart, fulfillment tracking, and revenue summary.
- **2026-02-09**: Refactored ALL pages to DB-first architecture. PostEx, Tranzo, Overview, and Critical Orders all load from database on page open. External courier APIs only called when user clicks "Sync Live Data". Removed auto-sync and cache TTL logic.
- **2026-02-09**: Migrated brand settings from localStorage to PostgreSQL. Brands now persist across deployments/devices. Auto-migrates existing localStorage brands on first load.
- **2026-02-09**: Fixed 9 bugs + 5 performance improvements (bulk tracking, cache TTL, server-side filtering, memoized cities, conditional logging).
- **2026-02-09**: Migrated from Vercel to Replit environment. Configured port 5000, PostgreSQL database, Prisma schema sync.

## Project Architecture
- **Framework**: Next.js 16 (App Router with Turbopack)
- **Database**: PostgreSQL via Prisma ORM
- **Styling**: Tailwind CSS v4
- **Charts**: Recharts
- **Package Manager**: npm

### Directory Structure
```
app/              - Next.js App Router pages and API routes
  api/            - Backend API routes (postex, tranzo, shopify)
  postex/         - PostEx portal pages
  tranzo/         - Tranzo portal pages
  shopify/        - Shopify orders comparison page
  settings/       - Settings page
  daily/          - Daily reports page
components/       - React UI components (Dashboard, Charts, Tables)
lib/              - Shared utilities (Prisma client, types)
prisma/           - Database schema
scripts/          - Diagnostic and maintenance scripts
public/           - Static assets
```

### Key Environment Variables
- `PRISMA_DATABASE_URL` - PostgreSQL connection string (connection pool)
- `POSTGRES_URL` - Direct PostgreSQL connection (for migrations)
- `DATABASE_URL` - Replit-provided PostgreSQL URL

### Development
- Dev server: `npm run dev` (runs on port 5000)
- Build: `npm run build` (generates Prisma client, pushes schema, builds Next.js)
- Start: `npm run start` (production server on port 5000)

## User Preferences
- No specific preferences recorded yet.
