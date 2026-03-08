# HubLogistic WhatsApp Server

Standalone WhatsApp Web bridge that connects to your WhatsApp via QR code scanning and saves incoming messages to the same PostgreSQL database used by the HubLogistic dashboard.

## Requirements

- Node.js 18+
- Access to the same PostgreSQL database (Neon) used by the dashboard
- A VPS with a Pakistani IP (recommended: DigitalOcean, Vultr, or any provider with Pakistan region)

## Setup

### 1. Copy files to your VPS

Copy the `whatsapp-server/` folder and `prisma/schema.prisma` to your VPS:

```bash
mkdir -p ~/whatsapp-server/prisma
# Copy whatsapp-server/* and prisma/schema.prisma to your VPS
```

### 2. Install dependencies

```bash
cd ~/whatsapp-server
npm install
```

### 3. Copy Prisma schema

The server needs the Prisma schema to generate the client:

```bash
cp /path/to/prisma/schema.prisma ./prisma/schema.prisma
npx prisma generate
```

### 4. Configure environment variables

Create a `.env` file:

```bash
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
BRAND_ID="your-brand-id-from-dashboard"
PORT=3001
```

- `DATABASE_URL`: Same connection string used by the Vercel dashboard (from Neon)
- `BRAND_ID`: The brand ID from your dashboard (find it in Settings or the database). All incoming messages will be associated with this brand.
- `PORT`: HTTP API port (default: 3001)

### 5. Start the server

```bash
node index.js
```

### 6. Scan QR Code

When the server starts, a QR code will appear in the terminal. Scan it with WhatsApp:

1. Open WhatsApp on your phone
2. Go to **Settings > Linked Devices > Link a Device**
3. Scan the QR code shown in the terminal

The QR code is also saved to the database and displayed in the dashboard's WhatsApp page.

### 7. Keep it running (recommended)

Use PM2 to keep the server running in the background:

```bash
npm install -g pm2
pm2 start index.js --name whatsapp-server
pm2 save
pm2 startup
```

## How It Works

1. **Connection**: Uses Baileys (WhatsApp Web library) to connect to WhatsApp via QR code
2. **Session Persistence**: Auth credentials are saved in `./auth_state/` folder, so you don't need to re-scan QR after server restarts
3. **Message Storage**: All incoming text messages are saved to the `WhatsAppMessage` table in PostgreSQL
4. **Order Detection**: Messages are automatically analyzed for order-like patterns (name, phone, address, city, product). Detected orders are flagged for easy conversion in the dashboard.
5. **Dashboard Integration**: The Vercel dashboard reads messages from the same database and provides a UI to view messages and convert detected orders to Shopify orders with one click.

## API Endpoints

The server exposes a simple HTTP API on the configured port:

- `GET /status` — Connection status
- `GET /qr` — Current QR code (if pending)
- `POST /restart` — Force reconnect

## Troubleshooting

- **QR not appearing**: Make sure the `auth_state` folder doesn't contain stale credentials. Delete it and restart.
- **Connection drops**: The server auto-reconnects on disconnection. If logged out, delete `auth_state` and re-scan.
- **Messages not saving**: Check that `BRAND_ID` is set and matches a brand in your database.
- **Database connection issues**: Verify `DATABASE_URL` is correct and the VPS can reach the Neon database.
