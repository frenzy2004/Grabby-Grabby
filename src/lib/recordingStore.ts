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

export type RecordedClip = {
  step: number;
  blob: Blob;
  durationSeconds: number;
  ext: 'webm' | 'mp4' | 'mov';
};

type Listener = () => void;

type Snapshot = {
  clipsByStep: Record<number, RecordedClip>;
  orderedClips: RecordedClip[];
  socialHandle: string;
  tableId: string | null;
  slug: string | null;
};

let clipsByStep: Record<number, RecordedClip> = {};
let socialHandle = '';
let tableId: string | null = null;
let slug: string | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function buildSnapshot(): Snapshot {
  return {
    clipsByStep,
    orderedClips: Object.values(clipsByStep).sort((a, b) => a.step - b.step),
    socialHandle,
    tableId,
    slug,
  };
}

export const recordingStore = {
  setClip(clip: RecordedClip) {
    clipsByStep = { ...clipsByStep, [clip.step]: clip };
    emit();
  },
  removeClip(step: number) {
    const next = { ...clipsByStep };
    delete next[step];
    clipsByStep = next;
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
    socialHandle = '';
    tableId = null;
    slug = null;
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
