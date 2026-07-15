import './FlagBadge.css';

function FlagBadge({ flag }) {
  if (!flag) return null;
  const colorClass = flag.color || 'default';
  return <span className={`flag-badge flag-${colorClass}`}>{flag.label}</span>;
}

export default FlagBadge;
