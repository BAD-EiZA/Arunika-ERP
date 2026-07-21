"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  ListPageShell,
  PageHeader,
  PaginationBar,
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useClientPage } from "@/hooks/use-client-page";
import {
  mergeStageOrder,
  useCrmBoardOrder,
} from "@/hooks/use-crm-board-order";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  GripVertical,
  Kanban,
  Plus,
  Trophy,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";

const DND_MIME = "application/x-arunika-opp";

type Opp = {
  id: string;
  title: string;
  stage: string;
  amount: string;
  probability: number;
  status: string;
};

type CrmData = {
  leads: Array<{
    id: string;
    name: string;
    email: string | null;
    status: string;
    source: string | null;
  }>;
  opportunities: Opp[];
};

const STAGES = [
  {
    id: "QUALIFICATION",
    label: "Qualification",
    probability: 20,
    tone: "bg-[#E8F4FC] border-[#BBE1FA] text-[#0F4C75]",
    header: "bg-[#E8F4FC] text-[#0F4C75]",
  },
  {
    id: "PROPOSAL",
    label: "Proposal",
    probability: 45,
    tone: "bg-white border-[#3282B8]/25 text-[#0F4C75]",
    header: "bg-[#d6ebf8] text-[#0F4C75]",
  },
  {
    id: "NEGOTIATION",
    label: "Negotiation",
    probability: 70,
    tone: "bg-white border-[#0F4C75]/20 text-[#0F4C75]",
    header: "bg-[#c5dff0] text-[#0F4C75]",
  },
  {
    id: "WON",
    label: "Won",
    probability: 100,
    tone: "bg-emerald-50 border-emerald-200 text-emerald-900",
    header: "bg-emerald-100 text-emerald-900",
  },
  {
    id: "LOST",
    label: "Lost",
    probability: 0,
    tone: "bg-slate-50 border-slate-200 text-slate-600",
    header: "bg-slate-100 text-slate-700",
  },
] as const;

type StageId = (typeof STAGES)[number]["id"];

function stageIndex(stage: string) {
  const i = STAGES.findIndex((s) => s.id === stage);
  return i >= 0 ? i : 0;
}

function isStageId(v: string): v is StageId {
  return STAGES.some((s) => s.id === v);
}

type DropTarget = { stageId: StageId; index: number };

type GhostState = {
  oppId: string;
  title: string;
  amount: string;
  x: number;
  y: number;
  w: number;
  h: number;
  offsetX: number;
  offsetY: number;
};

export function CrmClient() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["crm"],
    queryFn: () => apiGet<CrmData>("/api/erp/crm"),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/crm", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["crm"] });
    },
  });
  const data = query.data;
  const leadsPage = useClientPage(data?.leads ?? [], 10);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showOppForm, setShowOppForm] = useState(false);

  const { order, ready, placeOpp, syncStages } = useCrmBoardOrder();

  const [dragOppId, setDragOppId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const pointerSession = useRef<{
    oppId: string;
    fromStage: StageId;
    pointerId: number;
    active: boolean;
  } | null>(null);

  // Group + order cards
  const byStage = useMemo(() => {
    const raw = new Map<StageId, Opp[]>();
    for (const s of STAGES) raw.set(s.id, []);
    for (const o of data?.opportunities ?? []) {
      const key = isStageId(o.stage) ? o.stage : "QUALIFICATION";
      raw.get(key)!.push(o);
    }
    const ordered = new Map<StageId, Opp[]>();
    for (const s of STAGES) {
      const list = raw.get(s.id) ?? [];
      const byId = new Map(list.map((o) => [o.id, o]));
      const ids = mergeStageOrder(
        order[s.id],
        list.map((o) => o.id),
      );
      ordered.set(
        s.id,
        ids.map((id) => byId.get(id)!).filter(Boolean),
      );
    }
    return ordered;
  }, [data?.opportunities, order]);

  // Keep storage in sync when server list changes
  useEffect(() => {
    if (!ready || !data) return;
    const map: Record<string, string[]> = {};
    for (const s of STAGES) {
      map[s.id] = (data.opportunities ?? [])
        .filter((o) =>
          isStageId(o.stage) ? o.stage === s.id : s.id === "QUALIFICATION",
        )
        .map((o) => o.id);
    }
    // only seed missing stages / new ids via merge inside syncStages
    syncStages(map);
  }, [data?.opportunities, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const pipelineValue = useMemo(() => {
    return (data?.opportunities ?? [])
      .filter((o) => o.stage !== "LOST" && o.stage !== "WON")
      .reduce((s, o) => s + (Number(o.amount) || 0), 0);
  }, [data?.opportunities]);

  const applyMove = useCallback(
    (oppId: string, stageId: StageId, index: number, fromStage: string) => {
      placeOpp(oppId, stageId, index);

      const stageChanged = fromStage !== stageId;
      if (!stageChanged) return;

      const meta = STAGES.find((s) => s.id === stageId)!;
      const prev = qc.getQueryData<CrmData>(["crm"]);
      if (prev) {
        qc.setQueryData<CrmData>(["crm"], {
          ...prev,
          opportunities: prev.opportunities.map((o) =>
            o.id === oppId
              ? {
                  ...o,
                  stage: stageId,
                  probability: meta.probability,
                  status:
                    stageId === "WON" || stageId === "LOST"
                      ? "CLOSED"
                      : "OPEN",
                }
              : o,
          ),
        });
      }
      mutation.mutate(
        {
          action: "opportunity_stage",
          id: oppId,
          stage: stageId,
          probability: meta.probability,
        },
        {
          onError: () => {
            if (prev) qc.setQueryData(["crm"], prev);
          },
        },
      );
    },
    [mutation, placeOpp, qc],
  );

  function resolveDropIndex(
    stageId: StageId,
    clientY: number,
    excludeId?: string | null,
  ): number {
    const cards = (byStage.get(stageId) ?? []).filter(
      (c) => c.id !== excludeId,
    );
    if (cards.length === 0) return 0;
    for (let i = 0; i < cards.length; i++) {
      const el = document.querySelector(
        `[data-opp-card="${cards[i].id}"]`,
      ) as HTMLElement | null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (clientY < mid) return i;
    }
    return cards.length;
  }

  function hitStage(clientX: number, clientY: number): StageId | null {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const col = (el as HTMLElement).closest?.("[data-stage-col]");
      if (col) {
        const id = col.getAttribute("data-stage-col");
        if (id && isStageId(id)) return id;
      }
    }
    return null;
  }

  // ── HTML5 drag (desktop) ──
  function onCardDragStart(
    e: DragEvent,
    oppId: string,
    fromStage: StageId,
  ) {
    e.dataTransfer.setData(DND_MIME, oppId);
    e.dataTransfer.setData("text/plain", oppId);
    e.dataTransfer.setData("application/x-arunika-from", fromStage);
    e.dataTransfer.effectAllowed = "move";
    setDragOppId(oppId);
  }

  function onCardDragEnd() {
    setDragOppId(null);
    setDropTarget(null);
  }

  function onColumnDragOver(e: DragEvent, stageId: StageId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const index = resolveDropIndex(stageId, e.clientY, dragOppId);
    setDropTarget({ stageId, index });
  }

  function onColumnDrop(e: DragEvent, stageId: StageId) {
    e.preventDefault();
    const id =
      e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData("text/plain");
    const from = e.dataTransfer.getData("application/x-arunika-from");
    const index = resolveDropIndex(stageId, e.clientY, id);
    setDragOppId(null);
    setDropTarget(null);
    if (!id || mutation.isPending) return;
    applyMove(id, stageId, index, from || stageId);
  }

  // ── Touch / pointer polyfill (grip handle) ──
  function onGripPointerDown(
    e: ReactPointerEvent,
    opp: Opp,
    fromStage: StageId,
  ) {
    if (mutation.isPending || e.button !== 0) return;
    // skip pure mouse — HTML5 drag handles it; still allow touch/pen
    if (e.pointerType === "mouse") return;

    e.preventDefault();
    e.stopPropagation();
    const card = (e.currentTarget as HTMLElement).closest(
      "[data-opp-card]",
    ) as HTMLElement | null;
    const rect = card?.getBoundingClientRect();
    const w = rect?.width ?? 240;
    const h = rect?.height ?? 100;
    const offsetX = rect ? e.clientX - rect.left : 20;
    const offsetY = rect ? e.clientY - rect.top : 20;

    pointerSession.current = {
      oppId: opp.id,
      fromStage,
      pointerId: e.pointerId,
      active: true,
    };
    setDragOppId(opp.id);
    setGhost({
      oppId: opp.id,
      title: opp.title,
      amount: opp.amount,
      x: e.clientX - offsetX,
      y: e.clientY - offsetY,
      w,
      h,
      offsetX,
      offsetY,
    });

    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onGripPointerMove(e: ReactPointerEvent) {
    const sess = pointerSession.current;
    if (!sess?.active || sess.pointerId !== e.pointerId) return;
    e.preventDefault();

    setGhost((g) =>
      g
        ? {
            ...g,
            x: e.clientX - g.offsetX,
            y: e.clientY - g.offsetY,
          }
        : g,
    );

    const stageId = hitStage(e.clientX, e.clientY);
    if (stageId) {
      const index = resolveDropIndex(stageId, e.clientY, sess.oppId);
      setDropTarget({ stageId, index });
    } else {
      setDropTarget(null);
    }
  }

  function onGripPointerUp(e: ReactPointerEvent) {
    const sess = pointerSession.current;
    if (!sess?.active || sess.pointerId !== e.pointerId) return;

    const stageId = hitStage(e.clientX, e.clientY);
    const target = stageId
      ? {
          stageId,
          index: resolveDropIndex(stageId, e.clientY, sess.oppId),
        }
      : dropTarget;

    if (target && !mutation.isPending) {
      applyMove(sess.oppId, target.stageId, target.index, sess.fromStage);
    }

    pointerSession.current = null;
    setDragOppId(null);
    setDropTarget(null);
    setGhost(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // already released
    }
  }

  function onGripPointerCancel(e: ReactPointerEvent) {
    if (pointerSession.current?.pointerId === e.pointerId) {
      pointerSession.current = null;
      setDragOppId(null);
      setDropTarget(null);
      setGhost(null);
    }
  }

  return (
    <ListPageShell>
      <PageHeader
        title="CRM"
        description="Lead & pipeline — seret antar kolom, urutkan dalam kolom (touch-friendly)"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowLeadForm((v) => !v);
                setShowOppForm(false);
              }}
            >
              <UserPlus className="mr-1.5 size-4" />
              Lead
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowOppForm((v) => !v);
                setShowLeadForm(false);
              }}
            >
              <Plus className="mr-1.5 size-4" />
              Opportunity
            </Button>
          </div>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat CRM..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[0_2px_8px_rgba(15,76,117,0.04)]">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Users className="size-3.5" />
                  Leads
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-[#0F4C75]">
                  {data.leads.length}
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[0_2px_8px_rgba(15,76,117,0.04)]">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Kanban className="size-3.5" />
                  Opportunities
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-[#0F4C75]">
                  {data.opportunities.length}
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[0_2px_8px_rgba(15,76,117,0.04)]">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  <CircleDollarSign className="size-3.5" />
                  Pipeline terbuka
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-[#0F4C75]">
                  {formatIdr(pipelineValue)}
                </div>
              </div>
            </div>

            {showLeadForm ? (
              <Card title="Lead baru">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "lead",
                        ...formToObject(e.currentTarget),
                      },
                      { onSuccess: () => setShowLeadForm(false) },
                    );
                    e.currentTarget.reset();
                  }}
                >
                  <FormGrid>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                    <Field label="Email">
                      <Input name="email" type="email" />
                    </Field>
                    <Field label="Telepon">
                      <Input name="phone" />
                    </Field>
                    <Field label="Perusahaan">
                      <Input name="companyName" />
                    </Field>
                    <Field label="Sumber">
                      <Input name="source" placeholder="Web / Referral" />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Simpan lead
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowLeadForm(false)}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            {showOppForm ? (
              <Card title="Opportunity baru">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "opportunity",
                        ...formToObject(e.currentTarget),
                      },
                      { onSuccess: () => setShowOppForm(false) },
                    );
                    e.currentTarget.reset();
                  }}
                >
                  <FormGrid>
                    <Field label="Judul">
                      <Input name="title" required />
                    </Field>
                    <Field label="Lead">
                      <Select name="leadId" defaultValue="">
                        <option value="">—</option>
                        {data.leads.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Nilai">
                      <Input
                        name="amount"
                        type="number"
                        step="0.01"
                        defaultValue="0"
                      />
                    </Field>
                    <Field label="Stage">
                      <Select name="stage" defaultValue="QUALIFICATION">
                        {STAGES.filter((s) => s.id !== "LOST").map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Buat opportunity
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowOppForm(false)}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            {/* Kanban */}
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0F4C75]">
                  <Kanban className="size-4" />
                  Pipeline board
                </div>
                <p className="text-xs text-muted">
                  Desktop: seret kartu · Touch: tahan grip lalu geser · urutan
                  kolom tersimpan lokal
                </p>
              </div>
              {data.opportunities.length === 0 ? (
                <EmptyState
                  icon={Kanban}
                  title="Pipeline kosong"
                  message="Buat opportunity untuk mengisi kolom stage."
                  action={
                    <Button type="button" onClick={() => setShowOppForm(true)}>
                      <Plus className="mr-1.5 size-4" />
                      Opportunity
                    </Button>
                  }
                />
              ) : (
                <div className="-mx-1 overflow-x-auto pb-2">
                  <div className="flex min-w-max gap-3 px-1">
                    {STAGES.map((stage) => {
                      const cards = byStage.get(stage.id) ?? [];
                      const colTotal = cards.reduce(
                        (s, o) => s + (Number(o.amount) || 0),
                        0,
                      );
                      const isOver = dropTarget?.stageId === stage.id;
                      const insertAt = isOver ? dropTarget!.index : -1;

                      return (
                        <div
                          key={stage.id}
                          data-stage-col={stage.id}
                          className={cn(
                            "flex w-[260px] shrink-0 flex-col rounded-2xl border bg-[#f5fafd]/80 transition-all duration-200",
                            isOver
                              ? "border-[#0F4C75] bg-[#E8F4FC]/90 ring-2 ring-[#0F4C75]/25"
                              : "border-border/60",
                          )}
                          onDragOver={(e) => onColumnDragOver(e, stage.id)}
                          onDragLeave={(e) => {
                            if (
                              !e.currentTarget.contains(
                                e.relatedTarget as Node,
                              )
                            ) {
                              setDropTarget((t) =>
                                t?.stageId === stage.id ? null : t,
                              );
                            }
                          }}
                          onDrop={(e) => onColumnDrop(e, stage.id)}
                        >
                          <div
                            className={cn(
                              "flex items-center justify-between rounded-t-2xl px-3 py-2.5",
                              stage.header,
                            )}
                          >
                            <div>
                              <div className="text-xs font-bold uppercase tracking-wide">
                                {stage.label}
                              </div>
                              <div className="text-[11px] opacity-70">
                                {cards.length} · {formatIdr(colTotal)}
                              </div>
                            </div>
                            <span className="rounded-full bg-white/50 px-2 py-0.5 text-xs font-semibold tabular-nums">
                              {cards.length}
                            </span>
                          </div>

                          <div className="flex min-h-[140px] max-h-[min(60vh,560px)] flex-col gap-1 overflow-y-auto p-2">
                            {cards.length === 0 && insertAt < 0 ? (
                              <div
                                className={cn(
                                  "rounded-xl border border-dashed px-2 py-8 text-center text-[11px] transition",
                                  isOver
                                    ? "border-[#0F4C75] bg-white text-[#0F4C75]"
                                    : "border-border/70 text-muted",
                                )}
                              >
                                {isOver ? "Lepas di sini" : "Tidak ada kartu"}
                              </div>
                            ) : null}

                            {cards.length === 0 && insertAt === 0 ? (
                              <DropLine />
                            ) : null}

                            {cards.map((o, i) => {
                              const idx = stageIndex(o.stage);
                              const prev = STAGES[idx - 1];
                              const next = STAGES[idx + 1];
                              const dragging = dragOppId === o.id;
                              return (
                                <div key={o.id}>
                                  {insertAt === i ? <DropLine /> : null}
                                  <div
                                    data-opp-card={o.id}
                                    draggable={
                                      !mutation.isPending && !ghost
                                    }
                                    onDragStart={(e) =>
                                      onCardDragStart(e, o.id, stage.id)
                                    }
                                    onDragEnd={onCardDragEnd}
                                    className={cn(
                                      "rounded-xl border bg-white p-3 shadow-sm transition hover:shadow-md",
                                      stage.tone,
                                      dragging &&
                                        "opacity-40 scale-[0.98] ring-2 ring-[#0F4C75]/30",
                                      !mutation.isPending &&
                                        "cursor-grab active:cursor-grabbing",
                                    )}
                                  >
                                    <div className="flex items-start gap-1.5">
                                      <button
                                        type="button"
                                        aria-label="Seret kartu"
                                        className="mt-0.5 touch-none rounded p-0.5 opacity-50 hover:bg-black/5 hover:opacity-100"
                                        onPointerDown={(e) =>
                                          onGripPointerDown(e, o, stage.id)
                                        }
                                        onPointerMove={onGripPointerMove}
                                        onPointerUp={onGripPointerUp}
                                        onPointerCancel={onGripPointerCancel}
                                      >
                                        <GripVertical
                                          className="size-4"
                                          aria-hidden
                                        />
                                      </button>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold leading-snug">
                                          {o.title}
                                        </div>
                                        <div className="mt-1.5 text-base font-bold tabular-nums">
                                          {formatIdr(o.amount)}
                                        </div>
                                        <div className="mt-1 flex items-center justify-between text-[11px] opacity-70">
                                          <span>{o.probability}%</span>
                                          <Badge
                                            tone={
                                              o.status === "CLOSED"
                                                ? "success"
                                                : "default"
                                            }
                                          >
                                            {o.status}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                    <div
                                      className="mt-3 flex items-center gap-1"
                                      onPointerDown={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        disabled={!prev || mutation.isPending}
                                        title={
                                          prev
                                            ? `Ke ${prev.label}`
                                            : undefined
                                        }
                                        className="flex size-8 items-center justify-center rounded-lg border border-current/15 bg-white/60 disabled:opacity-30"
                                        onClick={() =>
                                          prev &&
                                          applyMove(
                                            o.id,
                                            prev.id,
                                            (byStage.get(prev.id) ?? [])
                                              .length,
                                            stage.id,
                                          )
                                        }
                                      >
                                        <ChevronLeft className="size-4" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!next || mutation.isPending}
                                        title={
                                          next
                                            ? `Ke ${next.label}`
                                            : undefined
                                        }
                                        className="flex size-8 items-center justify-center rounded-lg border border-current/15 bg-white/60 disabled:opacity-30"
                                        onClick={() =>
                                          next &&
                                          applyMove(
                                            o.id,
                                            next.id,
                                            (byStage.get(next.id) ?? [])
                                              .length,
                                            stage.id,
                                          )
                                        }
                                      >
                                        <ChevronRight className="size-4" />
                                      </button>
                                      <div className="ml-auto flex gap-1">
                                        {stage.id !== "WON" ? (
                                          <button
                                            type="button"
                                            title="Mark won"
                                            disabled={mutation.isPending}
                                            className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white disabled:opacity-40"
                                            onClick={() =>
                                              applyMove(
                                                o.id,
                                                "WON",
                                                (byStage.get("WON") ?? [])
                                                  .length,
                                                stage.id,
                                              )
                                            }
                                          >
                                            <Trophy className="size-3.5" />
                                          </button>
                                        ) : null}
                                        {stage.id !== "LOST" ? (
                                          <button
                                            type="button"
                                            title="Mark lost"
                                            disabled={mutation.isPending}
                                            className="flex size-8 items-center justify-center rounded-lg bg-slate-500 text-white disabled:opacity-40"
                                            onClick={() =>
                                              applyMove(
                                                o.id,
                                                "LOST",
                                                (byStage.get("LOST") ?? [])
                                                  .length,
                                                stage.id,
                                              )
                                            }
                                          >
                                            <XCircle className="size-3.5" />
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {insertAt === cards.length && cards.length > 0 ? (
                              <DropLine />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <Card title={`Leads (${leadsPage.total})`}>
              {leadsPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={Users}
                  title="Belum ada lead"
                  message="Tambah lead untuk mengisi funnel."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowLeadForm(true)}
                    >
                      <UserPlus className="mr-1.5 size-4" />
                      Lead baru
                    </Button>
                  }
                />
              ) : (
                <>
                  <Table headers={["Nama", "Email", "Sumber", "Status", "Aksi"]}>
                    {leadsPage.items.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {l.name}
                        </td>
                        <td className="px-3 py-2">{l.email || "-"}</td>
                        <td className="px-3 py-2">{l.source || "-"}</td>
                        <td className="px-3 py-2">
                          <Badge
                            tone={
                              l.status === "QUALIFIED" ? "success" : "default"
                            }
                          >
                            {l.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {l.status !== "QUALIFIED" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                mutation.mutate({
                                  action: "lead_status",
                                  id: l.id,
                                  status: "QUALIFIED",
                                })
                              }
                              disabled={mutation.isPending}
                            >
                              Qualify
                            </Button>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={leadsPage.page}
                    totalPages={leadsPage.totalPages}
                    total={leadsPage.total}
                    limit={leadsPage.limit}
                    onPageChange={leadsPage.setPage}
                  />
                </>
              )}
            </Card>
          </>
        ) : null}
      </QueryBoundary>

      {/* Touch ghost */}
      {ghost ? (
        <div
          className="pointer-events-none fixed z-[100] rounded-xl border border-[#0F4C75] bg-white p-3 shadow-2xl ring-2 ring-[#0F4C75]/20"
          style={{
            left: ghost.x,
            top: ghost.y,
            width: ghost.w,
            opacity: 0.92,
            transform: "rotate(2deg)",
          }}
        >
          <div className="text-sm font-semibold text-[#0F4C75]">
            {ghost.title}
          </div>
          <div className="mt-1 text-sm font-bold tabular-nums text-[#0F4C75]">
            {formatIdr(ghost.amount)}
          </div>
        </div>
      ) : null}
    </ListPageShell>
  );
}

function DropLine() {
  return (
    <div
      className="my-0.5 h-1 rounded-full bg-[#0F4C75] shadow-[0_0_0_2px_rgba(15,76,117,0.15)]"
      aria-hidden
    />
  );
}
