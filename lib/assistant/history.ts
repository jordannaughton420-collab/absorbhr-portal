import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Db = SupabaseClient<Database>;

export type ChatCard = {
  id: string;
  summary: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled" | "expired";
  resultMessage: string | null;
  expired: boolean;
};

export type ChatEntry =
  | { type: "message"; at: string; role: "user" | "assistant"; text: string; key: string }
  | { type: "action"; at: string; action: ChatCard; key: string };

/** One chat's messages and suggestion cards, in the order they should be shown. RLS keeps it to the owner. */
export async function loadChat(supabase: Db, conversationId: string): Promise<ChatEntry[]> {
  const [{ data: messages }, { data: actions }] = await Promise.all([
    supabase
      .from("assistant_messages")
      .select("id, role, display_text, created_at")
      .eq("conversation_id", conversationId)
      .not("display_text", "is", null)
      .order("seq"),
    supabase
      .from("assistant_actions")
      .select("id, summary, status, result_message, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at"),
  ]);
  const entries: ChatEntry[] = [
    ...(messages ?? []).map((m): ChatEntry => ({
      type: "message",
      at: m.created_at,
      role: m.role as "user" | "assistant",
      text: m.display_text ?? "",
      key: m.id,
    })),
    ...(actions ?? []).map((a): ChatEntry => ({
      type: "action",
      at: a.created_at,
      key: a.id,
      action: {
        id: a.id,
        summary: a.summary,
        status: a.status as ChatCard["status"],
        resultMessage: a.result_message,
        expired: a.status === "pending" && Date.parse(a.created_at) < Date.now() - 24 * 3600 * 1000,
      },
    })),
  ].sort((x, y) => x.at.localeCompare(y.at));
  return cardsAfterReply(entries);
}

// A suggestion is saved a moment before the assistant writes its reply about it, so by time
// it would sit above that reply. Show each card under the reply from the same turn instead.
function cardsAfterReply(entries: ChatEntry[]): ChatEntry[] {
  const out: ChatEntry[] = [];
  let waiting: ChatEntry[] = [];
  for (const e of entries) {
    if (e.type === "action") {
      waiting.push(e);
      continue;
    }
    if (e.role === "user") {
      out.push(...waiting);
      waiting = [];
      out.push(e);
    } else {
      out.push(e, ...waiting);
      waiting = [];
    }
  }
  return [...out, ...waiting];
}
