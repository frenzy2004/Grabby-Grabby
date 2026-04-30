'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClipPrompt } from '@/lib/reviews/types';

export type RecordingState =
  | 'idle'
  | 'requesting_permission'
  | 'ready'
  | 'recording'
  | 'finalizing';

const recorderMimePriority = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

const audioRecorderMimePriority = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

function pickRecorderMime(mediaType: 'video' | 'audio') {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const mimes = mediaType === 'audio' ? audioRecorderMimePriority : recorderMimePriority;
  for (const mime of mimes) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

function extFromMime(mime: string | undefined): 'webm' | 'mp4' | 'mov' {
  if (!mime) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('quicktime')) return 'mov';
  return 'webm';
}

export type UseGuidedRecordingOptions = {
  prompt: ClipPrompt;
  /** Called once a recording finishes (either user-stopped or auto-stopped on hard cap). */
  onClipReady: (clip: { blob: Blob; durationSeconds: number; ext: 'webm' | 'mp4' | 'mov' }) => void;
};

export function useGuidedRecording({ prompt, onClipReady }: UseGuidedRecordingOptions) {
  const mediaType = prompt.mediaType ?? 'video';
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);

  const stopTicking = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const stopAutoStop = useCallback(() => {
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const requestPermissionAndPreview = useCallback(async () => {
    setError(null);
    setState('requesting_permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        mediaType === 'audio'
          ? { audio: true }
          : {
              video: {
                facingMode: prompt.camera === 'rear' ? { ideal: 'environment' } : { ideal: 'user' },
                width: { ideal: 1080 },
                height: { ideal: 1920 },
              },
              audio: true,
            },
      );
      streamRef.current = stream;
      if (mediaType === 'video' && videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => undefined);
      }
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera access was blocked.');
      setState('idle');
    }
  }, [mediaType, prompt.camera]);

  // Re-acquire the stream when the prompt's camera direction changes.
  useEffect(() => {
    void requestPermissionAndPreview();
    return () => {
      stopTicking();
      stopAutoStop();
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.step, prompt.camera, mediaType]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    const mime = pickRecorderMime(mediaType);
    let recorder: MediaRecorder;
    try {
      recorder = mime
        ? new MediaRecorder(streamRef.current, { mimeType: mime })
        : new MediaRecorder(streamRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording is not supported on this device.');
      return;
    }

    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      stopTicking();
      stopAutoStop();
      const elapsedSeconds = Math.max(
        0,
        Math.round((Date.now() - startedAtRef.current) / 1000),
      );
      const blobMime = mime ?? 'video/webm';
      const blob = new Blob(chunksRef.current, { type: blobMime });
      chunksRef.current = [];
      setState('finalizing');
      onClipReady({
        blob,
        durationSeconds: elapsedSeconds,
        ext: extFromMime(mime),
      });
      // Brief finalize state for UX, then return to ready (parent may unmount).
      window.setTimeout(() => setState('ready'), 200);
    };

    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setState('recording');
    recorder.start();

    tickRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 100);

    autoStopRef.current = window.setTimeout(() => {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
    }, prompt.maxSeconds * 1000);
  }, [mediaType, onClipReady, prompt.maxSeconds, stopAutoStop, stopTicking]);

  const stopRecording = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const liveProgress = Math.min(1, elapsedMs / (prompt.maxSeconds * 1000));

  return {
    state,
    elapsedMs,
    liveProgress,
    error,
    videoRef,
    startRecording,
    stopRecording,
    requestPermissionAndPreview,
  };
}
