"use server";

import { AppError, toErrorMessage } from "@/lib/errors";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export async function runAction<T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: error.message, code: error.code };
    }
    console.error(error);
    return { ok: false, error: toErrorMessage(error) };
  }
}

/** Form action wrapper: Next.js form actions must return void */
export async function runFormAction(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error(error);
    throw error instanceof Error ? error : new Error(toErrorMessage(error));
  }
}
