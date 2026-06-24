/**
 * Races a promise against a deadline.
 * On timeout, rejects with a structured error that includes the label for observability.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[timeout] ${label} exceeded ${ms}ms`)),
        ms
      )
    ),
  ]);
}

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`[timeout] ${label} exceeded ${ms}ms`);
    this.name = "TimeoutError";
  }
}
