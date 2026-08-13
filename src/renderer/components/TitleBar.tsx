function displayDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const local = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(local);
  return `${month ?? ''}月${day ?? ''}日 ${weekday}`;
}

export function TitleBar({
  selectedDate,
  isHistory,
  onPreviousDay,
  onNextDay,
  onToday,
  onOpenMenu,
}: {
  selectedDate: string;
  isHistory: boolean;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <header className="drag-region flex items-center justify-between gap-2 px-1 pb-2">
      <div className="no-drag flex items-center gap-1">
        <button aria-label="查看前一天" className="icon-button" onClick={onPreviousDay} type="button">‹</button>
        <button aria-label="查看后一天" className="icon-button" disabled={!isHistory} onClick={onNextDay} type="button">›</button>
      </div>
      <div className="min-w-0 text-center">
        <h1 className="truncate text-sm font-semibold text-stone-800">{displayDate(selectedDate)}</h1>
        {isHistory ? (
          <button
            className="no-drag mt-0.5 rounded-full bg-stone-800 px-2 py-0.5 text-[10px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
            onClick={onToday}
            type="button"
          >
            历史记录 · 返回今天
          </button>
        ) : (
          <p className="text-[10px] text-stone-400">今天</p>
        )}
      </div>
      <button aria-label="打开便利贴菜单" className="no-drag icon-button" onClick={onOpenMenu} type="button">•••</button>
    </header>
  );
}
