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
  Select,
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useTaxCodesQuery } from "@/hooks/use-erp-queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, formToObject } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatDateId } from "@/lib/dates";
import {
  Building2,
  FileCode,
  Plus,
  Settings2,
} from "lucide-react";

type FormMode = "none" | "registration" | "code";

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
  const [formMode, setFormMode] = useState<FormMode>("none");

  const codes = data?.codes ?? [];
  const reg = data?.registration;

  const stats = useMemo(() => {
    const types = new Set(codes.map((c) => c.taxType)).size;
    return { codes: codes.length, types, pkp: reg?.isPkp ? 1 : 0 };
  }, [codes, reg]);

  function toggle(mode: FormMode) {
    setFormMode((m) => (m === mode ? "none" : mode));
  }

  return (
    <ListPageShell>
      <PageHeader
        title="Tax code & PKP"
        description="Konfigurasi pajak Indonesia · NPWP / PKP · rate"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={formMode === "registration" ? "primary" : "secondary"}
              onClick={() => toggle("registration")}
            >
              <Building2 className="mr-1.5 size-4" />
              PKP
            </Button>
            <Button
              type="button"
              variant={formMode === "code" ? "secondary" : "primary"}
              onClick={() => toggle("code")}
            >
              <Plus className="mr-1.5 size-4" />
              {formMode === "code" ? "Tutup" : "Tax code"}
            </Button>
          </div>
        }
      />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat tax codes..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Tax codes" value={stats.codes} icon={FileCode} />
            <StatCard label="Tipe" value={stats.types} icon={Settings2} />
            <StatCard
              label="Status PKP"
              value={reg?.isPkp ? "PKP" : "Non-PKP"}
              icon={Building2}
              hint={reg?.npwp || "NPWP belum diisi"}
            />
          </div>

          {formMode === "registration" ? (
            <Card title="Registrasi pajak (NPWP/PKP)">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const body = formToObject(e.currentTarget);
                  mutation.mutate(
                    {
                      action: "registration",
                      ...body,
                      isPkp: body.isPkp === "on" || body.isPkp === "true",
                    },
                    { onSuccess: () => setFormMode("none") },
                  );
                }}
              >
                <FormGrid>
                  <Field label="NPWP">
                    <Input name="npwp" defaultValue={reg?.npwp || ""} />
                  </Field>
                  <Field label="KPP">
                    <Input
                      name="taxOffice"
                      defaultValue={reg?.taxOffice || ""}
                    />
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
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan registrasi
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

          {formMode === "code" ? (
            <Card title="Tambah tax code">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate(
                    {
                      action: "create_code",
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
                    <Input
                      name="rate"
                      type="number"
                      step="0.01"
                      defaultValue="11"
                    />
                  </Field>
                  <Field label="GL akun">
                    <Input name="glAccountCode" defaultValue="2120" />
                  </Field>
                </FormGrid>
                <MutationError error={mutation.error} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={mutation.isPending}
                  >
                    Simpan code
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

          <Card title={`Daftar tax code (${codes.length})`}>
            {codes.length === 0 ? (
              <EmptyState
                compact
                icon={FileCode}
                title="Belum ada tax code"
                message="Tambah PPN/PPh dan tautkan ke GL."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setFormMode("code")}
                  >
                    <Plus className="mr-1.5 size-4" />
                    Tax code
                  </Button>
                }
              />
            ) : (
              <Table
                headers={[
                  "Kode",
                  "Nama",
                  "Tipe",
                  "Arah",
                  "Rate %",
                  "Berlaku",
                ]}
              >
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 font-medium text-[#0F4C75]">
                      {c.code}
                    </td>
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2">
                      <Badge>{c.taxType}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">{c.direction}</td>
                    <td className="px-3 py-2 tabular-nums">{c.rate}</td>
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
                {reg.taxOffice ? ` · KPP ${reg.taxOffice}` : null}
              </p>
            ) : null}
          </Card>
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
