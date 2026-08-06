import { addDays, startOfDay } from 'date-fns';
import { describe, expect, it } from 'vitest';

import {
  type SelectedDateInfo,
  calculateBlockDuration,
  getBulkDateRange,
  getTotalHoursAndPrice,
  groupConsecutiveHours,
  validateDateRestrictions,
  validateMinimumBooking,
  validateRequirementsForDateSelection,
} from '@/lib/booking-rules';

/**
 * The booking rules decide what a brand is charged. They had no tests, and the
 * one safety net this repo did have — `next build` — cannot see any of this: a
 * booking that bills the wrong number of hours type-checks perfectly.
 *
 * These are characterisation tests first and foremost. Where the current
 * behaviour is surprising, the test states the surprise plainly rather than
 * asserting what the code "should" do, so that a future change which alters
 * billing has to consciously update a test that says what it is changing.
 */

/** The shape `getTotalHoursAndPrice` walks, with the fields it actually reads. */
function day(hours: string[]): SelectedDateInfo {
  return { date: new Date('2026-08-10T00:00:00'), hours, totalHours: 0, isEditing: false };
}

describe('hour arithmetic', () => {
  /**
   * The one thing to understand before reading anything else in this file:
   * a "slot" is a clock label, and an "hour" is elapsed time between two of
   * them. Picking 09:00 and 10:00 is TWO slots but ONE billable hour.
   *
   * The codebase has both counts, computed by two different functions whose
   * bodies look almost identical, and the `+ 1 - 1` in getTotalHoursAndPrice
   * that reads like a typo is what distinguishes them.
   */
  it('calculateBlockDuration counts slots touched, inclusive of both ends', () => {
    expect(calculateBlockDuration(['09:00', '10:00'])).toBe(2);
    expect(calculateBlockDuration(['09:00', '10:00', '11:00'])).toBe(3);
    expect(calculateBlockDuration(['09:00'])).toBe(1);
  });

  it('calculateBlockDuration returns 0 for an empty block rather than NaN', () => {
    expect(calculateBlockDuration([])).toBe(0);
  });

  it('getTotalHoursAndPrice counts ELAPSED hours — one fewer than slots', () => {
    // 09:00 + 10:00 is one hour of streaming, 09:00 to 10:00.
    expect(getTotalHoursAndPrice(new Map([['d', day(['09:00', '10:00'])]]), 100_000)).toEqual({
      totalHours: 1,
      totalPrice: 100_000,
    });
    // 09:00..11:00 is two hours.
    expect(
      getTotalHoursAndPrice(new Map([['d', day(['09:00', '10:00', '11:00'])]]), 100_000),
    ).toEqual({ totalHours: 2, totalPrice: 200_000 });
  });

  it('bills a lone slot as zero hours, not as one', () => {
    // Worth pinning: a single slot has no elapsed time, so it is free. That is
    // only safe because the minimum-booking rule is supposed to reject it.
    expect(getTotalHoursAndPrice(new Map([['d', day(['09:00'])]]), 100_000)).toEqual({
      totalHours: 0,
      totalPrice: 0,
    });
  });

  it('charges each non-contiguous block separately, not end-to-end', () => {
    // 09:00-11:00 and 14:00-16:00 is four hours, not the seven between 09 and 16.
    const hours = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
    expect(getTotalHoursAndPrice(new Map([['d', day(hours)]]), 100_000)).toEqual({
      totalHours: 4,
      totalPrice: 400_000,
    });
  });

  it('sums across days', () => {
    const dates = new Map([
      ['2026-08-10', day(['09:00', '10:00', '11:00'])],
      ['2026-08-11', day(['14:00', '15:00'])],
    ]);
    expect(getTotalHoursAndPrice(dates, 50_000)).toEqual({
      totalHours: 3,
      totalPrice: 150_000,
    });
  });
});

describe('groupConsecutiveHours', () => {
  /**
   * The mental model that makes every number in this file consistent:
   * a selected slot is a BOUNDARY, not an hour of work. Selecting 09:00, 10:00
   * and 11:00 books the session 09:00-11:00 — the last slot is the end time, so
   * three slots buy two hours.
   *
   * That is why the minimum booking is three slots, and why
   * getTotalHoursAndPrice subtracts one. The two functions agree; the `+ 1 - 1`
   * only looks like a bug.
   */
  it('collapses a run into one range ending at the last slot', () => {
    expect(groupConsecutiveHours(['09:00', '10:00', '11:00'])).toEqual([
      { start: '09:00', end: '11:00', duration: 2 },
    ]);
  });

  it('splits on a gap and charges each block separately', () => {
    expect(groupConsecutiveHours(['09:00', '10:00', '14:00', '15:00'])).toEqual([
      { start: '09:00', end: '10:00', duration: 1 },
      { start: '14:00', end: '15:00', duration: 1 },
    ]);
  });

  it('sorts before grouping, so click order cannot fragment a contiguous run', () => {
    expect(groupConsecutiveHours(['11:00', '09:00', '10:00'])).toEqual([
      { start: '09:00', end: '11:00', duration: 2 },
    ]);
  });

  it('returns nothing for no hours', () => {
    expect(groupConsecutiveHours([])).toEqual([]);
  });

  /**
   * The load-bearing invariant of the whole booking flow.
   *
   * groupConsecutiveHours produces the `timeRanges` that reach /booking-detail
   * and then Midtrans; getTotalHoursAndPrice produces the `totalPrice` shown in
   * the price rail. If these two ever disagree, the brand is quoted one number
   * and charged for another. Nothing else in the codebase checks that they
   * match.
   */
  it.each([
    [['09:00', '10:00']],
    [['09:00', '10:00', '11:00']],
    [['09:00', '10:00', '11:00', '14:00', '15:00']],
    [['00:00', '01:00', '02:00', '03:00']],
  ])('quoted hours match billed hours for %j', (hours) => {
    const quoted = groupConsecutiveHours(hours).reduce((sum, r) => sum + r.duration, 0);
    const { totalHours } = getTotalHoursAndPrice(new Map([['d', day(hours)]]), 1);
    expect(quoted).toBe(totalHours);
  });
});

describe('validateMinimumBooking', () => {
  /**
   * The stated rule, in the product's own error message, is "minimal 2 jam
   * berurutan (3 slot waktu)" — three slots.
   */
  it('rejects two slots, which is only one billable hour', () => {
    const result = validateMinimumBooking(['09:00', '10:00']);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('2 jam');
  });

  it('accepts three consecutive slots', () => {
    expect(validateMinimumBooking(['09:00', '10:00', '11:00'])).toEqual({
      isValid: true,
      error: '',
    });
  });

  it('rejects a lone slot', () => {
    expect(validateMinimumBooking(['09:00']).isValid).toBe(false);
  });

  it('needs the three to be CONSECUTIVE, not merely three', () => {
    expect(validateMinimumBooking(['09:00', '11:00', '13:00']).isValid).toBe(false);
  });

  it('accepts when any one block qualifies, even if another does not', () => {
    expect(
      validateMinimumBooking(['09:00', '10:00', '11:00', '15:00']).isValid,
    ).toBe(true);
  });
});

describe('validateDateRestrictions', () => {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  it('refuses today — booking starts tomorrow at the earliest', () => {
    const result = validateDateRestrictions(today, 'no', 'jakarta', 'jakarta');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('besok');
  });

  it('refuses the past', () => {
    expect(validateDateRestrictions(addDays(today, -1), 'no', 'jakarta', 'jakarta').isValid)
      .toBe(false);
  });

  it('allows tomorrow when nothing is being shipped', () => {
    expect(validateDateRestrictions(tomorrow, 'no', 'jakarta', 'bandung').isValid).toBe(true);
  });

  it('allows tomorrow when shipping within the same city', () => {
    expect(validateDateRestrictions(tomorrow, 'yes', 'jakarta', 'jakarta').isValid).toBe(true);
  });

  it('requires three days when shipping between cities', () => {
    expect(validateDateRestrictions(tomorrow, 'yes', 'jakarta', 'bandung').isValid).toBe(false);
    expect(validateDateRestrictions(addDays(today, 3), 'yes', 'jakarta', 'bandung').isValid)
      .toBe(true);
  });

  /**
   * The regression that cost every brand two days: this used to compare raw
   * strings, so a client in "DKI Jakarta" and a host in "Jakarta" were treated
   * as different cities and charged the out-of-town lead time.
   */
  it('treats city aliases as the same city', () => {
    expect(validateDateRestrictions(tomorrow, 'yes', 'DKI Jakarta', 'jakarta').isValid)
      .toBe(true);
  });

  it('falls back to the SAFER out-of-town window when a city is unknown', () => {
    // Not knowing where someone is must never shorten a shipping deadline.
    expect(validateDateRestrictions(tomorrow, 'yes', '', 'jakarta').isValid).toBe(false);
    expect(validateDateRestrictions(tomorrow, 'yes', 'atlantis', 'jakarta').isValid).toBe(false);
  });
});

describe('validateRequirementsForDateSelection', () => {
  it('requires both answers before a date may be picked', () => {
    expect(validateRequirementsForDateSelection(null, null).isValid).toBe(false);
    expect(validateRequirementsForDateSelection('no', null).isValid).toBe(false);
    expect(validateRequirementsForDateSelection(null, 'Shopee').isValid).toBe(false);
  });

  it('passes once both are answered', () => {
    expect(validateRequirementsForDateSelection('no', 'Shopee')).toEqual({
      isValid: true,
      error: '',
    });
  });

  /**
   * It returns an OBJECT. Two call sites in the redesign tested it for
   * truthiness (`!isRequirementsValid`), which is permanently false for any
   * object — so the stepper never advanced and a hint never rendered. Pinned so
   * the shape stays something a reader has to unwrap.
   */
  it('returns a {isValid, error} object, never a bare boolean', () => {
    const result = validateRequirementsForDateSelection(null, null);
    expect(typeof result).toBe('object');
    expect(Boolean(result)).toBe(true);
    expect(result.isValid).toBe(false);
  });
});

describe('getBulkDateRange', () => {
  const anchor = new Date('2026-08-10T13:45:00');

  it('returns the right span for each mode', () => {
    expect(getBulkDateRange('week', anchor)).toHaveLength(7);
    expect(getBulkDateRange('twoWeeks', anchor)).toHaveLength(14);
    expect(getBulkDateRange('month', anchor)).toHaveLength(30);
  });

  it('starts at midnight of the anchor day, not the anchor instant', () => {
    const [first] = getBulkDateRange('week', anchor);
    expect(first.getHours()).toBe(0);
    expect(first.getDate()).toBe(anchor.getDate());
  });

  it('runs forward without gaps or repeats', () => {
    const days = getBulkDateRange('week', anchor);
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i].getTime() - days[i - 1].getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });
});
