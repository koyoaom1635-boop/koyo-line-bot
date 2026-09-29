export interface AppConfig {
    port: number;
    lineChannelSecret: string;
    lineChannelSecretFallback: string;
    lineChannelAccessToken: string;
    geminiApiKey: string;
    geminiModel: string;
    botSystemPrompt: string;
}
export declare const config: AppConfig;
export declare function validateConfig(): void;
