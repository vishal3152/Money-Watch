export class InvalidMinorUnitsError extends Error {
  constructor() {
    super("Minor units must be safe integers.");
    this.name = "InvalidMinorUnitsError";
  }
}

export function assertMinorUnits(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new InvalidMinorUnitsError();
  }
}
