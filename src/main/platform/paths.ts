import path from 'node:path';

export interface AppPathProvider {
  readonly isPackaged: boolean;
  getPath(name: 'userData'): string;
}

export interface DataPaths {
  root: string;
  todayFile: string;
  weeksDirectory: string;
  configFile: string;
  logsDirectory: string;
  logFile: string;
}

export interface ResolveDataPathsOptions {
  app: AppPathProvider;
  cwd?: string;
  environment?: NodeJS.ProcessEnv;
}

const isTestEnvironment = (environment: NodeJS.ProcessEnv): boolean =>
  environment.NODE_ENV === 'test' || environment.VITEST === 'true';

export const resolveDataPaths = ({
  app,
  cwd = process.cwd(),
  environment = process.env,
}: ResolveDataPathsOptions): DataPaths => {
  const developmentOverride = environment.STICKY_WEEKLY_DATA_DIR?.trim();
  const mayUseOverride = !app.isPackaged && (isTestEnvironment(environment) || environment.NODE_ENV === 'development');

  const root = app.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : mayUseOverride && developmentOverride
      ? path.resolve(developmentOverride)
      : path.join(path.resolve(cwd), 'data');

  return {
    root,
    todayFile: path.join(root, 'today.txt'),
    weeksDirectory: path.join(root, 'weeks'),
    configFile: path.join(root, 'config.json'),
    logsDirectory: path.join(root, 'logs'),
    logFile: path.join(root, 'logs', 'app.log'),
  };
};
