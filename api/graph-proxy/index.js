const { app } = require('@azure/functions');

/**
 * Azure Function: graph-proxy
 * 
 * Accepts POST requests from the frontend with a Graph API path,
 * authenticates using client_credentials (app registration),
 * and returns the Graph response.
 * 
 * Required app registration permissions (Application, not Delegated):
 *   - Group.Read.All
 *   - GroupMember.Read.All
 *   - User.Read.All (for member userType/UPN details)
 */
app.http('graph-proxy', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous', // Secure with Easy Auth or API key for production
  handler: async (request, context) => {

    // CORS headers (restrict origin in production)
    const corsHeaders = {
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, body: 'Invalid JSON', headers: corsHeaders };
    }

    const { path, tenantId, clientId } = body;

    if (!path || typeof path !== 'string') {
      return { status: 400, body: 'Missing "path"', headers: corsHeaders };
    }

    // Validate path (only allow /groups, /users, /directoryObjects endpoints)
    const allowed = /^\/(groups|users|directoryObjects)/;
    if (!allowed.test(path)) {
      context.warn('Blocked path: ' + path);
      return { status: 403, body: 'Path not allowed', headers: corsHeaders };
    }

    // Use env vars (set in Azure portal / local.settings.json)
    const resolvedTenantId = process.env.TENANT_ID   || tenantId;
    const resolvedClientId = process.env.CLIENT_ID   || clientId;
    const clientSecret     = process.env.CLIENT_SECRET; // NEVER pass from frontend

    if (!resolvedTenantId || !resolvedClientId || !clientSecret) {
      context.error('Missing auth config. Set TENANT_ID, CLIENT_ID, CLIENT_SECRET in app settings.');
      return { status: 500, body: 'Server auth not configured', headers: corsHeaders };
    }

    try {
      // 1. Get access token via client_credentials
      const tokenUrl = `https://login.microsoftonline.com/${resolvedTenantId}/oauth2/v2.0/token`;
      const tokenParams = new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     resolvedClientId,
        client_secret: clientSecret,
        scope:         'https://graph.microsoft.com/.default',
      });

      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        context.error('Token error:', err);
        return { status: 502, body: 'Failed to acquire token: ' + err, headers: corsHeaders };
      }

      const { access_token } = await tokenRes.json();

      // 2. Forward request to Graph API
      const graphUrl = `https://graph.microsoft.com/v1.0${path}`;
      context.log('Graph →', graphUrl);

      const graphRes = await fetch(graphUrl, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          ConsistencyLevel: 'eventual', // needed for $filter on groups
        },
      });

      const graphBody = await graphRes.text();

      return {
        status: graphRes.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: graphBody,
      };

    } catch (err) {
      context.error('Proxy error:', err);
      return { status: 500, body: 'Proxy error: ' + err.message, headers: corsHeaders };
    }
  },
});
