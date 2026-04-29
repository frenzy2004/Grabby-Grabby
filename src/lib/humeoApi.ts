/**
 * Humeo API client.
 *
 * Calls Humeo's deployed public review APIs at ${NEXT_PUBLIC_HUMEO_API_URL}/api/public/reviews/*.
 * The endpoints are defined in Humeo's repo:
 *   - reference/src/app/api/public/reviews/campaign/[slug]/route.ts
 *   - reference/src/app/api/public/reviews/submit/route.ts
 *   - reference/src/app/api/public/reviews/submission/[submissionId]/route.ts
 *
 * If Humeo's review_campaigns row doesn't yet have mode/prompts/theme columns,
 * getCampaign() augments the response with a hardcoded fallback for the cafe pilot
 * — flagged with TODO comments so we can drop them once Humeo's BE catches up.
 */

import type {
  ClipPrompt,
  PublicReviewCampaign,
  PublicSubmitResult,
} from '@/lib/reviews/types';
import { POLLING_SUBMISSION_STATUSES } from '@/lib/reviews/types';

const FALLBACK_BASE_URL =
  process.env.NEXT_PUBLIC_HUMEO_API_URL ?? 'https://humeo.app';

function endpoint(path: string) {
  return `${FALLBACK_BASE_URL.replace(/\/$/, '')}${path}`;
}

// TODO: drop when Humeo's review_campaigns has prompts column populated.
const DEFAULT_CAFE_PROMPTS: ClipPrompt[] = [
  {
    step: 1,
    title: 'Show us the dish.',
    tip: 'Slow pan around your plate · 5–8 seconds · keep it steady',
    camera: 'rear',
    maxSeconds: 10,
  },
  {
    step: 2,
    title: 'Tell us what you ordered.',
    tip: 'Just the dish name · keep it short and natural',
    camera: 'front',
    maxSeconds: 8,
  },
  {
    step: 3,
    title: 'Take a bite — show us your reaction.',
    tip: 'That first delicious moment · be expressive · ~5 sec',
    camera: 'front',
    maxSeconds: 8,
  },
  {
    step: 4,
    title: 'What did you love about it?',
    tip: 'The flavor? The plating? The vibe? · 8–10 sec',
    camera: 'front',
    maxSeconds: 12,
  },
  {
    step: 5,
    title: 'Would you bring a friend back here?',
    tip: 'Tell the camera what makes this place worth a return',
    camera: 'front',
    maxSeconds: 12,
  },
];

/**
 * GET /api/public/reviews/campaign/[slug]
 */
export async function getCampaign(slug: string): Promise<PublicReviewCampaign> {
  const res = await fetch(
    endpoint(`/api/public/reviews/campaign/${encodeURIComponent(slug)}`),
    { cache: 'no-store' },
  );

  if (!res.ok) {
    throw new Error(`Failed to load campaign (${res.status})`);
  }

  const body = (await res.json()) as { campaign?: Partial<PublicReviewCampaign> } | Partial<PublicReviewCampaign>;
  const raw = ('campaign' in body && body.campaign ? body.campaign : body) as Partial<PublicReviewCampaign>;

  return augmentCampaign(slug, raw);
}

/**
 * Fills in mode/prompts/theme/rewardType/rewardValue from defaults when Humeo's
 * BE doesn't yet return them. Drop this once schema migration ships.
 */
function augmentCampaign(slug: string, raw: Partial<PublicReviewCampaign>): PublicReviewCampaign {
  return {
    id: raw.id ?? `unknown-${slug}`,
    slug: raw.slug ?? slug,
    restaurantName: raw.restaurantName ?? 'Sage & Stone Café',
    status: raw.status ?? 'active',
    rulesConfig: raw.rulesConfig ?? {
      minDurationSeconds: 8,
      maxDurationSeconds: 90,
      minWordCount: 8,
      requireRestaurantMention: false,
      blockedTerms: [],
    },
    settings: raw.settings ?? { dailyRewardLimitPerDevice: 1 },
    mode: raw.mode ?? 'guided_clips',
    prompts: raw.prompts && raw.prompts.length > 0 ? raw.prompts : DEFAULT_CAFE_PROMPTS,
    rewardType: raw.rewardType ?? 'static_code',
    rewardValue: raw.rewardValue ?? null,
    theme: raw.theme ?? 'cafe-cream',
    accentColor: raw.accentColor,
  };
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

/**
 * POST /api/public/reviews/submit
 *
 * Sends a SINGLE concatenated video file to Humeo's existing endpoint. The
 * 5-clip stitching happens client-side via src/lib/ffmpeg.ts before this is called.
 * That keeps Humeo's backend untouched for v1.
 */
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
    throw new Error((body as { error?: string }).error || 'Failed to submit review');
  }
  return body as PublicSubmitResult;
}

/**
 * GET /api/public/reviews/submission/[submissionId]?slug=…
 */
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

  const body = (await res.json()) as { submission?: PublicSubmitResult } | PublicSubmitResult;
  const submission = ('submission' in body && body.submission ? body.submission : body) as PublicSubmitResult;
  return submission;
}

export { POLLING_SUBMISSION_STATUSES };
