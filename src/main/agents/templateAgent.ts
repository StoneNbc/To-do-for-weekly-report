import type { ReportAgent, ReportContext, WeeklyTask } from './types';
import { renderTemplateReport } from './reportTemplate';

/** 无网络、始终可用的默认 Agent，只负责把周任务渲染为固定 TXT 模板。 */
export class TemplateAgent implements ReportAgent {
  readonly name = 'template';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generateReport(tasks: WeeklyTask[], context: ReportContext): Promise<string> {
    return renderTemplateReport(tasks, context);
  }
}
