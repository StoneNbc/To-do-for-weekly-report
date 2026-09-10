import { parseProjects, serializeProjects, type ProjectDocument } from '../parsers/projectParser';
import { assertProjectWritable } from '../parsers/projectField';
import { FileChangedError, TextFileStore } from './textFileStore';

export const MISSING_PROJECT_REVISION = 'projects:missing';

export class ProjectRepository {
  constructor(
    readonly path: string,
    private readonly store: TextFileStore,
  ) {}

  async read() {
    try {
      const file = await this.store.read(this.path);
      return {
        revision: file.revision,
        document: parseProjects(file.text, this.path),
        text: file.text,
      };
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      return {
        revision: MISSING_PROJECT_REVISION,
        document: parseProjects('# projects:v1\n', this.path),
        text: null,
      };
    }
  }

  async update(
    expectedRevision: string,
    change: (document: ProjectDocument) => void,
  ): Promise<void> {
    const read = await this.read();
    if (read.revision !== expectedRevision) throw new FileChangedError(this.path);
    assertProjectWritable(read.document);
    if (read.text === null) {
      change(read.document);
      await this.store.createAtomic(this.path, serializeProjects(read.document));
    } else {
      await this.store.update(this.path, expectedRevision, (file) => {
        const document = parseProjects(file.text, this.path);
        assertProjectWritable(document);
        change(document);
        return { text: serializeProjects(document), result: undefined };
      });
    }
  }
}
