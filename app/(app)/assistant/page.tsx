import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquarePlus, NotebookPen, Trash2 } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { assistantConfigured } from "@/lib/assistant/run";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChatBox } from "./chat-box";
import { ActionCard } from "./action-card";
import { loadChat, type ChatEntry } from "@/lib/assistant/history";
import { deleteConversation } from "./actions";

export const metadata: Metadata = { title: "Assistant · AbsorbHR Portal" };

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const ctx = await requireContext();
  if (!ctx.tenantId || ctx.supportSession) {
    return <p>The assistant is for people working in their own company&apos;s portal.</p>;
  }
  const enabled = Boolean(ctx.settings?.assistant_enabled);
  const { c } = await searchParams;
  const supabase = await createClient();

  const { data: conversations } = await supabase
    .from("assistant_conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  const current = conversations?.find((x) => x.id === c) ?? null;

  const entries: ChatEntry[] = current ? await loadChat(supabase, current.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Ask in plain English. It suggests changes; nothing happens until you tap Confirm.
          </p>
        </div>
        <Link
          href="/assistant/notes"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <NotebookPen className="size-4" aria-hidden="true" /> Company notes
        </Link>
      </div>

      {!enabled && (
        <Alert variant="warning">
          The assistant is switched off for your company. A Client Admin can switch it on in Company
          settings. You can still read and delete your old chats.
        </Alert>
      )}
      {enabled && !assistantConfigured() && (
        <Alert variant="warning">
          The assistant hasn&apos;t been connected to its AI service yet. Please tell AbsorbHR.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your chats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Link
              href="/assistant"
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted",
                !current && "bg-muted",
              )}
            >
              <MessageSquarePlus className="size-4" aria-hidden="true" /> New chat
            </Link>
            {(conversations ?? []).map((conv) => (
              <div key={conv.id} className="group flex items-center gap-1">
                <Link
                  href={`/assistant?c=${conv.id}`}
                  aria-current={conv.id === current?.id ? "page" : undefined}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                    conv.id === current?.id && "bg-muted font-medium",
                  )}
                >
                  {conv.title}
                </Link>
                <form action={deleteConversation}>
                  <input type="hidden" name="conversation_id" value={conv.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Delete chat: ${conv.title}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </form>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Only you can see your chats. They&apos;re deleted automatically after{" "}
              {retentionText(ctx.settings?.assistant_chat_retention_months ?? 72)} without use.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-5">
            {entries.length === 0 && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Try something like:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>&ldquo;How much holiday have I got left?&rdquo;</li>
                  <li>&ldquo;Book me off from 22 to 24 December&rdquo;</li>
                  <li>&ldquo;Who&apos;s off next week?&rdquo;</li>
                  {(ctx.isHr || ctx.role === "line_manager") && (
                    <li>&ldquo;Approve Jamie&apos;s holiday request&rdquo;</li>
                  )}
                  {ctx.isHr && (
                    <li>
                      &ldquo;Add Sam Patel as a baker starting Monday, reporting to Morgan&rdquo;
                    </li>
                  )}
                </ul>
              </div>
            )}
            <ol className="space-y-3" aria-label="Conversation">
              {entries.map((e) =>
                e.type === "message" ? (
                  <li
                    key={e.key}
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm",
                      e.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    <span className="sr-only">{e.role === "user" ? "You: " : "Assistant: "}</span>
                    {e.text}
                  </li>
                ) : (
                  <li key={e.key}>
                    <ActionCard action={e.action} />
                  </li>
                ),
              )}
            </ol>
            {enabled && <ChatBox conversationId={current?.id} disabled={!assistantConfigured()} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function retentionText(months: number) {
  if (months % 12 === 0) return `${months / 12} year${months === 12 ? "" : "s"}`;
  return `${months} month${months === 1 ? "" : "s"}`;
}
