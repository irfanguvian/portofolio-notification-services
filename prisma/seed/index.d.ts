export declare const SEED_USERS: readonly [{
    readonly id: "00000000-0000-0000-0000-000000000001";
    readonly email: "alice@seed.local";
    readonly password: "Passw0rd!";
}, {
    readonly id: "00000000-0000-0000-0000-000000000002";
    readonly email: "bob@seed.local";
    readonly password: "Passw0rd!";
}, {
    readonly id: "00000000-0000-0000-0000-000000000003";
    readonly email: "carol@seed.local";
    readonly password: "Passw0rd!";
}];
export type SeedUser = (typeof SEED_USERS)[number];
export declare const SEED_SYMBOLS: readonly ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA"];
export type SeedSymbol = (typeof SEED_SYMBOLS)[number];
export declare const SEED_TX_PER_USER = 5;
export declare const SEED_NAMESPACE = "5b8fbc4a-79ad-4c2b-9c6f-2f8d8e8a0001";
