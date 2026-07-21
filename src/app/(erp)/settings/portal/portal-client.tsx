"use client";

import { useMemo, useState } from "react";
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
  StatCard,
  Table,
} from "@/components/ui";
import { MutationError, QueryBoundary } from "@/components/query-state";
import { useClientPage } from "@/hooks/use-client-page";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { formatDateTimeId } from "@/lib/dates";
import { KeyRound, Plus, Users } from "lucide-react";

type PortalData = {
  tokens: Array<{
    id: string;
    portalType: string;
    partnerId: string;
    partnerEmail: string;
    token: string;
    expiresAt: string;
    isActive: boolean;
  }>;
};

export function PortalSettingsClient() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["portal-tokens"],
    queryFn: () => apiGet<PortalData>("/api/erp/portal"),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost("/api/erp/portal", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["portal-tokens"] });
    },
  });
  const [showCreate, setShowCreate] = useState(false);
  const tokens = query.data?.tokens ?? [];
  const tokensPage = useClientPage(tokens, 20);

  const stats = useMemo(() => {
    const active = tokens.filter((t) => t.isActive).length;
    const customers = tokens.filter((t) => t.portalType === "CUSTOMER").length;
    return {
      total: tokens.length,
      active,
      customers,
      suppliers: tokens.length - customers,
    };
  }, [tokens]);

  return (
    <ListPageShell>
      <PageHeader
        title="Portal token"
        description="Akses customer / supplier portal"
        actions={
          <Button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            variant={showCreate ? "secondary" : "primary"}
          >
            <Plus className="mr-1.5 size-4" />
            {showCreate ? "Tutup form" : "Buat token"}
          </Button>
        }
      />

      {showCreate ? (
        <Card title="Buat token">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(formToObject(e.currentTarget), {
                onSuccess: () => {
                  e.currentTarget.reset();
                  setShowCreate(false);
                },
              });
            }}
          >
            <FormGrid>
              <Field label="Tipe">
                <Select name="portalType" defaultValue="CUSTOMER">
                  <option value="CUSTOMER">Customer</option>
                  <option value="SUPPLIER">Supplier</option>
                </Select>
              </Field>
              <Field label="Partner ID">
                <Input
                  name="partnerId"
                  required
                  placeholder="customerId/supplierId"
                />
              </Field>
              <Field label="Email">
                <Input name="partnerEmail" type="email" required />
              </Field>
              <Field label="Berlaku (hari)">
                <Input name="daysValid" type="number" defaultValue="30" />
              </Field>
            </FormGrid>
            <MutationError error={mutation.error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={mutation.isPending}>
                Generate token
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreate(false)}
              >
                Batal
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Memuat token portal..."
      >
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Token" value={stats.total} icon={KeyRound} />
            <StatCard label="Aktif" value={stats.active} />
            <StatCard
              label="Customer"
              value={stats.customers}
              icon={Users}
            />
            <StatCard label="Supplier" value={stats.suppliers} />
          </div>

          <Card title={`Token aktif (${tokensPage.total})`}>
            {tokensPage.total === 0 ? (
              <EmptyState
                compact
                icon={KeyRound}
                title="Belum ada token"
                message="Generate token untuk mitra customer atau supplier."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowCreate(true)}
                  >
                    <Plus className="mr-1.5 size-4" />
                    Buat token
                  </Button>
                }
              />
            ) : (
              <>
                <Table
                  headers={["Tipe", "Email", "URL", "Exp", "Status"]}
                >
                  {tokensPage.items.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2">
                        <Badge>{t.portalType}</Badge>
                      </td>
                      <td className="px-3 py-2 font-medium text-[#0F4C75]">
                        {t.partnerEmail}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <a
                          className="text-[#0F4C75] underline decoration-[#0F4C75]/30 underline-offset-2"
                          href={`/portal?token=${t.token}`}
                        >
                          /portal?token=…
                        </a>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {formatDateTimeId(t.expiresAt)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={t.isActive ? "success" : "danger"}>
                          {t.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </Table>
                <PaginationBar
                  page={tokensPage.page}
                  totalPages={tokensPage.totalPages}
                  total={tokensPage.total}
                  limit={tokensPage.limit}
                  onPageChange={tokensPage.setPage}
                />
              </>
            )}
          </Card>
        </>
      </QueryBoundary>
    </ListPageShell>
  );
}
