import type { DocumentAnalysisResult, DocumentExtractionResult, FeatureSelectionResult, FeatureVector, GuidelineReference, ModelComparisonResult, Recommendation, TqeBenchmarkMatch, TqeRecord, TqeReferenceSummary, UploadPanelKey } from './types';
export declare const extractDocumentInsights: (text: string) => DocumentExtractionResult;
export declare const analyzeDocumentContent: (text: string, panelKey: UploadPanelKey, source: DocumentAnalysisResult["source"]) => DocumentAnalysisResult;
export declare function inferBestUploadPanelKey(text: string, fallback?: UploadPanelKey): UploadPanelKey;
export declare const selectSignificantFeatures: (features: FeatureVector) => FeatureSelectionResult[];
export declare const compareModels: (features: FeatureVector) => ModelComparisonResult[];
export declare const generateRecommendations: (features: FeatureVector, selectedFeatures: FeatureSelectionResult[]) => Recommendation[];
export declare const inferPromotionOutcome: (features: FeatureVector) => boolean;
export declare const loadTqeReferenceData: (csvPath: string) => TqeRecord[];
export declare const summarizeTqeReferenceData: (records: TqeRecord[]) => TqeReferenceSummary;
export declare const findClosestTqeBenchmarks: (features: FeatureVector, records: TqeRecord[], limit?: number) => TqeBenchmarkMatch[];
export declare const extractGuidelineReference: (text: string, fileName: string) => GuidelineReference;
export declare const findGuidelinePdfPath: (rootDir: string) => string | null;
//# sourceMappingURL=utils.d.ts.map