import { describe, expect, it } from 'vitest';
import {
  parseWeek,
  readWeekTaskDetails,
  serializeWeek,
} from '../../../src/main/parsers/weekParser';

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
    const parsed = parseWeek('# 第1周 (2018-12-31 ~ 2019-01-06)\n\n## 周一 12-31\n- 跨年任务\n', {
      isoYear: 2019,
      isoWeek: 1,
    });
    const task = parsed.nodes.find((node) => node.kind === 'archivedTask');
    expect(task?.kind === 'archivedTask' && task.date).toBe('2018-12-31');
  });

  it('parses added dates with and without an accurate completion time', () => {
    const parsed = parseWeek(
      `${header}\n\n## 周一 08-10\n- 历史完成 @添加:2026-08-08\n- 正常完成 @添加:2026-08-09 @09:30\n`,
      { isoYear: 2026, isoWeek: 33 },
    );
    const tasks = parsed.nodes.filter((node) => node.kind === 'archivedTask');
    expect(tasks[0]).toMatchObject({ content: '历史完成', addedDate: '2026-08-08' });
    expect(tasks[0]).not.toHaveProperty('completedAt');
    expect(tasks[1]).toMatchObject({
      content: '正常完成',
      addedDate: '2026-08-09',
      completedAt: '09:30',
    });
  });

  it('keeps multiline details attached to one archived task', () => {
    const source = `${header}\n\n## 周一 08-10\n- 主任务 @09:30\n  | 说明\n  |\n  | - 子项文本\n- 第二个任务\n`;
    const parsed = parseWeek(source, { isoYear: 2026, isoWeek: 33 });
    const taskIndexes = parsed.nodes.flatMap((node, index) =>
      node.kind === 'archivedTask' ? [index] : [],
    );

    expect(taskIndexes).toHaveLength(2);
    expect(readWeekTaskDetails(parsed.nodes, taskIndexes[0]!)).toBe('说明\n\n- 子项文本');
    expect(serializeWeek(parsed)).toBe(source);
  });

  it('does not attach a detail-shaped line across a blank line', () => {
    const source = `${header}\n\n## 周一 08-10\n- 主任务\n\n  | 孤立说明\n`;
    const parsed = parseWeek(source, { isoYear: 2026, isoWeek: 33 });

    expect(
      parsed.nodes.some((node) => node.kind === 'unknown' && node.raw === '  | 孤立说明'),
    ).toBe(true);
    expect(serializeWeek(parsed)).toBe(source);
  });
});
