"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const pdfParse = __importStar(require("pdf-parse"));
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const upload = (0, multer_1.default)({ dest: 'uploads/' });
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// TODO.md Step 4: PDF upload endpoint
app.post('/api/pdf-upload', upload.single('pdf'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'No PDF uploaded' });
    try {
        const dataBuffer = req.file.buffer;
        const data = await pdfParse(dataBuffer);
        const text = data.text;
        // TODO: Parse text for features (teaching, research scores etc. - regex/mock)
        const features = extractFeatures(text); // Implement parse logic
        // Save profile
        const profile = await prisma.facultyProfile.create({
            data: { name: 'Parsed Faculty', features }
        });
        res.json({ text, profileId: profile.id, features });
    }
    catch (error) {
        res.status(500).json({ error: 'PDF parse failed' });
    }
});
// Prediction endpoint (mock logistic ported from Python)
const predictPromotion = (features) => {
    // Mock coefficients from Python model (teaching, research etc.)
    // TODO: Train/export real from notebook
    const coeffs = [0.5, 0.3, 0.2 /* etc for features */]; // Placeholder
    let logit = 0;
    Object.values(features).forEach((val, i) => {
        logit += coeffs[i] * val;
    });
    const prob = 1 / (1 + Math.exp(-logit));
    return { probability: prob, predicted: prob > 0.5 };
};
app.post('/api/predict', async (req, res) => {
    const schema = zod_1.z.object({
        features: zod_1.z.record(zod_1.z.number())
    });
    const { features } = schema.parse(req.body);
    const { probability, predicted } = predictPromotion(features);
    const profileId = req.body.profileId;
    await prisma.prediction.create({
        data: {
            profileId,
            probability,
            predictedClass: predicted,
            modelUsed: 'logistic-mock'
        }
    });
    res.json({ probability, predicted });
});
// Get dashboard data
app.get('/api/dashboard/:profileId', async (req, res) => {
    const profile = await prisma.facultyProfile.findUnique({
        where: { id: req.params.profileId },
        include: { predictions: true }
    });
    res.json(profile);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
//# sourceMappingURL=server.js.map