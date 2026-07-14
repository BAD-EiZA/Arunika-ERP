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
  AppCheckbox,
  AppDatePicker,
  AppFieldset,
  AppInputGroup,
  AppTabs,
  toast,
} from "@/components/heroui-kit";
import { useHrMutation, useHrQuery } from "@/hooks/use-erp-queries";
import { useClientPage } from "@/hooks/use-client-page";
import { formToObject } from "@/lib/api-client";
import { formatDateId } from "@/lib/dates";
import { formatIdr } from "@/lib/money";

type HrData = {
  employees: Array<{
    id: string;
    code: string;
    name: string;
    email: string | null;
    position: string | null;
    baseSalary: string;
    isActive: boolean;
  }>;
  attendance: Array<{
    id: string;
    employeeName: string;
    workDate: string;
    status: string;
  }>;
  leaves: Array<{
    id: string;
    employeeName: string;
    leaveType: string;
    days: string;
    status: string;
    startDate: string;
    endDate: string;
  }>;
};

export function HrClient() {
  const query = useHrQuery();
  const mutation = useHrMutation();
  const data = query.data as HrData | undefined;
  const employeesPage = useClientPage(data?.employees ?? [], 20);
  const leavesPage = useClientPage(data?.leaves ?? [], 20);
  const attendancePage = useClientPage(data?.attendance ?? [], 20);

  return (
    <div className="space-y-6">
      <PageHeader title="Human Resources" description="Fase 10" />
      <QueryBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <>
            <AppTabs
              items={[
                {
                  id: "forms",
                  title: "Input",
                  content: (
                    <div className="grid gap-4 xl:grid-cols-2">
                      <Card title="Tambah karyawan">
                        <form
                          className="space-y-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            mutation.mutate(
                              {
                                action: "employee",
                                ...formToObject(e.currentTarget),
                              },
                              {
                                onSuccess: () =>
                                  toast.success("Karyawan disimpan"),
                              },
                            );
                          }}
                        >
                          <AppFieldset legend="Identitas">
                            <FormGrid>
                              <Field label="Kode">
                                <Input name="code" required />
                              </Field>
                              <Field label="Nama">
                                <Input name="name" required />
                              </Field>
                              <Field label="Email">
                                <Input name="email" type="email" />
                              </Field>
                              <Field label="Posisi">
                                <Input name="position" />
                              </Field>
                            </FormGrid>
                          </AppFieldset>
                          <AppInputGroup
                            label="Gaji pokok"
                            name="baseSalary"
                            prefix="Rp"
                            type="number"
                            defaultValue="0"
                          />
                          <AppCheckbox name="isActive" defaultSelected>
                            Aktif
                          </AppCheckbox>
                          <MutationError error={mutation.error} />
                          <Button type="submit" disabled={mutation.isPending}>
                            Simpan
                          </Button>
                        </form>
                      </Card>
                      <Card title="Absensi">
                        <form
                          className="space-y-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            mutation.mutate(
                              {
                                action: "attendance",
                                ...formToObject(e.currentTarget),
                              },
                              {
                                onSuccess: () =>
                                  toast.success("Absensi dicatat"),
                              },
                            );
                          }}
                        >
                          <FormGrid>
                            <Field label="Karyawan">
                              <Select name="employeeId" required>
                                <option value="">Pilih</option>
                                {data.employees.map((e) => (
                                  <option key={e.id} value={e.id}>
                                    {e.code} — {e.name}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <AppDatePicker label="Tanggal" name="workDate" />
                            <Field label="Status">
                              <Select name="status" defaultValue="PRESENT">
                                <option value="PRESENT">Present</option>
                                <option value="ABSENT">Absent</option>
                                <option value="LEAVE">Leave</option>
                              </Select>
                            </Field>
                          </FormGrid>
                          <Button
                            type="submit"
                            variant="secondary"
                            disabled={mutation.isPending}
                          >
                            Catat absensi
                          </Button>
                        </form>
                      </Card>
                    </div>
                  ),
                },
                {
                  id: "lists",
                  title: "Daftar",
                  content: (
                    <>
            <Card title={`Karyawan (${employeesPage.total})`}>
              {employeesPage.total === 0 ? (
                <EmptyState message="Belum ada karyawan" />
              ) : (
                <>
                <Table headers={["Kode", "Nama", "Posisi", "Gaji", "Status"]}>
                  {employeesPage.items.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2">{e.code}</td>
                      <td className="px-3 py-2">{e.name}</td>
                      <td className="px-3 py-2">{e.position || "-"}</td>
                      <td className="px-3 py-2">{formatIdr(e.baseSalary)}</td>
                      <td className="px-3 py-2">
                        <Badge tone={e.isActive ? "success" : "danger"}>
                          {e.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </Table>
                <PaginationBar
                  page={employeesPage.page}
                  totalPages={employeesPage.totalPages}
                  total={employeesPage.total}
                  limit={employeesPage.limit}
                  onPageChange={employeesPage.setPage}
                />
                </>
              )}
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Cuti">
                <form
                  className="mb-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                      action: "leave",
                      ...formToObject(e.currentTarget),
                    });
                  }}
                >
                  <FormGrid>
                    <Field label="Karyawan">
                      <Select name="employeeId" required>
                        {data.employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Tipe">
                      <Select name="leaveType" defaultValue="ANNUAL">
                        <option value="ANNUAL">Annual</option>
                        <option value="SICK">Sick</option>
                        <option value="UNPAID">Unpaid</option>
                      </Select>
                    </Field>
                    <Field label="Mulai">
                      <Input name="startDate" type="date" required />
                    </Field>
                    <Field label="Selesai">
                      <Input name="endDate" type="date" required />
                    </Field>
                    <Field label="Hari">
                      <Input name="days" type="number" step="0.5" defaultValue="1" />
                    </Field>
                  </FormGrid>
                  <Button type="submit" disabled={mutation.isPending}>
                    Ajukan cuti
                  </Button>
                </form>
                {leavesPage.total === 0 ? (
                  <EmptyState message="Belum ada cuti" />
                ) : (
                  <>
                  <Table headers={["Karyawan", "Tipe", "Hari", "Status", "Aksi"]}>
                    {leavesPage.items.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2">{l.employeeName}</td>
                        <td className="px-3 py-2">{l.leaveType}</td>
                        <td className="px-3 py-2">{l.days}</td>
                        <td className="px-3 py-2">
                          <Badge>{l.status}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {l.status === "PENDING_APPROVAL" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                mutation.mutate({
                                  action: "approve_leave",
                                  id: l.id,
                                })
                              }
                            >
                              Approve
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={leavesPage.page}
                    totalPages={leavesPage.totalPages}
                    total={leavesPage.total}
                    limit={leavesPage.limit}
                    onPageChange={leavesPage.setPage}
                  />
                  </>
                )}
              </Card>
              <Card title={`Absensi terbaru (${attendancePage.total})`}>
                {attendancePage.total === 0 ? (
                  <EmptyState message="Belum ada absensi" />
                ) : (
                  <>
                  <Table headers={["Tanggal", "Karyawan", "Status"]}>
                    {attendancePage.items.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2">{formatDateId(a.workDate)}</td>
                        <td className="px-3 py-2">{a.employeeName}</td>
                        <td className="px-3 py-2">
                          <Badge>{a.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <PaginationBar
                    page={attendancePage.page}
                    totalPages={attendancePage.totalPages}
                    total={attendancePage.total}
                    limit={attendancePage.limit}
                    onPageChange={attendancePage.setPage}
                  />
                  </>
                )}
              </Card>
            </div>
                    </>
                  ),
                },
              ]}
            />
          </>
        ) : null}
      </QueryBoundary>
    </div>
  );
}
