/**
 * Module-level store for the customer's session of recorded clips.
 *
 * Lives in memory only — survives across route navigations within a single tab,
 * doesn't survive a hard reload (and shouldn't, because the customer would have
 * to re-grant camera permission anyway).
 *
 * Browser-only. Importing on the server is a no-op.
 */

import { useEffect, useState } from 'react';
import type { UploadedClipRef } from '@/lib/humeoApi';

export type RecordedClip = {
  step: number;
  mediaType: 'video' | 'audio';
  blob: Blob;
  durationSeconds: number;
  ext: 'webm' | 'mp4' | 'mov';
  needsOptimization?: boolean;
};

export type ClipUploadState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'uploaded'; ref: UploadedClipRef }
  | { status: 'error'; message: string };

type Listener = () => void;

type Snapshot = {
  clipsByStep: Record<number, RecordedClip>;
  orderedClips: RecordedClip[];
  clipUploadsByStep: Record<number, ClipUploadState>;
  skippedSteps: Record<number, true>;
  socialHandle: string;
  tableId: string | null;
  slug: string | null;
  sessionId: string;
};

let clipsByStep: Record<number, RecordedClip> = {};
let clipUploadsByStep: Record<number, ClipUploadState> = {};
let clipUploadPromises: Record<number, Promise<UploadedClipRef>> = {};
let skippedSteps: Record<number, true> = {};
let socialHandle = '';
let tableId: string | null = null;
let slug: string | null = null;
let sessionId = newSessionId();
const listeners = new Set<Listener>();

function newSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function emit() {
  for (const l of listeners) l();
}

function buildSnapshot(): Snapshot {
  return {
    clipsByStep,
    orderedClips: Object.values(clipsByStep).sort((a, b) => a.step - b.step),
    clipUploadsByStep,
    skippedSteps,
    socialHandle,
    tableId,
    slug,
    sessionId,
  };
}

export const recordingStore = {
  setClip(clip: RecordedClip) {
    clipsByStep = { ...clipsByStep, [clip.step]: clip };
    const nextSkipped = { ...skippedSteps };
    delete nextSkipped[clip.step];
    skippedSteps = nextSkipped;
    emit();
  },
  startClipUpload(step: number, promise: Promise<UploadedClipRef>) {
    clipUploadPromises = { ...clipUploadPromises, [step]: promise };
    clipUploadsByStep = { ...clipUploadsByStep, [step]: { status: 'pending' } };
    emit();

    promise
      .then((ref) => {
        if (clipUploadPromises[step] !== promise) return;
        clipUploadsByStep = { ...clipUploadsByStep, [step]: { status: 'uploaded', ref } };
        emit();
      })
      .catch((err) => {
        if (clipUploadPromises[step] !== promise) return;
        clipUploadsByStep = {
          ...clipUploadsByStep,
          [step]: {
            status: 'error',
            message: err instanceof Error ? err.message : 'Clip upload failed',
          },
        };
        emit();
      });
  },
  getClipUploadPromise(step: number) {
    return clipUploadPromises[step] ?? null;
  },
  getClipUploadState(step: number): ClipUploadState {
    return clipUploadsByStep[step] ?? { status: 'idle' };
  },
  removeClip(step: number) {
    const next = { ...clipsByStep };
    delete next[step];
    clipsByStep = next;
    const nextUploads = { ...clipUploadsByStep };
    delete nextUploads[step];
    clipUploadsByStep = nextUploads;
    const nextPromises = { ...clipUploadPromises };
    delete nextPromises[step];
    clipUploadPromises = nextPromises;
    emit();
  },
  skipStep(step: number) {
    const nextClips = { ...clipsByStep };
    delete nextClips[step];
    clipsByStep = nextClips;
    const nextUploads = { ...clipUploadsByStep };
    delete nextUploads[step];
    clipUploadsByStep = nextUploads;
    const nextPromises = { ...clipUploadPromises };
    delete nextPromises[step];
    clipUploadPromises = nextPromises;
    skippedSteps = { ...skippedSteps, [step]: true };
    emit();
  },
  setMeta(meta: { slug?: string; tableId?: string | null; socialHandle?: string }) {
    if (meta.slug !== undefined) slug = meta.slug;
    if (meta.tableId !== undefined) tableId = meta.tableId;
    if (meta.socialHandle !== undefined) socialHandle = meta.socialHandle;
    emit();
  },
  reset() {
    clipsByStep = {};
    clipUploadsByStep = {};
    clipUploadPromises = {};
    skippedSteps = {};
    socialHandle = '';
    tableId = null;
    slug = null;
    sessionId = newSessionId();
    emit();
  },
  snapshot(): Snapshot {
    return buildSnapshot();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useRecordingStore(): Snapshot {
  const [snap, setSnap] = useState<Snapshot>(() => buildSnapshot());
  useEffect(() => {
    const unsubscribe = recordingStore.subscribe(() => setSnap(buildSnapshot()));
    return () => {
      unsubscribe();
    };
  }, []);
  return snap;
}
