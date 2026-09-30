import { Global, Logger, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { loadEnvFile } from '../env';
import { JsonStore } from './json-store';
import { createJsonModels } from './json-model';
import { MODEL_DEFINITIONS } from './model-definitions';

loadEnvFile();
export const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'json';
if (!['json', 'mongo'].includes(STORAGE_DRIVER))
  throw new Error('STORAGE_DRIVER must be json or mongo');
const modelTokens = MODEL_DEFINITIONS.map((definition) =>
  getModelToken(definition.name),
);
const jsonProviders = [
  {
    provide: JsonStore,
    useFactory: () => {
      const store = new JsonStore();
      Logger.log(`JSON storage: ${store.file} (MongoDB disabled)`, 'Storage');
      return store;
    },
  },
  {
    provide: 'JSON_MODELS',
    inject: [JsonStore],
    useFactory: (store: JsonStore) =>
      createJsonModels(store, MODEL_DEFINITIONS),
  },
  ...MODEL_DEFINITIONS.map((definition) => ({
    provide: getModelToken(definition.name),
    inject: ['JSON_MODELS'],
    useFactory: (models: ReturnType<typeof createJsonModels>) =>
      models.get(definition.name),
  })),
];

@Global()
@Module({
  imports:
    STORAGE_DRIVER === 'mongo'
      ? [
          MongooseModule.forRoot(
            process.env.MONGO_URI || 'mongodb://localhost:27017/pos_rfid',
          ),
          MongooseModule.forFeature(
            MODEL_DEFINITIONS.map(({ name, schema }) => ({ name, schema })),
          ),
        ]
      : [],
  providers: STORAGE_DRIVER === 'json' ? jsonProviders : [],
  exports:
    STORAGE_DRIVER === 'json' ? [JsonStore, ...modelTokens] : [MongooseModule],
})
export class StorageModule {}
