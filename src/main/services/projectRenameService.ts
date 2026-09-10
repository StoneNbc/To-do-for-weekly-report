import type { Dirent } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { z } from 'zod';
import type { ProjectRecovery, ProjectRenamePlan } from '../../shared/projects';
import { FileChangedError, TextFileStore, computeRevision } from '../repositories/textFileStore';
import { BusinessCoordinator, ProjectRecoveryError } from './businessCoordinator';

export interface RenameFile {
  path: string;
  revision: string;
  text: string;
  next: string;
}
export interface RenameSource {
  path: string;
  revision: string;
}
interface Plan extends ProjectRenamePlan {
  files: RenameFile[];
  sources: RenameSource[];
  expires: number;
}
const journalSchema = z.object({
  version: z.literal(1),
  state: z.enum(['prepared', 'committed', 'rolled-back']),
  files: z.array(
    z.object({
      path: z.string().regex(/^(?:projects\.txt|today\.txt|weeks\/week-\d{4}-W\d{2}\.txt)$/),
      before: z.string(),
      after: z.string(),
      backup: z.string().regex(/^\d+\.txt$/),
    }),
  ),
});

/** Backups and a durable manifest allow recovery even when the process exits between files. */
export class ProjectRenameService {
  private plans = new Map<string, Plan>();
  private recovery: ProjectRecovery = { blocked: false, message: '', files: [] };
  readonly directory: string;

  constructor(
    private readonly root: string,
    private readonly store: TextFileStore,
    private readonly coordinator: BusinessCoordinator,
    private readonly sources: () => Promise<RenameSource[]>,
    private readonly afterWrite?: (index: number) => Promise<void>,
  ) {
    this.directory = join(root, 'recovery', 'project-rename');
  }

  getRecovery(): ProjectRecovery {
    return this.recovery;
  }

  preview(
    oldName: string,
    newName: string,
    files: RenameFile[],
    sources: RenameSource[],
    taskCount: number,
  ): ProjectRenamePlan {
    for (const [token, plan] of this.plans) if (plan.expires < Date.now()) this.plans.delete(token);
    const plan: Plan = {
      token: randomUUID(),
      oldName,
      newName,
      files: files.filter((file) => file.next !== file.text),
      sources,
      taskCount,
      fileCount: files.filter((file) => file.next !== file.text).length,
      expires: Date.now() + 5 * 60_000,
    };
    this.plans.set(plan.token, plan);
    return { token: plan.token, oldName, newName, taskCount, fileCount: plan.fileCount };
  }

  async execute(token: string): Promise<void> {
    const plan = this.plans.get(token);
    this.plans.delete(token);
    if (!plan || plan.expires < Date.now()) throw new FileChangedError('projects.txt');
    await this.verify(plan.sources);
    if (!plan.files.length) return;
    const directory = join(this.directory, randomUUID());
    await mkdir(directory, { recursive: true });
    const files: z.infer<typeof journalSchema>['files'] = [];
    for (const [index, file] of plan.files.entries()) {
      const backup = `${index}.txt`;
      await writeFile(join(directory, backup), file.text, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
        flush: true,
      });
      files.push({
        path: relative(this.root, file.path).replaceAll('\\', '/'),
        before: file.revision,
        after: computeRevision(file.next),
        backup,
      });
    }
    const journal = journalSchema.parse({ version: 1, state: 'prepared', files });
    const manifest = join(directory, 'manifest.json');
    await this.store.writeAtomic(manifest, JSON.stringify(journal));
    try {
      await this.verify(plan.sources);
      for (const [index, file] of plan.files.entries()) {
        await this.store.update(file.path, file.revision, () => ({
          text: file.next,
          result: undefined,
        }));
        await this.afterWrite?.(index);
      }
      const expected = plan.sources.map((source) => ({
        ...source,
        revision:
          files.find((file) => join(this.root, file.path) === source.path)?.after ??
          source.revision,
      }));
      await this.verify(expected);
      journal.state = 'committed';
      await this.store.writeAtomic(manifest, JSON.stringify(journal));
    } catch (error) {
      await this.recover();
      if (this.recovery.blocked) throw new ProjectRecoveryError();
      throw error;
    }
  }

  private async verify(expected: RenameSource[]): Promise<void> {
    const actual = await this.sources();
    const key = (values: RenameSource[]) =>
      JSON.stringify(
        values
          .map((value) => [value.path, value.revision])
          .sort((a, b) => a[0]!.localeCompare(b[0]!)),
      );
    if (key(actual) !== key(expected)) throw new FileChangedError('projects.txt');
  }

  async recover(): Promise<ProjectRecovery> {
    return this.coordinator.run(
      async () => {
        this.plans.clear();
        const conflicts: string[] = [];
        let directories: Dirent[];
        try {
          directories = await readdir(this.directory, { withFileTypes: true });
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
            directories = [];
          else throw error;
        }
        for (const entry of directories) {
          if (!entry.isDirectory()) continue;
          const directory = join(this.directory, entry.name);
          const manifest = join(directory, 'manifest.json');
          try {
            let text: string;
            try {
              text = await readFile(manifest, 'utf8');
            } catch (error) {
              if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
              throw error;
            }
            const journal = journalSchema.parse(JSON.parse(text));
            if (journal.state !== 'prepared') continue;
            let failed = false;
            for (const file of [...journal.files].reverse()) {
              try {
                const target = join(this.root, file.path);
                const current = await this.store.read(target);
                if (current.revision === file.before) continue;
                if (current.revision !== file.after) throw new FileChangedError(target);
                const backup = await readFile(join(directory, file.backup), 'utf8');
                if (computeRevision(backup) !== file.before) throw new Error('备份校验失败');
                await this.store.update(target, file.after, () => ({
                  text: backup,
                  result: undefined,
                }));
              } catch {
                failed = true;
                conflicts.push(file.path);
              }
            }
            if (!failed) {
              journal.state = 'rolled-back';
              await this.store.writeAtomic(manifest, JSON.stringify(journal));
            }
          } catch {
            conflicts.push('恢复清单无法读取，请检查恢复目录');
          }
        }
        this.coordinator.blocked = conflicts.length > 0;
        this.recovery = {
          blocked: this.coordinator.blocked,
          files: [...new Set(conflicts)],
          message: conflicts.length
            ? '部分文件已被外部修改或无法恢复。已保留备份，请修复后重新检查。'
            : '',
        };
        return this.recovery;
      },
      { recovery: true },
    );
  }
}
