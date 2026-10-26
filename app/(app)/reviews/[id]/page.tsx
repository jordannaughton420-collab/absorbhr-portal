import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { REVIEW_STATUS } from "@/lib/validation/people";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { ManagerReviewForm, SelfAssessmentForm, SignForm } from "../review-forms";

export const metadata: Metadata = { title: "Review · AbsorbHR Portal" };

type Review = {
  id: string;
  employee_id?: string;
  title: string;
  status: keyof typeof REVIEW_STATUS;
  self_assessment: string | null;
  self_submitted_at: string | null;
  manager_assessment: string | null;
  rating: number | null;
  objectives: string | null;
  manager_submitted_at: string | null;
  employee_comments: string | null;
  employee_signed_at: string | null;
  manager_signed_at: string | null;
};

function Prose({ text }: { text: string | null }) {
  return text ? (
    <p className="whitespace-pre-line text-sm leading-relaxed">{text}</p>
  ) : (
    <p className="text-sm text-muted-foreground">Nothing written yet.</p>
  );
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await requireContext();
  const supabase = await createClient();

  // Managers/HR read the table (RLS); the employee reads a version with the manager's draft hidden.
  const { data: managed } = await supabase
    .from("performance_reviews")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  let review: Review | null = managed as Review | null;
  const asEmployee = !managed;
  if (!review) {
    const { data } = await supabase.rpc("my_review", { p_review: id });
    review = (data as Review | null) ?? null;
  }
  if (!review) notFound();

  const [{ data: person }, { data: settings }] = await Promise.all([
    review.employee_id
      ? supabase
          .from("employee_directory")
          .select("first_name, preferred_name, last_name")
          .eq("id", review.employee_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("tenant_settings")
      .select("review_rating_scale, review_rating_labels")
      .maybeSingle(),
  ]);
  const labels = settings?.review_rating_scale ? settings.review_rating_labels : null;
  const name = person
    ? `${person.preferred_name || person.first_name} ${person.last_name}`
    : "Employee";
  const shared = review.status === "discussion" || review.status === "completed";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reviews" className="text-sm text-primary underline-offset-4 hover:underline">
          ← Reviews
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {review.title}
          {asEmployee ? "" : `: ${name}`}
        </h1>
        <div className="mt-2">
          <Badge>{REVIEW_STATUS[review.status]}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{asEmployee ? "Your self-assessment" : "Self-assessment"}</CardTitle>
          {review.self_submitted_at && (
            <CardDescription>Submitted {formatDate(review.self_submitted_at)}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {asEmployee && !review.self_submitted_at ? (
            <SelfAssessmentForm reviewId={review.id} value={review.self_assessment ?? ""} />
          ) : review.self_submitted_at ? (
            <Prose text={review.self_assessment} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Not submitted yet. You&apos;ll see it once {name.split(" ")[0]} submits it.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manager&apos;s assessment</CardTitle>
          {review.manager_submitted_at && (
            <CardDescription>Shared {formatDate(review.manager_submitted_at)}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!asEmployee && !review.manager_submitted_at ? (
            <ManagerReviewForm
              reviewId={review.id}
              values={{
                manager_assessment: review.manager_assessment ?? "",
                rating: review.rating,
                objectives: review.objectives ?? "",
              }}
              ratingLabels={labels}
            />
          ) : shared ? (
            <>
              <Prose text={review.manager_assessment} />
              {review.rating && labels && (
                <p className="text-sm">
                  <span className="font-medium">Overall rating:</span> {review.rating} —{" "}
                  {labels[review.rating - 1]}
                </p>
              )}
              {review.objectives && (
                <div>
                  <h3 className="text-sm font-semibold">Objectives</h3>
                  <Prose text={review.objectives} />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your manager hasn&apos;t shared their assessment yet.
            </p>
          )}
        </CardContent>
      </Card>

      {shared && (
        <Card>
          <CardHeader>
            <CardTitle>Sign-off</CardTitle>
            <CardDescription>
              Signing confirms the review has been discussed; it doesn&apos;t mean you agree with
              everything.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Employee:{" "}
              {review.employee_signed_at
                ? `signed ${formatDate(review.employee_signed_at)}`
                : "not yet signed"}
            </p>
            {review.employee_comments && (
              <p className="italic text-muted-foreground">“{review.employee_comments}”</p>
            )}
            <p>
              Reviewer:{" "}
              {review.manager_signed_at
                ? `signed ${formatDate(review.manager_signed_at)}`
                : "not yet signed"}
            </p>
            {review.status === "discussion" &&
              (asEmployee ? !review.employee_signed_at : !review.manager_signed_at) && (
                <SignForm reviewId={review.id} asEmployee={asEmployee} />
              )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
