import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { open, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const COLLECTIONS = [
  'products',
  'tags',
  'sessions',
  'payments',
  'admins',
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];
export type StoredRecord = Record<string, unknown> & { _id: string };
export interface JsonDatabase {
  version: 1;
  collections: Record<CollectionName, StoredRecord[]>;
}
export function emptyDatabase(): JsonDatabase {
  return {
    version: 1,
    collections: {
      products: [],
      tags: [],
      sessions: [],
      payments: [],
      admins: [],
    },
  };
}
export function parseDatabase(raw: string): JsonDatabase {
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('collections' in value) ||
    !value.collections ||
    typeof value.collections !== 'object'
  )
    throw new Error('Unsupported JSON database format');
  for (const name of COLLECTIONS) {
    const rows: unknown = (value.collections as Record<string, unknown>)[name];
    if (
      !Array.isArray(rows) ||
      rows.some(
        (row: unknown) =>
          !row ||
          typeof row !== 'object' ||
          !('_id' in row) ||
          typeof row._id !== 'string' ||
          !/^[a-f0-9]{24}$/i.test(row._id),
      )
    )
      throw new Error(`Invalid JSON database collection: ${name}`);
    if (
      new Set(rows.map((row) => (row as StoredRecord)._id)).size !== rows.length
    )
      throw new Error(`Duplicate IDs in ${name}`);
  }
  return value as JsonDatabase;
}

/** One in-memory snapshot, one serialized writer, and an atomic file replacement. */
@Injectable()
export class JsonStore implements OnModuleDestroy {
  readonly file: string;
  private database: JsonDatabase;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly lockFile: string;

  constructor(
    file = process.env.JSON_DB_PATH
      ? resolve(process.env.JSON_DB_PATH)
      : resolve(__dirname, '../../storage/data/pos.json'),
  ) {
    this.file = resolve(file);
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    this.lockFile = this.file + '.lock';
    this.acquireLock();
    try {
      this.database = existsSync(this.file)
        ? parseDatabase(readFileSync(this.file, 'utf8'))
        : emptyDatabase();
    } catch (error) {
      unlinkSync(this.lockFile);
      throw error;
    }
  }

  private acquireLock() {
    try {
      const fd = openSync(this.lockFile, 'wx', 0o600);
      try {
        writeFileSync(fd, String(process.pid));
      } finally {
        closeSync(fd);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const pid = Number(readFileSync(this.lockFile, 'utf8'));
      if (!Number.isInteger(pid) || pid <= 0)
        throw new Error(
          'Invalid JSON database lock; inspect it before removing',
        );
      try {
        process.kill(pid, 0);
      } catch (checkError) {
        if ((checkError as NodeJS.ErrnoException).code === 'ESRCH') {
          unlinkSync(this.lockFile);
          this.acquireLock();
          return;
        }
        throw checkError;
      }
      throw new Error('JSON database is already in use by another process');
    }
  }

  read(name: CollectionName): StoredRecord[] {
    return structuredClone(this.database.collections[name]);
  }

  mutate<T>(work: (database: JsonDatabase) => T): Promise<T> {
    const result = this.tail.then(async () => {
      const next = structuredClone(this.database);
      const value = work(next);
      const serialized = JSON.stringify(next);
      const validated = parseDatabase(serialized);
      if (serialized === JSON.stringify(this.database) && existsSync(this.file))
        return value;
      const temp = this.file + '.tmp';
      const fd = await open(temp, 'w', 0o600);
      try {
        await fd.writeFile(serialized);
        await fd.sync();
      } finally {
        await fd.close();
      }
      await rename(temp, this.file);
      // Only publish after durable write succeeds; failed writes leave the previous snapshot intact.
      this.database = validated;
      return value;
    });
    this.tail = result.catch(() => undefined);
    return result;
  }

  async flush() {
    await this.tail;
  }
  async onModuleDestroy() {
    await this.flush();
    if (
      existsSync(this.lockFile) &&
      readFileSync(this.lockFile, 'utf8') === String(process.pid)
    )
      unlinkSync(this.lockFile);
  }
}
