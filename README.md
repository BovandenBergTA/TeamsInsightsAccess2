# TeamsMap — Teams Group Visualizer

Interactive tree/radial visualization of Microsoft Teams groups, members, and nested group structure. Deployed as an Azure Static Web App with a built-in Azure Function proxy for secure Graph API access.

---

## Architecture

```
Browser (index.html)
    │  POST /api/graph { path: "/groups?..." }
    ▼
Azure Function (api/graph-proxy/index.js)
    │  client_credentials token request
    │  ├─ TENANT_ID, CLIENT_ID, CLIENT_SECRET (env vars — never in frontend)
    ▼
Microsoft Graph API
```

The client secret **never** leaves the Azure Function. The frontend only knows the tenant ID and client ID.

---

## App Registration Setup

1. Go to **Entra ID → App registrations → New registration**
   - Name: `TeamsMap`
   - Supported account types: *Single tenant*
   - No redirect URI needed (we use client_credentials)

2. Under **API permissions → Add a permission → Microsoft Graph → Application permissions**, add:
   - `Group.Read.All`
   - `GroupMember.Read.All`
   - `User.Read.All`

3. Click **Grant admin consent**

4. Under **Certificates & secrets → New client secret**
   - Copy the secret value immediately

5. Note your **Application (client) ID** and **Directory (tenant) ID** from the Overview page.

---

## Deploy to Azure Static Web Apps

### Option A — Azure Portal + GitHub

1. Push this repo to GitHub

2. In Azure Portal → **Create a resource → Static Web App**
   - Name: `teamsmap`
   - Plan: Free
   - Source: GitHub (authorize and select your repo)
   - Build presets: **Custom**
   - App location: `/src`
   - Api location: `/api`
   - Output location: (leave blank)

3. After creation, go to **Configuration → Application settings** and add:
   | Name | Value |
   |------|-------|
   | `TENANT_ID` | your tenant ID |
   | `CLIENT_ID` | your client ID |
   | `CLIENT_SECRET` | your client secret |
   | `ALLOWED_ORIGIN` | `https://your-app.azurestaticapps.net` |

### Option B — Azure CLI

```bash
az staticwebapp create \
  --name teamsmap \
  --resource-group your-rg \
  --source https://github.com/yourorg/teams-viz \
  --branch main \
  --app-location "/src" \
  --api-location "/api" \
  --login-with-github

# Set secrets
az staticwebapp appsettings set \
  --name teamsmap \
  --resource-group your-rg \
  --setting-names \
    TENANT_ID="xxx" \
    CLIENT_ID="xxx" \
    CLIENT_SECRET="xxx" \
    ALLOWED_ORIGIN="https://teamsmap.azurestaticapps.net"
```

---

## Local Development

```bash
# Install Azure Functions Core Tools (v4)
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# Install function dependencies
cd api && npm install

# Edit api/local.settings.json with your credentials
# (this file is gitignored — never commit secrets)

# Start the function locally
func start

# Serve the frontend (in another terminal)
cd src
npx serve . -l 3000
# or just open index.html in a browser pointed at http://localhost:3000
```

The frontend will call `http://localhost:7071/api/graph` by default when running locally — update the proxy URL in the UI config if needed.

---

## Security Notes

- **Never** expose `CLIENT_SECRET` in frontend code or the URL
- Lock down `ALLOWED_ORIGIN` to your Static Web App URL in production
- Consider adding [Easy Auth](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization) (Entra ID login) to restrict who can access the app
- The function validates and allowlists Graph API paths before forwarding
- For extra defense, add an API key header between frontend ↔ function

---

## Graph API Permissions Reference

| Permission | Purpose |
|-----------|---------|
| `Group.Read.All` | List Teams-enabled groups |
| `GroupMember.Read.All` | Read members of each group |
| `User.Read.All` | Resolve user display name, UPN, userType (guest vs member) |

---

## Folder Structure

```
teams-viz/
├── src/
│   └── index.html              # Frontend app (D3 visualization)
├── api/
│   ├── graph-proxy/
│   │   └── index.js            # Azure Function proxy
│   ├── package.json
│   └── local.settings.json     # Local dev secrets (gitignored)
├── staticwebapp.config.json    # SWA routing config
└── README.md
```

---

## .gitignore recommendation

```
api/local.settings.json
node_modules/
.env
```
