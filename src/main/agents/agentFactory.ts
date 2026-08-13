import type { AppConfig, ReportAgent } from '../../shared/domain';
import { TemplateAgent } from './templateAgent';
import type { AgentFactoryLogger } from './types';

const silentLogger: AgentFactoryLogger = { warn: () => undefined };

export class AgentFactory {
  constructor(private readonly logger: AgentFactoryLogger = silentLogger) {}

  create(config: Pick<AppConfig, 'agent'>): ReportAgent {
    switch (config.agent) {
      case 'template':
        return new TemplateAgent();
      default:
        this.logger.warn('Unknown report agent; falling back to template', {
          requestedAgent: config.agent,
          fallbackAgent: 'template',
        });
        return new TemplateAgent();
    }
  }
}

export const createReportAgent = (
  config: Pick<AppConfig, 'agent'>,
  logger?: AgentFactoryLogger,
): ReportAgent => new AgentFactory(logger).create(config);
