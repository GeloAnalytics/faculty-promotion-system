"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./config/env");
const app_1 = __importDefault(require("./app"));
const db_1 = require("./config/db");
const supabase_1 = require("./config/supabase");
let server;
async function bootstrap() {
    try {
        await (0, supabase_1.ensureDocumentsBucket)();
    }
    catch (error) {
        console.error('Failed to ensure Supabase documents bucket exists:', error);
    }
    server = app_1.default.listen(env_1.env.PORT, () => {
        console.log(`Faculty promotion system listening on port ${env_1.env.PORT} in ${env_1.env.NODE_ENV} mode`);
    });
}
void bootstrap();
async function shutdown(signal) {
    console.log(`Received ${signal}. Closing server...`);
    if (!server) {
        await db_1.prisma.$disconnect();
        process.exit(0);
        return;
    }
    server.close(async () => {
        await db_1.prisma.$disconnect();
        process.exit(0);
    });
}
process.on('SIGINT', () => {
    void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
});
//# sourceMappingURL=server.js.map