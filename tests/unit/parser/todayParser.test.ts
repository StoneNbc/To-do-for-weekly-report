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
});
