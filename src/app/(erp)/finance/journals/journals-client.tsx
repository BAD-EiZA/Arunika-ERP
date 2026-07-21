"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useFinanceJournalMutation,
  useFinanceJournalsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  BookOpen,
  CheckCircle2,
  FileEdit,
  Plus,
} from "lucide-react";

type JournalsData = {
  journals: Array<{
    id: string;
    number: string;
    status: string;
    description: string | null;
    postingDate: string;
    journalType?: string;
    currency?: string;
    debit: string;
    credit: string;
    lines?: Array<{
      accountCode: string;
      accountName: string;
      debit: string;
      credit: string;
      description: string | null;
      costCenterCode?: string | null;
      tag?: string | null;
    }>;
  }>;
  accounts: Array<{ id: string; code: string; name: string }>;
  costCenters?: Array<{ id: string; code: string; name: string }>;
};

type DraftLine = {
  accountCode: string;
  debit: string;
  credit: string;
  description: string;
  costCenterCode: string;
  tag: string;
};

type JrFilter = "ALL" | "DRAFT" | "POSTED" | "OTHER";

const emptyLines = (accountCode = "6100"): DraftLine[] => [
  {
    accountCode,
    debit: "",
    credit: "",
    description: "",
    costCenterCode: "",
    tag: "",
  },
  {
    accountCode: "1110",
    debit: "",
    credit: "",
    description: "",
    costCenterCode: "",
    tag: "",
  },
];

function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: string; count?: number }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              active
                ? "border-[#0F4C75] bg-[#0F4C75] text-white"
                : "border-border/70 bg-white text-muted hover:border-[#0F4C75]/30 hover:text-[#0F4C75]",
            )}
          >
            {o.label}
            {typeof o.count === "number" ? (
              <span
                className={cn(
                  "ml-1.5 tabular-nums",
                  active ? "text-white/80" : "text-muted",
                )}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function JournalsClient() {
  const query = useFinanceJournalsQuery();
  const mutation = useFinanceJournalMutation();
  const data = query.data as JournalsData | undefined;
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<JrFilter>("ALL");
  const [lines, setLines] = useState<DraftLine[]>(emptyLines());
  const [description, setDescription] = useState("");
  const [postingDate, setPostingDate] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [exchangeRate, setExchangeRate] = useState("1");

  const journals = data?.journals ?? [];

  const stats = useMemo(() => {
    let draft = 0;
    let posted = 0;
    for (const j of journals) {
      const s = j.status.toUpperCase();
      if (s === "DRAFT") draft += 1;
      else if (s === "POSTED") posted += 1;
    }
    return { draft, posted, total: journals.length };
  }, [journals]);

  const filtered = useMemo(() => {
    return journals.filter((j) => {
      const s = j.status.toUpperCase();
      if (filter === "DRAFT") return s === "DRAFT";
      if (filter === "POSTED") return s === "POSTED";
      if (filter === "OTHER") return s !== "DRAFT" && s !== "POSTED";
      return true;
    });
  }, [journals, filter]);

  const journalsPage = useClientPage(filtered, 20);

  function payloadLines() {
    return lines
      .map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit || "0",
        credit: l.credit || "0",
        description: l.description || undefined,
        costCenterCode: l.costCenterCode || undefined,
        tag: l.tag || undefined,
      }))
      .filter((l) => Number(l.debit) > 0 || Number(l.credit) > 0);
  }

  function resetForm() {
    setDescription("");
    setPostingDate("");
    setCurrency("IDR");
    setExchangeRate("1");
    setLines(emptyLines(data?.accounts[0]?.code || "6100"));
  }

  const lineDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const lineCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced =
    Math.abs(lineDebit - lineCredit) < 0.005 && (lineDebit > 0 || lineCredit > 0);

  return (
    <ListPageShell>
      <PageHeader
        title="Jurnal"
        description="Draft multi-baris · cost center · multi-currency · reverse"
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Jurnal manual"}
          </Button>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat jurnal..."
      >
        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Total jurnal"
                value={stats.total}
                icon={BookOpen}
              />
              <StatCard label="Draft" value={stats.draft} icon={FileEdit} />
              <StatCard
                label="Posted"
                value={stats.posted}
                icon={CheckCircle2}
              />
            </div>

            {showCreate ? (
              <Card title="Jurnal manual (multi-baris)">
                <div className="space-y-3">
                  <FormGrid>
                    <Field label="Deskripsi">
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                      />
                    </Field>
                    <Field label="Tanggal posting">
                      <Input
                        type="date"
                        value={postingDate}
                        onChange={(e) => setPostingDate(e.target.value)}
                      />
                    </Field>
                    <Field label="Mata uang">
                      <Select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                      >
                        <option value="IDR">IDR</option>
                        <option value="USD">USD</option>
                        <option value="SGD">SGD</option>
                        <option value="EUR">EUR</option>
                      </Select>
                    </Field>
                    <Field label="Kurs → IDR">
                      <Input
                        type="number"
                        step="0.0001"
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(e.target.value)}
                      />
                    </Field>
                  </FormGrid>
                  <div className="space-y-2">
                    {lines.map((line, idx) => (
                      <div
                        key={idx}
                        className="grid gap-2 rounded-2xl border border-border/70 bg-[#f7fafc] p-2 sm:grid-cols-6"
                      >
                        <Select
                          value={line.accountCode}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx] = {
                              ...next[idx],
                              accountCode: e.target.value,
                            };
                            setLines(next);
                          }}
                        >
                          {data.accounts.map((a) => (
                            <option key={a.id} value={a.code}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </Select>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Debit"
                          value={line.debit}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx] = {
                              ...next[idx],
                              debit: e.target.value,
                            };
                            setLines(next);
                          }}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Kredit"
                          value={line.credit}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx] = {
                              ...next[idx],
                              credit: e.target.value,
                            };
                            setLines(next);
                          }}
                        />
                        <Select
                          value={line.costCenterCode}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx] = {
                              ...next[idx],
                              costCenterCode: e.target.value,
                            };
                            setLines(next);
                          }}
                        >
                          <option value="">— CC —</option>
                          {(data.costCenters ?? []).map((c) => (
                            <option key={c.id} value={c.code}>
                              {c.code}
                            </option>
                          ))}
                        </Select>
                        <Input
                          placeholder="Tag"
                          value={line.tag}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx] = { ...next[idx], tag: e.target.value };
                            setLines(next);
                          }}
                        />
                        <div className="flex gap-1">
                          <Input
                            placeholder="Ket."
                            value={line.description}
                            onChange={(e) => {
                              const next = [...lines];
                              next[idx] = {
                                ...next[idx],
                                description: e.target.value,
                              };
                              setLines(next);
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={lines.length <= 2}
                            onClick={() =>
                              setLines(lines.filter((_, i) => i !== idx))
                            }
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span>
                      Debit{" "}
                      <strong className="tabular-nums text-[#0F4C75]">
                        {formatIdr(lineDebit)}
                      </strong>
                    </span>
                    <span>
                      Kredit{" "}
                      <strong className="tabular-nums text-[#0F4C75]">
                        {formatIdr(lineCredit)}
                      </strong>
                    </span>
                    <Badge tone={balanced ? "success" : "warning"}>
                      {balanced ? "Seimbang" : "Belum seimbang"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setLines([
                          ...lines,
                          {
                            accountCode: data.accounts[0]?.code || "6100",
                            debit: "",
                            credit: "",
                            description: "",
                            costCenterCode: "",
                            tag: "",
                          },
                        ])
                      }
                    >
                      + Baris
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={mutation.isPending || !description}
                      onClick={() => {
                        mutation.mutate(
                          {
                            action: "draft",
                            description,
                            postingDate: postingDate || undefined,
                            currency,
                            exchangeRate,
                            lines: payloadLines(),
                          },
                          {
                            onSuccess: () => {
                              resetForm();
                              setShowCreate(false);
                            },
                          },
                        );
                      }}
                    >
                      Simpan draft
                    </Button>
                    <Button
                      type="button"
                      disabled={mutation.isPending || !description}
                      onClick={() => {
                        mutation.mutate(
                          {
                            action: "post",
                            description,
                            postingDate: postingDate || undefined,
                            currency,
                            exchangeRate,
                            lines: payloadLines(),
                          },
                          {
                            onSuccess: () => {
                              resetForm();
                              setShowCreate(false);
                            },
                          },
                        );
                      }}
                    >
                      Posting jurnal
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowCreate(false)}
                    >
                      Batal
                    </Button>
                  </div>
                  <MutationError error={mutation.error} />
                </div>
              </Card>
            ) : null}

            <Card
              title={`Daftar jurnal (${filtered.length}${
                filter !== "ALL" ? ` / ${journals.length}` : ""
              })`}
            >
              <div className="mb-4">
                <FilterChips
                  value={filter}
                  onChange={(v) => {
                    setFilter(v);
                    journalsPage.setPage(1);
                  }}
                  options={[
                    {
                      id: "ALL" as const,
                      label: "Semua",
                      count: stats.total,
                    },
                    {
                      id: "DRAFT" as const,
                      label: "Draft",
                      count: stats.draft,
                    },
                    {
                      id: "POSTED" as const,
                      label: "Posted",
                      count: stats.posted,
                    },
                    { id: "OTHER" as const, label: "Lainnya" },
                  ]}
                />
              </div>

              {journalsPage.total === 0 ? (
                <EmptyState
                  compact
                  icon={BookOpen}
                  title={
                    filter === "ALL"
                      ? "Belum ada jurnal"
                      : "Tidak ada di filter ini"
                  }
                  message={
                    filter === "ALL"
                      ? "Buat jurnal manual multi-baris atau tunggu posting otomatis dari dokumen."
                      : "Coba filter lain."
                  }
                  action={
                    filter === "ALL" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowCreate(true)}
                      >
                        <Plus className="mr-1.5 size-4" />
                        Jurnal manual
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <Table
                    headers={[
                      "Nomor",
                      "Tanggal",
                      "Deskripsi",
                      "CCY",
                      "Status",
                      "Debit",
                      "Kredit",
                      "Aksi",
                    ]}
                  >
                    {journalsPage.items.map((j) => (
                      <tr key={j.id}>
                        <td className="px-3 py-2 font-medium text-[#0F4C75]">
                          {j.number}
                        </td>
                        <td className="px-3 py-2">
                          {formatDateId(j.postingDate)}
                        </td>
                        <td className="max-w-[12rem] truncate px-3 py-2">
                          {j.description}
                        </td>
                        <td className="px-3 py-2">{j.currency ?? "IDR"}</td>
                        <td className="px-3 py-2">
                          <Badge
                            tone={
                              j.status === "POSTED"
                                ? "success"
                                : j.status === "DRAFT"
                                  ? "warning"
                                  : "default"
                            }
                          >
                            {j.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatIdr(j.debit)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatIdr(j.credit)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Link href={`/finance/journals/${j.id}`}>
                              <Button type="button" variant="ghost">
                                Detail
                              </Button>
                            </Link>
                            {j.status === "DRAFT" ? (
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={mutation.isPending}
                                onClick={() =>
                                  mutation.mutate({
                                    action: "post_draft",
                                    id: j.id,
                                  })
                                }
                              >
                                Post
                              </Button>
                            ) : null}
                            {j.status === "POSTED" ? (
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={mutation.isPending}
                                onClick={() =>
                                  mutation.mutate({
                                    action: "reverse",
                                    id: j.id,
                                  })
                                }
                              >
                                Reverse
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={journalsPage.page}
                    totalPages={journalsPage.totalPages}
                    total={journalsPage.total}
                    limit={journalsPage.limit}
                    onPageChange={journalsPage.setPage}
                  />
                </>
              )}
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
