import { ConflictException } from '@nestjs/common';
import { createConnection, Document, Model, Schema, Types } from 'mongoose';
import { CollectionName, JsonStore, StoredRecord } from './json-store';

type Filter = Record<string, unknown>;
type Update = Record<string, unknown>;
interface JsonQuery {
  exec(): Promise<unknown>;
  lean(this: JsonQuery): JsonQuery;
  populate(this: JsonQuery, field: string): JsonQuery;
  then(
    resolve: (result: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ): Promise<unknown>;
  catch(reject: (reason: unknown) => unknown): Promise<unknown>;
}
export interface ModelDefinition {
  name: string;
  schema: Schema;
  collection: CollectionName;
  unique: string[];
}
const normalize = (value: unknown): unknown =>
  value instanceof Types.ObjectId
    ? value.toHexString()
    : value instanceof Date
      ? value.toISOString()
      : value;
function matches(row: StoredRecord, filter: Filter): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') {
      if (!Array.isArray(expected)) throw new Error('Invalid $or filter');
      return expected.some((part) => matches(row, part as Filter));
    }
    if (key.startsWith('$'))
      throw new Error(`Unsupported JSON query operator: ${key}`);
    if (expected && typeof expected === 'object' && '$in' in expected) {
      if (!Array.isArray(expected.$in)) throw new Error('Invalid $in filter');
      return expected.$in.some(
        (value) => normalize(value) === normalize(row[key]),
      );
    }
    return normalize(row[key]) === normalize(expected);
  });
}
function serialize(doc: Document<unknown>): StoredRecord {
  return JSON.parse(
    JSON.stringify(doc.toObject({ depopulate: true })),
  ) as StoredRecord;
}
function checkUnique(
  rows: StoredRecord[],
  candidate: StoredRecord,
  fields: string[],
) {
  for (const field of fields) {
    if (
      rows.some(
        (row) =>
          row._id !== candidate._id &&
          normalize(row[field]) === normalize(candidate[field]),
      )
    )
      throw new ConflictException(`Duplicate ${field}`);
  }
}
function applyUpdate(doc: Document<unknown>, update: Update) {
  for (const [key, value] of Object.entries(update)) {
    if (key === '$set') {
      if (!value || typeof value !== 'object')
        throw new Error('Invalid $set update');
      doc.set(value);
    } else if (key === '$push') {
      if (!value || typeof value !== 'object')
        throw new Error('Invalid $push update');
      for (const [field, entry] of Object.entries(value)) {
        const current: unknown = doc.get(field);
        if (!Array.isArray(current))
          throw new Error('$push target must be an array');
        doc.set(field, [...(current as unknown[]), entry]);
      }
    } else if (key.startsWith('$'))
      throw new Error(`Unsupported JSON update operator: ${key}`);
    else if (!['_id', 'createdAt', 'updatedAt', '__v'].includes(key))
      doc.set(key, value);
  }
}

/** Implements only the model/query operations used by this server; no DB connection. */
export function createJsonModels(
  store: JsonStore,
  definitions: ModelDefinition[],
): Map<string, Model<StoredRecord>> {
  const connection = createConnection();
  const models = new Map<string, Model<StoredRecord>>();
  for (const definition of definitions) {
    const schema = definition.schema.clone();
    schema.set('autoCreate', false);
    schema.set('autoIndex', false);
    schema.set('bufferCommands', false);
    models.set(
      definition.name,
      connection.model<StoredRecord>(definition.name, schema),
    );
  }
  for (const definition of definitions) {
    const model = models.get(definition.name)!;
    const rows = () => store.read(definition.collection);
    const hydrate = (row: StoredRecord) => model.hydrate(row);
    const validateId = (id: unknown) => {
      if (!Types.ObjectId.isValid(String(id)))
        throw new Error('Invalid document id');
      return String(id);
    };
    Object.defineProperty(model.prototype, 'save', {
      value: async function (this: Document<unknown>) {
        await this.validate();
        const candidate = serialize(this);
        const isNew = this.isNew;
        const changed = this.modifiedPaths().map(
          (field) => field.split('.')[0],
        );
        const saved = await store.mutate((database) => {
          const collection = database.collections[definition.collection];
          const index = collection.findIndex(
            (row) => row._id === candidate._id,
          );
          if (!isNew && index === -1) throw new Error('Document was removed');
          if (isNew && index !== -1)
            throw new ConflictException('Duplicate document id');
          const now = new Date().toISOString();
          const next: StoredRecord = isNew
            ? { ...candidate, createdAt: now }
            : { ...collection[index] };
          if (!isNew)
            for (const field of changed) {
              if (['_id', 'createdAt', 'updatedAt', '__v'].includes(field))
                continue;
              if (candidate[field] === undefined) delete next[field];
              else next[field] = candidate[field];
            }
          next.updatedAt = now;
          checkUnique(collection, next, definition.unique);
          if (isNew) collection.push(next);
          else collection[index] = next;
          return next;
        });
        this.set(saved);
        this.isNew = false;
        this.$clearModifiedPaths();
        return this;
      },
    });

    const query = (
      work: () => Promise<StoredRecord | StoredRecord[] | null>,
    ) => {
      let plain = false;
      const populateFields: string[] = [];
      let execution: Promise<unknown> | undefined;
      const exec = () =>
        (execution ??= (async () => {
          const value = await work();
          const convert = (record: StoredRecord) => {
            const doc = hydrate(record);
            for (const field of populateFields) {
              const ref = definition.schema.path(field)?.options.ref as
                | string
                | undefined;
              const targetDefinition = definitions.find(
                (item) => item.name === ref,
              );
              const targetModel = ref ? models.get(ref) : undefined;
              if (!targetDefinition || !targetModel)
                throw new Error(`Unsupported population: ${field}`);
              const target = store
                .read(targetDefinition.collection)
                .find((row) => row._id === String(record[field]));
              if (plain) record[field] = target || null;
              else {
                Reflect.apply(
                  doc.populated.bind(doc) as (
                    path: string,
                    value: unknown,
                    options: unknown,
                  ) => unknown,
                  doc,
                  [field, doc.get(field), { model: targetModel }],
                );
                doc.set(field, target ? targetModel.hydrate(target) : null);
              }
            }
            return plain ? record : doc;
          };
          return Array.isArray(value)
            ? value.map(convert)
            : value
              ? convert(value)
              : null;
        })());
      const result: JsonQuery = {
        exec,
        lean(this: JsonQuery) {
          plain = true;
          return this;
        },
        populate(this: JsonQuery, field: string) {
          populateFields.push(field);
          return this;
        },
        then(
          resolve: (result: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          return exec().then(resolve, reject);
        },
        catch(reject: (reason: unknown) => unknown) {
          return exec().catch(reject);
        },
      };
      return result;
    };
    const method = (name: string, value: unknown) =>
      Object.defineProperty(model, name, { configurable: true, value });
    method('find', (filter: Filter = {}) =>
      query(() =>
        Promise.resolve(rows().filter((row) => matches(row, filter))),
      ),
    );
    method('findOne', (filter: Filter = {}) =>
      query(() =>
        Promise.resolve(rows().find((row) => matches(row, filter)) || null),
      ),
    );
    method('findById', (id: unknown) =>
      query(() =>
        Promise.resolve(
          rows().find((row) => row._id === validateId(id)) || null,
        ),
      ),
    );
    method(
      'findByIdAndUpdate',
      (id: unknown, update: Update, options: { new?: boolean } = {}) =>
        query(async () => {
          const key = validateId(id);
          return store.mutate((database) => {
            const collection = database.collections[definition.collection];
            const index = collection.findIndex((row) => row._id === key);
            if (index === -1) return null;
            const previous = collection[index];
            const doc = hydrate(previous);
            applyUpdate(doc, update);
            const error = doc.validateSync();
            if (error) throw error;
            const next = {
              ...serialize(doc),
              updatedAt: new Date().toISOString(),
            };
            checkUnique(collection, next, definition.unique);
            collection[index] = next;
            return options.new ? next : previous;
          });
        }),
    );
    method('findByIdAndDelete', (id: unknown) =>
      query(async () =>
        store.mutate((database) => {
          const collection = database.collections[definition.collection];
          const index = collection.findIndex(
            (row) => row._id === validateId(id),
          );
          return index === -1 ? null : collection.splice(index, 1)[0];
        }),
      ),
    );
    method('deleteMany', (filter: Filter) =>
      store.mutate((database) => {
        const before = database.collections[definition.collection];
        const remaining = before.filter((row) => !matches(row, filter));
        database.collections[definition.collection] = remaining;
        return {
          acknowledged: true,
          deletedCount: before.length - remaining.length,
        };
      }),
    );
    method('updateMany', (filter: Filter, update: Update) =>
      store.mutate((database) => {
        const collection = database.collections[definition.collection];
        let matchedCount = 0,
          modifiedCount = 0;
        for (let index = 0; index < collection.length; index++) {
          const previous = collection[index];
          if (!matches(previous, filter)) continue;
          matchedCount++;
          const doc = hydrate(previous);
          applyUpdate(doc, update);
          const error = doc.validateSync();
          if (error) throw error;
          const next = serialize(doc);
          checkUnique(collection, next, definition.unique);
          if (JSON.stringify(next) !== JSON.stringify(previous)) {
            collection[index] = {
              ...next,
              updatedAt: new Date().toISOString(),
            };
            modifiedCount++;
          }
        }
        return { acknowledged: true, matchedCount, modifiedCount };
      }),
    );
  }
  return models;
}
