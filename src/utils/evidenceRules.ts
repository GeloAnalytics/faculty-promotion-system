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
    conditions: [
      { type: 'OR', conditions: ['student evaluation', 'set', 'fedaf'] },
      { type: 'OR', conditions: ['supervisor evaluation', 'sef', 'fedaf'] },
      { type: 'OR', conditions: ['transmutation', 'nbc 461', 'faculty evaluation and development acknowledgement form'] },
    ],
  },
  'kra1_curriculum_instructional_materials': {
    type: 'OR',
    conditions: [
      {
        type: 'AND',
        conditions: ['textbook', 'evaluation', 'approval for use', 'syllabus', 'library holdings'],
      },
      {
        type: 'AND',
        conditions: ['module', 'evaluation', 'approval for use', 'syllabus', 'library holdings'],
      },
      {
        type: 'AND',
        conditions: ['instructional manual', 'evaluation', 'approval for use', 'syllabus', 'library holdings'],
      },
      {
        type: 'AND',
        conditions: ['multimedia teaching material', 'originality', 'pedagogical', 'approval for use'],
      },
      {
        type: 'AND',
        conditions: ['academic degree program', 'dean', 'academic council', 'governing board'],
      },
      'certificate of contribution form_im',
    ],
  },
  'kra1_thesis_dissertation_mentorship': {
    type: 'OR',
    conditions: [
      { type: 'AND', conditions: ['approval sheet', 'rrpa'] },
      { type: 'AND', conditions: ['approval sheet', 'copc'] },
      { type: 'AND', conditions: ['designation', 'mentor', 'award', 'competition'] },
      { type: 'AND', conditions: ['designation', 'coach', 'award', 'competition'] },
    ],
  },

  // KRA 2
  'kra2_research_outputs': {
    type: 'OR',
    conditions: [
      { type: 'AND', conditions: ['academic book', 'publisher', 'peer-review'] },
      { type: 'AND', conditions: ['book chapter', 'editorial process'] },
      { type: 'AND', conditions: ['journal article', 'scopus'] },
      { type: 'AND', conditions: ['journal article', 'web of science'] },
      { type: 'AND', conditions: ['journal article', 'asean citation index'] },
      { type: 'AND', conditions: ['monograph', 'publisher', 'peer-review'] },
      { type: 'AND', conditions: ['completed research output', 'project', 'moa'] },
      { type: 'AND', conditions: ['completed research output', 'policy', 'approved policy'] },
      { type: 'AND', conditions: ['completed research output', 'product', 'license agreement'] },
      { type: 'AND', conditions: ['cited research article', 'citing article', 'research director'] },
      'certificate of contribution form_research output',
      'certificate of contribution form_translated research',
    ],
  },
  'kra2_inventions': {
    type: 'OR',
    conditions: [
      { type: 'AND', conditions: ['photo of the invention', 'special order', 'formality examination report'] },
      { type: 'AND', conditions: ['photo of the invention', 'special order', 'substantive examination report'] },
      { type: 'AND', conditions: ['photo of the invention', 'special order', 'patent certificate'] },
      { type: 'AND', conditions: ['patented product', 'patent certificate', 'proof of commercialization'] },
      { type: 'AND', conditions: ['utility model', 'certificate of registration'] },
      { type: 'AND', conditions: ['industrial design', 'certificate of registration'] },
      { type: 'AND', conditions: ['software product', 'copyright certificate', 'end-user'] },
      { type: 'AND', conditions: ['plant variety', 'certificate', 'propagated'] },
      { type: 'AND', conditions: ['animal breed', 'certification of breed'] },
      { type: 'AND', conditions: ['microbial strain', 'certificate of deposit'] },
      'certificate of contribution form_intellectual property',
      'certificate of contribution form_software',
    ],
  },
  'kra2_creative_works': {
    type: 'OR',
    conditions: [
      { type: 'AND', conditions: ['musical score', 'performance'] },
      { type: 'AND', conditions: ['choreography', 'performance'] },
      { type: 'AND', conditions: ['script', 'production'] },
      { type: 'AND', conditions: ['design portfolio', 'exhibition'] },
      { type: 'AND', conditions: ['film', 'festival'] },
      { type: 'AND', conditions: ['creative work', 'copyright'] },
      { type: 'AND', conditions: ['invitation', 'program', 'certification'] },
      { type: 'AND', conditions: ['exhibition catalog', 'curator'] },
      { type: 'AND', conditions: ['published', 'editorial review'] },
      'certificate of contribution form_creative works',
    ],
  },

  // KRA 3
  'kra3_service_to_institution': {
    type: 'OR',
    conditions: [
      { type: 'AND', conditions: ['approval document', 'moa', 'implementation report'] },
      { type: 'AND', conditions: ['approval document', 'mou', 'terminal report'] },
      { type: 'AND', conditions: ['financial report', 'finance', 'income generation'] },
      { type: 'AND', conditions: ['sub-aro', 'finance', 'grant'] },
    ],
  },
  'kra3_service_to_community': {
    type: 'OR',
    conditions: [
      { type: 'AND', conditions: ['appointment', 'accreditor', 'authorization'] },
      { type: 'AND', conditions: ['invitation', 'judge', 'authorization'] },
      { type: 'AND', conditions: ['contract', 'consultant', 'authorization'] },
      { type: 'AND', conditions: ['invitation', 'resource person', 'program'] },
      { type: 'AND', conditions: ['media', 'guesting'] },
      { type: 'AND', conditions: ['special order', 'extension project', 'terminal report'] },
    ],
  },
  'kra3_extension_involvement': {
    type: 'OR',
    conditions: [
      { type: 'AND', conditions: ['client satisfaction rating', 'extension'] },
      { type: 'AND', conditions: ['extension project css report', 'cmo no. 18'] },
    ],
  },
  'kra3_administrative_designation': {
    type: 'AND',
    conditions: [
      { type: 'OR', conditions: ['appointment', 'designation'] },
      'effectivity period',
      { type: 'OR', conditions: ['accomplishment report', 'annual report'] },
    ],
  },

  // KRA 4
  'kra4_professional_organizations': {
    type: 'AND',
    conditions: [
      { type: 'OR', conditions: ['certificate of membership', 'membership id'] },
      { type: 'OR', conditions: ['organizational profile', 'sec registration', 'website'] },
      { type: 'OR', conditions: ['active participation', 'role'] },
      { type: 'OR', conditions: ['certification from the head', 'organization head'] },
    ],
  },
  'kra4_continuing_development': {
    type: 'OR',
    conditions: [
      { type: 'AND', conditions: ['transcript of records', 'cav'] },
      { type: 'AND', conditions: ['diploma', 'ched'] },
      { type: 'AND', conditions: ['diploma', 'scholarship contract'] },
      { type: 'AND', conditions: ['program', 'certificate of participation', 'approval to attend'] },
      { type: 'AND', conditions: ['acceptance letter', 'paper presenter', 'research director'] },
    ],
  },
  'kra4_awards_recognition': {
    type: 'AND',
    conditions: [
      { type: 'OR', conditions: ['certificate of recognition', 'certificate of award', 'plaque', 'trophy', 'medal'] },
      { type: 'OR', conditions: ['criteria and mechanics', 'praise guidelines'] },
      { type: 'OR', conditions: ['selection process', 'award-giving organization'] },
    ],
  },
  'kra4_academic_experience': {
    type: 'AND',
    conditions: [
      { type: 'OR', conditions: ['service record', 'certificate of employment', 'notice of appointment', 'notice of designation'] },
      'job description',
    ],
  },
  'kra4_industry_experience': {
    type: 'AND',
    conditions: [
      { type: 'OR', conditions: ['service record', 'certificate of employment', 'notice of appointment', 'notice of designation'] },
      'job description',
    ],
  }
};
