"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useMrpMutation, useMrpQuery } from "@/hooks/use-erp-queries";
import { apiPost, formToObject } from "@/lib/api-client";

type MrpData = {
  runs: Array<{
    id: string;
    number: string;
    status: string;
    horizonDays: number;
    ranAt: string;
    lineCount: number;
    lines: Array<{
      id: string;
      sku: string;
      name: string;
      suggestionType: string;
      quantity: string;
      onHand: string;
      demand: string;
      supply: string;
      isConverted?: boolean;
    }>;
  }>;
};

export function MrpClient() {
  const qc = useQueryClient();
  const query = useMrpQuery();
  const mutation = useMrpMutation();
  const convert = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/mrp/convert", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["mrp"] });
    },
  });
  const data = query.data as MrpData | undefined;
  const latest = data?.runs[0];

  return (
    <div className="space-y-6">
      <PageHeader title="MRP" description="Fase 9 · net requirements" />
      <Card title="Jalankan MRP">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const body = formToObject(e.currentTarget);
            mutation.mutate({
              horizonDays: Number(body.horizonDays || 30),
              notes: body.notes || undefined,
            });
          }}
        >
          <FormGrid>
            <Field label="Horizon (hari)">
              <Input name="horizonDays" type="number" defaultValue="30" />
            </Field>
            <Field label="Catatan">
              <Input name="notes" />
            </Field>
          </FormGrid>
          <MutationError error={mutation.error} />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Menjalankan..." : "Run MRP"}
          </Button>
        </form>
      </Card>

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <>
          <Card title="Riwayat run">
            {!data || data.runs.length === 0 ? (
              <EmptyState message="Belum ada MRP run" />
            ) : (
              <Table headers={["Nomor", "Horizon", "Lines", "Status", "Waktu"]}>
                {data.runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-medium">{r.number}</td>
                    <td className="px-3 py-2">{r.horizonDays} hari</td>
                    <td className="px-3 py-2">{r.lineCount}</td>
                    <td className="px-3 py-2">
                      <Badge>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {r.ranAt.slice(0, 16).replace("T", " ")}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Suggestion terbaru">
            {!latest || latest.lines.length === 0 ? (
              <EmptyState message="Tidak ada suggestion" />
            ) : (
              <>
                <p className="mb-2 text-xs text-muted">
                  Convert PURCHASE butuh supplierId default pertama di master
                  (isi via API body jika perlu). PRODUCE memakai BOM FG jika
                  ada.
                </p>
                <MutationError error={convert.error} />
                <Table
                  headers={[
                    "SKU",
                    "Nama",
                    "Tipe",
                    "On hand",
                    "Demand",
                    "Supply",
                    "Suggest",
                    "Aksi",
                  ]}
                >
                  {latest.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">{l.sku}</td>
                      <td className="px-3 py-2">{l.name}</td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            l.suggestionType === "PRODUCE"
                              ? "warning"
                              : "default"
                          }
                        >
                          {l.suggestionType}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{l.onHand}</td>
                      <td className="px-3 py-2">{l.demand}</td>
                      <td className="px-3 py-2">{l.supply}</td>
                      <td className="px-3 py-2 font-medium">{l.quantity}</td>
                      <td className="px-3 py-2">
                        {l.isConverted ? (
                          <Badge tone="success">Converted</Badge>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={convert.isPending}
                            onClick={() =>
                              convert.mutate({ suggestionId: l.id })
                            }
                          >
                            → {l.suggestionType === "PRODUCE" ? "MO" : "PO"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </Card>
        </>
      </QueryBoundary>
    </div>
  );
}
