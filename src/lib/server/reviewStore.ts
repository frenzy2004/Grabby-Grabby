import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { stat, writeFile } from 'fs/promises';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  PublicReviewCampaign,
  PublicSubmitResult,
  ReviewRewardType,
  ReviewSubmissionStatus,
} from '@/lib/reviews/types';

/**
 * Review store for the standalone prototype.
 *
 * Preferred mode: Supabase Storage
 *   review-videos/videos/<submissionId>.<ext>
 *   review-videos/submissions/<submissionId>.json
 *
 * Local file fallback remains available when Supabase env vars are absent.
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
  storageBackend: 'local' | 'supabase';
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

type LocalVideoResult = {
  kind: 'local';
  submission: LocalSubmission;
  filePath: string;
  size: number;
  contentType: string;
};

type SupabaseVideoResult = {
  kind: 'supabase';
  submission: LocalSubmission;
  storagePath: string;
  size: number;
  contentType: string;
};

export type SubmissionVideoResult = LocalVideoResult | SupabaseVideoResult;

const LOCAL_DATA_DIR = path.join(process.cwd(), '.local-review-data');
const UPLOADS_DIR = path.join(LOCAL_DATA_DIR, 'uploads');
const SUBMISSIONS_FILE = path.join(LOCAL_DATA_DIR, 'submissions.json');
const ENV_FILE = path.join(process.cwd(), '.env.local');
const DEFAULT_BUCKET = 'review-videos';

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

let supabaseAdmin: SupabaseClient | null = null;
let bucketReady = false;
let envFileCache: Record<string, string> | null = null;

function readEnvFile() {
  if (envFileCache) return envFileCache;
  envFileCache = {};

  if (!existsSync(ENV_FILE)) return envFileCache;

  try {
    const raw = readFileSync(ENV_FILE, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const splitAt = trimmed.indexOf('=');
      if (splitAt <= 0) continue;

      const key = trimmed.slice(0, splitAt).trim();
      const value = trimmed.slice(splitAt + 1).trim();
      envFileCache[key] = value.replace(/^['"]|['"]$/g, '');
    }
  } catch {
    envFileCache = {};
  }

  return envFileCache;
}

function serverEnv(name: string) {
  return process.env[name] || readEnvFile()[name] || '';
}

function hasSupabaseConfig() {
  return Boolean(serverEnv('SUPABASE_URL') && serverEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

function getBucketName() {
  return serverEnv('SUPABASE_REVIEW_VIDEO_BUCKET') || DEFAULT_BUCKET;
}

function getSupabaseAdmin() {
  if (!hasSupabaseConfig()) return null;
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(serverEnv('SUPABASE_URL'), serverEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    });
  }
  return supabaseAdmin;
}

function supabaseObjectUrl(storagePath: string) {
  const baseUrl = serverEnv('SUPABASE_URL').replace(/\/$/, '');
  const encodedBucket = encodeURIComponent(getBucketName());
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`;
}

async function ensureSupabaseBucket(client: SupabaseClient) {
  if (bucketReady) return;
  const bucket = getBucketName();
  const { data } = await client.storage.getBucket(bucket);
  if (!data) {
    const { error } = await client.storage.createBucket(bucket, {
      public: false,
    });
    if (error && !error.message.toLowerCase().includes('already exists')) {
      throw error;
    }
  }
  bucketReady = true;
}

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

function normalizeSubmission(value: LocalSubmission): LocalSubmission {
  return {
    ...value,
    storageBackend: value.storageBackend ?? 'local',
  };
}

function createState(): StoreState {
  const campaigns = new Map<string, PublicReviewCampaign>();
  campaigns.set(SAGE_AND_STONE.slug, SAGE_AND_STONE);

  const submissions = new Map<string, LocalSubmission>();
  for (const submission of readPersistedSubmissions()) {
    const normalized = normalizeSubmission(submission);
    submissions.set(normalized.submissionId, normalized);
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
  } else {
    state.submissions.set(id, normalizeSubmission(submission));
  }
}
if (process.env.NODE_ENV !== 'production') {
  globalForStore.__matchaReviewStore = state;
}

function persistLocalSubmissions() {
  ensureLocalDirs();
  const submissions = [...state.submissions.values()]
    .filter((submission) => submission.storageBackend === 'local')
    .sort((a, b) => a.createdAt - b.createdAt);
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

function localStoragePathFor(submissionId: string, ext: string) {
  return `uploads/${submissionId}.${ext}`;
}

function supabaseVideoPathFor(submissionId: string, ext: string) {
  return `videos/${submissionId}.${ext}`;
}

function metadataPathFor(submissionId: string) {
  return `submissions/${submissionId}.json`;
}

function absoluteStoragePath(storagePath: string) {
  const absolute = path.resolve(LOCAL_DATA_DIR, storagePath);
  const localRoot = path.resolve(LOCAL_DATA_DIR);
  if (absolute !== localRoot && !absolute.startsWith(`${localRoot}${path.sep}`)) {
    return null;
  }
  return absolute;
}

async function textFromDownloadedData(data: unknown) {
  if (typeof data === 'string') return data;

  if (data && typeof data === 'object') {
    const maybeBlob = data as {
      text?: () => Promise<string>;
      arrayBuffer?: () => Promise<ArrayBuffer>;
    };

    if (typeof maybeBlob.text === 'function') {
      return maybeBlob.text();
    }

    if (typeof maybeBlob.arrayBuffer === 'function') {
      return Buffer.from(await maybeBlob.arrayBuffer()).toString('utf8');
    }
  }

  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  throw new Error('Unsupported downloaded data type');
}

async function persistSupabaseSubmission(client: SupabaseClient, submission: LocalSubmission) {
  await ensureSupabaseBucket(client);
  const body = JSON.stringify(submission, null, 2);
  const { error } = await client.storage
    .from(getBucketName())
    .upload(metadataPathFor(submission.submissionId), body, {
      contentType: 'application/json',
      upsert: true,
    });
  if (error) throw error;
}

async function loadSupabaseSubmission(
  client: SupabaseClient,
  submissionId: string,
): Promise<LocalSubmission | null> {
  await ensureSupabaseBucket(client);
  const { data, error } = await client.storage
    .from(getBucketName())
    .download(metadataPathFor(submissionId));
  if (error || !data) {
    if (error) {
      console.warn('[matcha-moments/review-store] failed to download Supabase metadata', {
        submissionId,
        message: error.message,
      });
    }
    return null;
  }

  try {
    const text = await textFromDownloadedData(data);
    const parsed = JSON.parse(text) as unknown;
    if (!isLocalSubmission(parsed)) {
      console.warn('[matcha-moments/review-store] invalid Supabase metadata', {
        submissionId,
      });
      return null;
    }
    return normalizeSubmission(parsed);
  } catch (err) {
    console.warn('[matcha-moments/review-store] failed to parse Supabase metadata', {
      submissionId,
      message: err instanceof Error ? err.message : 'Unknown error',
    });
    return null;
  }
}

async function listSupabaseSubmissions(client: SupabaseClient) {
  await ensureSupabaseBucket(client);
  const { data, error } = await client.storage
    .from(getBucketName())
    .list('submissions', {
      limit: 200,
      sortBy: { column: 'created_at', order: 'desc' },
    });
  if (error || !data) {
    if (error) {
      console.warn('[matcha-moments/review-store] failed to list Supabase submissions', error);
    }
    return [];
  }
  const submissions = await Promise.all(
    data
      .filter((item) => item.name.endsWith('.json'))
      .map((item) => loadSupabaseSubmission(client, item.name.replace(/\.json$/, ''))),
  );

  return submissions.filter((submission): submission is LocalSubmission => Boolean(submission));
}

function mergeSubmissions(...groups: LocalSubmission[][]) {
  const merged = new Map<string, LocalSubmission>();
  for (const group of groups) {
    for (const submission of group) {
      merged.set(submission.submissionId, normalizeSubmission(submission));
    }
  }
  return [...merged.values()];
}

async function persistSubmission(submission: LocalSubmission) {
  state.submissions.set(submission.submissionId, submission);

  if (submission.storageBackend === 'supabase') {
    const client = getSupabaseAdmin();
    if (!client) throw new Error('Supabase is not configured');
    await persistSupabaseSubmission(client, submission);
    return;
  }

  persistLocalSubmissions();
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
  const bytes = Buffer.from(await input.video.arrayBuffer());
  const storageBackend = hasSupabaseConfig() ? 'supabase' : 'local';
  const storagePath =
    storageBackend === 'supabase'
      ? supabaseVideoPathFor(submissionId, ext)
      : localStoragePathFor(submissionId, ext);

  if (storageBackend === 'supabase') {
    const client = getSupabaseAdmin();
    if (!client) {
      return { ok: false, status: 500, error: 'Supabase is not configured' };
    }
    await ensureSupabaseBucket(client);
    const { error } = await client.storage.from(getBucketName()).upload(storagePath, bytes, {
      contentType: videoMime,
      upsert: false,
    });
    if (error) {
      return { ok: false, status: 500, error: `Video upload failed: ${error.message}` };
    }
  } else {
    const absolutePath = absoluteStoragePath(storagePath);
    if (!absolutePath) {
      return { ok: false, status: 500, error: 'Invalid local storage path' };
    }
    ensureLocalDirs();
    await writeFile(absolutePath, bytes);
  }

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
    storageBackend,
    createdAt: Date.now(),
    updatedAt: now,
  };

  await persistSubmission(submission);

  return { ok: true, submission };
}

export async function getSubmission(
  submissionId: string,
  slug: string,
): Promise<
  | { ok: true; submission: LocalSubmission }
  | { ok: false; status: number; error: string }
> {
  const campaign = getCampaignBySlug(slug);
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found' };

  const client = getSupabaseAdmin();
  const submission =
    (client ? await loadSupabaseSubmission(client, submissionId) : null) ??
    state.submissions.get(submissionId);

  if (!submission || submission.campaignSlug !== slug) {
    return { ok: false, status: 404, error: 'Submission not found' };
  }

  if (advanceSubmission(submission)) {
    await persistSubmission(submission);
  } else {
    state.submissions.set(submission.submissionId, submission);
  }

  return { ok: true, submission };
}

export async function listAdminReviewSubmissions(): Promise<AdminReviewSubmission[]> {
  const client = getSupabaseAdmin();
  const supabaseSubmissions = client ? await listSupabaseSubmissions(client) : [];
  const sourceSubmissions = mergeSubmissions(
    [...state.submissions.values()],
    supabaseSubmissions,
  );

  const submissions: LocalSubmission[] = [];
  for (const submission of sourceSubmissions) {
    if (advanceSubmission(submission)) {
      await persistSubmission(submission);
    } else {
      state.submissions.set(submission.submissionId, submission);
    }
    submissions.push(submission);
  }

  return submissions
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((submission) => ({
      ...submission,
      restaurantName: getCampaignBySlug(submission.campaignSlug)?.restaurantName ?? submission.campaignSlug,
      previewUrl: buildPreviewUrl(submission.submissionId),
      createdAtIso: new Date(submission.createdAt).toISOString(),
    }));
}

export async function getSubmissionVideo(
  submissionId: string,
): Promise<SubmissionVideoResult | null> {
  const client = getSupabaseAdmin();
  const submission =
    (client ? await loadSupabaseSubmission(client, submissionId) : null) ??
    state.submissions.get(submissionId);

  if (!submission) return null;

  if (submission.storageBackend === 'supabase') {
    if (!client) return null;
    return {
      kind: 'supabase',
      submission,
      storagePath: submission.storagePath,
      size: submission.videoSize,
      contentType: submission.videoMime || 'video/webm',
    };
  }

  const filePath = absoluteStoragePath(submission.storagePath);
  if (!filePath) return null;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return null;
    return {
      kind: 'local',
      submission,
      filePath,
      size: fileStat.size,
      contentType: submission.videoMime || 'video/webm',
    };
  } catch {
    return null;
  }
}

export async function fetchSupabaseVideoObject(
  video: Extract<SubmissionVideoResult, { kind: 'supabase' }>,
  rangeHeader: string | null,
) {
  const serviceRoleKey = serverEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) return null;

  const headers: HeadersInit = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (rangeHeader) {
    headers.Range = rangeHeader;
  }

  const response = await fetch(supabaseObjectUrl(video.storagePath), {
    headers,
    cache: 'no-store',
  });

  if (!response.ok || !response.body) return null;
  return response;
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
