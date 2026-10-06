# GoForMosaic

Public web app for **goformosaic.com**. Customers upload a base photo and 20–40 tile photos, and the admin creates the mosaic and emails a watermarked preview. Everything runs on Azure in Canada: **Canada East** by default, because Free Trial subscriptions have no App Service quota in Canada Central. Set `AZURE_LOCATION=canadacentral` once you have quota there.

```
Browser ──(SAS PUT, direct)──────────────────────► Blob Storage (private)
   │                                                   ▲        │
   ▼                                                   │        │ queue message per file
Next.js on App Service ──► PostgreSQL (Prisma)         │        ▼
   │  └─ /admin (Easy Auth + Entra ID)                 └── Azure Function (sharp → MozJPEG)
   └─► ACS Email                                           + daily retention cleanup
Secrets: Key Vault references, read through managed identities · Telemetry: App Insights
```

| Path | What |
|---|---|
| `web/` | Next.js 16 + TypeScript + Tailwind 4. Holds the customer wizard, the privacy page, `/admin`, the API routes, the Prisma schema and migrations |
| `functions/` | Azure Functions (Node 22): `processImage` (queue trigger) and `retentionCleanup` (daily timer) |
| `infra/` | Bicep for every Azure resource (`main.bicep`, `main.bicepparam`) |
| `.github/workflows/` | `ci.yml` (lint, typecheck, tests, build, Bicep build) and `deploy.yml` (infra, migrations, deploy) |
| `local/` | One-command local environment (`npm start`), no Docker needed |
| `scripts/create-entra-app.sh` | Creates the Entra app registration for admin sign-in |

---

## How it works

### Customer flow (`/`)
1. **Details.** Name, email and phone are checked with the same zod schema in the browser and on the server, and Cloudflare Turnstile is verified on the server. This creates a `DRAFT` submission and returns a random bearer token. Only a SHA-256 hash of the token is stored.
2. **Uploads.** For each file, the browser asks `/api/submissions/:id/files` for a **create/write-only SAS scoped to one blob path**, valid for 30 minutes. It then PUTs the file straight to Blob Storage, three at a time, with progress, retry, remove, thumbnails and a tile counter.
   - Before upload, the browser checks the extension, MIME type, size and magic bytes.
   - After upload, `/complete` re-checks the real blob size and magic bytes on the server. A file that fails is deleted.
   - Limits: base image ≤ 20 MB; tiles ≤ 15 MB each, 20–40 of them; formats JPG, PNG, HEIC and WEBP.
3. **Consent.** The Privacy Policy checkbox is required and marketing opt-in is optional. Submitting does the following in one transaction:
   - assigns a reference `GFM-YYYY-NNNN` (atomic per-year counter, year in Toronto time);
   - stores the consent version and timestamp;
   - sets the deadline to now + 3 days;
   - revokes the draft token.

   After the transaction it queues compression, emails the customer and notifies the admin.

### Compression (`functions/src/lib/compress.ts`)
- Output is MozJPEG q90 with **4:4:4** chroma at **full resolution**.
- The ICC profile is kept. Orientation is kept by rotating the pixels upright. All other metadata (EXIF/GPS, XMP, IPTC) is removed.
- **Keep original if smaller:** if a JPEG original is already smaller than the re-encode, its pixels are kept unchanged. Metadata is still stripped losslessly, and only a minimal Orientation tag is written back (`jpegMetadata.ts`).
- HEIC is decoded with libheif (WASM), because sharp's prebuilt binaries can't decode HEVC. Transparent PNG/WEBP images are flattened onto white.
- The function also writes a 400 px WEBP thumbnail for the admin gallery and deletes the raw upload.
- Failures retry 5 times. After that the file is marked `FAILED` and the original is kept, so the admin can still download it.
- A blob lifecycle rule moves blobs to the **Cool tier after 30 days**.

### Admin (`/admin`)
- **List:** search by name, email, phone or reference; filter by status; see the time left on each 3-day deadline. Overdue requests are flagged, and a banner links to them.
- **Detail page:**
  - customer info and consent record;
  - status and internal notes;
  - photo gallery using 15-minute **read-only SAS** links;
  - **ZIP download**, streamed one blob at a time;
  - mosaic upload, which creates a **watermarked 1600 px preview**;
  - an editable "mosaic ready" email with the preview inline and a "Book a call" button;
  - a **Delete customer data** action that requires typing the reference. It removes all blobs and database rows and leaves a PII-free audit record.

### Security and privacy
- **Admin access** is checked at three layers:
  1. App Service Authentication (Easy Auth) with Entra ID, limited to the single admin object ID by both the Easy Auth policy and the app code.
  2. "Assignment required" on the Entra app.
  3. Every server action and admin API route re-checks.
- **MFA** is enforced in Entra (see [MFA](#enforce-mfa-for-the-admin)).
- **Rate limits** are stored in Postgres, so they hold across instances. IPs are stored only as salted hashes. Limits: 5 drafts/hour/IP, 400 file operations/hour/IP, 10 submits/hour/IP.
- **Turnstile** is verified on the server and fails closed in production.
- **File content** is checked by magic bytes in the browser and on the server, and then decoded fully by the function.
- **Storage** has shared-key access disabled. All SAS tokens are user-delegation SAS issued through managed identity. Upload SAS is create/write-only for one blob; admin SAS is read-only.
- **CSP, HSTS and nosniff** headers are set, and `/admin` is `noindex` and `no-store`. Admin API routes reject cross-origin requests.
- **Retention:** a daily job deletes submissions **90 days** after submission and abandoned drafts after 24 hours. A lifecycle rule deletes leftover blobs at 120 days as a backstop.
- **Privacy page (`/privacy`):** PIPEDA-aligned. It covers data collected, purpose, storage in Canada, retention, rights, and contacts. Bump `CONSENT_VERSION` in `web/src/lib/public-config.ts` whenever the policy text changes. The version is stored with each consent, and clients holding an old version are asked to refresh.

---

## Local development

### One command (no Docker needed)

```bash
cd local
npm install        # first time only
npm start          # → http://localhost:3000   (admin: /admin, no sign-in locally)
npm start -- --lan # same, plus reachable from a phone on the same Wi-Fi (real iPhone HEIC testing)
```

`local/start.mjs` does the following:
1. Starts **PostgreSQL 16** (embedded) and **Azurite**, the Blob/Queue emulator.
2. Applies migrations and configures the storage container, queue and CORS.
3. Builds the function and runs the **real `processImage` handler** against the local queue, so uploads are compressed and get thumbnails just as in Azure.
4. Starts Next.js.

Data persists in `.local/` between runs. Other commands:
- `npm run reset` wipes all local data.
- `RETENTION_DAYS=0 npm run retention` runs the retention job once; with `0` it deletes every submitted request. Run it in a second terminal while `npm start` is running.

Local behaviour:
- Emails are printed in the terminal. To send real ones through ACS, put `ACS_CONNECTION_STRING` and `EMAIL_FROM` in `web/.env.local`.
- Turnstile is skipped unless you set keys. Cloudflare's test keys are listed in `web/.env.example`.
- `ADMIN_DEV_BYPASS=true` opens `/admin` without Entra. It is ignored in production.

### With Docker (alternative)

```bash
docker compose up -d                       # Postgres 16 + Azurite
cd web && cp .env.example .env.local && cp .env.example .env
npm install && npx prisma migrate dev && npm run dev:setup && npm run dev
cd ../functions && cp local.settings.example.json local.settings.json && npm install && npm start   # needs Azure Functions Core Tools v4
```

Tests: `npm test` in `web/` (validation, file sniffing, deadlines, email escaping) and in `functions/` (compression output, 4:4:4, ICC kept, metadata removed, orientation, keep-original, HEIC, thumbnails).

Database changes: edit `web/prisma/schema.prisma`, then run `npx prisma migrate dev --name <change>` and commit the new folder in `prisma/migrations/`.

---

## Deploying to Azure

### 1. One-time setup

```bash
az login
az group create -n rg-goformosaic-prod -l canadacentral

# GitHub Actions identity (OIDC — no stored credentials)
az ad app create --display-name gh-goformosaic-deploy --query appId -o tsv        # → AZURE_CLIENT_ID
az ad sp create --id <AZURE_CLIENT_ID> --query id -o tsv                          # → DEPLOYER_PRINCIPAL_ID
az ad app federated-credential create --id <AZURE_CLIENT_ID> --parameters '{
  "name": "main", "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<owner>/<repo>:environment:production", "audiences": ["api://AzureADTokenExchange"] }'
RG_ID=$(az group show -n rg-goformosaic-prod --query id -o tsv)
az role assignment create --assignee <AZURE_CLIENT_ID> --role Contributor --scope $RG_ID
# Needed because the template creates role assignments for the managed identities:
az role assignment create --assignee <AZURE_CLIENT_ID> --role "Role Based Access Control Administrator" --scope $RG_ID

# Admin sign-in app (run after the first deploy, once you know the hostname)
./scripts/create-entra-app.sh goformosaic.com you@yourtenant.onmicrosoft.com app-gfm-xxxx.azurewebsites.net
```

Create a free **Cloudflare Turnstile** widget for `goformosaic.com` (and the `*.azurewebsites.net` host while testing).

### 2. GitHub configuration (environment: `production`)

| Variables | Secrets |
|---|---|
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP` | `POSTGRES_ADMIN_PASSWORD` |
| `ADMIN_OBJECT_ID`, `ADMIN_NOTIFY_EMAIL`, `ENTRA_CLIENT_ID`, `DEPLOYER_PRINCIPAL_ID` | `TURNSTILE_SECRET_KEY` |
| `TURNSTILE_SITE_KEY`, `SITE_URL`, `BOOKING_URL`, `PRIVACY_CONTACT_EMAIL` | `ENTRA_CLIENT_SECRET` |
| `EMAIL_CUSTOM_DOMAIN`, `EMAIL_CUSTOM_DOMAIN_VERIFIED` (optional) | |

### 3. Deploy
- **First deploy:** run **Actions → Deploy → Run workflow** with *Deploy infra* ticked.
- **After that:** every push to `main` builds and tests, runs `prisma migrate deploy`, and then deploys the web app and the function app. The migrate step opens a temporary Postgres firewall rule for the runner and closes it afterwards.

To deploy the infrastructure by hand instead:
```bash
export POSTGRES_ADMIN_PASSWORD=... TURNSTILE_SECRET_KEY=... ADMIN_OBJECT_ID=... ADMIN_NOTIFY_EMAIL=...
az deployment group create -g rg-goformosaic-prod -f infra/main.bicep -p infra/main.bicepparam
```

### 4. Custom domain
```bash
WEB=app-gfm-xxxx   # from the deployment outputs
az webapp config hostname add -g rg-goformosaic-prod --webapp-name $WEB --hostname goformosaic.com
az webapp config ssl create   -g rg-goformosaic-prod -n $WEB --hostname goformosaic.com     # free managed cert
az webapp config ssl bind     -g rg-goformosaic-prod -n $WEB --certificate-thumbprint <thumb> --ssl-type SNI
```
Then set `SITE_URL=https://goformosaic.com` and redeploy the infrastructure. This updates the Blob CORS rules and the links in emails.

### 5. Email sender domain
- **By default** mail is sent from an Azure-managed `DoNotReply@<guid>.azurecomm.net` address.
- **To send from `@goformosaic.com`:**
  1. Set `EMAIL_CUSTOM_DOMAIN=goformosaic.com` and deploy.
  2. Add the TXT, SPF, DKIM and DKIM2 records shown under *Email Communication Service → Provision domains*, and verify them.
  3. Set `EMAIL_CUSTOM_DOMAIN_VERIFIED=true` and deploy again.

### Enforce MFA for the admin
Easy Auth only signs users in; MFA is enforced by Entra ID. Use one of these:
- **Security defaults** (free): *Entra admin center → Overview → Properties → Manage security defaults → Enabled*.
- **Conditional Access** (Entra ID P1): require MFA for the *GoForMosaic Admin* app.

If your tokens include the `amr` claim, you can also set the app setting `ADMIN_REQUIRE_MFA_CLAIM=true` so the app itself rejects sessions without MFA.

---

## Configuration reference (web app settings)

| Setting | Purpose |
|---|---|
| `DATABASE_URL` | Key Vault reference. Postgres connection string |
| `STORAGE_ACCOUNT_NAME`, `UPLOADS_CONTAINER`, `PROCESSING_QUEUE` | Blob Storage and the processing queue (accessed through managed identity) |
| `ACS_CONNECTION_STRING`, `EMAIL_FROM` | Key Vault reference. ACS Email connection and sender address |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile keys (the secret is a Key Vault reference) |
| `ADMIN_OBJECT_ID`, `ADMIN_NOTIFY_EMAIL` | The single admin account, and the address that receives new-request notifications |
| `BOOKING_URL`, `EMAIL_SIGNATURE_NAME` | Used in the "mosaic ready" email |
| `PRIVACY_CONTACT_EMAIL`, `RETENTION_DAYS` | Shown in the Privacy Policy. Keep `RETENTION_DAYS` equal to the function's value |
| `SITE_URL` | Links in emails |
| `RATE_LIMIT_SALT` | Key Vault reference. Salt for hashing IPs |

## Operational notes
- **Hosting:** the web app and the function app share one Linux P0v3 plan, which allows identity-based storage with no account keys.
- **Postgres:** Burstable B1ms with 7-day backups, reachable from Azure services only, TLS required. For stricter isolation, move to VNet integration with private endpoints.
- **Deleted data:** blob soft delete (7 days) and database backups (7 days) are the only places deleted data remains. The Privacy Policy says so.
- **Logs:** App Insights collects requests and exceptions from both apps. Function logs record file sizes, never customer data.
- **Mosaic previews:** HEIC mosaics can't be turned into a watermarked preview. Upload the finished mosaic as JPG or PNG.
