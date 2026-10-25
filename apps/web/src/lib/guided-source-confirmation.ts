/** Confirmation metadata does not change the facts another section reconciles. */
function sourceValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sourceValues);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([key]) => key !== "sourceFactsConfirmed")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sourceValues(entry)] as const)
      .filter(([, entry]) => entry !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

export function guidedSourceValuesChanged(previous: unknown, next: unknown): boolean {
  return JSON.stringify(sourceValues(previous)) !== JSON.stringify(sourceValues(next));
}
