// 任务详情行的文本格式：两空格 + 竖线 + 可选内容。例如 "  | 内容" 或 "  |"（空行）。
const TASK_DETAIL_RE = /^ {2}\|(?: (.*))?$/;

/** 返回 null 表示不是标准详情行；空字符串表���显式的详情空行。 */
export const parseTaskDetailLine = (raw: string): string | null => {
  const match = TASK_DETAIL_RE.exec(raw);
  return match ? (match[1] ?? '') : null;
};

/** 把详情内容格式化为标准详情行；空内容输出显式空行 "  |"。 */
export const formatTaskDetailLine = (content: string): string =>
  content.length === 0 ? '  |' : `  | ${content}`;
