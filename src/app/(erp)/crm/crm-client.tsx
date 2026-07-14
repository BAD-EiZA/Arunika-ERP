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
import { formatIdr } from "@/lib/money";

type CrmData = {
  leads: Array<{
    id: string;
    name: string;
    email: string | null;
    status: string;
    source: string | null;
  }>;
  opportunities: Array<{
    id: string;
    title: string;
    stage: string;
    amount: string;
    probability: number;
    status: string;
  }>;
};

export function CrmClient() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["crm"],
    queryFn: () => apiGet<CrmData>("/api/erp/crm"),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/erp/crm", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["crm"] });
    },
  });
  const data = query.data;
  const leadsPage = useClientPage(data?.leads ?? [], 20);
  const oppsPage = useClientPage(data?.opportunities ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader title="CRM" description="Lead & opportunity pipeline" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Lead baru">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                      action: "lead",
                      ...formToObject(e.currentTarget),
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Nama">
                      <Input name="name" required />
                    </Field>
                    <Field label="Email">
                      <Input name="email" type="email" />
                    </Field>
                    <Field label="Telepon">
                      <Input name="phone" />
                    </Field>
                    <Field label="Perusahaan">
                      <Input name="companyName" />
                    </Field>
                    <Field label="Sumber">
                      <Input name="source" placeholder="Web / Referral" />
                    </Field>
                  </FormGrid>
                  <MutationError error={mutation.error} />
                  <Button type="submit" disabled={mutation.isPending}>
                    Simpan lead
                  </Button>
                </form>
              </Card>
              <Card title="Opportunity">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                      action: "opportunity",
                      ...formToObject(e.currentTarget),
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Judul">
                      <Input name="title" required />
                    </Field>
                    <Field label="Lead">
                      <Select name="leadId" defaultValue="">
                        <option value="">—</option>
                        {data.leads.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Nilai">
                      <Input name="amount" type="number" step="0.01" defaultValue="0" />
                    </Field>
                    <Field label="Stage">
                      <Select name="stage" defaultValue="QUALIFICATION">
                        <option value="QUALIFICATION">Qualification</option>
                        <option value="PROPOSAL">Proposal</option>
                        <option value="NEGOTIATION">Negotiation</option>
                        <option value="WON">Won</option>
                        <option value="LOST">Lost</option>
                      </Select>
                    </Field>
                  </FormGrid>
                  <Button type="submit" variant="secondary" disabled={mutation.isPending}>
                    Buat opportunity
                  </Button>
                </form>
              </Card>
            </div>
            <Card title={`Leads (${leadsPage.total})`}>
              {leadsPage.total === 0 ? (
                <EmptyState message="Belum ada lead" />
              ) : (
                <>
                <Table headers={["Nama", "Email", "Sumber", "Status", "Aksi"]}>
                  {leadsPage.items.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">{l.name}</td>
                      <td className="px-3 py-2">{l.email || "-"}</td>
                      <td className="px-3 py-2">{l.source || "-"}</td>
                      <td className="px-3 py-2">
                        <Badge>{l.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            mutation.mutate({
                              action: "lead_status",
                              id: l.id,
                              status: "QUALIFIED",
                            })
                          }
                        >
                          Qualify
                        </Button>
                      </td>
                    </tr>
                  ))}
                </Table>
                <PaginationBar
                  page={leadsPage.page}
                  totalPages={leadsPage.totalPages}
                  total={leadsPage.total}
                  limit={leadsPage.limit}
                  onPageChange={leadsPage.setPage}
                />
                </>
              )}
            </Card>
            <Card title={`Opportunities (${oppsPage.total})`}>
              {oppsPage.total === 0 ? (
                <EmptyState message="Belum ada opportunity" />
              ) : (
                <>
                <Table headers={["Judul", "Stage", "Nilai", "%", "Status", "Aksi"]}>
                  {oppsPage.items.map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-2">{o.title}</td>
                      <td className="px-3 py-2">{o.stage}</td>
                      <td className="px-3 py-2">{formatIdr(o.amount)}</td>
                      <td className="px-3 py-2">{o.probability}</td>
                      <td className="px-3 py-2">
                        <Badge>{o.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            mutation.mutate({
                              action: "opportunity_stage",
                              id: o.id,
                              stage: "WON",
                              probability: 100,
                            })
                          }
                        >
                          Mark won
                        </Button>
                      </td>
                    </tr>
                  ))}
                </Table>
                <PaginationBar
                  page={oppsPage.page}
                  totalPages={oppsPage.totalPages}
                  total={oppsPage.total}
                  limit={oppsPage.limit}
                  onPageChange={oppsPage.setPage}
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
