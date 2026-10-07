import { Model, Schema } from 'mongoose';
import { CollectionName, JsonStore, StoredRecord } from './json-store';
export interface ModelDefinition {
    name: string;
    schema: Schema;
    collection: CollectionName;
    unique: string[];
}
export declare function createJsonModels(store: JsonStore, definitions: ModelDefinition[]): Map<string, Model<StoredRecord>>;
