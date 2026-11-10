export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new ApiError(message || "Request gagal", res.status);
  }
  return res.json() as Promise<T>;
}

const pendingAttempts = new Map<string, { key: string; count: number }>();

export async function apiPost<T>(
  url: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const attempt = `${url}:${payload}`;
  const pending = idempotencyKey ? undefined : pendingAttempts.get(attempt) ?? { key: crypto.randomUUID(), count: 0 };
  if (pending) {
    pending.count++;
    pendingAttempts.set(attempt, pending);
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey ?? pending!.key,
      },
      credentials: "same-origin",
      body: body === undefined ? undefined : payload,
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        // ignore
      }
      throw new ApiError(message || "Request gagal", res.status);
    }
    return await res.json() as T;
  } finally {
    if (pending && --pending.count === 0) pendingAttempts.delete(attempt);
  }
}

export function formToObject(form: HTMLFormElement | FormData) {
  const fd = form instanceof FormData ? form : new FormData(form);
  const obj: Record<string, string> = {};
  fd.forEach((value, key) => {
    if (typeof value === "string") obj[key] = value;
  });
  return obj;
}
