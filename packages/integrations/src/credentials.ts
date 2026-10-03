import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { OAuthProvider } from './oauth.js';

const key = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  return createHash('sha256').update(secret).digest();
};

export const encryptCredentials = (value: unknown) => {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
};

export const decryptCredentials = <T = Record<string, any>>(value: string): T => {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unsupported credential ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')) as T;
};

const refreshConfig: Partial<Record<OAuthProvider, { url:string; id:string; secret:string; basic:boolean }>> = {
  hubspot:{ url:'https://api.hubapi.com/oauth/v1/token', id:'HUBSPOT_CLIENT_ID', secret:'HUBSPOT_CLIENT_SECRET', basic:false },
  salesforce:{ url:'https://login.salesforce.com/services/oauth2/token', id:'SALESFORCE_CLIENT_ID', secret:'SALESFORCE_CLIENT_SECRET', basic:false },
  pipedrive:{ url:'https://oauth.pipedrive.com/oauth/token', id:'PIPEDRIVE_CLIENT_ID', secret:'PIPEDRIVE_CLIENT_SECRET', basic:true },
  google:{ url:'https://oauth2.googleapis.com/token', id:'GOOGLE_CLIENT_ID', secret:'GOOGLE_CLIENT_SECRET', basic:false },
  microsoft:{ url:'https://login.microsoftonline.com/common/oauth2/v2.0/token', id:'MICROSOFT_CLIENT_ID', secret:'MICROSOFT_CLIENT_SECRET', basic:false },
  quickbooks:{ url:'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', id:'QUICKBOOKS_CLIENT_ID', secret:'QUICKBOOKS_CLIENT_SECRET', basic:true },
  xero:{ url:'https://identity.xero.com/connect/token', id:'XERO_CLIENT_ID', secret:'XERO_CLIENT_SECRET', basic:true },
  stripe:{ url:'https://connect.stripe.com/oauth/token', id:'STRIPE_CONNECT_CLIENT_ID', secret:'STRIPE_SECRET_KEY', basic:true }
};

export const refreshOAuthCredentials = async <T extends Record<string, any>>(provider: OAuthProvider, credentials: T): Promise<T> => {
  const expiresAt = Number(credentials.expiresAt ?? 0);
  if (!credentials.refresh_token || !expiresAt || expiresAt > Date.now() + 5 * 60 * 1000) return credentials;
  const config = refreshConfig[provider];
  if (!config) return credentials;
  const clientId = process.env[config.id], clientSecret = process.env[config.secret];
  if (!clientId || !clientSecret) throw new Error(`OAuth refresh credentials are not configured for ${provider}`);
  const body = new URLSearchParams({ grant_type:'refresh_token', refresh_token:credentials.refresh_token });
  const headers: Record<string,string> = { 'Content-Type':'application/x-www-form-urlencoded' };
  if (config.basic) headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  else { body.set('client_id',clientId); body.set('client_secret',clientSecret); }
  const response = await fetch(config.url,{ method:'POST',headers,body });
  if (!response.ok) throw new Error(`OAuth refresh failed for ${provider} (${response.status})`);
  const next = await response.json() as Record<string,any>;
  return { ...credentials, ...next, refresh_token:next.refresh_token ?? credentials.refresh_token, expiresAt:Date.now() + Number(next.expires_in ?? 3600) * 1000 } as T;
};
