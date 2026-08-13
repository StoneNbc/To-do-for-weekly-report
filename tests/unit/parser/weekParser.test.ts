import { describe, expect, it } from 'vitest';
import { parseWeek, serializeWeek } from '../../../src/main/parsers/weekParser';

describe('weekParser', () => {
  const header = '# 第33周 (2026-08-10 ~ 2026-08-16)';

  it('preserves duplicate tasks and merges neither duplicate date sections nor content', () => {
    const parsed = parseWeek(
      `${header}\n\n## 周一 08-10\n- 相同 @09:00\n\n## 周一 08-10\n- 相同 @09:00\n`,
      { isoYear: 2026, isoWeek: 33 },
    );
    expect(parsed.nodes.filter((node) => node.kind === 'archivedTask')).toHaveLength(2);
    expect(parsed.warnings.some((item) => item.code === 'DUPLICATE_HEADER')).toBe(true);
  });

  it('treats tasks before a valid day header as unknown and preserves them', () => {
    const source = `${header}\r\n- orphan\r\n自定义内容\r\n`;
    const parsed = parseWeek(source, { isoYear: 2026, isoWeek: 33 });
    expect(parsed.warnings.map((item) => item.code)).toContain('ORPHAN_TASK');
    expect(serializeWeek(parsed)).toBe(source);
  });

  it('resolves MM-DD inside the requested cross-year ISO week', () => {
    const parsed = parseWeek(
      '# 第1周 (2018-12-31 ~ 2019-01-06)\n\n## 周一 12-31\n- 跨年任务\n',
      { isoYear: 2019, isoWeek: 1 },
    );
    const task = parsed.nodes.find((node) => node.kind === 'archivedTask');
    expect(task?.kind === 'archivedTask' && task.date).toBe('2018-12-31');
  });
});
