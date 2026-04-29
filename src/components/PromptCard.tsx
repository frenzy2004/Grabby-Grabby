type Props = {
  step: number;
  totalSteps: number;
  title: string;
  tip: string;
};

export function PromptCard({ step, totalSteps, title, tip }: Props) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-[rgba(20,18,14,0.78)] px-5 py-[18px] backdrop-blur-md">
      <div className="text-eyebrow mb-1.5 text-sage">
        Clip {String(step).padStart(2, '0')} of {String(totalSteps).padStart(2, '0')}
      </div>
      <div className="font-serif text-[22px] leading-[1.2] text-white">
        {title}
      </div>
      {tip ? (
        <div className="mt-1.5 text-xs leading-[1.4] text-white/60">{tip}</div>
      ) : null}
    </div>
  );
}
