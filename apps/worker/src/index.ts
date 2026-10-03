import { PrismaClient } from '@prisma/client';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { createHash } from 'node:crypto';
import { detectEntity } from './rules.js';
import { createSourceAdapter, decryptCredentials, encryptCredentials, OAuthProvider, refreshOAuthCredentials } from '@recover/integrations';
import { nextWorkflowStep, renderWorkflowTemplate } from '@recover/shared';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const prisma = new PrismaClient();
const connection = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6381', { maxRetriesPerRequest: null });
const queueName = 'recover-jobs';
export const recoverQueue = new Queue(queueName, { connection });
const reserveIntegrationSlot = async (integrationId:string) => {
  const key=`recover:integration-rate:${integrationId}`;
  while (true) {
    const acquired=await connection.set(key,'1','PX',750,'NX');
    if (acquired==='OK') return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
};

async function scanWorkspace(workspaceId: string) {
  const integrations = await prisma.integration.findMany({ where: { workspaceId, status: 'CONNECTED' } });
  for (const integration of integrations) {
    if (!integration.credentials) continue;
    try {
      let credentials = decryptCredentials<{ access_token?: string; accessToken?: string; authToken?:string; accountSid?:string; instance_url?: string; api_domain?: string; tenantId?: string; realmId?:string; expiresAt?:number; refresh_token?:string }>(integration.credentials);
      const originalCredentials=JSON.stringify(credentials);
      if (['hubspot','salesforce','pipedrive','google','microsoft','quickbooks','xero','stripe'].includes(integration.provider)) credentials=await refreshOAuthCredentials(integration.provider as OAuthProvider,credentials);
      if(JSON.stringify(credentials)!==originalCredentials)await prisma.integration.update({where:{id:integration.id},data:{credentials:encryptCredentials(credentials)}});
      const token = credentials.access_token ?? credentials.accessToken ?? credentials.authToken;
      if (!token) continue;
      const adapter = createSourceAdapter(integration.provider, token, integration.provider === 'salesforce' ? credentials.instance_url : integration.provider === 'shopify' ? integration.externalId ?? undefined : integration.provider === 'quickbooks' ? credentials.realmId ?? integration.externalId ?? undefined : integration.provider === 'xero' ? integration.externalId ?? credentials.tenantId : integration.provider === 'pipedrive' ? credentials.api_domain : undefined, credentials, integration.settings as Record<string,any>);
      if (!adapter) continue;
      await reserveIntegrationSlot(integration.id);
      const records = await adapter.listRecoverable(workspaceId);
      for (const record of records) {
        const entityType = record.type.toLowerCase();
        const externalId = String(record.id);
        const data = { ...(record.data ?? {}), jurisdiction: (record.data as any)?.jurisdiction ?? ((integration.settings as any)?.jurisdiction ?? undefined) };
        const metadata = JSON.parse(JSON.stringify(data));
        const lastActivityAt = record.updatedAt && !Number.isNaN(Date.parse(record.updatedAt)) ? new Date(record.updatedAt) : new Date();
        await prisma.entity.upsert({
          where: { workspaceId_provider_entityType_externalId: { workspaceId, provider: integration.provider, entityType, externalId } },
          create: { workspaceId, provider: integration.provider, entityType, externalId, displayName: record.displayName ?? externalId, email: record.email ?? (typeof metadata.email === 'string' ? metadata.email : null), phone: record.phone ?? (typeof metadata.phone === 'string' ? metadata.phone : null), valueCents: record.valueCents ?? null, currency: record.currency ?? 'USD', status: record.status ?? null, lastActivityAt, metadata },
          update: { displayName: record.displayName, email: record.email, phone: record.phone, valueCents: record.valueCents, currency: record.currency ?? 'USD', status: record.status, lastActivityAt, metadata }
        });
      }
      await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date(), lastError: null } });
      logger.info({ integrationId: integration.id, provider: integration.provider, records: records.length }, 'integration sync completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown integration error';
      await prisma.integration.update({ where: { id: integration.id }, data: { status: 'ERROR', lastError: message.slice(0, 300) } });
      logger.error({ integrationId: integration.id, provider: integration.provider, error }, 'integration sync failed');
      throw error;
    }
  }
  const entities = await prisma.entity.findMany({ where: { workspaceId }, take: 2000 });
  let created = 0;
  for (const entity of entities) {
    const detection = detectEntity(entity);
    if (!detection || detection.valueCents <= 0) continue;
    const idempotencyKey = `${entity.provider}:${entity.entityType}:${entity.externalId}:${detection.source}`;
    const existing = await prisma.recoveryOpportunity.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } } });
    if (existing) continue;
    await prisma.recoveryOpportunity.create({ data: { workspaceId, entityId: entity.id, source: detection.source, externalRef: entity.externalId, title: detection.title, contactName: entity.displayName, contactEmail: entity.email, contactPhone: entity.phone, estimatedCents: detection.valueCents, currency: entity.currency, confidence: detection.confidence, evidence: detection.evidence as any, idempotencyKey } });
    created++;
  }
  logger.info({ workspaceId, entities: entities.length, created }, 'workspace scan completed');
  return { workspaceId, entities: entities.length, created };
}

async function executeWorkflow(job: Job) {
  const runId = String(job.data.workflowRunId);
  const run = await prisma.workflowRun.findUnique({ where: { id: runId }, include: { workflow: true, opportunity: true } });
  if (!run || ['COMPLETED', 'CANCELLED'].includes(run.status)) return { skipped: true };
  if (run.status === 'WAITING_APPROVAL') return { waitingApproval: true };
  const steps = run.workflow.steps as Array<{ channel: string; waitMinutes?: number; requireApproval?: boolean; template?: string }>;
  const step = steps[run.currentStep];
  if (!step) { await prisma.workflowRun.update({ where: { id: runId }, data: { status: 'COMPLETED' } }); return { completed: true }; }
  const channel = step.channel.toUpperCase() as 'EMAIL'|'SMS'|'VOICE';
  const recipient = channel === 'EMAIL' ? run.opportunity.contactEmail : run.opportunity.contactPhone;
  if (!recipient) { await prisma.workflowRun.update({where:{id:run.id},data:{status:'FAILED',lastError:`No ${channel.toLowerCase()} recipient is available`}}); return {failed:true}; }
  const workspace = await prisma.workspace.findUniqueOrThrow({where:{id:run.workspaceId}});
  const tokens:Record<string,string> = { contactName:run.opportunity.contactName ?? 'there', opportunityTitle:run.opportunity.title, amount:(run.opportunity.estimatedCents/100).toFixed(2), businessName:workspace.name };
  let body = renderWorkflowTemplate(step.template ?? 'Hi {{contactName}}, just checking in on {{opportunityTitle}}.',tokens);
  if (channel === 'EMAIL') body += `\n\n${workspace.name} · ${workspace.businessAddress ?? '[Business postal address required before sending]'}\nReply unsubscribe to opt out.`;
  else body += '\nReply STOP to opt out.';
  const msgKey = `workflow-message:${run.id}:${run.currentStep}`;
  const message = await prisma.message.upsert({where:{idempotencyKey:msgKey},create:{workspaceId:run.workspaceId,opportunityId:run.opportunityId,workflowRunId:run.id,channel,recipient,subject:channel==='EMAIL'?`Following up: ${run.opportunity.title}`:undefined,body,status:'PENDING_APPROVAL',idempotencyKey:msgKey,payloadHash:createHash('sha256').update(body).digest('hex')},update:{}});
  await prisma.workflowRun.update({ where: { id: runId }, data: { status: 'WAITING_APPROVAL' } });
  await prisma.recoveryOpportunity.update({where:{id:run.opportunityId},data:{status:'AWAITING_APPROVAL'}});
  await prisma.auditLog.create({ data: { workspaceId: run.workspaceId, actorType: 'SYSTEM', action: 'workflow.step.awaiting_approval', targetType: 'WorkflowRun', targetId: run.id, payloadHash: `${run.id}:${run.currentStep}`, details: { step: run.currentStep, channel: step.channel, messageId:message.id, jurisdiction:(run.opportunity.evidence as any)?.jurisdiction } } });
  return { waitingApproval: true };
}

const worker = new Worker(queueName, async (job) => {
  if (job.name === 'scan-workspace') return scanWorkspace(String(job.data.workspaceId));
  if (job.name === 'run-workflow') return executeWorkflow(job);
  if (job.name === 'scheduled-scan') {
    const workspaces = await prisma.workspace.findMany({ select: { id: true } });
    await Promise.all(workspaces.map(workspace => recoverQueue.add('scan-workspace', { workspaceId: workspace.id }, { attempts: 5, backoff: { type: 'exponential', delay: 30000 }, jobId: `scan:${workspace.id}:${Math.floor(Date.now() / 900000)}` })));
    return { queued: workspaces.length };
  }
  return { ignored: true };
}, { connection, concurrency: 5, limiter: { max: 30, duration: 60000 } });
worker.on('completed', (job) => logger.info({ jobId: job.id, name: job.name }, 'job completed'));
worker.on('failed', (job, error) => logger.error({ jobId: job?.id, error }, 'job failed'));

const schedule = async () => {
  await recoverQueue.add('scheduled-scan', {}, { repeat: { every: 15 * 60 * 1000 }, jobId: 'scheduled-scan' });
};
await schedule();
logger.info('RECOVER worker started');
const shutdown = async () => { await worker.close(); await recoverQueue.close(); await connection.quit(); await prisma.$disconnect(); process.exit(0); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
