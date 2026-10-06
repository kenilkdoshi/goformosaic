// GoForMosaic — production infrastructure (Canada Central).
// Deploy: az deployment group create -g <rg> -f infra/main.bicep -p infra/main.bicepparam

targetScope = 'resourceGroup'

@description('Azure region for all regional resources. Keep in Canada for PIPEDA data residency.')
param location string = 'canadacentral'

@description('Short prefix used in resource names.')
@maxLength(10)
param appName string = 'gfm'

@description('Public URL of the site, used for CORS, links in emails and CSP. Use your custom domain once bound.')
param siteUrl string = ''

@description('Additional origins allowed to PUT to Blob Storage (e.g. the *.azurewebsites.net URL while the custom domain is pending).')
param extraCorsOrigins array = []

@description('App Service plan SKU shared by the web app and the function app.')
param appServiceSku string = 'P0v3'

@description('PostgreSQL administrator login.')
param postgresAdminLogin string = 'gfmadmin'

@secure()
@description('PostgreSQL administrator password.')
param postgresAdminPassword string

@secure()
@description('Cloudflare Turnstile secret key.')
param turnstileSecretKey string

@description('Cloudflare Turnstile site key (public).')
param turnstileSiteKey string = ''

@description('Entra ID object ID of the single admin account allowed into /admin.')
param adminObjectId string

@description('Client ID of the Entra app registration used by App Service Authentication. Leave empty to skip auth configuration.')
param entraClientId string = ''

@secure()
@description('Client secret of the Entra app registration.')
param entraClientSecret string = ''

@description('Entra tenant ID.')
param entraTenantId string = tenant().tenantId

@description('Address that receives "new request" notifications.')
param adminNotifyEmail string

@description('Booking link included in "mosaic ready" emails.')
param bookingUrl string = 'https://goformosaic.com/book'

@description('Name used to sign "mosaic ready" emails.')
param emailSignatureName string = 'Kenil'

@description('Optional custom email domain (e.g. goformosaic.com). Creates the domain so you can add its DNS records. Empty = Azure-managed domain only.')
param emailCustomDomain string = ''

@description('Set to true after the custom email domain verifies in the portal: links it to ACS and sends from it.')
param emailCustomDomainVerified bool = false

@description('Privacy Officer contact address shown in the Privacy Policy.')
param privacyContactEmail string = 'privacy@goformosaic.com'

@description('Days to keep customer data after submission (shown in the Privacy Policy and enforced by the retention job).')
param retentionDays int = 90

@description('Optional principal (e.g. the GitHub Actions service principal) allowed to read Key Vault secrets for migrations.')
param deployerPrincipalId string = ''

@description('Salt for hashing client IPs in the rate limiter. Rotating it only resets counters.')
@secure()
param rateLimitSalt string = newGuid()

param tags object = {
  app: 'goformosaic'
  env: 'prod'
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------
var suffix = take(uniqueString(resourceGroup().id), 8)
var names = {
  logs: 'log-${appName}-${suffix}'
  insights: 'appi-${appName}-${suffix}'
  storage: toLower('st${appName}${suffix}')
  keyVault: 'kv-${appName}-${suffix}'
  postgres: 'psql-${appName}-${suffix}'
  plan: 'asp-${appName}-${suffix}'
  web: 'app-${appName}-${suffix}'
  func: 'func-${appName}-${suffix}'
  emailService: 'email-${appName}-${suffix}'
  acs: 'acs-${appName}-${suffix}'
}
var databaseName = 'goformosaic'
var uploadsContainer = 'uploads'
var processingQueue = 'image-processing'
var defaultWebUrl = 'https://${names.web}.azurewebsites.net'
var effectiveSiteUrl = empty(siteUrl) ? defaultWebUrl : siteUrl
var useEntraAuth = !empty(entraClientId)
var useCustomEmailDomain = !empty(emailCustomDomain) && emailCustomDomainVerified

// Built-in role definition IDs
var roles = {
  blobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
  blobDataOwner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
  queueDataContributor: '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
  queueMessageSender: 'c6a89b2d-59bc-44d0-9896-0f6e12d7b80a'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: names.logs
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: names.insights
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    DisableIpMasking: false
  }
}

// ---------------------------------------------------------------------------
// Storage: private uploads container + processing queue. No account keys.
// ---------------------------------------------------------------------------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: names.storage
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled' // browsers upload directly via SAS
    encryption: {
      keySource: 'Microsoft.Storage'
      services: {
        blob: { enabled: true }
        queue: { enabled: true, keyType: 'Account' }
      }
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: union([effectiveSiteUrl, defaultWebUrl], extraCorsOrigins)
          allowedMethods: ['PUT', 'GET', 'HEAD', 'OPTIONS']
          allowedHeaders: ['*']
          exposedHeaders: ['ETag', 'x-ms-*']
          maxAgeInSeconds: 3600
        }
      ]
    }
    deleteRetentionPolicy: { enabled: true, days: 7 }
    containerDeleteRetentionPolicy: { enabled: true, days: 7 }
  }
}

resource uploads 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: uploadsContainer
  properties: { publicAccess: 'None' }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource queue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: processingQueue
}

resource lifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'cool-after-30-days'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'], prefixMatch: ['${uploadsContainer}/'] }
            actions: { baseBlob: { tierToCool: { daysAfterModificationGreaterThan: 30 } } }
          }
        }
        {
          // Originals are deleted after compression; this catches anything orphaned.
          name: 'purge-stale-raw-uploads'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'], prefixMatch: ['${uploadsContainer}/raw/'] }
            actions: { baseBlob: { delete: { daysAfterModificationGreaterThan: 7 } } }
          }
        }
        {
          // Backstop behind the app's retention job (retentionDays) in case a purge ever fails.
          name: 'retention-backstop'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'], prefixMatch: ['${uploadsContainer}/'] }
            actions: { baseBlob: { delete: { daysAfterModificationGreaterThan: retentionDays + 30 } } }
          }
        }
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// PostgreSQL Flexible Server
// ---------------------------------------------------------------------------
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: names.postgres
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    authConfig: { passwordAuth: 'Enabled', activeDirectoryAuth: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: databaseName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// Allows Azure-hosted services (App Service, Functions) to connect. TLS is enforced server-side.
resource pgAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

// ---------------------------------------------------------------------------
// Azure Communication Services Email (data stored in Canada)
// ---------------------------------------------------------------------------
resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = {
  name: names.emailService
  location: 'global'
  tags: tags
  properties: { dataLocation: 'Canada' }
}

resource managedDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  properties: {
    domainManagement: 'AzureManaged'
    userEngagementTracking: 'Disabled'
  }
}

resource customDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = if (!empty(emailCustomDomain)) {
  parent: emailService
  name: empty(emailCustomDomain) ? 'unused.invalid' : emailCustomDomain
  location: 'global'
  properties: {
    domainManagement: 'CustomerManaged'
    userEngagementTracking: 'Disabled'
  }
}

resource acs 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: names.acs
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'Canada'
    // A custom domain can only be linked after its DNS records verify (see README).
    linkedDomains: useCustomEmailDomain ? [managedDomain.id, customDomain.id] : [managedDomain.id]
  }
}

var emailFrom = !useCustomEmailDomain
  ? 'DoNotReply@${managedDomain.properties.mailFromSenderDomain}'
  : 'DoNotReply@${emailCustomDomain}'

// ---------------------------------------------------------------------------
// Key Vault (RBAC) — secrets consumed via App Service Key Vault references
// ---------------------------------------------------------------------------
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: names.keyVault
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

var databaseUrl = 'postgresql://${uriComponent(postgresAdminLogin)}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'database-url'
  properties: { value: databaseUrl, contentType: 'text/plain' }
}

resource secretAcs 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'acs-connection-string'
  properties: { value: acs.listKeys().primaryConnectionString, contentType: 'text/plain' }
}

resource secretTurnstile 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'turnstile-secret'
  properties: { value: turnstileSecretKey, contentType: 'text/plain' }
}

resource secretRateLimitSalt 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'rate-limit-salt'
  properties: { value: rateLimitSalt, contentType: 'text/plain' }
}

resource secretEntra 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (useEntraAuth) {
  parent: keyVault
  name: 'entra-client-secret'
  properties: { value: entraClientSecret, contentType: 'text/plain' }
}

func kvRef(vaultName string, secretName string) string =>
  '@Microsoft.KeyVault(VaultName=${vaultName};SecretName=${secretName})'

// ---------------------------------------------------------------------------
// Compute: one Linux plan hosting the Next.js app and the Functions app
// ---------------------------------------------------------------------------
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: names.plan
  location: location
  tags: tags
  kind: 'linux'
  sku: { name: appServiceSku }
  properties: { reserved: true }
}

var commonSiteConfig = {
  alwaysOn: true
  ftpsState: 'Disabled'
  minTlsVersion: '1.2'
  scmMinTlsVersion: '1.2'
  http20Enabled: true
}

resource web 'Microsoft.Web/sites@2023-12-01' = {
  name: names.web
  location: location
  tags: tags
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: union(commonSiteConfig, {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node server.js'
      healthCheckPath: '/api/health'
    })
  }
}

resource webSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: web
  name: 'appsettings'
  properties: union(
    {
      NODE_ENV: 'production'
      PORT: '8080'
      HOSTNAME: '0.0.0.0' // Next standalone binds to $HOSTNAME, which App Service sets to the container name
      SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
      APPLICATIONINSIGHTS_CONNECTION_STRING: insights.properties.ConnectionString
      ApplicationInsightsAgent_EXTENSION_VERSION: '~3'
      SITE_URL: effectiveSiteUrl
      DATABASE_URL: kvRef(keyVault.name, secretDatabaseUrl.name)
      ACS_CONNECTION_STRING: kvRef(keyVault.name, secretAcs.name)
      TURNSTILE_SECRET_KEY: kvRef(keyVault.name, secretTurnstile.name)
      RATE_LIMIT_SALT: kvRef(keyVault.name, secretRateLimitSalt.name)
      TURNSTILE_SITE_KEY: turnstileSiteKey
      RETENTION_DAYS: string(retentionDays)
      PRIVACY_CONTACT_EMAIL: privacyContactEmail
      STORAGE_ACCOUNT_NAME: storage.name
      UPLOADS_CONTAINER: uploadsContainer
      PROCESSING_QUEUE: processingQueue
      EMAIL_FROM: emailFrom
      ADMIN_NOTIFY_EMAIL: adminNotifyEmail
      ADMIN_OBJECT_ID: adminObjectId
      BOOKING_URL: bookingUrl
      EMAIL_SIGNATURE_NAME: emailSignatureName
    },
    useEntraAuth ? { MICROSOFT_PROVIDER_AUTHENTICATION_SECRET: kvRef(keyVault.name, 'entra-client-secret') } : {}
  )
  dependsOn: [webKvRole, secretEntra]
}

// App Service Authentication (Easy Auth): anonymous access to the public site, Entra sign-in for
// /admin (redirect issued by src/proxy.ts), restricted to the single admin object ID.
resource webAuth 'Microsoft.Web/sites/config@2023-12-01' = if (useEntraAuth) {
  parent: web
  name: 'authsettingsV2'
  properties: {
    platform: { enabled: true, runtimeVersion: '~1' }
    globalValidation: {
      requireAuthentication: false
      unauthenticatedClientAction: 'AllowAnonymous'
    }
    httpSettings: {
      requireHttps: true
      forwardProxy: { convention: 'NoProxy' }
    }
    login: {
      tokenStore: { enabled: true }
      preserveUrlFragmentsForLogins: false
      cookieExpiration: { convention: 'FixedTime', timeToExpiration: '08:00:00' }
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          openIdIssuer: '${environment().authentication.loginEndpoint}${entraTenantId}/v2.0'
          clientId: entraClientId
          clientSecretSettingName: 'MICROSOFT_PROVIDER_AUTHENTICATION_SECRET'
        }
        login: { loginParameters: ['scope=openid profile email'] }
        validation: {
          allowedAudiences: ['api://${entraClientId}', entraClientId]
          defaultAuthorizationPolicy: {
            allowedPrincipals: { identities: [adminObjectId] }
          }
        }
      }
    }
  }
  dependsOn: [webSettings]
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: names.func
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: union(commonSiteConfig, {
      linuxFxVersion: 'NODE|22'
    })
  }
}

resource funcSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: {
    FUNCTIONS_EXTENSION_VERSION: '~4'
    FUNCTIONS_WORKER_RUNTIME: 'node'
    // Identity-based host storage (shared keys are disabled on the account).
    AzureWebJobsStorage__accountName: storage.name
    AzureWebJobsStorage__credential: 'managedidentity'
    WEBSITE_RUN_FROM_PACKAGE: '1'
    APPLICATIONINSIGHTS_CONNECTION_STRING: insights.properties.ConnectionString
    DATABASE_URL: kvRef(keyVault.name, secretDatabaseUrl.name)
    STORAGE_ACCOUNT_NAME: storage.name
    UPLOADS_CONTAINER: uploadsContainer
    RETENTION_DAYS: string(retentionDays)
    DRAFT_TTL_HOURS: '24'
  }
  dependsOn: [funcKvRole, funcBlobRole, funcQueueRole]
}

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------
resource webBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, web.id, roles.blobDataContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.blobDataContributor)
    principalId: web.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource webQueueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, web.id, roles.queueMessageSender)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.queueMessageSender)
    principalId: web.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource webKvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, web.id, roles.keyVaultSecretsUser)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: web.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource funcBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, roles.blobDataOwner)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.blobDataOwner)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource funcQueueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, roles.queueDataContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.queueDataContributor)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource funcKvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, functionApp.id, roles.keyVaultSecretsUser)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource deployerKvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  scope: keyVault
  name: guid(keyVault.id, deployerPrincipalId, roles.keyVaultSecretsUser)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: deployerPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output webAppName string = web.name
output functionAppName string = functionApp.name
output webUrl string = defaultWebUrl
output siteUrl string = effectiveSiteUrl
output storageAccountName string = storage.name
output postgresServerName string = postgres.name
output keyVaultName string = keyVault.name
output emailSenderAddress string = emailFrom
output webPrincipalId string = web.identity.principalId
