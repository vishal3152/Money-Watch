export function resolveAppUrl({ port }: { port: number }): string {
  return `http://127.0.0.1:${port}`;
}
