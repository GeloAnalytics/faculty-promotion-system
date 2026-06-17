const portal = document.body.dataset.portal || 'auth';
const apiBaseUrl = normalizeApiBaseUrl(window.APP_CONFIG?.apiBaseUrl);

const sessionUser = byId('session-user');
const workspaceGreeting = byId('workspace-greeting');
const employeePoints = byId('employee-points');
const employeeUploadWorkflow = byId('employee-upload-workflow');
const employeeUploadStatus = byId('employee-upload-status');
const employeeUploadList = byId('employee-upload-list');
const documentPreviewModal = byId('document-preview-modal');
const documentPreviewFrame = byId('document-preview-frame');
const documentPreviewTitle = byId('document-preview-title');
const documentPreviewMeta = byId('document-preview-meta');
const evaluatorInsights = byId('evaluator-insights');
const reviewQueue = byId('review-queue');
const reviewQueueFilterStatus = byId('review-queue-filter-status');

let currentUser = null;
let employeeDashboard = null;
let uploadWorkflow = [];
let reviewerQueueItems = [];

document.querySelectorAll("[data-action='logout']").forEach((button) => {
  button.addEventListener('click', logoutAndReturnHome);
});
employeeUploadList?.addEventListener('click', handleUploadListActionClick);
reviewQueue?.addEventListener('click', handleReviewQueueActionClick);
document.addEventListener('keydown', handleDocumentPreviewKeydown);
documentPreviewModal?.addEventListener('click', (event) => {
  const target = event.target;
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
  ensureDocumentPreviewShell();
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
          : `Hello ${data.user.fullName}. Upload the score sheet and evidence bundle so the system can OCR the scores for you.`;
    }
    return data;
  } catch (error) {
    currentUser = null;
    if (sessionUser) {
      sessionUser.textContent = 'Guest';
    }
    if (workspaceGreeting) {
      workspaceGreeting.textContent = portal === 'evaluator'
        ? 'Hello. Review the uploaded PDFs and verify the OCR output.'
        : 'Hello. Upload the score sheet and evidence bundle.';
    }
    return null;
  }
}

async function loadEmployeeWorkspace() {
  setNotice(employeeUploadStatus, 'Loading your OCR-backed summary and upload workflow...');
  const [dashboard, workflow] = await Promise.all([
    apiFetch('/api/employee/dashboard'),
    apiFetch('/api/config/upload-workflow'),
  ]);

  employeeDashboard = dashboard;
  uploadWorkflow = Array.isArray(workflow.workflow) ? workflow.workflow : [];

  renderEmployeeSummary(employeeDashboard);
  renderEmployeeWorkflow(uploadWorkflow, employeeDashboard?.uploads || []);
  renderEmployeeUploads(employeeDashboard?.uploads || []);
  setNotice(employeeUploadStatus, 'Upload the score sheet first, then add the evidence bundle. PDFs can be previewed inside the portal.');
}

async function loadEvaluatorWorkspace() {
  setNotice(reviewQueueFilterStatus, 'Loading review queue...');
  const data = await apiFetch('/api/evaluator/review-queue');
  reviewerQueueItems = Array.isArray(data.items) ? data.items : [];

  renderEvaluatorInsights(reviewerQueueItems);
  renderReviewQueue(reviewerQueueItems);
  setNotice(reviewQueueFilterStatus, `${reviewerQueueItems.length} employee submission(s) ready for read-only review.`);
}

function renderEmployeeSummary(dashboard) {
  if (!employeePoints) {
    return;
  }

  const draftPoints = dashboard?.latestProfile?.draftPoints;
  if (!draftPoints) {
    employeePoints.innerHTML = `
      <div class="notice">Upload the score sheet and evidence bundle to generate an OCR-backed summary.</div>
    `;
    return;
  }

  const cards = [
    { label: 'Instruction', value: formatNumber(draftPoints.categories?.instruction) },
    { label: 'Research', value: formatNumber(draftPoints.categories?.research) },
    { label: 'Extension', value: formatNumber(draftPoints.categories?.extension) },
    { label: 'Prof. Dev.', value: formatNumber(draftPoints.categories?.professionalDevelopment) },
    { label: 'IPCR Avg.', value: formatNumber(draftPoints.categories?.ipcrAverage) },
    { label: 'Approx. Total', value: formatNumber(draftPoints.overallEstimate) },
  ];

  const evidenceCoverage = draftPoints.evidenceCoverage || {};
  const promotionDraft = draftPoints.promotionDraft || {};

  employeePoints.innerHTML = `
    <div class="database-counts compact-counts">
      ${cards
        .map(
          (item) => `
            <article class="database-count-card">
              <span class="database-count-label">${escapeHtml(item.label)}</span>
              <strong class="database-count-value">${escapeHtml(item.value)}</strong>
            </article>
          `,
        )
        .join('')}
    </div>
    <div class="rank-panel rank-panel-mini">
      <div class="rank-panel-hero">
        <div class="rank-panel-copy">
          <p class="section-kicker">OCR check</p>
          <h3>${escapeHtml(promotionDraft.suggestedRank || 'Pending review')}</h3>
          <p class="card-copy">${escapeHtml(draftPoints.note || 'Evaluator review is still required for the official score.')}</p>
        </div>
      </div>
      <div class="rank-panel-grid">
        <article class="rank-metric-card">
          <span class="rank-metric-label">Current rank</span>
          <strong class="rank-metric-value">${escapeHtml(promotionDraft.currentRank || 'Not set')}</strong>
        </article>
        <article class="rank-metric-card">
          <span class="rank-metric-label">System score</span>
          <strong class="rank-metric-value">${escapeHtml(formatOptionalNumber(promotionDraft.weightedScore, 'Pending'))}</strong>
        </article>
        <article class="rank-metric-card">
          <span class="rank-metric-label">Uploaded files</span>
          <strong class="rank-metric-value">${escapeHtml(String(employeeDashboard?.summary?.uploadCount ?? 0))}</strong>
        </article>
        <article class="rank-metric-card">
          <span class="rank-metric-label">Panel coverage</span>
          <strong class="rank-metric-value">${escapeHtml(`${evidenceCoverage.uploadedPanelCount ?? 0} / ${evidenceCoverage.expectedPanelCount ?? 0}`)}</strong>
        </article>
      </div>
    </div>
  `;
}

function renderEmployeeWorkflow(workflowItems, uploads) {
  if (!employeeUploadWorkflow) {
    return;
  }

  const uploadedMap = buildUploadTypeCounts(uploads);
  employeeUploadWorkflow.innerHTML = workflowItems
    .map((item) => {
      const isSingle = item.maxFiles === 1;
      const count = uploadedMap[item.type] || 0;
      const accept = Array.isArray(item.acceptedFormats) ? item.acceptedFormats.map((ext) => `.${ext}`).join(',') : '';

      return `
        <article class="card workflow-card">
          <div class="upload-card-header">
            <div>
              <h4>${escapeHtml(item.title)}</h4>
              <p class="card-copy">${escapeHtml(item.description)}</p>
            </div>
            <span class="upload-status-badge" data-status="${count > 0 ? 'uploaded' : 'pending'}">
              ${count > 0 ? `${count} uploaded` : 'Pending'}
            </span>
          </div>
          <p class="upload-audience-chip">${escapeHtml(item.helperText)}</p>
          <ul class="workflow-notes">
            ${(item.uploadNotes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join('')}
          </ul>
          <form class="workflow-upload-form" data-upload-type="${escapeHtml(item.type)}">
            <label class="field">
              <span>${isSingle ? 'Select file' : 'Select files'}</span>
              <input type="file" name="document" ${isSingle ? '' : 'multiple'} required accept="${escapeHtml(accept)}" />
            </label>
            <button class="button button-primary" type="submit">
              ${escapeHtml(item.type === 'score-sheet' ? 'Upload Score Sheet' : 'Upload Evidence')}
            </button>
          </form>
        </article>
      `;
    })
    .join('');

  employeeUploadWorkflow.querySelectorAll('.workflow-upload-form').forEach((form) => {
    form.addEventListener('submit', handleUploadSubmit);
  });
}

function renderEmployeeUploads(uploads) {
  if (!employeeUploadList) {
    return;
  }

  const grouped = groupUploadsByKra(uploads);
  const groupOrder = [
    'KRA I - Instruction',
    'KRA II - Research, Innovation and Creative Work',
    'KRA III - Extension Services',
    'KRA IV - Professional Development',
    'Unassigned',
  ];

  if (!uploads.length) {
    employeeUploadList.innerHTML = '<div class="notice">No files uploaded yet.</div>';
    return;
  }

  employeeUploadList.innerHTML = groupOrder
    .filter((type) => grouped[type] && grouped[type].length)
    .map((type) => {
      const groupUploads = grouped[type];
      const label = type === 'Unassigned' ? 'Unassigned Uploads' : type;
      return `
        <article class="uploaded-files-group">
          <div class="uploaded-files-group-header">
            <h3>${escapeHtml(label)}</h3>
            <span>${escapeHtml(String(groupUploads.length))} file(s)</span>
          </div>
          <div class="uploaded-files-list">
            ${groupUploads.map(renderUploadRow).join('')}
          </div>
        </article>
      `;
    })
    .join('');
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
  const evaluatorBackedCount = items.filter((item) => item.latestTrainingItem).length;
  const totalUploads = items.reduce((sum, item) => sum + (Array.isArray(item.uploadLogs) ? item.uploadLogs.length : 0), 0);
  const averageCoverage = totalRecords
    ? Math.round(
        (items.reduce((sum, item) => sum + Number(item.draftPoints?.evidenceCoverage?.workflowCoveragePercent ?? 0), 0) /
          totalRecords) *
          100,
      ) / 100
    : 0;

  evaluatorInsights.innerHTML = `
    <div class="insight-stat-grid">
      ${renderInsightStatCard('Queue records', String(totalRecords))}
      ${renderInsightStatCard('Evaluator-backed', String(evaluatorBackedCount))}
      ${renderInsightStatCard('Uploads', String(totalUploads))}
      ${renderInsightStatCard('Avg coverage', `${averageCoverage}%`)}
    </div>
  `;
}

function renderReviewQueue(items) {
  if (!reviewQueue) {
    return;
  }

  if (!items.length) {
    reviewQueue.innerHTML = '<div class="notice">No employee submissions are waiting in the evaluator queue.</div>';
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
  const latestTraining = item.latestTrainingItem?.evaluatorAssessment || null;
  const systemScore = formatOptionalNumber(promotionDraft.weightedScore, 'Pending');

  return `
    <article class="card review-card">
      <div class="training-example-header">
        <div class="review-card-identity">
          <strong>${escapeHtml(item.name || 'Unnamed employee')}</strong>
          <span class="review-rank-chip">${escapeHtml(item.employeeId || 'No Employee ID')}</span>
        </div>
        <span class="training-example-status">${escapeHtml(item.latestTrainingItem ? 'Evaluator-backed' : 'Pending') }</span>
      </div>
      <div class="review-card-meta">
        <span class="review-meta-chip">Submitted by ${escapeHtml(item.createdBy?.fullName || '-')}</span>
        <span class="review-meta-chip">Cycle ${escapeHtml(item.cycleData?.performanceReview?.reviewPeriod || item.semester || 'Current cycle')}</span>
        <span class="review-meta-chip">System score ${escapeHtml(systemScore)}</span>
        <span class="review-meta-chip">${escapeHtml(String(uploads.length))} file(s)</span>
      </div>
      <div class="review-card-metrics">
        ${renderReviewMetric('Current rank', promotionDraft.currentRank || 'Not set')}
        ${renderReviewMetric('Projected rank', promotionDraft.suggestedRank || 'Pending')}
        ${renderReviewMetric('Weighted score', systemScore, true)}
        ${renderReviewMetric('Evaluator total', formatOptionalNumber(latestTraining?.totalScore, 'Pending'))}
      </div>
      ${draftPoints.note ? `<p class="card-copy review-card-note">${escapeHtml(draftPoints.note)}</p>` : ''}
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
        </div>
      </div>
    </article>
  `;
}

async function handleUploadSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const uploadType = form.dataset.uploadType || 'legacy';
  const fileInput = form.querySelector('input[type="file"]');
  const files = Array.from(fileInput?.files || []);

  if (!files.length) {
    setNotice(employeeUploadStatus, 'Choose at least one file first.', true);
    return;
  }

  const formData = new FormData();
  formData.append('uploadType', uploadType);
  formData.append('kind', 'REQUIREMENT');
  for (const file of files) {
    formData.append('document', file);
  }

  setSubmitButtonState(form, true);
  setNotice(employeeUploadStatus, uploadType === 'score-sheet' ? 'Uploading score sheet...' : 'Uploading evidence bundle...');

  try {
    await apiFetch('/api/documents/extract', {
      method: 'POST',
      body: formData,
    });

    setNotice(employeeUploadStatus, 'Upload complete. OCR is processing the document now.');
    await loadEmployeeWorkspace();
  } catch (error) {
    setNotice(employeeUploadStatus, toErrorMessage(error), true);
  } finally {
    setSubmitButtonState(form, false);
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
    return 'KRA II - Research, Innovation and Creative Work';
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

  if (!documentId) {
    return;
  }

  if (action === 'preview') {
    openDocumentPreview({
      documentId,
      fileName,
      mimeType,
    });
    return;
  }

  if (action === 'delete') {
    void deleteUploadDocument(documentId, fileName);
  }
}

function handleReviewQueueActionClick(event) {
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

  openDocumentPreview({
    documentId,
    fileName,
    mimeType,
  });
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
    if (portal === 'evaluator') {
      await loadEvaluatorWorkspace();
    }
  } catch (error) {
    setNotice(employeeUploadStatus || reviewQueueFilterStatus, toErrorMessage(error), true);
  }
}

function openDocumentPreview({ documentId, fileName, mimeType }) {
  if (!documentPreviewModal || !documentPreviewFrame || !documentPreviewTitle || !documentPreviewMeta) {
    return;
  }

  const previewUrl = buildApiUrl(`/api/documents/${encodeURIComponent(documentId)}/view`);
  documentPreviewTitle.textContent = fileName;
  documentPreviewMeta.textContent = mimeType ? `Previewing ${mimeType}` : 'Previewing uploaded file';
  documentPreviewFrame.src = previewUrl;
  documentPreviewModal.dataset.open = 'true';
  documentPreviewModal.hidden = false;
  document.body.classList.add('preview-open');
}

function closeDocumentPreview() {
  if (!documentPreviewModal || !documentPreviewFrame) {
    return;
  }

  documentPreviewFrame.src = 'about:blank';
  documentPreviewModal.dataset.open = 'false';
  documentPreviewModal.hidden = true;
  document.body.classList.remove('preview-open');
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
    return 'Employee';
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
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    ...init,
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
