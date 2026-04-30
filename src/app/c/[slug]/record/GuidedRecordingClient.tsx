'use client';

import { Camera, ChevronLeft, Loader2, Mic, SkipForward } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProgressPips } from '@/components/ProgressPips';
import { PromptCard } from '@/components/PromptCard';
import { RecordButton } from '@/components/RecordButton';
import { RecordingBadge } from '@/components/RecordingBadge';
import { MobileShell } from '@/components/MobileShell';
import { useGuidedRecording } from '@/hooks/useGuidedRecording';
import { uploadClip } from '@/lib/humeoApi';
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
  needsOptimization?: boolean;
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
      const mediaType = currentPrompt?.mediaType ?? 'video';
      const savedClip = recordingStore.setClip({
        step: stepNum,
        mediaType,
        blob: clip.blob,
        durationSeconds: clip.durationSeconds,
        ext: clip.ext,
        needsOptimization: clip.needsOptimization,
      });

      const shouldUploadForServer =
        clip.needsOptimization ||
        recordingStore.snapshot().orderedClips.some((recorded) => recorded.needsOptimization);

      if (shouldUploadForServer) {
        const { sessionId } = recordingStore.snapshot();
        recordingStore.startClipUpload(
          savedClip.step,
          savedClip.takeId,
          uploadClip({
            sessionId,
            step: savedClip.step,
            takeId: savedClip.takeId,
            mediaType,
            blob: clip.blob,
            ext: clip.ext,
          }),
        );
      }

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
  const captureMode = useVideoCaptureMode(mediaType);

  if (mediaType === 'video' && captureMode === 'native') {
    return (
      <NativeVideoCapture
        stepNum={stepNum}
        totalSteps={totalSteps}
        doneCount={doneCount}
        prompt={prompt}
        onClipReady={onClipReady}
        onSkip={onSkip}
        onBack={onBack}
      />
    );
  }

  if (mediaType === 'video' && captureMode === 'checking') {
    return (
      <StaticCaptureShell
        stepNum={stepNum}
        totalSteps={totalSteps}
        doneCount={doneCount}
        prompt={prompt}
        onBack={onBack}
      />
    );
  }

  return (
    <BrowserMediaRecorder
      stepNum={stepNum}
      totalSteps={totalSteps}
      doneCount={doneCount}
      prompt={prompt}
      onClipReady={onClipReady}
      onSkip={onSkip}
      onBack={onBack}
    />
  );
}

function useVideoCaptureMode(mediaType: 'video' | 'audio') {
  const [mode, setMode] = useState<'checking' | 'native' | 'browser'>(
    mediaType === 'video' ? 'checking' : 'browser',
  );

  useEffect(() => {
    if (mediaType !== 'video') {
      setMode('browser');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const explicitCaptureMode = params.get('capture');
    if (explicitCaptureMode === 'browser') {
      setMode('browser');
      return;
    }

    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const narrowViewport = window.matchMedia?.('(max-width: 760px)').matches ?? false;
    const mobileUserAgent = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    setMode(
      explicitCaptureMode === 'native' || coarsePointer || narrowViewport || mobileUserAgent
        ? 'native'
        : 'browser',
    );
  }, [mediaType]);

  return mode;
}

function extFromFile(file: File): 'webm' | 'mp4' | 'mov' {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith('.mov') || type.includes('quicktime')) return 'mov';
  if (name.endsWith('.mp4') || type.includes('mp4')) return 'mp4';
  return 'webm';
}

function StaticCaptureShell({
  stepNum,
  totalSteps,
  doneCount,
  prompt,
  onBack,
}: Pick<InnerProps, 'stepNum' | 'totalSteps' | 'doneCount' | 'prompt' | 'onBack'>) {
  return (
    <MobileShell tone="dark">
      <main className="relative flex min-h-dvh flex-col bg-[#0e0d0b] text-white">
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(184,201,168,0.22),transparent_34%),linear-gradient(160deg,#15130f,#272119_55%,#0e0d0b)]"
          aria-hidden
        />
        <div className="relative flex flex-1 flex-col">
          <div className="pt-[max(env(safe-area-inset-top),16px)]">
            <ProgressPips total={totalSteps} current={stepNum} doneCount={doneCount} />
          </div>

          <div className="px-4 pt-8">
            <PromptCard
              step={stepNum}
              totalSteps={totalSteps}
              title={prompt.title}
              tip={prompt.tip}
              label="Shot"
              optional={prompt.optional}
            />
          </div>

          <div className="flex flex-1 items-center justify-center px-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-sage" />
          </div>

          <div className="pb-[max(env(safe-area-inset-bottom),24px)]">
            <button
              type="button"
              onClick={onBack}
              className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur"
              aria-label="Previous"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>
        </div>
      </main>
    </MobileShell>
  );
}

function NativeVideoCapture({
  stepNum,
  totalSteps,
  doneCount,
  prompt,
  onClipReady,
  onSkip,
  onBack,
}: InnerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChooseFile = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    const looksLikeVideo =
      file.type.startsWith('video/') || /\.(webm|mp4|mov)$/i.test(file.name);
    if (!looksLikeVideo || file.size <= 0) {
      setError('That file was not a usable video. Please record this shot again.');
      return;
    }

    setError(null);
    onClipReady({
      blob: file,
      durationSeconds: prompt.maxSeconds,
      ext: extFromFile(file),
      needsOptimization: true,
    });
  };

  return (
    <MobileShell tone="dark">
      <main className="relative flex min-h-dvh flex-col bg-[#0e0d0b] text-white">
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(184,201,168,0.24),transparent_36%),linear-gradient(160deg,#17140f,#2b241b_58%,#0e0d0b)]"
          aria-hidden
        />

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          capture={prompt.camera === 'rear' ? 'environment' : 'user'}
          className="sr-only"
          onChange={handleFileChange}
        />

        <div className="relative flex flex-1 flex-col">
          <div className="pt-[max(env(safe-area-inset-top),16px)]">
            <ProgressPips total={totalSteps} current={stepNum} doneCount={doneCount} />
          </div>

          <div className="px-4 pt-8">
            <PromptCard
              step={stepNum}
              totalSteps={totalSteps}
              title={prompt.title}
              tip={prompt.tip}
              label="Shot"
              optional={prompt.optional}
            />
          </div>

          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <button
              type="button"
              onClick={handleChooseFile}
              className="flex h-32 w-32 items-center justify-center rounded-full border border-white/15 bg-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md transition active:scale-95 disabled:opacity-50"
              aria-label="Open phone camera"
            >
              <Camera className="h-14 w-14 text-sage" />
            </button>
            <p className="mt-5 max-w-[280px] text-sm leading-6 text-white/70">
              Use your phone camera for the cleanest food shot. Record 3-5 seconds; it uploads while you continue.
            </p>
            {error ? (
              <div className="mt-5 rounded-2xl bg-red-500/90 px-4 py-2 text-sm">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col items-center gap-4 pb-[max(env(safe-area-inset-bottom),24px)]">
            <div className="flex items-center justify-center gap-10">
              <button
                type="button"
                onClick={onBack}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur disabled:opacity-40"
                aria-label="Previous"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={handleChooseFile}
                className="rounded-full bg-sage px-8 py-4 text-sm font-semibold text-matcha-deep shadow-[0_18px_50px_rgba(0,0,0,0.25)] disabled:opacity-50"
              >
                Record shot
              </button>

              {onSkip ? (
                <button
                  type="button"
                  onClick={onSkip}
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

function BrowserMediaRecorder({
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
