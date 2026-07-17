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
  missingPacketItems: string[];
  missingRequestFields: string[];
  requiredPanelKeys: UploadPanelKey[];
  missingPanelKeys: UploadPanelKey[];
  missingPanelTitles: string[];
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
  const missingEvidencePanels = hasPerPanelUploadCounts
    ? requiredPanels.filter((panel) => (args.panelUploadCounts?.[panel.key]?.evidence ?? 0) < 1)
    : [];
  const missingPanelKeys = hasPerPanelUploadCounts
    ? missingEvidencePanels.map((panel) => panel.key)
    : requiredPanels.filter((panel) => !uploadedPanelSet.has(panel.key)).map((panel) => panel.key);
  const missingPanelTitles = hasPerPanelUploadCounts
    ? missingEvidencePanels.map((panel) => panel.title)
    : requiredPanels.filter((panel) => !uploadedPanelSet.has(panel.key)).map((panel) => panel.title);

  const requestFields: Array<{ label: string; value: string | null }> = [
    { label: 'full name', value: args.requestForm.fullName },
    { label: 'faculty ID', value: args.requestForm.employeeId },
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

  const evidenceCount = Number(args.uploadTypeCounts['evidence'] ?? 0);
  const missingPacketItems: string[] = [];

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
      issues.push(`Missing documentary evidence panel(s): ${missingPanelTitles.join(', ')}.`);
    } else {
      issues.push(`Missing required evidence panel(s): ${missingPanelTitles.join(', ')}.`);
    }
  }

  return {
    status: issues.length ? 'incomplete' : 'complete',
    missingPacketItems,
    missingRequestFields,
    requiredPanelKeys,
    missingPanelKeys,
    missingPanelTitles,
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

// Fraction (0-1) of a panel's documentary-evidence checklist that the
// detected keywords satisfy. Used to give partial credit when a panel's
// evidence is uploaded but OCR could not read an explicit score off the
// document itself - a leaf string is a single checklist item, `AND` needs
// every item, `OR` only needs its best-matching alternative.
function ruleMatchFraction(rule: RequirementRule | string, detectedKeywords: string[]): number {
  if (typeof rule === 'string') {
    return detectedKeywords.some((kw) => kw.toLowerCase().includes(rule.toLowerCase())) ? 1 : 0;
  }

  if (rule.type === 'AND') {
    if (!rule.conditions.length) return 1;
    const total = rule.conditions.reduce((sum, condition) => sum + ruleMatchFraction(condition, detectedKeywords), 0);
    return total / rule.conditions.length;
  }

  if (rule.type === 'OR') {
    if (!rule.conditions.length) return 0;
    return Math.max(...rule.conditions.map((condition) => ruleMatchFraction(condition, detectedKeywords)));
  }

  return 0;
}

export function getEvidenceChecklistCompleteness(panelKey: string, detectedKeywords: string[]): number {
  const rule = evidenceRules[panelKey];
  if (!rule) {
    // No documented checklist for this panel - presence of any evidence is
    // the only signal available, so treat it as fully satisfied.
    return detectedKeywords.length > 0 ? 1 : 0;
  }
  return ruleMatchFraction(rule, detectedKeywords);
}
