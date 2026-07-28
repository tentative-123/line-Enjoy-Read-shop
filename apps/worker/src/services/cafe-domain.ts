export const OCCUPYING_STATUSES = ['holding', 'pending_payment', 'confirmed', 'checked_in'] as const;
export type CafeBookingStatus = typeof OCCUPYING_STATUSES[number] | 'cancelled' | 'expired' | 'rejected' | 'completed' | 'no_show';
export type BookingMode = 'capacity_pool' | 'assigned_unit';

export interface CafeReservation {
  startsAt: string;
  endsAt: string;
  quantity: number;
  status: CafeBookingStatus;
  holdExpiresAt?: string | null;
  unitIds?: string[];
}

export interface CafeAvailability {
  capacityTotal: number;
  reservedQuantity: number;
  heldQuantity: number;
  remainingQuantity: number;
  occupancyRate: number;
  available: boolean;
  availableUnitIds?: string[];
  statusLabel: '充足' | '即將額滿' | '已額滿';
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function calculateCafeAvailability(input: {
  startsAt: string;
  endsAt: string;
  quantity: number;
  capacityTotal: number;
  bookingMode: BookingMode;
  unitIds?: string[];
  reservations: CafeReservation[];
  now: string;
}): CafeAvailability {
  const conflicts = input.reservations.filter((item) => {
    if (!OCCUPYING_STATUSES.includes(item.status as typeof OCCUPYING_STATUSES[number])) return false;
    if (item.status === 'holding' && item.holdExpiresAt && item.holdExpiresAt <= input.now) return false;
    return overlaps(item.startsAt, item.endsAt, input.startsAt, input.endsAt);
  });
  const heldQuantity = conflicts.filter((x) => x.status === 'holding').reduce((sum, x) => sum + x.quantity, 0);
  const reservedQuantity = conflicts.filter((x) => x.status !== 'holding').reduce((sum, x) => sum + x.quantity, 0);
  const remainingQuantity = Math.max(0, input.capacityTotal - heldQuantity - reservedQuantity);
  const occupancyRate = input.capacityTotal === 0 ? 100 : Math.round(((input.capacityTotal - remainingQuantity) / input.capacityTotal) * 100);
  const occupiedUnits = new Set(conflicts.flatMap((x) => x.unitIds ?? []));
  const availableUnitIds = input.bookingMode === 'assigned_unit' ? (input.unitIds ?? []).filter((id) => !occupiedUnits.has(id)) : undefined;
  const available = remainingQuantity >= input.quantity && (availableUnitIds === undefined || availableUnitIds.length >= input.quantity);
  return {
    capacityTotal: input.capacityTotal, reservedQuantity, heldQuantity, remainingQuantity, occupancyRate, available,
    availableUnitIds,
    statusLabel: remainingQuantity === 0 ? '已額滿' : occupancyRate >= 80 ? '即將額滿' : '充足',
  };
}

export function validateBookingWindow(input: {
  startsAt: Date; endsAt: Date; now: Date; minimumDurationMinutes: number; maximumDurationMinutes: number;
  slotIntervalMinutes: number; advanceBookingMinutes: number; maxAdvanceDays: number;
}): 'INVALID_DURATION' | 'BOOKING_TOO_SOON' | 'BOOKING_TOO_FAR' | null {
  const duration = (input.endsAt.getTime() - input.startsAt.getTime()) / 60_000;
  if (duration < input.minimumDurationMinutes || duration > input.maximumDurationMinutes || duration % input.slotIntervalMinutes !== 0) return 'INVALID_DURATION';
  if (input.startsAt.getTime() < input.now.getTime() + input.advanceBookingMinutes * 60_000) return 'BOOKING_TOO_SOON';
  if (input.startsAt.getTime() > input.now.getTime() + input.maxAdvanceDays * 86_400_000) return 'BOOKING_TOO_FAR';
  return null;
}

export interface GateProvider {
  unlock(input: { deviceCode: string; bookingId: string; requestId: string }): Promise<{ success: boolean; providerReference?: string; error?: string }>;
}
export class MockGateProvider implements GateProvider {
  async unlock(input: { deviceCode: string; bookingId: string; requestId: string }) {
    return { success: true, providerReference: `mock:${input.deviceCode}:${input.requestId}` };
  }
}
