interface TtsAudioResult {
    audio: Buffer;
    contentType: string;
    cacheKey: string;
    cached: boolean;
}
export declare class VoiceService {
    private readonly cacheDir;
    private readonly model;
    private readonly language;
    private readonly serviceUrl;
    private readonly serviceModel;
    private getCacheKey;
    private getAudioPath;
    private getMetadataPath;
    synthesize(text: string): Promise<TtsAudioResult>;
    private synthesizeWithLocalService;
    private synthesizeWithHuggingFace;
}
export {};
