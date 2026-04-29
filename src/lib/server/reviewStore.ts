import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { stat, writeFile } from 'fs/promises';
import path from 'path';
import type {
  PublicReviewCampaign,
  PublicSubmitResult,
  ReviewRewardType,
  ReviewSubmissionStatus,
} from '@/lib/reviews/types';

/**
 * Local review store for the office prototype.
 *
 * This intentionally mirrors the public review API shape from Humeo, but keeps
 * everything on this machine:
 *   .local-review-data/uploads/         saved stitched videos
 *   .local-review-data/submissions.json saved submission metadata
 */

export type LocalSubmission = {
  submissionId: string;
  interviewId: string;
  campaignSlug: string;
  status: ReviewSubmissionStatus;
  decision: 'pass' | 'fail_and_retry' | null;
  feedback: string;
  reward: { type: ReviewRewardType; value: string } | null;
  reasons: string[];
  consentAccepted: boolean;
  socialHandle: string | null;
  deviceKey: string | null;
  tableId: string | null;
  durationSeconds: number;
  videoSize: number;
  videoMime: string;
  videoFileName: string;
  storagePath: string;
  createdAt: number;
  updatedAt: string;
};

export type AdminReviewSubmission = LocalSubmission & {
  restaurantName: string;
  previewUrl: string;
  createdAtIso: string;
};

type StoreState = {
  campaigns: Map<string, PublicReviewCampaign>;
  submissions: Map<string, LocalSubmission>;
};

const LOCAL_DATA_DIR = path.join(process.cwd(), '.local-review-data');
const UPLOADS_DIR = path.join(LOCAL_DATA_DIR, 'uploads');
const SUBMISSIONS_FILE = path.join(LOCAL_DATA_DIR, 'submissions.json');

const SAGE_AND_STONE: PublicReviewCampaign = {
  id: 'sage-and-stone-cafe',
  slug: 'sageandstone',
  restaurantName: 'Sage & Stone Cafe',
  status: 'active',
  rulesConfig: {
    minDurationSeconds: 8,
    maxDurationSeconds: 90,
    minWordCount: 8,
    requireRestaurantMention: false,
    blockedTerms: [],
  },
  settings: { dailyRewardLimitPerDevice: 1 },
  mode: 'guided_clips',
  prompts: [
    {
      step: 1,
      title: 'Show us the dish.',
      tip: 'Slow pan around your plate - 5 to 8 seconds - keep it steady',
      camera: 'rear',
      maxSeconds: 10,
    },
    {
      step: 2,
      title: 'Tell us what you ordered.',
      tip: 'Just the dish name - keep it short and natural',
      camera: 'front',
      maxSeconds: 8,
    },
    {
      step: 3,
      title: 'Take a bite and show your reaction.',
      tip: 'That first delicious moment - be expressive - about 5 seconds',
      camera: 'front',
      maxSeconds: 8,
    },
    {
      step: 4,
      title: 'What did you love about it?',
      tip: 'The flavor? The plating? The vibe? 8 to 10 seconds is perfect',
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
  ],
  rewardType: 'static_code',
  rewardValue: null,
  theme: 'cafe-cream',
};

function ensureLocalDirs() {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

function readPersistedSubmissions() {
  if (!existsSync(SUBMISSIONS_FILE)) return [];

  try {
    const raw = readFileSync(SUBMISSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocalSubmission);
  } catch {
    return [];
  }
}

function isLocalSubmission(value: unknown): value is LocalSubmission {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<LocalSubmission>;
  return (
    typeof maybe.submissionId === 'string' &&
    typeof maybe.interviewId === 'string' &&
    typeof maybe.campaignSlug === 'string' &&
    typeof maybe.status === 'string' &&
    typeof maybe.storagePath === 'string' &&
    typeof maybe.createdAt === 'number'
  );
}

function createState(): StoreState {
  const campaigns = new Map<string, PublicReviewCampaign>();
  campaigns.set(SAGE_AND_STONE.slug, SAGE_AND_STONE);

  const submissions = new Map<string, LocalSubmission>();
  for (const submission of readPersistedSubmissions()) {
    submissions.set(submission.submissionId, submission);
  }

  return { campaigns, submissions };
}

const globalForStore = globalThis as unknown as {
  __matchaReviewStore?: StoreState;
};

const state = globalForStore.__matchaReviewStore ?? createState();
state.campaigns.set(SAGE_AND_STONE.slug, SAGE_AND_STONE);
for (const [id, submission] of state.submissions.entries()) {
  if (!isLocalSubmission(submission)) {
    state.submissions.delete(id);
  }
}
if (process.env.NODE_ENV !== 'production') {
  globalForStore.__matchaReviewStore = state;
}

function persistSubmissions() {
  ensureLocalDirs();
  const submissions = [...state.submissions.values()].sort((a, b) => a.createdAt - b.createdAt);
  writeFileSync(SUBMISSIONS_FILE, `${JSON.stringify(submissions, null, 2)}\n`, 'utf8');
}

export function getCampaignBySlug(slug: string): PublicReviewCampaign | null {
  return state.campaigns.get(slug) ?? null;
}

function newId(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function rewardCode() {
  return `MATCHA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function resolveVideoExt(fileName: string, mime: string) {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mime.toLowerCase();
  if (lowerName.endsWith('.mp4') || lowerMime.includes('mp4')) return 'mp4';
  if (lowerName.endsWith('.mov') || lowerMime.includes('quicktime')) return 'mov';
  if (lowerName.endsWith('.webm') || lowerMime.includes('webm')) return 'webm';
  return 'webm';
}

function buildPreviewUrl(submissionId: string) {
  return `/api/public/reviews/video/${encodeURIComponent(submissionId)}`;
}

function storagePathFor(submissionId: string, ext: string) {
  return `uploads/${submissionId}.${ext}`;
}

function absoluteStoragePath(storagePath: string) {
  const absolute = path.resolve(LOCAL_DATA_DIR, storagePath);
  const localRoot = path.resolve(LOCAL_DATA_DIR);
  if (absolute !== localRoot && !absolute.startsWith(`${localRoot}${path.sep}`)) {
    return null;
  }
  return absolute;
}

function advanceSubmission(submission: LocalSubmission) {
  if (
    submission.status === 'reward_issued' ||
    submission.status === 'processing_failed' ||
    submission.status === 'fail_and_retry'
  ) {
    return false;
  }

  const campaign = getCampaignBySlug(submission.campaignSlug);
  if (!campaign) return false;

  const elapsed = Date.now() - submission.createdAt;
  let changed = false;

  if (submission.status === 'opened' && elapsed >= 1000) {
    submission.status = 'processing_interview';
    changed = true;
  }

  if (submission.status === 'processing_interview' && elapsed >= 2500) {
    submission.status = 'evaluating_rules';
    changed = true;
  }

  if (submission.status === 'evaluating_rules' && elapsed >= 4000) {
    submission.status = 'reward_issued';
    submission.decision = 'pass';
    submission.feedback = 'Office prototype approved. Show the matcha code to staff.';
    submission.reward = {
      type: campaign.rewardType,
      value: campaign.rewardValue ?? rewardCode(),
    };
    changed = true;
  }

  if (changed) {
    submission.updatedAt = new Date().toISOString();
  }

  return changed;
}

export type CreateSubmissionInput = {
  slug: string;
  consentAccepted: boolean;
  socialHandle?: string | null;
  deviceKey?: string | null;
  tableId?: string | null;
  durationSeconds: number;
  video: File;
};

export async function createSubmission(input: CreateSubmissionInput):
  Promise<
    | { ok: true; submission: LocalSubmission }
    | { ok: false; status: number; error: string }
  > {
  if (!input.slug) {
    return { ok: false, status: 400, error: 'Missing campaign slug' };
  }
  if (!input.consentAccepted) {
    return { ok: false, status: 400, error: 'Consent is required' };
  }
  if (!(input.video instanceof File) || input.video.size <= 0) {
    return { ok: false, status: 400, error: 'A video file is required' };
  }
  if (!input.video.type.startsWith('video/')) {
    return { ok: false, status: 400, error: 'Only video uploads are supported' };
  }

  const campaign = getCampaignBySlug(input.slug);
  if (!campaign) {
    return { ok: false, status: 404, error: 'Campaign not found' };
  }

  const submissionId = newId('sub');
  const interviewId = newId('iv');
  const videoMime = input.video.type || 'video/webm';
  const videoFileName = input.video.name || 'matcha-moments.webm';
  const ext = resolveVideoExt(videoFileName, videoMime);
  const storagePath = storagePathFor(submissionId, ext);
  const absolutePath = absoluteStoragePath(storagePath);
  if (!absolutePath) {
    return { ok: false, status: 500, error: 'Invalid local storage path' };
  }

  ensureLocalDirs();
  const bytes = Buffer.from(await input.video.arrayBuffer());
  await writeFile(absolutePath, bytes);

  const now = new Date().toISOString();
  const submission: LocalSubmission = {
    submissionId,
    interviewId,
    campaignSlug: input.slug,
    status: 'opened',
    decision: null,
    feedback: 'Your review is being processed.',
    reward: null,
    reasons: [],
    consentAccepted: input.consentAccepted,
    socialHandle: input.socialHandle?.trim() || null,
    deviceKey: input.deviceKey?.trim() || null,
    tableId: input.tableId?.trim() || null,
    durationSeconds: Math.max(0, Math.round(input.durationSeconds)),
    videoSize: input.video.size,
    videoMime,
    videoFileName,
    storagePath,
    createdAt: Date.now(),
    updatedAt: now,
  };

  state.submissions.set(submissionId, submission);
  persistSubmissions();

  return { ok: true, submission };
}

export function getSubmission(
  submissionId: string,
  slug: string,
):
  | { ok: true; submission: LocalSubmission }
  | { ok: false; status: number; error: string } {
  const campaign = getCampaignBySlug(slug);
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found' };

  const submission = state.submissions.get(submissionId);
  if (!submission || submission.campaignSlug !== slug) {
    return { ok: false, status: 404, error: 'Submission not found' };
  }

  if (advanceSubmission(submission)) {
    persistSubmissions();
  }

  return { ok: true, submission };
}

export function listAdminReviewSubmissions(): AdminReviewSubmission[] {
  let changed = false;
  for (const submission of state.submissions.values()) {
    changed = advanceSubmission(submission) || changed;
  }
  if (changed) persistSubmissions();

  return [...state.submissions.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((submission) => ({
      ...submission,
      restaurantName: getCampaignBySlug(submission.campaignSlug)?.restaurantName ?? submission.campaignSlug,
      previewUrl: buildPreviewUrl(submission.submissionId),
      createdAtIso: new Date(submission.createdAt).toISOString(),
    }));
}

export async function getSubmissionVideo(submissionId: string) {
  const submission = state.submissions.get(submissionId);
  if (!submission) return null;

  const filePath = absoluteStoragePath(submission.storagePath);
  if (!filePath) return null;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return null;
    return {
      submission,
      filePath,
      size: fileStat.size,
      contentType: submission.videoMime || 'video/webm',
    };
  } catch {
    return null;
  }
}

export function toPublicSubmitResult(submission: LocalSubmission): PublicSubmitResult {
  return {
    submissionId: submission.submissionId,
    interviewId: submission.interviewId,
    status: submission.status,
    decision: submission.decision,
    feedback: submission.feedback,
    reward: submission.reward,
    reasons: submission.reasons,
    previewUrl: buildPreviewUrl(submission.submissionId),
    updatedAt: submission.updatedAt,
  };
}
