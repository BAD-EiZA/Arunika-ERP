import { JournalDetailClient } from "./journal-detail-client";

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JournalDetailClient id={id} />;
}
