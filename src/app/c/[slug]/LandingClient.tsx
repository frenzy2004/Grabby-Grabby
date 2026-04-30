'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { MatchaCircle } from '@/components/MatchaCircle';
import { MobileShell } from '@/components/MobileShell';
import { recordingStore } from '@/lib/recordingStore';
import type { PublicReviewCampaign } from '@/lib/reviews/types';

type Props = {
  slug: string;
  tableId: string | null;
  campaign: PublicReviewCampaign;
};

export function LandingClient({ slug, tableId, campaign }: Props) {
  const router = useRouter();
  const [consentAccepted, setConsentAccepted] = useState(false);

  useEffect(() => {
    recordingStore.setMeta({ slug, tableId });
  }, [slug, tableId]);

  const handleStart = () => {
    if (!consentAccepted) return;
    window.sessionStorage.setItem(`matcha-moments-consent:${slug}`, 'true');
    const tableQuery = tableId ? `?t=${encodeURIComponent(tableId)}` : '';
    router.push(`/c/${encodeURIComponent(slug)}/record${tableQuery}`);
  };

  return (
    <MobileShell>
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
          We&apos;ll guide you through a few food shots and short voice notes &mdash; then edit the reel for you.
        </p>

        <label className="mt-6 flex max-w-[320px] cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-left">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(event) => setConsentAccepted(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-matcha"
          />
          <span className="text-[11px] leading-[1.5] text-ink/65">
            I allow {campaign.restaurantName} to review, edit, and use my video and voice on social media.
          </span>
        </label>
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
      </footer>
      </main>
    </MobileShell>
  );
}
