#!/usr/bin/env bash
# Creates the Entra ID app registration used by App Service Authentication for /admin,
# restricts sign-in to explicitly assigned users, and assigns the single admin account.
# Usage: ./scripts/create-entra-app.sh <web-app-hostname> <admin-user-principal-name>
#   e.g. ./scripts/create-entra-app.sh goformosaic.com kenil@yourtenant.onmicrosoft.com
set -euo pipefail

HOST="${1:?web app hostname, e.g. goformosaic.com or app-gfm-xxxx.azurewebsites.net}"
ADMIN_UPN="${2:?admin user principal name}"
DEFAULT_HOST="${3:-}" # optional second redirect host (the *.azurewebsites.net name)

REDIRECTS=("https://${HOST}/.auth/login/aad/callback")
[[ -n "$DEFAULT_HOST" ]] && REDIRECTS+=("https://${DEFAULT_HOST}/.auth/login/aad/callback")

APP_ID=$(az ad app create \
  --display-name "GoForMosaic Admin" \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "${REDIRECTS[@]}" \
  --enable-id-token-issuance true \
  --query appId -o tsv)
az ad app update --id "$APP_ID" --identifier-uris "api://${APP_ID}"

SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
# Only users explicitly assigned to the app can sign in.
az ad sp update --id "$SP_ID" --set appRoleAssignmentRequired=true

ADMIN_OID=$(az ad user show --id "$ADMIN_UPN" --query id -o tsv)
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${SP_ID}/appRoleAssignedTo" \
  --body "{\"principalId\":\"${ADMIN_OID}\",\"resourceId\":\"${SP_ID}\",\"appRoleId\":\"00000000-0000-0000-0000-000000000000\"}" \
  -o none

SECRET=$(az ad app credential reset --id "$APP_ID" --display-name "app-service-auth" --years 1 --query password -o tsv)

cat <<OUT

Entra app created. Set these for the Bicep deployment (GitHub variables / secrets):
  ENTRA_CLIENT_ID      = ${APP_ID}          (variable)
  ADMIN_OBJECT_ID      = ${ADMIN_OID}       (variable)
  ENTRA_CLIENT_SECRET  = ${SECRET}          (secret — shown once)

Secret expires in 1 year; rotate with: az ad app credential reset --id ${APP_ID}
Enforce MFA for this account via Security Defaults or a Conditional Access policy (see README).
OUT
