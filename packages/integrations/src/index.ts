export type ExternalRecord = { id: string; type: string; displayName?: string; email?: string; phone?: string; valueCents?: number; currency?: string; status?: string; updatedAt?: string; data?: Record<string, unknown> };
export interface SourceAdapter { readonly provider: string; listRecoverable(workspaceId: string): Promise<ExternalRecord[]>; }
export interface MessageAdapter { readonly provider: string; send(input: { to: string; subject?: string; body: string; idempotencyKey: string }): Promise<{ id: string; status: string }>; }
export interface PaymentAdapter { readonly provider: string; createPaymentLink(input: { amountCents: number; currency: string; description: string; idempotencyKey: string }): Promise<{ url: string; id: string }>; }

export class DemoAdapter implements SourceAdapter {
  readonly provider = 'demo';
  async listRecoverable(): Promise<ExternalRecord[]> { return []; }
}

export class StripePaymentAdapter implements PaymentAdapter {
  readonly provider = 'stripe';
  constructor(private readonly secretKey: string) {}
  async createPaymentLink(input: { amountCents: number; currency: string; description: string; idempotencyKey: string }) {
    const headers = { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' };
    const productResponse = await fetch('https://api.stripe.com/v1/products', { method: 'POST', headers: { ...headers, 'Idempotency-Key': `${input.idempotencyKey}:product` }, body: new URLSearchParams({ name: input.description }) });
    if (!productResponse.ok) throw new Error(`Stripe product creation failed (${productResponse.status})`);
    const product = await productResponse.json() as { id: string };
    const priceResponse = await fetch('https://api.stripe.com/v1/prices', { method: 'POST', headers: { ...headers, 'Idempotency-Key': `${input.idempotencyKey}:price` }, body: new URLSearchParams({ currency: input.currency.toLowerCase(), unit_amount: String(input.amountCents), product: product.id }) });
    if (!priceResponse.ok) throw new Error(`Stripe price creation failed (${priceResponse.status})`);
    const price = await priceResponse.json() as { id: string };
    const opportunityId = input.idempotencyKey.startsWith('payment-link:') ? input.idempotencyKey.slice('payment-link:'.length) : input.idempotencyKey;
    const response = await fetch('https://api.stripe.com/v1/payment_links', { method: 'POST', headers: { ...headers, 'Idempotency-Key': input.idempotencyKey }, body: new URLSearchParams({ 'line_items[0][price]': price.id, 'line_items[0][quantity]': '1', 'metadata[recovery_opportunity_id]': opportunityId, 'payment_intent_data[metadata][recovery_opportunity_id]': opportunityId }) });
    if (!response.ok) throw new Error(`Stripe payment link failed (${response.status})`);
    const result = await response.json() as { id: string; url: string };
    return { id: result.id, url: result.url };
  }
}

export class BTCPayPaymentAdapter implements PaymentAdapter {
  readonly provider = 'btcpay';
  constructor(private readonly baseUrl: string, private readonly storeId: string, private readonly apiKey: string) {}
  async createPaymentLink(input: { amountCents: number; currency: string; description: string; idempotencyKey: string }) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/v1/stores/${encodeURIComponent(this.storeId)}/invoices`, {
      method: 'POST', headers: { Authorization: `token ${this.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({ amount: (input.amountCents / 100).toFixed(2), currency: input.currency, metadata: { itemDesc: input.description, orderId: input.idempotencyKey } })
    });
    if (!response.ok) throw new Error(`BTCPay invoice creation failed (${response.status})`);
    const invoice = await response.json() as { id: string; checkoutLink: string };
    return { id: invoice.id, url: invoice.checkoutLink };
  }
}

export class TwilioSmsAdapter implements MessageAdapter {
  readonly provider = 'twilio';
  constructor(private readonly accountSid: string, private readonly authToken: string, private readonly from: string) {}
  async send(input: { to: string; body: string; idempotencyKey: string }) {
    const form = new URLSearchParams({ To: input.to, From: this.from, Body: input.body });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    if (!response.ok) throw new Error(`Twilio send failed (${response.status})`);
    const result = await response.json() as { sid: string; status: string };
    return { id: result.sid, status: result.status };
  }
  async call(input: { to: string; twiml: string; callbackUrl: string }) {
    const form = new URLSearchParams({ To: input.to, From: this.from, Twiml: input.twiml, StatusCallback: input.callbackUrl });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    if (!response.ok) throw new Error(`Twilio call failed (${response.status})`);
    const result = await response.json() as { sid: string; status: string };
    return { id: result.sid, status: result.status };
  }
}

export class TwilioCallsAdapter implements SourceAdapter {
  readonly provider = 'twilio';
  constructor(private readonly accountSid:string,private readonly authToken:string,private readonly defaultValueCents=50000){}
  async listRecoverable(){
    const headers={Authorization:`Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`};
    const pages=await Promise.all(['no-answer','busy','failed'].map(async status=>{
      const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json?Status=${status}&PageSize=100`,{headers});
      if(!response.ok)throw new Error(`Twilio call scan failed (${response.status})`);
      return (await response.json() as any).calls ?? [];
    }));
    return pages.flat().filter((call:any)=>String(call.direction).startsWith('inbound')).map((call:any)=>({id:call.sid,type:'missed_call',displayName:call.from,phone:call.from,valueCents:this.defaultValueCents,currency:'USD',status:'missed',updatedAt:call.start_time,data:{to:call.to,callbackWithinHours:4,callStatus:call.status}}));
  }
}

export class SmtpEmailAdapter implements MessageAdapter {
  readonly provider = 'smtp';
  constructor(
    private readonly config: { host: string; port: number; user?: string; password?: string; from: string },
    private readonly createTransport?: (options: { host: string; port: number; secure: boolean; auth?: { user: string; pass?: string } }) => {
      sendMail(input: { from: string; to: string; subject: string; text: string; headers: Record<string, string> }): Promise<{ messageId: string }>;
    }
  ) {}
  async send(input: { to: string; subject?: string; body: string; idempotencyKey: string }) {
    const transportOptions = { host: this.config.host, port: this.config.port, secure: this.config.port === 465, auth: this.config.user ? { user: this.config.user, pass: this.config.password } : undefined };
    const transporter = this.createTransport
      ? this.createTransport(transportOptions)
      : (await import('nodemailer')).createTransport(transportOptions);
    const result = await transporter.sendMail({ from: this.config.from, to: input.to, subject: input.subject ?? 'A quick follow-up', text: input.body, headers: { 'X-RECOVER-Idempotency-Key': input.idempotencyKey } });
    return { id: result.messageId, status: 'sent' };
  }
}

export class GmailAdapter implements MessageAdapter {
  readonly provider = 'gmail';
  constructor(private readonly accessToken: string) {}
  async send(input: { to: string; subject?: string; body: string; idempotencyKey: string }) {
    const raw = [`To: ${input.to}`, `Subject: ${input.subject ?? 'A quick follow-up'}`, 'Content-Type: text/plain; charset=utf-8', `X-RECOVER-Idempotency-Key: ${input.idempotencyKey}`, '', input.body].join('\r\n');
    const encoded = Buffer.from(raw).toString('base64url');
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: encoded }) });
    if (!response.ok) throw new Error(`Gmail send failed (${response.status})`);
    const result = await response.json() as { id: string };
    return { id: result.id, status: 'sent' };
  }
}

export class OutlookAdapter implements MessageAdapter {
  readonly provider = 'outlook';
  constructor(private readonly accessToken: string) {}
  async send(input: { to: string; subject?: string; body: string; idempotencyKey: string }) {
    const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json', 'client-request-id': input.idempotencyKey }, body: JSON.stringify({ message: { subject: input.subject ?? 'A quick follow-up', body: { contentType: 'Text', content: input.body }, toRecipients: [{ emailAddress: { address: input.to } }] }, saveToSentItems: true }) });
    if (!response.ok) throw new Error(`Microsoft Graph send failed (${response.status})`);
    return { id: input.idempotencyKey, status: 'sent' };
  }
}

export class JsonApiSourceAdapter implements SourceAdapter {
  constructor(readonly provider: string, private readonly endpoint: string, private readonly token: string, private readonly mapper: (payload: any) => ExternalRecord[], private readonly headerName = 'Authorization', private readonly prefix = 'Bearer ', private readonly extraHeaders:Record<string,string> = {}) {}
  async listRecoverable() {
    const response = await fetch(this.endpoint, { headers: { [this.headerName]: `${this.prefix}${this.token}`, Accept: 'application/json', ...this.extraHeaders } });
    if (!response.ok) throw new Error(`${this.provider} read failed (${response.status})`);
    return this.mapper(await response.json());
  }
}

export const stripeInvoices = (token: string) => new JsonApiSourceAdapter('stripe', 'https://api.stripe.com/v1/invoices?status=open&limit=100', token, p => (p.data ?? []).map((x: any) => ({ id: x.id, type: 'invoice', valueCents: x.amount_remaining, currency: x.currency?.toUpperCase() ?? 'USD', status: x.due_date && x.due_date * 1000 < Date.now() ? 'overdue' : 'open', updatedAt: new Date((x.created ?? 0) * 1000).toISOString(), data: { customer: x.customer, hostedInvoiceUrl: x.hosted_invoice_url } })));

export const shopifyAbandonedCheckouts = (shop: string, token: string) => new JsonApiSourceAdapter('shopify', `https://${shop}/admin/api/2026-07/checkouts.json?status=open&limit=100`, token, p => (p.checkouts ?? []).map((x: any) => ({ id: String(x.id), type: 'cart', displayName: x.billing_address?.name ?? x.shipping_address?.name ?? 'Shopper', email: x.email, valueCents: Math.round(Number(x.total_price ?? 0) * 100), currency: x.currency ?? 'USD', status: 'abandoned', updatedAt: x.updated_at, data: { checkoutUrl: x.abandoned_checkout_url } })), 'X-Shopify-Access-Token', '');

export const hubspotOpenDeals = (token: string) => new JsonApiSourceAdapter('hubspot', 'https://api.hubapi.com/crm/v3/objects/deals?properties=dealname,amount,dealstage,hs_lastmodifieddate&limit=100', token, p => (p.results ?? []).map((x: any) => ({ id: x.id, type: 'quote', valueCents: Math.round(Number(x.properties?.amount ?? 0) * 100), currency: 'USD', status: ['closedwon','closedlost'].includes(x.properties?.dealstage) ? 'closed' : 'open', updatedAt: x.properties?.hs_lastmodifieddate, data: x.properties })));

export const createSourceAdapter = (provider: string, token: string, externalId?: string, credentials?:Record<string,any>, settings?:Record<string,any>): SourceAdapter | null => {
  if (provider === 'hubspot') return hubspotOpenDeals(token);
  if (provider === 'shopify' && externalId) return shopifyAbandonedCheckouts(externalId, token);
  if (provider === 'stripe') return {
    provider:'stripe',
    async listRecoverable(){
      const [invoices,subResponse,sessionResponse]=await Promise.all([
        stripeInvoices(token).listRecoverable(),
        fetch('https://api.stripe.com/v1/subscriptions?status=canceled&limit=100',{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}}),
        fetch('https://api.stripe.com/v1/checkout/sessions?limit=100',{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}})
      ]);
      if(!subResponse.ok)throw new Error(`Stripe subscription scan failed (${subResponse.status})`);
      if(!sessionResponse.ok)throw new Error(`Stripe checkout scan failed (${sessionResponse.status})`);
      const payload=await subResponse.json() as any; const sessions=await sessionResponse.json() as any;
      const subscriptions=(payload.data??[]).map((x:any)=>{const item=x.items?.data?.[0];return {id:x.id,type:'subscription',displayName:x.customer_email??x.customer,valueCents:Number(item?.price?.unit_amount??0),currency:String(item?.price?.currency??'usd').toUpperCase(),status:'expired',updatedAt:new Date(Number(x.ended_at??x.current_period_end??x.created)*1000).toISOString(),data:x}});
      const carts=(sessions.data??[]).filter((x:any)=>x.status==='open').map((x:any)=>({id:x.id,type:'cart',displayName:x.customer_details?.name??'Checkout',email:x.customer_details?.email,valueCents:Number(x.amount_total??0),currency:String(x.currency??'usd').toUpperCase(),status:'open',updatedAt:new Date(Number(x.created)*1000).toISOString(),data:x}));
      return [...invoices,...subscriptions,...carts];
    }
  };
  if (provider === 'twilio' && credentials?.accountSid && credentials?.authToken) return new TwilioCallsAdapter(credentials.accountSid,credentials.authToken,Number(settings?.defaultCallValueCents??50000));
  if (provider === 'pipedrive') return new JsonApiSourceAdapter('pipedrive', 'https://api.pipedrive.com/v1/deals?status=open&limit=100', token, p => (p.data ?? []).map((x: any) => ({ id: String(x.id), type:'quote', displayName:x.title, valueCents:Math.round(Number(x.value ?? 0)*100), currency:x.currency ?? 'USD', status:x.status, updatedAt:x.update_time, data:x })));
  if (provider === 'salesforce' && externalId) return new JsonApiSourceAdapter('salesforce', `${externalId.replace(/\/$/,'')}/services/data/v66.0/query/?q=${encodeURIComponent('SELECT Id,Name,Amount,StageName,LastModifiedDate,CloseDate FROM Opportunity WHERE IsClosed = false')}`, token, p => (p.records ?? []).map((x:any) => ({ id:x.Id, type:'quote', displayName:x.Name, valueCents:Math.round(Number(x.Amount ?? 0)*100), currency:'USD', status:'open', updatedAt:x.LastModifiedDate, data:x })));
  if (provider === 'quickbooks' && externalId) return new JsonApiSourceAdapter('quickbooks', `https://quickbooks.api.intuit.com/v3/company/${encodeURIComponent(externalId)}/query?query=${encodeURIComponent("select * from Invoice where Balance > '0'")}&minorversion=75`, token, p => (p.QueryResponse?.Invoice ?? []).map((x:any) => ({ id:String(x.Id), type:'invoice', displayName:x.CustomerRef?.name, valueCents:Math.round(Number(x.Balance ?? 0)*100), currency:x.CurrencyRef?.value ?? 'USD', status:'overdue', updatedAt:x.MetaData?.LastUpdatedTime, data:x })));
  if (provider === 'xero' && externalId) return new JsonApiSourceAdapter('xero', 'https://api.xero.com/api.xro/2.0/Invoices?Statuses=AUTHORISED', token, p => (p.Invoices ?? []).filter((x:any)=>Number(x.AmountDue)>0).map((x:any)=>({ id:x.InvoiceID, type:'invoice', displayName:x.Contact?.Name, email:x.Contact?.EmailAddress, valueCents:Math.round(Number(x.AmountDue)*100), currency:x.CurrencyCode ?? 'USD', status:'overdue', updatedAt:x.UpdatedDateUTC, data:x })), 'Authorization','Bearer ',{'xero-tenant-id':externalId});
  if (provider === 'woocommerce' && credentials?.storeUrl && credentials?.consumerKey && credentials?.consumerSecret) {
    const endpoint=`${String(credentials.storeUrl).replace(/\/$/,'')}/wp-json/wc/v3/orders?status=pending&per_page=100`;
    const basic=Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64');
    return new JsonApiSourceAdapter('woocommerce',endpoint,basic,p=>(Array.isArray(p)?p:[]).map((x:any)=>({id:String(x.id),type:'cart',displayName:x.billing?.first_name?`${x.billing.first_name} ${x.billing.last_name??''}`.trim():'Shopper',email:x.billing?.email,valueCents:Math.round(Number(x.total??0)*100),currency:x.currency??'USD',status:'open',updatedAt:x.date_modified_gmt??x.date_created_gmt,data:x})), 'Authorization','Basic ');
  }
  return null;
};

export const mockSources = {
  crm: (provider = 'mock-crm'): SourceAdapter => ({ provider, async listRecoverable() { return [{ id: 'quote-1', type: 'quote', valueCents: 220000, currency: 'USD', status: 'sent' }]; } }),
  invoicing: (provider = 'mock-invoicing'): SourceAdapter => ({ provider, async listRecoverable() { return [{ id: 'invoice-1', type: 'invoice', valueCents: 84000, currency: 'USD', status: 'overdue' }]; } }),
  ecommerce: (provider = 'mock-ecommerce'): SourceAdapter => ({ provider, async listRecoverable() { return [{ id: 'cart-1', type: 'cart', valueCents: 14750, currency: 'USD', status: 'abandoned' }]; } }),
  phone: (provider = 'mock-phone'): SourceAdapter => ({ provider, async listRecoverable() { return [{ id: 'call-1', type: 'missed_call', valueCents: 51000, currency: 'USD', status: 'missed' }]; } })
};

export * from './oauth.js';
export * from './credentials.js';
