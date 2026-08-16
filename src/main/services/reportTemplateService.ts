import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_REPORT_TEMPLATE } from '../../shared/constants';
import { validateReportTemplate } from '../agents/reportTemplate';

/** 只管理 Main 预先指定的单个受控文本文件，Renderer 无法借模板功能读取任意路径。 */
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
    // 配置只能引用受控文件的 basename；绝对路径和目录穿越一律回退内置默认值。
    if (templatePath !== path.basename(this.templateFile)) return this.defaultTemplate;
    try {
      const template = await readFile(this.templateFile, 'utf8');
      this.validate(template);
      return template;
    } catch {
      // 缺失、损坏或校验失败时保持功能可用，同时不覆盖用户原文件。
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
    // 原子替换保证单个模板不会因进程中断变成半截文件。
    await rename(temporary, this.templateFile);
  }

  getControlledPath(): string {
    return path.basename(this.templateFile);
  }
}
