export type LineEnding = '\n' | '\r\n';

export interface DecodedText {
  text: string;
  lines: string[];
  eol: LineEnding;
  endsWithEol: boolean;
  hadBom: boolean;
}

export const detectLineEnding = (text: string): LineEnding => {
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  const lf = text.match(/(?<!\r)\n/g)?.length ?? 0;
  return crlf > lf ? '\r\n' : '\n';
};

export const decodeText = (input: string): DecodedText => {
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
  return `${lines.join(eol)}${endsWithEol ? eol : ''}`;
};
