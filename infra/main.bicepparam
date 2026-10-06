using './main.bicep'

// Non-secret values: edit here. Secrets come from environment variables (GitHub Actions secrets
// or your shell) so they never land in the repo.

// Canada East: the Free Trial has no App Service quota in Canada Central. Both keep data in Canada.
param location = readEnvironmentVariable('AZURE_LOCATION', 'canadaeast')
// PostgreSQL is restricted in Canada East on Free Trial subscriptions, so it lives in Canada Central.
param postgresLocation = readEnvironmentVariable('POSTGRES_LOCATION', 'canadacentral')
param appName = 'gfm'

// B1 (~CA$18/mo) is plenty for testing and launch; switch to P0v3 for production traffic.
param appServiceSku = readEnvironmentVariable('APP_SERVICE_SKU', 'B1')

// Set to https://goformosaic.com once the custom domain is bound to the web app.
param siteUrl = readEnvironmentVariable('SITE_URL', '')

param adminObjectId = readEnvironmentVariable('ADMIN_OBJECT_ID')
param adminNotifyEmail = readEnvironmentVariable('ADMIN_NOTIFY_EMAIL')
param bookingUrl = readEnvironmentVariable('BOOKING_URL', 'https://goformosaic.com/book')
param emailSignatureName = 'Kenil'
param retentionDays = 90
param privacyContactEmail = readEnvironmentVariable('PRIVACY_CONTACT_EMAIL', 'privacy@goformosaic.com')

param emailCustomDomain = readEnvironmentVariable('EMAIL_CUSTOM_DOMAIN', '')
param emailCustomDomainVerified = bool(readEnvironmentVariable('EMAIL_CUSTOM_DOMAIN_VERIFIED', 'false'))

param turnstileSiteKey = readEnvironmentVariable('TURNSTILE_SITE_KEY', '')
param turnstileSecretKey = readEnvironmentVariable('TURNSTILE_SECRET_KEY')

param entraClientId = readEnvironmentVariable('ENTRA_CLIENT_ID', '')
param entraClientSecret = readEnvironmentVariable('ENTRA_CLIENT_SECRET', '')

param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD')

param deployerPrincipalId = readEnvironmentVariable('DEPLOYER_PRINCIPAL_ID', '')
