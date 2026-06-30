import { uploadPanels } from '../uploadPanels';
import type { UploadPanelKey } from '../types';
import { evidenceRules, RequirementRule } from './evidenceRules';

export type EvidencePacketRequestForm = {
  fullName: string | null;
  employeeId: string | null;
  academicRank: string | null;
  highestEducationalAttainment: string | null;
  reviewPeriod: string | null;
  department: string | null;
};

export type EvidenceValidationSummary = {
  status: 'complete' | 'incomplete';
  hasScoreSheet: boolean;
  missingPacketItems: string[];
  missingRequestFields: string[];
  requiredPanelKeys: UploadPanelKey[];
  missingPanelKeys: UploadPanelKey[];
  missingPanelTitles: string[];
  missingScoreSheetPanelKeys: UploadPanelKey[];
  missingScoreSheetPanelTitles: string[];
  missingEvidencePanelKeys: UploadPanelKey[];
  missingEvidencePanelTitles: string[];
  note: string;
};

export function validateEvidencePacket(args: {
  requestForm: EvidencePacketRequestForm;
  uploadedPanelKeys: Iterable<UploadPanelKey>;
  uploadTypeCounts: Record<string, number>;
  panelUploadCounts?: Partial<Record<UploadPanelKey, { scoreSheet: number; evidence: number }>>;
}): EvidenceValidationSummary {
  const uploadedPanelSet = new Set(args.uploadedPanelKeys);
  const requiredPanels = uploadPanels.filter((panel) => panel.appliesTo === 'ALL_FACULTY');
  const requiredPanelKeys = requiredPanels.map((panel) => panel.key);
  const hasPerPanelUploadCounts = Boolean(args.panelUploadCounts);
  const missingScoreSheetPanels = hasPerPanelUploadCounts
    ? requiredPanels.filter((panel) => (args.panelUploadCounts?.[panel.key]?.scoreSheet ?? 0) < 1)
    : [];
  const missingEvidencePanels = hasPerPanelUploadCounts
    ? requiredPanels.filter((panel) => (args.panelUploadCounts?.[panel.key]?.evidence ?? 0) < 1)
    : [];
  const missingPanelKeys = hasPerPanelUploadCounts
    ? Array.from(new Set([...missingScoreSheetPanels, ...missingEvidencePanels].map((panel) => panel.key)))
    : requiredPanels.filter((panel) => !uploadedPanelSet.has(panel.key)).map((panel) => panel.key);
  const missingPanelTitles = hasPerPanelUploadCounts
    ? Array.from(new Set([...missingScoreSheetPanels, ...missingEvidencePanels].map((panel) => panel.title)))
    : requiredPanels.filter((panel) => !uploadedPanelSet.has(panel.key)).map((panel) => panel.title);

  const requestFields: Array<{ label: string; value: string | null }> = [
    { label: 'full name', value: args.requestForm.fullName },
    { label: 'employee ID', value: args.requestForm.employeeId },
    { label: 'current academic rank', value: args.requestForm.academicRank },
    { label: 'highest educational attainment', value: args.requestForm.highestEducationalAttainment },
    { label: 'review period', value: args.requestForm.reviewPeriod },
  ];

  const missingRequestFields = requestFields.reduce<string[]>((fields, field) => {
    if (!hasText(field.value)) {
      fields.push(field.label);
    }
    return fields;
  }, []);

  const scoreSheetCount = Number(args.uploadTypeCounts['score-sheet'] ?? 0);
  const evidenceCount = Number(args.uploadTypeCounts['evidence'] ?? 0);
  const missingPacketItems: string[] = [];

  if (scoreSheetCount < 1) {
    missingPacketItems.push('score sheet');
  }

  if (evidenceCount < 1) {
    missingPacketItems.push('evidence documents');
  }

  const issues: string[] = [];
  if (missingPacketItems.length) {
    issues.push(`Missing packet item(s): ${missingPacketItems.join(', ')}.`);
  }
  if (missingRequestFields.length) {
    issues.push(`Missing request form field(s): ${missingRequestFields.join(', ')}.`);
  }
  if (missingPanelTitles.length) {
    if (hasPerPanelUploadCounts) {
      if (missingScoreSheetPanels.length) {
        issues.push(`Missing score sheet panel(s): ${missingScoreSheetPanels.map((panel) => panel.title).join(', ')}.`);
      }
      if (missingEvidencePanels.length) {
        issues.push(`Missing documentary evidence panel(s): ${missingEvidencePanels.map((panel) => panel.title).join(', ')}.`);
      }
    } else {
      issues.push(`Missing required evidence panel(s): ${missingPanelTitles.join(', ')}.`);
    }
  }

  return {
    status: issues.length ? 'incomplete' : 'complete',
    hasScoreSheet: scoreSheetCount > 0,
    missingPacketItems,
    missingRequestFields,
    requiredPanelKeys,
    missingPanelKeys,
    missingPanelTitles,
    missingScoreSheetPanelKeys: missingScoreSheetPanels.map((panel) => panel.key),
    missingScoreSheetPanelTitles: missingScoreSheetPanels.map((panel) => panel.title),
    missingEvidencePanelKeys: missingEvidencePanels.map((panel) => panel.key),
    missingEvidencePanelTitles: missingEvidencePanels.map((panel) => panel.title),
    note: issues.length
      ? `Incomplete promotion packet. ${issues.join(' ')}`
      : 'Promotion packet evidence is complete for the current workbook validation pass.',
  };
}

function hasText(value: string | null) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function evaluateEvidenceRule(rule: RequirementRule | string, detectedKeywords: string[]): boolean {
  if (typeof rule === 'string') {
    return detectedKeywords.some(kw => kw.toLowerCase().includes(rule.toLowerCase()));
  }

  if (rule.type === 'AND') {
    return rule.conditions.every(cond => evaluateEvidenceRule(cond, detectedKeywords));
  }

  if (rule.type === 'OR') {
    return rule.conditions.some(cond => evaluateEvidenceRule(cond, detectedKeywords));
  }

  return false;
}

export function validatePanelEvidence(panelKey: string, detectedKeywords: string[]): boolean {
  const rule = evidenceRules[panelKey];
  if (!rule) {
    // If no specific strict rule is defined, default to requiring at least one evidence document
    return detectedKeywords.length > 0;
  }
  return evaluateEvidenceRule(rule, detectedKeywords);
}
