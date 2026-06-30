export type RequirementType = 'AND' | 'OR';

export interface RequirementRule {
  type: RequirementType;
  conditions: (RequirementRule | string)[]; // string is the document kind/keyword
}

export const evidenceRules: Record<string, RequirementRule> = {
  // KRA 1
  'kra1_teaching_effectiveness': {
    type: 'AND',
    conditions: ['student evaluation', 'supervisor evaluation']
  },
  'kra1_curriculum_instructional_materials': {
    type: 'AND',
    conditions: ['instructional material', 'approval']
  },
  'kra1_thesis_dissertation_mentorship': {
    type: 'AND',
    conditions: ['approval sheet']
  },

  // KRA 2
  'kra2_research_outputs': {
    type: 'AND',
    conditions: ['research output', 'peer review']
  },
  'kra2_inventions': {
    type: 'AND',
    conditions: ['patent certificate']
  },
  'kra2_creative_works': {
    type: 'AND',
    conditions: ['creative work', 'copyright']
  },

  // KRA 3
  'kra3_service_to_institution': {
    type: 'AND',
    conditions: ['certification', 'approval']
  },
  'kra3_service_to_community': {
    type: 'AND',
    conditions: ['certification', 'invitation']
  },
  'kra3_extension_involvement': {
    type: 'AND',
    conditions: ['certification', 'satisfaction rating']
  },

  // KRA 4
  'kra4_professional_organizations': {
    type: 'AND',
    conditions: ['proof of membership', 'certification of engagement']
  },
  'kra4_continuing_development': {
    type: 'AND',
    conditions: ['certificate of participation', 'approval']
  },
  'kra4_awards_recognition': {
    type: 'AND',
    conditions: ['certificate of recognition']
  },
  'kra4_academic_experience': {
    type: 'AND',
    conditions: ['evidence of employment', 'job description']
  },
  'kra4_industry_experience': {
    type: 'AND',
    conditions: ['evidence of employment', 'job description']
  }
};
