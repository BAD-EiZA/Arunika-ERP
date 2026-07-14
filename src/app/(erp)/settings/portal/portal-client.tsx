"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useClientPage } from "@/hooks/use-client-page";
import { apiGet, apiPost, formToObject } from "@/lib/api-client";
import { formatDateTimeId } from "@/lib/dates";

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
  const tokensPage = useClientPage(query.data?.tokens ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portal token"
        description="Customer / supplier portal access"
      />
      <Card title="Buat token">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(formToObject(e.currentTarget));
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
              <Input name="partnerId" required placeholder="customerId/supplierId" />
            </Field>
            <Field label="Email">
              <Input name="partnerEmail" type="email" required />
            </Field>
            <Field label="Berlaku (hari)">
              <Input name="daysValid" type="number" defaultValue="30" />
            </Field>
          </FormGrid>
          <MutationError error={mutation.error} />
          <Button type="submit" disabled={mutation.isPending}>
            Generate token
          </Button>
        </form>
      </Card>
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Card title={`Token aktif (${tokensPage.total})`}>
          {tokensPage.total === 0 ? (
            <EmptyState message="Belum ada token" />
          ) : (
            <>
              <Table headers={["Tipe", "Email", "URL", "Exp", "Status"]}>
                {tokensPage.items.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2">{t.portalType}</td>
                    <td className="px-3 py-2">{t.partnerEmail}</td>
                    <td className="px-3 py-2 text-xs">
                      <a className="text-accent underline" href={`/portal?token=${t.token}`}>
                        /portal?token=…
                      </a>
                    </td>
                    <td className="px-3 py-2 text-xs">
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
      </QueryBoundary>
    </div>
  );
}
