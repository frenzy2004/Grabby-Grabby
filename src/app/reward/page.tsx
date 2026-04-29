'use client';

import { Hand } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '@/components/Button';
import { Confetti } from '@/components/Confetti';
import { PhoneViewport } from '@/components/PhoneViewport';
import { RewardCard } from '@/components/RewardCard';
import { recordingStore } from '@/lib/recordingStore';

export default function RewardPage() {
  return (
    <Suspense fallback={null}>
      <RewardScreen />
    </Suspense>
  );
}

function RewardScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code') || 'MATCHA-7K2Q';

  const handleRestart = () => {
    recordingStore.reset();
    router.replace('/');
  };

  return (
    <PhoneViewport>
      <main
      className="relative flex min-h-dvh flex-col overflow-hidden bg-cream"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at 50% 0%, rgba(184,201,168,0.5), transparent 60%)',
      }}
    >
      <Confetti />

      <section className="relative z-10 flex flex-1 flex-col items-center px-7 pt-10 text-center">
        <div className="mb-4 animate-bounce text-[64px]">🎉</div>
        <div className="text-eyebrow mb-2 text-matcha">submitted · thank you</div>
        <h1 className="text-display text-[38px] text-ink">
          You&apos;re a <em className="text-matcha">star.</em>
        </h1>
        <p className="mt-2.5 max-w-[300px] text-[14px] leading-[1.5] text-ink/65">
          Your video is on its way to the team&apos;s social. Now &mdash; about that matcha.
        </p>

        <div className="my-7 w-full">
          <RewardCard code={code} />
        </div>

        <div className="mb-4 flex items-center gap-2.5 rounded-2xl bg-sage px-5 py-3.5 text-[13px] font-semibold text-matcha-deep">
          <Hand className="h-[18px] w-[18px]" />
          Show this screen to your server
        </div>

        <p className="max-w-[300px] text-[11px] leading-[1.5] text-muted">
          Want a copy of your video?{' '}
          <span className="cursor-pointer text-matcha underline">
            Send it to my email →
          </span>
        </p>
      </section>

      <footer className="relative z-10 px-7 pb-6 pt-2">
        <Button variant="secondary" onClick={handleRestart}>
          ↺ Restart prototype
        </Button>
      </footer>
      </main>
    </PhoneViewport>
  );
}
