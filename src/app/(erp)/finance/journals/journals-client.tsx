"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  PaginationBar,
  Select,
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

export function JournalsClient() {
  const query = useFinanceJournalsQuery();
  const mutation = useFinanceJournalMutation();
  const data = query.data as JournalsData | undefined;
  const journalsPage = useClientPage(data?.journals ?? [], 20);
  const [lines, setLines] = useState<DraftLine[]>([
    {
      accountCode: "6100",
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
  ]);
  const [description, setDescription] = useState("");
  const [postingDate, setPostingDate] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [exchangeRate, setExchangeRate] = useState("1");

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jurnal"
        description="Draft · multi-baris · cost center · multi-currency · reverse"
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
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
                      className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-6"
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
                          next[idx] = { ...next[idx], debit: e.target.value };
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
                          next[idx] = { ...next[idx], credit: e.target.value };
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
                      mutation.mutate({
                        action: "draft",
                        description,
                        postingDate: postingDate || undefined,
                        currency,
                        exchangeRate,
                        lines: payloadLines(),
                      });
                    }}
                  >
                    Simpan draft
                  </Button>
                  <Button
                    type="button"
                    disabled={mutation.isPending || !description}
                    onClick={() => {
                      mutation.mutate({
                        action: "post",
                        description,
                        postingDate: postingDate || undefined,
                        currency,
                        exchangeRate,
                        lines: payloadLines(),
                      });
                    }}
                  >
                    Posting jurnal
                  </Button>
                </div>
                <MutationError error={mutation.error} />
              </div>
            </Card>
            <Card title={`Daftar jurnal (${journalsPage.total})`}>
              {journalsPage.total === 0 ? (
                <EmptyState message="Belum ada jurnal" />
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
                        <td className="px-3 py-2 font-medium">{j.number}</td>
                        <td className="px-3 py-2">
                          {formatDateId(j.postingDate)}
                        </td>
                        <td className="px-3 py-2">{j.description}</td>
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
                        <td className="px-3 py-2">{formatIdr(j.debit)}</td>
                        <td className="px-3 py-2">{formatIdr(j.credit)}</td>
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
    </div>
  );
}
