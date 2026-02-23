# PostEx Dashboard (HubLogistic)

## Overview
The PostEx Dashboard (HubLogistic) is a unified logistics management platform designed to streamline order handling from various sources including PostEx, Tranzo, and Shopify. It aims to provide comprehensive insights into order statuses, financial settlements, and delivery performance. The project focuses on improving operational efficiency, reducing discrepancies, and enhancing decision-making for businesses managing multiple courier services.

## User Preferences
- No specific preferences recorded yet.

## System Architecture
The application is built using Next.js 16 with the App Router and Turbopack for performance. Data persistence is handled by PostgreSQL through Prisma ORM. Styling is managed with Tailwind CSS v4, and data visualization is achieved using Recharts.

**Core Architectural Decisions:**
- **DB-first Architecture:** All major pages (PostEx, Tranzo, Overview, Critical Orders, Shopify Orders, Finance, CPR, Invoices) load data from the PostgreSQL database first. External courier APIs are only invoked when a "Sync Live Data" action is triggered by the user, ensuring data consistency and reducing reliance on real-time API availability.
- **Unified Order Management:** Integrates orders from PostEx, Tranzo, and Shopify into a single view, with features for tracking, fulfillment, and discrepancy detection.
- **Financial Tracking:** Dedicated Finance page with comprehensive payment tracking, including courier settlements, revenue breakdowns, and month-over-month growth indicators. Supports DB-first architecture for PostEx CPR and Tranzo Invoices.
- **Performance & Analytics:** Includes advanced analytics for order trends, delivery performance (average delivery time by city, return rate analysis), customer insights (repeat customers, LTV), and smart alerts for critical issues like stuck-in-transit orders or performance drops.
- **UI/UX:**
    - Consistent dashboard layout with a sidebar for navigation.
    - Data visualizations using Recharts for trends, comparisons, and breakdowns (e.g., revenue split donut charts, stacked bar charts, horizontal bar charts for delivery times, city heatmaps).
    - Tabbed interfaces for detailed insights (e.g., Customer Insights, Delivery Performance Insights).
    - Interactive tables with filtering, sorting, and CSV export capabilities.
    - Theming: PostEx-style UI with a blue theme for Zoom Courier Portal.
- **Modularity:** Organized directory structure separating pages, API routes, components, and utilities.

**Key Features:**
- **Order Synchronization & Normalization:** Fetches and normalizes order data from PostEx, Tranzo, and Shopify, storing real order dates and fee values.
- **Discrepancy Management:** Identifies return discrepancies between courier claims and Shopify order statuses.
- **Smart Alerts:** Notifies users about stuck-in-transit orders, return rate spikes, and courier performance drops with configurable thresholds.
- **Customer Insights:** Identifies repeat customers, tracks Customer Lifetime Value (CLTV), and flags problem customers.
- **Multi-tenancy & SaaS Auth:** Full multi-tenant SaaS with JWT-based email/password authentication. Users are created by admins via the Admin Panel (`/admin/users`). Each user manages their own brands; admins see all brands. Authentication uses HTTP-only cookies with bcryptjs password hashing and JWT tokens (7-day expiry). Default admin: `admin@hublogistic.com` / `admin123`.
- **Shopify Integration:** Supports both Direct Admin API Access Token (Custom Apps) and Client Credentials Grant (Dev Dashboard apps) for Shopify authentication. Tracks Shopify order tags, phone numbers, and shipping addresses.
- **Zoom Integration:** Integrates Zoom orders by filtering Shopify orders based on fulfillment courier, providing a dedicated portal.

## External Dependencies
- **PostgreSQL:** Primary database for all application data, accessed via Prisma ORM.
- **PostEx Merchant API:** For fetching PostEx order details, tracking information, and Cash Payment Receipts (CPR).
- **Tranzo Merchant API (`api-merchant.tranzo.pk`, `api-integration.tranzo.pk`):** For fetching Tranzo order logs and invoice details.
- **Shopify Admin API:** For fetching Shopify order data, including fulfillments, tags, and customer information.
- **Recharts:** JavaScript charting library for data visualization.
- **Tailwind CSS v4:** Utility-first CSS framework for styling.