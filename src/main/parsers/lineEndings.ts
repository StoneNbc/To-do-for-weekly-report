export type LineEnding = '\n' | '\r\n';

export interface DecodedText {
  text: string;
  lines: string[];
  eol: LineEnding;
  endsWithEol: boolean;
  hadBom: boolean;
}

export const detectLineEnding = (text: string): LineEnding => {
  // 混合换行文件采用占多数的风格，尽量减少下一次写回产生的无关 diff。
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  const lf = text.match(/(?<!\r)\n/g)?.length ?? 0;
  return crlf > lf ? '\r\n' : '\n';
};

export const decodeText = (input: string): DecodedText => {
  // 读取兼容 BOM，但序列化不重新添加 BOM，最终统一为 UTF-8 无 BOM。
  const hadBom = input.startsWith('\uFEFF');
  const text = hadBom ? input.slice(1) : input;
  const eol = detectLineEnding(text);
  const endsWithEol = /(?:\r\n|\n)$/.test(text);
  const lines = text.length === 0 ? [] : text.split(/\r\n|\n/);
  if (endsWithEol) lines.pop();
  return { text, lines, eol, endsWithEol, hadBom };
};

export const encodeLines = (
  lines: readonly string[],
  eol: LineEnding,
  endsWithEol: boolean,
): string => {
  if (lines.length === 0) return '';
  // 文件末尾是否有换行也是用户文本的一部分，必须显式恢复。
  return `${lines.join(eol)}${endsWithEol ? eol : ''}`;
};
