# PostEx Dashboard (HubLogistic)

## Overview
The PostEx Dashboard (HubLogistic) is a unified logistics management system designed for businesses operating in Pakistan. It integrates order and financial data from multiple e-commerce and courier platforms, including PostEx, Tranzo, and Shopify. The primary purpose is to provide a comprehensive view of order fulfillment, delivery performance, and financial settlements, enabling businesses to optimize logistics operations, track payment receipts, identify discrepancies, and gain actionable insights.

**Key Capabilities:**
- **Multi-platform Integration:** Manages orders from PostEx, Tranzo, and Shopify.
- **Financial Tracking:** Detailed tracking of courier settlements, including amounts owed, payment receipts (CPR, invoices), and revenue breakdowns.
- **Order Management:** Monitors order statuses, fulfillment, returns, and identifies discrepancies between courier and e-commerce platforms.
- **Performance Analytics:** Provides insights into delivery performance by city, customer behavior, and courier efficiency.
- **Alerting System:** Notifies users about stuck-in-transit orders, return rate spikes, and courier performance drops.
- **Data-Driven Decision Making:** Offers dashboards and reports for informed strategic planning.

The project aims to empower businesses with a centralized platform to streamline their logistics, improve operational efficiency, and enhance financial oversight in the e-commerce supply chain.

## User Preferences
- No specific preferences recorded yet.

## System Architecture
The PostEx Dashboard is built on a modern web stack, prioritizing performance, scalability, and maintainability.

**Core Technologies:**
- **Framework:** Next.js 16 (App Router with Turbopack)
- **Database:** PostgreSQL via Prisma ORM
- **Styling:** Tailwind CSS v4 for utility-first styling
- **Charting:** Recharts for data visualization
- **Package Manager:** npm

**Architectural Decisions & Design Patterns:**
- **DB-first Architecture:** All core data (orders, CPR, invoices) are persisted in the PostgreSQL database. External courier APIs are only invoked on-demand via a "Sync Live Data" action, ensuring fast page loads and reducing reliance on external service uptime.
- **Modular Design:** The application is organized into distinct modules for PostEx, Tranzo, Shopify, Zoom, Analytics, Finance, and Settings, improving code organization and maintainability.
- **API-centric Backend:** Dedicated API routes handle data aggregation, processing, and external service communication, serving the Next.js frontend.
- **Real-time Synchronization (On-demand):** Data synchronization with external courier APIs (PostEx, Tranzo, Shopify) is user-initiated, providing control over data freshness. Sync notifications offer immediate feedback on the synchronization process.
- **Multi-tenancy:** The system supports multiple brands, with data and settings scoped per brand.
- **Robust Error Handling:** Comprehensive error handling for API integrations, including specific messages for common issues.
- **UI/UX:**
    - Consistent design language across portals (e.g., PostEx-style blue theme for Zoom portal).
    - Interactive dashboards with KPI cards, charts (pie, bar, stacked bar), and detailed tables.
    - Filtering, sorting, and search functionalities for data tables.
    - CSV export for various data sets.
    - Visual indicators (e.g., color-coded badges for delivery days, progress bars for CLV).

**Key Features & Implementations:**
- **Financial Module (`/finance`):** Tracks PostEx and Tranzo settlements, Shopify revenue, and overall balance. Includes KPI cards, revenue split charts, courier cost comparisons, and payment collection timelines. Utilizes a DB-first approach for CPR and Tranzo invoices.
- **Payment Receipt Management:** Dedicated pages for PostEx CPR (`/postex/cpr`) and Tranzo Invoices (`/tranzo/invoices`), fetching and upserting data to the database.
- **Order Discrepancy Detection (`/discrepancies`):** Identifies mismatches between courier-reported returns and Shopify order statuses.
- **Comprehensive Analytics (`/analytics`):** Includes order trends, peak order days, city heatmap, customer insights (repeat customers, CLV, problem customers), and delivery performance (avg. delivery time by city, return rate analysis, courier comparisons). Uses ShopifyOrder as the single source of truth.
- **Smart Alerts (`/alerts`):** Configurable alerts for stuck-in-transit orders, return rate spikes, and courier performance drops.
- **Shopify Integration (`/shopify`):** Fetches Shopify orders, compares daily orders with dispatched courier orders, tracks fulfillments, and allows for pending order remarks. Supports both Admin API Access Token and Client Credentials Grant.
- **Zoom Courier Portal (`/zoom`):** Displays Zoom-specific order data, filtered from Shopify orders.
- **Brand Management:** Brand settings are persisted in PostgreSQL, with an auto-migration path from localStorage.

## External Dependencies
- **PostEx API:** Used for fetching Cash Payment Receipts (CPR) and tracking order delivery dates.
- **Tranzo Merchant API (`api-merchant.tranzo.pk`, `api-integration.tranzo.pk`):** Used for fetching invoice logs and order details.
- **Shopify Admin API:** Used for fetching orders, fulfillments, and tags.
- **PostgreSQL Database:** Primary data store, managed via Prisma ORM.