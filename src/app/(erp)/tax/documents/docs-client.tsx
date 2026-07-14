"use client";

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
  useTaxDocumentMutation,
  useTaxDocumentsQuery,
} from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import { formatDateId, yearMonth } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

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

export function TaxDocumentsClient() {
  const query = useTaxDocumentsQuery();
  const mutation = useTaxDocumentMutation();
  const data = query.data as DocsData | undefined;
  const docsPage = useClientPage(data?.documents ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader title="Dokumen pajak" description="TanStack Query" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Buat dokumen">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({
                action: "create",
                ...formToObject(e.currentTarget),
              });
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
                <Input name="taxAmount" type="number" step="0.01" required />
              </Field>
              <Field label="Periode (YYYYMM)">
                <Input name="taxPeriod" defaultValue={yearMonth()} />
              </Field>
            </FormGrid>
            <MutationError error={mutation.error} />
            <Button type="submit" disabled={mutation.isPending}>
              Simpan
            </Button>
          </form>
        </Card>
        <Card title="Ekspor periode">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const body = formToObject(e.currentTarget);
              mutation.mutate({ action: "export", ...body });
            }}
          >
            <Field label="Periode">
              <Input name="taxPeriod" defaultValue={yearMonth()} required />
            </Field>
            <Button type="submit" variant="secondary" disabled={mutation.isPending}>
              Generate export JSON
            </Button>
          </form>
        </Card>
      </div>

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <>
          <Card title="Koreksi (versi baru)">
            {!data || data.documents.length === 0 ? (
              <EmptyState message="Belum ada dokumen" />
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate({
                    action: "correct",
                    ...formToObject(e.currentTarget),
                  });
                }}
              >
                <FormGrid>
                  <Field label="Dokumen">
                    <Select name="id" required>
                      {data.documents.map((d) => (
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
                    <Input name="taxAmount" type="number" step="0.01" required />
                  </Field>
                  <Field label="Catatan">
                    <Input name="notes" />
                  </Field>
                </FormGrid>
                <Button type="submit" disabled={mutation.isPending}>
                  Buat koreksi
                </Button>
              </form>
            )}
          </Card>
          <Card title={`Daftar dokumen (${docsPage.total})`}>
            {docsPage.total === 0 ? (
              <EmptyState message="Belum ada dokumen pajak" />
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
                      <td className="px-3 py-2">{d.number}</td>
                      <td className="px-3 py-2">v{d.version}</td>
                      <td className="px-3 py-2">{d.docType}</td>
                      <td className="px-3 py-2">{d.partnerName || "-"}</td>
                      <td className="px-3 py-2">{formatIdr(d.dpp)}</td>
                      <td className="px-3 py-2">{formatIdr(d.taxAmount)}</td>
                      <td className="px-3 py-2">
                        <Badge>{d.status}</Badge>
                      </td>
                      <td className="px-3 py-2">{formatDateId(d.documentDate)}</td>
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
    </div>
  );
}
