import { redirect } from "next/navigation";
import { actionOnboardCompany } from "@/app/actions";
import { Button, Card, Field, FormGrid, Input, PageHeader } from "@/components/ui";
import { getSessionUser, listUserCompanies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const memberships = await listUserCompanies(user.id);
  if (memberships.length > 0) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader
        title="Onboarding perusahaan"
        description="Buat perusahaan pertama, cabang, gudang, COA, tax code, dan role bawaan."
      />
      <Card>
        <form action={actionOnboardCompany} className="space-y-4">
          <FormGrid>
            <Field label="Nama perusahaan">
              <Input name="name" required placeholder="PT Contoh Dagang" />
            </Field>
            <Field label="Nama legal">
              <Input name="legalName" placeholder="PT Contoh Dagang Indonesia" />
            </Field>
            <Field label="Kode">
              <Input name="code" placeholder="CONTOH" />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" placeholder="ops@contoh.id" />
            </Field>
            <Field label="Telepon">
              <Input name="phone" placeholder="021..." />
            </Field>
            <Field label="Kota">
              <Input name="city" placeholder="Jakarta" />
            </Field>
            <Field label="Provinsi">
              <Input name="province" placeholder="DKI Jakarta" />
            </Field>
            <Field label="Nama cabang pertama">
              <Input name="branchName" placeholder="Kantor Pusat" />
            </Field>
            <Field label="Nama gudang pertama">
              <Input name="warehouseName" placeholder="Gudang Utama" />
            </Field>
          </FormGrid>
          <Button type="submit">Buat perusahaan</Button>
        </form>
      </Card>
    </div>
  );
}
