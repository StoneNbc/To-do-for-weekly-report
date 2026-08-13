export const normalizeTaskContent = (value: string): string =>
  value.replace(/[\r\n]+/g, ' ').trim();
