"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  ListPageShell,
  PageHeader,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import {
  useFinanceJournalMutation,
} from "@/hooks/use-erp-queries";
import { apiGet } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

type JournalDetail = {
  journal: {
    id: string;
    number: string;
    status: string;
    description: string | null;
    postingDate: string;
    journalType: string;
    currency: string;
    exchangeRate: string;
    debit: string;
    credit: string;
    period: string | null;
    reversalOfNumber: string | null;
    reversedBy: string[];
    lines: Array<{
      accountCode: string;
      accountName: string;
      debit: string;
      credit: string;
      description: string | null;
      costCenterCode: string | null;
      tag: string | null;
    }>;
  };
};

export function JournalDetailClient({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["finance", "journal", id],
    queryFn: () =>
      apiGet<JournalDetail>(`/api/erp/finance/journals?id=${encodeURIComponent(id)}`),
  });
  const mutation = useFinanceJournalMutation();
  const j = query.data?.journal;

  return (
    <ListPageShell>
      <PageHeader
        title={j ? `Jurnal ${j.number}` : "Detail jurnal"}
        description="Baris · cost center · reverse"
        crumbs={[
          { label: "ERP", href: "/dashboard" },
          { label: "Jurnal", href: "/finance/journals" },
          { label: j?.number ?? "Detail" },
        ]}
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat detail jurnal..."
      >
        {j ? (
          <>
            <Card title="Header">
              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <span className="text-muted">Status</span>
                  <div>
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
                  </div>
                </div>
                <div>
                  <span className="text-muted">Tanggal</span>
                  <div>{formatDateId(j.postingDate)}</div>
                </div>
                <div>
                  <span className="text-muted">Tipe</span>
                  <div>{j.journalType}</div>
                </div>
                <div>
                  <span className="text-muted">Mata uang</span>
                  <div>
                    {j.currency} @ {j.exchangeRate}
                  </div>
                </div>
                <div>
                  <span className="text-muted">Periode</span>
                  <div>{j.period ?? "—"}</div>
                </div>
                <div>
                  <span className="text-muted">Deskripsi</span>
                  <div>{j.description}</div>
                </div>
                {j.reversalOfNumber ? (
                  <div>
                    <span className="text-muted">Reversal of</span>
                    <div>{j.reversalOfNumber}</div>
                  </div>
                ) : null}
                {j.reversedBy.length ? (
                  <div>
                    <span className="text-muted">Direverse oleh</span>
                    <div>{j.reversedBy.join(", ")}</div>
                  </div>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/finance/journals">
                  <Button type="button" variant="secondary">
                    Kembali
                  </Button>
                </Link>
                {j.status === "DRAFT" ? (
                  <Button
                    type="button"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate(
                        { action: "post_draft", id: j.id },
                        { onSuccess: () => void query.refetch() },
                      )
                    }
                  >
                    Posting draft
                  </Button>
                ) : null}
                {j.status === "POSTED" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate(
                        { action: "reverse", id: j.id },
                        { onSuccess: () => void query.refetch() },
                      )
                    }
                  >
                    Reverse
                  </Button>
                ) : null}
              </div>
              <MutationError error={mutation.error} />
            </Card>
            <Card title={`Baris (D ${formatIdr(j.debit)} / C ${formatIdr(j.credit)})`}>
              <Table
                headers={[
                  "Akun",
                  "Nama",
                  "Debit",
                  "Kredit",
                  "CC",
                  "Tag",
                  "Ket.",
                ]}
              >
                {j.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium">{l.accountCode}</td>
                    <td className="px-3 py-2">{l.accountName}</td>
                    <td className="px-3 py-2">{formatIdr(l.debit)}</td>
                    <td className="px-3 py-2">{formatIdr(l.credit)}</td>
                    <td className="px-3 py-2">{l.costCenterCode ?? "—"}</td>
                    <td className="px-3 py-2">{l.tag ?? "—"}</td>
                    <td className="px-3 py-2">{l.description}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </>
        ) : null}
      </QueryBoundary>
    </ListPageShell>
  );
}
