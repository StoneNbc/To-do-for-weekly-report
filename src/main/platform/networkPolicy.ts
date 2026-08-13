import type { Session } from 'electron';
import type { AppLogger } from '../logging/logger';

const NETWORK_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

/** Blocks all network traffic in packaged builds and limits development traffic to Vite's origin. */
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
      const allowed = !isNetwork || (allowedOrigin !== null && target.origin === allowedOrigin);
      if (!allowed) logger.warn('Blocked renderer network request', { url: details.url });
      callback({ cancel: !allowed });
    } catch {
      callback({ cancel: true });
    }
  });
};
