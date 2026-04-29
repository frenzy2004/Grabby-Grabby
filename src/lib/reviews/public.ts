/**
 * Display string helpers — copied verbatim from reference/src/lib/reviews/public.ts
 * (Humeo's source of truth). Keep in sync if Humeo's copy diverges.
 */

import type { PublicReviewCampaign } from '@/lib/reviews/types';

export type PublicReviewSubmitReward = {
  type?: string;
  value?: string;
} | null | undefined;

export type PublicRewardDisplay = {
  title: string;
  value: string;
  detail: string | null;
  actionHref: string | null;
  actionLabel: string | null;
};

const FAILURE_REASON_COPY: Record<string, string> = {
  daily_limit_reached: 'This device has already claimed a reward for this campaign today.',
  missing_consent: 'Accept the rights-to-use consent before submitting.',
  empty_transcript: 'Speak clearly so the review can be transcribed.',
  too_short: 'Make the review long enough before submitting again.',
  too_long: 'Keep the review shorter and more focused.',
  too_few_words: 'Say a bit more so the review has enough spoken detail.',
  restaurant_not_mentioned: 'Mention the restaurant clearly in the review.',
  blocked_term_detected: 'Avoid profanity or abusive language.',
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export async function getVideoDuration(file: File | Blob) {
  return await new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve(Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0);
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}

export function buildPublicReviewIntro(campaign: PublicReviewCampaign) {
  return `Share a short video review for ${campaign.restaurantName}.`;
}

export function buildPublicReviewChecklist(campaign: PublicReviewCampaign) {
  const checklist = [
    `Keep it between ${campaign.rulesConfig.minDurationSeconds} and ${campaign.rulesConfig.maxDurationSeconds} seconds.`,
    `Speak clearly and say at least ${campaign.rulesConfig.minWordCount} words.`,
  ];

  if (campaign.rulesConfig.requireRestaurantMention) {
    checklist.push(`Mention ${campaign.restaurantName} by name in the review.`);
  }

  checklist.push('Choose a quiet, well-lit spot and keep the camera steady.');

  return checklist;
}

export function buildReviewFailureGuidance(reasons: string[] | undefined) {
  const seen = new Set<string>();
  const guidance: string[] = [];

  for (const reason of reasons ?? []) {
    const copy = FAILURE_REASON_COPY[reason];
    if (!copy || seen.has(copy)) continue;
    seen.add(copy);
    guidance.push(copy);
  }

  return guidance;
}

export function buildRewardDisplay(reward: PublicReviewSubmitReward): PublicRewardDisplay {
  const type = reward?.type ?? '';
  const value = (reward?.value ?? '').trim();

  if (type === 'external_redirect') {
    const actionHref = isHttpUrl(value) ? value : null;
    return {
      title: 'Reward unlocked',
      value: actionHref ? 'Open your reward link' : value || 'Reward link ready',
      detail: actionHref ? 'Use the link below to claim the offer.' : null,
      actionHref,
      actionLabel: actionHref ? 'Open reward' : null,
    };
  }

  if (type === 'message_only') {
    return {
      title: 'Reward unlocked',
      value: value || 'Reward issued',
      detail: 'Show this message to the team if redemption instructions are needed.',
      actionHref: null,
      actionLabel: null,
    };
  }

  return {
    title: 'Coupon unlocked',
    value: value || 'Reward issued',
    detail: 'Keep this code handy for redemption.',
    actionHref: null,
    actionLabel: null,
  };
}
