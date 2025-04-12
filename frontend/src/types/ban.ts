export interface BanEntry {
    originalLine: string;
    bannedEosId: string;
    expirationTimestamp: number;
    adminNickname?: string;
    adminSteamId?: string;
    comment?: string;
} 