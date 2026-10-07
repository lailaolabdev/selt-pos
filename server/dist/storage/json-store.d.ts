import { OnModuleDestroy } from '@nestjs/common';
export declare const COLLECTIONS: readonly ["products", "tags", "sessions", "payments", "admins"];
export type CollectionName = (typeof COLLECTIONS)[number];
export type StoredRecord = Record<string, unknown> & {
    _id: string;
};
export interface JsonDatabase {
    version: 1;
    collections: Record<CollectionName, StoredRecord[]>;
}
export declare function emptyDatabase(): JsonDatabase;
export declare function parseDatabase(raw: string): JsonDatabase;
export declare class JsonStore implements OnModuleDestroy {
    readonly file: string;
    private database;
    private tail;
    private readonly lockFile;
    constructor(file?: string);
    private acquireLock;
    read(name: CollectionName): StoredRecord[];
    mutate<T>(work: (database: JsonDatabase) => T): Promise<T>;
    flush(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
