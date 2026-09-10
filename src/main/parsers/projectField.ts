import { normalizeProjectName } from '../../shared/projects';
import type { ParseWarning } from '../../shared/domain';

export const PROJECT_FORMAT = '!format:projects-v1';
export interface ProjectFormatNode {
  kind: 'projectFormat';
  raw: string;
  line: number;
}

export class ProjectFormatError extends Error {
  readonly code = 'PROJECT_FORMAT_INVALID';
}

export const encodeProjectTitle = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/@项目:/g, '\\@项目:');
export const decodeProjectTitle = (value: string): string => value.replace(/\\([\\@])/g, '$1');

export const encodeProjectName = (value: string): string => {
  const name = normalizeProjectName(value);
  return /[\s"\\]/u.test(name) ? JSON.stringify(name) : name;
};

/** Called after the existing date/time suffixes have been removed. */
export const parseProjectContent = (
  value: string,
): {
  content: string;
  projectName: string | null;
  fieldStart: number;
} => {
  // Quotes belong to the value, so a project-like substring inside a quoted name
  // must not be mistaken for a second field.
  const start = value.indexOf(' @项目:');
  if (start < 0) return { content: decodeProjectTitle(value), projectName: null, fieldStart: -1 };
  const encoded = value.slice(start + ' @项目:'.length);
  let name: unknown;
  try {
    name = encoded.startsWith('"') ? JSON.parse(encoded) : encoded;
    if (typeof name !== 'string' || (!encoded.startsWith('"') && /[\s"\\]/u.test(encoded))) {
      throw new Error();
    }
    const normalized = normalizeProjectName(name);
    if (normalized !== name) throw new Error();
  } catch {
    throw new ProjectFormatError('项目字段格式无效，请检查引号、空名称或重复字段');
  }
  return {
    content: decodeProjectTitle(value.slice(0, start)),
    projectName: name as string,
    fieldStart: start,
  };
};

export const formatProjectContent = (
  content: string,
  projectName: string | null | undefined,
  enabled: boolean,
): string =>
  `${enabled ? encodeProjectTitle(content) : content}${projectName ? ` @项目:${encodeProjectName(projectName)}` : ''}`;

export const projectFormatWarnings = (lines: string[], file: string): ParseWarning[] => {
  const declarations = lines.flatMap((raw, line) =>
    raw.startsWith('!format:') ? [{ raw, line }] : [],
  );
  if (!declarations.length) return [];
  return declarations.length === 1 &&
    declarations[0]?.line === 1 &&
    declarations[0].raw === PROJECT_FORMAT
    ? []
    : [
        {
          file,
          line: declarations[0]!.line,
          code: 'INVALID_PROJECT',
          reason: '任务格式声明未知、重复或不在第二行；暂不可写入',
        },
      ];
};

export const assertProjectWritable = (document: { warnings: ParseWarning[] }): void => {
  const issue = document.warnings.find((warning) => warning.code === 'INVALID_PROJECT');
  if (issue) throw new ProjectFormatError(`${issue.reason}（第 ${issue.line + 1} 行）`);
};

/** Only the project field is replaced; every byte of the title and suffix stays. */
export const replaceProjectField = (raw: string, projectName: string | null): string => {
  const prefix = /^- (?:\[[ xX]\] )?/.exec(raw)?.[0];
  if (!prefix) throw new ProjectFormatError('无法定位任务标题');
  let body = raw.slice(prefix.length);
  let suffix = '';
  const time = /\s@(?:[01]\d|2[0-3]):[0-5]\d$/.exec(body);
  if (time) {
    suffix = body.slice(time.index);
    body = body.slice(0, time.index);
  }
  const date = /\s@添加:\d{4}-\d{2}-\d{2}$/.exec(body);
  if (date) {
    suffix = body.slice(date.index) + suffix;
    body = body.slice(0, date.index);
  }
  const parsed = parseProjectContent(body);
  const title = parsed.fieldStart < 0 ? body : body.slice(0, parsed.fieldStart);
  return `${prefix}${title}${projectName ? ` @项目:${encodeProjectName(projectName)}` : ''}${suffix}`;
};
