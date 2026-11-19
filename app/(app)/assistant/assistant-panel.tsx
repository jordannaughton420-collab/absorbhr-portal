"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Maximize2, MessageSquarePlus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { ChatEntry } from "@/lib/assistant/history";
import { ChatBox } from "./chat-box";
import { ActionCard } from "./action-card";
import { loadPanelChat } from "./actions";

// The assistant in the bottom corner of every page, for HR, managers and admins. It uses the same
// chats, Confirm cards and permissions as the full Assistant page, and stays open between pages.
export function AssistantPanel({ isHr }: { isHr: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, startLoading] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);

  const load = useCallback((id?: string | null) => {
    startLoading(async () => {
      const res = await loadPanelChat(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setConversationId(res.data!.conversationId);
      setEntries(res.data!.entries);
      setConnected(res.data!.connected);
      setLoaded(true);
    });
  }, []);

  // First open: carry on with the most recent chat.
  useEffect(() => {
    if (open && !loaded) load(undefined);
  }, [open, loaded, load]);

  // Keep the newest message in view.
  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [open, entries]);

  // Escape closes the panel and puts focus back on the button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        launcher.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the message box when the panel opens.
  useEffect(() => {
    if (open && loaded)
      document.getElementById("assistant-panel-message")?.focus({ preventScroll: true });
  }, [open, loaded]);

  // The full Assistant page already shows the chat.
  if (pathname?.startsWith("/assistant")) return null;

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="Assistant"
          className="fixed inset-x-2 bottom-20 top-16 z-40 flex flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl sm:inset-x-auto sm:right-4 sm:top-auto sm:h-[min(38rem,calc(100vh-7rem))] sm:w-[25rem]"
        >
          <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Assistant</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => {
                  setConversationId(null);
                  setEntries([]);
                  load(null);
                }}
                aria-label="Start a new chat"
                title="New chat"
              >
                <MessageSquarePlus aria-hidden="true" />
              </Button>
              <Link
                href={conversationId ? `/assistant?c=${conversationId}` : "/assistant"}
                className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
                aria-label="Open the full Assistant page"
                title="Open full page"
                onClick={() => setOpen(false)}
              >
                <Maximize2 className="size-4" aria-hidden="true" />
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => {
                  setOpen(false);
                  launcher.current?.focus();
                }}
                aria-label="Close the assistant"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </header>

          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {error && <Alert variant="error">{error}</Alert>}
            {!connected && (
              <Alert variant="warning">
                The assistant hasn&apos;t been connected to its AI service yet. Please tell
                AbsorbHR.
              </Alert>
            )}
            {loaded && entries.length === 0 && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Ask in plain English. Nothing changes until you tap Confirm. Try:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>&ldquo;Who&apos;s off next week?&rdquo;</li>
                  <li>&ldquo;Approve Jamie&apos;s holiday request&rdquo;</li>
                  <li>&ldquo;I&apos;ve got a shift tonight 8pm till 5am, who can do it?&rdquo;</li>
                  {isHr && (
                    <li>&ldquo;Give Jamie an extra day&apos;s holiday for Saturday&rdquo;</li>
                  )}
                </ul>
              </div>
            )}
            {!loaded && loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            <ol className="space-y-3" aria-label="Conversation">
              {entries.map((e) =>
                e.type === "message" ? (
                  <li
                    key={e.key}
                    className={cn(
                      "max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm",
                      e.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    <span className="sr-only">{e.role === "user" ? "You: " : "Assistant: "}</span>
                    {e.text}
                  </li>
                ) : (
                  <li key={e.key}>
                    <ActionCard action={e.action} onChange={() => load(conversationId)} />
                  </li>
                ),
              )}
            </ol>
          </div>

          <div className="px-4 pb-3">
            {loaded && (
              <ChatBox
                compact
                conversationId={conversationId ?? undefined}
                disabled={!connected}
                onSent={(id) => load(id)}
              />
            )}
          </div>
        </section>
      )}

      <button
        ref={launcher}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close the assistant" : "Open the assistant"}
        className="fixed bottom-4 right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Sparkles className="size-5" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{open ? "Close" : "Assistant"}</span>
      </button>
    </>
  );
}
