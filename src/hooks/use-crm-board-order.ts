"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "arunika.crm.boardOrder.v1";

/** stageId -> ordered opportunity ids */
export type BoardOrder = Record<string, string[]>;

function readStorage(): BoardOrder {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BoardOrder;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(order: BoardOrder) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // quota / private mode
  }
}

/** Merge server ids into saved order: keep known order, append newcomers */
export function mergeStageOrder(
  saved: string[] | undefined,
  ids: string[],
): string[] {
  const set = new Set(ids);
  const kept = (saved ?? []).filter((id) => set.has(id));
  const known = new Set(kept);
  const rest = ids.filter((id) => !known.has(id));
  return [...kept, ...rest];
}

export function useCrmBoardOrder() {
  const [order, setOrder] = useState<BoardOrder>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOrder(readStorage());
    setReady(true);
  }, []);

  const persist = useCallback((next: BoardOrder) => {
    setOrder(next);
    writeStorage(next);
  }, []);

  /** Place opp at index in stage (removes from other stages) */
  const placeOpp = useCallback(
    (oppId: string, stageId: string, index: number) => {
      setOrder((prev) => {
        const next: BoardOrder = {};
        for (const [k, list] of Object.entries(prev)) {
          next[k] = list.filter((id) => id !== oppId);
        }
        const col = [...(next[stageId] ?? [])].filter((id) => id !== oppId);
        const i = Math.max(0, Math.min(index, col.length));
        col.splice(i, 0, oppId);
        next[stageId] = col;
        writeStorage(next);
        return next;
      });
    },
    [],
  );

  const syncStages = useCallback(
    (byStage: Record<string, string[]>) => {
      setOrder((prev) => {
        const next: BoardOrder = { ...prev };
        for (const [stage, ids] of Object.entries(byStage)) {
          next[stage] = mergeStageOrder(prev[stage], ids);
        }
        writeStorage(next);
        return next;
      });
    },
    [],
  );

  return { order, ready, placeOpp, syncStages, persist };
}
