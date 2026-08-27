import { describe, expect, it } from 'vitest';
import { parseToday, serializeToday } from '../../../src/main/parsers/todayParser';

describe('todayParser', () => {
  it('keeps duplicate tasks as separate line-addressable nodes', () => {
    const parsed = parseToday('# 2026-08-13\n- [x] 相同任务 @14:20\n- [x] 相同任务 @14:20\n');
    const tasks = parsed.nodes.filter((node) => node.kind === 'task');
    expect(tasks).toHaveLength(2);
    expect(tasks.map((node) => node.line)).toEqual([1, 2]);
  });

  it('preserves unknown lines and CRLF byte-for-byte on no-op serialization', () => {
    const source = '# 2026-08-13\r\n备注：保留我\r\n- [ ] 工作\r\n';
    const parsed = parseToday(source);
    expect(parsed.eol).toBe('\r\n');
    expect(parsed.warnings.some((item) => item.code === 'UNKNOWN_LINE')).toBe(true);
    expect(serializeToday(parsed)).toBe(source);
  });

  it('accepts BOM input but omits it when serialized', () => {
    const parsed = parseToday('\uFEFF# 2026-08-13\n- [ ] 工作\n');
    expect(parsed.fileDate).toBe('2026-08-13');
    expect(parsed.hadBom).toBe(true);
    expect(serializeToday(parsed)).toBe('# 2026-08-13\n- [ ] 工作\n');
  });

  it('does not parse an invalid trailing time', () => {
    const parsed = parseToday('# 2026-08-13\n- [x] 工作 @25:99\n');
    const task = parsed.nodes.find((node) => node.kind === 'task');
    expect(task?.kind === 'task' && task.content).toBe('工作 @25:99');
    expect(parsed.warnings.some((item) => item.code === 'INVALID_TIME')).toBe(true);
  });

  it('keeps ordinary @suffix text as task content without a time warning', () => {
    const parsed = parseToday('# 2026-08-13\n- [x] 联系 @alice\n');
    const task = parsed.nodes.find((node) => node.kind === 'task');
    expect(task?.kind === 'task' && task.content).toBe('联系 @alice');
    expect(parsed.warnings.some((item) => item.code === 'INVALID_TIME')).toBe(false);
  });

  it('parses an optional added date before the completion time', () => {
    const parsed = parseToday(
      '# 2026-08-13\n- [ ] 待办 @添加:2026-08-10\n- [x] 完成 @添加:2026-08-11 @14:20\n',
    );
    const tasks = parsed.nodes.filter((node) => node.kind === 'task');
    expect(tasks[0]).toMatchObject({ content: '待办', addedDate: '2026-08-10' });
    expect(tasks[1]).toMatchObject({
      content: '完成',
      addedDate: '2026-08-11',
      completedAt: '14:20',
    });
    expect(serializeToday(parsed)).toContain('@添加:2026-08-10');
  });

  it('keeps malformed added-date text in content and emits a warning', () => {
    const parsed = parseToday('# 2026-08-13\n- [ ] 工作 @添加:2026-99-99\n');
    const task = parsed.nodes.find((node) => node.kind === 'task');
    expect(task?.kind === 'task' && task.content).toBe('工作 @添加:2026-99-99');
    expect(parsed.warnings.map((warning) => warning.code)).toContain('INVALID_ADDED_DATE');
  });
});
