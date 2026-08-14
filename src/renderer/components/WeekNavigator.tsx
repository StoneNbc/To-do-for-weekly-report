/** ISO 周切换控件；当前周禁止继续向未来导航。 */
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
    <nav aria-label="周记周数切换" className="flex min-w-0 items-center gap-2 sm:gap-3">
      <button
        aria-label="查看上一周"
        className="weekly-icon-button"
        onClick={onPrevious}
        type="button"
      >
        ←
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold text-stone-900 sm:text-lg">
          {isoYear} 年第 {isoWeek} 周
        </h2>
        <p className="mt-0.5 break-words text-[11px] text-stone-500 sm:text-xs">{range}</p>
      </div>
      <button
        aria-label="查看下一周"
        className="weekly-icon-button"
        disabled={nextDisabled}
        onClick={onNext}
        type="button"
      >
        →
      </button>
    </nav>
  );
}
