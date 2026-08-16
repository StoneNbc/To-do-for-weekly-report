import { describe, expect, it } from 'vitest';
import { buildReportPrompt } from '../../../src/main/agents/promptBuilder';

const context = {
  isoYear: 2026,
  isoWeek: 33,
  weekStart: '2026-08-10',
  weekEnd: '2026-08-16',
};

describe('buildReportPrompt', () => {
  it('同时发送本地工作记录、完整模板、写作提示词和未完成待办候选', () => {
    const messages = buildReportPrompt(
      [
        { date: '2026-08-12', content: '完成周报双模板设计', time: '15:20' },
        { date: '2026-08-12', content: '完成周报双模板设计', time: '15:20' },
      ],
      context,
      {
        recordTemplate: '本地记录\n{{tasks}}',
        remoteTemplate: [
          '# 周报 {{iso_year}}-{{iso_week}}',
          '【工作记录】',
          '{{tasks}}',
          '【收获与成长】',
          '【不足与反思】',
          '【下周计划】',
        ].join('\n'),
        prompt: '使用第一人称，保持事实准确。',
        pendingTasks: ['补齐回归测试', '发布新版本'],
      },
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    const userPrompt = messages[1]?.content ?? '';
    expect(userPrompt).toContain('使用第一人称，保持事实准确。');
    expect(userPrompt).toContain('【本地 TXT 工作记录】\n本地记录');
    expect(userPrompt).toContain('【收获与成长】');
    expect(userPrompt).toContain('【不足与反思】');
    expect(userPrompt).toContain('【下周计划】');
    expect(userPrompt).toContain('- 补齐回归测试');
    expect(userPrompt).toContain('- 发布新版本');
    expect(userPrompt.match(/完成周报双模板设计/g)).toHaveLength(4);
    expect(userPrompt).not.toContain('{{iso_year}}');
    expect(userPrompt).not.toContain('{{tasks}}');
  });

  it('没有未完成待办时发送明确空状态，不允许空提示词', () => {
    const messages = buildReportPrompt([], context, {
      recordTemplate: '{{tasks}}',
      remoteTemplate: '【工作记录】\n{{tasks}}\n【下周计划】',
      prompt: '不要虚构。',
    });

    expect(messages[1]?.content).toContain('（当前没有未完成待办）');
    expect(() =>
      buildReportPrompt([], context, {
        recordTemplate: '{{tasks}}',
        remoteTemplate: '{{tasks}}',
        prompt: '   ',
      }),
    ).toThrow('提示词');
  });
});
