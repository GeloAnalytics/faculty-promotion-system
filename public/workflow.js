const portal = document.body.dataset.portal || 'auth';
const apiBaseUrl = normalizeApiBaseUrl(window.APP_CONFIG?.apiBaseUrl);
const REPLACEMENT_UPLOAD_ACCEPT = '.pdf,.png,.jpg,.jpeg,.bmp,.tif,.tiff';

const sessionUser = byId('session-user');
const workspaceGreeting = byId('workspace-greeting');
const employeeProfileForm = byId('employee-profile-form');
const employeeProfileStatus = byId('employee-profile-status');
const profileAcademicRank = byId('profile-academic-rank');
const profileAttainment = byId('profile-attainment');
const profileDepartment = byId('profile-department');
const employeePoints = byId('employee-points');
const employeeUploadWorkflow = byId('employee-upload-workflow');
const employeeUploadStatus = byId('employee-upload-status');
const employeeUploadList = byId('employee-upload-list');
const documentPreviewModal = byId('document-preview-modal');
const documentPreviewStatus = byId('document-preview-status');
const documentPreviewFrame = byId('document-preview-frame');
const documentPreviewTitle = byId('document-preview-title');
const documentPreviewMeta = byId('document-preview-meta');
const evaluatorInsights = byId('evaluator-insights');
const evaluatorFacultySummary = byId('evaluator-faculty-summary');
const evaluatorDocumentLibrary = byId('evaluator-document-library');
const evaluatorDocumentLibraryStatus = byId('evaluator-document-library-status');
const evaluatorWorkbookRequestForm = byId('evaluator-workbook-request-form');
const evaluatorWorkbookSummarySheet = byId('evaluator-workbook-summary-sheet');
const reviewQueue = byId('review-queue');
const reviewQueueFilterStatus = byId('review-queue-filter-status');
const adminAccounts = byId('admin-accounts');
const adminAccountsStatus = byId('admin-accounts-status');
const adminOverview = byId('admin-overview');
const adminOverviewStatus = byId('admin-overview-status');

let currentUser = null;
let employeeDashboard = null;
let uploadPanelCatalog = [];
let reviewerQueueItems = [];
let adminAccountItems = [];
let currentDocumentPreviewUrl = null;
let documentPreviewRequestToken = 0;
let documentPreviewLoadTimer = null;
let lastDocumentPreviewRequest = null;
// Storage config loaded once on startup — used for direct-to-Supabase uploads
let storageConfig = { directUploadEnabled: false, supabaseUrl: null, supabaseAnonKey: null, bucket: 'documents' };

document.querySelectorAll("[data-action='logout']").forEach((button) => {
  button.addEventListener('click', logoutAndReturnHome);
});
employeeUploadList?.addEventListener('click', handleUploadListActionClick);
reviewQueue?.addEventListener('click', handleReviewQueueActionClick);
evaluatorDocumentLibrary?.addEventListener('click', handleReviewQueueActionClick);
evaluatorWorkbookSummarySheet?.addEventListener('click', handleReviewQueueActionClick);
adminAccounts?.addEventListener('click', handleAccountsActionClick);
employeeProfileForm?.addEventListener('submit', handleEmployeeProfileSubmit);
document.addEventListener('keydown', handleDocumentPreviewKeydown);
document.addEventListener('click', handlePrintActionClick);
window.addEventListener('afterprint', clearPrintMode);
documentPreviewModal?.addEventListener('click', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.previewAction === 'retry') {
    if (lastDocumentPreviewRequest) {
      void openDocumentPreview(lastDocumentPreviewRequest);
    }
    return;
  }
  if (target instanceof HTMLElement && target.dataset.previewAction === 'close') {
    closeDocumentPreview();
  }
  if (target === documentPreviewModal) {
    closeDocumentPreview();
  }
});

bootstrap().catch((error) => {
  console.error(error);
  setNotice(employeeUploadStatus || reviewQueueFilterStatus, toErrorMessage(error), true);
});

async function bootstrap() {
  if (portal !== 'admin') {
    ensureDocumentPreviewShell();
  }
  const session = await refreshSession();
  if (!session) {
    window.location.assign('/');
    return;
  }

  if (portal === 'employee') {
    await loadEmployeeWorkspace();
    return;
  }

  if (portal === 'evaluator') {
    await loadEvaluatorWorkspace();
    return;
  }

  if (portal === 'admin') {
    await loadAdminWorkspace();
  }
}

async function refreshSession() {
  try {
    const data = await apiFetch('/api/auth/me');
    currentUser = data.user;
    if (sessionUser) {
      sessionUser.textContent = `${data.user.fullName} (${prettyRole(data.user.role)})`;
    }
    if (workspaceGreeting) {
      workspaceGreeting.textContent =
        portal === 'evaluator'
          ? `Hello ${data.user.fullName}. Review the uploaded PDFs, verify the OCR output, and confirm the computed score.`
          : portal === 'admin'
            ? `Hello ${data.user.fullName}. Manage accounts and monitor the system.`
            : `Hello ${data.user.fullName}. Upload your documentary evidence for each KRA so the system can OCR-verify it for your draft score.`;
    }
    return data;
  } catch (error) {
    currentUser = null;
    if (sessionUser) {
      sessionUser.textContent = 'Guest';
    }
    if (workspaceGreeting) {
      workspaceGreeting.textContent =
        portal === 'evaluator'
          ? 'Hello. Review the uploaded PDFs and verify the OCR output.'
          : portal === 'admin'
            ? 'Hello. Manage accounts and monitor the system.'
            : 'Hello. Upload your documentary evidence for each KRA.';
    }
    return null;
  }
}

async function loadEmployeeWorkspace() {
  setNotice(employeeUploadStatus, 'Loading your OCR-backed summary and KRA upload panels...');
  setNotice(employeeProfileStatus, 'Loading your profile details...');
  const [dashboard, workflow, facultyOptions, storageCfg] = await Promise.all([
    apiFetch('/api/employee/dashboard'),
    apiFetch('/api/config/upload-panels'),
    apiFetch('/api/config/faculty-options').catch(() => ({ academicRanks: [], educationalAttainments: [] })),
    apiFetch('/api/config/storage').catch(() => ({ directUploadEnabled: false })),
  ]);

  storageConfig = { ...storageConfig, ...storageCfg };
  employeeDashboard = dashboard;
  uploadPanelCatalog = Array.isArray(workflow.panels) ? workflow.panels : [];

  renderEmployeeSummary(employeeDashboard);
  renderEmployeeWorkflow(
    uploadPanelCatalog,
    employeeDashboard?.uploads || [],
    employeeDashboard?.latestProfile?.draftPoints?.scoreComputation,
  );
  renderEmployeeUploads(employeeDashboard?.uploads || []);
  renderEmployeeProfileForm(facultyOptions, employeeDashboard?.latestProfile?.baselineData?.personalData);
  setNotice(employeeUploadStatus, 'Upload your documentary evidence for each panel. PDFs can be previewed inside the portal.');
}

async function loadEvaluatorWorkspace() {
  setNotice(reviewQueueFilterStatus, 'Loading review queue...');

  const data = await apiFetch('/api/evaluator/review-queue');
  reviewerQueueItems = Array.isArray(data.items) ? data.items : [];

  renderEvaluatorInsights(reviewerQueueItems);
  renderFacultySummaryTable(reviewerQueueItems);
  renderEvaluatorDocumentLibrary(reviewerQueueItems);
  renderReviewQueue(reviewerQueueItems);
  renderEvaluatorWorkbooks(reviewerQueueItems);
  setNotice(reviewQueueFilterStatus, `${reviewerQueueItems.length} faculty submission(s) ready for read-only review.`);
}

async function loadAdminWorkspace() {
  setNotice(adminAccountsStatus, 'Loading accounts...');
  setNotice(adminOverviewStatus, 'Loading system overview...');

  const [accountsData, overviewData] = await Promise.all([
    apiFetch('/api/accounts').catch((error) => {
      setNotice(adminAccountsStatus, toErrorMessage(error), true);
      return { accounts: [] };
    }),
    apiFetch('/api/admin/database-overview').catch((error) => {
      setNotice(adminOverviewStatus, toErrorMessage(error), true);
      return null;
    }),
  ]);

  adminAccountItems = Array.isArray(accountsData.accounts) ? accountsData.accounts : [];
  renderAccountsPanel(adminAccountItems);
  if (adminAccountItems.length) {
    setNotice(adminAccountsStatus, `${adminAccountItems.length} account(s) on file.`);
  }

  if (overviewData) {
    renderAdminOverview(overviewData);
    setNotice(adminOverviewStatus, 'System overview loaded.');
  }

  await loadEvaluatorWorkspace();
}

function renderAdminOverview(overview) {
  if (!adminOverview) {
    return;
  }

  const counts = overview.counts || {};
  adminOverview.innerHTML = `
    <div class="uploaded-files-filter-status">
      ${Object.entries(counts)
        .map(([label, value]) => `<span class="account-role-chip">${escapeHtml(label)}: ${escapeHtml(String(value))}</span>`)
        .join(' ')}
    </div>
  `;
}

function renderEmployeeProfileForm(facultyOptions, personalData) {
  if (!employeeProfileForm) {
    return;
  }

  populateSelectOptions(profileAcademicRank, facultyOptions?.academicRanks || []);
  populateSelectOptions(profileAttainment, facultyOptions?.educationalAttainments || []);
  populateSelectOptions(profileDepartment, facultyOptions?.collegeDepartments || [], { includeBlank: 'Select college' });

  if (personalData) {
    setSelectValue(profileAcademicRank, personalData.academicRank);
    setSelectValue(profileAttainment, personalData.highestEducationalAttainment);
    setSelectValue(profileDepartment, personalData.department);
    setInputValue('profile-years-in-service', personalData.yearsInService);
    setInputValue('profile-age', personalData.age);
    setInputValue('profile-sex', personalData.sex);
    setInputValue('profile-civil-status', personalData.civilStatus);
    setNotice(employeeProfileStatus, 'Update your details any time - only OCR-scanned uploads determine your KRA scores.');
  } else {
    setNotice(employeeProfileStatus, 'Set your academic rank and attainment once - your KRA scores will still come entirely from OCR-scanned uploads.');
  }
}

function populateSelectOptions(select, options, { includeBlank } = {}) {
  if (!select) {
    return;
  }
  const previousValue = select.value;
  const blankOption = includeBlank ? `<option value="">${escapeHtml(includeBlank)}</option>` : '';
  select.innerHTML = blankOption + options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('');
  if (previousValue) {
    select.value = previousValue;
  }
}

function setSelectValue(select, value) {
  if (select && typeof value === 'string' && value) {
    select.value = value;
  }
}

function setInputValue(id, value) {
  const element = byId(id);
  if (element && value !== null && value !== undefined && value !== '') {
    element.value = value;
  }
}

async function handleEmployeeProfileSubmit(event) {
  event.preventDefault();
  setNotice(employeeProfileStatus, 'Saving your profile details...');

  const personalData = {
    employeeId: currentUser?.employeeId || '',
    fullName: currentUser?.fullName || '',
    academicRank: profileAcademicRank?.value || '',
    highestEducationalAttainment: profileAttainment?.value || '',
    department: profileDepartment?.value || undefined,
    yearsInService: numberOrUndefined(byId('profile-years-in-service')?.value),
    age: numberOrUndefined(byId('profile-age')?.value),
    sex: byId('profile-sex')?.value || undefined,
    civilStatus: byId('profile-civil-status')?.value || undefined,
  };

  try {
    await apiFetch('/api/faculty/ingest', {
      method: 'POST',
      body: JSON.stringify({ personalData, promotionHistory: [] }),
    });
    setNotice(employeeProfileStatus, 'Profile details saved.');
    await loadEmployeeWorkspace();
  } catch (error) {
    setNotice(employeeProfileStatus, toErrorMessage(error), true);
  }
}

function numberOrUndefined(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function renderEmployeeSummary(dashboard) {
  if (!employeePoints) {
    return;
  }

  const draftPoints = dashboard?.latestProfile?.draftPoints;
  if (!draftPoints) {
    employeePoints.innerHTML = `
      <div class="notice">Upload your evidence bundle to generate an OCR-backed summary.</div>
    `;
    return;
  }

  const evidenceCoverage = draftPoints.evidenceCoverage || {};
  const promotionDraft = draftPoints.promotionDraft || {};
  const scoreComputation = draftPoints.scoreComputation || {};
  const evidenceScore = formatOptionalNumber(scoreComputation.weightedScore, formatNumber(scoreComputation.rawTotal));
  const panelCoverage = `${evidenceCoverage.uploadedPanelCount ?? 0}/${evidenceCoverage.expectedPanelCount ?? 0}`;

  employeePoints.innerHTML = `
    <section class="scoreboard">
      <div class="scoreboard-hero">
        <p class="section-kicker">Live Score Summary</p>
        <div class="scoreboard-total-row">
          <div>
            <span class="scoreboard-label">Total</span>
            <strong>${escapeHtml(formatNumber(scoreComputation.rawTotal))}</strong>
          </div>
          <div>
            <span class="scoreboard-label">Weighted</span>
            <strong>${escapeHtml(evidenceScore)}</strong>
          </div>
        </div>
        <div class="scoreboard-chip-row">
          <span class="scoreboard-chip" data-tone="${scoreComputation.status === 'complete' ? 'ready' : 'pending'}">${escapeHtml(scoreComputation.status || 'pending')}</span>
          <span class="scoreboard-chip">${escapeHtml(panelCoverage)} panels</span>
        </div>
      </div>

      <div class="scoreboard-kra-list">
        ${renderScoreboardKraSections(scoreComputation)}
      </div>

      <div class="scoreboard-footer">
        <div>
          <span class="scoreboard-label">Draft rank</span>
          <strong>${escapeHtml(promotionDraft.suggestedRank || 'Pending review')}</strong>
        </div>
        <div>
          <span class="scoreboard-label">Current rank</span>
          <strong>${escapeHtml(promotionDraft.currentRank || 'Not set')}</strong>
        </div>
      </div>
    </section>
    ${renderEmployeeNotifications(draftPoints)}
  `;
}

function renderEmployeeNotifications(draftPoints) {
  const coverage = draftPoints.evidenceCoverage;
  if (!coverage) return '';

  if (coverage.validationStatus === 'complete') {
    return `
      <section class="employee-notification-panel success">
        <div class="notification-header">
          <h3>✅ All Required Evidence Uploaded</h3>
          <p>Your KRA submission appears complete based on OCR extraction and is ready for evaluator verification.</p>
        </div>
      </section>
    `;
  }

  // Not every faculty member will have documentary evidence available for
  // every panel - a panel with no evidence is simply scored 0 (shown plainly
  // in the KRA breakdown above) rather than called out with a warning here.
  return '';
}

function renderScoreboardKraSections(scoreComputation) {
  const sections = Array.isArray(scoreComputation?.kraSections) ? scoreComputation.kraSections : [];

  if (!sections.length) {
    return '<div class="notice">Scores will update after your first evidence upload.</div>';
  }

  return sections.map(renderScoreboardKraSection).join('');
}

function renderScoreboardKraSection(section, index) {
  const kraLabel = formatKraShortLabel(section.title, index);
  const panels = Array.isArray(section.panels) ? section.panels : [];

  return `
    <article class="scoreboard-kra">
      <div class="scoreboard-kra-header">
        <div>
          <span class="scoreboard-label">${escapeHtml(kraLabel)}</span>
          <strong>${escapeHtml(formatNumber(section.cappedScore))}</strong>
        </div>
        <span class="scoreboard-kra-max">/ ${escapeHtml(formatNumber(section.maxScore))}</span>
      </div>
      <div class="scoreboard-criteria">
        ${panels.map((panel, panelIndex) => renderScoreboardCriterion(panel, panelIndex)).join('')}
      </div>
    </article>
  `;
}

function renderScoreboardCriterion(panel, index) {
  return `
    <div class="scoreboard-criterion" data-status="${escapeHtml(panel.status || 'missing-score')}">
      <span>${escapeHtml(formatCriterionLabel(panel.title, index))}</span>
      <strong>${escapeHtml(formatNumber(panel.usedScore))}</strong>
    </div>
  `;
}

function formatKraShortLabel(title, index) {
  const matched = String(title || '').match(/KRA\s*(\d+)/i);
  return matched ? `KRA ${matched[1]}` : `KRA ${index + 1}`;
}

function formatCriterionLabel(title, index) {
  const letter = String.fromCharCode(65 + index);
  const compactTitle = String(title || '').replace(/\s+/g, ' ').trim();
  return compactTitle ? `Criterion ${letter}: ${compactTitle}` : `Criterion ${letter}`;
}

function renderEmployeeWorkflow(workflowItems, uploads, scoreComputation = null) {
  if (!employeeUploadWorkflow) {
    return;
  }

  if (!workflowItems.length) {
    employeeUploadWorkflow.innerHTML = '<div class="notice">No upload panels are configured yet.</div>';
    return;
  }

  const groupedPanels = groupPanelsByKra(workflowItems);
  const uploadedMap = buildUploadTypeCounts(uploads);
  const evidenceCount = Number(uploadedMap['evidence'] || 0);
  const completedPanels = workflowItems.filter((panel) => hasPanelUpload(panel.key, uploads, 'evidence')).length;
  const progressPct = workflowItems.length ? Math.round((completedPanels / workflowItems.length) * 100) : 0;

  employeeUploadWorkflow.innerHTML = `
    <div class="upload-progress-strip">
      <div class="upload-progress-info">
        <span class="upload-progress-label">Upload Progress</span>
        <span class="upload-progress-count">${completedPanels} / ${workflowItems.length} panel${workflowItems.length === 1 ? '' : 's'} ready</span>
      </div>
      <div class="upload-progress-track">
        <div class="upload-progress-fill" style="width:${progressPct}%"></div>
      </div>
    </div>
    <p class="workflow-intro">
      Upload the supporting documentary evidence for each KRA or criterion. The draft score is computed from uploaded evidence alone.
    </p>
    <div class="workflow-summary-row">
      <span class="workflow-summary-chip">Evidence files: ${evidenceCount}</span>
      <span class="workflow-summary-chip">Panels tracked: ${workflowItems.length}</span>
    </div>
    ${groupedPanels
      .map(([kraTitle, items]) => renderEmployeeUploadGroup(kraTitle, items, uploads, scoreComputation))
      .join('')}
  `;

  // BUG FIX #5/6/7: Use event delegation on the stable container element instead of
  // attaching listeners to individual forms. When the DOM is re-rendered after an
  // upload the individual form nodes are destroyed, orphaning any per-form listeners.
  // A single delegated listener on the container always reads panelKey from whichever
  // form was actually submitted, regardless of re-renders.
  if (!employeeUploadWorkflow._uploadDelegated) {
    employeeUploadWorkflow._uploadDelegated = true;
    employeeUploadWorkflow.addEventListener('submit', (event) => {
      const form = event.target?.closest('.workflow-upload-form');
      if (form) {
        handleUploadSubmit(event, form);
      }
    });
  }
}

function renderEmployeeUploadGroup(kraTitle, items, uploads, scoreComputation) {
  const completedCount = items.filter((panel) => hasPanelUpload(panel.key, uploads, 'evidence')).length;
  const groupComplete = completedCount === items.length && items.length > 0;

  return `
    <details class="upload-group-collapsible${groupComplete ? ' kra-complete' : ''}" ${groupComplete ? '' : 'open'}>
      <summary class="upload-group-summary">
        <div class="upload-group-heading">
          <h3>${escapeHtml(kraTitle)}</h3>
          <p class="card-copy">Documentary evidence is uploaded separately for each criterion in this KRA.</p>
        </div>
        <span class="kra-progress-chip${groupComplete ? ' kra-progress-done' : ''}">
          ${groupComplete ? 'Complete' : `${completedCount}/${items.length} panels ready`}
        </span>
      </summary>
      <div class="upload-panel-grid">
        ${items.map((panel) => renderEmployeeUploadCard(panel, uploads, scoreComputation)).join('')}
      </div>
    </details>
  `;
}

// BUG #2 FIX: Document type options per upload card
const DOCUMENT_TYPE_OPTIONS = [
  '',
  'Certificate',
  'Published Article / Journal',
  'Award / Recognition',
  'Appointment / Designation',
  'Training / Seminar Proof',
  'Evaluation Form (SET/SEF)',
  'Accreditation Document',
  'Research / Patent',
  'Extension Project Record',
  'Membership / ID',
  'Transcript / Diploma',
  'Other',
];

function renderEmployeeUploadCard(panel, uploads, scoreComputation) {
  const accept = Array.isArray(panel.acceptedFormats) ? panel.acceptedFormats.map((ext) => `.${ext}`).join(',') : '';
  const evidenceCount = getPanelUploadCount(panel.key, uploads, 'evidence');
  const panelComplete = evidenceCount > 0;
  const computedScore = getPanelComputedScore(scoreComputation, panel.key);
  const docTypeOptions = DOCUMENT_TYPE_OPTIONS.map((opt) =>
    `<option value="${escapeHtml(opt)}">${opt ? escapeHtml(opt) : 'Select document type (optional)'}</option>`
  ).join('');

  return `
    <article class="card workflow-card upload-card${panelComplete ? ' upload-card-complete' : ''}" data-panel-key="${escapeHtml(panel.key)}">
      <div class="upload-card-header">
        <div>
          <h4>${escapeHtml(panel.title)}</h4>
          <p class="card-copy">${escapeHtml(panel.description)}</p>
        </div>
        <div class="upload-card-badges">
          <span class="upload-status-badge" data-status="${evidenceCount > 0 ? 'uploaded' : 'pending'}">
            ${evidenceCount > 0 ? `${evidenceCount} evidence file${evidenceCount === 1 ? '' : 's'}` : 'Evidence pending'}
          </span>
          <span class="upload-score-cap">Max ${escapeHtml(String(panel.maxScore))} pts</span>
        </div>
      </div>
      ${panel.audienceLabel ? `<p class="upload-audience-chip">${escapeHtml(panel.audienceLabel)}</p>` : ''}
      ${renderComputedPanelScore(computedScore, panel.maxScore)}
      <div class="upload-variant-grid">
        ${renderUploadVariantForm({
          panelKey: panel.key,
          uploadType: 'evidence',
          title: 'Evidence Upload',
          helper: 'Multiple files allowed. Add the supporting evidence for the same KRA or criterion.',
          buttonLabel: 'Upload Evidence',
          accept,
          multiple: true,
          count: evidenceCount,
          docTypeOptions,
        })}
      </div>
    </article>
  `;
}

function renderUploadVariantForm({ panelKey, uploadType, title, helper, buttonLabel, accept, multiple, count, docTypeOptions }) {
  return `
    <form class="workflow-upload-form upload-variant-form" data-panel-key="${escapeHtml(panelKey)}" data-upload-type="${escapeHtml(uploadType)}">
      <div class="upload-variant-header">
        <div>
          <strong class="upload-variant-title">${escapeHtml(title)}</strong>
          <p class="upload-variant-note">${escapeHtml(helper)}</p>
        </div>
        <span class="upload-variant-chip" data-status="${count > 0 ? 'uploaded' : 'pending'}">
          ${count > 0 ? `${count} uploaded` : 'Pending'}
        </span>
      </div>
      ${docTypeOptions ? `
      <label class="field">
        <span>Document Type <span class="upload-variant-note" style="font-weight:400">(optional — helps categorise the file)</span></span>
        <select name="documentType" class="upload-document-type-select">${docTypeOptions}</select>
      </label>` : ''}
      <label class="field">
        <span>${multiple ? 'Select files' : 'Select file'}</span>
        <input type="file" name="document" ${multiple ? 'multiple' : ''} required accept="${escapeHtml(accept)}" />
      </label>
      <!-- BUG #4 FIX: Per-file size warning rendered by JS on file change -->
      <div class="upload-size-warning" hidden></div>
      <!-- BUG #1/#3 FIX: Per-panel upload progress bar -->
      <div class="upload-progress-panel" hidden>
        <div class="upload-progress-track upload-progress-track-panel">
          <div class="upload-progress-fill upload-progress-fill-panel" style="width:0%"></div>
        </div>
        <span class="upload-progress-label-panel">Uploading...</span>
      </div>
      <button class="button button-primary" type="submit">${escapeHtml(buttonLabel)}</button>
    </form>
  `;
}

function renderEmployeeUploads(uploads) {
  if (!employeeUploadList) {
    return;
  }

  const orderedUploads = sortUploadsForDisplay(uploads);
  const grouped = groupEmployeeUploads(orderedUploads);
  const groupOrder = [
    'KRA I - Instruction',
    'KRA II - Research, Innovation and/or Creative Work',
    'KRA III - Extension Services',
    'KRA IV - Professional Development',
    'Unassigned / Legacy',
  ];

  if (!orderedUploads.length) {
    employeeUploadList.innerHTML = '<div class="notice">No files uploaded yet.</div>';
    return;
  }

  const latestUpload = orderedUploads[0];
  const evidenceCount = orderedUploads.filter((upload) => upload.metadata?.uploadType === 'evidence').length;
  const legacyCount = orderedUploads.length - evidenceCount;

  employeeUploadList.innerHTML = `
    <div class="uploaded-files-ledger-summary">
      <div class="database-counts ledger-counts">
        ${renderLedgerStatCard('Total uploads', String(orderedUploads.length))}
        ${renderLedgerStatCard('Evidence files', String(evidenceCount))}
        ${renderLedgerStatCard('Legacy files', String(legacyCount))}
        ${renderLedgerStatCard('Latest upload', formatDate(latestUpload.createdAt))}
      </div>
      <p class="uploaded-files-ledger-note">
        Files are sorted with the newest upload first inside each KRA section.
      </p>
      ${groupOrder
        .filter((type) => grouped[type] && grouped[type].length)
        .map((type) => renderUploadGroup(type, grouped[type]))
        .join('')}
    </div>
  `;
}

function renderUploadGroup(label, groupUploads) {
  const title = label === 'Unassigned / Legacy' ? 'Unassigned / Legacy' : label;

  return `
    <article class="uploaded-files-group">
      <div class="uploaded-files-group-header">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <span>${escapeHtml(getUploadGroupSubheading(label, groupUploads.length))}</span>
        </div>
        <span>${escapeHtml(String(groupUploads.length))} file(s)</span>
      </div>
      <div class="uploaded-files-list">
        ${groupUploads.map(renderUploadRow).join('')}
      </div>
    </article>
  `;
}

function getUploadGroupSubheading(label, count) {
  if (label === 'Unassigned / Legacy') {
    return 'Legacy uploads or files without a detected KRA';
  }

  return 'Evidence grouped by KRA';
}

function groupEmployeeUploads(uploads) {
  const groups = {
    'KRA I - Instruction': [],
    'KRA II - Research, Innovation and/or Creative Work': [],
    'KRA III - Extension Services': [],
    'KRA IV - Professional Development': [],
    'Unassigned / Legacy': [],
  };

  for (const upload of uploads) {
    groups[getEmployeeUploadGroupLabel(upload)].push(upload);
  }

  return Object.fromEntries(
    Object.entries(groups).map(([label, items]) => [label, sortUploadsForDisplay(items)]),
  );
}

function getEmployeeUploadGroupLabel(upload) {
  const kraLabel = getKraLabel(upload.metadata?.panelKey);
  if (kraLabel) {
    return kraLabel;
  }

  return 'Unassigned / Legacy';
}

function sortUploadsForDisplay(uploads) {
  return [...uploads].sort((left, right) => {
    const leftPriority = getUploadSortPriority(left);
    const rightPriority = getUploadSortPriority(right);

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return String(left.originalName || '').localeCompare(String(right.originalName || ''));
  });
}

function getUploadSortPriority(upload) {
  const kraLabel = getKraLabel(upload.metadata?.panelKey);
  if (kraLabel === 'KRA I - Instruction') {
    return 1;
  }

  if (kraLabel === 'KRA II - Research, Innovation and/or Creative Work') {
    return 2;
  }

  if (kraLabel === 'KRA III - Extension Services') {
    return 3;
  }

  if (kraLabel === 'KRA IV - Professional Development') {
    return 4;
  }

  return 5;
}

function renderLedgerStatCard(label, value) {
  return `
    <article class="database-count-card">
      <span class="database-count-label">${escapeHtml(label)}</span>
      <strong class="database-count-value">${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderEvaluatorDocumentLibrary(items) {
  if (!evaluatorDocumentLibrary) {
    return;
  }

  const documents = collectEvaluatorDocuments(items);
  if (!documents.length) {
    evaluatorDocumentLibrary.innerHTML = '<div class="notice">No uploaded documents are available for browsing yet.</div>';
    if (evaluatorDocumentLibraryStatus) {
      evaluatorDocumentLibraryStatus.textContent = 'No documents found in the current review queue.';
    }
    return;
  }

  const latestDocument = documents[0];
  const employeeCount = new Set(documents.map((document) => document.profileId)).size;
  const kraCount = new Set(
    documents
      .map((document) => document.kraLabel)
      .filter((value) => typeof value === 'string' && value !== 'Unassigned / Legacy'),
  ).size;
  const grouped = groupDocumentsByProfile(documents);

  if (evaluatorDocumentLibraryStatus) {
    evaluatorDocumentLibraryStatus.textContent =
      'Documents are grouped by faculty and sorted with the newest upload first.';
  }

  evaluatorDocumentLibrary.innerHTML = `
    <div class="uploaded-files-ledger-summary">
      <div class="database-counts ledger-counts">
        ${renderLedgerStatCard('Documents', String(documents.length))}
        ${renderLedgerStatCard('Faculty', String(employeeCount))}
        ${renderLedgerStatCard('Latest upload', formatDate(latestDocument.createdAt))}
      </div>
      <p class="uploaded-files-ledger-note">
        Browsing is organized by faculty profile first, then by upload date. KRA labels are still visible on each file so evaluators can jump straight to the evidence they need.
      </p>
      <div class="uploaded-files-ledger-note-chip-row">
        ${renderLedgerNoteChip(`${kraCount} KRA group${kraCount === 1 ? '' : 's'}`)}
        ${renderLedgerNoteChip('Newest files first')}
        ${renderLedgerNoteChip('Read-only preview')}
      </div>
      ${grouped
        .map((group) => renderEvaluatorDocumentGroup(group))
        .join('')}
    </div>
  `;
}

function collectEvaluatorDocuments(items) {
  return sortUploadsForDisplay(
    items.flatMap((item) =>
      (Array.isArray(item.uploadLogs) ? item.uploadLogs : []).map((upload) => ({
        ...upload,
        profileId: item.id,
        profileLabel: item.name || 'Unnamed faculty member',
        employeeId: item.employeeId || '',
        submittedBy: item.createdBy?.fullName || '-',
        cycleLabel: item.cycleData?.performanceReview?.reviewPeriod || item.semester || 'Current cycle',
        kraLabel: getKraLabel(upload.metadata?.panelKey) || 'Unassigned / Legacy',
      })),
    ),
  );
}

function groupDocumentsByProfile(documents) {
  const grouped = documents.reduce((groups, document) => {
    if (!groups[document.profileId]) {
      groups[document.profileId] = {
        profileId: document.profileId,
        label: document.profileLabel,
        employeeId: document.employeeId,
        submittedBy: document.submittedBy,
        cycleLabel: document.cycleLabel,
        documents: [],
        latestCreatedAt: document.createdAt,
      };
    }

    const group = groups[document.profileId];
    group.documents.push(document);

    if (new Date(document.createdAt).getTime() > new Date(group.latestCreatedAt).getTime()) {
      group.latestCreatedAt = document.createdAt;
    }

    return groups;
  }, {});

  return Object.values(grouped)
    .map((group) => ({
      ...group,
      documents: sortUploadsForDisplay(group.documents),
    }))
    .sort((left, right) => new Date(right.latestCreatedAt).getTime() - new Date(left.latestCreatedAt).getTime());
}

function renderEvaluatorDocumentGroup(group) {
  return `
    <details class="uploaded-files-group evaluator-document-group">
      <summary class="uploaded-files-group-header">
        <div>
          <h3>${escapeHtml(group.label)}${group.employeeId ? ` <span class="uploaded-files-group-id">${escapeHtml(group.employeeId)}</span>` : ''}</h3>
          <span>${escapeHtml(group.submittedBy)} - ${escapeHtml(group.cycleLabel)}</span>
        </div>
        <span>${escapeHtml(String(group.documents.length))} file(s)</span>
      </summary>
      <div class="uploaded-files-list">
        ${group.documents.map((document) => renderEvaluatorUploadRow(document)).join('')}
      </div>
    </details>
  `;
}

function renderLedgerNoteChip(label) {
  return `<span class="uploaded-files-ledger-chip">${escapeHtml(label)}</span>`;
}
function renderUploadRow(item) {
  const metadata = item.metadata || {};
  const summary = metadata.analysisSummary || 'OCR summary pending.';
  const panel = metadata.panelTitle || metadata.panelKey || 'Unassigned panel';
  const kraLabel = getKraLabel(metadata.panelKey) || 'Unassigned';
  const previewLabel = getPreviewActionLabel(item.mimeType);

  return `
    <article class="uploaded-file-row">
      <div class="uploaded-file-info">
        <strong>${escapeHtml(item.originalName)}</strong>
        <span class="uploaded-file-panel">${escapeHtml(getUploadTypeLabel(metadata.uploadType))}</span>
        <span class="uploaded-file-panel">${escapeHtml(kraLabel)}</span>
        <span class="uploaded-file-panel">${escapeHtml(panel)}</span>
        <span class="uploaded-file-date">${escapeHtml(formatDate(item.createdAt))}</span>
      </div>
      <div class="uploaded-file-summary">
        <p class="card-copy">${escapeHtml(summary)}</p>
        <div class="uploaded-file-actions">
          <button class="button button-secondary preview-upload-button" data-document-id="${escapeHtml(item.id)}" data-file-name="${escapeHtml(item.originalName)}" data-mime-type="${escapeHtml(item.mimeType || '')}" data-upload-action="preview" type="button">${escapeHtml(previewLabel)}</button>
          <button class="button button-secondary replace-upload-button" data-document-id="${escapeHtml(item.id)}" data-file-name="${escapeHtml(item.originalName)}" data-upload-type="${escapeHtml(metadata.uploadType || 'legacy')}" data-panel-key="${escapeHtml(metadata.panelKey || '')}" data-upload-action="replace" type="button">Replace</button>
          <button class="button button-secondary delete-upload-button" data-document-id="${escapeHtml(item.id)}" data-file-name="${escapeHtml(item.originalName)}" data-upload-action="delete" type="button">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function renderEvaluatorInsights(items) {
  if (!evaluatorInsights) {
    return;
  }

  const totalRecords = items.length;
  const averageEvidenceScore = totalRecords
    ? Math.round(
        (items.reduce(
          (sum, item) => sum + Number(item.draftPoints?.scoreComputation?.weightedScore ?? item.draftPoints?.scoreComputation?.rawTotal ?? 0),
          0,
        ) /
          totalRecords) *
          100,
      ) / 100
    : 0;
  const averageCoverage = totalRecords
    ? Math.round(
        (items.reduce((sum, item) => sum + Number(item.draftPoints?.evidenceCoverage?.workflowCoveragePercent ?? 0), 0) /
          totalRecords) *
          100,
      ) / 100
    : 0;

  const completeCount = items.filter((item) => item.draftPoints?.evidenceCoverage?.validationStatus === 'complete').length;
  const needsReviewCount = items.filter((item) => Number(item.draftPoints?.scoreComputation?.zeroedPanelCount ?? 0) > 0).length;
  const incompleteCount = items.filter((item) => item.draftPoints?.evidenceCoverage?.validationStatus === 'incomplete' && Number(item.draftPoints?.scoreComputation?.zeroedPanelCount ?? 0) === 0).length;

  const totalEvidenceFiles = items.reduce((sum, item) => sum + (Array.isArray(item.uploadLogs) ? item.uploadLogs.filter(u => u.metadata?.uploadType === 'evidence').length : 0), 0);

  const missingPanelCounts = {};
  items.forEach((item) => {
    const missingPanels = item.draftPoints?.evidenceCoverage?.missingEvidencePanels || [];
    missingPanels.forEach(panel => {
      missingPanelCounts[panel] = (missingPanelCounts[panel] || 0) + 1;
    });
  });
  const topMissingPanels = Object.entries(missingPanelCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const scoreBrackets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
  items.forEach(item => {
    const score = Number(item.draftPoints?.scoreComputation?.weightedScore ?? item.draftPoints?.scoreComputation?.rawTotal ?? 0);
    if (score <= 20) scoreBrackets['0-20']++;
    else if (score <= 40) scoreBrackets['21-40']++;
    else if (score <= 60) scoreBrackets['41-60']++;
    else if (score <= 80) scoreBrackets['61-80']++;
    else scoreBrackets['81-100']++;
  });

  evaluatorInsights.innerHTML = `
    <div class="insight-stat-grid">
      ${renderInsightStatCard('Queue records', String(totalRecords))}
      ${renderInsightStatCard('Complete packets', String(completeCount))}
      ${renderInsightStatCard('Needs attention', String(needsReviewCount))}
      ${renderInsightStatCard('Evidence files', String(totalEvidenceFiles))}
      ${renderInsightStatCard('Avg evidence score', `${averageEvidenceScore}`)}
      ${renderInsightStatCard('Avg coverage', `${averageCoverage}%`)}
    </div>
    
    <div class="insight-chart-grid">
      <div class="insight-chart-card">
        <div class="insight-chart-heading">
          <h3>Submission Status</h3>
          <span class="insight-chart-total">${totalRecords} total</span>
        </div>
        <div class="insight-bar-chart">
          ${renderInsightBarRow('Complete', completeCount, totalRecords, 'coverage-complete')}
          ${renderInsightBarRow('Needs Review', needsReviewCount, totalRecords, 'status-pending-doctoral-attainment')}
          ${renderInsightBarRow('Incomplete', incompleteCount, totalRecords, 'coverage-missing')}
        </div>
      </div>
      
      <div class="insight-chart-card">
        <div class="insight-chart-heading">
          <h3>Score Distribution</h3>
          <span class="insight-chart-total">Weighted score</span>
        </div>
        <div class="insight-bar-chart">
          ${Object.entries(scoreBrackets).reverse().map(([label, count]) => renderInsightBarRow(label, count, totalRecords, 'coverage-strong')).join('')}
        </div>
      </div>
      
      <div class="insight-chart-card">
        <div class="insight-chart-heading">
          <h3>Evidence Bottlenecks</h3>
          <span class="insight-chart-total">Missing panels</span>
        </div>
        <div class="insight-bar-chart">
          ${topMissingPanels.length ? topMissingPanels.map(([label, count]) => renderInsightBarRow(label, count, totalRecords, 'status-pending-doctoral-attainment')).join('') : '<div class="insight-bar-label">No missing evidence found</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderInsightBarRow(label, value, total, toneClass) {
  const percent = total > 0 ? (value / total) * 100 : 0;
  return `
    <div class="insight-bar-row">
      <span class="insight-bar-label">${escapeHtml(label)}</span>
      <div class="insight-bar-track">
        <span class="insight-bar-fill" data-tone="${toneClass}" style="width: ${percent}%"></span>
      </div>
      <strong class="insight-bar-value">${value}</strong>
    </div>
  `;
}

function handlePrintActionClick(event) {
  const button = event.target.closest('button[data-print-action="print"]');
  if (!button) {
    return;
  }

  const targetId = button.dataset.printTarget || '';
  const target = targetId ? document.getElementById(targetId) : null;
  if (!target) {
    return;
  }

  document.querySelectorAll('.print-active').forEach((el) => el.classList.remove('print-active'));
  target.classList.add('print-active');
  document.body.classList.add('print-mode');
  window.print();
}

function clearPrintMode() {
  document.body.classList.remove('print-mode');
  document.querySelectorAll('.print-active').forEach((el) => el.classList.remove('print-active'));
}

function renderFacultySummaryTable(items) {
  if (!evaluatorFacultySummary) {
    return;
  }

  if (!items.length) {
    evaluatorFacultySummary.innerHTML = '<div class="notice">No faculty records available yet.</div>';
    return;
  }

  const rows = [...items].sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  const generatedOn = formatDate(new Date().toISOString());

  evaluatorFacultySummary.innerHTML = `
    <div id="evaluator-faculty-summary-print-area">
      <p class="print-only print-heading">Faculty Rank Summary - generated ${escapeHtml(generatedOn)}</p>
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Faculty</th>
              <th>Faculty ID</th>
              <th>Current Rank</th>
              <th>Projected Rank</th>
              <th>Weighted Score</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(renderFacultySummaryRow).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderFacultySummaryRow(item) {
  const promotionDraft = item.draftPoints?.promotionDraft || {};
  const statusInfo = formatPromotionStatus(promotionDraft.status);

  return `
    <tr>
      <td>${escapeHtml(item.name || 'Unnamed faculty member')}</td>
      <td>${escapeHtml(item.employeeId || 'N/A')}</td>
      <td>${escapeHtml(promotionDraft.currentRank || 'Not set')}</td>
      <td>${escapeHtml(promotionDraft.suggestedRank || 'Pending')}</td>
      <td>${escapeHtml(formatOptionalNumber(promotionDraft.weightedScore, 'Pending'))}</td>
      <td><span class="badge badge-${statusInfo.tone}">${escapeHtml(statusInfo.label)}</span></td>
    </tr>
  `;
}

function formatPromotionStatus(status) {
  switch (status) {
    case 'ready':
      return { label: 'Ready for promotion', tone: 'success' };
    case 'preliminary':
      return { label: 'Preliminary estimate', tone: 'neutral' };
    case 'pending':
      return { label: 'Pending (incomplete evidence)', tone: 'warning' };
    case 'needs-exact-rank':
      return { label: 'Needs exact rank', tone: 'warning' };
    case 'pending-doctoral-attainment':
      return { label: 'Pending doctoral attainment', tone: 'warning' };
    case 'pending-professor-accreditation':
      return { label: 'Pending professor accreditation', tone: 'warning' };
    case 'pending-cup-certification':
      return { label: 'Pending CUP certification', tone: 'warning' };
    default:
      return { label: 'Not set', tone: 'neutral' };
  }
}

function renderReviewQueue(items) {
  if (!reviewQueue) {
    return;
  }

  if (!items.length) {
    reviewQueue.innerHTML = '<div class="notice">No faculty submissions are waiting in the evaluator queue.</div>';
    return;
  }

  reviewQueue.innerHTML = `
    <div class="review-queue">
      ${items.map(renderReviewCard).join('')}
    </div>
  `;
}

function renderReviewCard(item) {
  const uploads = Array.isArray(item.uploadLogs) ? item.uploadLogs : [];
  const draftPoints = item.draftPoints || {};
  const promotionDraft = draftPoints.promotionDraft || {};
  const scoreComputation = draftPoints.scoreComputation || {};
  const latestTraining = item.latestTrainingItem?.evaluatorAssessment || null;
  const isApproved = item.latestTrainingItem?.status === 'VALIDATED';
  const evidenceScore = formatOptionalNumber(scoreComputation.weightedScore ?? scoreComputation.rawTotal, '0.00');
  const systemScore = formatOptionalNumber(promotionDraft.weightedScore, 'Pending');

  return `
    <article class="card review-card">
      <div class="training-example-header">
        <div class="review-card-identity">
          <strong>${escapeHtml(item.name || 'Unnamed faculty member')}</strong>
          <span class="review-rank-chip">${escapeHtml(item.employeeId || 'No Faculty ID')}</span>
        </div>
      </div>
      <div class="review-card-meta">
        <span class="review-meta-chip">Submitted by ${escapeHtml(item.createdBy?.fullName || '-')}</span>
        <span class="review-meta-chip">Cycle ${escapeHtml(item.cycleData?.performanceReview?.reviewPeriod || item.semester || 'Current cycle')}</span>
        <span class="review-meta-chip">Evidence score ${escapeHtml(evidenceScore)}</span>
        <span class="review-meta-chip">${escapeHtml(String(uploads.length))} file(s)</span>
      </div>
      <div class="review-card-metrics">
        ${renderReviewMetric('Current rank', promotionDraft.currentRank || 'Not set')}
        ${renderReviewMetric('Projected rank', promotionDraft.suggestedRank || 'Pending')}
        ${renderReviewMetric('Weighted score', systemScore, true)}
        ${renderReviewMetric('Evaluator total', formatOptionalNumber(latestTraining?.totalScore, 'Pending'))}
      </div>
      <div class="uploaded-file-actions">
        <button class="button ${isApproved ? 'button-secondary' : 'button-primary'} approve-draft-button" data-profile-id="${escapeHtml(item.id)}" data-profile-name="${escapeHtml(item.name || 'this faculty member')}" data-upload-action="approve" type="button">${isApproved ? 'Re-approve draft score' : 'Approve draft score'}</button>
        ${isApproved ? '<span class="review-meta-chip">Approved by evaluator</span>' : ''}
      </div>
      ${draftPoints.note ? `<p class="card-copy review-card-note">${escapeHtml(draftPoints.note)}</p>` : ''}
      <p class="card-copy">${escapeHtml(scoreComputation.note || 'Missing evidence is counted as 0 for the computed score.')}</p>
      <div class="uploaded-files-group">
        <div class="uploaded-files-group-header">
          <h3>Uploaded documents</h3>
          <span>${escapeHtml(String(uploads.length))} file(s)</span>
        </div>
        <div class="uploaded-files-list">
          ${uploads.map(renderEvaluatorUploadRow).join('')}
        </div>
      </div>
    </article>
  `;
}

function renderAccountsPanel(accounts) {
  if (!adminAccounts) {
    return;
  }

  if (!accounts.length) {
    adminAccounts.innerHTML = '<div class="notice">No accounts found.</div>';
    return;
  }

  adminAccounts.innerHTML = `
    <div class="uploaded-files-list">
      ${accounts.map(renderAccountRow).join('')}
    </div>
  `;
}

function renderAccountRow(account) {
  const isSelf = currentUser?.id === account.id;
  const statusState = account.accountActive ? 'active' : 'inactive';
  const statusLabel = account.accountActive ? 'Active' : 'Deactivated';
  const counts = account.counts || {};

  return `
    <article class="account-row">
      <div class="account-info">
        <strong>${escapeHtml(account.fullName)}${isSelf ? ' (You)' : ''}</strong>
        <span>${escapeHtml(account.email)}</span>
        <span class="account-role-chip">${escapeHtml(prettyRole(account.role))}</span>
        <span class="account-status-pill" data-state="${statusState}">${escapeHtml(statusLabel)}</span>
        <span class="account-meta">Joined ${escapeHtml(formatDate(account.createdAt))}</span>
        <span class="account-meta">${escapeHtml(String(counts.profiles ?? 0))} profile(s) &middot; ${escapeHtml(String(counts.documents ?? 0))} document(s)</span>
      </div>
      <div class="account-actions">
        ${
          isSelf
            ? '<span class="account-meta">No self-actions</span>'
            : `<button class="button button-secondary" type="button" data-account-action="reset-password" data-account-id="${escapeHtml(account.id)}" data-account-name="${escapeHtml(account.fullName)}">Reset Password</button>${
                account.accountActive
                  ? `<button class="button button-secondary" type="button" data-account-action="deactivate" data-account-id="${escapeHtml(account.id)}" data-account-name="${escapeHtml(account.fullName)}">Deactivate</button>`
                  : `<button class="button button-secondary" type="button" data-account-action="reactivate" data-account-id="${escapeHtml(account.id)}" data-account-name="${escapeHtml(account.fullName)}">Reactivate</button>`
              }<button class="button button-danger" type="button" data-account-action="delete" data-account-id="${escapeHtml(account.id)}" data-account-name="${escapeHtml(account.fullName)}">Delete</button>`
        }
      </div>
    </article>
  `;
}

function handleAccountsActionClick(event) {
  const button = event.target.closest('button[data-account-action]');
  if (!button) {
    return;
  }

  const action = button.dataset.accountAction;
  const accountId = button.dataset.accountId || '';
  const accountName = button.dataset.accountName || 'this account';
  if (!accountId) {
    return;
  }

  if (action === 'reset-password') {
    void resetPasswordAction(accountId, accountName);
    return;
  }

  if (action === 'deactivate') {
    void deactivateAccountAction(accountId, accountName);
    return;
  }

  if (action === 'reactivate') {
    void reactivateAccountAction(accountId, accountName);
    return;
  }

  if (action === 'delete') {
    void deleteAccountAction(accountId, accountName);
  }
}

async function resetPasswordAction(accountId, accountName) {
  const confirmed = window.confirm(
    `Reset ${accountName}'s password? Their current password stops working immediately, and a new temporary password will be generated for you to share with them securely.`,
  );
  if (!confirmed) {
    return;
  }

  try {
    setNotice(adminAccountsStatus, `Resetting password for ${accountName}...`);
    const data = await apiFetch(`/api/accounts/${encodeURIComponent(accountId)}/reset-password`, { method: 'POST' });
    setNotice(adminAccountsStatus, `Temporary password generated for ${accountName}. Share it with them securely - it will not be shown again.`, false, true);
    window.prompt(`Temporary password for ${accountName} (copy now - it will not be shown again):`, data.temporaryPassword);
  } catch (error) {
    setNotice(adminAccountsStatus, toErrorMessage(error), true);
  }
}

async function deactivateAccountAction(accountId, accountName) {
  const confirmed = window.confirm(`Deactivate ${accountName}? They will be signed out and unable to log in until reactivated.`);
  if (!confirmed) {
    return;
  }

  try {
    setNotice(adminAccountsStatus, `Deactivating ${accountName}...`);
    await apiFetch(`/api/accounts/${encodeURIComponent(accountId)}/deactivate`, { method: 'PATCH' });
    setNotice(adminAccountsStatus, `${accountName} was deactivated.`);
    await loadEvaluatorWorkspace();
  } catch (error) {
    setNotice(adminAccountsStatus, toErrorMessage(error), true);
  }
}

async function reactivateAccountAction(accountId, accountName) {
  try {
    setNotice(adminAccountsStatus, `Reactivating ${accountName}...`);
    await apiFetch(`/api/accounts/${encodeURIComponent(accountId)}/reactivate`, { method: 'PATCH' });
    setNotice(adminAccountsStatus, `${accountName} was reactivated.`);
    await loadEvaluatorWorkspace();
  } catch (error) {
    setNotice(adminAccountsStatus, toErrorMessage(error), true);
  }
}

async function deleteAccountAction(accountId, accountName) {
  const confirmed = window.confirm(
    `Permanently delete ${accountName}'s account? This cannot be undone. Their uploaded documents and profiles will remain but no longer be linked to an account.`,
  );
  if (!confirmed) {
    return;
  }

  try {
    setNotice(adminAccountsStatus, `Deleting ${accountName}...`);
    await apiFetch(`/api/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
    setNotice(adminAccountsStatus, `${accountName} was deleted.`);
    await loadEvaluatorWorkspace();
  } catch (error) {
    setNotice(adminAccountsStatus, toErrorMessage(error), true);
  }
}

function renderEvaluatorWorkbooks(items) {
  if (!evaluatorWorkbookRequestForm || !evaluatorWorkbookSummarySheet) {
    return;
  }

  if (!items.length) {
    evaluatorWorkbookRequestForm.innerHTML = '<div class="notice">No faculty submissions available.</div>';
    evaluatorWorkbookSummarySheet.innerHTML = '<div class="notice">No faculty submissions available.</div>';
    return;
  }

  evaluatorWorkbookRequestForm.innerHTML = items.map(renderRequestForm).join('<hr />');
  evaluatorWorkbookSummarySheet.innerHTML = items.map(renderSummarySheet).join('<hr />');
}

function renderRequestForm(item) {
  const requestForm = item.draftPoints?.workbookMirror?.requestForm || {};
  return `
    <article class="card">
      <div class="card-header">
        <h3>${escapeHtml(item.name || 'Unnamed faculty member')} - Request Form</h3>
      </div>
      <div class="table-scroll">
        <table class="table">
          <tbody>
            <tr><th>Full Name</th><td>${escapeHtml(requestForm.fullName || 'N/A')}</td></tr>
            <tr><th>Faculty ID</th><td>${escapeHtml(requestForm.employeeId || 'N/A')}</td></tr>
            <tr><th>Academic Rank</th><td>${escapeHtml(requestForm.academicRank || 'N/A')}</td></tr>
            <tr><th>Highest Educational Attainment</th><td>${escapeHtml(requestForm.highestEducationalAttainment || 'N/A')}</td></tr>
            <tr><th>Review Period</th><td>${escapeHtml(requestForm.reviewPeriod || 'N/A')}</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderSummarySheet(item) {
  const summarySheet = item.draftPoints?.workbookMirror || {};
  const kraSections = Array.isArray(summarySheet.kraSections) ? summarySheet.kraSections : [];
  const profileId = item.id || '';
  const printTargetId = `summary-sheet-${profileId || 'unknown'}`;

  return `
    <article class="card" id="${escapeHtml(printTargetId)}">
      <div class="card-header">
        <h3>${escapeHtml(item.name || 'Unnamed faculty member')} - Summary Sheet</h3>
        <button class="button button-secondary button-small" type="button" data-print-action="print" data-print-target="${escapeHtml(printTargetId)}">Print / Save as PDF</button>
      </div>
      <p class="print-only print-heading">${escapeHtml(item.name || 'Unnamed faculty member')} - Summary Sheet</p>
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>KRA / Criterion</th>
              <th>Max Score</th>
              <th>System Score</th>
              <th>Evaluator Validated</th>
              <th>Status</th>
              <th>Evaluator Decision</th>
            </tr>
          </thead>
          <tbody>
            ${kraSections.map(kra => `
              <tr class="table-row-kra">
                <td colspan="6"><strong>${escapeHtml(kra.title)}</strong> (Max: ${kra.maxScore}) - Faculty Total: ${kra.facultyScore}, Validated Total: ${kra.validatedScore}</td>
              </tr>
              ${kra.criteria.map(crit => renderCriterionRow(profileId, crit)).join('')}
            `).join('')}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderCriterionRow(profileId, crit) {
  const decision = crit.reviewDecision || 'PENDING';
  const rowClass = decision === 'DISAPPROVED' ? 'table-row-disapproved' : crit.status === 'needs-review' ? 'table-row-warning' : '';
  const isApproved = decision === 'APPROVED';
  const isDisapproved = decision === 'DISAPPROVED';

  return `
    <tr class="${rowClass}">
      <td>${escapeHtml(crit.title)}</td>
      <td>${crit.maxScore}</td>
      <td>${crit.facultyScore ?? '0'}</td>
      <td>${crit.validatedScore ?? 'Pending'}</td>
      <td>
        <span class="badge badge-${crit.status === 'needs-review' ? 'danger' : crit.status === 'matched' ? 'success' : 'neutral'}">
          ${escapeHtml(crit.status)}
        </span>
      </td>
      <td>
        <div class="criterion-review-actions">
          <button
            class="button button-primary button-small"
            type="button"
            aria-pressed="${isApproved}"
            data-upload-action="approve-criterion"
            data-profile-id="${escapeHtml(profileId)}"
            data-panel-key="${escapeHtml(crit.key)}"
            data-criterion-title="${escapeHtml(crit.title)}"
          >${isApproved ? 'Approved' : 'Approve'}</button>
          <button
            class="button button-danger button-small"
            type="button"
            aria-pressed="${isDisapproved}"
            data-upload-action="disapprove-criterion"
            data-profile-id="${escapeHtml(profileId)}"
            data-panel-key="${escapeHtml(crit.key)}"
            data-criterion-title="${escapeHtml(crit.title)}"
          >${isDisapproved ? 'Disapproved' : 'Disapprove'}</button>
        </div>
      </td>
    </tr>
  `;
}

function renderEvaluatorUploadRow(upload) {
  const kraLabel = getKraLabel(upload.metadata?.panelKey) || 'Unassigned';
  const previewLabel = getPreviewActionLabel(upload.mimeType);

  return `
    <article class="uploaded-file-row">
      <div class="uploaded-file-info">
        <strong>${escapeHtml(upload.originalName)}</strong>
        <span class="uploaded-file-panel">${escapeHtml(getUploadTypeLabel(upload.metadata?.uploadType))}</span>
        <span class="uploaded-file-panel">${escapeHtml(kraLabel)}</span>
        <span class="uploaded-file-panel">${escapeHtml(upload.metadata?.panelTitle || upload.metadata?.panelKey || 'Unassigned')}</span>
        <span class="uploaded-file-date">${escapeHtml(formatDate(upload.createdAt))}</span>
      </div>
      <div class="uploaded-file-summary">
        <p class="card-copy">${escapeHtml(upload.metadata?.analysisSummary || 'OCR summary pending.')}</p>
        <div class="uploaded-file-actions">
          <button class="button button-secondary preview-upload-button" data-document-id="${escapeHtml(upload.id)}" data-file-name="${escapeHtml(upload.originalName)}" data-mime-type="${escapeHtml(upload.mimeType || '')}" data-upload-action="preview" type="button">${escapeHtml(previewLabel)}</button>
          ${
            portal === 'admin'
              ? `<button class="button button-danger delete-upload-button" data-document-id="${escapeHtml(upload.id)}" data-file-name="${escapeHtml(upload.originalName)}" data-upload-action="delete" type="button">Delete</button>`
              : ''
          }
        </div>
      </div>
    </article>
  `;
}

function getPanelComputedScore(scoreComputation, panelKey) {
  if (!scoreComputation || !Array.isArray(scoreComputation.panelScores)) {
    return null;
  }

  return scoreComputation.panelScores.find((panel) => panel.key === panelKey) || null;
}

function renderComputedPanelScore(computedScore, fallbackMaxScore) {
  if (!computedScore) {
    return `
      <div class="upload-score-preview" data-status="pending">
        <span>Computed score</span>
        <strong>0 / ${escapeHtml(String(fallbackMaxScore))}</strong>
        <small>Upload documentary evidence to count this panel.</small>
      </div>
    `;
  }

  return `
    <div class="upload-score-preview" data-status="${computedScore.status === 'counted' ? 'detected' : 'pending'}">
      <span>Computed score</span>
      <strong>${escapeHtml(formatScoreWithMax(computedScore.usedScore, computedScore.maxScore))}</strong>
      <small>${escapeHtml(computedScore.note || getComputedStatusLabel(computedScore.status))}</small>
    </div>
  `;
}

function formatScoreWithMax(score, maxScore) {
  const boundedMax = Number.isFinite(Number(maxScore)) ? Number(maxScore) : 0;
  return `${formatNumber(score)} / ${boundedMax.toFixed(0)}`;
}

function getComputedStatusLabel(status) {
  if (status === 'counted') {
    return 'Counted toward the evidence-based draft score.';
  }
  if (status === 'missing-evidence') {
    return 'No evidence uploaded. Scored as 0.';
  }
  return 'Not required for the base packet.';
}

// BUG #4 FIX: File size threshold for user warning (4 MB = safe for Vercel body limit)
const SAFE_FILE_SIZE_BYTES = 4 * 1024 * 1024;

// BUG #5/6/7 FIX: Accepts the actual submitted form as a second argument (event delegation)
async function handleUploadSubmit(event, form) {
  event.preventDefault();

  // Always resolve the form from the event — never trust event.currentTarget with delegation
  const targetForm = form || event.target?.closest('.workflow-upload-form');
  if (!targetForm) return;

  const uploadType = targetForm.dataset.uploadType || 'legacy';
  // BUG FIX: panelKey is always read from the submitted form's own data attribute
  const panelKey = targetForm.dataset.panelKey || '';
  const fileInput = targetForm.querySelector('input[type="file"]');
  const documentTypeSelect = targetForm.querySelector('.upload-document-type-select');
  const documentType = documentTypeSelect?.value || '';
  const files = Array.from(fileInput?.files || []);
  const sizeWarning = targetForm.querySelector('.upload-size-warning');
  const progressPanel = targetForm.querySelector('.upload-progress-panel');
  const progressFill = targetForm.querySelector('.upload-progress-fill-panel');
  const progressLabel = targetForm.querySelector('.upload-progress-label-panel');

  if (!files.length) {
    setNotice(employeeUploadStatus, 'Choose at least one file first.', true);
    return;
  }

  // BUG #4 FIX: Warn about oversized files before attempting upload
  const oversizedFiles = files.filter((f) => f.size > SAFE_FILE_SIZE_BYTES);
  if (sizeWarning) {
    if (oversizedFiles.length && !storageConfig.directUploadEnabled) {
      sizeWarning.hidden = false;
      sizeWarning.textContent = `⚠ ${oversizedFiles.map((f) => f.name).join(', ')} exceed${oversizedFiles.length === 1 ? 's' : ''} 4 MB. Upload may fail on the current plan — direct upload is not yet configured.`;
    } else {
      sizeWarning.hidden = true;
    }
  }

  const panelLabel = targetForm.closest('.upload-card')?.querySelector('h4')?.textContent?.trim() || 'this panel';
  setSubmitButtonState(targetForm, true);
  setNotice(
    employeeUploadStatus,
    uploadType === 'score-sheet'
      ? `Uploading ${panelLabel} score sheet...`
      : `Uploading ${panelLabel} evidence...`,
  );

  // BUG #1/#3 FIX: Show per-panel progress bar
  if (progressPanel) progressPanel.hidden = false;
  if (progressFill) progressFill.style.width = '5%';
  if (progressLabel) progressLabel.textContent = `Uploading ${files.length} file${files.length === 1 ? '' : 's'}...`;

  try {
    if (storageConfig.directUploadEnabled) {
      // BUG #1 FIX: Direct-to-Supabase upload — no Vercel body size limit
      await uploadFilesDirectToSupabase({ files, panelKey, uploadType, documentType, progressFill, progressLabel });
    } else {
      // Fallback: server-side upload (limited to Vercel's 4.5 MB body cap)
      const formData = new FormData();
      formData.append('uploadType', uploadType);
      if (panelKey) formData.append('panelKey', panelKey);
      if (documentType) formData.append('documentType', documentType);
      formData.append('kind', 'REQUIREMENT');
      for (const file of files) formData.append('document', file);
      if (progressFill) progressFill.style.width = '50%';
      await apiFetch('/api/documents/extract', { method: 'POST', body: formData });
      if (progressFill) progressFill.style.width = '100%';
    }

    setNotice(employeeUploadStatus, `✓ ${panelLabel} evidence uploaded. OCR is processing now.`);
    // BUG #3 FIX: Refresh workspace without blocking other panels' uploads
    loadEmployeeWorkspace().catch((err) => setNotice(employeeUploadStatus, toErrorMessage(err), true));
  } catch (error) {
    setNotice(employeeUploadStatus, toErrorMessage(error), true);
    if (progressPanel) progressPanel.hidden = true;
  } finally {
    setSubmitButtonState(targetForm, false);
  }
}

/**
 * Direct-to-Supabase upload flow:
 * 1. Request a signed upload URL from the backend (tiny JSON request — no file payload)
 * 2. PUT the file directly to Supabase Storage from the browser
 * 3. POST the storage path to /api/documents/register so the server can run OCR
 *
 * BUG #1 FIX: This completely bypasses Vercel's 4.5 MB serverless body limit
 * because the file bytes never go through the serverless function.
 */
async function uploadFilesDirectToSupabase({ files, panelKey, uploadType, documentType, progressFill, progressLabel }) {
  const total = files.length;
  for (let i = 0; i < total; i++) {
    const file = files[i];
    if (progressLabel) progressLabel.textContent = `Uploading file ${i + 1} of ${total}: ${file.name}...`;
    if (progressFill) progressFill.style.width = `${Math.round(((i) / total) * 60) + 5}%`;

    // Step 1: Get a signed URL from the backend
    const { signedUrl, storagePath } = await apiFetch('/api/documents/signed-upload-url', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, mimeType: file.type }),
    });

    // Step 2: Upload directly to Supabase from the browser
    const uploadResponse = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Storage upload failed for ${file.name}: ${uploadResponse.statusText}`);
    }
    if (progressFill) progressFill.style.width = `${Math.round(((i + 0.7) / total) * 60) + 5}%`;

    // Step 3: Register with the backend for OCR + database record
    if (progressLabel) progressLabel.textContent = `Processing OCR for ${file.name}...`;
    await apiFetch('/api/documents/register', {
      method: 'POST',
      body: JSON.stringify({
        storagePath,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        kind: 'REQUIREMENT',
        panelKey,
        uploadType,
        documentType: documentType || undefined,
      }),
    });
    if (progressFill) progressFill.style.width = `${Math.round(((i + 1) / total) * 100)}%`;
  }
}

function setSubmitButtonState(form, isLoading) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) {
    return;
  }

  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = button.textContent || '';
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? 'Uploading...' : button.dataset.originalLabel || button.textContent;
}

function buildUploadTypeCounts(uploads) {
  return uploads.reduce((counts, upload) => {
    const key = upload.metadata?.uploadType || 'legacy';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function groupPanelsByKra(panels) {
  const grouped = new Map();

  panels.forEach((panel) => {
    const kraTitle = panel.kraTitle || 'Other';
    if (!grouped.has(kraTitle)) {
      grouped.set(kraTitle, []);
    }
    grouped.get(kraTitle).push(panel);
  });

  return Array.from(grouped.entries());
}

function getPanelUploadCount(panelKey, uploads, uploadType) {
  return uploads.filter((upload) => upload.metadata?.panelKey === panelKey && upload.metadata?.uploadType === uploadType).length;
}

function hasPanelUpload(panelKey, uploads, uploadType) {
  return getPanelUploadCount(panelKey, uploads, uploadType) > 0;
}

function ensureDocumentPreviewShell() {
  if (!documentPreviewModal || !documentPreviewFrame || !documentPreviewTitle || !documentPreviewMeta) {
    console.warn('Document preview shell is missing from the page.');
  }
}

function groupUploadsByKra(uploads) {
  return uploads.reduce((groups, upload) => {
    const key = getKraLabel(upload.metadata?.panelKey);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(upload);
    return groups;
  }, {});
}

function getKraLabel(panelKey) {
  if (typeof panelKey !== 'string') {
    return null;
  }

  if (panelKey.startsWith('kra1_')) {
    return 'KRA I - Instruction';
  }

  if (panelKey.startsWith('kra2_')) {
    return 'KRA II - Research, Innovation and/or Creative Work';
  }

  if (panelKey.startsWith('kra3_')) {
    return 'KRA III - Extension Services';
  }

  if (panelKey.startsWith('kra4_')) {
    return 'KRA IV - Professional Development';
  }

  return null;
}

function getPreviewActionLabel(mimeType) {
  if (typeof mimeType === 'string' && mimeType.toLowerCase() === 'application/pdf') {
    return 'View PDF';
  }

  return 'View File';
}

function getUploadTypeLabel(uploadType) {
  if (uploadType === 'score-sheet') {
    return 'Score Sheet';
  }

  if (uploadType === 'evidence') {
    return 'Evidence';
  }

  return 'Legacy';
}

function handleUploadListActionClick(event) {
  const button = event.target.closest('button[data-upload-action]');
  if (!button) {
    return;
  }

  const action = button.dataset.uploadAction;
  const documentId = button.dataset.documentId || '';
  const fileName = button.dataset.fileName || 'this file';
  const mimeType = button.dataset.mimeType || '';
  const panelKey = button.dataset.panelKey || '';
  const uploadType = button.dataset.uploadType || 'legacy';

  if (!documentId) {
    return;
  }

  if (action === 'preview') {
    void openDocumentPreview({
      documentId,
      fileName,
      mimeType,
    });
    return;
  }

  if (action === 'delete') {
    void deleteUploadDocument(documentId, fileName);
    return;
  }

  if (action === 'replace') {
    void replaceUploadDocument({
      documentId,
      fileName,
      panelKey,
      uploadType,
    });
  }
}

function handleReviewQueueActionClick(event) {
  const approveButton = event.target.closest('button[data-upload-action="approve"]');
  if (approveButton) {
    const profileId = approveButton.dataset.profileId || '';
    const profileName = approveButton.dataset.profileName || 'this faculty member';
    if (profileId) {
      void approveDraftScore(profileId, profileName);
    }
    return;
  }

  const criterionButton = event.target.closest(
    'button[data-upload-action="approve-criterion"], button[data-upload-action="disapprove-criterion"]',
  );
  if (criterionButton) {
    const profileId = criterionButton.dataset.profileId || '';
    const panelKey = criterionButton.dataset.panelKey || '';
    const criterionTitle = criterionButton.dataset.criterionTitle || 'this criterion';
    const decision = criterionButton.dataset.uploadAction === 'approve-criterion' ? 'APPROVED' : 'DISAPPROVED';
    if (profileId && panelKey) {
      void setCriterionDecision(profileId, panelKey, decision, criterionTitle);
    }
    return;
  }

  const deleteButton = event.target.closest('button[data-upload-action="delete"]');
  if (deleteButton) {
    const documentId = deleteButton.dataset.documentId || '';
    const fileName = deleteButton.dataset.fileName || 'this file';
    if (documentId) {
      void deleteUploadDocument(documentId, fileName);
    }
    return;
  }

  const button = event.target.closest('button[data-upload-action="preview"]');
  if (!button) {
    return;
  }

  const documentId = button.dataset.documentId || '';
  const fileName = button.dataset.fileName || 'this file';
  const mimeType = button.dataset.mimeType || '';
  if (!documentId) {
    return;
  }

  void openDocumentPreview({
    documentId,
    fileName,
    mimeType,
  });
}

async function approveDraftScore(profileId, profileName) {
  const confirmed = window.confirm(`Approve the current system-computed draft score for ${profileName}? This records your endorsement as the evaluator total.`);
  if (!confirmed) {
    return;
  }

  try {
    setNotice(reviewQueueFilterStatus, `Approving draft score for ${profileName}...`);
    await apiFetch(`/api/training/profiles/${encodeURIComponent(profileId)}/approve`, {
      method: 'POST',
    });
    setNotice(reviewQueueFilterStatus, `Draft score approved for ${profileName}.`);
    await loadEvaluatorWorkspace();
  } catch (error) {
    setNotice(reviewQueueFilterStatus, toErrorMessage(error), true);
  }
}

async function setCriterionDecision(profileId, panelKey, decision, criterionTitle) {
  const verb = decision === 'APPROVED' ? 'Approving' : 'Disapproving';
  try {
    setNotice(reviewQueueFilterStatus, `${verb} ${criterionTitle}...`);
    await apiFetch(`/api/review/${encodeURIComponent(profileId)}/criteria/${encodeURIComponent(panelKey)}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision }),
    });
    setNotice(
      reviewQueueFilterStatus,
      `${criterionTitle} was ${decision === 'APPROVED' ? 'approved' : 'disapproved'}.`,
    );
    await loadEvaluatorWorkspace();
  } catch (error) {
    setNotice(reviewQueueFilterStatus, toErrorMessage(error), true);
  }
}

async function deleteUploadDocument(documentId, fileName) {
  const confirmed = window.confirm(`Delete ${fileName}? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  try {
    setNotice(employeeUploadStatus || reviewQueueFilterStatus, `Deleting ${fileName}...`);
    await apiFetch(`/api/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
    });
    setNotice(employeeUploadStatus || reviewQueueFilterStatus, `${fileName} was deleted.`);
    await loadEmployeeWorkspace();
    if (portal === 'evaluator' || portal === 'admin') {
      await loadEvaluatorWorkspace();
    }
  } catch (error) {
    setNotice(employeeUploadStatus || reviewQueueFilterStatus, toErrorMessage(error), true);
  }
}

async function replaceUploadDocument({ documentId, fileName, panelKey, uploadType }) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = REPLACEMENT_UPLOAD_ACCEPT;

  input.addEventListener(
    'change',
    async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }

      const formData = new FormData();
      formData.append('document', file);
      formData.append('kind', 'REQUIREMENT');
      formData.append('uploadType', uploadType || 'legacy');
      if (panelKey) {
        formData.append('panelKey', panelKey);
      }

      try {
        setNotice(employeeUploadStatus || reviewQueueFilterStatus, `Replacing ${fileName}...`);
        await apiFetch(`/api/documents/${encodeURIComponent(documentId)}/replace`, {
          method: 'POST',
          body: formData,
        });
        setNotice(employeeUploadStatus || reviewQueueFilterStatus, `${fileName} was replaced.`);
        await loadEmployeeWorkspace();
      } catch (error) {
        setNotice(employeeUploadStatus || reviewQueueFilterStatus, toErrorMessage(error), true);
      }
    },
    { once: true },
  );

  input.click();
}

async function openDocumentPreview({ documentId, fileName, mimeType }) {
  if (!documentPreviewModal || !documentPreviewFrame || !documentPreviewTitle || !documentPreviewMeta) {
    return;
  }

  const requestToken = ++documentPreviewRequestToken;
  lastDocumentPreviewRequest = { documentId, fileName, mimeType };
  const previewUrl = buildApiUrl(`/api/documents/${encodeURIComponent(documentId)}/view`);
  if (currentDocumentPreviewUrl) {
    URL.revokeObjectURL(currentDocumentPreviewUrl);
    currentDocumentPreviewUrl = null;
  }
  if (documentPreviewLoadTimer) {
    window.clearTimeout(documentPreviewLoadTimer);
    documentPreviewLoadTimer = null;
  }

  documentPreviewTitle.textContent = fileName;
  documentPreviewMeta.textContent = mimeType ? `Previewing ${mimeType}` : 'Previewing uploaded file';
  documentPreviewFrame.src = 'about:blank';
  documentPreviewFrame.hidden = true;
  setDocumentPreviewStatus('loading', 'Loading preview...', 'Fetching the file so you can review it here.', false);
  documentPreviewModal.dataset.open = 'true';
  documentPreviewModal.hidden = false;
  document.body.classList.add('preview-open');

  try {
    const response = await fetch(previewUrl, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(await readFetchErrorMessage(response));
    }

    const fileBlob = await response.blob();
    if (requestToken !== documentPreviewRequestToken) {
      return;
    }

    currentDocumentPreviewUrl = URL.createObjectURL(fileBlob);
    documentPreviewFrame.addEventListener(
      'load',
      () => {
        if (requestToken !== documentPreviewRequestToken) {
          return;
        }

        if (documentPreviewLoadTimer) {
          window.clearTimeout(documentPreviewLoadTimer);
          documentPreviewLoadTimer = null;
        }

        setDocumentPreviewStatus('ready', '', '', false);
        documentPreviewFrame.hidden = false;
      },
      { once: true },
    );
    documentPreviewFrame.src = currentDocumentPreviewUrl;
    documentPreviewLoadTimer = window.setTimeout(() => {
      if (requestToken !== documentPreviewRequestToken) {
        return;
      }

      showDocumentPreviewError('The preview is taking longer than expected. Try opening it again.');
    }, 12000);
  } catch (error) {
    if (requestToken !== documentPreviewRequestToken) {
      return;
    }

    showDocumentPreviewError(toErrorMessage(error));
  }
}

function closeDocumentPreview() {
  if (!documentPreviewModal || !documentPreviewFrame) {
    return;
  }

  documentPreviewRequestToken += 1;
  if (currentDocumentPreviewUrl) {
    URL.revokeObjectURL(currentDocumentPreviewUrl);
    currentDocumentPreviewUrl = null;
  }
  if (documentPreviewLoadTimer) {
    window.clearTimeout(documentPreviewLoadTimer);
    documentPreviewLoadTimer = null;
  }
  documentPreviewFrame.src = 'about:blank';
  documentPreviewFrame.hidden = true;
  documentPreviewModal.dataset.open = 'false';
  documentPreviewModal.hidden = true;
  document.body.classList.remove('preview-open');
  setDocumentPreviewStatus('idle', '', '', true);
}

function handleDocumentPreviewKeydown(event) {
  if (event.key !== 'Escape') {
    return;
  }

  closeDocumentPreview();
}

function renderInsightStatCard(label, value) {
  return `
    <article class="insight-stat-card">
      <span class="insight-stat-label">${escapeHtml(label)}</span>
      <strong class="insight-stat-value">${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderReviewMetric(label, value, emphasis = false) {
  return `
    <article class="review-card-metric${emphasis ? ' review-card-metric-emphasis' : ''}">
      <span class="review-card-metric-label">${escapeHtml(label)}</span>
      <strong class="review-card-metric-value">${escapeHtml(value)}</strong>
    </article>
  `;
}

function prettyRole(role) {
  if (role === 'EVALUATOR') {
    return 'Evaluator';
  }
  if (role === 'EMPLOYEE') {
    return 'Faculty';
  }
  return 'Admin';
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '0.00';
}

function formatOptionalNumber(value, fallback = '-') {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : fallback;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString();
}

function setNotice(element, message, isError = false) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.dataset.state = isError ? 'error' : 'info';
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function logoutAndReturnHome() {
  try {
    await fetch(buildApiUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: 'include',
    });
  } finally {
    window.location.assign('/');
  }
}

async function apiFetch(path, init = {}) {
  const isFormData = init.body instanceof FormData;
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readErrorMessage(data, response.status));
  }

  return data;
}

function readErrorMessage(data, status) {
  if (typeof data === 'object' && data !== null) {
    const error = typeof data.error === 'string' ? data.error : null;
    const details = typeof data.details === 'string' ? data.details : null;

    if (error && details && error !== details) {
      return `${error}: ${details}`;
    }

    if (error || details) {
      return error || details || `Request failed with status ${status}`;
    }
  }

  return `Request failed with status ${status}`;
}

async function readFetchErrorMessage(response) {
  const data = await response.json().catch(() => ({}));
  return readErrorMessage(data, response.status);
}

function setDocumentPreviewStatus(state, message, detail, showRetry) {
  if (!documentPreviewStatus) {
    return;
  }

  const title = documentPreviewStatus.querySelector('.document-preview-status-title');
  const body = documentPreviewStatus.querySelector('.document-preview-status-body');
  const retryButton = documentPreviewStatus.querySelector('button[data-preview-action="retry"]');

  documentPreviewStatus.dataset.state = state;
  documentPreviewStatus.hidden = state === 'idle' || state === 'ready';

  if (title) {
    title.textContent = message;
  }

  if (body) {
    body.textContent = detail;
  }

  if (retryButton instanceof HTMLButtonElement) {
    retryButton.hidden = !showRetry;
  }
}

function showDocumentPreviewError(message) {
  if (!documentPreviewModal || !documentPreviewFrame) {
    return;
  }

  if (documentPreviewLoadTimer) {
    window.clearTimeout(documentPreviewLoadTimer);
    documentPreviewLoadTimer = null;
  }

  documentPreviewMeta.textContent = 'Preview unavailable';
  documentPreviewFrame.hidden = true;
  setDocumentPreviewStatus('error', 'Preview unavailable', message, true);
}

function buildApiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

function normalizeApiBaseUrl(value) {
  if (!value) {
    return '';
  }

  return String(value).replace(/\/+$/, '');
}

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
