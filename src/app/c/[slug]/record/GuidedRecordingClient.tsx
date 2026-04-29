'use client';

import { ChevronLeft, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ProgressPips } from '@/components/ProgressPips';
import { PromptCard } from '@/components/PromptCard';
import { RecordButton } from '@/components/RecordButton';
import { RecordingBadge } from '@/components/RecordingBadge';
import { useGuidedRecording } from '@/hooks/useGuidedRecording';
import { recordingStore, useRecordingStore } from '@/lib/recordingStore';
import type { PublicReviewCampaign } from '@/lib/reviews/types';

type Props = {
  slug: string;
  tableId: string | null;
  campaign: PublicReviewCampaign;
};

export function GuidedRecordingClient({ slug, tableId, campaign }: Props) {
  const router = useRouter();
  const store = useRecordingStore();
  const totalSteps = campaign.prompts.length;
  const [stepNum, setStepNum] = useState(1);

  useEffect(() => {
    recordingStore.setMeta({ slug, tableId });
  }, [slug, tableId]);

  const currentPrompt = campaign.prompts[stepNum - 1];

  const handleClipReady = useCallback(
    (clip: { blob: Blob; durationSeconds: number; ext: 'webm' | 'mp4' | 'mov' }) => {
      recordingStore.setClip({
        step: stepNum,
        blob: clip.blob,
        durationSeconds: clip.durationSeconds,
        ext: clip.ext,
      });

      if (stepNum < totalSteps) {
        // Tiny delay so the user sees the "finalizing" beat.
        window.setTimeout(() => setStepNum((s) => s + 1), 250);
      } else {
        window.setTimeout(() => router.push('/preview'), 250);
      }
    },
    [router, stepNum, totalSteps],
  );

  if (!currentPrompt) {
    return null;
  }

  return (
    <RecorderInner
      key={`${currentPrompt.step}-${currentPrompt.camera}`}
      campaign={campaign}
      stepNum={stepNum}
      totalSteps={totalSteps}
      doneCount={Object.keys(store.clipsByStep).filter((k) => Number(k) < stepNum).length}
      prompt={currentPrompt}
      onClipReady={handleClipReady}
      onBack={() => {
        if (stepNum > 1) setStepNum((s) => s - 1);
        else router.back();
      }}
      onSkip={() => {
        // Skip forward without producing a clip — useful for demo purposes only.
        if (stepNum < totalSteps) setStepNum((s) => s + 1);
        else router.push('/preview');
      }}
    />
  );
}

type InnerProps = {
  campaign: PublicReviewCampaign;
  stepNum: number;
  totalSteps: number;
  doneCount: number;
  prompt: PublicReviewCampaign['prompts'][number];
  onClipReady: (clip: { blob: Blob; durationSeconds: number; ext: 'webm' | 'mp4' | 'mov' }) => void;
  onBack: () => void;
  onSkip: () => void;
};

function RecorderInner({
  stepNum,
  totalSteps,
  doneCount,
  prompt,
  onClipReady,
  onBack,
  onSkip,
}: InnerProps) {
  const {
    state,
    elapsedMs,
    liveProgress,
    error,
    videoRef,
    startRecording,
    stopRecording,
    requestPermissionAndPreview,
  } = useGuidedRecording({ prompt, onClipReady });

  const handleRecordPress = () => {
    if (state === 'recording') {
      stopRecording();
    } else if (state === 'ready') {
      startRecording();
    } else if (state === 'idle') {
      void requestPermissionAndPreview();
    }
  };

  return (
    <main className="relative flex min-h-dvh flex-col bg-[#0e0d0b] text-white">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div className="absolute inset-0 bg-black/15" aria-hidden />

      <div className="relative flex flex-1 flex-col">
        <div className="pt-[max(env(safe-area-inset-top),16px)]">
          <ProgressPips
            total={totalSteps}
            current={stepNum}
            doneCount={doneCount}
            liveProgress={state === 'recording' ? liveProgress : 0}
          />
        </div>

        <div className="px-4 pt-8">
          <PromptCard
            step={stepNum}
            totalSteps={totalSteps}
            title={prompt.title}
            tip={prompt.tip}
          />
        </div>

        <div className="flex-1" />

        <div className="flex flex-col items-center gap-4 pb-[max(env(safe-area-inset-bottom),24px)]">
          <RecordingBadge elapsedMs={elapsedMs} visible={state === 'recording'} />

          {error ? (
            <div className="mx-4 rounded-2xl bg-red-500/90 px-4 py-2 text-sm">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-12">
            <button
              type="button"
              onClick={onBack}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur"
              aria-label="Previous"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <RecordButton
              recording={state === 'recording'}
              disabled={state === 'requesting_permission' || state === 'finalizing'}
              onClick={handleRecordPress}
            />

            <button
              type="button"
              onClick={onSkip}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur"
              aria-label="Skip clip"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onSkip}
            className="font-mono text-[10px] uppercase tracking-[0.05em] text-white/50"
          >
            Demo only · skip without recording →
          </button>
        </div>
      </div>
    </main>
  );
}
