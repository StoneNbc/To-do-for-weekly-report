import type { WeeklyDayGroup } from '../../shared/domain';

export function DaySection({ group }: { group: WeeklyDayGroup }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-labelledby={`day-${group.date}`}>
      <header className="mb-3 flex items-baseline justify-between gap-4 border-b border-stone-100 pb-2">
        <h3 className="font-semibold text-stone-900" id={`day-${group.date}`}>{group.weekdayLabel}</h3>
        <time className="text-xs tabular-nums text-stone-400" dateTime={group.date}>{group.date.slice(5).replace('-', '.')}</time>
      </header>
      <ul className="space-y-2">
        {group.tasks.map((task, index) => (
          <li className="flex items-baseline gap-3 text-sm text-stone-700" key={`${group.date}:${index}:${task.content}`}>
            <span className="text-emerald-600" aria-hidden="true">✓</span>
            <span className="min-w-0 flex-1 break-words">{task.content}</span>
            {task.time ? <time className="text-xs tabular-nums text-stone-400">{task.time}</time> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
