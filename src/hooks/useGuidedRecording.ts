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
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
  'video/mp4',
];

const audioRecorderMimePriority = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

const RECORDER_TIMESLICE_MS = 500;
const MIN_VIDEO_BLOB_BYTES = 16 * 1024;
const MIN_AUDIO_BLOB_BYTES = 4 * 1024;
const VIDEO_BITS_PER_SECOND = 1_400_000;
const AUDIO_BITS_PER_SECOND = 64_000;

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

function videoConstraints(camera: 'front' | 'rear', exactFacingMode: boolean): MediaTrackConstraints {
  return {
    facingMode:
      camera === 'rear'
        ? exactFacingMode
          ? { exact: 'environment' }
          : { ideal: 'environment' }
        : exactFacingMode
          ? { exact: 'user' }
          : { ideal: 'user' },
    width: { ideal: 720, max: 1280 },
    height: { ideal: 1280, max: 1920 },
    frameRate: { ideal: 24, max: 30 },
  };
}

async function canReadRecordedMedia(blob: Blob, mediaType: 'video' | 'audio') {
  return await new Promise<boolean>((resolve) => {
    const url = URL.createObjectURL(blob);
    const media = document.createElement(mediaType);
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(ok);
    };

    const timer = window.setTimeout(() => finish(false), 4000);
    media.preload = 'metadata';
    media.muted = true;
    media.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish(true);
    };
    media.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };
    media.src = url;
  });
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

  const stopActiveRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    setState('finalizing');
    stopTicking();
    stopAutoStop();

    try {
      recorder.requestData();
    } catch {
      /* ignore */
    }

    window.setTimeout(() => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* ignore */
      }
    }, 100);
  }, [stopAutoStop, stopTicking]);

  const requestPermissionAndPreview = useCallback(async () => {
    setError(null);
    setState('requesting_permission');
    try {
      let stream: MediaStream;
      if (mediaType === 'audio') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints(prompt.camera, true),
            audio: true,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints(prompt.camera, false),
            audio: true,
          });
        }
      }
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

  // Re-acquire the stream only when the capture source changes. Adjacent food
  // shots should keep the same camera warm instead of tearing it down.
  useEffect(() => {
    void requestPermissionAndPreview();
    return () => {
      stopTicking();
      stopAutoStop();
      stopActiveRecorder();
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.camera, mediaType]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    const mime = pickRecorderMime(mediaType);
    let recorder: MediaRecorder;
    try {
      const options: MediaRecorderOptions = {};
      if (mime) options.mimeType = mime;
      if (mediaType === 'video') {
        options.videoBitsPerSecond = VIDEO_BITS_PER_SECOND;
        options.audioBitsPerSecond = AUDIO_BITS_PER_SECOND;
      } else {
        options.audioBitsPerSecond = AUDIO_BITS_PER_SECOND;
      }
      recorder = new MediaRecorder(streamRef.current, options);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording is not supported on this device.');
      return;
    }

    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onerror = () => {
      setError('Recording failed on this device. Please try this clip again.');
      setState('ready');
    };

    recorder.onstop = async () => {
      stopTicking();
      stopAutoStop();
      const elapsedSeconds = Math.max(
        0,
        Math.round((Date.now() - startedAtRef.current) / 1000),
      );
      const blobMime = mime ?? 'video/webm';
      const chunks = chunksRef.current.filter((chunk) => {
        if (chunk instanceof Blob) return chunk.size > 0;
        return true;
      });
      chunksRef.current = [];
      setState('finalizing');

      const blob = new Blob(chunks, { type: blobMime });
      const minBytes = mediaType === 'audio' ? MIN_AUDIO_BLOB_BYTES : MIN_VIDEO_BLOB_BYTES;
      const readable = blob.size >= minBytes && (await canReadRecordedMedia(blob, mediaType));

      if (!readable) {
        setError('That clip did not finish saving cleanly. Please record this prompt again.');
        setState('ready');
        return;
      }

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
    recorder.start(RECORDER_TIMESLICE_MS);

    tickRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 100);

    autoStopRef.current = window.setTimeout(() => {
      stopActiveRecorder();
    }, prompt.maxSeconds * 1000);
  }, [mediaType, onClipReady, prompt.maxSeconds, stopActiveRecorder, stopAutoStop, stopTicking]);

  const stopRecording = useCallback(() => {
    stopActiveRecorder();
  }, [stopActiveRecorder]);

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
