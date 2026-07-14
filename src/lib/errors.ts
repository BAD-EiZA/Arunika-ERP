export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function unauthorized(message = "Tidak terautentikasi") {
  return new AppError("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "Akses ditolak") {
  return new AppError("FORBIDDEN", message, 403);
}

export function notFound(message = "Data tidak ditemukan") {
  return new AppError("NOT_FOUND", message, 404);
}

export function conflict(message: string) {
  return new AppError("CONFLICT", message, 409);
}

export function validationError(message: string, details?: unknown) {
  return new AppError("VALIDATION", message, 422, details);
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan";
}
