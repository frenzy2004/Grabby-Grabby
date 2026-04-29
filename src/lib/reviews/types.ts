/**
 * Review types — copied (and extended) from reference/src/lib/reviews/types.ts
 * (Humeo's source of truth). Stays aligned with whatever
 * ${NEXT_PUBLIC_HUMEO_API_URL}/api/public/reviews/* returns.
 *
 * Extensions for matcha-moments (cafe pilot):
 *   - CampaignMode: 'single_take' | 'guided_clips'
 *   - ClipPrompt: per-clip config (camera direction, hard-cap)
 *   - mode / prompts / theme fields on PublicReviewCampaign
 *
 * If Humeo's review_campaigns table doesn't yet have these columns,
 * humeoApi.getCampaign() falls back to a hardcoded prompts list.
 * See src/lib/humeoApi.ts for that fallback.
 */

import { z } from 'zod';

export const REVIEW_CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;
export const REVIEW_REWARD_TYPES = ['static_code', 'message_only', 'external_redirect'] as const;
export const REVIEW_SUBMISSION_STATUSES = [
  'opened',
  'uploading',
  'processing_interview',
  'evaluating_rules',
  'pass',
  'fail_and_retry',
  'reward_issued',
  'processing_failed',
] as const;

export type ReviewCampaignStatus = (typeof REVIEW_CAMPAIGN_STATUSES)[number];
export type ReviewRewardType = (typeof REVIEW_REWARD_TYPES)[number];
export type ReviewSubmissionStatus = (typeof REVIEW_SUBMISSION_STATUSES)[number];

export const ReviewRulesConfigSchema = z.object({
  minDurationSeconds: z.number().int().min(0).max(600).default(8),
  maxDurationSeconds: z.number().int().min(1).max(1200).default(90),
  minWordCount: z.number().int().min(1).max(500).default(8),
  requireRestaurantMention: z.boolean().default(false),
  blockedTerms: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
});

export const ReviewCampaignSettingsSchema = z.object({
  dailyRewardLimitPerDevice: z.number().int().min(1).max(10).default(1),
});

export type ReviewRulesConfig = z.infer<typeof ReviewRulesConfigSchema>;
export type ReviewCampaignSettings = z.infer<typeof ReviewCampaignSettingsSchema>;

// === matcha-moments extensions ===

export const CAMPAIGN_MODES = ['single_take', 'guided_clips'] as const;
export type CampaignMode = (typeof CAMPAIGN_MODES)[number];

export const CAMPAIGN_THEMES = ['default', 'cafe-cream'] as const;
export type CampaignTheme = (typeof CAMPAIGN_THEMES)[number];

export const ClipPromptSchema = z.object({
  step: z.number().int().min(1).max(20),
  title: z.string().trim().min(1).max(160),
  tip: z.string().trim().max(280).default(''),
  camera: z.enum(['front', 'rear']).default('front'),
  maxSeconds: z.number().int().min(1).max(60).default(10),
});
export type ClipPrompt = z.infer<typeof ClipPromptSchema>;

// === Public API contract ===

export type PublicReviewCampaign = {
  id: string;
  slug: string;
  restaurantName: string;
  status: ReviewCampaignStatus;
  rulesConfig: ReviewRulesConfig;
  settings: ReviewCampaignSettings;

  // matcha-moments extensions; safe defaults if Humeo BE doesn't return them yet.
  mode: CampaignMode;
  prompts: ClipPrompt[];
  rewardType: ReviewRewardType;
  rewardValue: string | null;
  theme: CampaignTheme;
  accentColor?: string;
};

export type PublicSubmitResult = {
  submissionId: string;
  interviewId?: string;
  status: ReviewSubmissionStatus;
  decision: 'pass' | 'fail_and_retry' | null;
  feedback: string;
  reward?: { type?: ReviewRewardType; value?: string } | null;
  reasons?: string[];
  updatedAt: string;
};

export const POLLING_SUBMISSION_STATUSES = new Set<ReviewSubmissionStatus>([
  'opened',
  'uploading',
  'processing_interview',
  'evaluating_rules',
  'fail_and_retry',
]);

export function normalizeReviewRulesConfig(value: unknown): ReviewRulesConfig {
  return ReviewRulesConfigSchema.parse(value ?? {});
}

export function normalizeReviewCampaignSettings(value: unknown): ReviewCampaignSettings {
  return ReviewCampaignSettingsSchema.parse(value ?? {});
}
