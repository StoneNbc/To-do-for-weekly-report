const isLoopbackHost = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
};

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

export const getLlmCredentialOrigin = (baseUrl: string, allowInsecureHttp = false): string =>
  new URL(normalizeLlmBaseUrl(baseUrl, allowInsecureHttp)).origin;

export const isLoopbackLlmBaseUrl = (baseUrl: string): boolean =>
  isLoopbackHost(new URL(normalizeLlmBaseUrl(baseUrl, true)).hostname);

export const getChatCompletionsUrl = (baseUrl: string, allowInsecureHttp = false): string => {
  const normalized = normalizeLlmBaseUrl(baseUrl, allowInsecureHttp);
  if (/\/chat\/completions$/i.test(new URL(normalized).pathname)) return normalized;
  return `${normalized}/chat/completions`;
};
