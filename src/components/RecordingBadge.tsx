type Props = {
  elapsedMs: number;
  maxMs?: number;
  visible: boolean;
};

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function RecordingBadge({ elapsedMs, maxMs, visible }: Props) {
  if (!visible) return null;

  const time = maxMs ? `${formatTime(elapsedMs)} / ${formatTime(maxMs)}` : formatTime(elapsedMs);

  return (
    <div className="flex items-center gap-2 rounded-full bg-[rgba(238,64,64,0.95)] px-3.5 py-2 font-mono text-xs text-white">
      <span className="block h-2 w-2 animate-blink rounded-full bg-white" />
      <span>REC {time}</span>
    </div>
  );
}
