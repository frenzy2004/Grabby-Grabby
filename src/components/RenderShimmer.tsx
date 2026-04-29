export function RenderShimmer() {
  return (
    <div
      className="pointer-events-none absolute inset-0 animate-shimmer"
      style={{
        backgroundImage:
          'linear-gradient(120deg, transparent 0%, rgba(184,201,168,0.15) 40%, rgba(184,201,168,0.3) 50%, rgba(184,201,168,0.15) 60%, transparent 100%)',
        backgroundSize: '200% 100%',
      }}
    />
  );
}
