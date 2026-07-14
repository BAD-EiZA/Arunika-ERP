export type PageParams = {
  page: number;
  limit: number;
  skip: number;
};

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function parsePageParams(
  searchParams: URLSearchParams | { get(name: string): string | null },
  defaults: { page?: number; limit?: number; maxLimit?: number } = {},
): PageParams {
  const maxLimit = defaults.maxLimit ?? 100;
  const defaultLimit = defaults.limit ?? 20;
  const defaultPage = defaults.page ?? 1;

  const rawPage = Number(searchParams.get("page") ?? defaultPage);
  const rawLimit = Number(searchParams.get("limit") ?? defaultLimit);

  const page =
    Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit = Math.min(
    maxLimit,
    Math.max(
      1,
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.floor(rawLimit)
        : defaultLimit,
    ),
  );

  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta(
  total: number,
  page: number,
  limit: number,
): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  return {
    page: Math.min(page, totalPages),
    limit,
    total,
    totalPages,
  };
}

export function withPageQuery(url: string, page: number, limit = 20) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}page=${page}&limit=${limit}`;
}
