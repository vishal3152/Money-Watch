/**
 * Builds a case-insensitive "contains" LIKE pattern whose wildcards are escaped,
 * so an owner searching for "50%" matches that literal text instead of every row.
 * Both tiers pair this with `escape '\'`. Callers lower-case the column side.
 */
export function likeContainsPattern(search: string): string {
  const escaped = search.toLowerCase().replace(/[\\%_]/g, (character) => `\\${character}`);
  return `%${escaped}%`;
}
