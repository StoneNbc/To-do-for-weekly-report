/** 只把真正的本机回环地址视为可信 HTTP 例外，普通局域网地址仍走显式风险确认。 */
const isLoopbackHost = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
};

/**
 * 将用户输入规范化为稳定 Base URL，并在发起网络请求前落实协议与凭据边界。
 * 该函数不访问网络，因此保存设置、测试连接和正式生成可以复用完全相同的规则。
 */
export const normalizeLlmBaseUrl = (input: string, allowInsecureHttp = false): string => {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new RangeError('Base URL 不是有效地址');
  }

  if (url.username || url.password) throw new RangeError('Base URL 不能包含用户名或密码');
  if (url.search || url.hash) throw new RangeError('Base URL 不能包含查询参数或片段');
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new RangeError('Base URL 只支持 HTTPS，或本机回环地址的 HTTP');
  }
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname) && !allowInsecureHttp) {
    throw new RangeError('公网与局域网服务必须使用 HTTPS；HTTP 仅允许 localhost/127.0.0.1');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
};

/** API Key 按 origin 绑定，路径变化不能把同一密钥复制到另一个协议、主机或端口。 */
export const getLlmCredentialOrigin = (baseUrl: string, allowInsecureHttp = false): string =>
  new URL(normalizeLlmBaseUrl(baseUrl, allowInsecureHttp)).origin;

export const isLoopbackLlmBaseUrl = (baseUrl: string): boolean =>
  isLoopbackHost(new URL(normalizeLlmBaseUrl(baseUrl, true)).hostname);

/** 兼容用户填写 Base URL 或完整 Chat Completions endpoint，同时避免重复追加路径。 */
export const getChatCompletionsUrl = (baseUrl: string, allowInsecureHttp = false): string => {
  const normalized = normalizeLlmBaseUrl(baseUrl, allowInsecureHttp);
  if (/\/chat\/completions$/i.test(new URL(normalized).pathname)) return normalized;
  return `${normalized}/chat/completions`;
};
