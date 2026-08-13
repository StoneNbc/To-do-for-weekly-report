export type { ReportAgent, ReportContext, WeeklyTask } from '../../shared/domain';

export interface AgentFactoryLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}
