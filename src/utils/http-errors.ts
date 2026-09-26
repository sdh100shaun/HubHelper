export function statusOf(err: unknown): number | null {
  if (typeof err === 'object' && err !== null) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return null;
}

export function describeError(err: unknown): string {
  const status = statusOf(err);
  if (status !== null) return `HTTP ${status}`;
  return err instanceof Error ? err.message : String(err);
}
