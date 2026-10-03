import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import rawBody from 'fastify-raw-body';
import { PrismaClient, OpportunityStatus, Channel, ConsentChannel, ConsentStatus, PaymentStatus } from '@prisma/client';
import argon2 from 'argon2';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Counter, collectDefaultMetrics, Registry } from 'prom-client';
import { signupSchema, opportunityActionSchema, publicHeadline, nextWorkflowStep } from '@recover/shared';
import { BTCPayPaymentAdapter, decryptCredentials, encryptCredentials, GmailAdapter, OAuthProvider, oauthAuthorizeUrl, OutlookAdapter, refreshOAuthCredentials, StripePaymentAdapter, TwilioSmsAdapter } from '@recover/integrations';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import Stripe from 'stripe';
import twilio from 'twilio';
import { classifyIntentRuleBased, runPrompt } from './llm.js';

const prisma = new PrismaClient();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true, genReqId: () => randomBytes(8).toString('hex') });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6381', { maxRetriesPerRequest: null });
const recoverQueue = new Queue('recover-jobs', { connection: redis });
const registry = new Registry();
collectDefaultMetrics({ register: registry });
const requestCounter = new Counter({ name: 'recover_http_requests_total', help: 'HTTP requests by route and status', labelNames: ['method', 'route', 'status'] });
registry.registerMetric(requestCounter);
const secure = process.env.COOKIE_SECURE !== 'false';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const jsonHash = (value: unknown) => hash(JSON.stringify(value));
const money = (cents: number) => Math.round(cents / 100);

await app.register(cookie);
await app.register(cors, { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true });
await app.register(formbody);
await app.register(rawBody, { field: 'rawBody', global: false, encoding: false, runFirst: true });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

app.addHook('onResponse', async (request, reply) => { requestCounter.inc({ method: request.method, route: request.routeOptions.url ?? 'unknown', status: reply.statusCode }); });
app.addHook('preHandler', async (request, reply) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && request.headers.origin && request.headers.origin !== process.env.WEB_ORIGIN) {
    return reply.code(403).send({ error: 'Invalid request origin' });
  }
});

type Auth = { userId: string; workspaceId: string; role: string; workspace: { id: string; name: string; slug: string; demoMode: boolean; requireApproval: boolean; collectionsApproval: boolean; successFeeBps: number; timezone: string; quietHoursStart: string; quietHoursEnd: string; businessAddress:string|null; stripeCustomerId:string|null; stripeSubscriptionId:string|null; basePlan:'STARTER'|'GROWTH'|'SCALE' } };
declare module 'fastify' { interface FastifyRequest { auth?: Auth } }

app.addHook('preHandler', async (request) => {
  if (!request.cookies.recover_session) return;
  const tokenHash = hash(request.cookies.recover_session);
  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: { include: { memberships: { include: { workspace: true }, orderBy: { createdAt: 'asc' }, take: 1 } } } } });
  const membership = session?.user.memberships[0];
  if (session && session.expiresAt > new Date() && membership) request.auth = { userId: session.userId, workspaceId: membership.workspaceId, role: membership.role, workspace: membership.workspace };
});

const auth = async (request: typeof app extends never ? never : any, reply: any) => {
  if (!request.auth) return reply.code(401).send({ error: 'Authentication required' });
};
const admin = async (request: any, reply: any) => {
  if (!request.auth) return reply.code(401).send({ error: 'Authentication required' });
  if (!['OWNER', 'ADMIN'].includes(request.auth.role)) return reply.code(403).send({ error: 'Workspace owner or admin required' });
};
const audit = async (workspaceId: string, action: string, targetType: string, targetId: string, details: unknown, actorId?: string, actorType = 'SYSTEM', jurisdiction?: string) => {
  await prisma.auditLog.create({ data: { workspaceId, actorId, actorType, action, targetType, targetId, jurisdiction, payloadHash: jsonHash(details), details: details as object } });
};

app.get('/healthz', async (_request, reply) => {
  try { await prisma.$queryRaw`SELECT 1`; return { status: 'ok', service: 'recover-api', timestamp: new Date().toISOString() }; }
  catch (error) { app.log.error({ error }, 'health check failed'); return reply.code(503).send({ status: 'degraded' }); }
});
app.get('/metrics', async (_request, reply) => { reply.header('Content-Type', registry.contentType); return registry.metrics(); });

app.post('/api/auth/signup', async (request, reply) => {
  const input = signupSchema.safeParse(request.body);
  if (!input.success) return reply.code(400).send({ error: 'Please check your details', fields: input.error.flatten() });
  const email = input.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return reply.code(409).send({ error: 'An account with this email already exists' });
  const user = await prisma.user.create({
    data: {
      name: input.data.name,
      email,
      passwordHash: await argon2.hash(input.data.password),
      memberships: { create: { role: 'OWNER', workspace: { create: { name: input.data.workspaceName, slug: `${input.data.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomBytes(3).toString('hex')}` } } } }
    },
    include: { memberships: { include: { workspace: true } } }
  });
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({ data: { tokenHash: hash(token), userId: user.id, expiresAt: new Date(Date.now() + 30 * 86400000) } });
  reply.setCookie('recover_session', token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
  return reply.code(201).send({ user: { id: user.id, name: user.name, email: user.email }, workspace: user.memberships[0].workspace });
});

app.post('/api/auth/login', async (request, reply) => {
  const body = request.body as { email?: string; password?: string };
  const user = body.email ? await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } }) : null;
  if (!user || !body.password || !await argon2.verify(user.passwordHash, body.password)) return reply.code(401).send({ error: 'Email or password is incorrect' });
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({ data: { tokenHash: hash(token), userId: user.id, expiresAt: new Date(Date.now() + 30 * 86400000) } });
  reply.setCookie('recover_session', token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
  return { user: { id: user.id, name: user.name, email: user.email } };
});

app.post('/api/auth/logout', { preHandler: auth }, async (request, reply) => {
  if (request.cookies.recover_session) await prisma.session.deleteMany({ where: { tokenHash: hash(request.cookies.recover_session) } });
  reply.clearCookie('recover_session', { path: '/' }); return { ok: true };
});

app.get('/api/auth/me', { preHandler: auth }, async (request) => ({ userId: request.auth!.userId, workspace: request.auth!.workspace, role: request.auth!.role }));

const dashboardData = async (workspaceId: string) => {
  const [opportunities, recovered, sources, recent] = await Promise.all([
    prisma.recoveryOpportunity.aggregate({ where: { workspaceId }, _sum: { estimatedCents: true } }),
    prisma.recoveryOpportunity.aggregate({ where: { workspaceId, status: 'RECOVERED' }, _sum: { recoveredCents: true } }),
    prisma.recoveryOpportunity.groupBy({ by: ['source'], where: { workspaceId }, _sum: { estimatedCents: true, recoveredCents: true }, _count: true }),
    prisma.recoveryOpportunity.findMany({ where: { workspaceId }, orderBy: { detectedAt: 'desc' }, take: 8 })
  ]);
  const foundCents = opportunities._sum.estimatedCents ?? 0;
  const recoveredCents = recovered._sum.recoveredCents ?? 0;
  return { foundCents, recoveredCents, sources: sources.map(s => ({ source: s.source, foundCents: s._sum.estimatedCents ?? 0, recoveredCents: s._sum.recoveredCents ?? 0, count: s._count })), recent };
};

app.get('/api/demo', async () => {
  const workspace = await prisma.workspace.findUnique({ where: { slug: process.env.DEMO_WORKSPACE_SLUG ?? 'demo' } });
  if (!workspace) return { ...publicHeadline, foundCents: publicHeadline.found * 100, recoveredCents: publicHeadline.recovered * 100, demo: true };
  const data = await dashboardData(workspace.id);
  return { ...data, demo: true };
});

app.get('/api/demo/opportunities', async () => {
  const workspace = await prisma.workspace.findUnique({ where: { slug: process.env.DEMO_WORKSPACE_SLUG ?? 'demo' } });
  if (!workspace) return [];
  return prisma.recoveryOpportunity.findMany({ where: { workspaceId: workspace.id }, select: { id: true, source: true, title: true, contactName: true, contactEmail: true, estimatedCents: true, recoveredCents: true, currency: true, confidence: true, status: true, detectedAt: true }, orderBy: { estimatedCents: 'desc' } });
});

app.get('/api/dashboard', { preHandler: auth }, async (request) => dashboardData(request.auth!.workspaceId));

app.get('/api/opportunities', { preHandler: auth }, async (request) => {
  const query = request.query as { source?: string; status?: string; minValue?: string };
  return prisma.recoveryOpportunity.findMany({ where: { workspaceId: request.auth!.workspaceId, ...(query.source ? { source: query.source as any } : {}), ...(query.status ? { status: query.status as any } : {}), ...(query.minValue ? { estimatedCents: { gte: Number(query.minValue) * 100 } } : {}) }, include: { entity: true, messages: { orderBy: { createdAt: 'desc' } }, payments: true }, orderBy: { detectedAt: 'desc' } });
});

app.get('/api/opportunities/:id', { preHandler: auth }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const opportunity = await prisma.recoveryOpportunity.findFirst({ where: { id, workspaceId: request.auth!.workspaceId }, include: { entity: true, messages: { orderBy: { createdAt: 'desc' } }, payments: true, workflowRuns: true } });
  if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' });
  const auditLogs = await prisma.auditLog.findMany({ where: { workspaceId: request.auth!.workspaceId, targetId: id }, orderBy: { createdAt: 'desc' } });
  return { ...opportunity, auditLogs, demoMode:request.auth!.workspace.demoMode };
});

app.post('/api/opportunities/:id/draft', { preHandler: auth }, async (request, reply) => {
  const { id } = request.params as { id:string };
  const body = (request.body ?? {}) as { channel?:'EMAIL'|'SMS'|'VOICE'; tone?:string; paymentUrl?:string };
  const opportunity = await prisma.recoveryOpportunity.findFirst({ where:{id,workspaceId:request.auth!.workspaceId} });
  if (!opportunity) return reply.code(404).send({error:'Opportunity not found'});
  const channel = body.channel ?? 'EMAIL';
  const recipient = channel === 'EMAIL' ? opportunity.contactEmail : opportunity.contactPhone;
  if (!recipient) return reply.code(409).send({error:`No ${channel.toLowerCase()} contact is available for this opportunity`});
  const jurisdiction = (opportunity.evidence as any)?.jurisdiction;
  if (['INVOICE','SUBSCRIPTION'].includes(opportunity.source) && !jurisdiction) return reply.code(409).send({error:'Set the customer jurisdiction before drafting invoice or subscription recovery messages'});
  const prompt = `Write a short ${channel.toLowerCase()} follow-up in a ${body.tone ?? 'warm'} tone. Business: ${request.auth!.workspace.name}. Contact: ${opportunity.contactName ?? 'there'}. Opportunity: ${opportunity.title}. Source: ${opportunity.source}. Amount: ${(opportunity.estimatedCents/100).toFixed(2)} ${opportunity.currency}. Be respectful, factual, and ask one clear question. Do not threaten, imply collections, or claim that payment is due unless the opportunity evidence says so. Return only the message body.`;
  let generated = await runPrompt(prisma,opportunity.workspaceId,'recovery_message_draft',prompt);
  const fallback = `Hi ${opportunity.contactName?.split(' ')[0] ?? 'there'},\n\nI wanted to follow up on ${opportunity.title}. Would it help if I answered any questions or sent over the next step?\n\nBest,\n${request.auth!.workspace.name}`;
  let text = generated?.text ?? fallback;
  if (body.paymentUrl) text += `\n\nYou can review and pay securely here: ${body.paymentUrl}`;
  const emailFooter = channel === 'EMAIL' ? `\n\nYou received this service follow-up from ${request.auth!.workspace.name}. Reply with “unsubscribe” to stop these emails.\n${request.auth!.workspace.businessAddress ?? '[Business postal address must be added before sending]'}` : '\nReply STOP to opt out.';
  text += emailFooter;
  const subject = channel === 'EMAIL' ? `Following up: ${opportunity.title}` : undefined;
  const idempotencyKey = `draft:${opportunity.id}:${channel}:${hash(text).slice(0,20)}`;
  const message = await prisma.message.upsert({ where:{idempotencyKey}, create:{workspaceId:opportunity.workspaceId,opportunityId:opportunity.id,channel,recipient,subject,body:text,status:'PENDING_APPROVAL',paymentUrl:body.paymentUrl,idempotencyKey,payloadHash:jsonHash({recipient,text})}, update:{} });
  await prisma.recoveryOpportunity.update({where:{id:opportunity.id},data:{status:'AWAITING_APPROVAL'}});
  await audit(opportunity.workspaceId,'message.drafted','Message',message.id,{channel,recipientHash:hash(recipient),payloadHash:message.payloadHash,provider:generated?.provider ?? 'template'},request.auth!.userId,'HUMAN',jurisdiction);
  return reply.code(201).send({message,generatedBy:generated?.provider ?? 'template'});
});

app.post('/api/opportunities/:id/classify-call', { preHandler: auth }, async (request,reply) => {
  const { id } = request.params as {id:string};
  const { transcript } = request.body as {transcript?:string};
  if (!transcript?.trim()) return reply.code(400).send({error:'Call transcript is required'});
  const opportunity = await prisma.recoveryOpportunity.findFirst({where:{id,workspaceId:request.auth!.workspaceId}});
  if (!opportunity || opportunity.source !== 'MISSED_CALL') return reply.code(404).send({error:'Missed call opportunity not found'});
  const prompt = `Classify this inbound business call transcript as one label: interested, not_interested, paid, question, or other. Return only the label. Transcript: ${transcript.slice(0,8000)}`;
  const result = await runPrompt(prisma,opportunity.workspaceId,'missed_call_intent',prompt);
  const allowed = ['interested','not_interested','paid','question','other'];
  const intent = result?.text.toLowerCase().match(/interested|not_interested|paid|question|other/)?.[0] ?? classifyIntentRuleBased(transcript);
  const normalized = allowed.includes(intent) ? intent : 'other';
  await audit(opportunity.workspaceId,'call.intent.classified','RecoveryOpportunity',opportunity.id,{intent:normalized,provider:result?.provider ?? 'rules',transcriptHash:hash(transcript)},request.auth!.userId,'HUMAN', (opportunity.evidence as any)?.jurisdiction);
  return { intent:normalized, provider:result?.provider ?? 'rules', cached:result?.cached ?? false };
});

app.post('/api/opportunities/:id/action', { preHandler: auth }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const parsed = opportunityActionSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Invalid action' });
  const opportunity = await prisma.recoveryOpportunity.findFirst({ where: { id, workspaceId: request.auth!.workspaceId }, include: { entity: true } });
  if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' });
  const { action, note } = parsed.data;
  const collectionAdjacent = ['INVOICE', 'SUBSCRIPTION'].includes(opportunity.source);
  const jurisdiction = (opportunity.evidence as any)?.jurisdiction as string | undefined;
  if (collectionAdjacent && ['draft', 'approve', 'send', 'recover'].includes(action) && !jurisdiction) return reply.code(409).send({ error: 'Set the customer jurisdiction before taking invoice or subscription recovery actions' });
  if (['approve', 'dismiss', 'recover', 'send'].includes(action) && !['OWNER', 'ADMIN'].includes(request.auth!.role)) return reply.code(403).send({ error: 'Workspace owner or admin approval required' });
  let updated: any = opportunity;
  if (action === 'dismiss') updated = await prisma.recoveryOpportunity.update({ where: { id }, data: { status: 'DISMISSED' } });
  if (action === 'draft' || action === 'approve' || action === 'send') {
    const needsApproval = request.auth!.workspace.requireApproval || (collectionAdjacent && request.auth!.workspace.collectionsApproval);
    const status: OpportunityStatus = action === 'draft' ? (needsApproval ? 'AWAITING_APPROVAL' : 'DRAFTED') : action === 'approve' ? 'ACTIVE' : opportunity.status;
    updated = await prisma.recoveryOpportunity.update({ where: { id }, data: { status } });
  }
  if (action === 'recover') {
    if (!opportunity.paymentConfirmed) return reply.code(409).send({ error: 'Recovery requires confirmed payment' });
    updated = await prisma.recoveryOpportunity.update({ where: { id }, data: { status: 'RECOVERED', recoveredCents: opportunity.estimatedCents, recoveredAt: new Date() } });
    const feeCents = Math.round(opportunity.estimatedCents * request.auth!.workspace.successFeeBps / 10000);
    await prisma.usageRecord.upsert({ where: { idempotencyKey: `recovery:${id}` }, create: { workspaceId: opportunity.workspaceId, opportunityId: id, recoveredCents: opportunity.estimatedCents, feeCents, successFeeBps: request.auth!.workspace.successFeeBps, idempotencyKey: `recovery:${id}` }, update: {} });
  }
  await audit(opportunity.workspaceId, `opportunity.${action}`, 'RecoveryOpportunity', id, { action, note, source: opportunity.source, jurisdiction }, request.auth!.userId, 'HUMAN', jurisdiction);
  return updated;
});

app.post('/api/workflows/:id/run', { preHandler: [auth, admin] }, async (request, reply) => {
  const { id: workflowId } = request.params as { id: string };
  const { opportunityId } = request.body as { opportunityId?: string };
  if (!opportunityId) return reply.code(400).send({ error: 'An opportunity is required' });
  const [workflow, opportunity] = await Promise.all([
    prisma.workflow.findFirst({ where: { id: workflowId, workspaceId: request.auth!.workspaceId, status: 'ACTIVE' } }),
    prisma.recoveryOpportunity.findFirst({ where: { id: opportunityId, workspaceId: request.auth!.workspaceId } })
  ]);
  if (!workflow || !opportunity) return reply.code(404).send({ error: 'Workflow or opportunity not found' });
  const idempotencyKey = `workflow:${workflow.id}:${opportunity.id}`;
  const run = await prisma.workflowRun.upsert({ where: { idempotencyKey }, create: { workspaceId: opportunity.workspaceId, workflowId: workflow.id, opportunityId: opportunity.id, idempotencyKey }, update: {} });
  if (run.status === 'QUEUED') await recoverQueue.add('run-workflow', { workflowRunId: run.id }, { jobId: run.id, attempts: 5, backoff: { type: 'exponential', delay: 30000 } });
  await audit(opportunity.workspaceId, 'workflow.run.queued', 'WorkflowRun', run.id, { workflowId: workflow.id, opportunityId: opportunity.id }, request.auth!.userId, 'HUMAN');
  return reply.code(202).send(run);
});

app.post('/api/consents', { preHandler: [auth, admin] }, async (request, reply) => {
  const body = request.body as { subject?: string; channel?: 'EMAIL'|'SMS'|'VOICE'; status?: 'OPTED_IN'|'OPTED_OUT'; jurisdiction?: string; source?: string; disclosure?: string };
  if (!body.subject || !body.channel || !body.status) return reply.code(400).send({ error: 'Subject, channel and consent status are required' });
  const record = await prisma.consent.upsert({ where: { workspaceId_subject_channel: { workspaceId: request.auth!.workspaceId, subject: body.subject, channel: body.channel } }, create: { workspaceId: request.auth!.workspaceId, subject: body.subject, channel: body.channel, status: body.status, jurisdiction: body.jurisdiction, source: body.source ?? 'workspace_settings', disclosure: body.disclosure, consentedAt: body.status === 'OPTED_IN' ? new Date() : null, revokedAt: body.status === 'OPTED_OUT' ? new Date() : null }, update: { status: body.status, jurisdiction: body.jurisdiction, source: body.source ?? 'workspace_settings', disclosure: body.disclosure, consentedAt: body.status === 'OPTED_IN' ? new Date() : undefined, revokedAt: body.status === 'OPTED_OUT' ? new Date() : null } });
  await audit(request.auth!.workspaceId, `consent.${body.status.toLowerCase()}`, 'Consent', record.id, { channel: body.channel, recipientHash: hash(body.subject), jurisdiction: body.jurisdiction }, request.auth!.userId, 'HUMAN', body.jurisdiction);
  return reply.code(201).send(record);
});

app.post('/api/opportunities/:id/payment-link', { preHandler: [auth, admin] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const opportunity = await prisma.recoveryOpportunity.findFirst({ where: { id, workspaceId: request.auth!.workspaceId } });
  if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' });
  const key = `payment-link:${opportunity.id}`;
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey: key } });
  if (existing) return existing;
  try {
    let provider = 'demo';
    let link: { id: string; url: string };
    const stripeIntegration = await prisma.integration.findFirst({ where:{ workspaceId:opportunity.workspaceId, provider:'stripe', status:'CONNECTED', credentials:{ not:null } } });
    const btcpayIntegration = await prisma.integration.findFirst({ where:{ workspaceId:opportunity.workspaceId, provider:'btcpay', status:'CONNECTED', credentials:{ not:null } } });
    if (stripeIntegration?.credentials) {
      const credentials = await refreshOAuthCredentials('stripe', decryptCredentials<any>(stripeIntegration.credentials));
      if (JSON.stringify(credentials) !== JSON.stringify(decryptCredentials<any>(stripeIntegration.credentials))) await prisma.integration.update({ where:{id:stripeIntegration.id}, data:{credentials:encryptCredentials(credentials)} });
      if (!credentials.access_token) return reply.code(409).send({ error:'The connected Stripe integration needs to be reauthorized' });
      provider = 'stripe'; link = await new StripePaymentAdapter(credentials.access_token).createPaymentLink({ amountCents: opportunity.estimatedCents, currency: opportunity.currency, description: `Payment for ${opportunity.title}`, idempotencyKey: key });
    }
    else if (btcpayIntegration?.credentials) {
      const credentials = decryptCredentials<any>(btcpayIntegration.credentials);
      if (!credentials.url || !credentials.storeId || !credentials.apiKey) return reply.code(409).send({ error:'The connected BTCPay integration is incomplete' });
      provider = 'btcpay'; link = await new BTCPayPaymentAdapter(credentials.url, credentials.storeId, credentials.apiKey).createPaymentLink({ amountCents: opportunity.estimatedCents, currency: opportunity.currency, description: `Payment for ${opportunity.title}`, idempotencyKey: key });
    }
    else if (request.auth!.workspace.demoMode) { link = { id: key, url: `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/pay/demo-${opportunity.id}` }; }
    else return reply.code(503).send({ error: 'Connect Stripe or BTCPay to create a payment link' });
    const payment = await prisma.payment.create({ data: { workspaceId: opportunity.workspaceId, opportunityId: opportunity.id, provider, externalId: link.id, url: link.url, amountCents: opportunity.estimatedCents, currency: opportunity.currency, idempotencyKey: key } });
    await audit(opportunity.workspaceId, 'payment_link.created', 'Payment', payment.id, { provider, amountCents: payment.amountCents }, request.auth!.userId, 'HUMAN');
    return payment;
  } catch (error) { app.log.error({ error }, 'payment link creation failed'); return reply.code(502).send({ error: 'Payment provider could not create the link' }); }
});

app.post('/api/opportunities/:id/send', { preHandler: auth }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { channel?: 'EMAIL'|'SMS'|'VOICE'; recipient?: string; subject?: string; text?: string; paymentUrl?: string };
  if (!body.channel || !body.recipient || !body.text) return reply.code(400).send({ error: 'Channel, recipient, and message text are required' });
  const opportunity = await prisma.recoveryOpportunity.findFirst({ where: { id, workspaceId: request.auth!.workspaceId } });
  if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' });
  const channel = body.channel as Channel;
  if (['INVOICE', 'SUBSCRIPTION'].includes(opportunity.source) && !(opportunity.evidence as any)?.jurisdiction) return reply.code(409).send({ error:'Set the customer jurisdiction before sending invoice or subscription recovery messages' });
  if (channel === 'EMAIL' && !request.auth!.workspace.businessAddress) return reply.code(409).send({ error:'Add a valid business postal address in workspace settings before sending email' });
  const consentChannel = body.channel as ConsentChannel;
  const consent = await prisma.consent.findUnique({ where: { workspaceId_subject_channel: { workspaceId: opportunity.workspaceId, subject: body.recipient, channel: consentChannel } } });
  if (consent?.status !== ConsentStatus.OPTED_IN) return reply.code(403).send({ error: `Verified ${body.channel.toLowerCase()} consent is required before sending` });
  const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: request.auth!.workspace.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  const [hour, minute] = localTime.split(':').map(Number); const current = hour * 60 + minute;
  const toMinutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  const start = toMinutes(request.auth!.workspace.quietHoursStart), end = toMinutes(request.auth!.workspace.quietHoursEnd);
  const quiet = start < end ? current >= start && current < end : current >= start || current < end;
  if (quiet && channel !== 'EMAIL') return reply.code(403).send({ error: 'Quiet hours are active for this workspace' });
  const bodyText = `${body.text}${body.paymentUrl ? `\n\nPay securely: ${body.paymentUrl}` : ''}${channel === 'EMAIL' ? `\n\nYou received this service follow-up from ${request.auth!.workspace.name}. Reply with “unsubscribe” to stop these emails.\n${request.auth!.workspace.businessAddress}` : '\nReply STOP to opt out.'}`;
  const idempotencyKey = `message:${id}:${channel}:${hash(body.recipient + bodyText).slice(0, 16)}`;
  const prior = await prisma.message.findUnique({ where: { idempotencyKey } }); if (prior) return prior;
  const msg = await prisma.message.create({ data: { workspaceId: opportunity.workspaceId, opportunityId: id, channel, recipient: body.recipient, subject: body.subject, body: bodyText, status: 'PENDING_APPROVAL', paymentUrl: body.paymentUrl, idempotencyKey, payloadHash: jsonHash({ to: body.recipient, bodyText }) } });
  await audit(opportunity.workspaceId, 'message.drafted', 'Message', msg.id, { channel, recipientHash: hash(body.recipient), payloadHash: msg.payloadHash }, request.auth!.userId, 'HUMAN', (opportunity.evidence as any)?.jurisdiction);
  return reply.code(202).send(msg);
});

app.post('/api/messages/:id/approve-send', { preHandler: [auth, admin] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const msg = await prisma.message.findFirst({ where: { id, workspaceId: request.auth!.workspaceId, status: 'PENDING_APPROVAL' }, include:{ opportunity:true, workflowRun:{include:{workflow:true}} } });
  if (!msg) return reply.code(404).send({ error: 'Pending message not found' });
  const consentChannel = msg.channel as ConsentChannel;
  const consent = await prisma.consent.findUnique({ where: { workspaceId_subject_channel: { workspaceId: msg.workspaceId, subject: msg.recipient, channel: consentChannel } } });
  if (consent?.status !== 'OPTED_IN') return reply.code(403).send({ error: 'Consent was withdrawn or is not recorded' });
  if (msg.channel === 'EMAIL' && !request.auth!.workspace.businessAddress) return reply.code(409).send({ error:'Add a valid business postal address in workspace settings before sending email' });
  const jurisdiction = (msg.opportunity.evidence as any)?.jurisdiction as string | undefined;
  if (['INVOICE','SUBSCRIPTION'].includes(msg.opportunity.source) && !jurisdiction) return reply.code(409).send({error:'Set the customer jurisdiction before sending invoice or subscription recovery messages'});
  const sentInLastHour = await prisma.message.count({ where:{ workspaceId:msg.workspaceId, channel:msg.channel, recipient:msg.recipient, status:{in:['SENT','DELIVERED']}, sentAt:{gte:new Date(Date.now()-60*60*1000)} } });
  if (sentInLastHour >= (msg.channel === 'EMAIL' ? 5 : 2)) return reply.code(429).send({ error:'Recipient message rate limit reached; retry later' });
  try {
    let providerId = ''; let provider = '';
    const currentLocalTime = new Intl.DateTimeFormat('en-GB', { timeZone: request.auth!.workspace.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const [sendHour, sendMinute] = currentLocalTime.split(':').map(Number); const sendNow = sendHour * 60 + sendMinute;
    const parseMinutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
    const quietStart = parseMinutes(request.auth!.workspace.quietHoursStart), quietEnd = parseMinutes(request.auth!.workspace.quietHoursEnd);
    const inQuietHours = quietStart < quietEnd ? sendNow >= quietStart && sendNow < quietEnd : sendNow >= quietStart || sendNow < quietEnd;
    if (msg.channel !== 'EMAIL' && inQuietHours) return reply.code(403).send({ error: 'Quiet hours are active for this workspace' });
    if (msg.channel === 'EMAIL') {
      const emailIntegration = await prisma.integration.findFirst({ where:{workspaceId:msg.workspaceId,category:'EMAIL',status:'CONNECTED',credentials:{not:null}} });
      if (emailIntegration?.credentials) {
        let credentials = decryptCredentials<any>(emailIntegration.credentials);
        if (emailIntegration.provider === 'google' || emailIntegration.provider === 'microsoft') {
          credentials = await refreshOAuthCredentials(emailIntegration.provider as 'google'|'microsoft',credentials);
          await prisma.integration.update({where:{id:emailIntegration.id},data:{credentials:encryptCredentials(credentials)}});
        }
        const adapter = emailIntegration.provider === 'google' ? new GmailAdapter(credentials.access_token) : emailIntegration.provider === 'microsoft' ? new OutlookAdapter(credentials.access_token) : null;
        if (adapter) { const response = await adapter.send({to:msg.recipient,subject:msg.subject ?? undefined,body:msg.body,idempotencyKey:msg.idempotencyKey}); providerId=response.id; provider=adapter.provider; }
        else if (emailIntegration.provider === 'smtp') {
          const { SmtpEmailAdapter } = await import('@recover/integrations');
          const response = await new SmtpEmailAdapter({host:String(credentials.host),port:Number(credentials.port??587),user:credentials.user,password:credentials.password,from:String(credentials.from??request.auth!.workspace.name)}).send({to:msg.recipient,subject:msg.subject ?? undefined,body:msg.body,idempotencyKey:msg.idempotencyKey}); providerId=response.id; provider='smtp';
        }
      }
      if (!provider && request.auth!.workspace.demoMode && process.env.SMTP_HOST) {
        const { SmtpEmailAdapter } = await import('@recover/integrations');
        const response = await new SmtpEmailAdapter({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD, from: process.env.SMTP_FROM ?? 'RECOVER' }).send({ to: msg.recipient, subject: msg.subject ?? undefined, body: msg.body, idempotencyKey: msg.idempotencyKey }); providerId = response.id; provider = 'smtp';
      }
    } else if (msg.channel === 'SMS' || msg.channel === 'VOICE') {
      const integration = await prisma.integration.findFirst({where:{workspaceId:msg.workspaceId,provider:'twilio',status:'CONNECTED',credentials:{not:null}}});
      const credentials = integration?.credentials ? decryptCredentials<any>(integration.credentials) : request.auth!.workspace.demoMode ? {accountSid:process.env.TWILIO_ACCOUNT_SID,authToken:process.env.TWILIO_AUTH_TOKEN,fromNumber:process.env.TWILIO_FROM_NUMBER} : {};
      if (!credentials.accountSid || !credentials.authToken || !credentials.fromNumber) return reply.code(503).send({error:'Connect a Twilio integration for this workspace'});
      const adapter = new TwilioSmsAdapter(credentials.accountSid,credentials.authToken,credentials.fromNumber);
      if (msg.channel === 'SMS') { const response = await adapter.send({to:msg.recipient,body:msg.body,idempotencyKey:msg.idempotencyKey}); providerId=response.id; provider='twilio'; }
      else {
      const escaped = msg.body.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[char] ?? char));
      const twiml = `<Response><Say>${escaped}</Say></Response>`;
      const response = await adapter.call({ to: msg.recipient, twiml, callbackUrl: `${process.env.PUBLIC_URL}/api/webhooks/twilio/voice-status` }); providerId = response.id; provider = 'twilio';
      }
    }
    if (!provider) return reply.code(503).send({ error: 'The selected outbound provider is not configured' });
    const updated = await prisma.message.update({ where: { id: msg.id }, data: { status: 'SENT', provider, providerId, sentAt: new Date() } });
    if (msg.workflowRun) {
      const steps = msg.workflowRun.workflow.steps as Array<{channel:string;waitMinutes?:number}>;
      const transition = nextWorkflowStep(steps,msg.workflowRun.currentStep);
      const nextStep = transition.nextIndex;
      if (transition.completed) await prisma.workflowRun.update({where:{id:msg.workflowRun.id},data:{status:'COMPLETED',currentStep:nextStep}});
      else {
        const nextRunAt = new Date(Date.now() + transition.waitMinutes * 60000);
        await prisma.workflowRun.update({where:{id:msg.workflowRun.id},data:{status:'QUEUED',currentStep:nextStep,nextRunAt}});
        await recoverQueue.add('run-workflow',{workflowRunId:msg.workflowRun.id},{jobId:`${msg.workflowRun.id}:${nextStep}`,delay:Math.max(0,nextRunAt.getTime()-Date.now()),attempts:5,backoff:{type:'exponential',delay:30000}});
      }
    }
    await audit(msg.workspaceId, 'message.sent', 'Message', msg.id, { provider, providerId, payloadHash: msg.payloadHash }, request.auth!.userId, 'HUMAN', jurisdiction); return updated;
  } catch (error) { app.log.error({ error }, 'message delivery failed'); return reply.code(502).send({ error: 'Message delivery failed' }); }
});

const settlePayment = async (paymentId: string, actorId?: string, actorType = 'SYSTEM') => {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { opportunity: true, workspace: true } });
  if (!payment) throw new Error('Payment record not found');
  const wasAlreadyPaid = payment.status === 'PAID';
  const confirmedAt = payment.confirmedAt ?? new Date();
  if (!wasAlreadyPaid) {
    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: 'PAID', confirmedAt } }),
      prisma.recoveryOpportunity.update({ where: { id: payment.opportunityId }, data: { status: 'RECOVERED', paymentConfirmed: true, recoveredCents: payment.amountCents, recoveredAt: confirmedAt } })
    ]);
  }
  const feeCents = Math.round(payment.amountCents * payment.workspace.successFeeBps / 10000);
  const usage = await prisma.usageRecord.upsert({ where: { idempotencyKey: `recovery:${payment.opportunityId}` }, create: { workspaceId: payment.workspaceId, opportunityId: payment.opportunityId, recoveredCents: payment.amountCents, feeCents, successFeeBps: payment.workspace.successFeeBps, idempotencyKey: `recovery:${payment.opportunityId}` }, update: {} });
  let meterEventId: string | undefined;
  if (process.env.STRIPE_SECRET_KEY && payment.workspace.stripeCustomerId && !usage.stripeUsageRecordId) {
    const response = await fetch('https://api.stripe.com/v1/billing/meter_events', { method: 'POST', headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': usage.idempotencyKey }, body: new URLSearchParams({ event_name: process.env.STRIPE_METER_EVENT_NAME ?? 'recover_revenue_fee_cents', identifier: usage.idempotencyKey, 'payload[stripe_customer_id]': payment.workspace.stripeCustomerId, 'payload[value]': String(feeCents) }) });
    if (!response.ok) throw new Error(`Stripe usage metering failed (${response.status})`);
    const meter = await response.json() as { id?: string }; meterEventId = meter.id;
    if (meterEventId) await prisma.usageRecord.update({ where: { id: usage.id }, data: { stripeUsageRecordId: meterEventId } });
  }
  if (!wasAlreadyPaid) await audit(payment.workspaceId, 'payment.confirmed', 'Payment', payment.id, { amountCents: payment.amountCents, currency: payment.currency, provider: payment.provider, meterEventId }, actorId, actorType);
  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
};

app.post('/api/opportunities/:id/confirm-demo-payment', { preHandler: [auth, admin] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const opportunity = await prisma.recoveryOpportunity.findFirst({ where: { id, workspaceId: request.auth!.workspaceId }, include: { workspace: true } });
  if (!opportunity) return reply.code(404).send({ error: 'Opportunity not found' });
  if (!opportunity.workspace.demoMode) return reply.code(403).send({ error: 'Demo payments are only available in the sandbox workspace' });
  const payment = await prisma.payment.findUnique({ where: { idempotencyKey: `payment-link:${id}` } });
  if (!payment || payment.provider !== 'demo') return reply.code(409).send({ error: 'Create a demo payment link first' });
  return settlePayment(payment.id, request.auth!.userId, 'HUMAN');
});

app.post('/api/webhooks/stripe', { config: { rawBody: true } }, async (request, reply) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) return reply.code(503).send({ error: 'Stripe webhook is not configured' });
  const signature = request.headers['stripe-signature'];
  if (!signature || Array.isArray(signature)) return reply.code(400).send({ error: 'Missing Stripe signature' });
  let event: Stripe.Event;
  try { event = new Stripe(process.env.STRIPE_SECRET_KEY).webhooks.constructEvent((request as any).rawBody as Buffer, signature, process.env.STRIPE_WEBHOOK_SECRET); }
  catch (error) { app.log.warn({ error }, 'invalid Stripe webhook signature'); return reply.code(400).send({ error: 'Invalid webhook signature' }); }
  if (await prisma.webhookEvent.findUnique({ where: { provider_externalId: { provider: 'stripe', externalId: event.id } } })) return { received: true, duplicate: true };
  try {
    const object = event.data.object as any;
    if (event.type === 'checkout.session.completed' && object.mode === 'subscription' && object.metadata?.workspaceId && object.customer) {
      await prisma.workspace.updateMany({ where:{id:String(object.metadata.workspaceId)},data:{stripeCustomerId:String(object.customer),stripeSubscriptionId:object.subscription ? String(object.subscription) : null} });
    } else if (event.type === 'checkout.session.completed' && object.payment_link) {
      const payment = await prisma.payment.findFirst({ where: { provider: 'stripe', externalId: object.payment_link } });
      if (payment) await settlePayment(payment.id);
    } else if (event.type === 'payment_intent.succeeded') {
      const opportunityId = object.metadata?.recovery_opportunity_id;
      if (opportunityId) { const payment = await prisma.payment.findUnique({ where: { idempotencyKey: `payment-link:${opportunityId}` } }); if (payment) await settlePayment(payment.id); }
    } else if (event.type === 'invoice.paid') {
      const workspace = await prisma.workspace.findUnique({ where: { stripeCustomerId: String(object.customer) } });
      if (workspace) await prisma.invoice.upsert({ where: { workspaceId_provider_externalId: { workspaceId: workspace.id, provider: 'stripe', externalId: String(object.id) } }, create: { workspaceId: workspace.id, provider: 'stripe', externalId: String(object.id), status: 'paid', amountCents: Number(object.amount_paid ?? 0), currency: String(object.currency ?? 'usd').toUpperCase(), paidAt: new Date(Number(object.status_transitions?.paid_at ?? Date.now() / 1000) * 1000), payload: { eventId: event.id } }, update: { status: 'paid', amountCents: Number(object.amount_paid ?? 0), paidAt: new Date() } });
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const workspace = await prisma.workspace.findUnique({ where: { stripeCustomerId: String(object.customer) } });
      if (workspace) {
        const priceId = object.items?.data?.[0]?.price?.id;
        const matchedPlan = (['STARTER','GROWTH','SCALE'] as const).find(plan=>process.env[`STRIPE_PRICE_${plan}`]===priceId);
        await prisma.workspace.update({ where: { id: workspace.id }, data: { stripeSubscriptionId: event.type.endsWith('.deleted') ? null : String(object.id), ...(event.type.endsWith('.deleted')?{}:matchedPlan?{basePlan:matchedPlan}:{}) } });
      }
    }
    await prisma.webhookEvent.create({ data: { provider: 'stripe', externalId: event.id, payloadHash: jsonHash(event) } });
    return { received: true };
  } catch (error) { app.log.error({ error, eventId: event.id }, 'Stripe webhook processing failed'); return reply.code(500).send({ error: 'Webhook processing failed' }); }
});

const validTwilioRequest = async (request: any) => {
  const signature = request.headers['x-twilio-signature']; if (!signature || Array.isArray(signature)) return false;
  const url = `${request.protocol}://${request.hostname}${request.raw.url}`;
  const body = request.body as Record<string,string>;
  const integrations = await prisma.integration.findMany({ where:{provider:'twilio',status:'CONNECTED',credentials:{not:null}} });
  for (const integration of integrations) {
    if (body.AccountSid && integration.externalId && body.AccountSid !== integration.externalId) continue;
    if (body.To && (integration.settings as any)?.phoneNumber && body.To !== (integration.settings as any).phoneNumber) continue;
    try { const credentials = decryptCredentials<any>(integration.credentials!); if (credentials.authToken && twilio.validateRequest(credentials.authToken,signature,url,body)) return true; } catch { /* invalid or rotated credential */ }
  }
  return process.env.NODE_ENV !== 'production' && Boolean(process.env.TWILIO_AUTH_TOKEN && twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN,signature,url,body));
};
const safeSecretEqual = (left:string, right:string) => { const a=Buffer.from(left); const b=Buffer.from(right); return a.length===b.length && timingSafeEqual(a,b); };

app.post('/api/webhooks/btcpay', { config:{rawBody:true} }, async (request,reply) => {
  const secret = process.env.BTCPAY_WEBHOOK_SECRET;
  if (!secret) return reply.code(503).send({error:'BTCPay webhook is not configured'});
  const supplied = request.headers['btcpay-sig'];
  if (!supplied || Array.isArray(supplied)) return reply.code(400).send({error:'Missing BTCPay signature'});
  const raw = (request as any).rawBody as Buffer;
  const expected = createHmac('sha256',secret).update(raw).digest('hex');
  if (!safeSecretEqual(supplied.replace(/^sha256=/,''),expected)) return reply.code(403).send({error:'Invalid BTCPay signature'});
  const event = request.body as any;
  const invoiceId = String(event.invoiceId ?? event.data?.id ?? '');
  const orderId = String(event.metadata?.orderId ?? event.data?.metadata?.orderId ?? '');
  const eventId = String(event.deliveryId ?? event.id ?? `${invoiceId}:${event.type}`);
  if (await prisma.webhookEvent.findUnique({where:{provider_externalId:{provider:'btcpay',externalId:eventId}}})) return {received:true,duplicate:true};
  try {
    if (['InvoiceSettled','InvoicePaymentSettled'].includes(String(event.type))) {
      const payment = invoiceId ? await prisma.payment.findFirst({where:{provider:'btcpay',externalId:invoiceId}}) : null;
      const keyed = !payment && orderId ? await prisma.payment.findUnique({where:{idempotencyKey:orderId}}) : null;
      const settled = payment ?? keyed; if (settled) await settlePayment(settled.id);
    }
    await prisma.webhookEvent.create({data:{provider:'btcpay',externalId:eventId,payloadHash:jsonHash(event)}});
    return {received:true};
  } catch(error) { app.log.error({error,eventId},'BTCPay webhook failed'); return reply.code(500).send({error:'Webhook processing failed'}); }
});

app.post('/api/webhooks/email/inbound', async (request,reply) => {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) return reply.code(503).send({error:'Email inbound webhook is not configured'});
  const supplied = request.headers['x-recover-webhook-secret'];
  if (typeof supplied !== 'string' || !safeSecretEqual(supplied,secret)) return reply.code(403).send({error:'Invalid webhook secret'});
  const body = request.body as {from?:string;subject?:string;text?:string;messageId?:string};
  const rawFrom = body.from ?? ''; const sender = rawFrom.match(/<([^>]+)>/)?.[1] ?? rawFrom.trim();
  const text = body.text ?? ''; const eventId = body.messageId ?? hash(`${sender}:${body.subject}:${text}`);
  if (!sender) return reply.code(400).send({error:'Sender is required'});
  if (await prisma.webhookEvent.findUnique({where:{provider_externalId:{provider:'email-inbound',externalId:eventId}}})) return {received:true,duplicate:true};
  const messages = await prisma.message.findMany({where:{channel:'EMAIL',recipient:sender},select:{workspaceId:true},distinct:['workspaceId']});
  const normalized = text.trim().toLowerCase();
  const optedOut = /^(unsubscribe|stop|remove me|opt out)\b/.test(normalized);
  for (const {workspaceId} of messages) {
    if (optedOut) {
      const consent = await prisma.consent.upsert({where:{workspaceId_subject_channel:{workspaceId,subject:sender,channel:'EMAIL'}},create:{workspaceId,subject:sender,channel:'EMAIL',status:'OPTED_OUT',source:'inbound_email',revokedAt:new Date()},update:{status:'OPTED_OUT',source:'inbound_email',revokedAt:new Date()}});
      await audit(workspaceId,'consent.opted_out','Consent',consent.id,{channel:'EMAIL',recipientHash:hash(sender)},undefined,'SYSTEM');
    } else {
      let replyClass = classifyIntentRuleBased(text);
      const ai = await runPrompt(prisma,workspaceId,'email_reply_intent',`Classify this customer email reply as interested, not_interested, paid, question, or other. Return only the label. Reply: ${text.slice(0,4000)}`).catch(()=>null);
      const aiLabel = ai?.text.toLowerCase().match(/interested|not_interested|paid|question|other/)?.[0]; if (aiLabel) replyClass=aiLabel;
      const message = await prisma.message.findFirst({where:{workspaceId,channel:'EMAIL',recipient:sender,status:{in:['SENT','DELIVERED']}},orderBy:{sentAt:'desc'}});
      if (message) { await prisma.message.update({where:{id:message.id},data:{status:'REPLIED',replyClass}}); await audit(workspaceId,'message.replied','Message',message.id,{replyClass,replyHash:hash(text)},undefined,'SYSTEM'); }
    }
  }
  await prisma.webhookEvent.create({data:{provider:'email-inbound',externalId:eventId,payloadHash:jsonHash({senderHash:hash(sender),textHash:hash(text)})}}).catch(()=>undefined);
  return {received:true};
});

app.post('/api/webhooks/twilio/sms', async (request, reply) => {
  if (!await validTwilioRequest(request)) return reply.code(403).send({ error: 'Invalid Twilio signature' });
  const body = request.body as Record<string, string>;
  const messageSid = body.MessageSid;
  if (messageSid && await prisma.webhookEvent.findUnique({where:{provider_externalId:{provider:'twilio-sms',externalId:messageSid}}})) return reply.code(204).send();
  const sender = body.From; const text = (body.Body ?? '').trim().toUpperCase();
  if (!sender) return reply.code(204).send();
  const normalizedText = text.replace(/[.!?\s]+$/g, '');
  const related = await prisma.message.findMany({ where: { channel: 'SMS', recipient: sender }, select: { workspaceId: true }, distinct: ['workspaceId'] });
  const targetIntegrations = await prisma.integration.findMany({ where:{provider:'twilio',status:'CONNECTED'} });
  const affectedWorkspaces = new Set([...related.map(x=>x.workspaceId),...targetIntegrations.filter(x=>(x.settings as any)?.phoneNumber===body.To).map(x=>x.workspaceId)]);
  if (['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(normalizedText)) {
    for (const workspaceId of affectedWorkspaces) {
      const consent = await prisma.consent.upsert({ where: { workspaceId_subject_channel: { workspaceId, subject: sender, channel: 'SMS' } }, create: { workspaceId, subject: sender, channel: 'SMS', status: 'OPTED_OUT', source: 'inbound_keyword', revokedAt: new Date() }, update: { status: 'OPTED_OUT', revokedAt: new Date(), source: 'inbound_keyword' } });
      await audit(workspaceId, 'consent.opted_out', 'Consent', consent.id, { channel: 'SMS', recipientHash: hash(sender), keyword: normalizedText }, undefined, 'SYSTEM');
    }
  } else if (related.length) {
    let replyClass = classifyIntentRuleBased(text);
    const ai = await runPrompt(prisma,related[0].workspaceId,'sms_reply_intent',`Classify this customer reply as interested, not_interested, paid, question, or other. Return only the label. Reply: ${text.slice(0,2000)}`).catch(()=>null);
    const aiLabel = ai?.text.toLowerCase().match(/interested|not_interested|paid|question|other/)?.[0];
    if (aiLabel && ['interested','not_interested','paid','question','other'].includes(aiLabel)) replyClass = aiLabel;
    const message = await prisma.message.findFirst({ where: { workspaceId: related[0].workspaceId, channel: 'SMS', recipient: sender, status: { in: ['SENT', 'DELIVERED'] } }, orderBy: { sentAt: 'desc' } });
    if (message) { await prisma.message.update({ where: { id: message.id }, data: { status: 'REPLIED', replyClass } }); await audit(message.workspaceId, 'message.replied', 'Message', message.id, { replyClass, replyHash: hash(text) }, undefined, 'SYSTEM'); }
  }
  if (messageSid) await prisma.webhookEvent.create({data:{provider:'twilio-sms',externalId:messageSid,payloadHash:jsonHash({from:sender,body:text})}}).catch(()=>undefined);
  return reply.code(204).send();
});

app.post('/api/webhooks/twilio/voice', async (request, reply) => {
  if (!await validTwilioRequest(request)) return reply.code(403).send({ error: 'Invalid Twilio signature' });
  const body = request.body as Record<string, string>;
  if (body.Direction !== 'inbound' || !['no-answer', 'busy', 'failed'].includes((body.CallStatus ?? '').toLowerCase())) return reply.code(204).send();
  if (body.CallSid && await prisma.webhookEvent.findUnique({where:{provider_externalId:{provider:'twilio-voice',externalId:`${body.CallSid}:${body.CallStatus}`}}})) return reply.code(204).send();
  const integrations = await prisma.integration.findMany({ where: { provider: 'twilio', status: 'CONNECTED' } });
  const integration = integrations.find(x => (x.settings as any)?.phoneNumber === body.To);
  if (!integration || !body.CallSid) return reply.code(204).send();
  const defaultCents = Number((integration.settings as any)?.defaultCallValueCents ?? 50000);
  const entity = await prisma.entity.upsert({ where: { workspaceId_provider_entityType_externalId: { workspaceId: integration.workspaceId, provider: 'twilio', entityType: 'missed_call', externalId: body.CallSid } }, create: { workspaceId: integration.workspaceId, provider: 'twilio', entityType: 'missed_call', externalId: body.CallSid, displayName: body.From, phone: body.From, valueCents: defaultCents, currency: 'USD', status: 'missed', lastActivityAt: new Date(), metadata: { callbackWithinHours: 4, jurisdiction: (integration.settings as any)?.jurisdiction ?? 'unknown', to: body.To } }, update: { status: 'missed', lastActivityAt: new Date() } });
  await audit(integration.workspaceId, 'phone.missed_call.detected', 'Entity', entity.id, { callSid: body.CallSid, recipientHash: hash(body.From ?? ''), jurisdiction: (integration.settings as any)?.jurisdiction }, undefined, 'SYSTEM', (integration.settings as any)?.jurisdiction);
  await prisma.webhookEvent.create({data:{provider:'twilio-voice',externalId:`${body.CallSid}:${body.CallStatus}`,payloadHash:jsonHash({status:body.CallStatus,callSid:body.CallSid})}}).catch(()=>undefined);
  return reply.code(204).send();
});

app.post('/api/webhooks/twilio/voice-status', async (request, reply) => {
  if (!await validTwilioRequest(request)) return reply.code(403).send({ error: 'Invalid Twilio signature' });
  const body = request.body as Record<string, string>;
  const message = body.CallSid ? await prisma.message.findFirst({ where: { providerId: body.CallSid, channel: 'VOICE' } }) : null;
  if (message) await prisma.message.update({ where: { id: message.id }, data: { status: body.CallStatus === 'completed' ? 'DELIVERED' : body.CallStatus === 'failed' ? 'FAILED' : message.status, deliveredAt: body.CallStatus === 'completed' ? new Date() : undefined } });
  return reply.code(204).send();
});

app.get('/api/integrations', { preHandler: auth }, async (request) => prisma.integration.findMany({ where: { workspaceId: request.auth!.workspaceId }, select: { id: true, category: true, provider: true, displayName: true, status: true, lastSyncAt: true, lastError: true, createdAt: true } }));
app.post('/api/integrations', { preHandler: [auth, admin] }, async (request, reply) => {
  const body = request.body as { provider?: string; category?: string; displayName?: string; externalId?: string };
  if (!body.provider || !body.category || !body.displayName) return reply.code(400).send({ error: 'Provider, category, and display name are required' });
  const existing = await prisma.integration.findFirst({ where:{ workspaceId:request.auth!.workspaceId, provider:body.provider.toLowerCase(), displayName:body.displayName } });
  if (existing) return { id:existing.id, category:existing.category, provider:existing.provider, displayName:existing.displayName, status:existing.status };
  const integration = await prisma.integration.create({ data: { workspaceId: request.auth!.workspaceId, provider: body.provider.toLowerCase(), category: body.category.toUpperCase() as any, displayName: body.displayName, externalId: body.externalId, status: 'NEEDS_AUTH' } });
  await audit(request.auth!.workspaceId, 'integration.created', 'Integration', integration.id, { provider: integration.provider }, request.auth!.userId, 'HUMAN'); return reply.code(201).send(integration);
});

const oauthProviders: OAuthProvider[] = ['hubspot', 'salesforce', 'pipedrive', 'google', 'microsoft', 'shopify', 'quickbooks', 'xero', 'stripe'];
const oauthCategory: Record<OAuthProvider, 'CRM'|'EMAIL'|'ECOMMERCE'|'INVOICING'|'PAYMENTS'> = { hubspot:'CRM', salesforce:'CRM', pipedrive:'CRM', google:'EMAIL', microsoft:'EMAIL', shopify:'ECOMMERCE', quickbooks:'INVOICING', xero:'INVOICING', stripe:'PAYMENTS' };
const oauthEnv: Record<OAuthProvider, [string, string]> = { hubspot:['HUBSPOT_CLIENT_ID','HUBSPOT_CLIENT_SECRET'], salesforce:['SALESFORCE_CLIENT_ID','SALESFORCE_CLIENT_SECRET'], pipedrive:['PIPEDRIVE_CLIENT_ID','PIPEDRIVE_CLIENT_SECRET'], google:['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'], microsoft:['MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET'], shopify:['SHOPIFY_API_KEY','SHOPIFY_API_SECRET'], quickbooks:['QUICKBOOKS_CLIENT_ID','QUICKBOOKS_CLIENT_SECRET'], xero:['XERO_CLIENT_ID','XERO_CLIENT_SECRET'], stripe:['STRIPE_CONNECT_CLIENT_ID','STRIPE_SECRET_KEY'] };
const callbackUri = () => `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/api/integrations/oauth/callback`;

app.get('/api/integrations/:provider/oauth/start', { preHandler: [auth, admin] }, async (request, reply) => {
  const { provider: rawProvider } = request.params as { provider: string };
  if (!oauthProviders.includes(rawProvider as OAuthProvider)) return reply.code(404).send({ error: 'OAuth provider is not supported' });
  const provider = rawProvider as OAuthProvider;
  const [clientIdEnv, secretEnv] = oauthEnv[provider];
  if (!process.env[clientIdEnv] || !process.env[secretEnv]) return reply.code(503).send({ error: `${provider} OAuth credentials are not configured on this deployment` });
  const query = request.query as { shop?: string };
  let shop: string | undefined;
  if (provider === 'shopify') {
    if (!query.shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(query.shop)) return reply.code(400).send({ error: 'Provide a valid Shopify shop domain, for example store.myshopify.com' });
    shop = query.shop.toLowerCase();
  }
  const state = randomBytes(32).toString('base64url');
  await prisma.oAuthState.create({ data: { workspaceId: request.auth!.workspaceId, provider, stateHash: hash(state), expiresAt: new Date(Date.now() + 10 * 60 * 1000), details: { shop } } });
  return reply.redirect(oauthAuthorizeUrl(provider, state, callbackUri(), shop));
});

app.get('/api/integrations/oauth/callback', async (request, reply) => {
  const query = request.query as { state?: string; code?: string; error?: string; realmId?: string };
  const fail = (reason: string) => reply.redirect(`${process.env.PUBLIC_URL ?? ''}/app/integrations?oauth_error=${encodeURIComponent(reason)}`);
  if (!query.state || !query.code || query.error) return fail(query.error ?? 'missing_code');
  const oauthState = await prisma.oAuthState.findUnique({ where: { stateHash: hash(query.state) } });
  if (!oauthState || oauthState.expiresAt < new Date()) return fail('invalid_or_expired_state');
  await prisma.oAuthState.delete({ where: { id: oauthState.id } });
  const provider = oauthState.provider as OAuthProvider;
  if (!oauthProviders.includes(provider)) return fail('unsupported_provider');
  const [clientIdEnv, secretEnv] = oauthEnv[provider]; const clientId = process.env[clientIdEnv]!, clientSecret = process.env[secretEnv]!;
  const shop = (oauthState.details as any)?.shop as string | undefined;
  const tokenEndpoints: Partial<Record<OAuthProvider, string>> = { hubspot:'https://api.hubapi.com/oauth/v1/token', salesforce:'https://login.salesforce.com/services/oauth2/token', pipedrive:'https://oauth.pipedrive.com/oauth/token', google:'https://oauth2.googleapis.com/token', microsoft:'https://login.microsoftonline.com/common/oauth2/v2.0/token', quickbooks:'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', xero:'https://identity.xero.com/connect/token', stripe:'https://connect.stripe.com/oauth/token' };
  try {
    let response: Response;
    if (provider === 'shopify') {
      response = await fetch(`https://${shop}/admin/oauth/access_token`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ client_id:clientId, client_secret:clientSecret, code:query.code }) });
    } else {
      const form = new URLSearchParams({ grant_type:'authorization_code', code:query.code, redirect_uri:callbackUri() });
      if (provider === 'pipedrive' || provider === 'quickbooks' || provider === 'xero' || provider === 'stripe') form.set('client_id', clientId);
      else { form.set('client_id', clientId); form.set('client_secret', clientSecret); }
      const headers: Record<string,string> = { 'Content-Type':'application/x-www-form-urlencoded' };
      if (['pipedrive','quickbooks','xero','stripe'].includes(provider)) headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
      response = await fetch(tokenEndpoints[provider]!, { method:'POST', headers, body:form });
    }
    if (!response.ok) { app.log.warn({ provider, status:response.status }, 'OAuth token exchange failed'); return fail('token_exchange_failed'); }
    const tokens = await response.json() as Record<string,any>;
    let externalId = String(tokens.user_id ?? tokens.stripe_user_id ?? tokens.shop ?? tokens.instance_url ?? query.realmId ?? `${provider}-${oauthState.workspaceId}`);
    if (provider === 'shopify') externalId = shop!;
    if (provider === 'xero' && tokens.access_token) {
      const tenantResponse = await fetch('https://api.xero.com/connections', { headers:{ Authorization:`Bearer ${tokens.access_token}`, Accept:'application/json' } });
      if (tenantResponse.ok) { const tenants = await tenantResponse.json() as Array<{tenantId:string;tenantName:string}>; if (tenants[0]) { externalId = tenants[0].tenantId; tokens.tenantName = tenants[0].tenantName; } }
    }
    if (query.realmId) tokens.realmId = query.realmId;
    tokens.receivedAt = new Date().toISOString();
    if (tokens.expires_in) tokens.expiresAt = Date.now() + Number(tokens.expires_in) * 1000;
    const existing = await prisma.integration.findFirst({ where:{ workspaceId:oauthState.workspaceId, provider, externalId } });
    const integration = existing
      ? await prisma.integration.update({ where:{ id:existing.id }, data:{ category:oauthCategory[provider], displayName:`${provider[0].toUpperCase()}${provider.slice(1)} · ${tokens.tenantName ?? externalId}`, status:'CONNECTED', credentials:encryptCredentials(tokens), lastSyncAt:new Date(), lastError:null } })
      : await prisma.integration.create({ data:{ workspaceId:oauthState.workspaceId, provider, category:oauthCategory[provider], displayName:`${provider[0].toUpperCase()}${provider.slice(1)} · ${tokens.tenantName ?? externalId}`, externalId, status:'CONNECTED', credentials:encryptCredentials(tokens), lastSyncAt:new Date() } });
    await audit(oauthState.workspaceId, 'integration.oauth.connected', 'Integration', integration.id, { provider, externalId }, undefined, 'SYSTEM');
    return reply.redirect(`${process.env.PUBLIC_URL ?? ''}/app/integrations?connected=${encodeURIComponent(provider)}`);
  } catch (error) { app.log.error({ error, provider }, 'OAuth callback failed'); return fail('connection_failed'); }
});

app.post('/api/integrations/:id/credentials', { preHandler: [auth, admin] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const integration = await prisma.integration.findFirst({ where:{ id, workspaceId:request.auth!.workspaceId } });
  if (!integration) return reply.code(404).send({ error:'Integration not found' });
  const input = request.body as { credentials?:Record<string,unknown>; settings?:Record<string,unknown> };
  const credentials = (input.credentials ?? request.body) as Record<string,unknown>;
  if (!credentials || !Object.keys(credentials).length || Object.keys(credentials).some(key => /secret|token|password|key/i.test(key) && typeof credentials[key] !== 'string')) return reply.code(400).send({ error:'Invalid integration credentials' });
  if (integration.provider === 'twilio') {
    const accountSid = credentials.accountSid, authToken = credentials.authToken;
    if (typeof accountSid !== 'string' || typeof authToken !== 'string' || typeof credentials.fromNumber !== 'string') return reply.code(400).send({error:'Twilio accountSid, authToken and fromNumber are required'});
    const verification = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`,{headers:{Authorization:`Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`}});
    if (!verification.ok) return reply.code(400).send({error:'Twilio credentials could not be verified'});
  }
  const endpoint = integration.provider === 'woocommerce' ? credentials.storeUrl : integration.provider === 'btcpay' ? credentials.url : undefined;
  if (typeof endpoint === 'string') {
    try { const parsed = new URL(endpoint); const localDevelopment = process.env.NODE_ENV !== 'production' && ['localhost','127.0.0.1'].includes(parsed.hostname); if (parsed.protocol !== 'https:' && !localDevelopment) return reply.code(400).send({error:'Integration endpoints must use HTTPS'}); }
    catch { return reply.code(400).send({error:'Integration endpoint URL is invalid'}); }
  }
  const updated = await prisma.integration.update({ where:{ id }, data:{ credentials:encryptCredentials(credentials), settings:(input.settings ?? {}) as object, externalId:integration.provider === 'twilio' ? String(credentials.accountSid ?? integration.externalId ?? '') : integration.externalId, status:'CONNECTED', lastError:null, lastSyncAt:new Date() } });
  await audit(integration.workspaceId, 'integration.credentials.updated', 'Integration', id, { provider:integration.provider }, request.auth!.userId, 'HUMAN');
  return { id:updated.id, provider:updated.provider, category:updated.category, displayName:updated.displayName, status:updated.status };
});
app.get('/api/workflows', { preHandler: auth }, async (request) => prisma.workflow.findMany({ where: { workspaceId: request.auth!.workspaceId }, include: { _count: { select: { runs: true } } }, orderBy: { updatedAt: 'desc' } }));
app.get('/api/messages', { preHandler: auth }, async (request) => prisma.message.findMany({ where: { workspaceId: request.auth!.workspaceId }, orderBy: { createdAt: 'desc' }, take: 50 }));
app.get('/api/billing/invoices', { preHandler: auth }, async (request) => prisma.invoice.findMany({ where:{workspaceId:request.auth!.workspaceId},orderBy:{createdAt:'desc'},take:100 }));
app.get('/api/billing/usage', { preHandler: auth }, async (request) => prisma.usageRecord.findMany({ where:{workspaceId:request.auth!.workspaceId},include:{opportunity:{select:{title:true,source:true}}},orderBy:{reportedAt:'desc'},take:100 }));
app.post('/api/billing/checkout', { preHandler:[auth,admin] }, async (request,reply) => {
  if (!process.env.STRIPE_SECRET_KEY) return reply.code(503).send({error:'Stripe billing is not configured'});
  const { plan } = request.body as {plan?:'STARTER'|'GROWTH'|'SCALE'};
  if (!plan || !['STARTER','GROWTH','SCALE'].includes(plan)) return reply.code(400).send({error:'Choose Starter, Growth, or Scale'});
  const price = process.env[`STRIPE_PRICE_${plan}`];
  if (!price) return reply.code(503).send({error:`Stripe price for ${plan.toLowerCase()} is not configured`});
  const workspace = request.auth!.workspace;
  const form = new URLSearchParams({mode:'subscription','line_items[0][price]':price,'line_items[0][quantity]':'1',success_url:`${process.env.PUBLIC_URL}/app/billing?checkout=success`,cancel_url:`${process.env.PUBLIC_URL}/app/billing?checkout=cancel`,client_reference_id:workspace.id,'metadata[workspaceId]':workspace.id,'subscription_data[metadata][workspaceId]':workspace.id});
  if (workspace.stripeCustomerId) form.set('customer',workspace.stripeCustomerId);
  else { const user = await prisma.user.findUnique({where:{id:request.auth!.userId}}); if(user) form.set('customer_email',user.email); }
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`subscription:${workspace.id}:${plan}:${Math.floor(Date.now()/86400000)}`},body:form});
  if (!response.ok) return reply.code(502).send({error:'Stripe could not start checkout'});
  const session = await response.json() as {url:string};
  await audit(workspace.id,'billing.checkout.started','Workspace',workspace.id,{plan},request.auth!.userId,'HUMAN');
  return {url:session.url};
});
app.get('/api/settings', { preHandler: auth }, async (request) => ({ workspace: request.auth!.workspace, consents: await prisma.consent.count({ where: { workspaceId: request.auth!.workspaceId } }), optedOut: await prisma.consent.count({ where: { workspaceId: request.auth!.workspaceId, status: 'OPTED_OUT' } }) }));
app.patch('/api/settings', { preHandler: [auth, admin] }, async (request, reply) => {
  const body = request.body as { timezone?:string; quietHoursStart?:string; quietHoursEnd?:string; businessAddress?:string; requireApproval?:boolean; collectionsApproval?:boolean; successFeeBps?:number };
  if (body.quietHoursStart && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.quietHoursStart) || body.quietHoursEnd && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.quietHoursEnd)) return reply.code(400).send({ error:'Quiet hours must use 24 hour HH:MM format' });
  if (body.successFeeBps !== undefined && (body.successFeeBps < 0 || body.successFeeBps > 5000)) return reply.code(400).send({ error:'Success fee must be between 0% and 50%' });
  const workspace = await prisma.workspace.update({ where:{ id:request.auth!.workspaceId }, data:{ ...body, businessAddress:body.businessAddress?.trim() } });
  await audit(workspace.id, 'workspace.settings.updated', 'Workspace', workspace.id, { changedFields:Object.keys(body) }, request.auth!.userId, 'HUMAN');
  return workspace;
});

const sendSentryEvent = async (error:Error,requestId:string,route:string) => {
  if (!process.env.SENTRY_DSN) return;
  try {
    const dsn=new URL(process.env.SENTRY_DSN); const project=dsn.pathname.replace(/^\//,''); const key=dsn.username; const eventId=randomBytes(16).toString('hex');
    const envelope=[JSON.stringify({event_id:eventId,sent_at:new Date().toISOString(),dsn:process.env.SENTRY_DSN}),JSON.stringify({type:'event'}),JSON.stringify({event_id:eventId,platform:'node',level:'error',message:{formatted:error.message},tags:{request_id:requestId,route},exception:{values:[{type:error.name,value:error.message}]}})].join('\n');
    await fetch(`${dsn.protocol}//${dsn.host}/api/${project}/envelope/?sentry_key=${encodeURIComponent(key)}&sentry_version=7`,{method:'POST',headers:{'Content-Type':'application/x-sentry-envelope'},body:envelope});
  } catch (sentryError) { app.log.warn({sentryError},'Sentry-compatible error hook failed'); }
};
app.setErrorHandler((error, request, reply) => { const err=error instanceof Error?error:new Error(String(error)); const status=(error as any)?.statusCode as number|undefined; app.log.error({ err, requestId: request.id }, 'request failed'); void sendSentryEvent(err,request.id,request.routeOptions.url ?? 'unknown'); reply.code(status ?? 500).send({ error: status && status < 500 ? err.message : 'Internal server error', requestId: request.id }); });

const port = Number(process.env.PORT ?? 3201);
await app.listen({ port, host: '127.0.0.1' });
app.log.info({ port }, 'RECOVER API started');

const shutdown = async () => { await app.close(); await prisma.$disconnect(); process.exit(0); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
