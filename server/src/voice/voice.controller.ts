import { Body, Controller, Header, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TtsRequestDto } from './dto/tts.dto';
import { VoiceService } from './voice.service';

@ApiTags('Voice')
@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('tts')
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiOperation({
    summary: 'Generate Lao TTS audio',
    description: 'Uses the configured Hugging Face TTS model. Default model: facebook/mms-tts-lao.',
  })
  @ApiResponse({ status: 201, description: 'Audio file bytes.' })
  async synthesize(@Body() data: TtsRequestDto, @Res() res: Response) {
    const result = await this.voiceService.synthesize(data.text);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('X-TTS-Cache-Key', result.cacheKey);
    res.setHeader('X-TTS-Cached', String(result.cached));
    res.send(result.audio);
  }
}
