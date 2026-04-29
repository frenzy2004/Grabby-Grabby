type Props = {
  code: string;
  hint?: string;
};

export function RewardCard({ code, hint = 'single-use · save it for the bar' }: Props) {
  return (
    <div className="relative w-full overflow-hidden rounded-[24px] bg-ink px-6 py-7 text-center text-cream shadow-[0_20px_50px_rgba(42,37,32,0.25)]">
      <div
        className="pointer-events-none absolute -inset-[50%] animate-rotateBg"
        style={{
          background:
            'conic-gradient(from 0deg, transparent, rgba(184,201,168,0.15), transparent 25%)',
        }}
      />
      <div className="relative">
        <div className="text-eyebrow mb-3 text-sage">Your code</div>
        <div className="font-serif text-[42px] font-light tracking-[0.04em]">
          {code}
        </div>
        <div className="mt-2 text-xs opacity-60">{hint}</div>
      </div>
    </div>
  );
}
