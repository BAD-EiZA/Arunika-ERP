import { randomUUID } from "crypto";

export function newIdempotencyKey(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}:${id}` : id;
}

export function requestId(): string {
  return randomUUID();
}
