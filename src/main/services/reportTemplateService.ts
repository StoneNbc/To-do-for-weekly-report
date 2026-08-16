import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_REPORT_TEMPLATE } from '../../shared/constants';
import { validateReportTemplate } from '../agents/reportTemplate';

export class ReportTemplateService {
  constructor(
    private readonly templateFile: string,
    private readonly defaultTemplate = DEFAULT_REPORT_TEMPLATE,
    private readonly validate: (template: string) => void = validateReportTemplate,
  ) {}

  getDefault(): string {
    return this.defaultTemplate;
  }

  async read(templatePath: string | null): Promise<string> {
    if (templatePath !== path.basename(this.templateFile)) return this.defaultTemplate;
    try {
      const template = await readFile(this.templateFile, 'utf8');
      this.validate(template);
      return template;
    } catch {
      return this.defaultTemplate;
    }
  }

  async save(template: string): Promise<void> {
    this.validate(template);
    const directory = path.dirname(this.templateFile);
    const temporary = path.join(
      directory,
      `.${path.basename(this.templateFile)}.${process.pid}.${Date.now()}.tmp`,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, template, 'utf8');
    await rename(temporary, this.templateFile);
  }

  getControlledPath(): string {
    return path.basename(this.templateFile);
  }
}
