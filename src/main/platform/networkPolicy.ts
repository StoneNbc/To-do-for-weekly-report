import type { Session } from 'electron';
import type { AppLogger } from '../logging/logger';

const NETWORK_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

/** 打包环境阻止全部网络请求；开发环境只允许 Vite origin 与热更新连接。 */
export const installLocalOnlyNetworkPolicy = (
  session: Pick<Session, 'webRequest'>,
  logger: AppLogger,
  developmentOrigin?: string,
): void => {
  const allowedOrigin = developmentOrigin ? new URL(developmentOrigin).origin : null;
  session.webRequest.onBeforeRequest((details, callback) => {
    try {
      const target = new URL(details.url);
      const isNetwork = NETWORK_PROTOCOLS.has(target.protocol);
      // file/data 等非网络协议可用；http(s)/ws(s) 必须精确匹配开发 origin。
      const allowed = !isNetwork || (allowedOrigin !== null && target.origin === allowedOrigin);
      if (!allowed) logger.warn('Blocked renderer network request', { url: details.url });
      callback({ cancel: !allowed });
    } catch {
      callback({ cancel: true });
    }
  });
};
