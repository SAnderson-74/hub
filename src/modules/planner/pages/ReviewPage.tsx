import { ArrowRight, CircleCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { ProgressBar } from "../../../client/components/ProgressBar";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { StatusDot } from "../../../client/components/StatusDot";
import { ghostButton, primaryButton } from "../../../client/components/ui";
import { formatLongDate } from "../../tasks/dates";
import { type ReviewStep, useFinishReview, useReview, useTickStep } from "../queries";

/**
 * The weekly review: a short pass over every module, each step with what's there and
 * a link to fix it. Steps with nothing to fix tick themselves off.
 */
export function ReviewPage() {
  const review = useReview();
  const finish = useFinishReview();

  if (review.isPending) {
    return (
      <>
        <PageHeader title="Weekly review" />
        <LoadingRows rows={4} />
      </>
    );
  }
  if (review.isError) {
    return (
      <>
        <PageHeader title="Weekly review" />
        <ErrorNote error={review.error} onRetry={() => void review.refetch()} />
      </>
    );
  }

  const { week, steps, finishedAt, lastFinished } = review.data;
  const done = steps.filter((step) => step.done).length;
  const percent = steps.length === 0 ? 100 : Math.round((done / steps.length) * 100);

  return (
    <>
      <PageHeader
        title="Weekly review"
        subtitle={`The week of ${formatLongDate(week)}. ${
          lastFinished ? `Last finished the week of ${formatLongDate(lastFinished)}.` : ""
        }`.trim()}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <Panel
          title="Steps"
          description="Work down the list. Each link opens the place to fix it; come back and tick it off."
          className="lg:col-span-8"
        >
          <ol className="space-y-2">
            {steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </ol>
        </Panel>

        <Panel title="Progress" className="lg:col-span-4">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold text-fg">
                {done} of {steps.length} steps done
              </p>
              <ProgressBar percent={percent} label={`${done} of ${steps.length} steps done`} />
            </div>
            {finishedAt ? (
              <div className="space-y-2">
                <p role="status" className="flex items-center gap-2 font-semibold text-ok">
                  <CircleCheck aria-hidden="true" className="size-5" />
                  Review finished for this week
                </p>
                <button
                  type="button"
                  className={`${ghostButton} -ml-4`}
                  disabled={finish.isPending}
                  onClick={() => finish.mutate(false)}
                >
                  Reopen review
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  className={primaryButton}
                  disabled={finish.isPending}
                  onClick={() => finish.mutate(true)}
                >
                  Finish review
                </button>
                {done < steps.length ? (
                  <p className="text-sm text-muted">
                    {steps.length - done} {steps.length - done === 1 ? "step is" : "steps are"}{" "}
                    left. You can finish anyway.
                  </p>
                ) : null}
              </div>
            )}
            {finish.error ? (
              <p role="alert" className="text-sm text-danger">
                {finish.error.message}
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
    </>
  );
}

function StepRow({ step }: { step: ReviewStep }) {
  const tick = useTickStep();
  // What was just ticked, shown at once while it saves.
  const [ticking, setTicking] = useState<boolean | null>(null);
  const done = ticking ?? step.done;
  // A fix step with nothing left is done by itself, with nothing to tick.
  const clear = step.kind === "fix" && step.count === 0;
  return (
    <li className="rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50">
      <div className="flex items-start gap-3">
        {clear ? (
          <CircleCheck aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-ok" />
        ) : (
          <input
            type="checkbox"
            checked={done}
            onChange={(event) => {
              const next = event.target.checked;
              setTicking(next);
              tick.mutate({ step: step.id, done: next }, { onSettled: () => setTicking(null) });
            }}
            aria-label={step.title}
            className="mt-0.5 size-6 shrink-0 accent-accent"
          />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`font-semibold break-words ${done ? "text-muted line-through" : "text-fg"}`}
          >
            {step.title}
          </p>
          <p className="mt-0.5 flex items-start gap-2 text-sm text-muted">
            {step.kind === "fix" && !clear ? (
              <span className="mt-1.5">
                <StatusDot tone="warn" />
              </span>
            ) : null}
            <span className="min-w-0">{step.summary}</span>
          </p>
          {clear ? null : (
            <Link
              to={step.href}
              className="mt-1 -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-accent-text hover:bg-surface-0"
            >
              {step.linkLabel}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
          {tick.error ? (
            <p role="alert" className="text-sm text-danger">
              {tick.error.message}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
