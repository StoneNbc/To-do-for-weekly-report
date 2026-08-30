import { ChevronIcon } from './ChevronIcon';

function displayDate(date: string): string {
  // 使用数值构造本地日期，避免 new Date('YYYY-MM-DD') 被浏览器按 UTC 解释后跨日。
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
  menuOpen,
  collapsed,
  collapsePending,
  onToggleCollapsed,
}: {
  selectedDate: string;
  isHistory: boolean;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
  collapsed: boolean;
  collapsePending: boolean;
  onToggleCollapsed: () => void;
}) {
  // aria-controls 与菜单 id 同时构成无障碍关系和外部点击判断契约。
  return (
    <header className="drag-region grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 pb-2">
      <div className="no-drag flex items-center justify-start gap-1">
        <button
          aria-label="查看前一天"
          className="icon-button"
          onClick={onPreviousDay}
          type="button"
        >
          ‹
        </button>
        <button
          aria-label="查看后一天"
          className="icon-button"
          disabled={!isHistory}
          onClick={onNextDay}
          type="button"
        >
          ›
        </button>
      </div>
      <div className="min-w-0 text-center">
        <h1 className="truncate text-sm font-semibold text-stone-800">
          {displayDate(selectedDate)}
        </h1>
        {isHistory ? (
          <div
            aria-hidden={collapsed || undefined}
            className={`no-drag mt-0.5 flex items-center justify-center gap-1 ${collapsed ? 'invisible' : ''}`}
          >
            <span
              aria-label="当前正在查看历史记录"
              className="rounded-full bg-stone-800 px-2 py-0.5 text-[10px] font-semibold text-white"
              role="status"
            >
              历史记录
            </span>
            <button
              aria-label="返回今天"
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-stone-700 outline-none hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-stone-600"
              onClick={onToday}
              tabIndex={collapsed ? -1 : undefined}
              type="button"
            >
              返回今天
            </button>
          </div>
        ) : (
          <p
            aria-hidden={collapsed || undefined}
            className={`text-[10px] text-stone-400 ${collapsed ? 'invisible' : ''}`}
          >
            今天
          </p>
        )}
      </div>
      <div className="no-drag flex items-center justify-end gap-1">
        <button
          aria-controls="floating-note-menu"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? '关闭便利贴菜单' : '打开便利贴菜单'}
          className="icon-button"
          disabled={collapsePending}
          onClick={onOpenMenu}
          type="button"
        >
          •••
        </button>
        <button
          aria-label={collapsed ? '展开便利贴' : '收起便利贴'}
          className="icon-button"
          disabled={collapsePending}
          onClick={onToggleCollapsed}
          title={collapsed ? '展开便利贴' : '收起便利贴'}
          type="button"
        >
          <ChevronIcon expanded={!collapsed} />
        </button>
      </div>
    </header>
  );
}
