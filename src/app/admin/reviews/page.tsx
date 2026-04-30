import Link from 'next/link';
import {
  listAdminReviewSubmissions,
  type AdminReviewSubmission,
} from '@/lib/server/reviewStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function statusClass(status: string) {
  if (status === 'reward_issued') return 'border-emerald-300 bg-emerald-50 text-emerald-900';
  if (status === 'processing_failed') return 'border-red-300 bg-red-50 text-red-900';
  if (status === 'fail_and_retry') return 'border-amber-300 bg-amber-50 text-amber-900';
  return 'border-sky-300 bg-sky-50 text-sky-900';
}

function remoteAdminConfig() {
  const url = process.env.REMOTE_ADMIN_REVIEWS_URL;
  const username = process.env.REMOTE_ADMIN_USERNAME;
  const password = process.env.REMOTE_ADMIN_PASSWORD;

  if (!url || !username || !password) return null;

  return {
    url,
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  };
}

function remoteRecorderHref() {
  const explicit = process.env.REMOTE_PUBLIC_RECORDER_URL;
  if (explicit) return explicit;

  const remote = remoteAdminConfig();
  if (!remote) return '/c/sageandstone';

  try {
    return new URL('/c/sageandstone', remote.url).toString();
  } catch {
    return '/c/sageandstone';
  }
}

async function listReviewsForAdminPage() {
  const remote = remoteAdminConfig();
  if (!remote) {
    return {
      submissions: await listAdminReviewSubmissions(),
      sourceLabel: 'local',
    };
  }

  try {
    const response = await fetch(remote.url, {
      headers: {
        Authorization: remote.authorization,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Remote admin returned ${response.status}`);
    }

    const payload = (await response.json()) as { submissions?: AdminReviewSubmission[] };
    const submissions = Array.isArray(payload.submissions) ? payload.submissions : [];

    return {
      submissions: submissions.map((submission) => ({
        ...submission,
        previewUrl: `/api/admin/remote-video/${encodeURIComponent(submission.submissionId)}`,
      })),
      sourceLabel: 'hugging face',
    };
  } catch (err) {
    console.warn('[matcha-moments/admin] failed to load remote submissions', err);
    return {
      submissions: await listAdminReviewSubmissions(),
      sourceLabel: 'local fallback',
    };
  }
}

function PhoneVideoPreview({ src }: { src: string }) {
  return (
    <div className="mx-auto w-full max-w-[170px] overflow-hidden rounded-[18px] bg-black shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
      <video
        controls
        playsInline
        preload="metadata"
        src={src}
        className="aspect-[9/16] w-full bg-black object-cover"
      />
    </div>
  );
}

export default async function AdminReviewsPage() {
  const { submissions, sourceLabel } = await listReviewsForAdminPage();
  const recorderHref = remoteRecorderHref();

  return (
    <main className="min-h-dvh bg-[#171512] px-5 py-6 text-cream sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-cream/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-eyebrow mb-2 text-sage">office prototype</div>
            <h1 className="text-display text-[34px] text-cream">Review submissions</h1>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-cream/45">
              Source: {sourceLabel}
            </p>
          </div>
          <Link
            href={recorderHref}
            className="inline-flex h-11 items-center justify-center rounded-full border border-cream/20 px-5 text-sm text-cream transition hover:bg-cream/10"
          >
            Open recorder
          </Link>
        </header>

        {submissions.length === 0 ? (
          <section className="rounded-lg border border-cream/10 bg-cream/[0.04] px-5 py-12 text-center">
            <div className="text-display text-[26px] text-cream">No submissions yet.</div>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-cream/60">
              Record a test review from the customer flow and it will appear here with the saved video.
            </p>
          </section>
        ) : (
          <section className="grid gap-4 lg:grid-cols-2">
            {submissions.map((submission) => (
              <article
                key={submission.submissionId}
                className="overflow-hidden rounded-lg border border-cream/10 bg-[#211d18]"
              >
                <div className="grid gap-4 p-4 sm:grid-cols-[180px_1fr]">
                  <PhoneVideoPreview src={submission.previewUrl} />

                  <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${statusClass(
                          submission.status,
                        )}`}
                      >
                        {submission.status.replace(/_/g, ' ')}
                      </span>
                      {submission.reward?.value ? (
                        <span className="rounded-full border border-sage/40 bg-sage/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-sage">
                          {submission.reward.value}
                        </span>
                      ) : null}
                    </div>

                    <div>
                      <h2 className="truncate text-lg font-semibold text-cream">
                        {submission.restaurantName}
                      </h2>
                      <p className="mt-1 break-all font-mono text-[11px] text-cream/45">
                        {submission.submissionId}
                      </p>
                    </div>

                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-md bg-cream/[0.04] px-3 py-2">
                        <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-cream/45">
                          Created
                        </dt>
                        <dd className="mt-1 text-cream/85">{formatDate(submission.createdAtIso)}</dd>
                      </div>
                      <div className="rounded-md bg-cream/[0.04] px-3 py-2">
                        <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-cream/45">
                          Duration
                        </dt>
                        <dd className="mt-1 text-cream/85">{submission.durationSeconds}s</dd>
                      </div>
                      <div className="rounded-md bg-cream/[0.04] px-3 py-2">
                        <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-cream/45">
                          Size
                        </dt>
                        <dd className="mt-1 text-cream/85">{formatBytes(submission.videoSize)}</dd>
                      </div>
                      <div className="rounded-md bg-cream/[0.04] px-3 py-2">
                        <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-cream/45">
                          Table
                        </dt>
                        <dd className="mt-1 text-cream/85">{submission.tableId ?? '-'}</dd>
                      </div>
                    </dl>

                    <div className="rounded-md bg-cream/[0.04] px-3 py-2 text-sm leading-5 text-cream/70">
                      {submission.feedback}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
