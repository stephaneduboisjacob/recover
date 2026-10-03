import { afterEach, describe, expect, it, vi } from 'vitest';
import { BTCPayPaymentAdapter, mockSources, SmtpEmailAdapter, StripePaymentAdapter, TwilioSmsAdapter } from './index.js';

afterEach(() => vi.unstubAllGlobals());

describe('integration adapters', () => {
  it.each(['crm','invoicing','ecommerce','phone'] as const)('maps %s mock records to the common adapter interface', async category => {
    const records = await mockSources[category]().listRecoverable('workspace');
    expect(records).toHaveLength(1); expect(records[0]).toHaveProperty('id'); expect(records[0]).toHaveProperty('valueCents');
  });
  it('sends an email through a mocked SMTP transport', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId:'mail-1' });
    const createTransport = vi.fn(() => ({ sendMail }));
    const adapter = new SmtpEmailAdapter({ host:'smtp.example.test', port:587, from:'Recover <test@example.test>' }, createTransport);
    const result = await adapter.send({ to:'person@example.test', subject:'Following up', body:'Hello', idempotencyKey:'msg-1' });
    expect(result.id).toBe('mail-1'); expect(createTransport).toHaveBeenCalledOnce(); expect(sendMail).toHaveBeenCalledOnce();
  });
  it('sends Twilio SMS via a mocked provider response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid:'SM1', status:'queued' }), { status:201 }));
    vi.stubGlobal('fetch', fetch);
    const result = await new TwilioSmsAdapter('AC1','token','+15555550100').send({ to:'+15555550101', body:'hello', idempotencyKey:'msg-2' });
    expect(result).toEqual({ id:'SM1', status:'queued' }); expect(fetch).toHaveBeenCalledOnce();
  });
  it('creates Stripe payment links through mocked product, price and link calls', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id:'prod_1' }),{ status:200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id:'price_1' }),{ status:200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id:'plink_1', url:'https://pay.example.test/1' }),{ status:200 }));
    vi.stubGlobal('fetch', fetch);
    const result = await new StripePaymentAdapter('sk_test').createPaymentLink({ amountCents:5000,currency:'USD',description:'Demo',idempotencyKey:'pay-1' });
    expect(result.url).toBe('https://pay.example.test/1'); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('creates a BTCPay invoice through a mocked server response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'invoice-1',checkoutLink:'https://pay.example.test/btc'}),{status:200}));
    vi.stubGlobal('fetch',fetch);
    const result=await new BTCPayPaymentAdapter('https://btcpay.example.test','store','token').createPaymentLink({amountCents:2500,currency:'USD',description:'Demo',idempotencyKey:'btc-1'});
    expect(result).toEqual({id:'invoice-1',url:'https://pay.example.test/btc'});
  });
});
