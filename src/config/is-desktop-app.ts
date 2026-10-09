export function isDesktopApp(): boolean {
  return process.env.PAISA_WATCH_DESKTOP === "1";
}
