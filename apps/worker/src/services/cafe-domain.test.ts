import { describe, expect, it } from 'vitest';
import { calculateCafeAvailability, overlaps } from './cafe-domain.js';

const base = { startsAt: '2026-08-01T02:00:00.000Z', endsAt: '2026-08-01T03:00:00.000Z', quantity: 1, capacityTotal: 2, bookingMode: 'capacity_pool' as const, now: '2026-07-28T00:00:00.000Z' };
const reservation = (startsAt: string, endsAt: string, status: any = 'confirmed', quantity = 1, holdExpiresAt?: string) => ({ startsAt, endsAt, status, quantity, holdExpiresAt });

describe('cafe availability', () => {
  it('returns full capacity without reservations', () => expect(calculateCafeAvailability({ ...base, reservations: [] })).toMatchObject({ remainingQuantity: 2, available: true, statusLabel: '充足' }));
  it('subtracts a confirmed reservation', () => expect(calculateCafeAvailability({ ...base, reservations: [reservation(base.startsAt, base.endsAt)] })).toMatchObject({ reservedQuantity: 1, remainingQuantity: 1 }));
  it('treats adjacent half-open intervals as available', () => expect(overlaps('2026-08-01T01:00:00Z', base.startsAt, base.startsAt, base.endsAt)).toBe(false));
  it('detects partial and containing overlaps', () => { expect(overlaps('2026-08-01T02:30:00Z','2026-08-01T04:00:00Z',base.startsAt,base.endsAt)).toBe(true); expect(overlaps('2026-08-01T01:00:00Z','2026-08-01T04:00:00Z',base.startsAt,base.endsAt)).toBe(true); });
  it.each(['cancelled','expired','rejected','completed','no_show'] as const)('does not count %s', (status) => expect(calculateCafeAvailability({ ...base, reservations: [reservation(base.startsAt,base.endsAt,status)] })).toMatchObject({ remainingQuantity: 2 }));
  it('does not count an expired hold', () => expect(calculateCafeAvailability({ ...base, reservations: [reservation(base.startsAt,base.endsAt,'holding',1,'2026-07-27T00:00:00Z')] })).toMatchObject({ heldQuantity: 0, remainingQuantity: 2 }));
  it('rejects quantity beyond remaining capacity', () => expect(calculateCafeAvailability({ ...base, quantity: 2, reservations: [reservation(base.startsAt,base.endsAt)] }).available).toBe(false));
  it('returns only unoccupied assigned units', () => expect(calculateCafeAvailability({ ...base, bookingMode:'assigned_unit', unitIds:['A','B'], reservations:[{...reservation(base.startsAt,base.endsAt),unitIds:['A']}] }).availableUnitIds).toEqual(['B']));
});
