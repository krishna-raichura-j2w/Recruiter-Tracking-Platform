interface ScoreBarProps {
  score: number | null;
  label: string;
}

function getColor(score: number): { bar: string; text: string } {
  if (score < 3) return { bar: 'bg-red-500', text: 'text-red-600' };
  if (score <= 3.5) return { bar: 'bg-yellow-400', text: 'text-yellow-600' };
  return { bar: 'bg-green-500', text: 'text-green-600' };
}

export default function ScoreBar({ score, label }: ScoreBarProps) {
  if (score === null || score === undefined) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 w-28 truncate">{label}</span>
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full" />
        <span className="text-xs text-slate-300 w-6 text-right">—</span>
      </div>
    );
  }

  const pct = Math.min((score / 5) * 100, 100);
  const { bar, text } = getColor(score);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-28 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold w-6 text-right ${text}`}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}
