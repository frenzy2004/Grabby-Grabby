'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { PhoneViewport } from '@/components/PhoneViewport';

const DEFAULT_SLUG = 'sageandstone';

export default function HomePage() {
  const [scanY, setScanY] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = ((now - start) / 2000) % 1;
      // up-down ping-pong
      setScanY(Math.abs(Math.sin(t * Math.PI)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <PhoneViewport>
      <main className="flex min-h-dvh flex-col bg-cream">
      <section className="flex flex-1 flex-col items-center justify-center px-7 text-center">
        <div className="relative mb-5 h-40 w-40 overflow-hidden rounded-2xl border border-ink/10 bg-white p-3.5">
          <div
            className="h-full w-full rounded-md"
            style={{
              backgroundImage:
                'linear-gradient(90deg, #2A2520 25%, transparent 25% 50%, #2A2520 50% 75%, transparent 75%), linear-gradient(#2A2520 25%, transparent 25% 50%, #2A2520 50% 75%, transparent 75%)',
              backgroundSize: '8px 8px',
              backgroundBlendMode: 'multiply',
            }}
          />
          <div className="absolute left-3.5 top-3.5 h-[30px] w-[30px] border-[6px] border-ink bg-white" />
          <div className="absolute right-3.5 top-3.5 h-[30px] w-[30px] border-[6px] border-ink bg-white" />
          <div className="absolute bottom-3.5 left-3.5 h-[30px] w-[30px] border-[6px] border-ink bg-white" />
          <div
            className="pointer-events-none absolute left-3.5 right-3.5 h-[2px]"
            style={{
              top: `${10 + scanY * 75}%`,
              background:
                'linear-gradient(90deg, transparent, #4A6B3D, transparent)',
            }}
          />
        </div>

        <div className="text-eyebrow mb-3 text-matcha">Step 00 · context</div>
        <h2 className="text-display max-w-[280px] text-[26px] text-ink">
          She scans the QR <em className="text-matcha">on the table</em>
        </h2>
        <p className="mt-3 max-w-[300px] text-[14px] leading-[1.5] text-ink/65">
          Tabletop card reads:{' '}
          <em className="font-serif italic text-matcha">
            &ldquo;Free matcha for an honest review.&rdquo;
          </em>{' '}
          She points her camera. Browser opens.
        </p>
      </section>

      <footer className="px-7 pb-6 pt-4">
        <Link href={`/c/${DEFAULT_SLUG}`} prefetch>
          <Button>Tap to load the page →</Button>
        </Link>
        <p className="mt-3 text-center font-mono text-[10px] text-muted">
          Dev note: in production, the QR camera scan deep-links to /c/[slug].
        </p>
      </footer>
      </main>
    </PhoneViewport>
  );
}
