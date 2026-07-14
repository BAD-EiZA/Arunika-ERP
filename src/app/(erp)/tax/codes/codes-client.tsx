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
  Select,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useTaxCodesQuery } from "@/hooks/use-erp-queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, formToObject } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatDateId } from "@/lib/dates";

export function TaxCodesClient() {
  const qc = useQueryClient();
  const query = useTaxCodesQuery();
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/tax/codes", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.tax.codes });
    },
  });
  const data = query.data as {
    codes?: Array<{
      id: string;
      code: string;
      name: string;
      taxType: string;
      direction: string;
      rate: string;
      effectiveFrom: string;
    }>;
    registration?: {
      npwp: string | null;
      isPkp: boolean;
      taxOffice: string | null;
    } | null;
  };

  const codes = data?.codes ?? [];
  const reg = data?.registration;

  return (
    <div className="space-y-6">
      <PageHeader title="Tax code & PKP" description="Konfigurasi pajak ID" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Registrasi pajak (NPWP/PKP)">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const body = formToObject(e.currentTarget);
                mutation.mutate({
                  action: "registration",
                  ...body,
                  isPkp: body.isPkp === "on" || body.isPkp === "true",
                });
              }}
            >
              <FormGrid>
                <Field label="NPWP">
                  <Input name="npwp" defaultValue={reg?.npwp || ""} />
                </Field>
                <Field label="KPP">
                  <Input name="taxOffice" defaultValue={reg?.taxOffice || ""} />
                </Field>
                <Field label="PKP">
                  <Select
                    name="isPkp"
                    defaultValue={reg?.isPkp ? "true" : "false"}
                  >
                    <option value="true">Ya</option>
                    <option value="false">Tidak</option>
                  </Select>
                </Field>
              </FormGrid>
              <MutationError error={mutation.error} />
              <Button type="submit" disabled={mutation.isPending}>
                Simpan registrasi
              </Button>
            </form>
          </Card>
          <Card title="Tambah tax code">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({
                  action: "create_code",
                  ...formToObject(e.currentTarget),
                });
              }}
            >
              <FormGrid>
                <Field label="Kode">
                  <Input name="code" required />
                </Field>
                <Field label="Nama">
                  <Input name="name" required />
                </Field>
                <Field label="Tipe">
                  <Select name="taxType" defaultValue="PPN">
                    <option value="PPN">PPN</option>
                    <option value="PPH23">PPh 23</option>
                    <option value="PPH21">PPh 21</option>
                  </Select>
                </Field>
                <Field label="Arah">
                  <Select name="direction" defaultValue="OUTPUT">
                    <option value="OUTPUT">OUTPUT</option>
                    <option value="INPUT">INPUT</option>
                    <option value="WITHHOLDING">WITHHOLDING</option>
                  </Select>
                </Field>
                <Field label="Rate %">
                  <Input name="rate" type="number" step="0.01" defaultValue="11" />
                </Field>
                <Field label="GL akun">
                  <Input name="glAccountCode" defaultValue="2120" />
                </Field>
              </FormGrid>
              <Button type="submit" variant="secondary" disabled={mutation.isPending}>
                Simpan code
              </Button>
            </form>
          </Card>
        </div>
        <Card title="Daftar tax code">
          {codes.length === 0 ? (
            <EmptyState message="Belum ada tax code" />
          ) : (
            <Table
              headers={["Kode", "Nama", "Tipe", "Arah", "Rate %", "Berlaku"]}
            >
              {codes.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">{c.code}</td>
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2">{c.taxType}</td>
                  <td className="px-3 py-2">{c.direction}</td>
                  <td className="px-3 py-2">{c.rate}</td>
                  <td className="px-3 py-2">
                    {formatDateId(c.effectiveFrom)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
          {reg ? (
            <p className="mt-3 text-xs text-muted">
              NPWP: {reg.npwp || "—"} · PKP:{" "}
              <Badge tone={reg.isPkp ? "success" : "default"}>
                {reg.isPkp ? "Ya" : "Tidak"}
              </Badge>
            </p>
          ) : null}
        </Card>
      </QueryBoundary>
    </div>
  );
}
