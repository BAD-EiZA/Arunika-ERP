import { PortalView } from "./portal-view";

export const dynamic = "force-dynamic";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  return <PortalView token={sp.token || ""} />;
}
