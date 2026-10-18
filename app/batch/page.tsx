import { BatchView } from "@/components/BatchView";

export const metadata = { title: "batch · dawa alert" };

export default async function Page({ searchParams }: { searchParams: Promise<{ batch?: string; product?: string }> }) {
  const sp = await searchParams;
  return <BatchView batch={sp.batch ?? ""} product={sp.product ?? ""} />;
}
