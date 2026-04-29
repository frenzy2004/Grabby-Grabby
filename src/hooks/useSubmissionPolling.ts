'use client';

import { useEffect, useRef, useState } from 'react';
import { getSubmission, POLLING_SUBMISSION_STATUSES } from '@/lib/humeoApi';
import type { PublicSubmitResult } from '@/lib/reviews/types';

/**
 * Mirrors the polling pattern in
 * reference/src/app/components/reviews/PublicReviewRecordingClient.tsx
 * (POLLING_SUBMISSION_STATUSES + setInterval).
 */
export function useSubmissionPolling(
  submissionId: string | null,
  slug: string | null,
  intervalMs = 6000,
) {
  const [result, setResult] = useState<PublicSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<number | null>(null);

  useEffect(() => {
    if (!submissionId || !slug) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const next = await getSubmission(submissionId, slug);
        if (cancelled) return;
        setResult(next);
        if (!POLLING_SUBMISSION_STATUSES.has(next.status)) {
          if (stopRef.current !== null) {
            window.clearInterval(stopRef.current);
            stopRef.current = null;
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Status poll failed');
      }
    };

    void tick();
    stopRef.current = window.setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      if (stopRef.current !== null) {
        window.clearInterval(stopRef.current);
        stopRef.current = null;
      }
    };
  }, [submissionId, slug, intervalMs]);

  return { result, error };
}
