export class InvalidCalendarDateError extends Error {
  constructor() {
    super("Enter a valid date.");
    this.name = "InvalidCalendarDateError";
  }
}

export function assertValidCalendarDate(date: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())
  ) {
    throw new InvalidCalendarDateError();
  }
}
