import type { Rng } from './rng';
import { pickSignatory } from './names';

export interface DocContext {
  name: string;
  last: string;
  sexSalutation: string;
  rank: string;
  department: string;
  rng: Rng;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Documents must fall inside the Aug 2023 - Jul 2026 promotion window.
export function randomWindowDate(rng: Rng) {
  const monthIndex = rng.int(0, 35);
  const absolute = 7 + monthIndex; // 0 = Jan 2023, so 7 = Aug 2023
  const year = 2023 + Math.floor(absolute / 12);
  const month = absolute % 12;
  return `${MONTHS[month]} ${rng.int(1, 28)}, ${year}`;
}

const TOPICS = [
  'a mobile-assisted learning system for senior high school mathematics',
  'smart irrigation scheduling for lowland rice farms',
  'community-based solid waste segregation in coastal barangays',
  'learning analytics dashboard for blended instruction',
  'tilapia growth performance under biofloc culture',
  'financial literacy among micro-entrepreneurs in Laguna',
  'low-cost sensor network for greenhouse monitoring',
  'teacher readiness for outcomes-based education',
  'nutrition intervention for school-age children',
  'tourism recovery strategies of lakeshore municipalities',
  'automated enrollment and records management system',
  'indigenous vegetable value chain development',
];
const JOURNALS = ['International Journal of Education and Development Studies', 'Asian Journal of Applied Sciences', 'Philippine Journal of Technology and Society', 'Journal of Agricultural Innovation and Policy', 'International Journal of Information and Learning Technology'];
const ORGS = ['Philippine Association of Educators in Technology', 'Society of Fisheries Scientists of the Philippines', 'Computing Professionals Network of the Philippines', 'Philippine Society of Agricultural Extension Workers', 'National Association of Business Educators'];
const CONFERENCES = ['National Research Conference on Innovation', 'Regional Convention on Teaching and Learning', 'International Conference on Applied Sciences', 'National Convention of Information Technology Educators', 'Southern Luzon Extension Summit'];
const AWARDS = ['Outstanding Faculty Researcher', 'Best Paper Award', 'Excellence in Extension Service Award', 'Outstanding Instructor Recognition', 'Gawad Parangal for Public Service'];

function cap(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// One sentence per rule keyword, each containing that keyword verbatim so the
// scorer's literal substring checks are exercised exactly as on real text.
function keywordLine(keyword: string, c: DocContext, topic: string): string {
  const { rng } = c;
  const date = randomWindowDate(rng);
  const year = date.split(', ')[1];
  const lines: Record<string, string> = {
    textbook: `Textbook: "${cap(topic)}" prepared by ${c.name} for use in ${c.department}.`,
    module: `Module: Instructional module on ${topic}, authored by ${c.name}.`,
    'instructional manual': `Instructional manual covering ${topic}, ${rng.int(60, 180)} pages.`,
    'multimedia teaching material': `Multimedia teaching material on ${topic} (video lessons and interactive slides).`,
    'academic degree program': `Proposal for a new academic degree program in ${c.department}.`,
    evaluation: `Evaluation of the material by the review panel: rated ${rng.pick(['Very Satisfactory', 'Outstanding'])} on ${date}.`,
    'approval for use': `Approval for use in classroom instruction granted effective ${date}.`,
    syllabus: 'Syllabus and course guide revised to align with the material.',
    'library holdings': `Library holdings: ${rng.int(2, 6)} copies are catalogued in the University Library.`,
    originality: `Originality check completed with similarity index of ${rng.int(3, 12)} percent.`,
    pedagogical: 'Pedagogical soundness was verified by the curriculum committee.',
    dean: `Endorsed by the Dean of the ${c.department}.`,
    'academic council': 'Recommended for approval by the Academic Council.',
    'governing board': `Approved by the Governing Board per Board Resolution No. ${rng.int(10, 99)}, s. 2025.`,
    'approval sheet': `APPROVAL SHEET. The thesis "${cap(topic)}" is hereby approved by the panel. Date of approval: ${date}.`,
    rrpa: 'Research Review and Plagiarism Assessment (RRPA) cleared.',
    copc: 'Complied with the COPC requirements for graduate research.',
    designation: `Designation as ${rng.pick(['coach', 'mentor'])} issued by the Office of the Dean.`,
    mentor: 'Faculty mentor of the student team in the regional skills competition.',
    coach: 'Faculty coach of the university delegation.',
    award: 'The team received an award at the event.',
    competition: 'Competition mechanics and scoring guide attached.',
    'academic book': `Academic book on ${topic}, ${rng.int(180, 420)} pages.`,
    publisher: `Published by ${rng.pick(['Rex Education Press', 'Anvil Academic Publishing', 'Central Book Supply'])}, the publisher of record.`,
    'peer-review': 'The manuscript underwent double-blind peer-review.',
    'book chapter': `Book chapter entitled "${cap(topic)}" in an edited volume.`,
    'editorial process': 'Subjected to the editorial process of the volume editors.',
    'journal article': `Journal article "${cap(topic)}", ${rng.pick(JOURNALS)}, Vol. ${rng.int(5, 20)}, No. ${rng.int(1, 4)}, ${year}.`,
    scopus: 'The journal is indexed in Scopus.',
    'web of science': 'The journal is indexed in Web of Science.',
    'asean citation index': 'The journal is listed in the ASEAN Citation Index.',
    monograph: `Monograph on ${topic}, with ISBN.`,
    'completed research output': `Completed research output: ${cap(topic)}.`,
    project: 'The project was completed and turned over to the partner agency.',
    moa: `Memorandum of Agreement (MOA) signed on ${date}.`,
    policy: 'Resulting policy brief submitted to the local government unit.',
    'approved policy': `Approved policy issued as Ordinance No. ${rng.int(100, 999)}.`,
    product: 'The research yielded a marketable product prototype.',
    'license agreement': 'License agreement executed with an industry partner.',
    'cited research article': `Cited research article authored by ${c.name}.`,
    'citing article': 'Citing article published in an indexed journal.',
    'research director': 'Certified by the Research Director that the output is original and unpublished elsewhere.',
    'certificate of contribution form_research output': `Certificate of Contribution Form_Research Output: ${c.name} contributed ${rng.int(30, 70)} percent.`,
    'certificate of contribution form_translated research': 'Certificate of Contribution Form_Translated Research on file.',
    'certificate of contribution form_im': `Certificate of Contribution Form_IM: ${c.name} contributed ${rng.int(40, 100)} percent to the instructional material.`,
    'certificate of contribution form_intellectual property': 'Certificate of Contribution Form_Intellectual Property on file.',
    'certificate of contribution form_software': 'Certificate of Contribution Form_Software on file.',
    'certificate of contribution form_creative works': 'Certificate of Contribution Form_Creative Works on file.',
    'photo of the invention': `Photo of the invention attached (${topic}).`,
    'special order': `Special Order No. ${rng.int(100, 999)}, s. ${year} authorizing the activity.`,
    'formality examination report': 'Formality examination report issued by the patent office.',
    'substantive examination report': 'Substantive examination report issued; claims found allowable.',
    'patent certificate': 'Patent certificate granted for utility model registration.',
    'patented product': 'Patented product commercialized by a partner firm.',
    'proof of commercialization': `Proof of commercialization: sales records for ${rng.int(10, 80)} units.`,
    'utility model': `Utility model application covering ${topic}.`,
    'certificate of registration': `Certificate of registration issued ${date}.`,
    'industrial design': 'Industrial design registered for the product enclosure.',
    'software product': `Software product developed for ${topic}.`,
    'copyright certificate': 'Copyright certificate issued by the national library.',
    'end-user': `End-user acceptance forms signed by ${rng.int(8, 30)} respondents.`,
    'plant variety': 'Plant variety protection application filed.',
    certificate: 'Certificate issued upon completion.',
    propagated: `The variety was propagated across ${rng.int(2, 5)} test sites.`,
    'animal breed': 'Improved animal breed documented.',
    'certification of breed': 'Certification of breed issued by the livestock authority.',
    'microbial strain': 'Microbial strain isolated and characterized.',
    'certificate of deposit': 'Certificate of deposit from the culture collection.',
    'musical score': 'Musical score composed for chamber ensemble.',
    performance: `Premiere performance held ${date}.`,
    choreography: 'Choreography created for the university dance troupe.',
    script: 'Script for the stage play.',
    production: `The production ran for ${rng.int(2, 6)} shows.`,
    'design portfolio': 'Design portfolio presented to the panel.',
    exhibition: 'Exhibition held at the regional gallery.',
    film: 'Short film produced by the faculty.',
    festival: 'Official selection at a regional film festival.',
    'creative work': 'Creative work registered with the intellectual property office.',
    copyright: 'Copyright registration obtained.',
    invitation: `Invitation letter addressed to ${c.sexSalutation} ${c.last}, dated ${date}.`,
    program: 'Program of activities attached.',
    certification: 'Certification issued by the organizer.',
    'exhibition catalog': 'Exhibition catalog featuring the work.',
    curator: 'Certified by the curator of the exhibition.',
    published: 'The piece was published in a literary anthology.',
    'editorial review': 'It passed editorial review.',
    'approval document': `Approval document from the University President dated ${date}.`,
    'implementation report': 'Implementation report on the linkage activities.',
    mou: 'Memorandum of Understanding (MOU) with the partner institution.',
    'terminal report': 'Terminal report submitted at project close.',
    'financial report': 'Financial report certified by the Accounting Office.',
    finance: "Finance Office certification of the faculty member's role.",
    'income generation': `Income generation activity netted PHP ${rng.int(20, 300)},000.`,
    'sub-aro': 'Sub-ARO issued for the fund transfer.',
    grant: 'Grant awarded for the project.',
    appointment: `Appointment as ${rng.pick(['accreditor', 'external examiner', 'coordinator'])}, effective ${date}.`,
    accreditor: 'Appointed accreditor for the program evaluation.',
    authorization: 'Authorization to render the service was granted by the Office of the President.',
    judge: 'Invited to serve as judge of the provincial contest.',
    contract: 'Contract of service executed for consultancy.',
    consultant: "Consultant for the local government's curriculum review.",
    'resource person': `Invited as resource person for a training on ${topic}.`,
    media: 'Media appearance arranged by the information office.',
    guesting: `Radio guesting on ${date}.`,
    'extension project': `Extension project: capability building on ${topic}.`,
    'client satisfaction rating': `Client Satisfaction Rating summary: ${rng.float(4.2, 4.95).toFixed(2)} out of 5, ${rng.int(25, 120)} respondents.`,
    extension: 'Extension services were delivered to partner barangays.',
    'extension project css report': 'Extension Project CSS Report for the 2025-2026 period.',
    'cmo no. 18': 'Prepared pursuant to CMO No. 18, s. 2025.',
    'effectivity period': `Effectivity period: ${date} to ${date.replace(/\d{4}/, (y) => String(Number(y) + 1))}.`,
    'accomplishment report': 'Accomplishment report submitted to the immediate supervisor.',
    'annual report': 'Annual report of the faculty association.',
    'certificate of membership': `Certificate of membership in the ${rng.pick(ORGS)}, valid ${year}.`,
    'membership id': `Membership ID No. ${rng.int(10000, 99999)}.`,
    'organizational profile': 'Organizational profile of the association is attached.',
    'sec registration': `SEC registration number ${rng.int(100000, 999999)}.`,
    website: 'Organization website: www.example.org.',
    'active participation': 'Evidence of active participation in the annual convention.',
    role: 'Role: committee member.',
    'certification from the head': 'Certification from the head of the organization confirming the role.',
    'organization head': 'Signed by the organization head.',
    'transcript of records': 'Transcript of records for the graduate program.',
    cav: 'Certification, Authentication and Verification (CAV) issued by CHED.',
    diploma: `Diploma conferred ${date}.`,
    ched: 'Recognized by CHED.',
    'scholarship contract': 'Scholarship contract executed under the faculty development program.',
    'certificate of participation': `Certificate of participation in the ${rng.pick(CONFERENCES)} held ${date}.`,
    'approval to attend': `Approval to attend granted per Travel Order No. ${rng.int(100, 999)}.`,
    'acceptance letter': `Acceptance letter for the paper presentation dated ${date}.`,
    'paper presenter': `Certificate as paper presenter, ${rng.pick(CONFERENCES)}.`,
    'certificate of recognition': `Certificate of recognition: ${rng.pick(AWARDS)}.`,
    'certificate of award': `Certificate of award presented ${date}.`,
    plaque: 'Plaque of appreciation.',
    trophy: 'Trophy received.',
    medal: 'Medal of excellence.',
    'criteria and mechanics': 'Criteria and mechanics of the award are attached.',
    'praise guidelines': 'Approved PRAISE guidelines of the university.',
    'selection process': 'Selection process: nomination, screening, and final deliberation.',
    'award-giving organization': 'Profile of the award-giving organization is attached.',
    'service record': `Service record showing continuous full-time service since ${rng.int(2019, 2025)}.`,
    'certificate of employment': 'Certificate of employment issued by the Human Resource Office.',
    'notice of appointment': `Notice of appointment issued ${date}.`,
    'notice of designation': `Notice of designation issued ${date}.`,
    'job description': `Job description: ${rng.pick(['teaching and research', 'technical supervision', 'program coordination'])}.`,
  };
  return lines[keyword] ?? `${cap(keyword)} attached.`;
}

const PANEL_TITLES: Record<string, string[]> = {
  kra1_curriculum_instructional_materials: ['CERTIFICATE OF UTILIZATION AND EVALUATION', 'INSTRUCTIONAL MATERIAL EVALUATION REPORT'],
  kra1_thesis_dissertation_mentorship: ['THESIS APPROVAL SHEET', 'CERTIFICATE OF DESIGNATION'],
  kra2_research_outputs: ['PUBLICATION RECORD', 'RESEARCH OUTPUT CERTIFICATION'],
  kra2_inventions: ['INTELLECTUAL PROPERTY RECORD', 'INVENTION DOCUMENTATION'],
  kra2_creative_works: ['CREATIVE WORK DOCUMENTATION', 'CERTIFICATION OF PERFORMANCE'],
  kra3_service_to_institution: ['LINKAGE AND PARTNERSHIP REPORT', 'INCOME GENERATION REPORT'],
  kra3_service_to_community: ['COMMUNITY SERVICE CERTIFICATION', 'CERTIFICATE OF APPRECIATION'],
  kra3_extension_involvement: ['CLIENT SATISFACTION SUMMARY', 'EXTENSION PROJECT EVALUATION'],
  kra3_administrative_designation: ['DESIGNATION AND ACCOMPLISHMENT REPORT'],
  kra4_professional_organizations: ['MEMBERSHIP CERTIFICATION'],
  kra4_continuing_development: ['CERTIFICATE OF PARTICIPATION', 'ACADEMIC RECORD'],
  kra4_awards_recognition: ['AWARD DOCUMENTATION'],
  kra4_academic_experience: ['EMPLOYMENT RECORD'],
  kra4_industry_experience: ['EMPLOYMENT RECORD'],
};

export function topicFor(rng: Rng) {
  return rng.pick(TOPICS);
}

export function renderEvidenceDoc(panelKey: string, keywords: string[], c: DocContext, topic: string) {
  const { rng } = c;
  const title = rng.pick(PANEL_TITLES[panelKey] ?? ['SUPPORTING DOCUMENT']);
  const signatory = pickSignatory(rng);
  const body = keywords.map((keyword) => keywordLine(keyword, c, topic));
  const text = [
    'Laguna State Polytechnic University',
    'Province of Laguna',
    c.department.toUpperCase(),
    title,
    `This is to certify that ${c.name}, ${c.rank}, ${c.department}, has submitted the following:`,
    ...body,
    `Issued this ${randomWindowDate(rng)}.`,
    signatory,
    rng.pick(['Dean', 'Campus Director', 'Research Director', 'Department Head']),
  ].join('\n');
  return { title, text };
}

// ---------------------------------------------------------------------------
// Teaching evaluation forms (SET / SEF / FEDAF), in the layouts the extractor
// recognizes. `rating` is the true 0-100 rating the formula divides by 100.
// ---------------------------------------------------------------------------

export type TeachingLayout = 'letter' | 'cmo19' | 'weighted' | 'fedaf';
export interface SemesterTerm {
  semester: 1 | 2;
  startYear: number;
}

export function termLabel(term: SemesterTerm) {
  return `${term.semester === 1 ? '1st' : '2nd'} Semester A.Y. ${term.startYear}-${term.startYear + 1}`;
}

export function renderTeachingForm(args: {
  evaluator: 'student' | 'supervisor';
  layout: TeachingLayout;
  rating: number;
  term: SemesterTerm;
  c: DocContext;
  otherRating?: number;
}) {
  const { evaluator, layout, rating, term, c } = args;
  const label = termLabel(term);
  const signatory = pickSignatory(c.rng);
  const head = ['Laguna State Polytechnic University', 'Province of Laguna', c.department.toUpperCase()];
  const evaluatorTitle = evaluator === 'student' ? "(Student's Evaluation)" : "(Supervisor's Evaluation)";
  const transmutation = 'Rating transmuted following NBC 461 (DBM-JC No. 3, s. 2022).';

  if (layout === 'fedaf') {
    const sef = args.otherRating ?? rating;
    return [
      ...head,
      'FACULTY EVALUATION AND DEVELOPMENT ACKNOWLEDGEMENT FORM',
      label,
      `Name of Faculty: ${c.name}`,
      `Student Evaluation of Teachers (SET) Rating ${rating.toFixed(2)}`,
      `Supervisor Evaluation of Faculty (SEF) Rating ${sef.toFixed(2)}`,
      transmutation,
      signatory,
    ].join('\n');
  }
  if (layout === 'cmo19') {
    const total = Math.round((rating / 100) * 75 * 100) / 100;
    return [
      ...head,
      `EVALUATION OF TEACHING EFFECTIVENESS ${evaluatorTitle}`,
      label,
      `Faculty: ${c.name}`,
      'Rated on 15 statements (1-5 scale).',
      `Total Score ${total.toFixed(2)}`,
      '(Total Score/75) x 100',
      `Computed Rating ${Math.round(rating)}`,
      transmutation,
      signatory,
    ].join('\n');
  }
  if (layout === 'weighted') {
    return [
      ...head,
      `${evaluator === 'student' ? 'SET' : 'SEF'} Rating Computation`,
      label,
      `Name: ${c.name}`,
      'Weighted summary per class section',
      `${evaluator === 'student' ? 'SET' : 'SEF'} Rating ${rating.toFixed(2)}%`,
      transmutation,
      signatory,
    ].join('\n');
  }
  const mean = Math.round(((rating - 50) / 10) * 100) / 100;
  return [
    ...head,
    `EVALUATION OF TEACHING EFFECTIVENESS ${evaluatorTitle}`,
    randomWindowDate(c.rng),
    `${c.sexSalutation} ${c.last.toUpperCase()}`,
    `Dear ${c.sexSalutation} ${c.last},`,
    label,
    `I am pleased to inform you of your performance during the ${label}.`,
    `Grand Mean ${mean.toFixed(2)}`,
    `Equivalent Percentage ${rating.toFixed(2)}`,
    transmutation,
    signatory,
  ].join('\n');
}
