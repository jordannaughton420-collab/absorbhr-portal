"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/feedback";
import { sendMessage } from "./actions";

// Minimal typing for the browser's built-in speech recognition (Chrome, Edge, Safari).
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

// What to tell the person when the browser's speech-to-text stops with an error.
const VOICE_ERRORS: Record<string, string> = {
  "not-allowed":
    "Your browser blocked the microphone. Click the padlock or settings icon next to the web address, allow the microphone for this site, then try again.",
  "service-not-allowed":
    "Your browser's speech-to-text isn't available here. Try Chrome or Edge, or type your message instead.",
  "audio-capture": "No microphone was found. Check one is plugged in and switched on.",
  network:
    "Speech-to-text needs an internet connection to your browser's speech service. Please try again, or type instead.",
  "no-speech": "I didn't hear anything. Press the microphone and start speaking straight away.",
};

function getRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, (new () => Recognition) | undefined>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function ChatBox({
  conversationId,
  disabled,
  onSent,
  compact,
}: {
  conversationId?: string;
  disabled?: boolean;
  /** When given (the corner panel), called after each reply instead of changing page. */
  onSent?: (conversationId: string) => void;
  compact?: boolean;
}) {
  const inputId = compact ? "assistant-panel-message" : "assistant-message";
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => setVoiceSupported(getRecognition() !== null), []);

  function submit() {
    const message = text.trim();
    if (!message || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await sendMessage({ conversation_id: conversationId, text: message });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText("");
      if (onSent && result.data) {
        onSent(result.data.conversationId);
      } else if (result.data && result.data.conversationId !== conversationId) {
        router.push(`/assistant?c=${result.data.conversationId}`);
      } else {
        router.refresh();
      }
    });
  }

  function toggleVoice() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const r = getRecognition();
    if (!r) return;
    r.lang = "en-GB";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const heard = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (heard) setText((t) => (t ? `${t} ${heard}` : heard));
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e?.error && e.error !== "aborted")
        setError(
          VOICE_ERRORS[e.error] ?? "Speech-to-text stopped. Please try again, or type instead.",
        );
    };
    recognition.current = r;
    setError(null);
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
      setError("Speech-to-text couldn't start. Please try again, or type instead.");
    }
  }

  return (
    <form
      className="space-y-2 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {error && <Alert variant="error">{error}</Alert>}
      <label htmlFor={inputId} className="sr-only">
        Message the assistant
      </label>
      <Textarea
        id={inputId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={compact ? 2 : 3}
        maxLength={2000}
        placeholder={listening ? "Listening…" : "Ask or tell the assistant what to do…"}
        disabled={disabled || pending}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {pending
            ? "The assistant is working on it…"
            : compact
              ? "Enter to send"
              : "Enter to send, Shift+Enter for a new line."}
        </p>
        <div className="flex gap-2">
          {voiceSupported && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleVoice}
              disabled={disabled || pending}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Speak your message"}
              title="Uses your browser's speech-to-text"
            >
              {listening ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
            </Button>
          )}
          <Button type="submit" disabled={disabled || pending || !text.trim()}>
            <Send aria-hidden="true" /> Send
          </Button>
        </div>
      </div>
    </form>
  );
}
