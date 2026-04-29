'use client';

import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { RenderShimmer } from '@/components/RenderShimmer';
import { useSubmissionPolling } from '@/hooks/useSubmissionPolling';
import { concatClips } from '@/lib/ffmpeg';
import { submit } from '@/lib/humeoApi';
import { recordingStore, useRecordingStore } from '@/lib/recordingStore';
import type { PublicSubmitResult } from '@/lib/reviews/types';
import { ensureDeviceKey } from '@/lib/utils';

type Phase =
  | { kind: 'idle' }
  | { kind: 'concatenating'; progress: number }
  | { kind: 'uploading' }
  | { kind: 'polling'; result: PublicSubmitResult }
  | { kind: 'ready'; result: PublicSubmitResult }
  | { kind: 'error'; message: string };

function pipelineErrorMessage(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Submit failed';
  }
}

export default function PreviewPage() {
  const router = useRouter();
  const store = useRecordingStore();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const triggeredRef = useRef(false);

  const submissionId =
    phase.kind === 'polling' || phase.kind === 'ready' ? phase.result.submissionId : null;

  const { result: pollResult } = useSubmissionPolling(submissionId, store.slug, 1500);

  useEffect(() => {
    if (!pollResult) return;
    if (pollResult.status === 'reward_issued' || pollResult.decision === 'pass') {
      setPhase({ kind: 'ready', result: pollResult });
    } else if (
      pollResult.status === 'processing_failed' ||
      pollResult.decision === 'fail_and_retry'
    ) {
      setPhase({
        kind: 'error',
        message: pollResult.feedback || 'Processing failed. Please try again.',
      });
    } else {
      setPhase({ kind: 'polling', result: pollResult });
    }
  }, [pollResult]);

  const runPipeline = useCallback(async () => {
    if (store.orderedClips.length === 0) {
      router.replace('/');
      return;
    }

    try {
      setPhase({ kind: 'concatenating', progress: 0 });

      const concat = await concatClips(
        store.orderedClips.map((clip) => ({ blob: clip.blob, ext: clip.ext })),
        (progress) => setPhase({ kind: 'concatenating', progress }),
      );

      setPhase({ kind: 'uploading' });

      const result = await submit({
        slug: store.slug ?? 'sageandstone',
        consentAccepted: true,
        socialHandle: store.socialHandle || undefined,
        deviceKey: ensureDeviceKey(),
        tableId: store.tableId,
        durationSeconds: concat.durationSeconds,
        video: concat.blob,
        videoFileName: concat.filename,
      });

      setPhase({ kind: 'polling', result });
    } catch (err) {
      console.error('[matcha-moments/preview] pipeline failed', err);
      setPhase({
        kind: 'error',
        message: pipelineErrorMessage(err) || 'Submit failed',
      });
    }
  }, [router, store.orderedClips, store.slug, store.socialHandle, store.tableId]);

  useEffect(() => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    void runPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = () => {
    void runPipeline();
  };

  const handleSubmitFinal = () => {
    if (phase.kind === 'ready') {
      router.push(`/reward?code=${encodeURIComponent(phase.result.reward?.value ?? '')}`);
    }
  };

  const handleRerecord = () => {
    recordingStore.reset();
    router.replace(`/c/${encodeURIComponent(store.slug ?? 'sageandstone')}/record`);
  };

  const isReady = phase.kind === 'ready';

  const renderSteps = useMemo(
    () => [
      {
        label: 'Stitching recorded clips',
        done: phase.kind !== 'concatenating',
        current: phase.kind === 'concatenating',
      },
      {
        label: 'Saving the video',
        done: phase.kind === 'polling' || phase.kind === 'ready',
        current: phase.kind === 'uploading',
      },
      {
        label: 'Checking the submission',
        done: isReady,
        current: phase.kind === 'polling',
      },
      {
        label: 'Matcha code',
        done: isReady,
        current: false,
      },
    ],
    [isReady, phase.kind],
  );

  return (
    <main className="flex min-h-dvh flex-col bg-cream">
      <section className="flex flex-1 flex-col px-7 pt-8">
        <div className="mb-6">
          {isReady ? (
            <>
              <div className="text-eyebrow mb-3 text-matcha">approved</div>
              <h1 className="text-display text-[32px] text-ink">
                Your review is <em className="text-matcha">saved.</em>
              </h1>
            </>
          ) : (
            <>
              <div className="text-eyebrow mb-3 text-matcha">processing</div>
              <h1 className="text-display text-[32px] text-ink">
                Saving your
                <br />
                <em className="text-matcha">matcha moment.</em>
              </h1>
            </>
          )}
        </div>

        <div className="rounded-[22px] border border-ink/10 bg-paper p-5 shadow-[0_18px_50px_rgba(42,37,32,0.12)]">
          <div className="relative mx-auto mb-5 flex aspect-[9/16] max-h-[460px] w-full max-w-[260px] items-center justify-center overflow-hidden rounded-[28px] border-[8px] border-[#16120f] bg-[#15120f] shadow-[0_18px_45px_rgba(42,37,32,0.18)]">
            <div className="pointer-events-none absolute left-1/2 top-2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-cream/20" />
            {!isReady ? (
              <div className="flex flex-col items-center px-5 text-center">
                <RenderShimmer />
                <p className="relative z-10 mt-4 max-w-[240px] text-sm leading-6 text-cream/75">
                  The office prototype is saving your stitched recording and preparing the reward.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center px-5 text-center">
                <CheckCircle2 className="h-16 w-16 text-sage" />
                <p className="mt-5 max-w-[240px] text-sm leading-6 text-cream/80">
                  Saved locally for the team to review in the internal dashboard.
                </p>
              </div>
            )}
          </div>

          <ul className="flex flex-col gap-2.5">
            {renderSteps.map((step) => (
              <li
                key={step.label}
                className="flex items-center gap-3 rounded-xl border border-ink/10 bg-cream px-3.5 py-3 text-[13px] text-ink/75"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    step.done
                      ? 'bg-matcha text-cream'
                      : step.current
                        ? 'animate-spin border-2 border-matcha border-t-transparent'
                        : 'bg-cream-deep text-muted'
                  }`}
                >
                  {step.done ? 'OK' : step.current ? '' : '-'}
                </span>
                <span>{step.label}</span>
              </li>
            ))}
          </ul>

          {phase.kind === 'concatenating' ? (
            <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
              Stitching clips - {Math.round(phase.progress * 100)}%
            </p>
          ) : null}

          {phase.kind === 'uploading' ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving recording
            </p>
          ) : null}

          {phase.kind === 'error' ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {phase.message}
            </div>
          ) : null}
        </div>

        {isReady ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-ink/10 bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-ink">
              {store.orderedClips.length} clips
            </span>
            <span className="rounded-full border border-ink/10 bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-ink">
              saved locally
            </span>
            <span className="rounded-full border border-ink/10 bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-ink">
              reward ready
            </span>
          </div>
        ) : null}
      </section>

      <footer className="flex flex-col gap-2.5 px-7 pb-6 pt-4">
        {isReady ? (
          <>
            <Button onClick={handleSubmitFinal}>Reveal matcha code</Button>
            <Button variant="secondary" onClick={handleRerecord}>
              <RotateCcw className="h-4 w-4" />
              Re-record clips
            </Button>
          </>
        ) : phase.kind === 'error' ? (
          <>
            <Button onClick={handleRetry}>Try again</Button>
            <Button variant="secondary" onClick={handleRerecord}>
              <RotateCcw className="h-4 w-4" />
              Re-record clips
            </Button>
          </>
        ) : (
          <Button disabled>Processing...</Button>
        )}
      </footer>
    </main>
  );
}
