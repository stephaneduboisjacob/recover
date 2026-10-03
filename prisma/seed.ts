import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();
const now = new Date();
const day = (n: number) => new Date(now.getTime() - n * 86400000);

async function main() {
  const workspace = await prisma.workspace.upsert({ where: { slug: 'demo' }, update: { demoMode: true, successFeeBps: 1500, requireApproval: true, collectionsApproval: true, businessAddress:'123 Demo Street, San Francisco, CA 94105' }, create: { slug: 'demo', name: 'Northstar Studio', demoMode: true, basePlan: 'GROWTH', successFeeBps: 1500, requireApproval: true, collectionsApproval: true, timezone: 'America/New_York', businessAddress:'123 Demo Street, San Francisco, CA 94105' } });
  const passwordHash = await argon2.hash('RecoverDemo!2026Pass');
  const user = await prisma.user.upsert({ where: { email: 'demo@recover.test' }, update: { passwordHash, name: 'Sam Carter' }, create: { email: 'demo@recover.test', passwordHash, name: 'Sam Carter' } });
  await prisma.membership.upsert({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } }, update: { role: 'OWNER' }, create: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' } });

  const records = [
    { provider:'hubspot', type:'quote', ref:'Q-4821', title:'Website redesign proposal', name:'Olivia Chen', email:'olivia@example.test', cents:1840000, status:'sent', days:12, source:'QUOTE' as const, confidence:.91, recovered:543000, oppStatus:'RECOVERED' as const },
    { provider:'stripe', type:'invoice', ref:'INV-2048', title:'Invoice #INV-2048 · 14 days overdue', name:'Northstar Studio', email:'finance@example.test', cents:1350000, status:'overdue', days:14, source:'INVOICE' as const, confidence:.98, recovered:1200000, oppStatus:'RECOVERED' as const },
    { provider:'shopify', type:'cart', ref:'CART-672', title:'Checkout with 3 items', name:'Marcus Lee', email:'marcus@example.test', cents:67200, status:'abandoned', days:1, source:'CART' as const, confidence:.86, recovered:0, oppStatus:'AWAITING_APPROVAL' as const },
    { provider:'twilio', type:'missed_call', ref:'CALL-9800', title:'Inbound call · callback overdue', name:'Taylor Brooks', email:'', phone:'+15555550128', cents:980000, status:'missed', days:0, source:'MISSED_CALL' as const, confidence:.79, recovered:0, oppStatus:'NEW' as const },
    { provider:'stripe', type:'subscription', ref:'SUB-17600', title:'Annual plan expired', name:'Brightside Dental', email:'hello@example.test', cents:1760000, status:'expired', days:4, source:'SUBSCRIPTION' as const, confidence:.83, recovered:0, oppStatus:'NEW' as const },
    { provider:'hubspot', type:'lead', ref:'LEAD-11000', title:'No next step in 21 days', name:'Jamie Rivera', email:'jamie@example.test', cents:1100000, status:'open', days:21, source:'LEAD' as const, confidence:.68, recovered:0, oppStatus:'DRAFTED' as const },
    { provider:'quickbooks', type:'invoice', ref:'INV-1991', title:'Invoice #INV-1991 · 7 days overdue', name:'Morrow & Co.', email:'ap@example.test', cents:720000, status:'overdue', days:7, source:'INVOICE' as const, confidence:.92, recovered:0, oppStatus:'ACTIVE' as const },
    { provider:'hubspot', type:'quote', ref:'Q-4710', title:'Q3 retainer proposal', name:'Pine & Peak', email:'team@example.test', cents:604700, status:'sent', days:6, source:'QUOTE' as const, confidence:.74, recovered:0, oppStatus:'NEW' as const }
  ];
  for (const record of records) {
    const entity = await prisma.entity.upsert({ where: { workspaceId_provider_entityType_externalId: { workspaceId: workspace.id, provider: record.provider, entityType: record.type, externalId: record.ref } }, update: {}, create: { workspaceId: workspace.id, provider: record.provider, entityType: record.type, externalId: record.ref, displayName: record.name, email: record.email || null, phone: record.phone ?? null, valueCents: record.cents, currency: 'USD', status: record.status, lastActivityAt: day(record.days), nextStepAt: null, metadata: { overdueDays: record.days, callbackWithinHours: record.source === 'MISSED_CALL' ? 5 : undefined, jurisdiction: 'US-CA', consentEvidence: 'demo-only' } } });
    const idempotencyKey = `${record.provider}:${record.type}:${record.ref}:${record.source}`;
    await prisma.recoveryOpportunity.upsert({ where: { workspaceId_idempotencyKey: { workspaceId: workspace.id, idempotencyKey } }, update: { estimatedCents: record.cents, recoveredCents: record.recovered, status: record.oppStatus }, create: { workspaceId: workspace.id, entityId: entity.id, source: record.source, externalRef: record.ref, title: record.title, contactName: record.name, contactEmail: record.email || null, contactPhone: record.phone ?? null, estimatedCents: record.cents, recoveredCents: record.recovered, currency: 'USD', confidence: record.confidence, evidence: { status: record.status, daysSinceActivity: record.days, provider: record.provider, jurisdiction: 'US-CA' }, detectedAt: day(0), status: record.oppStatus, recoveredAt: record.recovered ? day(1) : null, paymentConfirmed: Boolean(record.recovered), idempotencyKey } });
  }
  const workflow = await prisma.workflow.findFirst({ where: { workspaceId: workspace.id, name: 'Quote follow-up sequence' } });
  if (!workflow) await prisma.workflow.create({ data: { workspaceId: workspace.id, name: 'Quote follow-up sequence', source: 'QUOTE', status: 'ACTIVE', tone: 'warm', autoSend: false, steps: [{ channel:'EMAIL', waitMinutes:0, requireApproval:true, template:'Hi {{contactName}}, just checking in on {{opportunityTitle}}. Would you like us to answer any questions?' }, { channel:'SMS', waitMinutes:1440, requireApproval:true, template:'Hi {{contactName}}, following up on your quote. Reply STOP to opt out.' }, { channel:'VOICE', waitMinutes:2880, requireApproval:true, template:'Friendly follow-up call' }] } });
  const opportunity = await prisma.recoveryOpportunity.findFirst({ where: { workspaceId: workspace.id, source: 'QUOTE' } });
  const email = 'olivia@example.test';
  await prisma.consent.upsert({ where: { workspaceId_subject_channel: { workspaceId: workspace.id, subject: email, channel: 'EMAIL' } }, update: {}, create: { workspaceId: workspace.id, subject: email, channel: 'EMAIL', status: 'OPTED_IN', jurisdiction: 'US-CA', source: 'demo_seed', disclosure: 'Synthetic demonstration consent', consentedAt: day(10), evidence: { synthetic: true } } });
  for (const [provider, category, displayName] of [['hubspot','CRM','HubSpot Demo'],['stripe','INVOICING','Stripe Demo'],['shopify','ECOMMERCE','Shopify Demo'],['twilio','SMS_VOICE','Twilio Demo'],['google','EMAIL','Gmail Demo']] as const) {
    const existing = await prisma.integration.findFirst({ where: { workspaceId: workspace.id, provider, displayName } });
    if (!existing) await prisma.integration.create({ data: { workspaceId: workspace.id, provider, category, displayName, status: 'CONNECTED', settings: { demo: true } } });
  }
  const auditCount = await prisma.auditLog.count({ where: { workspaceId: workspace.id } });
  if (auditCount === 0 && opportunity) await prisma.auditLog.create({ data: { workspaceId: workspace.id, actorType: 'SYSTEM', action: 'demo.seeded', targetType: 'RecoveryOpportunity', targetId: opportunity.id, payloadHash: 'demo-seed-v1', details: { headlineFoundCents: 8421900, headlineRecoveredCents: 1743000 } } });
  console.log('Seeded demo workspace. Login: demo@recover.test / RecoverDemo!2026Pass');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
