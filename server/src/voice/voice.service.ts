import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

interface TtsAudioResult {
  audio: Buffer;
  contentType: string;
  cacheKey: string;
  cached: boolean;
}

interface TtsMetadata {
  cacheKey: string;
  provider: 'local-service' | 'huggingface';
  model: string;
  language: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  textHash: string;
}

const normalizeText = (text: string) => text.trim().replace(/\s+/g, ' ');

@Injectable()
export class VoiceService {
  private readonly cacheDir = resolve(process.cwd(), process.env.TTS_CACHE_DIR || 'storage/tts-cache');
  private readonly model = process.env.TTS_MODEL || 'facebook/mms-tts-lao';
  private readonly language = process.env.TTS_LANGUAGE || 'lo';
  private readonly serviceUrl = process.env.TTS_SERVICE_URL || '';
  private readonly serviceModel = process.env.TTS_SERVICE_MODEL || 'facebook';

  private getCacheKey(text: string) {
    const payload = {
      provider: this.serviceUrl ? 'local-service' : 'huggingface',
      serviceUrl: this.serviceUrl,
      text: normalizeText(text),
      language: this.language,
      model: this.serviceUrl ? this.serviceModel : this.model,
      format: 'model-default-audio',
    };

    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private getAudioPath(cacheKey: string) {
    return resolve(this.cacheDir, `${cacheKey}.wav`);
  }

  private getMetadataPath(cacheKey: string) {
    return resolve(this.cacheDir, `${cacheKey}.json`);
  }

  async synthesize(text: string): Promise<TtsAudioResult> {
    const cleanText = normalizeText(String(text || ''));
    if (!cleanText) {
      throw new BadRequestException('Text is required');
    }

    await mkdir(this.cacheDir, { recursive: true });

    const cacheKey = this.getCacheKey(cleanText);
    const audioPath = this.getAudioPath(cacheKey);

    if (existsSync(audioPath)) {
      return {
        audio: await readFile(audioPath),
        contentType: 'audio/wav',
        cacheKey,
        cached: true,
      };
    }

    const synthesized = this.serviceUrl
      ? await this.synthesizeWithLocalService(cleanText)
      : await this.synthesizeWithHuggingFace(cleanText);

    await writeFile(audioPath, synthesized.audio);

    const metadata: TtsMetadata = {
      cacheKey,
      provider: this.serviceUrl ? 'local-service' : 'huggingface',
      model: this.serviceUrl ? this.serviceModel : this.model,
      language: this.language,
      contentType: synthesized.contentType,
      sizeBytes: synthesized.audio.length,
      createdAt: new Date().toISOString(),
      textHash: createHash('sha256').update(cleanText).digest('hex'),
    };

    await writeFile(this.getMetadataPath(cacheKey), JSON.stringify(metadata, null, 2));

    return {
      audio: synthesized.audio,
      contentType: synthesized.contentType,
      cacheKey,
      cached: false,
    };
  }

  private async synthesizeWithLocalService(cleanText: string): Promise<{ audio: Buffer; contentType: string }> {
    let response: Response;
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(`Local Lao TTS service request failed: ${message}`);
    }

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new ServiceUnavailableException(`Local Lao TTS service error: ${message}`);
    }

    const contentType = response.headers.get('content-type') || 'audio/wav';
    const audio = Buffer.from(await response.arrayBuffer());
    if (contentType.includes('application/json')) {
      throw new ServiceUnavailableException(`Local Lao TTS service returned JSON instead of audio: ${audio.toString('utf8')}`);
    }

    return { audio, contentType };
  }

  private async synthesizeWithHuggingFace(cleanText: string): Promise<{ audio: Buffer; contentType: string }> {
    const headers: Record<string, string> = {
      Accept: 'audio/wav',
      'Content-Type': 'application/json',
    };
    const token = process.env.HUGGINGFACE_API_TOKEN || process.env.HF_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(`TTS model request failed: ${message}`);
    }

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new ServiceUnavailableException(`TTS model error: ${message}`);
    }

    const contentType = response.headers.get('content-type') || 'audio/wav';
    const audio = Buffer.from(await response.arrayBuffer());
    if (contentType.includes('application/json')) {
      throw new ServiceUnavailableException(`TTS model returned JSON instead of audio: ${audio.toString('utf8')}`);
    }

    return { audio, contentType };
  }
}
