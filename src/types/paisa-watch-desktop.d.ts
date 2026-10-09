export {};

declare global {
  interface Window {
    paisaWatch?: {
      pickDatabaseFile: () => Promise<string | null>;
      pickDatabaseDirectory: () => Promise<string | null>;
    };
  }
}
