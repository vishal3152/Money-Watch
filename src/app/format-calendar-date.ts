import { DISPLAY_LOCALE } from "@/app/format-money";

/**
 * Formats a plain `YYYY-MM-DD` calendar date (FixedDeposit openedDate /
 * maturityDate, a Transfer's date-only display) for display.
 *
 * `new Date(dateOnlyString).toLocaleDateString()` parses the string as
 * UTC midnight, then re-renders it in the viewer's local timezone — west of
 * UTC that shows the previous day. This anchors the format to UTC so the
 * calendar date displayed always matches the input, regardless of viewer
 * timezone.
 */
export function formatCalendarDate(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(DISPLAY_LOCALE, {
    timeZone: "UTC"
  });
}
