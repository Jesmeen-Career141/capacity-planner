function AmbientGlow() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Warm cream/beige wash – top right */}
      <div className="absolute -top-[10%] right-[-10%] h-[50vh] w-[50vw] rounded-full bg-[#F5F0E1]/60 blur-[180px]" />

      {/* Soft olive green – top left */}
      <div className="absolute -top-[15%] left-[-10%] h-[45vh] w-[45vw] rounded-full bg-forest-200/40 blur-[170px]" />

      {/* Mint green – mid right */}
      <div className="absolute top-[25%] right-[5%] h-[35vh] w-[35vw] rounded-full bg-forest-300/30 blur-[160px]" />

      {/* Teal – mid left */}
      <div className="absolute top-[35%] left-[0%] h-[40vh] w-[30vw] rounded-full bg-[#A8D5C2]/25 blur-[170px]" />

      {/* Light sage – bottom center (soft, not a spotlight) */}
      <div className="absolute bottom-[0%] left-1/2 h-[30vh] w-[60vw] -translate-x-1/2 rounded-full bg-forest-200/20 blur-[150px]" />

      {/* Very subtle warm glow – bottom right */}
      <div className="absolute bottom-[5%] right-[5%] h-[25vh] w-[30vw] rounded-full bg-[#E8DDC8]/30 blur-[140px]" />

      {/* Faint top vignette (very light) */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/5 to-transparent" />
    </div>
  );
}

export default AmbientGlow;