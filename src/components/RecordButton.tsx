'use client';

import { cn } from '@/lib/utils';

type Props = {
  recording: boolean;
  onClick: () => void;
  disabled?: boolean;
};

export function RecordButton({ recording, onClick, disabled }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-[76px] w-[76px] items-center justify-center rounded-full',
        'border-[4px] border-white bg-transparent transition-transform duration-150',
        'active:scale-95 disabled:opacity-40',
      )}
      aria-label={recording ? 'Stop recording' : 'Start recording'}
    >
      <span
        className={cn(
          'block bg-[#EE4040] transition-[width,height,border-radius] duration-200 ease-out',
          recording ? 'h-[26px] w-[26px] rounded-md' : 'h-[56px] w-[56px] rounded-full',
        )}
      />
    </button>
  );
}
