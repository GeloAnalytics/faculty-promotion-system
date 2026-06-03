import {
  normalizePortalPath,
  prettyRole,
  setNotice,
} from "./ui-helpers.js";

const portal = document.body.dataset.portal || "auth";
const apiBaseUrl = normalizeApiBaseUrl(window.APP_CONFIG?.apiBaseUrl);

const healthStatus = byId("health-status");
const modelStatus = byId("model-status");
const healthGuideline = byId("health-guideline");
const sessionUser = byId("session-user");
const authResult = byId("auth-result");
const facultyResult = byId("faculty-result");
const trainingResult = byId("training-result");
const authForm = byId("auth-form");
const facultyForm = byId("faculty-form");
const trainingForm = byId("training-form");
const uploadPanelGrid = byId("upload-panel-grid");
const employeePoints = byId("employee-points");
const employeeLogs = byId("employee-logs");
const employeeProfiles = byId("employee-profiles");
const reviewQueue = byId("review-queue");
const reviewQueueSearch = byId("review-queue-search");
const reviewQueueStatusFilter = byId("review-queue-status-filter");
const reviewQueueConfidenceFilter = byId("review-queue-confidence-filter");
const reviewQueuePanelFilter = byId("review-queue-panel-filter");
const reviewQueueFilterStatus = byId("review-queue-filter-status");
const evaluatorInsights = byId("evaluator-insights");
const databaseViewer = byId("database-viewer");
const trainingCriteria = byId("training-criteria");
const trainingScoreTotal = byId("training-score-total");
const summarySheetForm = byId("summary-sheet-form");
const summarySheetPreview = byId("summary-sheet-preview");
const summarySheetStatus = byId("summary-sheet-status");
const summarySheetLoadButton = byId("summary-sheet-load-button");
const summarySheetDownloadButton = byId("summary-sheet-download-button");
const workspaceGreeting = byId("workspace-greeting");
const uploadedFilesViewer = byId("uploaded-files-viewer");
const uploadedFilesSearch = byId("uploaded-files-search");
const uploadedFilesPanelFilter = byId("uploaded-files-panel-filter");
const uploadedFilesFilterStatus = byId("uploaded-files-filter-status");
const showLoginButton = byId("show-login");
const showRegisterButton = byId("show-register");
const nameField = byId("name-field");
const roleField = byId("role-field");
const authSubmit = byId("auth-submit");
const facultyFormMode = byId("faculty-form-mode");
const facultySubmitButton = byId("faculty-submit-button");
const facultyResetButton = byId("faculty-reset-button");
const promotionHistoryList = byId("promotion-history-list");
const addPromotionHistoryButton = byId("add-promotion-history");
const cycleMetricsGrid = byId("cycle-metrics-grid");
const employeeIdField = byId("employeeId");

const FIXED_REVIEW_PERIOD = "July 2022-June 2026";
const REVIEW_CYCLE_YEARS = [
  { key: "2022-2023", label: "AY 2022-2023" },
  { key: "2023-2024", label: "AY 2023-2024" },
  { key: "2024-2025", label: "AY 2024-2025" },
  { key: "2025-2026", label: "AY 2025-2026" },
];
const CYCLE_METRIC_DEFINITIONS = [
  { key: "ipcrAverage", label: "IPCR Average", min: 0, max: 5, step: 0.01, scaleLabel: "0 to 5 scale" },
  { key: "teachingEffectiveness", label: "Teaching Effectiveness", min: 0, max: 100, step: 0.01, scaleLabel: "0 to 100 scale" },
  { key: "researchOutputs", label: "Research Outputs", min: 0, step: 0.01, scaleLabel: "Non-negative value" },
  { key: "extensionServices", label: "Extension Services", min: 0, step: 0.01, scaleLabel: "Non-negative value" },
];
const SUMMARY_SHEET_SIGNATURES = [
  {
    key: "member-1",
    label: "IEC Member 1",
    role: "Name and Signature of IEC Member",
    nameFieldId: "summary-sheet-member-1-name",
    dateFieldId: "summary-sheet-member-1-date",
  },
  {
    key: "member-2",
    label: "IEC Member 2",
    role: "Name and Signature of IEC Member",
    nameFieldId: "summary-sheet-member-2-name",
    dateFieldId: "summary-sheet-member-2-date",
  },
  {
    key: "member-3",
    label: "IEC Member 3",
    role: "Name and Signature of IEC Member",
    nameFieldId: "summary-sheet-member-3-name",
    dateFieldId: "summary-sheet-member-3-date",
  },
  {
    key: "member-4",
    label: "IEC Member 4",
    role: "Name and Signature of IEC Member",
    nameFieldId: "summary-sheet-member-4-name",
    dateFieldId: "summary-sheet-member-4-date",
  },
  {
    key: "chair",
    label: "IEC Chair",
    role: "Name and Signature of IEC Chair",
    nameFieldId: "summary-sheet-chair-name",
    dateFieldId: "summary-sheet-chair-date",
  },
  {
    key: "conforme",
    label: "Conforme",
    role: "Name and Signature of Faculty",
    nameFieldId: "summary-sheet-conforme-name",
    dateFieldId: "summary-sheet-conforme-date",
  },
  {
    key: "acknowledgment",
    label: "Acknowledgment",
    role: "Name and Signature of Faculty",
    nameFieldId: "summary-sheet-acknowledgment-name",
    dateFieldId: "summary-sheet-acknowledgment-date",
  },
];

let authMode = "login";
let currentUser = null;
let latestRecordContext = null;
let uploadPanelCatalog = [];
let facultyOptionCatalog = { academicRanks: [], educationalAttainments: [] };
let employeeUploads = [];
let evaluatorQueueItems = [];
let promotionHistoryState = [];
let selectedSummarySheetRecord = null;
const employeeProfileRecords = new Map();
const latestTrainingItemById = new Map();
uploadPanelGrid?.addEventListener("click", handleDeleteUploadClick);
reviewQueue?.addEventListener("click", handleDeleteUploadClick);
uploadedFilesViewer?.addEventListener("click", handleDeleteUploadClick);
employeeProfiles?.addEventListener("click", handleEmployeeProfileAction);
promotionHistoryList?.addEventListener("click", handlePromotionHistoryClick);
promotionHistoryList?.addEventListener("change", handlePromotionHistoryChange);
uploadedFilesSearch?.addEventListener("input", () => renderUploadedFilesSection(uploadPanelCatalog));
uploadedFilesPanelFilter?.addEventListener("change", () => renderUploadedFilesSection(uploadPanelCatalog));
reviewQueueSearch?.addEventListener("input", () => renderReviewQueue(evaluatorQueueItems));
reviewQueueStatusFilter?.addEventListener("change", () => renderReviewQueue(evaluatorQueueItems));
reviewQueueConfidenceFilter?.addEventListener("change", () => renderReviewQueue(evaluatorQueueItems));
reviewQueuePanelFilter?.addEventListener("change", () => renderReviewQueue(evaluatorQueueItems));
employeeIdField?.addEventListener("input", enforceEmployeeIdDigits);
cycleMetricsGrid?.addEventListener("input", handleCycleMetricInput);
facultyResetButton?.addEventListener("click", () => {
  resetFacultyFormForNewRecord();
  setNotice(facultyResult, "You can now create a new baseline record.", false);
});
addPromotionHistoryButton?.addEventListener("click", () => {
  promotionHistoryState.push(createEmptyPromotionHistoryEntry());
  renderPromotionHistoryRows();
});

summarySheetForm?.addEventListener("input", renderSummarySheetPreview);
summarySheetLoadButton?.addEventListener("click", () => {
  if (selectedSummarySheetRecord) {
    loadSummarySheetFromRecord(selectedSummarySheetRecord);
    return;
  }

  if (evaluatorQueueItems.length) {
    loadSummarySheetFromRecord(evaluatorQueueItems[0]);
    return;
  }

  setNotice(summarySheetStatus, "Load a review queue record first so the summary sheet can be personalized.", true);
});
summarySheetDownloadButton?.addEventListener("click", downloadSummarySheetPdf);

document.querySelectorAll("[data-scroll-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(button.dataset.scrollTarget);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

document.querySelectorAll("[data-action='logout']").forEach((button) => {
  button.addEventListener("click", logoutAndReturnHome);
});

showLoginButton?.addEventListener("click", () => setAuthMode("login"));
showRegisterButton?.addEventListener("click", () => setAuthMode("register"));

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setNotice(authResult, authMode === "login" ? "Signing in..." : "Creating account...");

  try {
    const endpoint = authMode === "login" ? buildApiUrl("/api/auth/login") : buildApiUrl("/api/auth/register");
    const body =
      authMode === "login"
        ? {
            email: valueOf("auth-email"),
            password: valueOf("auth-password"),
          }
        : {
            fullName: valueOf("auth-name"),
            email: valueOf("auth-email"),
            password: valueOf("auth-password"),
            role: valueOf("auth-role"),
          };

    const data = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });

    setNotice(authResult, `${authMode === "login" ? "Signed in" : "Account created"} for ${data.user.fullName}.`);
    window.location.assign(data.homePath || getHomePathForRole(data.user?.role));
  } catch (error) {
    setNotice(authResult, toErrorMessage(error), true);
  }
});

facultyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = buildFacultyPayload();
  if (!payload) {
    return;
  }
  const isUpdating = Boolean(latestRecordContext?.profileId && latestRecordContext?.mode === "update");
  setNotice(facultyResult, isUpdating ? "Updating faculty record..." : "Saving faculty record...");

  try {
    const data = await apiFetch(
      isUpdating
        ? buildApiUrl(`/api/faculty/${encodeURIComponent(latestRecordContext.profileId)}`)
        : buildApiUrl("/api/faculty/ingest"),
      {
        method: isUpdating ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );

    latestRecordContext = { profileId: data.profileId, mode: "update" };
    setNotice(
      facultyResult,
      `${
        isUpdating ? "Faculty record updated" : "Faculty record saved"
      }. Profile ID: ${data.profileId}. You can now upload evidence files to the matching panels.`,
      false,
      true,
    );
    collapseFacultyFormWithModeSupport();
    await loadEmployeeWorkspace();
  } catch (error) {
    setNotice(facultyResult, toErrorMessage(error), true);
  }
});

trainingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const trainingExampleId = valueOf("training-example-id");
  if (!trainingExampleId) {
    setNotice(trainingResult, "Select a training example from the review queue first.", true);
    return;
  }

  setNotice(trainingResult, "Saving evaluator scoring...");

  try {
    const data = await apiFetch(buildApiUrl(`/api/training/examples/${trainingExampleId}/label`), {
      method: "PATCH",
      body: JSON.stringify({
        labelPromoted: valueOf("training-label") === "true",
        labelSource: valueOf("training-source"),
        datasetSplit: valueOf("training-split"),
        notes: valueOf("training-notes"),
        criterionScores: collectCriterionScores(),
      }),
    });

    setNotice(trainingResult, `Record scored successfully. Status is now ${data.status}.`);
    await loadEvaluatorWorkspace();
  } catch (error) {
    setNotice(trainingResult, toErrorMessage(error), true);
  }
});

bootstrap();

async function bootstrap() {
  setAuthMode("login");
  await Promise.all([loadHealth(), refreshSession()]);

  if (portal === "auth") {
    if (currentUser) {
      window.location.replace(getHomePathForRole(currentUser.role));
    }
    return;
  }

  if (!currentUser) {
    window.location.replace("/");
    return;
  }

  const expectedPath = getHomePathForRole(currentUser.role);
  if (expectedPath !== normalizePortalPath(window.location.pathname)) {
    window.location.replace(expectedPath);
    return;
  }

  if (portal === "employee") {
    await loadEmployeeWorkspace();
    return;
  }

  if (portal === "evaluator") {
    await loadEvaluatorWorkspace();
  }
}

async function refreshSession() {
  try {
    const data = await apiFetch(buildApiUrl("/api/auth/me"), { method: "GET" });
    currentUser = data.user;
    if (sessionUser) {
      sessionUser.textContent = `${data.user.fullName} (${prettyRole(data.user.role)})`;
    }
    if (workspaceGreeting) {
      workspaceGreeting.textContent =
        portal === "evaluator"
          ? `Hello ${data.user.fullName}. Here are the logs and records for evaluation.`
          : `Hello ${data.user.fullName}. Enter your faculty record and upload your supporting documents here for faculty promotion.`;
    }
    if (portal === "employee" && !valueOf("fullName")) {
      setFieldValue("fullName", data.user.fullName);
    }
  } catch {
    currentUser = null;
    if (sessionUser) {
      sessionUser.textContent = "Guest";
    }
    if (workspaceGreeting) {
      workspaceGreeting.textContent =
        portal === "evaluator"
          ? "Hello. Here are the logs and records for evaluation."
          : "Hello. Enter your faculty record and upload your supporting documents here for faculty promotion.";
    }
  }
}

async function loadEmployeeWorkspace() {
  renderCycleMetricInputs();
  await Promise.all([loadUploadPanelCatalog(), loadFacultyOptionCatalog(), loadEmployeeDashboard()]);
  renderFacultyOptionFields();
  renderUploadPanels(uploadPanelCatalog);
  renderUploadedFilesSection(uploadPanelCatalog);
}

async function loadEvaluatorWorkspace() {
  await Promise.all([loadUploadPanelCatalog(), loadReviewQueue(), loadDatabaseOverview()]);
  renderEvaluatorCriteria(uploadPanelCatalog);
  renderSummarySheetPreview();
}

async function loadHealth() {
  try {
    const data = await apiFetch(buildApiUrl("/api/health"), { method: "GET" }, false);
    if (healthStatus) {
      healthStatus.textContent = data.status;
    }
    if (modelStatus) {
      modelStatus.textContent = data.model?.status ?? "unknown";
    }
    if (healthGuideline) {
      healthGuideline.textContent = data.referenceData?.guidelinePdfFileName ? "Loaded" : "Missing";
    }
  } catch {
    if (healthStatus) {
      healthStatus.textContent = "Unavailable";
    }
    if (modelStatus) {
      modelStatus.textContent = "-";
    }
    if (healthGuideline) {
      healthGuideline.textContent = "-";
    }
  }
}

async function loadUploadPanelCatalog() {
  try {
    const data = await apiFetch(buildApiUrl("/api/config/upload-panels"), { method: "GET" }, false);
    uploadPanelCatalog = Array.isArray(data.panels) ? data.panels : [];
  } catch (error) {
    uploadPanelCatalog = [];
    if (uploadPanelGrid) {
      uploadPanelGrid.innerHTML = `<div class="notice notice-error">${escapeHtml(toErrorMessage(error))}</div>`;
    }
    if (trainingCriteria) {
      trainingCriteria.innerHTML = `<div class="notice notice-error">${escapeHtml(toErrorMessage(error))}</div>`;
    }
  }
}

async function loadEmployeeDashboard() {
  try {
    const data = await apiFetch(buildApiUrl("/api/employee/dashboard"), { method: "GET" });
    employeeUploads = Array.isArray(data.uploads) ? data.uploads : [];
    renderEmployeeDraftPoints(data.latestProfile?.draftPoints, data.summary);
    renderEmployeeProfiles(data.profiles || []);
    renderEmployeeUploads(employeeUploads);
    if (uploadPanelCatalog.length) {
      renderUploadPanels(uploadPanelCatalog);
      renderUploadedFilesSection(uploadPanelCatalog);
    }

    if (data.latestProfile?.id) {
      selectFacultyProfileForEditing(data.latestProfile, { collapse: false, scroll: false });
    } else {
      resetFacultyFormForNewRecord({ preserveIdentity: true, collapse: false });
    }
  } catch (error) {
    employeeUploads = [];
    renderEmployeeDraftPoints(null, null, toErrorMessage(error));
    renderEmployeeProfiles([]);
    renderEmployeeUploads([], toErrorMessage(error));
    resetFacultyFormForNewRecord({ preserveIdentity: true, collapse: false });
    if (uploadPanelCatalog.length) {
      renderUploadPanels(uploadPanelCatalog);
      renderUploadedFilesSection(uploadPanelCatalog);
    }
  }
}

async function loadReviewQueue() {
  if (!reviewQueue) {
    return;
  }

  reviewQueue.innerHTML = '<div class="notice">Loading employee submission logs...</div>';
  if (reviewQueueFilterStatus) {
    reviewQueueFilterStatus.textContent = "Loading review queue...";
  }

  try {
    const data = await apiFetch(buildApiUrl("/api/evaluator/review-queue"), { method: "GET" });
    evaluatorQueueItems = Array.isArray(data.items) ? data.items : [];
    renderReviewQueue(evaluatorQueueItems);
    renderEvaluatorInsights(evaluatorQueueItems);
  } catch (error) {
    evaluatorQueueItems = [];
    syncReviewQueueFilterOptions([]);
    if (reviewQueueFilterStatus) {
      reviewQueueFilterStatus.textContent = "Unable to load the review queue.";
    }
    reviewQueue.innerHTML = `<div class="notice notice-error">${escapeHtml(toErrorMessage(error))}</div>`;
    renderEvaluatorInsights([]);
  }
}

async function loadFacultyOptionCatalog() {
  try {
    const data = await apiFetch(buildApiUrl("/api/config/faculty-options"), { method: "GET" }, false);
    facultyOptionCatalog = {
      academicRanks: Array.isArray(data.academicRanks) ? data.academicRanks : [],
      educationalAttainments: Array.isArray(data.educationalAttainments) ? data.educationalAttainments : [],
    };
  } catch {
    facultyOptionCatalog = { academicRanks: [], educationalAttainments: [] };
  }
}

async function loadDatabaseOverview() {
  if (!databaseViewer) {
    return;
  }

  databaseViewer.innerHTML = '<div class="notice">Loading database contents...</div>';

  try {
    const data = await apiFetch(buildApiUrl("/api/admin/database-overview"), { method: "GET" });
    renderDatabaseOverview(data);
  } catch (error) {
    databaseViewer.innerHTML = `<div class="notice notice-error">${escapeHtml(toErrorMessage(error))}</div>`;
  }
}

async function logoutAndReturnHome() {
  try {
    await fetch(buildApiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
  } finally {
    window.location.assign("/");
  }
}

function renderUploadPanels(panels) {
  if (!uploadPanelGrid) {
    return;
  }

  if (!panels.length) {
    uploadPanelGrid.innerHTML = '<div class="notice">No upload panels are configured.</div>';
    return;
  }

  const groupedPanels = groupPanelsByKra(panels);
  const totalPanels = panels.length;
  const uploadedPanels = panels.filter((p) => hasPanelUploads(p.key)).length;
  const progressPct = totalPanels ? Math.round((uploadedPanels / totalPanels) * 100) : 0;

  const progressBar = `
    <div class="upload-progress-strip">
      <div class="upload-progress-info">
        <span class="upload-progress-label">Upload Progress</span>
        <span class="upload-progress-count">${uploadedPanels} / ${totalPanels} panels completed</span>
      </div>
      <div class="upload-progress-track">
        <div class="upload-progress-fill" style="width:${progressPct}%"></div>
      </div>
    </div>
  `;

  uploadPanelGrid.innerHTML = progressBar + groupedPanels
    .map(
      ([kraTitle, items]) => {
        const kraUploaded = items.filter((p) => hasPanelUploads(p.key)).length;
        const kraComplete = kraUploaded === items.length;
        return `
        <details class="upload-group-collapsible${kraComplete ? ' kra-complete' : ''}" ${kraComplete ? '' : 'open'}>
          <summary class="upload-group-summary">
            <div class="upload-group-heading">
              <h3>${escapeHtml(kraTitle)}</h3>
              <p class="card-copy">${escapeHtml(describePanelAudience(items))}</p>
            </div>
            <span class="kra-progress-chip${kraComplete ? ' kra-progress-done' : ''}">
              ${kraComplete ? '✓ Complete' : `${kraUploaded}/${items.length}`}
            </span>
          </summary>
          <div class="upload-panel-grid">
            ${items
              .map(
                (panel) => `
                  <article class="card upload-card" data-panel-key="${escapeHtml(panel.key)}">
                    <div class="upload-card-header">
                      <h4>${escapeHtml(panel.title)}</h4>
                      <div class="upload-card-badges">
                        <span class="upload-status-badge" data-status="${hasPanelUploads(panel.key) ? 'uploaded' : 'pending'}">
                          ${hasPanelUploads(panel.key) ? '\u2713 Uploaded' : '\u25cb Pending'}
                        </span>
                        <span class="upload-score-cap">Max ${escapeHtml(String(panel.maxScore))} pts</span>
                      </div>
                    </div>
                    ${panel.audienceLabel ? `<p class="upload-audience-chip">${escapeHtml(panel.audienceLabel)}</p>` : ""}
                    <p class="card-copy">${escapeHtml(panel.description)}</p>
                    <form class="stack-form upload-panel-form" data-panel-key="${escapeHtml(panel.key)}">
                      <label class="field">
                        <span>Select file(s)</span>
                        <input type="file" name="document" multiple required accept="${escapeHtml(panel.acceptedFormats.map(f => '.' + f).join(','))}" />
                      </label>
                      <button class="button button-primary upload-submit-btn" type="submit">
                        <span class="upload-btn-label">Upload Evidence</span>
                        <span class="upload-btn-spinner" style="display:none">Uploading…</span>
                      </button>
                    </form>
                    <div class="notice panel-result">${hasPanelUploads(panel.key) ? getPanelUploadCount(panel.key) + ' file(s) uploaded.' : 'No files uploaded yet.'}</div>
                  </article>
                `,
              )
              .join("")}
          </div>
        </details>
      `;
      },
    )
    .join("");

  uploadPanelGrid.querySelectorAll(".upload-card").forEach((article) => {
    const panelKey = article.dataset.panelKey || "";
    const panel = panels.find((item) => item.key === panelKey);
    if (!panel) {
      return;
    }

    const form = article.querySelector(".upload-panel-form");
    const result = article.querySelector(".panel-result");
    const fileInput = form?.querySelector('input[type="file"]');
    const submitBtn = form?.querySelector(".upload-submit-btn");
    const btnLabel = submitBtn?.querySelector(".upload-btn-label");
    const btnSpinner = submitBtn?.querySelector(".upload-btn-spinner");

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = Array.from(fileInput.files || []);
      if (!files.length) {
        setNotice(result, "Choose at least one file first.", true);
        return;
      }

      // Proactive session check before upload
      const sessionOk = await ensureSession();
      if (!sessionOk) return;

      const formData = new FormData();
      files.forEach((file) => formData.append("document", file));
      formData.append("panelKey", panel.key);
      formData.append("kind", "REQUIREMENT");
      if (latestRecordContext?.profileId) {
        formData.append("profileId", latestRecordContext.profileId);
      }

      // Set button to loading state
      setUploadButtonLoading(submitBtn, btnLabel, btnSpinner, true);
      setNotice(result, files.length === 1 ? "Uploading 1 file…" : `Uploading ${files.length} files…`);
      try {
        const response = await fetch(buildApiUrl("/api/documents/extract"), {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const data = await readJson(response);
        setNotice(result, buildUploadNotice(panel.title, data), false, true);
        showToast(`✓ ${panel.title} — uploaded successfully`, "success");
        await loadEmployeeDashboard();
        renderUploadPanels(uploadPanelCatalog);
        renderUploadedFilesSection(uploadPanelCatalog);
      } catch (error) {
        setNotice(result, toErrorMessage(error), true);
        showToast(`Upload failed: ${toErrorMessage(error)}`, "error");
      } finally {
        setUploadButtonLoading(submitBtn, btnLabel, btnSpinner, false);
      }
    });
  });
}

function renderUploadedFilesSection(panels) {
  if (!uploadedFilesViewer) return;
  syncUploadedFilesFilterOptions(panels);

  if (!employeeUploads.length) {
    syncUploadedFilesFilterStatus(0, 0, false);
    uploadedFilesViewer.innerHTML = '<div class="notice">No files uploaded yet. Upload evidence in the panels above and they will appear here.</div>';
    return;
  }

  const filters = getUploadedFilesFilterState();
  const filteredUploads = employeeUploads.filter((upload) => matchesUploadedFileFilter(upload, panels, filters));
  const groupedPanels = groupPanelsByKra(panels);
  const ungrouped = filteredUploads.filter((u) => !u.metadata?.panelKey || !panels.some((p) => p.key === u.metadata?.panelKey));
  const hasActiveFilters = Boolean(filters.query || filters.panelKey);

  syncUploadedFilesFilterStatus(filteredUploads.length, employeeUploads.length, hasActiveFilters);

  if (!filteredUploads.length) {
    uploadedFilesViewer.innerHTML =
      '<div class="notice">No uploaded files match the current filters. Try a different search term or switch back to all criteria.</div>';
    return;
  }

  uploadedFilesViewer.innerHTML = groupedPanels
    .map(([kraTitle, items]) => {
      const kraFiles = items.flatMap((panel) =>
        filteredUploads
          .filter((u) => u.metadata?.panelKey === panel.key)
          .map((u) => ({ ...u, panelTitle: panel.title }))
      );
      if (!kraFiles.length) return "";
      return `
        <div class="uploaded-files-group">
          <div class="uploaded-files-group-header">
            <h3>${escapeHtml(kraTitle)}</h3>
            <span class="kra-progress-chip">${kraFiles.length} file${kraFiles.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="uploaded-files-list">
            ${kraFiles.map((item) => `
              <div class="uploaded-file-row">
                <div class="uploaded-file-info">
                  <strong>${escapeHtml(item.originalName)}</strong>
                  <span class="uploaded-file-panel">${escapeHtml(item.panelTitle)}</span>
                  <span class="uploaded-file-date">${escapeHtml(formatDatabaseValue(item.createdAt))}</span>
                </div>
                <button
                  class="button button-secondary delete-upload-button"
                  type="button"
                  data-document-id="${escapeHtml(item.id)}"
                  data-refresh-target="employee"
                  data-file-name="${escapeHtml(item.originalName || "this file")}"
                >Delete</button>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    })
    .join("")
    + (ungrouped.length ? `
      <div class="uploaded-files-group">
        <div class="uploaded-files-group-header">
          <h3>Other Files</h3>
          <span class="kra-progress-chip">${ungrouped.length} file${ungrouped.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="uploaded-files-list">
          ${ungrouped.map((item) => `
            <div class="uploaded-file-row">
              <div class="uploaded-file-info">
                <strong>${escapeHtml(item.originalName)}</strong>
                <span class="uploaded-file-panel">${escapeHtml(item.metadata?.panelTitle || "Unassigned")}</span>
                <span class="uploaded-file-date">${escapeHtml(formatDatabaseValue(item.createdAt))}</span>
              </div>
              <button
                class="button button-secondary delete-upload-button"
                type="button"
                data-document-id="${escapeHtml(item.id)}"
                data-refresh-target="employee"
                data-file-name="${escapeHtml(item.originalName || "this file")}"
              >Delete</button>
            </div>
          `).join("")}
        </div>
      </div>
    ` : "");
}

function getUploadedFilesFilterState() {
  return {
    query: (uploadedFilesSearch?.value || "").trim().toLowerCase(),
    panelKey: uploadedFilesPanelFilter?.value || "",
  };
}

function matchesUploadedFileFilter(upload, panels, filters) {
  if (filters.panelKey && upload.metadata?.panelKey !== filters.panelKey) {
    return false;
  }

  if (!filters.query) {
    return true;
  }

  const matchedPanel = panels.find((panel) => panel.key === upload.metadata?.panelKey);
  const haystack = [
    upload.originalName,
    upload.metadata?.panelTitle,
    matchedPanel?.title,
    upload.metadata?.panelKey,
    upload.metadata?.analysisSummary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(filters.query);
}

function syncUploadedFilesFilterOptions(panels) {
  if (!uploadedFilesPanelFilter) {
    return;
  }

  const selectedValue = uploadedFilesPanelFilter.value;
  const panelOptions = panels
    .filter((panel) => employeeUploads.some((upload) => upload.metadata?.panelKey === panel.key))
    .map((panel) => `<option value="${escapeHtml(panel.key)}">${escapeHtml(panel.title)}</option>`)
    .join("");

  uploadedFilesPanelFilter.innerHTML = `<option value="">All criteria</option>${panelOptions}`;
  uploadedFilesPanelFilter.value = panels.some((panel) => panel.key === selectedValue) ? selectedValue : "";
}

function syncUploadedFilesFilterStatus(visibleCount, totalCount, hasActiveFilters) {
  if (!uploadedFilesFilterStatus) {
    return;
  }

  if (!totalCount) {
    uploadedFilesFilterStatus.textContent = "No uploaded files yet.";
    return;
  }

  if (!hasActiveFilters) {
    uploadedFilesFilterStatus.textContent = `Showing all ${totalCount} uploaded file${totalCount === 1 ? "" : "s"}.`;
    return;
  }

  uploadedFilesFilterStatus.textContent = `Showing ${visibleCount} of ${totalCount} uploaded file${totalCount === 1 ? "" : "s"}.`;
}

function renderEvaluatorCriteria(panels) {
  if (!trainingCriteria) {
    return;
  }

  if (!panels.length) {
    trainingCriteria.innerHTML = '<div class="notice">No evaluator criteria are configured.</div>';
    syncCriterionScoreTotal();
    return;
  }

  const groupedPanels = groupPanelsByKra(panels);
  trainingCriteria.innerHTML = groupedPanels
    .map(
      ([kraTitle, items]) => `
        <section class="criteria-group">
          <div class="upload-group-heading">
            <h3>${escapeHtml(kraTitle)}</h3>
            <p class="card-copy">${escapeHtml(describePanelAudience(items))}</p>
          </div>
          <div class="criteria-grid">
            ${items
              .map(
                (panel) => `
                  <label class="field score-field">
                    <span>${escapeHtml(panel.title)}</span>
                    <input
                      type="number"
                      min="0"
                      max="${escapeHtml(String(panel.maxScore))}"
                      step="0.01"
                      data-score-key="${escapeHtml(panel.key)}"
                      data-score-max="${escapeHtml(String(panel.maxScore))}"
                      ${panel.sharedCapKey ? `data-shared-cap-key="${escapeHtml(panel.sharedCapKey)}"` : ""}
                      ${panel.sharedCapMaxScore ? `data-shared-cap-max="${escapeHtml(String(panel.sharedCapMaxScore))}"` : ""}
                    />
                    <small class="field-help">
                      ${escapeHtml(buildScoreHelpText(panel))}
                    </small>
                  </label>
                `,
              )
              .join("")}
          </div>
        </section>
      `,
    )
    .join("");

  trainingCriteria.querySelectorAll("[data-score-key]").forEach((input) => {
    input.addEventListener("input", syncCriterionScoreTotal);
  });

  hydrateTrainingForm(null);
  syncCriterionScoreTotal();
}

function renderEmployeeDraftPoints(draftPoints, summary, errorMessage) {
  if (!employeePoints) {
    return;
  }

  if (errorMessage) {
    employeePoints.innerHTML = `<div class="notice notice-error">${escapeHtml(errorMessage)}</div>`;
    return;
  }

  if (!draftPoints) {
    employeePoints.innerHTML = `
      <div class="notice">
        Save your base faculty record first. After uploads are processed, this page will show an approximate score summary and coverage status.
      </div>
    `;
    return;
  }

  const cards = [
    { label: "Instruction", value: draftPoints.categories?.instruction ?? 0 },
    { label: "Research", value: draftPoints.categories?.research ?? 0 },
    { label: "Extension", value: draftPoints.categories?.extension ?? 0 },
    { label: "Prof. Dev.", value: draftPoints.categories?.professionalDevelopment ?? 0 },
    { label: "IPCR Avg.", value: draftPoints.categories?.ipcrAverage ?? 0 },
    { label: "Approx. Total", value: draftPoints.overallEstimate ?? 0 },
  ];
  const promotionDraft = draftPoints.promotionDraft || {};
  const isEvaluatorBacked = promotionDraft.basis === "evaluator";
  const isPendingReview = promotionDraft.basis === "pending-review";
  const rankLabel = isEvaluatorBacked
    ? "Evaluator-backed draft rank"
    : isPendingReview
      ? "Draft rank status"
      : "Preliminary rank estimate";
  const projectedLabel = isEvaluatorBacked
    ? "Projected rank from evaluator score"
    : isPendingReview
      ? "Projected rank"
      : "Projected rank from uploads and inputs";
  const weightedLabel = isEvaluatorBacked
    ? "Official weighted score"
    : isPendingReview
      ? "Weighted score"
      : "Approximate weighted score";
  const basisLabel = getPromotionBasisLabel(promotionDraft.basis);
  const statusLabel = getPromotionStatusLabel(promotionDraft.status);
  const confidenceLabel = getPromotionConfidenceLabel(
    promotionDraft.confidence || (isEvaluatorBacked ? "high" : null),
  );
  const suggestedRank = promotionDraft.suggestedRank || "Pending evaluator review";
  const projectedRank = promotionDraft.projectedRank || "Pending evaluator review";
  const overviewMetrics = [
    { label: "Current rank", value: promotionDraft.currentRank || "Not set" },
    { label: rankLabel, value: suggestedRank, emphasize: true },
    { label: projectedLabel, value: projectedRank },
    { label: weightedLabel, value: formatOptionalNumber(promotionDraft.weightedScore, "Pending") },
    { label: "Sub-rank increments", value: formatOptionalNumber(promotionDraft.subrankIncrements, "Pending") },
    { label: "Latest evaluator total", value: formatOptionalNumber(promotionDraft.evaluatorTotalScore, "Pending") },
  ];
  const evidenceMetrics = [
    { label: "Uploaded panels", value: `${draftPoints.evidenceCoverage?.uploadedPanelCount ?? 0} / ${draftPoints.evidenceCoverage?.expectedPanelCount ?? 0}` },
    { label: "Workflow coverage", value: `${draftPoints.evidenceCoverage?.workflowCoveragePercent ?? 0}%` },
    { label: "Doc completeness", value: `${draftPoints.evidenceCoverage?.documentCompletenessAverage ?? 0}%` },
    { label: "Profiles saved", value: String(summary?.profileCount ?? 0) },
    { label: "Uploads saved", value: String(summary?.uploadCount ?? 0) },
    { label: "Training drafts", value: String(summary?.trainingDraftCount ?? 0) },
  ];

  employeePoints.innerHTML = `
    <div class="database-counts compact-counts">
      ${cards
        .map(
          (item) => `
            <article class="database-count-card">
              <span class="database-count-label">${escapeHtml(item.label)}</span>
              <strong class="database-count-value">${escapeHtml(String(item.value))}</strong>
            </article>
          `,
        )
        .join("")}
    </div>
    <div class="card workspace-summary-card rank-panel">
      <div class="rank-panel-hero">
        <div class="rank-panel-copy">
          <p class="section-kicker">Rank Estimation</p>
          <h3>${escapeHtml(suggestedRank)}</h3>
          <p class="card-copy rank-panel-subtitle">${escapeHtml(draftPoints.note || "")}</p>
        </div>
        <div class="rank-panel-chips">
          ${renderRankPanelChip(basisLabel, promotionDraft.basis || "pending-review")}
          ${renderRankPanelChip(statusLabel, promotionDraft.status || "pending")}
          ${confidenceLabel ? renderRankPanelChip(`Confidence: ${confidenceLabel}`, promotionDraft.confidence || (isEvaluatorBacked ? "high" : "pending")) : ""}
        </div>
      </div>
      <div class="rank-panel-grid">
        ${overviewMetrics
          .map(
            (item) => `
              <div class="rank-metric-card${item.emphasize ? " rank-metric-card-emphasis" : ""}">
                <span class="rank-metric-label">${escapeHtml(item.label)}</span>
                <strong class="rank-metric-value">${escapeHtml(String(item.value))}</strong>
              </div>
            `,
          )
          .join("")}
      </div>
      <div class="rank-panel-sections">
        <section class="rank-panel-section">
          <h4>Evidence Snapshot</h4>
          <div class="rank-evidence-grid">
            ${evidenceMetrics
              .map(
                (item) => `
                  <div class="rank-evidence-item">
                    <span class="rank-evidence-label">${escapeHtml(item.label)}</span>
                    <strong class="rank-evidence-value">${escapeHtml(String(item.value))}</strong>
                  </div>
                `,
              )
              .join("")}
          </div>
        </section>
        <section class="rank-panel-section">
          <h4>Assessment Notes</h4>
          <div class="rank-panel-note-list">
            <p class="card-copy"><strong>Applied weight profile:</strong> ${escapeHtml(promotionDraft.appliedWeightProfile || "Pending")}</p>
            <p class="card-copy">${escapeHtml(promotionDraft.note || "")}</p>
            ${promotionDraft.pendingRequirement ? `<p class="card-copy rank-panel-warning"><strong>Pending requirement:</strong> ${escapeHtml(promotionDraft.pendingRequirement)}</p>` : ""}
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderEmployeeProfiles(profiles) {
  if (!employeeProfiles) {
    return;
  }

  employeeProfileRecords.clear();
  profiles.forEach((profile) => {
    employeeProfileRecords.set(profile.id, profile);
  });

  if (!profiles.length) {
    employeeProfiles.innerHTML = '<div class="notice">No employee records saved yet.</div>';
    return;
  }

  employeeProfiles.innerHTML = `
    <div class="training-example-list">
      ${profiles
        .map(
          (profile) => `
            <article class="training-example-card">
              <div class="training-example-header">
                <strong>${escapeHtml(profile.name)}</strong>
                <span class="training-example-status">${escapeHtml(profile.employeeId || "No Employee ID")}</span>
              </div>
              <p class="card-copy">Review cycle: ${escapeHtml(profile.cycleData?.performanceReview?.reviewPeriod || profile.semester || FIXED_REVIEW_PERIOD)}</p>
              <p class="card-copy">Current rank: ${escapeHtml(profile.draftPoints?.promotionDraft?.currentRank || "Not set")}</p>
              <p class="card-copy">${escapeHtml(getPromotionBasisLabel(profile.draftPoints?.promotionDraft?.basis))}: ${escapeHtml(profile.draftPoints?.promotionDraft?.suggestedRank || "Pending evaluator review")}</p>
              <p class="card-copy">Projected rank: ${escapeHtml(profile.draftPoints?.promotionDraft?.projectedRank || "Pending evaluator review")}</p>
              <p class="card-copy">Confidence: ${escapeHtml(getPromotionConfidenceLabel(profile.draftPoints?.promotionDraft?.confidence || (profile.draftPoints?.promotionDraft?.basis === "evaluator" ? "high" : null)) || "Pending")}</p>
              <p class="card-copy">Documents linked: ${escapeHtml(String(profile.documentCount || 0))}</p>
              <p class="card-copy">Approximate total: ${escapeHtml(String(profile.draftPoints?.overallEstimate ?? 0))}</p>
              <div class="profile-card-actions">
                <button class="button button-secondary" type="button" data-action="edit-profile" data-profile-id="${escapeHtml(profile.id)}">
                  Edit Baseline Data
                </button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderEmployeeUploads(uploads, errorMessage) {
  if (!employeeLogs) {
    return;
  }

  if (errorMessage) {
    employeeLogs.innerHTML = `<div class="notice notice-error">${escapeHtml(errorMessage)}</div>`;
    return;
  }

  if (!uploads.length) {
    employeeLogs.innerHTML = '<div class="notice">No upload logs yet. Files will appear here after submission.</div>';
    return;
  }

  employeeLogs.innerHTML = `
    <div class="database-table-wrap">
      <table class="database-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Panel</th>
            <th>Summary</th>
            <th>Linked</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${uploads
            .map(
              (item) => `
                <tr>
                  <td>${escapeHtml(item.originalName)}</td>
                  <td>${escapeHtml(item.metadata?.panelTitle || item.metadata?.panelKey || "-")}</td>
                  <td>${escapeHtml(item.metadata?.analysisSummary || "Stored with no extracted summary yet.")}</td>
                  <td>${escapeHtml(item.metadata?.linkage || (item.profileId ? "profile-linked" : "pending"))}</td>
                  <td>${escapeHtml(formatDatabaseValue(item.createdAt))}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderReviewQueue(items) {
  if (!reviewQueue) {
    return;
  }

  evaluatorQueueItems = Array.isArray(items) ? items : [];
  latestTrainingItemById.clear();
  syncReviewQueueFilterOptions(evaluatorQueueItems);

  if (!evaluatorQueueItems.length) {
    syncReviewQueueFilterStatus(0, 0, false);
    reviewQueue.innerHTML = '<div class="notice">No employee submissions are waiting in the evaluator queue.</div>';
    return;
  }

  const filters = getReviewQueueFilterState();
  const filteredItems = evaluatorQueueItems.filter((item) => matchesReviewQueueFilter(item, filters));
  const hasActiveFilters = Boolean(filters.query || filters.status || filters.confidence || filters.panelKey);

  syncReviewQueueFilterStatus(filteredItems.length, evaluatorQueueItems.length, hasActiveFilters);

  if (!filteredItems.length) {
    reviewQueue.innerHTML =
      '<div class="notice">No faculty records match the current search or filters. Try another keyword or broaden the selected filters.</div>';
    return;
  }

  reviewQueue.innerHTML = `
    <div class="review-queue">
      ${filteredItems
        .map((item) => {
          const uploads = Array.isArray(item.uploadLogs) ? item.uploadLogs : [];
          const latestTrainingItem = item.latestTrainingItem || null;
          const latestTrainingId = latestTrainingItem?.id || item.latestTrainingExampleId || "";
          const promotionDraft = item.draftPoints?.promotionDraft || {};
          const reviewRankLabel =
            promotionDraft.basis === "evaluator"
              ? "Evaluator-backed rank"
              : promotionDraft.basis === "pending-review"
                ? "Rank status"
                : "Approximate rank";
          const reviewRankValue = promotionDraft.suggestedRank || promotionDraft.projectedRank || "Pending";
          const reviewStatusLabel = getPromotionStatusLabel(promotionDraft.status);
          const reviewConfidenceLabel =
            getPromotionConfidenceLabel(promotionDraft.confidence || (promotionDraft.basis === "evaluator" ? "high" : null)) || "Pending";
          const uploadedPanelCount = item.draftPoints?.evidenceCoverage?.uploadedPanelCount ?? 0;
          const expectedPanelCount = item.draftPoints?.evidenceCoverage?.expectedPanelCount ?? 0;
          const uploadCountLabel = `${uploads.length} file${uploads.length === 1 ? "" : "s"}`;
          if (latestTrainingId && latestTrainingItem) {
            latestTrainingItemById.set(latestTrainingId, latestTrainingItem);
          }
          return `
            <article class="card review-card">
              <div class="training-example-header">
                <div class="review-card-identity">
                  <strong>${escapeHtml(item.name || "Unnamed employee")}</strong>
                  <span class="review-rank-chip">${escapeHtml(reviewRankLabel)}: ${escapeHtml(reviewRankValue)}</span>
                </div>
                <span class="training-example-status">${escapeHtml(item.employeeId || "No Employee ID")}</span>
              </div>
              <div class="review-card-meta">
                <span class="review-meta-chip">Submitted by ${escapeHtml(item.createdBy?.fullName || "-")}</span>
                <span class="review-meta-chip">${escapeHtml(item.createdBy?.email || "No email on file")}</span>
                <span class="review-meta-chip">Cycle ${escapeHtml(item.cycleData?.performanceReview?.reviewPeriod || item.semester || FIXED_REVIEW_PERIOD)}</span>
                <span class="review-meta-chip">Coverage ${escapeHtml(String(uploadedPanelCount))} / ${escapeHtml(String(expectedPanelCount))} panels</span>
                <span class="review-meta-chip">${escapeHtml(uploadCountLabel)}</span>
              </div>
              <div class="review-card-metrics">
                ${renderReviewMetric("Current rank", item.draftPoints?.promotionDraft?.currentRank || "Not set")}
                ${renderReviewMetric(getPromotionBasisLabel(item.draftPoints?.promotionDraft?.basis), item.draftPoints?.promotionDraft?.suggestedRank || "Pending evaluator review", true)}
                ${renderReviewMetric(
                  item.draftPoints?.promotionDraft?.basis === "evaluator"
                    ? "Projected rank from evaluator score"
                    : item.draftPoints?.promotionDraft?.basis === "pending-review"
                      ? "Projected rank"
                      : "Projected rank from uploads and inputs",
                  item.draftPoints?.promotionDraft?.projectedRank || "Pending evaluator review",
                )}
                ${renderReviewMetric("Approximate total from uploaded data", String(item.draftPoints?.overallEstimate ?? 0))}
                ${renderReviewMetric("Latest evaluator total", formatOptionalNumber(item.draftPoints?.promotionDraft?.evaluatorTotalScore, "Pending"))}
                ${renderReviewMetric(
                  item.draftPoints?.promotionDraft?.basis === "evaluator"
                    ? "Official weighted score"
                    : item.draftPoints?.promotionDraft?.basis === "pending-review"
                      ? "Weighted score"
                      : "Approximate weighted score",
                  formatOptionalNumber(item.draftPoints?.promotionDraft?.weightedScore, "Pending"),
                  true,
                )}
                ${renderReviewMetric("Sub-rank increments", formatOptionalNumber(item.draftPoints?.promotionDraft?.subrankIncrements, "Pending"))}
                ${renderReviewMetric("Applied weight profile", item.draftPoints?.promotionDraft?.appliedWeightProfile || "Pending")}
                ${renderReviewMetric("Status", reviewStatusLabel)}
                ${renderReviewMetric("Confidence", reviewConfidenceLabel)}
              </div>
              ${renderCycleMetricReviewSection(item.cycleData?.performanceReview)}
              ${item.draftPoints?.promotionDraft?.pendingRequirement ? `<p class="card-copy rank-panel-warning"><strong>Pending requirement:</strong> ${escapeHtml(item.draftPoints.promotionDraft.pendingRequirement)}</p>` : ""}
              ${item.draftPoints?.promotionDraft?.note ? `<p class="card-copy review-card-note">${escapeHtml(item.draftPoints.promotionDraft.note)}</p>` : ""}
              <details class="review-card-details">
                <summary>
                  <span>Upload logs</span>
                  <span class="review-card-details-meta">${escapeHtml(uploadCountLabel)}</span>
                </summary>
                <div class="review-log-list">
                  ${uploads.length ? uploads.map(renderUploadLogChip).join("") : '<div class="notice">No uploads linked yet.</div>'}
                </div>
              </details>
              ${renderEvaluatorDeleteManager(item)}
              <div class="review-card-actions">
                <button class="button button-secondary queue-score-button" type="button" data-training-id="${escapeHtml(latestTrainingId)}" ${latestTrainingId ? "" : "disabled"}>
                  Score Latest Record
                </button>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  reviewQueue.querySelectorAll(".queue-score-button").forEach((button) => {
    button.addEventListener("click", () => {
      const trainingId = button.dataset.trainingId || "";
      const target = byId("training-example-id");
      if (target) {
        target.value = trainingId;
      }
      const latestTrainingItem = latestTrainingItemById.get(trainingId);
      selectedSummarySheetRecord = item;
      loadSummarySheetFromRecord(item);
      hydrateTrainingForm(latestTrainingItem);
      if (trainingResult) {
        setNotice(trainingResult, `Training example ${trainingId} selected for evaluator scoring.`);
      }
      trainingForm?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderEvaluatorInsights(items) {
  if (!evaluatorInsights) {
    return;
  }

  const queueItems = Array.isArray(items) ? items : [];
  if (!queueItems.length) {
    evaluatorInsights.innerHTML = '<div class="notice">No employee records are available for charting yet.</div>';
    return;
  }

  const summary = summarizeEvaluatorInsights(queueItems);
  evaluatorInsights.innerHTML = `
    <div class="insight-stat-grid">
      ${renderInsightStatCard("Queue records", String(summary.totalRecords))}
      ${renderInsightStatCard("Evaluator-backed", String(summary.evaluatorBackedCount))}
      ${renderInsightStatCard("Pending review", String(summary.pendingReviewCount))}
      ${renderInsightStatCard("Avg coverage", `${summary.averageCoverage}%`)}
    </div>
    <div class="insight-chart-grid">
      ${renderInsightChartCard(
        "Review status mix",
        "Where the current queue sits across status categories.",
        summary.statusSeries,
        "status",
        "No status data is available for the current records.",
      )}
      ${renderInsightChartCard(
        "Confidence mix",
        "How confident the evaluator pipeline is for the queue.",
        summary.confidenceSeries,
        "confidence",
        "No confidence data is available for the current records.",
      )}
      ${renderInsightChartCard(
        "Evidence coverage",
        "How complete the uploaded evidence sets are across employees.",
        summary.coverageSeries,
        "coverage",
        "No coverage data is available for the current records.",
      )}
    </div>
  `;
}

function summarizeEvaluatorInsights(items) {
  const statusOrder = [
    "ready",
    "preliminary",
    "needs-exact-rank",
    "pending-doctoral-attainment",
    "pending-professor-accreditation",
    "pending-cup-certification",
    "pending-review",
  ];
  const confidenceOrder = ["high", "medium", "low", "pending"];
  const coverageOrder = ["complete", "strong", "partial", "missing"];

  const statusCounts = new Map();
  const confidenceCounts = new Map();
  const coverageCounts = new Map();
  let totalCoverage = 0;
  let evaluatorBackedCount = 0;
  let pendingReviewCount = 0;

  items.forEach((item) => {
    const promotionDraft = item?.draftPoints?.promotionDraft || {};
    const statusKey = normalizeReviewQueueStatus(promotionDraft.status);
    const confidenceKey = getReviewQueueConfidenceValue(promotionDraft);
    const uploadedPanels = Number(item?.draftPoints?.evidenceCoverage?.uploadedPanelCount ?? 0);
    const expectedPanels = Number(item?.draftPoints?.evidenceCoverage?.expectedPanelCount ?? 0);
    const coverageRatio = expectedPanels > 0 ? uploadedPanels / expectedPanels : 0;

    statusCounts.set(statusKey, (statusCounts.get(statusKey) || 0) + 1);
    confidenceCounts.set(confidenceKey, (confidenceCounts.get(confidenceKey) || 0) + 1);
    coverageCounts.set(getCoverageBucket(coverageRatio), (coverageCounts.get(getCoverageBucket(coverageRatio)) || 0) + 1);
    totalCoverage += coverageRatio;

    if (promotionDraft.basis === "evaluator") {
      evaluatorBackedCount += 1;
    }
    if (statusKey === "pending-review") {
      pendingReviewCount += 1;
    }
  });

  return {
    totalRecords: items.length,
    evaluatorBackedCount,
    pendingReviewCount,
    averageCoverage: items.length ? Math.round((totalCoverage / items.length) * 100) : 0,
    statusSeries: buildInsightSeries(statusOrder, statusCounts, getPromotionStatusLabel, "status"),
    confidenceSeries: buildInsightSeries(confidenceOrder, confidenceCounts, getPromotionConfidenceLabel, "confidence"),
    coverageSeries: buildInsightSeries(coverageOrder, coverageCounts, getCoverageBucketLabel, "coverage"),
  };
}

function buildInsightSeries(order, counts, labelResolver, tonePrefix) {
  return order
    .map((key) => ({
      key,
      label: labelResolver(key),
      value: counts.get(key) || 0,
      tone: `${tonePrefix}-${key}`,
    }))
    .filter((item) => item.value > 0);
}

function renderInsightStatCard(label, value) {
  return `
    <article class="insight-stat-card">
      <span class="insight-stat-label">${escapeHtml(label)}</span>
      <strong class="insight-stat-value">${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderInsightChartCard(title, description, series, tonePrefix, emptyMessage) {
  const maxValue = series.reduce((max, item) => Math.max(max, item.value), 0);
  return `
    <article class="insight-chart-card">
      <div class="insight-chart-heading">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p class="card-copy">${escapeHtml(description)}</p>
        </div>
        <span class="insight-chart-total">${escapeHtml(String(series.reduce((sum, item) => sum + item.value, 0)))} records</span>
      </div>
      ${
        series.length
          ? `<div class="insight-bar-chart">
              ${series
                .map((item) => {
                  const width = maxValue ? Math.max(8, Math.round((item.value / maxValue) * 100)) : 0;
                  return `
                    <div class="insight-bar-row">
                      <span class="insight-bar-label">${escapeHtml(item.label)}</span>
                      <div class="insight-bar-track" aria-hidden="true">
                        <span class="insight-bar-fill" data-tone="${escapeHtml(`${tonePrefix}-${item.key}`)}" style="width:${width}%"></span>
                      </div>
                      <span class="insight-bar-value">${escapeHtml(String(item.value))}</span>
                    </div>
                  `;
                })
                .join("")}
            </div>`
          : `<div class="notice">${escapeHtml(emptyMessage)}</div>`
      }
    </article>
  `;
}

function renderSummarySheetPreview() {
  if (!summarySheetPreview) {
    return;
  }

  summarySheetPreview.innerHTML = renderSummarySheetDocument(collectSummarySheetValues());
}

function loadSummarySheetFromRecord(record) {
  if (!record) {
    return;
  }

  const parsedName = splitSummarySheetName(record.name || "");
  const formalName = buildSummarySheetFormalName(parsedName);
  const recordLabel = record.cycleData?.performanceReview?.reviewPeriod || record.semester || FIXED_REVIEW_PERIOD;

  setFieldValue("summary-sheet-last-name", parsedName.lastName);
  setFieldValue("summary-sheet-first-name", parsedName.firstName);
  setFieldValue("summary-sheet-middle-name", parsedName.middleName);
  setFieldValue("summary-sheet-extension-name", parsedName.extensionName);
  setFieldValue("summary-sheet-employee-id", record.employeeId || "");
  setFieldValue("summary-sheet-record-label", recordLabel);
  setFieldValue("summary-sheet-conforme-name", formalName);
  setFieldValue("summary-sheet-acknowledgment-name", formalName);

  selectedSummarySheetRecord = record;
  setNotice(summarySheetStatus, `Loaded ${record.name || "the selected record"} into the summary sheet editor.`, false);
  renderSummarySheetPreview();
}

function collectSummarySheetValues() {
  return {
    subject: {
      lastName: valueOf("summary-sheet-last-name").trim(),
      firstName: valueOf("summary-sheet-first-name").trim(),
      middleName: valueOf("summary-sheet-middle-name").trim(),
      extensionName: valueOf("summary-sheet-extension-name").trim(),
      employeeId: valueOf("summary-sheet-employee-id").trim(),
      recordLabel: valueOf("summary-sheet-record-label").trim(),
    },
    signatures: SUMMARY_SHEET_SIGNATURES.map((signature) => ({
      ...signature,
      name: valueOf(signature.nameFieldId).trim(),
      date: valueOf(signature.dateFieldId).trim(),
    })),
  };
}

function renderSummarySheetDocument(values) {
  const topRows = [
    ["Last name", values.subject.lastName],
    ["First name", values.subject.firstName],
    ["Middle name", values.subject.middleName],
    ["Extension", values.subject.extensionName],
    ["Employee ID", values.subject.employeeId],
    ["Record label", values.subject.recordLabel],
  ];
  const reviewerSignatures = values.signatures.slice(0, 5);
  const rightSignatures = values.signatures.slice(5);

  return `
    <p class="summary-sheet-title">INDIVIDUAL SUMMARY SHEET</p>
    <p class="summary-sheet-subtitle">
      ${escapeHtml(values.subject.recordLabel || "Editable summary sheet prepared from the evaluator panel.")}
    </p>
    <div class="summary-sheet-top-grid">
      ${topRows
        .map(
          ([label, value]) => `
            <div class="summary-sheet-top-row">
              <span class="summary-sheet-top-label">${escapeHtml(label)}</span>
              <span class="summary-sheet-top-value">${escapeHtml(value || " ")}</span>
            </div>
          `,
        )
        .join("")}
    </div>
    <div class="summary-sheet-divider"></div>
    <div class="summary-sheet-bottom-grid">
      <section>
        <div class="summary-sheet-section-title">Evaluated By</div>
        <div class="summary-sheet-reviewer-list">
          ${reviewerSignatures.map(renderSummarySheetSignatureBox).join("")}
        </div>
      </section>
      <section class="summary-sheet-right-stack">
        ${rightSignatures.map(renderSummarySheetSignatureBox).join("")}
      </section>
    </div>
  `;
}

function renderSummarySheetSignatureBox(signature) {
  return `
    <div class="summary-signature-box">
      <div class="summary-signature-name">${escapeHtml(signature.name || " ")}</div>
      <div class="summary-signature-role">${escapeHtml(signature.role)}</div>
      <div class="summary-signature-date">Date: ${escapeHtml(signature.date || " ")}</div>
    </div>
  `;
}

function splitSummarySheetName(name) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) {
    return {
      lastName: "",
      firstName: "",
      middleName: "",
      extensionName: "",
    };
  }

  const extensionMatch = normalizedName.match(/\b(JR|SR|II|III|IV|V|VI)\.?\s*$/i);
  let workingName = normalizedName;
  let extensionName = "";

  if (extensionMatch && typeof extensionMatch.index === "number") {
    extensionName = extensionMatch[1].toUpperCase();
    workingName = workingName.slice(0, extensionMatch.index).trim().replace(/[,\s]+$/, "");
  }

  if (workingName.includes(",")) {
    const [lastPart, ...restParts] = workingName.split(",");
    const remainder = restParts.join(",").trim();
    const nameParts = remainder.split(/\s+/).filter(Boolean);
    return {
      lastName: lastPart.trim(),
      firstName: nameParts.shift() || "",
      middleName: nameParts.join(" "),
      extensionName,
    };
  }

  const nameParts = workingName.split(/\s+/).filter(Boolean);
  if (nameParts.length <= 1) {
    return {
      lastName: nameParts[0] || workingName,
      firstName: "",
      middleName: "",
      extensionName,
    };
  }

  if (nameParts.length === 2) {
    return {
      firstName: nameParts[0],
      middleName: "",
      lastName: nameParts[1],
      extensionName,
    };
  }

  return {
    firstName: nameParts[0],
    middleName: nameParts.slice(1, -1).join(" "),
    lastName: nameParts[nameParts.length - 1],
    extensionName,
  };
}

function buildSummarySheetFormalName(parts) {
  return [parts.firstName, parts.middleName, parts.lastName, parts.extensionName]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSummarySheetPrintHtml(values) {
  const sheetHtml = renderSummarySheetDocument(values);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Individual Summary Sheet</title>
    <style>
      @page {
        size: letter landscape;
        margin: 0.45in;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #111;
        font-family: Arial, Helvetica, sans-serif;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .summary-sheet-paper {
        display: grid;
        gap: 12px;
        width: 100%;
        border: 1px solid #1f1f1f;
        padding: 16px;
      }

      .summary-sheet-title {
        margin: 0;
        text-align: center;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.12em;
      }

      .summary-sheet-subtitle {
        margin: 0;
        text-align: center;
        font-size: 10px;
        color: #444;
        line-height: 1.4;
      }

      .summary-sheet-top-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px 12px;
      }

      .summary-sheet-top-row {
        display: grid;
        grid-template-columns: 132px minmax(0, 1fr);
        gap: 8px;
        align-items: end;
        padding-bottom: 3px;
        border-bottom: 1px solid rgba(17, 17, 17, 0.45);
      }

      .summary-sheet-top-label {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .summary-sheet-top-value {
        min-height: 14px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.35;
      }

      .summary-sheet-divider {
        height: 1px;
        background: rgba(17, 17, 17, 0.45);
      }

      .summary-sheet-bottom-grid {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
        gap: 12px;
      }

      .summary-sheet-reviewer-list,
      .summary-sheet-right-stack {
        display: grid;
        gap: 10px;
      }

      .summary-sheet-section-title {
        margin: 0 0 8px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .summary-signature-box {
        display: grid;
        gap: 6px;
        min-height: 104px;
        border: 1px solid rgba(17, 17, 17, 0.45);
        padding: 10px;
      }

      .summary-signature-name {
        min-height: 16px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.35;
      }

      .summary-signature-role {
        font-size: 9px;
        line-height: 1.35;
      }

      .summary-signature-date {
        margin-top: auto;
        font-size: 9px;
      }
    </style>
  </head>
  <body>
    <div class="summary-sheet-paper">
      ${sheetHtml}
    </div>
  </body>
</html>`;
}

function downloadSummarySheetPdf() {
  const values = collectSummarySheetValues();
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.srcdoc = buildSummarySheetPrintHtml(values);

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 1000);
  };

  iframe.addEventListener("load", () => {
    const printWindow = iframe.contentWindow;
    if (!printWindow) {
      setNotice(summarySheetStatus, "The printable view could not be prepared in this browser.", true);
      cleanup();
      return;
    }

    printWindow.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        cleanup();
        setNotice(summarySheetStatus, "The printable view could not be opened. Try again or use a different browser.", true);
      }
    }, 250);
  }, { once: true });

  document.body.appendChild(iframe);
  setNotice(summarySheetStatus, "Print dialog opened. Choose Save as PDF to download the summary sheet.", false);
}

function getCoverageBucket(ratio) {
  if (ratio >= 1) {
    return "complete";
  }
  if (ratio >= 0.75) {
    return "strong";
  }
  if (ratio > 0) {
    return "partial";
  }
  return "missing";
}

function getCoverageBucketLabel(bucket) {
  if (bucket === "complete") {
    return "100% coverage";
  }
  if (bucket === "strong") {
    return "75-99% coverage";
  }
  if (bucket === "partial") {
    return "1-74% coverage";
  }
  return "No coverage";
}

function getReviewQueueFilterState() {
  return {
    query: (reviewQueueSearch?.value || "").trim().toLowerCase(),
    status: (reviewQueueStatusFilter?.value || "").trim().toLowerCase(),
    confidence: (reviewQueueConfidenceFilter?.value || "").trim().toLowerCase(),
    panelKey: reviewQueuePanelFilter?.value || "",
  };
}

function matchesReviewQueueFilter(item, filters) {
  const uploads = Array.isArray(item?.uploadLogs) ? item.uploadLogs : [];
  const promotionDraft = item?.draftPoints?.promotionDraft || {};
  const normalizedStatus = normalizeReviewQueueStatus(promotionDraft.status);
  const normalizedConfidence = getReviewQueueConfidenceValue(promotionDraft);

  if (filters.status && normalizedStatus !== filters.status) {
    return false;
  }

  if (filters.confidence && normalizedConfidence !== filters.confidence) {
    return false;
  }

  if (filters.panelKey && !uploads.some((upload) => upload.metadata?.panelKey === filters.panelKey)) {
    return false;
  }

  if (!filters.query) {
    return true;
  }

  const haystack = [
    item.name,
    item.employeeId,
    item.semester,
    item.createdBy?.fullName,
    item.createdBy?.email,
    promotionDraft.currentRank,
    promotionDraft.suggestedRank,
    promotionDraft.projectedRank,
    promotionDraft.appliedWeightProfile,
    promotionDraft.pendingRequirement,
    promotionDraft.note,
    getPromotionBasisLabel(promotionDraft.basis),
    getPromotionStatusLabel(normalizedStatus),
    normalizedConfidence === "pending" ? "Pending" : getPromotionConfidenceLabel(normalizedConfidence),
    ...uploads.flatMap((upload) => [
      upload.originalName,
      upload.metadata?.panelTitle,
      upload.metadata?.panelKey,
      upload.metadata?.analysisSummary,
      upload.metadata?.linkage,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(filters.query);
}

function syncReviewQueueFilterOptions(items) {
  if (!reviewQueuePanelFilter) {
    return;
  }

  const selectedValue = reviewQueuePanelFilter.value;
  const panelMap = new Map();

  items.forEach((item) => {
    const uploads = Array.isArray(item?.uploadLogs) ? item.uploadLogs : [];
    uploads.forEach((upload) => {
      const panelKey = upload.metadata?.panelKey;
      if (!panelKey || panelMap.has(panelKey)) {
        return;
      }
      panelMap.set(panelKey, upload.metadata?.panelTitle || panelKey);
    });
  });

  const panelOptions = [...panelMap.entries()]
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([panelKey, panelTitle]) => `<option value="${escapeHtml(panelKey)}">${escapeHtml(panelTitle)}</option>`)
    .join("");

  reviewQueuePanelFilter.innerHTML = `<option value="">All upload panels</option>${panelOptions}`;
  reviewQueuePanelFilter.value = panelMap.has(selectedValue) ? selectedValue : "";
}

function syncReviewQueueFilterStatus(visibleCount, totalCount, hasActiveFilters) {
  if (!reviewQueueFilterStatus) {
    return;
  }

  if (!totalCount) {
    reviewQueueFilterStatus.textContent = "No employee submissions are waiting in the evaluator queue.";
    return;
  }

  if (!hasActiveFilters) {
    reviewQueueFilterStatus.textContent = `Showing all ${totalCount} faculty record${totalCount === 1 ? "" : "s"} in the queue.`;
    return;
  }

  reviewQueueFilterStatus.textContent = `Showing ${visibleCount} of ${totalCount} faculty record${totalCount === 1 ? "" : "s"} after filtering.`;
}

function normalizeReviewQueueStatus(status) {
  if (!status || typeof status !== "string") {
    return "pending-review";
  }

  return status.trim().toLowerCase() || "pending-review";
}

function getReviewQueueConfidenceValue(promotionDraft) {
  const confidence = promotionDraft?.confidence || (promotionDraft?.basis === "evaluator" ? "high" : null);
  if (!confidence || typeof confidence !== "string") {
    return "pending";
  }

  return confidence.trim().toLowerCase() || "pending";
}

function renderReviewMetric(label, value, emphasis = false) {
  return `
    <div class="review-card-metric${emphasis ? " review-card-metric-emphasis" : ""}">
      <span class="review-card-metric-label">${escapeHtml(label)}</span>
      <strong class="review-card-metric-value">${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderCycleMetricReviewSection(performanceReview) {
  const cycleMetrics = performanceReview?.cycleMetrics || {};
  const metricCards = CYCLE_METRIC_DEFINITIONS.map((metric) => buildCycleMetricReviewCard(metric, cycleMetrics?.[metric.key]))
    .filter(Boolean)
    .join("");

  if (!metricCards) {
    return `
      <section class="review-cycle-section">
        <div class="review-cycle-heading">
          <h3>Cycle Metrics Review</h3>
          <span class="review-cycle-badge review-cycle-badge-pending">Semester breakdown pending</span>
        </div>
        <p class="card-copy">This record does not yet have the semester-by-semester values required for the ${escapeHtml(FIXED_REVIEW_PERIOD)} cycle.</p>
      </section>
    `;
  }

  const validations = buildCycleMetricValidations(cycleMetrics);

  return `
    <section class="review-cycle-section">
      <div class="review-cycle-heading">
        <h3>Cycle Metrics Review</h3>
        <span class="review-cycle-badge ${validations.some((item) => item.level === "error") ? "review-cycle-badge-warning" : "review-cycle-badge-ready"}">
          ${validations.some((item) => item.level === "error") ? "Needs metric cleanup" : "Semester metrics complete"}
        </span>
      </div>
      <div class="review-cycle-grid">
        ${metricCards}
      </div>
      <div class="review-cycle-validations">
        ${validations.map((item) => `
          <span class="review-validation-chip review-validation-chip-${escapeHtml(item.level)}">${escapeHtml(item.message)}</span>
        `).join("")}
      </div>
    </section>
  `;
}

function buildCycleMetricReviewCard(metric, metricSummary) {
  if (!metricSummary) {
    return "";
  }

  const yearlyEntries = Array.isArray(metricSummary.yearlyEntries) ? metricSummary.yearlyEntries : [];
  const filledSemesters = yearlyEntries.reduce((count, entry) => {
    const firstFilled = Number.isFinite(entry?.firstSemester) ? 1 : 0;
    const secondFilled = Number.isFinite(entry?.secondSemester) ? 1 : 0;
    return count + firstFilled + secondFilled;
  }, 0);
  const fillRatio = Math.min(100, Math.round((filledSemesters / (REVIEW_CYCLE_YEARS.length * 2)) * 100));

  return `
    <article class="review-cycle-card">
      <div class="review-cycle-card-header">
        <div>
          <strong>${escapeHtml(metric.label)}</strong>
          <p class="card-copy">Overall average: ${escapeHtml(formatMetricNumber(metricSummary.average))}</p>
        </div>
        <span class="review-cycle-stat">${escapeHtml(String(filledSemesters))}/8 sems</span>
      </div>
      <div class="review-cycle-progress">
        <span class="review-cycle-progress-fill" style="width:${escapeHtml(String(fillRatio))}%"></span>
      </div>
      <div class="review-cycle-year-list">
        ${REVIEW_CYCLE_YEARS.map((year) => {
          const entry = yearlyEntries.find((item) => item?.yearLabel === year.key) || {};
          return `
            <div class="review-cycle-year-row">
              <span>${escapeHtml(year.label)}</span>
              <span>1st: ${escapeHtml(formatOptionalMetricNumber(entry.firstSemester))}</span>
              <span>2nd: ${escapeHtml(formatOptionalMetricNumber(entry.secondSemester))}</span>
              <strong>Avg: ${escapeHtml(formatOptionalMetricNumber(entry.yearlyAverage))}</strong>
            </div>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function buildCycleMetricValidations(cycleMetrics) {
  const validations = [];

  for (const metric of CYCLE_METRIC_DEFINITIONS) {
    const metricSummary = cycleMetrics?.[metric.key];
    const yearlyEntries = Array.isArray(metricSummary?.yearlyEntries) ? metricSummary.yearlyEntries : [];
    const missingPeriods = [];

    for (const year of REVIEW_CYCLE_YEARS) {
      const entry = yearlyEntries.find((item) => item?.yearLabel === year.key) || {};
      if (!Number.isFinite(entry.firstSemester)) {
        missingPeriods.push(`${year.label} 1st sem`);
      }
      if (!Number.isFinite(entry.secondSemester)) {
        missingPeriods.push(`${year.label} 2nd sem`);
      }
      if (metric.max !== undefined) {
        if (Number.isFinite(entry.firstSemester) && entry.firstSemester > metric.max) {
          validations.push({ level: "error", message: `${metric.label} exceeds ${metric.scaleLabel} in ${year.label} 1st sem.` });
        }
        if (Number.isFinite(entry.secondSemester) && entry.secondSemester > metric.max) {
          validations.push({ level: "error", message: `${metric.label} exceeds ${metric.scaleLabel} in ${year.label} 2nd sem.` });
        }
      }
    }

    if (missingPeriods.length) {
      validations.push({ level: "error", message: `${metric.label} is missing ${missingPeriods.length} semester value(s).` });
    } else {
      validations.push({ level: "success", message: `${metric.label} is complete for all 8 semesters.` });
    }
  }

  return validations.length ? validations : [{ level: "warning", message: "Cycle metrics are not yet available for this record." }];
}

function renderUploadLogChip(log) {
  return `
    <article class="upload-log-chip">
      <strong>${escapeHtml(log.originalName)}</strong>
      <div class="upload-log-chip-meta">
        <span>${escapeHtml(log.metadata?.panelTitle || log.metadata?.panelKey || "unassigned panel")}</span>
        <span>${escapeHtml(log.metadata?.linkage || "pending linkage")}</span>
      </div>
      <p>${escapeHtml(log.metadata?.analysisSummary || "Stored without extracted summary.")}</p>
      <small>${escapeHtml(formatDatabaseValue(log.createdAt))}</small>
    </article>
  `;
}

function renderPanelUploadHistory(panelKey) {
  const uploads = employeeUploads
    .filter((item) => item.metadata?.panelKey === panelKey)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  if (!uploads.length) {
    return '<div class="notice">No saved files for this panel yet.</div>';
  }

  return uploads
    .map(
      (item) => `
        <article class="upload-history-item">
          <div class="upload-history-header">
            <div class="upload-history-title">
              <strong>${escapeHtml(item.originalName)}</strong>
              <span>${escapeHtml(formatDatabaseValue(item.createdAt))}</span>
            </div>
          </div>
          <p>${escapeHtml(item.metadata?.analysisSummary || "Stored with no extracted summary yet.")}</p>
        </article>
      `,
    )
    .join("");
}

function renderDatabaseOverview(data) {
  if (!databaseViewer) {
    return;
  }

  const counts = [
    { label: "Users", value: data.counts?.users ?? 0 },
    { label: "Faculty Profiles", value: data.counts?.facultyProfiles ?? 0 },
    { label: "Uploaded Documents", value: data.counts?.uploadedDocuments ?? 0 },
    { label: "Training Examples", value: data.counts?.trainingExamples ?? 0 },
    { label: "Predictions", value: data.counts?.predictions ?? 0 },
  ];

  const sections = [
    {
      title: "Recent Users",
      rows: data.recent?.users ?? [],
      columns: [
        { key: "fullName", label: "Name" },
        { key: "email", label: "Email" },
        { key: "role", label: "Role" },
      ],
    },
    {
      title: "Recent Faculty Profiles",
      rows: data.recent?.facultyProfiles ?? [],
      columns: [
        { key: "name", label: "Faculty" },
        { key: "employeeId", label: "Employee ID" },
        { key: "semester", label: "Review Cycle" },
        { key: "createdAt", label: "Created" },
      ],
    },
    {
      title: "Recent Uploaded Documents",
      rows: data.recent?.uploadedDocuments ?? [],
      columns: [
        { key: "originalName", label: "File" },
        { key: "kind", label: "Kind" },
        { key: "mimeType", label: "Type" },
        { key: "createdAt", label: "Created" },
      ],
    },
    {
      title: "Recent Training Examples",
      rows: data.recent?.trainingExamples ?? [],
      columns: [
        { key: "id", label: "ID" },
        { key: "status", label: "Status" },
        { key: "datasetSplit", label: "Split" },
        { key: "labelPromoted", label: "Promoted" },
        { key: "createdAt", label: "Created" },
      ],
    },
  ];

  databaseViewer.innerHTML = `
    <div class="database-counts">
      ${counts
        .map(
          (item) => `
            <article class="database-count-card">
              <span class="database-count-label">${escapeHtml(item.label)}</span>
              <strong class="database-count-value">${escapeHtml(String(item.value))}</strong>
            </article>
          `,
        )
        .join("")}
    </div>
    <div class="database-sections">
      ${sections
        .map(
          (section) => `
            <article class="card database-table-card">
              <h3>${escapeHtml(section.title)}</h3>
              ${renderDatabaseTable(section.columns, section.rows)}
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDatabaseTable(columns, rows) {
  if (!rows.length) {
    return '<div class="notice">No records yet.</div>';
  }

  const header = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows
    .map(
      (row) => `
        <tr>
          ${columns
            .map((column) => `<td>${escapeHtml(formatDatabaseValue(row[column.key]))}</td>`)
            .join("")}
        </tr>
      `,
    )
    .join("");

  return `
    <div class="database-table-wrap">
      <table class="database-table">
        <thead>
          <tr>${header}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function buildFacultyPayload() {
  const employeeId = sanitizeEmployeeId(valueOf("employeeId"));
  if (!/^\d{10}$/.test(employeeId)) {
    setNotice(facultyResult, "Employee ID must contain exactly 10 digits.", true);
    employeeIdField?.focus();
    return null;
  }

  const cycleMetrics = collectCycleMetrics();
  const cycleMetricError = validateCycleMetrics(cycleMetrics);
  if (cycleMetricError) {
    setNotice(facultyResult, cycleMetricError, true);
    return null;
  }

  return {
    personalData: {
      fullName: valueOf("fullName"),
      employeeId,
      academicRank: valueOf("academicRank"),
      yearsInService: numberOf("yearsInService"),
      highestEducationalAttainment: valueOf("attainment"),
    },
    performanceReview: {
      reviewPeriod: FIXED_REVIEW_PERIOD,
      ipcrAverage: cycleMetrics.ipcrAverage.average,
      teachingEffectiveness: cycleMetrics.teachingEffectiveness.average,
      researchOutputs: cycleMetrics.researchOutputs.average,
      extensionServices: cycleMetrics.extensionServices.average,
      administrativeExperience: numberOf("administrativeExperience"),
      cycleMetrics,
    },
    promotionHistory: collectPromotionHistory(),
  };
}

function handleEmployeeProfileAction(event) {
  const editButton = event.target.closest("[data-action='edit-profile']");
  if (!editButton) {
    return;
  }

  const profile = employeeProfileRecords.get(editButton.dataset.profileId);
  if (!profile) {
    setNotice(facultyResult, "That profile could not be loaded for editing.", true);
    return;
  }

  selectFacultyProfileForEditing(profile);
  setNotice(
    facultyResult,
    `Editing ${profile.name || "the selected faculty profile"}. Update the baseline fields, then save to refresh the approximation.`,
    false,
  );
}

function groupPanelsByKra(panels) {
  return Object.entries(
    panels.reduce((groups, panel) => {
      if (!groups[panel.kraTitle]) {
        groups[panel.kraTitle] = [];
      }
      groups[panel.kraTitle].push(panel);
      return groups;
    }, {}),
  );
}

function describePanelAudience(panels) {
  const labels = Array.from(new Set(panels.map((panel) => panel.audienceLabel).filter(Boolean)));
  if (!labels.length) {
    return "Upload supporting evidence for each criterion in this KRA.";
  }
  return labels.join(" • ");
}

function buildScoreHelpText(panel) {
  const sharedCapText =
    panel.sharedCapLabel && panel.sharedCapMaxScore
      ? ` ${panel.sharedCapLabel}: ${panel.sharedCapMaxScore} points.`
      : "";
  return `Score range: 0 to ${panel.maxScore}.${sharedCapText}`;
}

function collectCriterionScores() {
  const scores = {};
  document.querySelectorAll("[data-score-key]").forEach((input) => {
    const scoreKey = input.dataset.scoreKey;
    const rawValue = Number.parseFloat(input.value);
    if (scoreKey && Number.isFinite(rawValue) && rawValue >= 0) {
      scores[scoreKey] = rawValue;
    }
  });
  return scores;
}

function syncCriterionScoreTotal() {
  if (!trainingScoreTotal) {
    return;
  }

  const scores = collectCriterionScores();
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  trainingScoreTotal.textContent = String(Math.round(total * 100) / 100);
}

function hydrateTrainingForm(trainingItem) {
  if (!trainingForm) {
    return;
  }

  const labelField = byId("training-label");
  const sourceField = byId("training-source");
  const splitField = byId("training-split");
  const notesField = byId("training-notes");

  if (labelField) {
    labelField.value = String(trainingItem?.labelPromoted ?? true);
  }
  if (sourceField) {
    sourceField.value = trainingItem?.labelSource || "Committee decision";
  }
  if (splitField) {
    splitField.value = trainingItem?.datasetSplit || "train";
  }
  if (notesField) {
    notesField.value = trainingItem?.evaluatorAssessment?.freeformNotes || trainingItem?.notes || "";
  }

  document.querySelectorAll("[data-score-key]").forEach((input) => {
    const scoreKey = input.dataset.scoreKey;
    const scoreValue = trainingItem?.evaluatorAssessment?.criterionScores?.[scoreKey];
    input.value = Number.isFinite(scoreValue) ? String(scoreValue) : "";
  });

  syncCriterionScoreTotal();
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === "register";

  if (nameField) {
    nameField.style.display = isRegister ? "grid" : "none";
  }
  if (roleField) {
    roleField.style.display = isRegister ? "grid" : "none";
  }
  if (authSubmit) {
    authSubmit.textContent = isRegister ? "Create Account" : "Sign In";
  }
  showLoginButton?.classList.toggle("button-primary", !isRegister);
  showLoginButton?.classList.toggle("button-secondary", isRegister);
  showRegisterButton?.classList.toggle("button-primary", isRegister);
  showRegisterButton?.classList.toggle("button-secondary", !isRegister);
}

function getHomePathForRole(role) {
  return role === "EVALUATOR" ? "/evaluator" : "/employee";
}

// ── Toast Notification System ──
function showToast(message, type = "success") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === "success" ? "✓" : "✕"}</span><span class="toast-msg">${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    toast.classList.add("toast-exit");
    toast.addEventListener("transitionend", () => toast.remove());
  }, 4000);
}

// ── Proactive Session Check ──
async function ensureSession() {
  try {
    await apiFetch(buildApiUrl("/api/auth/me"), { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

// ── Upload Button Loading State ──
function setUploadButtonLoading(btn, labelEl, spinnerEl, loading) {
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle("button-loading", loading);
  if (labelEl) labelEl.style.display = loading ? "none" : "";
  if (spinnerEl) spinnerEl.style.display = loading ? "inline" : "none";
}

function buildApiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

async function apiFetch(url, options, sendJson = true) {
  const response = await fetch(url, {
    credentials: "include",
    headers: sendJson
      ? {
          "Content-Type": "application/json",
          ...(options?.headers ?? {}),
        }
      : options?.headers,
    ...options,
  });

  return readJson(response);
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      if (window.location.pathname !== "/") {
        showToast("Your session has expired. Redirecting to login...", "error");
        setTimeout(() => window.location.assign("/"), 1500);
      }
      throw new Error("Session expired - please log in again");
    }
    const errorMessage =
      typeof data.error === "string" && typeof data.details === "string" && data.error !== data.details
        ? `${data.error}: ${data.details}`
        : data.error || data.details || `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }
  return data;
}

function byId(id) {
  return document.getElementById(id);
}

function valueOf(id) {
  const element = byId(id);
  return element ? element.value : "";
}

function numberOf(id) {
  const value = Number.parseFloat(valueOf(id));
  return Number.isFinite(value) ? value : 0;
}

function setFieldValue(id, value) {
  const element = byId(id);
  if (!element) {
    return;
  }

  element.value = value === null || value === undefined ? "" : String(value);
}

function sanitizeEmployeeId(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function setEmployeeIdValue(value) {
  setFieldValue("employeeId", sanitizeEmployeeId(value));
}

function enforceEmployeeIdDigits(event) {
  if (!event?.target) {
    return;
  }

  const sanitizedValue = sanitizeEmployeeId(event.target.value);
  if (event.target.value !== sanitizedValue) {
    event.target.value = sanitizedValue;
  }
}

function renderCycleMetricInputs() {
  if (!cycleMetricsGrid) {
    return;
  }

  cycleMetricsGrid.innerHTML = CYCLE_METRIC_DEFINITIONS.map((metric) => `
    <article class="cycle-metric-card">
      <div class="cycle-metric-header">
        <div>
          <h4>${escapeHtml(metric.label)}</h4>
          <p class="card-copy">${escapeHtml(metric.scaleLabel)}</p>
        </div>
        <div class="cycle-metric-average">
          <span>Overall average</span>
          <strong data-cycle-average="${escapeHtml(metric.key)}">0.00</strong>
        </div>
      </div>
      <div class="cycle-metric-table-wrap">
        <table class="cycle-metric-table">
          <thead>
            <tr>
              <th>Academic year</th>
              <th>1st semester</th>
              <th>2nd semester</th>
              <th>Year average</th>
            </tr>
          </thead>
          <tbody>
            ${REVIEW_CYCLE_YEARS.map((year) => `
              <tr>
                <th scope="row">${escapeHtml(year.label)}</th>
                <td>
                  <input
                    type="number"
                    min="${escapeHtml(String(metric.min ?? 0))}"
                    ${metric.max !== undefined ? `max="${escapeHtml(String(metric.max))}"` : ""}
                    step="${escapeHtml(String(metric.step ?? 0.01))}"
                    data-cycle-input="true"
                    data-cycle-metric="${escapeHtml(metric.key)}"
                    data-cycle-year="${escapeHtml(year.key)}"
                    data-cycle-semester="firstSemester"
                    required
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="${escapeHtml(String(metric.min ?? 0))}"
                    ${metric.max !== undefined ? `max="${escapeHtml(String(metric.max))}"` : ""}
                    step="${escapeHtml(String(metric.step ?? 0.01))}"
                    data-cycle-input="true"
                    data-cycle-metric="${escapeHtml(metric.key)}"
                    data-cycle-year="${escapeHtml(year.key)}"
                    data-cycle-semester="secondSemester"
                    required
                  />
                </td>
                <td>
                  <output class="cycle-year-average" data-cycle-year-average="${escapeHtml(`${metric.key}:${year.key}`)}">0.00</output>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `).join("");

  syncCycleMetricSummaries();
}

function handleCycleMetricInput(event) {
  if (!event.target?.matches?.("[data-cycle-input='true']")) {
    return;
  }

  syncCycleMetricSummaries();
}

function setCycleMetricValues(cycleMetrics) {
  if (!cycleMetricsGrid) {
    return;
  }

  if (!cycleMetricsGrid.children.length) {
    renderCycleMetricInputs();
  }

  for (const metric of CYCLE_METRIC_DEFINITIONS) {
    const metricSummary = cycleMetrics?.[metric.key];
    const entryMap = new Map(
      Array.isArray(metricSummary?.yearlyEntries)
        ? metricSummary.yearlyEntries.map((entry) => [entry?.yearLabel, entry])
        : [],
    );

    for (const year of REVIEW_CYCLE_YEARS) {
      const entry = entryMap.get(year.key) || {};
      const firstInput = cycleMetricsGrid.querySelector(
        `[data-cycle-metric="${metric.key}"][data-cycle-year="${year.key}"][data-cycle-semester="firstSemester"]`,
      );
      const secondInput = cycleMetricsGrid.querySelector(
        `[data-cycle-metric="${metric.key}"][data-cycle-year="${year.key}"][data-cycle-semester="secondSemester"]`,
      );

      if (firstInput) {
        firstInput.value = entry.firstSemester === null || entry.firstSemester === undefined ? "" : String(entry.firstSemester);
      }
      if (secondInput) {
        secondInput.value = entry.secondSemester === null || entry.secondSemester === undefined ? "" : String(entry.secondSemester);
      }
    }
  }

  syncCycleMetricSummaries();
}

function collectCycleMetrics() {
  return Object.fromEntries(
    CYCLE_METRIC_DEFINITIONS.map((metric) => {
      const yearlyEntries = REVIEW_CYCLE_YEARS.map((year) => {
        const firstSemester = readCycleMetricInput(metric.key, year.key, "firstSemester");
        const secondSemester = readCycleMetricInput(metric.key, year.key, "secondSemester");
        return {
          yearLabel: year.key,
          firstSemester,
          secondSemester,
          yearlyAverage: averageNumbers([firstSemester, secondSemester]),
        };
      });

      return [
        metric.key,
        {
          average: averageNumbers(yearlyEntries.flatMap((entry) => [entry.firstSemester, entry.secondSemester])),
          yearlyEntries,
        },
      ];
    }),
  );
}

function validateCycleMetrics(cycleMetrics) {
  for (const metric of CYCLE_METRIC_DEFINITIONS) {
    const entries = cycleMetrics?.[metric.key]?.yearlyEntries || [];
    for (const entry of entries) {
      if (!Number.isFinite(entry.firstSemester) || !Number.isFinite(entry.secondSemester)) {
        return `${metric.label} requires values for both semesters across all years of ${FIXED_REVIEW_PERIOD}.`;
      }
      if (metric.max !== undefined && (entry.firstSemester > metric.max || entry.secondSemester > metric.max)) {
        return `${metric.label} must stay within the allowed range of ${metric.scaleLabel.toLowerCase()}.`;
      }
    }
  }

  return "";
}

function readCycleMetricInput(metricKey, yearKey, semesterKey) {
  const element = cycleMetricsGrid?.querySelector(
    `[data-cycle-metric="${metricKey}"][data-cycle-year="${yearKey}"][data-cycle-semester="${semesterKey}"]`,
  );
  return element ? Number.parseFloat(element.value) : Number.NaN;
}

function syncCycleMetricSummaries() {
  if (!cycleMetricsGrid) {
    return;
  }

  const cycleMetrics = collectCycleMetrics();

  for (const metric of CYCLE_METRIC_DEFINITIONS) {
    const metricSummary = cycleMetrics[metric.key];
    const averageOutput = cycleMetricsGrid.querySelector(`[data-cycle-average="${metric.key}"]`);
    if (averageOutput) {
      averageOutput.textContent = formatMetricNumber(metricSummary.average);
    }

    for (const yearEntry of metricSummary.yearlyEntries) {
      const yearAverageOutput = cycleMetricsGrid.querySelector(
        `[data-cycle-year-average="${metric.key}:${yearEntry.yearLabel}"]`,
      );
      if (yearAverageOutput) {
        yearAverageOutput.textContent = formatMetricNumber(yearEntry.yearlyAverage);
      }
    }
  }
}

function averageNumbers(values) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (!numericValues.length) {
    return Number.NaN;
  }

  return Math.round((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length) * 100) / 100;
}

function formatMetricNumber(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : "0.00";
}

function formatOptionalMetricNumber(value, fallback = "-") {
  return Number.isFinite(value) ? Number(value).toFixed(2) : fallback;
}

function applyFacultyBaselineToForm(baselineData) {
  const personalData = baselineData?.personalData || {};

  setFieldValue("fullName", personalData.fullName ?? currentUser?.fullName ?? "");
  setEmployeeIdValue(personalData.employeeId ?? "");
  setFieldValue("academicRank", personalData.academicRank ?? "");
  setFieldValue("yearsInService", personalData.yearsInService);
  setFieldValue("attainment", personalData.highestEducationalAttainment ?? "");
  hydratePromotionHistory(Array.isArray(baselineData?.promotionHistory) ? baselineData.promotionHistory : []);
}

function applyCycleDataToForm(cycleData) {
  const performanceReview = cycleData?.performanceReview || {};

  setFieldValue("administrativeExperience", performanceReview.administrativeExperience);
  setCycleMetricValues(performanceReview.cycleMetrics || null);
}

function selectFacultyProfileForEditing(profile, options = {}) {
  latestRecordContext = { profileId: profile.id, mode: "update" };
  applyFacultyBaselineToForm(profile.baselineData || null);
  applyCycleDataToForm(profile.cycleData || null);
  setFacultyFormMode({
    mode: "update",
    profileId: profile.id,
    name: profile.name,
  });
  revealFacultyForm(options.collapse !== false);

  if (options.scroll !== false) {
    document.querySelector("#faculty-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function resetFacultyFormForNewRecord(options = {}) {
  latestRecordContext = { profileId: null, mode: "create" };
  facultyForm?.reset();
  setFieldValue("fullName", options.preserveIdentity === false ? "" : currentUser?.fullName ?? valueOf("fullName"));
  setEmployeeIdValue("");
  setFieldValue("academicRank", "");
  setFieldValue("yearsInService", "");
  setFieldValue("attainment", "");
  setFieldValue("administrativeExperience", "");
  setCycleMetricValues(null);
  hydratePromotionHistory([]);
  setFacultyFormMode({ mode: "create" });
  revealFacultyForm(options.collapse !== false);
}

function renderFacultyOptionFields() {
  populateSelectOptions("academicRank", facultyOptionCatalog.academicRanks, "Select current rank");
  populateSelectOptions("attainment", facultyOptionCatalog.educationalAttainments, "Select attainment");
  renderPromotionHistoryRows();

  const activeProfile = latestRecordContext?.profileId ? employeeProfileRecords.get(latestRecordContext.profileId) : null;
  if (activeProfile) {
    applyFacultyBaselineToForm(activeProfile.baselineData || null);
    applyCycleDataToForm(activeProfile.cycleData || null);
  }
}

function populateSelectOptions(id, options, placeholder) {
  const element = byId(id);
  if (!element) {
    return;
  }

  const currentValue = element.value;
  const uniqueOptions = Array.from(new Set([...(Array.isArray(options) ? options : []), ...(currentValue ? [currentValue] : [])]));
  element.innerHTML = [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(uniqueOptions.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`))
    .join("");
  element.value = currentValue || "";
}

function hydratePromotionHistory(entries) {
  promotionHistoryState = Array.isArray(entries) && entries.length
    ? entries.map((entry) => ({
        cycle: entry?.cycle || "",
        promoted: Boolean(entry?.promoted),
        previousRank: entry?.previousRank || "",
        newRank: entry?.newRank || "",
      }))
    : [createEmptyPromotionHistoryEntry()];
  renderPromotionHistoryRows();
}

function createEmptyPromotionHistoryEntry() {
  return {
    cycle: "",
    promoted: false,
    previousRank: "",
    newRank: "",
  };
}

function renderPromotionHistoryRows() {
  if (!promotionHistoryList) {
    return;
  }

  const rankOptions = facultyOptionCatalog.academicRanks || [];
  promotionHistoryList.innerHTML = promotionHistoryState
    .map((entry, index) => `
      <article class="promotion-history-card">
        <div class="field-row promotion-history-row">
          <label class="field">
            <span>Cycle</span>
            <input type="text" value="${escapeHtml(entry.cycle || "")}" data-history-index="${index}" data-history-field="cycle" placeholder="2024, 9th cycle, etc." />
          </label>
          <label class="field">
            <span>Previous rank</span>
            <select data-history-index="${index}" data-history-field="previousRank">
              ${buildPromotionRankOptions(rankOptions, entry.previousRank, "Select previous rank")}
            </select>
          </label>
          <label class="field">
            <span>New rank</span>
            <select data-history-index="${index}" data-history-field="newRank">
              ${buildPromotionRankOptions(rankOptions, entry.newRank, "Select new rank")}
            </select>
          </label>
          <label class="field checkbox-field">
            <span>Promoted?</span>
            <input type="checkbox" ${entry.promoted ? "checked" : ""} data-history-index="${index}" data-history-field="promoted" />
          </label>
        </div>
        <div class="promotion-history-actions">
          <button class="button button-secondary" type="button" data-history-remove="${index}">Remove</button>
        </div>
      </article>
    `)
    .join("");
}

function buildPromotionRankOptions(options, selectedValue, placeholder) {
  const uniqueOptions = Array.from(new Set([...(Array.isArray(options) ? options : []), ...(selectedValue ? [selectedValue] : [])]));
  return [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(
      uniqueOptions.map(
        (option) =>
          `<option value="${escapeHtml(option)}" ${option === selectedValue ? "selected" : ""}>${escapeHtml(option)}</option>`,
      ),
    )
    .join("");
}

function handlePromotionHistoryClick(event) {
  const removeButton = event.target.closest("[data-history-remove]");
  if (!removeButton) {
    return;
  }

  const index = Number.parseInt(removeButton.dataset.historyRemove || "", 10);
  if (!Number.isInteger(index)) {
    return;
  }

  promotionHistoryState.splice(index, 1);
  if (!promotionHistoryState.length) {
    promotionHistoryState.push(createEmptyPromotionHistoryEntry());
  }
  renderPromotionHistoryRows();
}

function handlePromotionHistoryChange(event) {
  const field = event.target.dataset.historyField;
  const index = Number.parseInt(event.target.dataset.historyIndex || "", 10);
  if (!field || !Number.isInteger(index) || !promotionHistoryState[index]) {
    return;
  }

  promotionHistoryState[index][field] = field === "promoted" ? Boolean(event.target.checked) : event.target.value;
}

function collectPromotionHistory() {
  return Array.from(document.querySelectorAll(".promotion-history-card"))
    .map((card) => ({
      cycle: card.querySelector('[data-history-field="cycle"]')?.value?.trim() || undefined,
      promoted: Boolean(card.querySelector('[data-history-field="promoted"]')?.checked),
      previousRank: card.querySelector('[data-history-field="previousRank"]')?.value || undefined,
      newRank: card.querySelector('[data-history-field="newRank"]')?.value || undefined,
    }))
    .filter((entry) => entry.cycle || entry.previousRank || entry.newRank || entry.promoted);
}

function setFacultyFormMode({ mode, profileId, name }) {
  if (facultyFormMode) {
    facultyFormMode.textContent =
      mode === "update"
        ? `Editing baseline data for ${name || "this faculty profile"}${profileId ? ` (${profileId})` : ""}. Update baseline or cycle details, then save to refresh the approximation.`
        : "Create a baseline profile, or load a saved one below to continue updating it.";
  }

  if (facultySubmitButton) {
    facultySubmitButton.textContent = mode === "update" ? "Update Faculty Record" : "Save Faculty Record";
  }
}

function revealFacultyForm(shouldOpen = true) {
  const toggle = byId("faculty-form-toggle");
  const savedIndicator = byId("faculty-form-saved");

  if (toggle && shouldOpen) {
    toggle.setAttribute("open", "open");
  }

  if (savedIndicator) {
    savedIndicator.style.display = "none";
  }
}

function formatDatabaseValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString();
    }
  }

  return String(value);
}

function getPromotionBasisLabel(basis) {
  if (basis === "evaluator") {
    return "Evaluator-backed draft rank";
  }
  if (basis === "employee-inputs") {
    return "Preliminary rank estimate";
  }
  return "Draft rank status";
}

function getPromotionStatusLabel(status) {
  if (status === "ready") {
    return "Ready";
  }
  if (status === "preliminary") {
    return "Preliminary";
  }
  if (status === "needs-exact-rank") {
    return "Needs exact rank";
  }
  if (status === "pending-doctoral-attainment") {
    return "Pending doctorate attainment";
  }
  if (status === "pending-professor-accreditation") {
    return "Pending professor accreditation";
  }
  if (status === "pending-cup-certification") {
    return "Pending committee certification";
  }
  return "Pending review";
}

function getPromotionConfidenceLabel(confidence) {
  if (!confidence) {
    return null;
  }
  return confidence.charAt(0).toUpperCase() + confidence.slice(1);
}

function renderRankPanelChip(label, tone) {
  const normalizedTone = typeof tone === "string" && tone.trim() ? tone.trim().toLowerCase() : "pending";
  return `<span class="rank-panel-chip" data-tone="${escapeHtml(normalizedTone)}">${escapeHtml(label)}</span>`;
}

function formatOptionalNumber(value, fallback = "-") {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : fallback;
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function describeSelectedFiles(files) {
  if (!files.length) {
    return "No files selected.";
  }
  if (files.length === 1) {
    return `Selected: ${files[0].name}`;
  }
  return `Selected ${files.length} files: ${files.map((file) => file.name).join(", ")}`;
}

function describeUploadedFiles(data, files) {
  const successfulUploads = Array.isArray(data.results) ? data.results : [];
  if (successfulUploads.length) {
    if (successfulUploads.length === 1) {
      return `Uploaded: ${successfulUploads[0].originalName}`;
    }
    return `Uploaded ${successfulUploads.length} files: ${successfulUploads.map((item) => item.originalName).join(", ")}`;
  }
  return describeSelectedFiles(files);
}

function buildUploadNotice(panelTitle, data) {
  const successCount = Number(data.summary?.successCount ?? (Array.isArray(data.results) ? data.results.length : 0));
  const failureCount = Number(data.summary?.failureCount ?? (Array.isArray(data.failures) ? data.failures.length : 0));
  const firstSummary =
    Array.isArray(data.results) && data.results[0]?.analysis?.summary
      ? ` ${data.results[0].analysis.summary}`
      : data.analysis?.summary
        ? ` ${data.analysis.summary}`
        : "";

  if (failureCount > 0) {
    return `${panelTitle} stored ${successCount} file(s); ${failureCount} failed.${firstSummary}`;
  }

  return `${panelTitle} stored ${successCount} file(s) successfully.${firstSummary}`;
}

function renderDeleteUploadButton(item, refreshTarget) {
  return `
    <button
      class="button button-secondary delete-upload-button"
      type="button"
      data-document-id="${escapeHtml(item.id)}"
      data-refresh-target="${escapeHtml(refreshTarget)}"
      data-file-name="${escapeHtml(item.originalName || "this file")}"
    >
      Delete
    </button>
  `;
}

function renderPanelDeleteManager(panelKey) {
  const uploads = employeeUploads
    .filter((item) => item.metadata?.panelKey === panelKey)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  if (!uploads.length) {
    return "";
  }

  return `
    <details class="delete-manager">
      <summary>Manage files in this panel</summary>
      <div class="delete-manager-list">
        ${uploads
          .map(
            (item) => `
              <div class="delete-manager-item">
                <div class="delete-manager-copy">
                  <strong>${escapeHtml(item.originalName)}</strong>
                  <span>${escapeHtml(formatDatabaseValue(item.createdAt))}</span>
                </div>
                ${renderDeleteUploadButton(item, "employee")}
              </div>
            `,
          )
          .join("")}
      </div>
    </details>
  `;
}

function renderEvaluatorDeleteManager(item) {
  const uploads = Array.isArray(item?.uploadLogs) ? item.uploadLogs : [];
  if (!uploads.length) {
    return "";
  }

  return `
    <details class="delete-manager">
      <summary>Manage uploaded files</summary>
      <div class="delete-manager-list">
        ${uploads
          .map(
            (upload) => `
              <div class="delete-manager-item">
                <div class="delete-manager-copy">
                  <strong>${escapeHtml(upload.originalName)}</strong>
                  <span>${escapeHtml(upload.metadata?.panelTitle || upload.metadata?.panelKey || "unassigned panel")}</span>
                </div>
                ${renderDeleteUploadButton(upload, "evaluator")}
              </div>
            `,
          )
          .join("")}
      </div>
    </details>
  `;
}

async function handleDeleteUploadClick(event) {
  if (!(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest(".delete-upload-button");
  if (!button) {
    return;
  }

  const documentId = button.dataset.documentId || "";
  const fileName = button.dataset.fileName || "this file";
  const refreshTarget = button.dataset.refreshTarget || portal;
  if (!documentId) {
    return;
  }

  if (!window.confirm(`Delete ${fileName}? This cannot be undone.`)) {
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Deleting...";

  try {
    const data = await apiFetch(buildApiUrl(`/api/documents/${documentId}`), {
      method: "DELETE",
    });

    if (refreshTarget === "evaluator") {
      setNotice(trainingResult, data.message || `${fileName} deleted successfully.`);
      await loadEvaluatorWorkspace();
      return;
    }

    setNotice(facultyResult, data.message || `${fileName} deleted successfully.`);
    await loadEmployeeWorkspace();
  } catch (error) {
    button.disabled = false;
    button.textContent = originalLabel;

    if (refreshTarget === "evaluator") {
      setNotice(trainingResult, toErrorMessage(error), true);
      return;
    }

    setNotice(facultyResult, toErrorMessage(error), true);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeApiBaseUrl(value) {
  if (!value) {
    return "";
  }

  return String(value).replace(/\/+$/, "");
}

function hasPanelUploads(panelKey) {
  return employeeUploads.some((item) => item.metadata?.panelKey === panelKey);
}

function getPanelUploadCount(panelKey) {
  return employeeUploads.filter((item) => item.metadata?.panelKey === panelKey).length;
}

function collapseFacultyFormLegacy() {
  const toggle = byId("faculty-form-toggle");
  const savedIndicator = byId("faculty-form-saved");

  if (toggle) {
    toggle.removeAttribute("open");
  }

  if (savedIndicator) {
    const name = valueOf("fullName") || "Faculty";
    const eid = valueOf("employeeId");
    savedIndicator.textContent = `${name}${eid ? ` (${eid})` : ""} — Record saved. Expand above to edit.`;
    savedIndicator.style.display = "flex";
  }
}

function collapseFacultyFormWithModeSupport() {
  const toggle = byId("faculty-form-toggle");
  const savedIndicator = byId("faculty-form-saved");

  if (toggle) {
    toggle.removeAttribute("open");
  }

  if (savedIndicator) {
    const name = valueOf("fullName") || "Faculty";
    const eid = valueOf("employeeId");
    const actionLabel = latestRecordContext?.mode === "update" ? "Record updated" : "Record saved";
    savedIndicator.textContent = `${name}${eid ? ` (${eid})` : ""} - ${actionLabel}. Expand above to edit.`;
    savedIndicator.style.display = "flex";
  }
}
