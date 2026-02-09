# PostEx Dashboard (HubLogistic)

## Overview
A unified logistics dashboard for managing orders from PostEx, Tranzo, and Shopify. Built with Next.js 16, React 19, Prisma ORM, and PostgreSQL.

## Recent Changes
- **2026-02-09**: Added Smart Alerts & Notifications page at /alerts. Separate page from Analytics. Three alert types: stuck-in-transit orders (configurable day threshold, critical/warning severity), return rate spikes by city (flagged when exceeding threshold %), courier performance drops (delivery rate below threshold). Expandable alert cards with detailed tables/charts. Configurable thresholds via settings panel. Filter by type and severity. Summary stat cards. API route at /api/alerts. Bell icon in sidebar.
- **2026-02-09**: Added Customer Insights to Analytics page: repeat customer identification (phone-based matching across Order + ShopifyOrder), customer lifetime value tracking (top 20 by revenue with progress bars), problem customer flagging (frequent returns/cancellations with visual order history). New API route at /api/analytics/customers. Tabbed interface with summary stats cards. Customer data is aggregated across all time (not filtered by month).
- **2026-02-09**: Added Delivery Performance Insights to Analytics page: average delivery time by city (horizontal bar chart, color-coded by speed), return rate analysis by city and product (ranked lists with rate bars), courier comparison (PostEx vs Tranzo side-by-side with delivery/return/in-transit/cancelled breakdown + stacked progress bars + comparison bar chart). New API route at /api/analytics/performance. Overall stats cards show avg delivery days, delivered count, returned count, total orders.
- **2026-02-09**: Added Analytics page with order trends (daily/weekly/monthly toggle with growth %), peak order days (day-of-week chart + top dates), and Pakistan city heatmap (SVG map with 44 cities, heat-colored circles sized by order volume). API route at /api/analytics aggregates from both Order and ShopifyOrder tables. Added Analytics link to sidebar.
- **2026-02-09**: Added phone, shippingAddress, shippingCity fields to ShopifyOrder model. Pending orders modal now shows address, city, and phone number for each order.
- **2026-02-09**: Added upfront payment total to PostEx dashboard monthly snapshot widget.
- **2026-02-09**: Added pending order remarks feature on Shopify page. Clicking pending count in daily breakdown opens a modal listing unfulfilled orders for that date. Each order has an editable remark field that auto-saves to DB via debounce. ShopifyOrder model has pendingRemark field. API route at /api/shopify/orders/[id]/remark with brand authorization.
- **2026-02-09**: Shopify auth now supports BOTH methods: Direct Admin API Access Token (for Custom Apps) AND Client Credentials Grant (for Dev Dashboard apps). Brand model has shopifyAccessToken, shopifyClientId, shopifyClientSecret fields. Server auto-detects which method to use. Improved error handling with specific messages for DNS failures, 403/401 errors, and missing credentials. Settings UI shows both options with clear separator.
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
