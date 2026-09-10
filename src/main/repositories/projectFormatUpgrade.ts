import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { TextFileSnapshot } from './textFileStore';
import type { TodayDocument } from '../parsers/todayParser';
import type { WeekDocument } from '../parsers/weekParser';
import {
  assertProjectWritable,
  encodeProjectTitle,
  PROJECT_FORMAT,
  ProjectFormatError,
} from '../parsers/projectField';

export const upgradeProjectFormat = async (
  document: TodayDocument | WeekDocument,
  file: TextFileSnapshot,
): Promise<void> => {
  assertProjectWritable(document);
  if (document.projectFormat) return;
  if (
    document.warnings.some(
      (warning) =>
        warning.code === 'ORPHAN_TASK' ||
        warning.code === 'INVALID_HEADER' ||
        warning.code === 'INVALID_DATE' ||
        (warning.code === 'UNKNOWN_LINE' && document.nodes[warning.line]?.raw.startsWith('- ')),
    )
  ) {
    throw new ProjectFormatError('文件存在无法安全升级的任务或日期，请先修复格式');
  }
  const root =
    basename(dirname(file.path)) === 'weeks' ? dirname(dirname(file.path)) : dirname(file.path);
  const directory = join(root, 'recovery', 'project-format', file.revision);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(join(directory, basename(file.path)), file.text, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
      flush: true,
    });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  for (const node of document.nodes) {
    if (node.kind !== 'task' && node.kind !== 'archivedTask') continue;
    const prefix = node.raw.match(node.kind === 'task' ? /^- \[[ xX]\] / : /^- /)![0];
    node.raw =
      prefix +
      encodeProjectTitle(node.content) +
      node.raw.slice(prefix.length + node.content.length);
  }
  document.nodes.splice(1, 0, { kind: 'projectFormat', raw: PROJECT_FORMAT, line: 1 });
  document.nodes.forEach((node, line) => {
    node.line = line;
  });
  document.projectFormat = true;
};
