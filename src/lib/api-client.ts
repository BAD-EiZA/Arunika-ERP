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

export async function apiPost<T>(
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
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
  return res.json() as Promise<T>;
}

export function formToObject(form: HTMLFormElement | FormData) {
  const fd = form instanceof FormData ? form : new FormData(form);
  const obj: Record<string, string> = {};
  fd.forEach((value, key) => {
    if (typeof value === "string") obj[key] = value;
  });
  return obj;
}
