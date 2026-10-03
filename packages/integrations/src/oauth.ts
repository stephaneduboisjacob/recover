export type OAuthProvider = 'hubspot' | 'salesforce' | 'pipedrive' | 'google' | 'microsoft' | 'shopify' | 'quickbooks' | 'xero' | 'stripe';
export const oauthAuthorizeUrl = (provider: OAuthProvider, state: string, redirectUri: string, shop?: string) => {
  const configs: Record<OAuthProvider, [string, string, string]> = {
    hubspot: ['https://app.hubspot.com/oauth/authorize', 'HUBSPOT_CLIENT_ID', 'crm.objects.contacts.read crm.objects.deals.read'],
    salesforce: ['https://login.salesforce.com/services/oauth2/authorize', 'SALESFORCE_CLIENT_ID', 'api refresh_token'],
    pipedrive: ['https://oauth.pipedrive.com/oauth/authorize', 'PIPEDRIVE_CLIENT_ID', 'deals:read persons:read'],
    google: ['https://accounts.google.com/o/oauth2/v2/auth', 'GOOGLE_CLIENT_ID', 'openid email https://www.googleapis.com/auth/gmail.send'],
    microsoft: ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'MICROSOFT_CLIENT_ID', 'openid email offline_access Mail.Send'],
    shopify: [`https://${shop ?? 'example.myshopify.com'}/admin/oauth/authorize`, 'SHOPIFY_API_KEY', 'read_orders read_checkouts'],
    quickbooks: ['https://appcenter.intuit.com/connect/oauth2', 'QUICKBOOKS_CLIENT_ID', 'com.intuit.quickbooks.accounting'],
    xero: ['https://login.xero.com/identity/connect/authorize', 'XERO_CLIENT_ID', 'openid profile email accounting.transactions.read offline_access'],
    stripe: ['https://connect.stripe.com/oauth/authorize', 'STRIPE_CONNECT_CLIENT_ID', 'read_write']
  };
  const [base, key, scope] = configs[provider];
  const url = new URL(base);
  url.search = new URLSearchParams({ client_id: process.env[key] ?? '', redirect_uri: redirectUri, response_type: 'code', state, scope }).toString();
  if (provider === 'google') { url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent'); }
  return url.toString();
};
