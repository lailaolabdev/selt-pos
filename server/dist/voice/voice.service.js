"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceService = void 0;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const common_1 = require("@nestjs/common");
const normalizeText = (text) => text.trim().replace(/\s+/g, ' ');
let VoiceService = class VoiceService {
    cacheDir = (0, node_path_1.resolve)(process.cwd(), process.env.TTS_CACHE_DIR || 'storage/tts-cache');
    model = process.env.TTS_MODEL || 'facebook/mms-tts-lao';
    language = process.env.TTS_LANGUAGE || 'lo';
    serviceUrl = process.env.TTS_SERVICE_URL || '';
    serviceModel = process.env.TTS_SERVICE_MODEL || 'facebook';
    getCacheKey(text) {
        const payload = {
            provider: this.serviceUrl ? 'local-service' : 'huggingface',
            serviceUrl: this.serviceUrl,
            text: normalizeText(text),
            language: this.language,
            model: this.serviceUrl ? this.serviceModel : this.model,
            format: 'model-default-audio',
        };
        return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(payload)).digest('hex');
    }
    getAudioPath(cacheKey) {
        return (0, node_path_1.resolve)(this.cacheDir, `${cacheKey}.wav`);
    }
    getMetadataPath(cacheKey) {
        return (0, node_path_1.resolve)(this.cacheDir, `${cacheKey}.json`);
    }
    async synthesize(text) {
        const cleanText = normalizeText(String(text || ''));
        if (!cleanText) {
            throw new common_1.BadRequestException('Text is required');
        }
        await (0, promises_1.mkdir)(this.cacheDir, { recursive: true });
        const cacheKey = this.getCacheKey(cleanText);
        const audioPath = this.getAudioPath(cacheKey);
        if ((0, node_fs_1.existsSync)(audioPath)) {
            return {
                audio: await (0, promises_1.readFile)(audioPath),
                contentType: 'audio/wav',
                cacheKey,
                cached: true,
            };
        }
        const synthesized = this.serviceUrl
            ? await this.synthesizeWithLocalService(cleanText)
            : await this.synthesizeWithHuggingFace(cleanText);
        await (0, promises_1.writeFile)(audioPath, synthesized.audio);
        const metadata = {
            cacheKey,
            provider: this.serviceUrl ? 'local-service' : 'huggingface',
            model: this.serviceUrl ? this.serviceModel : this.model,
            language: this.language,
            contentType: synthesized.contentType,
            sizeBytes: synthesized.audio.length,
            createdAt: new Date().toISOString(),
            textHash: (0, node_crypto_1.createHash)('sha256').update(cleanText).digest('hex'),
        };
        await (0, promises_1.writeFile)(this.getMetadataPath(cacheKey), JSON.stringify(metadata, null, 2));
        return {
            audio: synthesized.audio,
            contentType: synthesized.contentType,
            cacheKey,
            cached: false,
        };
    }
    async synthesizeWithLocalService(cleanText) {
        let response;
        try {
            response = await fetch(this.serviceUrl, {
                method: 'POST',
                headers: {
                    Accept: 'audio/wav',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: cleanText,
                    language: this.language,
                    model: this.serviceModel,
                }),
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new common_1.ServiceUnavailableException(`Local Lao TTS service request failed: ${message}`);
        }
        if (!response.ok) {
            const message = await response.text().catch(() => response.statusText);
            throw new common_1.ServiceUnavailableException(`Local Lao TTS service error: ${message}`);
        }
        const contentType = response.headers.get('content-type') || 'audio/wav';
        const audio = Buffer.from(await response.arrayBuffer());
        if (contentType.includes('application/json')) {
            throw new common_1.ServiceUnavailableException(`Local Lao TTS service returned JSON instead of audio: ${audio.toString('utf8')}`);
        }
        return { audio, contentType };
    }
    async synthesizeWithHuggingFace(cleanText) {
        const headers = {
            Accept: 'audio/wav',
            'Content-Type': 'application/json',
        };
        const token = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_TOKEN;
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        let response;
        try {
            response = await fetch(`https://api-inference.huggingface.co/models/${this.model}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    inputs: cleanText,
                    options: {
                        wait_for_model: true,
                    },
                }),
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new common_1.ServiceUnavailableException(`TTS model request failed: ${message}`);
        }
        if (!response.ok) {
            const message = await response.text().catch(() => response.statusText);
            throw new common_1.ServiceUnavailableException(`TTS model error: ${message}`);
        }
        const contentType = response.headers.get('content-type') || 'audio/wav';
        const audio = Buffer.from(await response.arrayBuffer());
        if (contentType.includes('application/json')) {
            throw new common_1.ServiceUnavailableException(`TTS model returned JSON instead of audio: ${audio.toString('utf8')}`);
        }
        return { audio, contentType };
    }
};
exports.VoiceService = VoiceService;
exports.VoiceService = VoiceService = __decorate([
    (0, common_1.Injectable)()
], VoiceService);
//# sourceMappingURL=voice.service.js.map