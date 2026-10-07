"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const mongoose_1 = require("mongoose");
const env_1 = require("../env");
const json_store_1 = require("../storage/json-store");
const model_definitions_1 = require("../storage/model-definitions");
(0, env_1.loadEnvFile)();
async function main() {
    const connection = (0, mongoose_1.createConnection)(process.env.MONGO_URI || 'mongodb://localhost:27017/pos_rfid', { serverSelectionTimeoutMS: 5000 });
    let store;
    try {
        await connection.asPromise();
        store = new json_store_1.JsonStore();
        if ((0, node_fs_1.existsSync)(store.file))
            throw new Error('Target JSON file already exists; choose a new JSON_DB_PATH to avoid overwriting data');
        const exported = await Promise.all(model_definitions_1.MODEL_DEFINITIONS.map(async (definition) => {
            const model = connection.model(definition.name, definition.schema);
            const rows = JSON.parse(JSON.stringify(await model.find().lean().exec()));
            return { collection: definition.collection, rows };
        }));
        await store.mutate((database) => {
            for (const { collection, rows } of exported)
                database.collections[collection] = rows;
        });
        console.log('[storage:import-mongo] Imported to:', store.file);
        for (const { collection, rows } of exported)
            console.log(`${collection}: ${rows.length}`);
    }
    finally {
        await store?.onModuleDestroy();
        await connection.close();
    }
}
main().catch((error) => {
    console.error('[storage:import-mongo] Import failed:', error instanceof Error ? error.name : 'Unknown error');
    if (error instanceof Error && !error.name.startsWith('Mongo'))
        console.error(error.message);
    process.exitCode = 1;
});
//# sourceMappingURL=import-mongo-json.js.map