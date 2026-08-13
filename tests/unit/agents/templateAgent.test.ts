import { describe, expect, it, vi } from 'vitest';
import { AgentFactory, createReportAgent } from '../../../src/main/agents/agentFactory';
import { TemplateAgent } from '../../../src/main/agents/templateAgent';
import type { ReportContext, WeeklyTask } from '../../../src/main/agents/types';

const context: ReportContext = {
  isoYear: 2026,
  isoWeek: 33,
  weekStart: '2026-08-10',
  weekEnd: '2026-08-16',
};

describe('TemplateAgent', () => {
  it('renders the PRD template and sorts groups while preserving same-day order', async () => {
    const tasks: WeeklyTask[] = [
      { date: '2026-08-11', content: '修复登录 Bug', time: '09:30' },
      { date: '2026-08-10', content: '完成界面原型', time: '14:20' },
      { date: '2026-08-10', content: '回复客户邮件', time: '10:15' },
    ];
    const report = await new TemplateAgent().generateReport(tasks, context);
    expect(report).toBe(
      '=======================\n' +
        '周报 | 2026年第33周\n' +
        '2026.08.10 - 2026.08.16\n' +
        '=======================\n' +
        '\n' +
        '【本周完成工作】\n' +
        '■ 周一 08.10\n' +
        '- 完成界面原型 @14:20\n' +
        '- 回复客户邮件 @10:15\n' +
        '\n' +
        '■ 周二 08.11\n' +
        '- 修复登录 Bug @09:30\n' +
        '\n' +
        '【工作总结】\n' +
        '（此处留白，供你手动填写）\n' +
        '\n' +
        '【下周计划】\n' +
        '（此处留白，供你手动填写）\n',
    );
    expect(report).not.toContain('\r');
  });

  it('includes Saturday and Sunday records', async () => {
    const report = await new TemplateAgent().generateReport(
      [
        { date: '2026-08-15', content: '周六工作' },
        { date: '2026-08-16', content: '周日工作' },
      ],
      context,
    );
    expect(report).toContain('■ 周六 08.15\n- 周六工作');
    expect(report).toContain('■ 周日 08.16\n- 周日工作');
  });

  it('uses the ISO week-year and range across a natural-year boundary', async () => {
    const report = await new TemplateAgent().generateReport(
      [
        { date: '2018-12-31', content: '年末任务' },
        { date: '2019-01-06', content: '年初任务' },
      ],
      { isoYear: 2019, isoWeek: 1, weekStart: '2018-12-31', weekEnd: '2019-01-06' },
    );
    expect(report).toContain('周报 | 2019年第1周');
    expect(report).toContain('2018.12.31 - 2019.01.06');
  });

  it('retains completely identical duplicate tasks', async () => {
    const report = await new TemplateAgent().generateReport(
      [
        { date: '2026-08-10', content: '相同', time: '09:00' },
        { date: '2026-08-10', content: '相同', time: '09:00' },
      ],
      context,
    );
    expect(report.match(/- 相同 @09:00/g)).toHaveLength(2);
  });

  it('renders a clear empty-week message and the two writable sections', async () => {
    const agent = new TemplateAgent();
    expect(await agent.isAvailable()).toBe(true);
    const report = await agent.generateReport([], context);
    expect(report).toContain('（本周暂无已记录的完成事项）');
    expect(report).toContain('【工作总结】\n（此处留白，供你手动填写）');
    expect(report).toContain('【下周计划】\n（此处留白，供你手动填写）');
  });

  it('rejects a context range that is not the complete ISO Monday-to-Sunday week', async () => {
    await expect(
      new TemplateAgent().generateReport([], { ...context, weekEnd: '2026-08-14' }),
    ).rejects.toThrow('周一至周日');
  });
});

describe('AgentFactory', () => {
  it('creates TemplateAgent for the configured template agent', () => {
    expect(createReportAgent({ agent: 'template' })).toBeInstanceOf(TemplateAgent);
  });

  it('warns and falls back safely when the configured agent is unknown', () => {
    const logger = { warn: vi.fn() };
    const agent = new AgentFactory(logger).create({ agent: 'ollama-not-installed' });
    expect(agent).toBeInstanceOf(TemplateAgent);
    expect(logger.warn).toHaveBeenCalledWith(
      'Unknown report agent; falling back to template',
      expect.objectContaining({ requestedAgent: 'ollama-not-installed' }),
    );
  });
});
