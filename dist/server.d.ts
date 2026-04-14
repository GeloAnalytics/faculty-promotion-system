import type { SessionUser } from './types';
declare global {
    namespace Express {
        interface Request {
            user?: SessionUser;
        }
    }
}
//# sourceMappingURL=server.d.ts.map