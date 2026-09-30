import { existsSync } from 'node:fs';
import { createConnection } from 'mongoose';
import { loadEnvFile } from '../env';
import { JsonStore, StoredRecord } from '../storage/json-store';
import { MODEL_DEFINITIONS } from '../storage/model-definitions';

loadEnvFile();
async function main() {
  const connection = createConnection(
    process.env.MONGO_URI || 'mongodb://localhost:27017/pos_rfid',
    { serverSelectionTimeoutMS: 5000 },
  );
  let store: JsonStore | undefined;
  try {
    await connection.asPromise();
    store = new JsonStore();
    if (existsSync(store.file))
      throw new Error(
        'Target JSON file already exists; choose a new JSON_DB_PATH to avoid overwriting data',
      );
    const exported = await Promise.all(
      MODEL_DEFINITIONS.map(async (definition) => {
        const model = connection.model(definition.name, definition.schema);
        const rows = JSON.parse(
          JSON.stringify(await model.find().lean().exec()),
        ) as StoredRecord[];
        return { collection: definition.collection, rows };
      }),
    );
    await store.mutate((database) => {
      for (const { collection, rows } of exported)
        database.collections[collection] = rows;
    });
    console.log('[storage:import-mongo] Imported to:', store.file);
    for (const { collection, rows } of exported)
      console.log(`${collection}: ${rows.length}`);
  } finally {
    await store?.onModuleDestroy();
    await connection.close();
  }
}
main().catch((error: unknown) => {
  // Mongo errors may include connection details; keep credentials out of output.
  console.error(
    '[storage:import-mongo] Import failed:',
    error instanceof Error ? error.name : 'Unknown error',
  );
  if (error instanceof Error && !error.name.startsWith('Mongo'))
    console.error(error.message);
  process.exitCode = 1;
});
