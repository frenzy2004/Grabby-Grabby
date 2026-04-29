type Props = {
  elapsedMs: number;
  visible: boolean;
};

export function RecordingBadge({ elapsedMs, visible }: Props) {
  if (!visible) return null;

  const totalSeconds = Math.floor(elapsedMs / 1000);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  const time = `${min}:${String(sec).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-2 rounded-full bg-[rgba(238,64,64,0.95)] px-3.5 py-2 font-mono text-xs text-white">
      <span className="block h-2 w-2 animate-blink rounded-full bg-white" />
      <span>REC {time}</span>
    </div>
  );
}
