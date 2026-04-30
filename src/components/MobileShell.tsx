import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  tone?: 'cream' | 'dark';
};

export function MobileShell({ children, tone = 'cream' }: Props) {
  const isDark = tone === 'dark';

  return (
    <div className={isDark ? 'min-h-dvh bg-[#0e0d0b]' : 'min-h-dvh bg-cream-deep'}>
      <div
        className={[
          'mx-auto min-h-dvh w-full max-w-[430px] overflow-hidden',
          isDark ? 'bg-[#0e0d0b]' : 'bg-cream',
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}
