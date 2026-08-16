// Agent 复用 shared 中的跨进程领域类型，避免出现第二套周报契约。
export type {
  ReportAgent,
  ReportContext,
  ReportGenerationOptions,
  WeeklyTask,
} from '../../shared/domain';

export interface AgentFactoryLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}
