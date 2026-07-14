export type RequirementType = 'AND' | 'OR';

export interface RequirementRule {
  type: RequirementType;
  conditions: (RequirementRule | string)[]; // string is the document kind/keyword
}

// Rules are checked against keywords actually found in the uploaded document's
// text (see analyzeDocumentContent in utils.ts, which searches for every leaf
// string used here). Where the DBM-JC List of Documentary Evidences offers
// genuinely different evidence paths for the same criterion (e.g. a patent vs.
// a software copyright both satisfy "Inventions"), use OR so a valid
// alternative isn't rejected just because it doesn't match the first path.
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
    type: 'OR',
    conditions: [
      'approval sheet', // adviser/panel path
      { type: 'AND', conditions: ['appointment', 'mentor'] }, // mentor path
    ],
  },

  // KRA 2
  'kra2_research_outputs': {
    type: 'AND',
    conditions: ['research output', 'peer review']
  },
  'kra2_inventions': {
    type: 'OR',
    conditions: [
      'patent certificate',
      'utility model certificate',
      'industrial design certificate',
      'copyright certificate', // software
      'plant variety', // plant/animal breed or microbial strain
      'licensing agreement', // commercialized patented product
    ],
  },
  'kra2_creative_works': {
    type: 'OR',
    conditions: [
      { type: 'AND', conditions: ['creative work', 'copyright'] }, // performing art
      'letter of invitation', // exhibition
      'published literary work', // literary publications
      'peer-reviewed', // juried/peer-reviewed designs
    ],
  },

  // KRA 3
  'kra3_service_to_institution': {
    type: 'OR',
    conditions: [
      { type: 'AND', conditions: ['certification', 'approval'] }, // linkages/partnership
      { type: 'AND', conditions: ['certification', 'financial report'] }, // income generation
    ],
  },
  'kra3_service_to_community': {
    type: 'AND',
    conditions: ['certification', 'invitation']
  },
  'kra3_extension_involvement': {
    type: 'AND',
    conditions: ['certification', 'satisfaction rating']
  },
  'kra3_administrative_designation': {
    type: 'AND',
    conditions: ['appointment', 'accomplishment report'],
  },

  // KRA 4
  'kra4_professional_organizations': {
    type: 'AND',
    conditions: ['proof of membership', 'certification of engagement']
  },
  'kra4_continuing_development': {
    type: 'OR',
    conditions: [
      'transcript of records', // educational qualifications (diploma/CAV)
      { type: 'AND', conditions: ['certificate of participation', 'approval'] }, // conference/paper presentation
    ],
  },
  'kra4_awards_recognition': {
    type: 'OR',
    conditions: ['certificate of recognition', 'plaque'],
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
