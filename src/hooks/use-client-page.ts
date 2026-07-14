"use client";

import { useEffect, useMemo, useState } from "react";

export function useClientPage<T>(items: T[], limit = 20) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = useMemo(
    () => items.slice((safePage - 1) * limit, safePage * limit),
    [items, safePage, limit],
  );

  return {
    page: safePage,
    setPage,
    limit,
    total,
    totalPages,
    items: slice,
  };
}
