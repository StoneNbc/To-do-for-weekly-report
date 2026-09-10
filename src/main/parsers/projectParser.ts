import type { ParseWarning } from '../../shared/domain';
import { normalizeProjectName, type ProjectView } from '../../shared/projects';
import { decodeText, encodeLines } from './lineEndings';

export interface ProjectBlock {
  project: ProjectView;
  lines: string[];
  line: number;
}
export const parseProjects = (text: string, file = 'projects.txt') => {
  const decoded = decodeText(text);
  const warnings: ParseWarning[] = [];
  const blocks: ProjectBlock[] = [];
  const preamble: string[] = [];
  const warn = (line: number, reason: string) =>
    warnings.push({ file, line, code: 'INVALID_PROJECT', reason });
  if (decoded.lines[0] !== '# projects:v1') warn(0, '项目目录缺少合法版本声明');
  for (const [line, raw] of decoded.lines.entries()) {
    if (raw.startsWith('## ')) {
      const name = raw.slice(3);
      try {
        if (normalizeProjectName(name) !== name) throw new Error();
      } catch {
        warn(line, '项目名称无效');
      }
      if (blocks.some((block) => block.project.name === name)) warn(line, '项目名称重复');
      blocks.push({ project: { name, status: 'active' }, line, lines: [raw] });
    } else {
      const block = blocks.at(-1);
      if (block) block.lines.push(raw);
      else preamble.push(raw);
    }
  }
  for (const block of blocks) {
    const states = block.lines.filter((line) => line.startsWith('状态:'));
    const colors = block.lines.filter((line) => line.startsWith('颜色:'));
    if (states.length !== 1 || !/^状态: (active|archived)$/.test(states[0]!))
      warn(block.line, '项目状态缺失、重复或无效');
    else block.project.status = states[0] === '状态: archived' ? 'archived' : 'active';
    if (colors.length > 1 || (colors.length === 1 && !/^颜色: #[\da-fA-F]{6}$/.test(colors[0]!)))
      warn(block.line, '项目颜色重复或无效');
    else if (colors[0]) block.project.color = colors[0].slice(4);
  }
  return { ...decoded, preamble, blocks, warnings };
};

export type ProjectDocument = ReturnType<typeof parseProjects>;
export const serializeProjects = (document: ProjectDocument): string =>
  encodeLines(
    [...document.preamble, ...document.blocks.flatMap((block) => block.lines)],
    document.eol,
    document.endsWithEol,
  );
