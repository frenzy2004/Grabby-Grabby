'use client';

import { Loader2, Play, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { RenderShimmer } from '@/components/RenderShimmer';
import { concatClips } from '@/lib/ffmpeg';
import { submit } from '@/lib/humeoApi';
import { recordingStore, useRecordingStore } from '@/lib/recordingStore';
import type { PublicSubmitResult } from '@/lib/reviews/types';
import { useSubmissionPolling } from '@/hooks/useSubmissionPolling';
import { ensureDeviceKey } from '@/lib/utils';

type Phase =
  | { kind: 'idle' }
  | { kind: 'concatenating'; progress: number }
  | { kind: 'uploading' }
  | { kind: 'polling'; result: PublicSubmitResult }
  | { kind: 'ready'; result: PublicSubmitResult }
  | { kind: 'error'; message: string };

export default function PreviewPage() {
  const router = useRouter();
  const store = useRecordingStore();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const triggeredRef = useRef(false);

  const submissionId =
    phase.kind === 'polling' || phase.kind === 'ready' ? phase.result.submissionId : null;

  const { result: pollResult } = useSubmissionPolling(
    submissionId,
    store.slug,
  );

  // Bridge polling results back into our local phase state.
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

  // Kick off the submit pipeline once on mount.
  useEffect(() => {
    if (triggeredRef.current) return;
    if (store.orderedClips.length === 0) {
      // No clips — user navigated straight here. Send them home.
      router.replace('/');
      return;
    }
    triggeredRef.current = true;

    void (async () => {
      try {
        setPhase({ kind: 'concatenating', progress: 0 });

        const concat = await concatClips(
          store.orderedClips.map((c) => ({ blob: c.blob, ext: c.ext })),
          (p) => setPhase({ kind: 'concatenating', progress: p }),
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
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Submit failed',
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isReady = phase.kind === 'ready';

  const renderSteps = useMemo(
    () => [
      { label: 'Stitching clips', done: phase.kind !== 'concatenating' },
      { label: 'Uploading', done: phase.kind === 'polling' || phase.kind === 'ready' },
      {
        label: 'Generating subtitles',
        done: isReady,
        current: phase.kind === 'polling',
      },
      { label: 'Final polish', done: isReady, pending: !isReady },
    ],
    [isReady, phase.kind],
  );

  const handleSubmitFinal = () => {
    if (phase.kind === 'ready') {
      router.push(`/reward?code=${encodeURIComponent(phase.result.reward?.value ?? '')}`);
    }
  };

  const handleRerecord = () => {
    recordingStore.reset();
    router.replace(`/c/${encodeURIComponent(store.slug ?? 'sageandstone')}/record`);
  };

  return (
    <main className="flex min-h-dvh flex-col bg-cream">
      <section className="flex-1 px-7 pt-6">
        <div className="mb-5">
          {isReady ? (
            <>
              <div className="text-eyebrow mb-3 text-matcha">your video — ready</div>
              <h1 className="text-display text-[30px] text-ink">
                Looking <em className="text-matcha">delicious.</em>
              </h1>
            </>
          ) : (
            <>
              <div className="text-eyebrow mb-3 text-matcha">rendering · please wait</div>
              <h1 className="text-display text-[30px] text-ink">
                Putting it
                <br />
                <em className="text-matcha">together.</em>
              </h1>
            </>
          )}
        </div>

        <div
          className="relative mb-4 aspect-[9/16] max-h-[380px] overflow-hidden rounded-[22px] shadow-[0_20px_50px_rgba(0,0,0,0.2)]"
          style={{
            background:
              'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.7)), radial-gradient(ellipse at 50% 50%, #d88845 0%, #6e3818 100%)',
          }}
        >
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[100px] drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)]">
            🥗
          </span>

          {!isReady ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
              <RenderShimmer />
              <ul className="relative z-10 flex w-full max-w-[240px] flex-col gap-2.5">
                {renderSteps.map((step, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-[13px] text-cream/90 ${
                      step.pending ? 'opacity-45' : ''
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                        step.done
                          ? 'bg-matcha text-cream'
                          : step.current
                          ? 'animate-spin border-2 border-matcha border-t-transparent'
                          : 'bg-cream-deep text-muted'
                      }`}
                    >
                      {step.done ? '✓' : step.current ? '' : '·'}
                    </span>
                    {step.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink"
                aria-label="Play preview"
              >
                <Play className="ml-1 h-6 w-6" fill="currentColor" />
              </button>
              <div className="absolute bottom-[60px] left-4 right-4 rounded-md bg-white/95 px-3.5 py-2.5 text-center text-sm font-bold text-ink shadow">
                &ldquo;The miso eggplant — <span className="bg-sage px-1">unreal</span> 🤤&rdquo;
              </div>
              <div className="absolute bottom-3.5 left-4 right-4 flex items-center gap-2.5 font-mono text-[10px] text-white">
                <span>0:14</span>
                <div className="flex-1 overflow-hidden rounded-full bg-white/30">
                  <div className="h-[3px] w-[35%] bg-white" />
                </div>
                <span>0:42</span>
              </div>
            </>
          )}
        </div>

        {isReady ? (
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-ink/10 bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-ink">
              {store.orderedClips.length} clips
            </span>
            <span className="rounded-full border border-ink/10 bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-ink">
              subtitles on
            </span>
            <span className="rounded-full border border-ink/10 bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-ink">
              9:16 vertical
            </span>
          </div>
        ) : null}

        {phase.kind === 'concatenating' ? (
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
            Stitching clips · {Math.round(phase.progress * 100)}%
          </p>
        ) : null}

        {phase.kind === 'uploading' ? (
          <p className="mt-3 flex items-center justify-center gap-2 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
            <Loader2 className="h-3 w-3 animate-spin" /> Uploading to Humeo
          </p>
        ) : null}

        {phase.kind === 'error' ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {phase.message}
          </div>
        ) : null}
      </section>

      <footer className="flex flex-col gap-2.5 px-7 pb-6 pt-2">
        {isReady ? (
          <>
            <Button onClick={handleSubmitFinal}>Submit &amp; get my matcha</Button>
            <Button variant="secondary" onClick={handleRerecord}>
              <RotateCcw className="h-4 w-4" />
              Re-record clips
            </Button>
          </>
        ) : (
          <Button disabled>Submit (rendering…)</Button>
        )}
      </footer>
    </main>
  );
}
