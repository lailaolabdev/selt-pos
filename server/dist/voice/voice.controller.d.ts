import type { Response } from 'express';
import { TtsRequestDto } from './dto/tts.dto';
import { VoiceService } from './voice.service';
export declare class VoiceController {
    private readonly voiceService;
    constructor(voiceService: VoiceService);
    synthesize(data: TtsRequestDto, res: Response): Promise<void>;
}
