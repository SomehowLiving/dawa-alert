import { ReportForm } from "@/components/ReportForm";

export const metadata = { title: "report a sighting · dawa alert" };

export default async function Page({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const sp = await searchParams;
  return <ReportForm initialBatch={sp.batch ?? ""} />;
}
