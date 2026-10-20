import { notFound } from "next/navigation";
import { isAdmin, type RawMetrics } from "@/lib/admin/metrics";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";
import { AdminView } from "./AdminView";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { user } = await requireUser();
  // 404 rather than 403 so the page's existence isn't advertised.
  if (!isAdmin(user?.email)) notFound();

  const { data, error } = await supabaseAdmin().rpc("admin_metrics");
  if (error) throw error;
  return <AdminView raw={data as RawMetrics} ngnPerUsd={Number(process.env.NGN_PER_USD) || 1500} />;
}
