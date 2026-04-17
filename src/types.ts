export const featureKeys = [
  'age',
  'yearsInService',
  'highestEducationalAttainmentLevel',
  'teachingEffectiveness',
  'researchOutputs',
  'extensionServices',
  'administrativeExperience',
  'professionalDevelopmentHours',
  'ipcrAverage',
  'promotionHistoryCount',
  'documentCompleteness',
  'documentQualityScore',
] as const;

export type FeatureKey = (typeof featureKeys)[number];
export type FeatureVector = Record<FeatureKey, number>;

export type AppUserRole = 'ADMIN' | 'EMPLOYEE' | 'EVALUATOR';
export type UploadDocumentKind = 'REQUIREMENT' | 'GUIDELINE' | 'TRAINING_SUPPORT';
export type TrainingStatus = 'DRAFT' | 'LABELED' | 'VALIDATED';
export type UploadPanelKey =
  | 'kra1_teaching_effectiveness'
  | 'kra1_curriculum_instructional_materials'
  | 'kra1_thesis_dissertation_mentorship'
  | 'kra2_research_outputs'
  | 'kra2_inventions'
  | 'kra2_creative_works'
  | 'kra3_service_to_institution'
  | 'kra3_service_to_community'
  | 'kra3_extension_involvement'
  | 'kra4_professional_organizations'
  | 'kra4_continuing_development'
  | 'kra4_awards_recognition'
  | 'kra4_academic_experience'
  | 'kra4_industry_experience';

export type UploadPanelAudience = 'ALL_FACULTY' | 'NEW_ENTRANTS_ONLY';

export interface PersonalData {
  employeeId?: string;
  fullName: string;
  age?: number;
  sex?: string;
  civilStatus?: string;
  academicRank?: string;
  yearsInService?: number;
  highestEducationalAttainment?: string;
  department?: string;
}

export interface PerformanceReview {
  reviewPeriod?: string;
  ipcrAverage?: number;
  teachingEffectiveness?: number;
  researchOutputs?: number;
  extensionServices?: number;
  administrativeExperience?: number;
  professionalDevelopmentHours?: number;
}

export interface PromotionHistoryEntry {
  cycle?: string;
  promoted: boolean;
  previousRank?: string;
  newRank?: string;
}

export interface DocumentExtractionResult {
  source: 'pdf' | 'manual';
  textLength: number;
  detectedFields: string[];
  completenessScore: number;
  qualityScore: number;
  extractedScores: Partial<FeatureVector>;
}

export interface DocumentAnalysisResult {
  source: 'pdf' | 'image' | 'csv' | 'manual';
  panelKey: UploadPanelKey;
  textLength: number;
  completenessScore: number;
  qualityScore: number;
  extractedScores: Partial<FeatureVector>;
  detectedFields: string[];
  detectedCategories: string[];
  keywordHits: string[];
  summary: string;
}

export interface FacultyIngestionPayload {
  personalData: PersonalData;
  performanceReview: PerformanceReview;
  promotionHistory: PromotionHistoryEntry[];
  documentExtraction?: DocumentExtractionResult;
  notes?: string;
}

export interface FeatureSelectionResult {
  feature: FeatureKey;
  importance: number;
  rationale: string;
}

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export type SupportedModel =
  | 'decision-tree'
  | 'random-forest'
  | 'adaboost'
  | 'gradient-boosting';

export interface ModelComparisonResult {
  model: SupportedModel;
  metrics: ModelMetrics;
  promotionProbability: number;
  predictedPromotion: boolean;
  keyFactors: string[];
}

export interface Recommendation {
  area: 'data-quality' | 'faculty-development' | 'policy' | 'review-process';
  recommendation: string;
  evidence: string;
}

export interface ThesisWorkflowResult {
  selectedFeatures: FeatureSelectionResult[];
  modelResults: ModelComparisonResult[];
  bestModel: ModelComparisonResult;
  recommendations: Recommendation[];
}

export interface TqeRecord {
  teacherId: string;
  courseId: string;
  semester: string;
  teachingEffectiveness: number;
  curriculumDevelopment: number;
  thesisMentorship: number;
  researchOutputs: number;
  inventions: number;
  creativeWorks: number;
  serviceInstitution: number;
  serviceCommunity: number;
  extensionInvolvement: number;
  professionalDevelopment: number;
  teachingQuality: string;
}

export interface NumericSummary {
  min: number;
  max: number;
  average: number;
}

export interface TqeReferenceSummary {
  rowCount: number;
  teachingQualityDistribution: Record<string, number>;
  numericSummaries: Record<string, NumericSummary>;
}

export interface TqeBenchmarkMatch {
  teacherId: string;
  courseId: string;
  semester: string;
  teachingQuality: string;
  distance: number;
}

export interface GuidelineReference {
  fileName: string;
  extractedTextLength: number;
  criteriaMentions: string[];
  textPreview: string;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: AppUserRole;
}

export interface AuthResponse {
  user: SessionUser;
}

export interface TrainingExampleSubmission {
  profileId?: string;
  datasetSplit?: string;
  labelPromoted?: boolean;
  labelSource?: string;
  notes?: string;
  rawInput: FacultyIngestionPayload;
  featureSnapshot: FeatureVector;
  modelSnapshot?: ThesisWorkflowResult;
}

export interface UploadPanelDefinition {
  key: UploadPanelKey;
  kraTitle: string;
  title: string;
  description: string;
  acceptedFormats: string[];
  maxScore: number;
  appliesTo: UploadPanelAudience;
  audienceLabel?: string;
  sharedCapKey?: string;
  sharedCapLabel?: string;
  sharedCapMaxScore?: number;
}
