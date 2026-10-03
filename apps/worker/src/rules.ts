export type ScanEntity = { id: string; provider: string; entityType: string; externalId: string; displayName?: string|null; email?: string|null; phone?: string|null; valueCents?: number|null; currency: string; status?: string|null; lastActivityAt?: Date|null; nextStepAt?: Date|null; metadata: unknown };
export type Detection = { source: 'QUOTE'|'MISSED_CALL'|'INVOICE'|'SUBSCRIPTION'|'CART'|'LEAD'; title: string; confidence: number; valueCents: number; evidence: Record<string, unknown> };

const ageDays = (date: Date | null | undefined, now: Date) => date ? Math.floor((now.getTime() - date.getTime()) / 86400000) : Number.POSITIVE_INFINITY;

export function detectEntity(entity: ScanEntity, now = new Date()): Detection | null {
  const type = entity.entityType.toLowerCase();
  const data = (entity.metadata ?? {}) as Record<string, unknown>;
  const status = (entity.status ?? '').toLowerCase();
  const days = ageDays(entity.lastActivityAt, now);
  const nextStepOverdue = !entity.nextStepAt || entity.nextStepAt < now;
  const value = entity.valueCents ?? Number(data.valueCents ?? 0);
  if ((type === 'quote' || type === 'deal') && ['sent', 'open', 'pending'].includes(status) && days >= 3 && nextStepOverdue)
    return { source: 'QUOTE', title: `Quote follow-up · ${entity.displayName ?? entity.externalId}`, confidence: 0.88, valueCents: value, evidence: { status, idleDays: days, provider: entity.provider, externalId: entity.externalId } };
  const elapsedHours = entity.lastActivityAt ? (now.getTime() - entity.lastActivityAt.getTime()) / 3600000 : 0;
  const callbackThresholdHours = Number(data.callbackWithinHours ?? 4);
  if ((type === 'call' || type === 'missed_call') && status === 'missed' && elapsedHours >= callbackThresholdHours)
    return { source: 'MISSED_CALL', title: `Missed call · ${entity.displayName ?? entity.phone ?? 'New caller'}`, confidence: 0.82, valueCents: value, evidence: { status, callbackDelayHours: Math.floor(elapsedHours), provider: entity.provider, jurisdiction: data.jurisdiction } };
  if ((type === 'invoice' || type === 'bill') && ['open', 'unpaid', 'overdue'].includes(status) && days >= 1)
    return { source: 'INVOICE', title: `Overdue invoice · ${entity.displayName ?? entity.externalId}`, confidence: Math.min(0.98, 0.76 + days / 100), valueCents: value, evidence: { status, overdueDays: Number(data.overdueDays ?? days), provider: entity.provider, jurisdiction: data.jurisdiction } };
  if ((type === 'subscription' || type === 'membership') && ['expired', 'canceled', 'churned', 'past_due'].includes(status) && days >= 1)
    return { source: 'SUBSCRIPTION', title: `Subscription renewal · ${entity.displayName ?? entity.externalId}`, confidence: 0.8, valueCents: value, evidence: { status, expiredDays: days, provider: entity.provider, jurisdiction: data.jurisdiction } };
  if ((type === 'cart' || type === 'checkout') && ['open', 'abandoned', 'pending'].includes(status) && days >= 1)
    return { source: 'CART', title: `Abandoned cart · ${entity.displayName ?? entity.externalId}`, confidence: 0.87, valueCents: value, evidence: { status, idleDays: days, provider: entity.provider, externalId: entity.externalId } };
  if ((type === 'lead' || type === 'contact') && status !== 'converted' && days >= 14 && nextStepOverdue)
    return { source: 'LEAD', title: `Lead needs a next step · ${entity.displayName ?? entity.externalId}`, confidence: 0.68, valueCents: value, evidence: { idleDays: days, provider: entity.provider, nextStepAt: entity.nextStepAt?.toISOString() ?? null } };
  return null;
}
