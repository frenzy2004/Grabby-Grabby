const PIECES = [
  { emoji: '🍵', delay: '0s', x: '5%' },
  { emoji: '✨', delay: '0.4s', x: '18%' },
  { emoji: '🥬', delay: '1s', x: '32%' },
  { emoji: '🍵', delay: '0.2s', x: '48%' },
  { emoji: '✨', delay: '1.5s', x: '62%' },
  { emoji: '🥬', delay: '0.7s', x: '78%' },
  { emoji: '🍵', delay: '1.8s', x: '90%' },
];

export function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 animate-confetti text-lg"
          style={{ left: p.x, animationDelay: p.delay }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
