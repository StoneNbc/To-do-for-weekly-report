import type { ReportAgent, ReportContext, WeeklyTask, ReportGenerationOptions } from './types';
import { renderTemplateReport } from './reportTemplate';

/** 无网络、始终可用的默认 Agent，只负责把周任务渲染为固定 TXT 模板。 */
export class TemplateAgent implements ReportAgent {
  readonly name = 'template';

  constructor(private readonly template?: string) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  previewReport(
    tasks: WeeklyTask[],
    context: ReportContext,
    options?: ReportGenerationOptions,
  ): string {
    return renderTemplateReport(tasks, context, this.template, options?.groupBy);
  }

  async generateReport(
    tasks: WeeklyTask[],
    context: ReportContext,
    options?: ReportGenerationOptions,
  ): Promise<string> {
    return this.previewReport(tasks, context, options);
  }
}
