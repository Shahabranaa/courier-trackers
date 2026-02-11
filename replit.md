# PostEx Dashboard (HubLogistic)

## Overview
A unified logistics dashboard for managing orders from PostEx, Tranzo, and Shopify. Built with Next.js 16, React 19, Prisma ORM, and PostgreSQL.

## Recent Changes
- **2026-02-11**: Enhanced avg delivery time by city in Analytics: Now shows PostEx vs Tranzo side-by-side grouped bar chart with orange/violet bars. Below chart, detailed table shows per-city PostEx avg, Tranzo avg, and combined avg with color coding (green ≤3d, amber ≤5d, red >5d). Formula: orderDate (dispatch) to lastStatusTime (delivery).
- **2026-02-11**: Added Return Discrepancies page at /discrepancies. Cross-references courier orders (PostEx/Tranzo) marked as "returned" against Shopify orders to find parcels courier claims returned but not cancelled/refunded in Shopify. Matches via orderRefNumber->orderNumber/orderName with tracking number fallback. Summary cards (total mismatches, PostEx/Tranzo counts, amount at risk), filterable/sortable table, date range filter, courier filter, search, CSV export. API route at /api/discrepancies. Added to sidebar navigation.
- **2026-02-11**: Fixed analytics double-counting: Analytics and Customer Insights now use ShopifyOrder as single source of truth (removed Order table counting which duplicated Shopify orders). Courier breakdown (PostEx/Tranzo/Zoom/Unfulfilled) derived from courierPartner and fulfillments data. Chart updated with Zoom (blue) and Unfulfilled (gray) series replacing old "Shopify" series.
- **2026-02-11**: Added Zoom orders to Shopify Orders page: Zoom bar in daily comparison chart (blue, stacked with PostEx/Tranzo), Zoom count in Dispatch Summary sidebar, Zoom column in Daily Breakdown table. Detection uses courierPartner or fulfillments tracking_company containing "zoom".
- **2026-02-11**: Added Zoom tracking numbers: API extracts tracking numbers specifically from Zoom fulfillments (tracking_company containing "Zoom"). Tracking # column in orders table replaces Tags column. CSV export includes tracking numbers. Supports both tracking_numbers array and tracking_number singular fields.
- **2026-02-11**: Updated Zoom Courier Portal to filter by fulfillment courier (courierPartner/tracking_company containing "Zoom") instead of by tags. API fetches all brand orders for date range then filters by courier partner field and fulfillments JSON. UI updated with correct messaging.
- **2026-02-11**: Added Zoom Courier Portal page at /zoom. PostEx-style UI with blue theme: monthly snapshot (total orders, revenue, fulfilled, pending, fulfillment rate), city filter dropdown, fulfillment rates by city sidebar with search, orders table with tags display, CSV export. API route at /api/zoom/orders queries ShopifyOrder table. Added to sidebar navigation.
- **2026-02-11**: Added tags field to ShopifyOrder model. Shopify sync now fetches and stores order tags. Tags displayed as pills in Shopify Recent Orders table.
- **2026-02-11**: Added city search bar to PostEx delivery rates by city widget.
- **2026-02-11**: Fixed analytics date filtering: Tranzo dates normalized to ISO format, standardized query boundaries across all routes, added DB indexes on (brandId, orderDate) and (brandId, courier).
- **2026-02-11**: Added sync notification toasts for PostEx and Tranzo. After clicking "Sync Live Data", a toast notification shows: total orders fetched, new orders added, newly delivered, new returns, and status changes. API routes snapshot existing order statuses before upsert and compute diff summary. SyncToast component auto-dismisses after 8 seconds. Brand-scoped diff queries for multi-tenant safety.
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
  api/            - Backend API routes (postex, tranzo, shopify, zoom)
  postex/         - PostEx portal pages
  tranzo/         - Tranzo portal pages
  shopify/        - Shopify orders comparison page
  zoom/           - Zoom Courier portal (Shopify orders tagged "Zoom Courier Service")
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
