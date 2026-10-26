"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeError } from "@/lib/errors";

export async function acknowledgePrivacyNotice(formData: FormData) {
  const parsed = z.object({ noticeId: z.uuid() }).safeParse({ noticeId: formData.get("noticeId") });
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_privacy_notice", {
    p_notice: parsed.data.noticeId,
  });
  if (error) safeError(error, "privacy.acknowledge");
  revalidatePath("/", "layout");
}
