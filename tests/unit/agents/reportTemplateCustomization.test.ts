import { describe, expect, it } from 'vitest';
import {
  MAX_REPORT_TEMPLATE_LENGTH,
  renderTemplateReport,
  validateReportTemplate,
} from '../../../src/main/agents/reportTemplate';

const context = {
  isoYear: 2026,
  isoWeek: 33,
  weekStart: '2026-08-10',
  weekEnd: '2026-08-16',
};

describe('custom report template', () => {
  it('replaces supported variables once and preserves duplicate tasks', () => {
    const report = renderTemplateReport(
      [
        { date: '2026-08-10', content: '保留正文 {{iso_year}}' },
        { date: '2026-08-10', content: '重复事项' },
        { date: '2026-08-10', content: '重复事项' },
      ],
      context,
      '{{iso_year}}/{{iso_week}} {{week_start}}~{{week_end}}\n{{tasks}}',
    );

    expect(report).toContain('2026/33 2026.08.10~2026.08.16');
    expect(report).toContain('保留正文 {{iso_year}}');
    expect(report.match(/重复事项/g)).toHaveLength(2);
  });

  it('rejects missing, unknown, malformed, and oversized variables', () => {
    expect(() => validateReportTemplate('没有任务变量')).toThrow('{{tasks}}');
    expect(() => validateReportTemplate('{{tasks}} {{unknown}}')).toThrow('未知变量');
    expect(() => validateReportTemplate('{{tasks}} {{ISO_YEAR}}')).toThrow('格式无效');
    expect(() =>
      validateReportTemplate(`{{tasks}}${'x'.repeat(MAX_REPORT_TEMPLATE_LENGTH)}`),
    ).toThrow('不能超过');
  });
});
