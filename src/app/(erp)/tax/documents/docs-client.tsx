"use client";

import { useMemo, useState } from "react";
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
  useTaxDocumentMutation,
  useTaxDocumentsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import { formatDateId, yearMonth } from "@/lib/dates";
import { formatIdr } from "@/lib/money";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  RefreshCw,
} from "lucide-react";

type DocsData = {
  documents: Array<{
    id: string;
    number: string;
    version: number;
    docType: string;
    taxType: string;
    status: string;
    partnerName: string | null;
    dpp: string;
    taxAmount: string;
    documentDate: string;
  }>;
};

type FormMode = "none" | "create" | "export" | "correct";

function taxTone(
  status: string,
): "default" | "success" | "warning" | "danger" {
  const s = status.toUpperCase();
  if (s === "POSTED" || s === "EXPORTED" || s === "FINAL") return "success";
  if (s === "DRAFT" || s === "CORRECTED") return "warning";
  if (s === "VOID" || s === "CANCELLED") return "danger";
  return "default";
}

export function TaxDocumentsClient() {
  const query = useTaxDocumentsQuery();
  const mutation = useTaxDocumentMutation();
  const data = query.data as DocsData | undefined;
  const [formMode, setFormMode] = useState<FormMode>("none");
  const documents = data?.documents ?? [];
  const docsPage = useClientPage(documents, 20);

  const stats = useMemo(() => {
    let taxTotal = 0;
    let dppTotal = 0;
    for (const d of documents) {
      taxTotal += Number(d.taxAmount) || 0;
      dppTotal += Number(d.dpp) || 0;
    }
    return {
      count: documents.length,
      taxTotal,
      dppTotal,
    };
  }, [documents]);

  function toggle(mode: FormMode) {
    setFormMode((m) => (m === mode ? "none" : mode));
  }

  return (
    <ListPageShell>
      <PageHeader
        title="Dokumen pajak"
        description="Faktur · bukti potong · ekspor periode · koreksi"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={formMode === "export" ? "primary" : "secondary"}
              onClick={() => toggle("export")}
            >
              <Download className="mr-1.5 size-4" />
              Ekspor
            </Button>
            <Button
              type="button"
              variant={formMode === "correct" ? "primary" : "secondary"}
              onClick={() => toggle("correct")}
            >
              <RefreshCw className="mr-1.5 size-4" />
              Koreksi
            </Button>
            <Button
              type="button"
              variant={formMode === "create" ? "secondary" : "primary"}
              onClick={() => toggle("create")}
            >
              <Plus className="mr-1.5 size-4" />
              {formMode === "create" ? "Tutup" : "Buat dokumen"}
            </Button>
          </div>
        }
      />

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat dokumen pajak..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Dokumen"
              value={stats.count}
              icon={FileSpreadsheet}
            />
            <StatCard
              label="Total DPP"
              value={formatIdr(stats.dppTotal)}
              icon={FileText}
            />
            <StatCard
              label="Total pajak"
              value={formatIdr(stats.taxTotal)}
            />
          </div>

          {formMode === "create" ? (
            <Card title="Buat dokumen">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate(
                    {
                      action: "create",
                      ...formToObject(e.currentTarget),
                    },
                    {
                      onSuccess: () => {
                        e.currentTarget.reset();
                        setFormMode("none");
                      },
                    },
                  );
                }}
              >
                <FormGrid>
                  <Field label="Tipe dokumen">
                    <Select name="docType" defaultValue="FAKTUR_KELUARAN">
                      <option value="FAKTUR_KELUARAN">Faktur keluaran</option>
                      <option value="FAKTUR_MASUKAN">Faktur masukan</option>
                      <option value="BUKTI_POTONG">Bukti potong</option>
                    </Select>
                  </Field>
                  <Field label="Jenis pajak">
                    <Select name="taxType" defaultValue="PPN">
                      <option value="PPN">PPN</option>
                      <option value="PPH23">PPh 23</option>
                      <option value="PPH21">PPh 21</option>
                    </Select>
                  </Field>
                  <Field label="Nama lawan transaksi">
                    <Input name="partnerName" />
                  </Field>
                  <Field label="NPWP">
                    <Input name="partnerNpwp" />
                  </Field>
                  <Field label="DPP">
                    <Input name="dpp" type="number" step="0.01" required />
                  </Field>
                  <Field label="Pajak">
                    <Input
                      name="taxAmount"
                      type="number"
                      step="0.01"
                      required
                    />
                  </Field>
                  <Field label="Periode (YYYYMM)">
                    <Input name="taxPeriod" defaultValue={yearMonth()} />
                  </Field>
                </FormGrid>
                <MutationError error={mutation.error} />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setFormMode("none")}
                  >
                    Batal
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          {formMode === "export" ? (
            <Card title="Ekspor periode">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const body = formToObject(e.currentTarget);
                  mutation.mutate(
                    { action: "export", ...body },
                    { onSuccess: () => setFormMode("none") },
                  );
                }}
              >
                <Field label="Periode">
                  <Input
                    name="taxPeriod"
                    defaultValue={yearMonth()}
                    required
                  />
                </Field>
                <MutationError error={mutation.error} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={mutation.isPending}
                  >
                    Generate export JSON
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setFormMode("none")}
                  >
                    Batal
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          {formMode === "correct" ? (
            <Card title="Koreksi (versi baru)">
              {documents.length === 0 ? (
                <EmptyState
                  compact
                  icon={FileText}
                  title="Belum ada dokumen"
                  message="Buat dokumen pajak dulu sebelum koreksi."
                />
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate(
                      {
                        action: "correct",
                        ...formToObject(e.currentTarget),
                      },
                      {
                        onSuccess: () => {
                          e.currentTarget.reset();
                          setFormMode("none");
                        },
                      },
                    );
                  }}
                >
                  <FormGrid>
                    <Field label="Dokumen">
                      <Select name="id" required>
                        {documents.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.number} v{d.version} — {formatIdr(d.taxAmount)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="DPP baru">
                      <Input name="dpp" type="number" step="0.01" required />
                    </Field>
                    <Field label="Pajak baru">
                      <Input
                        name="taxAmount"
                        type="number"
                        step="0.01"
                        required
                      />
                    </Field>
                    <Field label="Catatan">
                      <Input name="notes" />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      Buat koreksi
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormMode("none")}
                    >
                      Batal
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          ) : null}

          <Card title={`Daftar dokumen (${docsPage.total})`}>
            {docsPage.total === 0 ? (
              <EmptyState
                compact
                icon={FileSpreadsheet}
                title="Belum ada dokumen pajak"
                message="Buat faktur keluaran/masukan atau bukti potong."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setFormMode("create")}
                  >
                    <Plus className="mr-1.5 size-4" />
                    Buat dokumen
                  </Button>
                }
              />
            ) : (
              <>
                <Table
                  headers={[
                    "Nomor",
                    "Ver",
                    "Tipe",
                    "Partner",
                    "DPP",
                    "Pajak",
                    "Status",
                    "Tanggal",
                  ]}
                >
                  {docsPage.items.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 font-medium text-[#0F4C75]">
                        {d.number}
                      </td>
                      <td className="px-3 py-2 tabular-nums">v{d.version}</td>
                      <td className="px-3 py-2 text-xs">{d.docType}</td>
                      <td className="px-3 py-2">{d.partnerName || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatIdr(d.dpp)}
                      </td>
                      <td className="px-3 py-2 font-semibold tabular-nums text-[#0F4C75]">
                        {formatIdr(d.taxAmount)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={taxTone(d.status)}>{d.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {formatDateId(d.documentDate)}
                      </td>
                    </tr>
                  ))}
                </Table>
                <PaginationBar
                  page={docsPage.page}
                  totalPages={docsPage.totalPages}
                  total={docsPage.total}
                  limit={docsPage.limit}
                  onPageChange={docsPage.setPage}
                />
              </>
            )}
          </Card>
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
