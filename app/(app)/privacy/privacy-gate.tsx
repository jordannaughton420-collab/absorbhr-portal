import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/app/markdown";
import { acknowledgePrivacyNotice } from "./actions";

type Notice = {
  id: string;
  version: number;
  title: string;
  body: string;
  acknowledged_at: string | null;
};

export function PrivacyGate({
  notice,
  standalone = false,
}: {
  notice: Notice;
  standalone?: boolean;
}) {
  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>{notice.title}</CardTitle>
        <CardDescription>
          Version {notice.version}.{" "}
          {notice.acknowledged_at
            ? `You acknowledged this on ${new Date(notice.acknowledged_at).toLocaleDateString("en-GB")}.`
            : standalone
              ? "You haven't acknowledged this version yet."
              : "Please read this notice before continuing. It explains how your personal data is used."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="max-h-[60vh] overflow-y-auto rounded-lg border bg-muted/40 p-4"
          tabIndex={0}
          aria-label="Privacy notice text"
        >
          <Markdown source={notice.body} />
        </div>
        {!notice.acknowledged_at && (
          <form action={acknowledgePrivacyNotice} className="mt-5">
            <input type="hidden" name="noticeId" value={notice.id} />
            <Button type="submit">I have read and understood this notice</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
