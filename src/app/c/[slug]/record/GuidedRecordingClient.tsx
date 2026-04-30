'use client';

import { ChevronLeft, Mic, SkipForward } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ProgressPips } from '@/components/ProgressPips';
import { PromptCard } from '@/components/PromptCard';
import { RecordButton } from '@/components/RecordButton';
import { RecordingBadge } from '@/components/RecordingBadge';
import { MobileShell } from '@/components/MobileShell';
import { useGuidedRecording } from '@/hooks/useGuidedRecording';
import { recordingStore, useRecordingStore } from '@/lib/recordingStore';
import type { PublicReviewCampaign } from '@/lib/reviews/types';

type Props = {
  slug: string;
  tableId: string | null;
  campaign: PublicReviewCampaign;
};

type ClipReadyInput = {
  blob: Blob;
  durationSeconds: number;
  ext: 'webm' | 'mp4' | 'mov';
};

export function GuidedRecordingClient({ slug, tableId, campaign }: Props) {
  const router = useRouter();
  const store = useRecordingStore();
  const totalSteps = campaign.prompts.length;
  const [stepNum, setStepNum] = useState(1);
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    recordingStore.setMeta({ slug, tableId });
    if (window.sessionStorage.getItem(`matcha-moments-consent:${slug}`) === 'true') {
      setHasConsent(true);
      return;
    }

    const tableQuery = tableId ? `?t=${encodeURIComponent(tableId)}` : '';
    router.replace(`/c/${encodeURIComponent(slug)}${tableQuery}`);
  }, [router, slug, tableId]);

  const currentPrompt = campaign.prompts[stepNum - 1];
  const goNext = useCallback(() => {
    if (stepNum < totalSteps) {
      window.setTimeout(() => setStepNum((s) => s + 1), 250);
    } else {
      window.setTimeout(() => router.push('/preview'), 250);
    }
  }, [router, stepNum, totalSteps]);

  const handleClipReady = useCallback(
    (clip: ClipReadyInput) => {
      recordingStore.setClip({
        step: stepNum,
        mediaType: currentPrompt?.mediaType ?? 'video',
        blob: clip.blob,
        durationSeconds: clip.durationSeconds,
        ext: clip.ext,
      });

      goNext();
    },
    [currentPrompt?.mediaType, goNext, stepNum],
  );

  const handleSkip = useCallback(() => {
    if (!currentPrompt?.optional) return;
    recordingStore.skipStep(stepNum);
    goNext();
  }, [currentPrompt?.optional, goNext, stepNum]);

  if (!hasConsent || !currentPrompt) {
    return null;
  }

  return (
    <RecorderInner
      key={`${currentPrompt.mediaType ?? 'video'}-${currentPrompt.camera}`}
      stepNum={stepNum}
      totalSteps={totalSteps}
      doneCount={
        Object.keys(store.clipsByStep).filter((k) => Number(k) < stepNum).length +
        Object.keys(store.skippedSteps).filter((k) => Number(k) < stepNum).length
      }
      prompt={currentPrompt}
      onClipReady={handleClipReady}
      onSkip={currentPrompt.optional ? handleSkip : undefined}
      onBack={() => {
        if (stepNum > 1) setStepNum((s) => s - 1);
        else router.back();
      }}
    />
  );
}

type InnerProps = {
  stepNum: number;
  totalSteps: number;
  doneCount: number;
  prompt: PublicReviewCampaign['prompts'][number];
  onClipReady: (clip: ClipReadyInput) => void;
  onSkip?: () => void;
  onBack: () => void;
};

function RecorderInner({
  stepNum,
  totalSteps,
  doneCount,
  prompt,
  onClipReady,
  onSkip,
  onBack,
}: InnerProps) {
  const mediaType = prompt.mediaType ?? 'video';
  const isAudio = mediaType === 'audio';
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
    <MobileShell tone="dark">
      <main className="relative flex min-h-dvh flex-col bg-[#0e0d0b] text-white">
      {isAudio ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(184,201,168,0.28),transparent_34%),linear-gradient(160deg,#15130f,#272119_55%,#0e0d0b)]"
          aria-hidden
        >
          <div className="flex h-40 w-40 items-center justify-center rounded-full border border-white/15 bg-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <Mic className="h-16 w-16 text-sage" />
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

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
            label={isAudio ? 'Voice' : 'Shot'}
            optional={prompt.optional}
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

          <div className="flex items-center justify-center gap-10">
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

            {onSkip ? (
              <button
                type="button"
                onClick={onSkip}
                disabled={state === 'recording' || state === 'requesting_permission' || state === 'finalizing'}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur disabled:opacity-40"
                aria-label="Skip optional reaction"
              >
                <SkipForward className="h-5 w-5" />
              </button>
            ) : null}
          </div>

          {onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              disabled={state === 'recording' || state === 'requesting_permission' || state === 'finalizing'}
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white/80 backdrop-blur disabled:opacity-40"
            >
              Skip this shot
            </button>
          ) : null}
        </div>
      </div>
      </main>
    </MobileShell>
  );
}
