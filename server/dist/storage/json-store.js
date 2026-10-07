"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonStore = exports.COLLECTIONS = void 0;
exports.emptyDatabase = emptyDatabase;
exports.parseDatabase = parseDatabase;
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
exports.COLLECTIONS = [
    'products',
    'tags',
    'sessions',
    'payments',
    'admins',
];
function emptyDatabase() {
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
function parseDatabase(raw) {
    const value = JSON.parse(raw);
    if (!value ||
        typeof value !== 'object' ||
        !('version' in value) ||
        value.version !== 1 ||
        !('collections' in value) ||
        !value.collections ||
        typeof value.collections !== 'object')
        throw new Error('Unsupported JSON database format');
    for (const name of exports.COLLECTIONS) {
        const rows = value.collections[name];
        if (!Array.isArray(rows) ||
            rows.some((row) => !row ||
                typeof row !== 'object' ||
                !('_id' in row) ||
                typeof row._id !== 'string' ||
                !/^[a-f0-9]{24}$/i.test(row._id)))
            throw new Error(`Invalid JSON database collection: ${name}`);
        if (new Set(rows.map((row) => row._id)).size !== rows.length)
            throw new Error(`Duplicate IDs in ${name}`);
    }
    return value;
}
let JsonStore = class JsonStore {
    file;
    database;
    tail = Promise.resolve();
    lockFile;
    constructor(file = process.env.JSON_DB_PATH
        ? (0, node_path_1.resolve)(process.env.JSON_DB_PATH)
        : (0, node_path_1.resolve)(__dirname, '../../storage/data/pos.json')) {
        this.file = (0, node_path_1.resolve)(file);
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(this.file), { recursive: true, mode: 0o700 });
        this.lockFile = this.file + '.lock';
        this.acquireLock();
        try {
            this.database = (0, node_fs_1.existsSync)(this.file)
                ? parseDatabase((0, node_fs_1.readFileSync)(this.file, 'utf8'))
                : emptyDatabase();
        }
        catch (error) {
            (0, node_fs_1.unlinkSync)(this.lockFile);
            throw error;
        }
    }
    acquireLock() {
        try {
            const fd = (0, node_fs_1.openSync)(this.lockFile, 'wx', 0o600);
            try {
                (0, node_fs_1.writeFileSync)(fd, String(process.pid));
            }
            finally {
                (0, node_fs_1.closeSync)(fd);
            }
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
            const pid = Number((0, node_fs_1.readFileSync)(this.lockFile, 'utf8'));
            if (!Number.isInteger(pid) || pid <= 0)
                throw new Error('Invalid JSON database lock; inspect it before removing');
            try {
                process.kill(pid, 0);
            }
            catch (checkError) {
                if (checkError.code === 'ESRCH') {
                    (0, node_fs_1.unlinkSync)(this.lockFile);
                    this.acquireLock();
                    return;
                }
                throw checkError;
            }
            throw new Error('JSON database is already in use by another process');
        }
    }
    read(name) {
        return structuredClone(this.database.collections[name]);
    }
    mutate(work) {
        const result = this.tail.then(async () => {
            const next = structuredClone(this.database);
            const value = work(next);
            const serialized = JSON.stringify(next);
            const validated = parseDatabase(serialized);
            if (serialized === JSON.stringify(this.database) && (0, node_fs_1.existsSync)(this.file))
                return value;
            const temp = this.file + '.tmp';
            const fd = await (0, promises_1.open)(temp, 'w', 0o600);
            try {
                await fd.writeFile(serialized);
                await fd.sync();
            }
            finally {
                await fd.close();
            }
            await (0, promises_1.rename)(temp, this.file);
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
        if ((0, node_fs_1.existsSync)(this.lockFile) &&
            (0, node_fs_1.readFileSync)(this.lockFile, 'utf8') === String(process.pid))
            (0, node_fs_1.unlinkSync)(this.lockFile);
    }
};
exports.JsonStore = JsonStore;
exports.JsonStore = JsonStore = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object])
], JsonStore);
//# sourceMappingURL=json-store.js.map