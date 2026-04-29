export function MatchaCircle() {
  return (
    <div className="relative mx-auto my-4 h-[180px] w-[180px]">
      <div
        className="absolute inset-0 rounded-full shadow-[0_30px_60px_rgba(74,107,61,0.25)]"
        style={{
          background:
            'radial-gradient(circle at 35% 30%, #95B485, #4A6B3D 60%, #324A2A 100%)',
        }}
      />
      <div
        className="absolute left-[18%] top-[14%] h-[18%] w-[35%] rounded-full"
        style={{
          background:
            'radial-gradient(ellipse, rgba(255,255,255,0.5), transparent 70%)',
          filter: 'blur(4px)',
        }}
      />
      <span className="absolute inset-0 flex items-start justify-center pt-[28%] font-serif italic text-[22px] text-white/95">
        ~
      </span>
    </div>
  );
}
