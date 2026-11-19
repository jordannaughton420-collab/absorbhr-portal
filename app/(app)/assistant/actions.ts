"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getContext, type SessionContext } from "@/lib/auth/context";
import { safeError, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assistantConfigured, runTurn } from "@/lib/assistant/run";
import { executeAction } from "@/lib/assistant/execute";
import { loadChat, type ChatEntry } from "@/lib/assistant/history";

const ROLE_NAMES: Record<string, string> = {
  client_admin: "Client Admin",
  hr_manager: "HR Manager",
  line_manager: "Line Manager",
  employee: "Employee",
};

/** The assistant is for people in their own company, never in an AbsorbHR support session. */
async function assistantContext(): Promise<
  { ok: true; ctx: SessionContext & { tenantId: string } } | { ok: false; error: string }
> {
  const ctx = await getContext();
  if (!ctx || !ctx.tenantId || ctx.supportSession)
    return { ok: false, error: "The assistant isn't available here." };
  if (ctx.mfaRequired && ctx.aal !== "aal2")
    return { ok: false, error: "Please finish two-step sign-in first." };
  if (!ctx.settings?.assistant_enabled)
    return { ok: false, error: "Your company hasn't switched the assistant on." };
  return { ok: true, ctx: ctx as SessionContext & { tenantId: string } };
}

const messageSchema = z.object({
  conversation_id: z.uuid().optional(),
  text: z
    .string()
    .trim()
    .min(1, "Type a message")
    .max(2000, "Please keep it under 2,000 characters"),
});

export async function sendMessage(input: {
  conversation_id?: string;
  text: string;
}): Promise<ActionResult<{ conversationId: string }>> {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message." };
  const gate = await assistantContext();
  if (!gate.ok) return gate;
  const { ctx } = gate;
  if (!assistantConfigured())
    return { ok: false, error: "The assistant hasn't been connected yet. Please tell AbsorbHR." };
  if (!(await rateLimit("assistant", ctx.userId)))
    return { ok: false, error: "You've sent a lot of messages this hour. Please try again later." };

  const supabase = await createClient();
  let conversationId = parsed.data.conversation_id;
  if (!conversationId) {
    const { data, error } = await supabase
      .from("assistant_conversations")
      .insert({
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        title: parsed.data.text.slice(0, 80),
      })
      .select("id")
      .single();
    if (error || !data) return safeError(error, "assistant.new_chat");
    conversationId = data.id;
  } else {
    const { data } = await supabase
      .from("assistant_conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!data) return { ok: false, error: "That chat no longer exists." };
  }

  const result = await runTurn(
    {
      supabase,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      employeeId: ctx.employeeId,
      isHr: ctx.isHr,
      isManager: ctx.role === "line_manager",
      isClientAdmin: ctx.isClientAdmin,
      canPlanShifts:
        ctx.isHr ||
        (ctx.role === "line_manager" && Boolean(ctx.settings?.managers_can_plan_shifts)),
      conversationId,
    },
    {
      name: ctx.displayName,
      role: ROLE_NAMES[ctx.role ?? ""] ?? "Employee",
      companyName: ctx.tenantName ?? "your company",
      ownEmployeeId: ctx.employeeId,
    },
    parsed.data.text,
  ).catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));

  revalidatePath("/assistant");
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { conversationId } };
}

const idSchema = z.uuid();

export async function confirmAction(actionId: string): Promise<ActionResult<{ link?: string }>> {
  const id = idSchema.safeParse(actionId);
  if (!id.success) return { ok: false, error: "Missing suggestion." };
  const gate = await assistantContext();
  if (!gate.ok) return gate;
  const { ctx } = gate;
  const supabase = await createClient();

  // Claim it first, so a double tap can't run it twice and an expired one can't run at all.
  const { data: action, error } = await supabase.rpc("assistant_claim_action", {
    p_action: id.data,
  });
  if (error || !action)
    return { ok: false, error: "This suggestion has already been dealt with or has expired." };

  const result = await executeAction(
    supabase,
    ctx.tenantId,
    ctx.userId,
    action.kind,
    action.payload,
  ).catch(() => ({
    ok: false,
    message: "Something went wrong. Nothing was changed.",
    entityId: undefined,
    link: undefined,
  }));
  await supabase.rpc("assistant_finish_action", {
    p_action: id.data,
    p_ok: result.ok,
    p_message: result.message,
    p_entity: result.entityId,
  });

  revalidatePath("/", "layout");
  if (!result.ok) return { ok: false, error: result.message };
  return { ok: true, message: result.message, data: { link: result.link } };
}

export async function cancelAction(actionId: string): Promise<ActionResult> {
  const id = idSchema.safeParse(actionId);
  if (!id.success) return { ok: false, error: "Missing suggestion." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("assistant_cancel_action", { p_action: id.data });
  if (error) return { ok: false, error: "This suggestion has already been dealt with." };
  revalidatePath("/assistant");
  return { ok: true, message: "Cancelled. Nothing was changed." };
}

export async function deleteConversation(formData: FormData) {
  const id = idSchema.safeParse(formData.get("conversation_id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("assistant_conversations").delete().eq("id", id.data);
  revalidatePath("/assistant");
}

export async function deleteNote(formData: FormData) {
  const id = idSchema.safeParse(formData.get("note_id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("assistant_memories").delete().eq("id", id.data);
  revalidatePath("/assistant/notes");
}

/**
 * For the corner panel: one chat (or the most recent one) with its messages and cards.
 * Row Level Security keeps it to the person's own chats.
 */
export async function loadPanelChat(
  conversationId?: string | null,
): Promise<
  ActionResult<{ conversationId: string | null; entries: ChatEntry[]; connected: boolean }>
> {
  const gate = await assistantContext();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  let id: string | null = null;
  if (conversationId) {
    const parsed = idSchema.safeParse(conversationId);
    if (!parsed.success) return { ok: false, error: "That chat no longer exists." };
    id = parsed.data;
  } else if (conversationId === undefined) {
    const { data } = await supabase
      .from("assistant_conversations")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    id = data?.id ?? null;
  }
  const entries = id ? await loadChat(supabase, id) : [];
  return { ok: true, data: { conversationId: id, entries, connected: assistantConfigured() } };
}
