import type { ReportAgent, ReportContext, WeeklyTask } from './types';
import { renderTemplateReport } from './reportTemplate';

export class TemplateAgent implements ReportAgent {
  readonly name = 'template';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generateReport(tasks: WeeklyTask[], context: ReportContext): Promise<string> {
    return renderTemplateReport(tasks, context);
  }
}
