import { redirect } from "next/navigation";
import { getSessionUser, listUserCompanies } from "@/lib/auth";
import { MarketingHome } from "./marketing-home";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    const user = await getSessionUser();
    if (user) {
      const memberships = await listUserCompanies(user.id);
      redirect(memberships.length ? "/dashboard" : "/onboarding");
    }
  } catch {
    // DB offline / unauthenticated → show marketing
  }

  return <MarketingHome />;
}
