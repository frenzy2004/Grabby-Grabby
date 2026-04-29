'use client';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  tone?: 'cream' | 'dark';
};

export function PhoneViewport({ children, tone = 'cream' }: Props) {
  return (
    <div className={`phone-stage ${tone === 'dark' ? 'phone-stage-dark' : ''}`}>
      <div className="phone-screen">{children}</div>
    </div>
  );
}
