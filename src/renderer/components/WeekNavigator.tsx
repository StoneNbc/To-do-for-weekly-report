export function WeekNavigator({
  isoYear,
  isoWeek,
  range,
  onPrevious,
  onNext,
  nextDisabled = false,
}: {
  isoYear: number;
  isoWeek: number;
  range: string;
  onPrevious: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <nav aria-label="周记周数切换" className="flex items-center gap-3">
      <button aria-label="查看上一周" className="weekly-icon-button" onClick={onPrevious} type="button">←</button>
      <div>
        <h2 className="text-lg font-semibold text-stone-900">{isoYear} 年第 {isoWeek} 周</h2>
        <p className="mt-0.5 text-xs text-stone-500">{range}</p>
      </div>
      <button aria-label="查看下一周" className="weekly-icon-button" disabled={nextDisabled} onClick={onNext} type="button">→</button>
    </nav>
  );
}
