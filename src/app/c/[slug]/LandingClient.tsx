'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { MatchaCircle } from '@/components/MatchaCircle';
import { recordingStore } from '@/lib/recordingStore';
import type { PublicReviewCampaign } from '@/lib/reviews/types';

type Props = {
  slug: string;
  tableId: string | null;
  campaign: PublicReviewCampaign;
};

export function LandingClient({ slug, tableId, campaign }: Props) {
  const router = useRouter();
  const [consentAccepted, setConsentAccepted] = useState(true);

  useEffect(() => {
    recordingStore.setMeta({ slug, tableId });
  }, [slug, tableId]);

  const handleStart = () => {
    router.push(`/c/${encodeURIComponent(slug)}/record`);
  };

  return (
    <main className="flex min-h-dvh flex-col bg-cream">
      <section className="flex flex-1 flex-col items-center justify-center px-7 pt-6 text-center">
        <div className="mb-7 flex items-center gap-2.5 font-serif italic text-sm text-muted">
          <span className="h-px w-6 bg-muted/50" aria-hidden />
          {campaign.restaurantName}
          <span className="h-px w-6 bg-muted/50" aria-hidden />
        </div>

        <MatchaCircle />

        <h1 className="text-display mt-4 text-[38px] text-ink">
          Free matcha,
          <br />
          <em className="text-matcha">on the house</em>
        </h1>

        <p className="mt-4 max-w-[300px] text-[14px] leading-[1.5] text-ink/65">
          We&apos;ll guide you through a quick video review &mdash; and do all the editing for you.
        </p>

        <p className="mt-6 max-w-[320px] px-2 text-[11px] leading-[1.5] text-ink/55">
          By tapping below, you allow {campaign.restaurantName} to use your video on social media. Your phone will ask for camera access.
        </p>
      </section>

      <footer className="px-7 pb-6 pt-2">
        <Button onClick={handleStart} disabled={!consentAccepted}>
          Get my matcha →
        </Button>
        {tableId ? (
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
            Table {tableId}
          </p>
        ) : null}
        {/* unused setter to keep TS happy if we wire a real consent toggle later */}
        <span className="hidden" onClick={() => setConsentAccepted((v) => v)} />
      </footer>
    </main>
  );
}
