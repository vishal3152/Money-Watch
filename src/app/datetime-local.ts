/** Format a Date for `<input type="datetime-local">` (local wall clock, no Z). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Format a Date for `<input type="date">` (local wall clock).
 * `date.toISOString().slice(0, 10)` reads the UTC calendar date instead,
 * which is off by a day near midnight for any viewer not on UTC.
 */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
