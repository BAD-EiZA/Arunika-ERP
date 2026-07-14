import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/errors";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(error: unknown, fallbackStatus = 400) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: toErrorMessage(error) },
    { status: fallbackStatus },
  );
}

export async function withApiHandler<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return jsonOk(data);
  } catch (error) {
    return jsonError(error);
  }
}
