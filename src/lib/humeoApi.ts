/**
 * Client-side API wrapper for the public review endpoints.
 *
 * Routes live in this app at:
 *   GET  /api/public/reviews/campaign/[slug]
 *   POST /api/public/reviews/submit
 *   GET  /api/public/reviews/submission/[submissionId]?slug=...
 *
 * Shapes mirror reference/src/app/api/public/reviews/* exactly. The day Humeo
 * deploys these routes publicly, set NEXT_PUBLIC_HUMEO_API_URL=https://humeo.app
 * to redirect all traffic at the deployed backend with no code change.
 *
 * Default base URL: same-origin (empty string → relative URLs), so this app
 * is fully self-contained out of the box.
 */

import type {
  PublicReviewCampaign,
  PublicSubmitResult,
} from '@/lib/reviews/types';
import { POLLING_SUBMISSION_STATUSES } from '@/lib/reviews/types';

const BASE_URL = process.env.NEXT_PUBLIC_HUMEO_API_URL ?? '';

function endpoint(path: string) {
  return `${BASE_URL.replace(/\/$/, '')}${path}`;
}

export async function getCampaign(slug: string): Promise<PublicReviewCampaign> {
  const res = await fetch(
    endpoint(`/api/public/reviews/campaign/${encodeURIComponent(slug)}`),
    { cache: 'no-store' },
  );
  if (!res.ok) {
    throw new Error(`Failed to load campaign (${res.status})`);
  }
  const body = (await res.json()) as { campaign: PublicReviewCampaign };
  return body.campaign;
}

export type SubmitInput = {
  slug: string;
  consentAccepted: boolean;
  socialHandle?: string;
  deviceKey: string;
  tableId?: string | null;
  durationSeconds: number;
  video: Blob;
  videoFileName?: string;
};

export type SubmitClip = {
  blob: Blob;
  ext: 'webm' | 'mp4' | 'mov';
};

export type UploadedClipRef = {
  sessionId: string;
  step: number;
  takeId: number;
  mediaType: 'video' | 'audio';
  ext: 'webm' | 'mp4' | 'mov';
  size: number;
};

export type SubmitClipsInput = Omit<
  SubmitInput,
  'durationSeconds' | 'video' | 'videoFileName'
> & {
  videoClips: SubmitClip[];
  audioClips: SubmitClip[];
};

export type UploadClipInput = {
  sessionId: string;
  step: number;
  takeId: number;
  mediaType: 'video' | 'audio';
  blob: Blob;
  ext: 'webm' | 'mp4' | 'mov';
};

export type SubmitSessionInput = Omit<
  SubmitInput,
  'durationSeconds' | 'video' | 'videoFileName'
> & {
  sessionId: string;
};

export async function submit(input: SubmitInput): Promise<PublicSubmitResult> {
  const form = new FormData();
  form.append('slug', input.slug);
  form.append('consentAccepted', input.consentAccepted ? 'true' : 'false');
  form.append('socialHandle', input.socialHandle ?? '');
  form.append('deviceKey', input.deviceKey);
  form.append('durationSeconds', String(Math.round(input.durationSeconds)));
  if (input.tableId) form.append('tableId', input.tableId);
  const filename = input.videoFileName ?? 'matcha-moments.webm';
  form.append('video', input.video, filename);

  const res = await fetch(endpoint('/api/public/reviews/submit'), {
    method: 'POST',
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Submit failed (${res.status})`);
  }
  return body as PublicSubmitResult;
}

export async function submitClips(input: SubmitClipsInput): Promise<PublicSubmitResult> {
  const form = new FormData();
  form.append('slug', input.slug);
  form.append('consentAccepted', input.consentAccepted ? 'true' : 'false');
  form.append('socialHandle', input.socialHandle ?? '');
  form.append('deviceKey', input.deviceKey);
  if (input.tableId) form.append('tableId', input.tableId);

  form.append('videoClipCount', String(input.videoClips.length));
  input.videoClips.forEach((clip, index) => {
    form.append(`videoClip${index}`, clip.blob, `video-${index}.${clip.ext}`);
    form.append(`videoClip${index}Ext`, clip.ext);
  });

  form.append('audioClipCount', String(input.audioClips.length));
  input.audioClips.forEach((clip, index) => {
    form.append(`audioClip${index}`, clip.blob, `audio-${index}.${clip.ext}`);
    form.append(`audioClip${index}Ext`, clip.ext);
  });

  const res = await fetch(endpoint('/api/public/reviews/submit-clips'), {
    method: 'POST',
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Submit failed (${res.status})`);
  }
  return body as PublicSubmitResult;
}

export async function uploadClip(input: UploadClipInput): Promise<UploadedClipRef> {
  const form = new FormData();
  form.append('sessionId', input.sessionId);
  form.append('step', String(input.step));
  form.append('takeId', String(input.takeId));
  form.append('mediaType', input.mediaType);
  form.append('ext', input.ext);
  form.append('clip', input.blob, `step-${input.step}.${input.ext}`);

  const res = await fetch(endpoint('/api/public/reviews/upload-clip'), {
    method: 'POST',
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Clip upload failed (${res.status})`);
  }
  return (body as { clip: UploadedClipRef }).clip;
}

export async function submitSession(input: SubmitSessionInput): Promise<PublicSubmitResult> {
  const form = new FormData();
  form.append('slug', input.slug);
  form.append('consentAccepted', input.consentAccepted ? 'true' : 'false');
  form.append('socialHandle', input.socialHandle ?? '');
  form.append('deviceKey', input.deviceKey);
  form.append('sessionId', input.sessionId);
  if (input.tableId) form.append('tableId', input.tableId);

  const res = await fetch(endpoint('/api/public/reviews/submit-session'), {
    method: 'POST',
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Submit failed (${res.status})`);
  }
  return body as PublicSubmitResult;
}

export async function getSubmission(
  submissionId: string,
  slug: string,
): Promise<PublicSubmitResult> {
  const res = await fetch(
    endpoint(
      `/api/public/reviews/submission/${encodeURIComponent(submissionId)}?slug=${encodeURIComponent(slug)}`,
    ),
    { cache: 'no-store' },
  );
  if (!res.ok) {
    throw new Error(`Failed to load submission (${res.status})`);
  }
  const body = (await res.json()) as { submission: PublicSubmitResult };
  return body.submission;
}

export { POLLING_SUBMISSION_STATUSES };
