import { cn } from '@/lib/utils';

type Props = {
  total: number;
  current: number;
  doneCount: number;
  liveProgress?: number;
};

export function ProgressPips({ total, current, doneCount, liveProgress = 0 }: Props) {
  return (
    <div className="flex gap-1 px-4">
      {Array.from({ length: total }, (_, i) => {
        const idx = i + 1;
        const isDone = idx <= doneCount;
        const isCurrent = idx === current && !isDone;
        return (
          <div
            key={idx}
            className={cn(
              'h-[3px] flex-1 overflow-hidden rounded-full',
              isDone ? 'bg-sage' : 'bg-white/20',
            )}
          >
            {isCurrent ? (
              <div
                className="h-full bg-sage transition-[width] duration-100 ease-linear"
                style={{
                  width: `${Math.max(8, Math.min(100, liveProgress * 100))}%`,
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
