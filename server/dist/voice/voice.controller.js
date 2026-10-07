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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const tts_dto_1 = require("./dto/tts.dto");
const voice_service_1 = require("./voice.service");
let VoiceController = class VoiceController {
    voiceService;
    constructor(voiceService) {
        this.voiceService = voiceService;
    }
    async synthesize(data, res) {
        const result = await this.voiceService.synthesize(data.text);
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('X-TTS-Cache-Key', result.cacheKey);
        res.setHeader('X-TTS-Cached', String(result.cached));
        res.send(result.audio);
    }
};
exports.VoiceController = VoiceController;
__decorate([
    (0, common_1.Post)('tts'),
    (0, common_1.Header)('Cache-Control', 'private, max-age=86400'),
    (0, swagger_1.ApiOperation)({
        summary: 'Generate Lao TTS audio',
        description: 'Uses the configured Hugging Face TTS model. Default model: facebook/mms-tts-lao.',
    }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Audio file bytes.' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [tts_dto_1.TtsRequestDto, Object]),
    __metadata("design:returntype", Promise)
], VoiceController.prototype, "synthesize", null);
exports.VoiceController = VoiceController = __decorate([
    (0, swagger_1.ApiTags)('Voice'),
    (0, common_1.Controller)('voice'),
    __metadata("design:paramtypes", [voice_service_1.VoiceService])
], VoiceController);
//# sourceMappingURL=voice.controller.js.map