import { motion } from 'framer-motion';

function LeafCorner() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute -left-3 -top-3 h-20 w-20 text-forest-500/25 transition-colors duration-300 group-hover:text-forest-500/40"
      fill="currentColor"
    >
      <path d="M10 10c15 5 25 15 28 30-15-3-25-13-30-28-1-1 1-3 2-2z" />
      <path d="M14 55c20-2 35 8 42 25-20 2-35-8-42-25z" />
    </svg>
  );
}

function GoldCorner() {
  const squares = [];
  const size = 7;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if ((row + col) % 2 === 0) {
        squares.push(
          <rect
            key={`${row}-${col}`}
            x={col * size}
            y={row * size}
            width={size}
            height={size}
          />
        );
      }
    }
  }
  return (
    <svg
      viewBox="0 0 28 28"
      className="pointer-events-none absolute -right-2 -top-2 h-14 w-14 text-amber-400/40 transition-colors duration-300 group-hover:text-amber-400/60"
      fill="currentColor"
    >
      {squares}
    </svg>
  );
}

function StatCard({ label, value, accent = 'leaf' }) {
  const isGold = accent === 'gold';

  return (
    <motion.div
      whileHover={{ scale: 1.035, y: -6 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className="group relative w-full"
    >
      {/* Glow */}
      <div
        className={[
          'pointer-events-none absolute left-1/2 top-[78%] h-20 w-[80%]',
          '-translate-x-1/2 rounded-full blur-2xl transition-all duration-300',
          isGold
            ? 'bg-amber-300/25 group-hover:h-24 group-hover:bg-amber-300/40 group-hover:blur-[28px]'
            : 'bg-forest-300/20 group-hover:h-24 group-hover:bg-forest-300/35 group-hover:blur-[28px]',
        ].join(' ')}
      />

      <div
        className={[
          'relative w-full overflow-hidden rounded-2xl border p-7 shadow-[0_4px_20px_rgba(0,0,0,0.06)]',
          'backdrop-blur-sm transition-shadow group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.10)]',
          isGold
            ? 'border-amber-200/60 bg-white/85'
            : 'border-forest-200/50 bg-white/80',
        ].join(' ')}
      >
        {isGold ? <GoldCorner /> : <LeafCorner />}

        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-forest-300/40 to-transparent" />

        <div
          className={[
            'pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0',
            'transition-opacity duration-300 group-hover:opacity-100',
            isGold
              ? 'from-amber-400/10 via-transparent to-transparent'
              : 'from-forest-400/5 via-transparent to-transparent',
          ].join(' ')}
        />

        <div
          className={[
            'pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-transparent',
            'transition-all duration-300',
            isGold ? 'group-hover:ring-amber-300/40' : 'group-hover:ring-forest-300/30',
          ].join(' ')}
        />

        <span
          className={[
            'relative block text-xs font-medium uppercase tracking-wider',
            isGold ? 'text-amber-700' : 'text-forest-600',
          ].join(' ')}
        >
          {label}
        </span>
        <span className="relative mt-2 block font-display text-4xl font-semibold text-forest-900">
          {value}
        </span>
      </div>
    </motion.div>
  );
}

export default StatCard;