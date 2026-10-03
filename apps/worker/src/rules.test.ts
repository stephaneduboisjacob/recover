import { describe, expect, it } from 'vitest';
import { detectEntity } from './rules.js';

const now = new Date('2026-10-03T12:00:00.000Z');
const entity = (entityType: string, status: string, days: number, metadata: Record<string, unknown> = {}) => ({ id:'e1', provider:'test', entityType, externalId:'r1', displayName:'Example', email:'person@example.test', phone:null, valueCents:12345, currency:'USD', status, lastActivityAt:new Date(now.getTime()-days*86400000), nextStepAt:null, metadata });

describe('recovery detection rules', () => {
  it('detects stale sent quotes and carries evidence', () => {
    const result = detectEntity(entity('quote','sent',5), now);
    expect(result?.source).toBe('QUOTE'); expect(result?.valueCents).toBe(12345); expect(result?.evidence).toMatchObject({ status:'sent', idleDays:5 });
  });
  it('does not detect a quote before the follow-up threshold', () => { expect(detectEntity(entity('quote','sent',2),now)).toBeNull(); });
  it('detects overdue invoices only after the first overdue day', () => { expect(detectEntity(entity('invoice','overdue',1),now)?.source).toBe('INVOICE'); expect(detectEntity(entity('invoice','paid',20),now)).toBeNull(); });
  it('detects abandoned carts, stale leads, expired plans and missed calls', () => {
    expect(detectEntity(entity('cart','abandoned',1),now)?.source).toBe('CART');
    expect(detectEntity(entity('lead','open',14),now)?.source).toBe('LEAD');
    expect(detectEntity(entity('subscription','expired',3),now)?.source).toBe('SUBSCRIPTION');
    const missed = entity('missed_call','missed',0,{callbackWithinHours:4});
    missed.lastActivityAt = new Date(now.getTime() - 5 * 3600000);
    expect(detectEntity(missed,now)?.source).toBe('MISSED_CALL');
  });
  it('uses deterministic evidence without re-detecting closed deals', () => { expect(detectEntity(entity('quote','closed',30),now)).toBeNull(); });
});
