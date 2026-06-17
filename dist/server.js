"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const node_path_1 = __importDefault(require("node:path"));
const env_1 = require("./config/env");
const auth_middleware_1 = require("./middlewares/auth.middleware");
const error_middleware_1 = require("./middlewares/error.middleware");
const index_1 = __importDefault(require("./routes/index"));
const db_1 = require("./config/db");
const app = (0, express_1.default)();
const repoRoot = process.cwd();
const publicDir = node_path_1.default.join(repoRoot, 'public');
app.disable('x-powered-by');
app.set('trust proxy', env_1.env.TRUST_PROXY);
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env_1.isProduction) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});
app.use((0, cors_1.default)({
    origin: env_1.env.CORS_ORIGIN.split(',').map((value) => value.trim()),
    credentials: true,
}));
app.use(express_1.default.json({ limit: '2mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '2mb' }));
app.use(auth_middleware_1.attachSessionUser);
// Temporary routes for the old vanilla JS frontend
app.get('/employee', (_req, res) => {
    res.sendFile(node_path_1.default.join(publicDir, 'employee.html'));
});
app.get('/evaluator', (_req, res) => {
    res.sendFile(node_path_1.default.join(publicDir, 'evaluator.html'));
});
app.use(express_1.default.static(publicDir, { extensions: ['html'], maxAge: 0 }));
// Mount API routes
app.use('/api', index_1.default);
// Global Error Handler
app.use(error_middleware_1.errorHandler);
const server = app.listen(env_1.env.PORT, () => {
    console.log(`Faculty promotion system listening on port ${env_1.env.PORT} in ${env_1.env.NODE_ENV} mode`);
});
async function shutdown(signal) {
    console.log(`Received ${signal}. Closing server...`);
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