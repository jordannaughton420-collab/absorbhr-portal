import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "@/lib/auth/context";
import { PrivacyGate } from "./privacy-gate";

export const metadata: Metadata = { title: "Privacy notice · AbsorbHR Portal" };

export default async function PrivacyPage() {
  await requireContext();
  const supabase = await createClient();
  const { data: notice } = await supabase.rpc("current_privacy_notice").maybeSingle();
  if (!notice) return <p>No privacy notice has been published yet.</p>;
  return <PrivacyGate notice={notice} standalone />;
}
