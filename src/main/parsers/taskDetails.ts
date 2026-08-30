const TASK_DETAIL_RE = /^ {2}\|(?: (.*))?$/;

/** 返回 null 表示不是标准详情行；空字符串表示显式的详情空行。 */
export const parseTaskDetailLine = (raw: string): string | null => {
  const match = TASK_DETAIL_RE.exec(raw);
  return match ? (match[1] ?? '') : null;
};

export const formatTaskDetailLine = (content: string): string =>
  content.length === 0 ? '  |' : `  | ${content}`;
