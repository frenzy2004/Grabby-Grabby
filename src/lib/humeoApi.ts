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
