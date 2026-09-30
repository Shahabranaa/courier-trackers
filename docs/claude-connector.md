# Claude connector

This app exposes a **read-only remote MCP connector** for Claude.ai and Claude Desktop. It reads locally saved courier shipments and Shopify orders; it does not fetch a complete account-wide list from TRAX or run a live sync. Order, tracking, and payment summaries are available, but customer names, addresses, phone numbers, emails, raw courier payloads, and stored integration credentials are not returned.

## Before connecting

1. Rotate the existing login-signing key out of version-controlled configuration before exposing the connector publicly. This signs out currently logged-in users. Do not reuse a key that has been committed to the repository.
2. Publish this app at a stable HTTPS address.
3. Production defaults to this app's explicit Vercel origin, `https://courier-trackers.vercel.app`. If moving to another domain, set `CLAUDE_OAUTH_ISSUER` in the server environment to that **exact public origin** (no path or trailing slash). Do not use the development preview URL as the production origin.
4. Apply the updated Prisma schema to the app's database through your normal deployment process. The Claude OAuth models store hashed authorization codes and tokens.
5. Confirm your user account is active and has access to the desired brands. Claude receives only the data that account can read.

## Connect in Claude

In Claude, open **Settings → Connectors → Add connector → Custom** (the menu wording may differ by plan). Add this server URL:

`https://courier-trackers.vercel.app/api/mcp`

When Claude opens this app's sign-in and consent page, log in with your existing app account and explicitly approve read-only access. Do not paste your courier API keys, database connection, or session cookie into Claude. The connector uses OAuth and does not require Claude to know those credentials.

Try asking Claude to list available brands, then search locally saved shipments or Shopify orders for a brand and date range. Results are paginated. The search date for courier shipments is this app's saved order date; the Shopify search date is the saved Shopify order date.

The connector uses the OAuth callback `https://claude.ai/api/mcp/auth_callback` and the read-only `orders:read` scope. It does not support writes. If Claude's connection UI uses a different callback or cannot complete registration, do not loosen the callback check; verify the current Claude custom-connector requirements first.

## Vercel deployment

1. Push these changes to the Git branch connected to the Vercel project's **Production** deployment. The included `vercel.json` selects Next.js and `npm run build`.
2. Keep the project's existing database and login-signing secrets in Vercel's environment settings. Replit Secrets and `.replit` environment settings are not transferred to Vercel by a Git push. Do not copy secrets into source files or paste them into Claude.
3. `CLAUDE_OAUTH_ISSUER` is optional for this Vercel domain because the production origin is explicitly configured in code. If this variable already exists in Vercel, remove an old development value or set it to `https://courier-trackers.vercel.app` for Production, then redeploy.
4. The build generates Prisma and applies the schema to `NEON_DATABASE_URL` when present, otherwise `DATABASE_URL`, matching the runtime. This creates the OAuth tables if needed and refuses destructive changes. If Prisma warns about data loss, resolve the schema difference explicitly rather than adding `--accept-data-loss`.
5. Ensure Vercel deployment protection does not require Vercel authentication for this production domain. Claude must reach the OAuth discovery and registration routes anonymously; data access still requires the app's OAuth token.

After Vercel reports a successful deployment, check:

- `https://courier-trackers.vercel.app/.well-known/oauth-authorization-server` returns JSON with `issuer` equal to `https://courier-trackers.vercel.app`.
- `https://courier-trackers.vercel.app/.well-known/oauth-protected-resource/api/mcp` returns JSON with `resource` equal to `https://courier-trackers.vercel.app/api/mcp`.
- An unauthenticated request to `https://courier-trackers.vercel.app/api/mcp` returns **401**, with a `WWW-Authenticate` header pointing to the protected-resource metadata, not 404.

Then connect from Claude using the URL above. A successful deployment and discovery response do not alone verify the complete Claude authorization flow.