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
const databaseViewer = byId("database-viewer");
const trainingCriteria = byId("training-criteria");
const trainingScoreTotal = byId("training-score-total");
const workspaceGreeting = byId("workspace-greeting");
const showLoginButton = byId("show-login");
const showRegisterButton = byId("show-register");
const nameField = byId("name-field");
const roleField = byId("role-field");
const authSubmit = byId("auth-submit");

let authMode = "login";
let currentUser = null;
let latestRecordContext = null;
let uploadPanelCatalog = [];
let employeeUploads = [];
const latestTrainingItemById = new Map();
uploadPanelGrid?.addEventListener("click", handleDeleteUploadClick);
reviewQueue?.addEventListener("click", handleDeleteUploadClick);

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
  setNotice(facultyResult, "Saving faculty record...");

  try {
    const data = await apiFetch(buildApiUrl("/api/faculty/ingest"), {
      method: "POST",
      body: JSON.stringify(buildFacultyPayload()),
    });

    latestRecordContext = data;
    setNotice(
      facultyResult,
      `Faculty record saved. Profile ID: ${data.profileId}. You can now upload evidence files to the matching panels.`,
    );
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
  await Promise.all([loadUploadPanelCatalog(), loadEmployeeDashboard()]);
  renderUploadPanels(uploadPanelCatalog);
}

async function loadEvaluatorWorkspace() {
  await Promise.all([loadUploadPanelCatalog(), loadReviewQueue(), loadDatabaseOverview()]);
  renderEvaluatorCriteria(uploadPanelCatalog);
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
    }

    if (data.latestProfile?.id) {
      latestRecordContext = { profileId: data.latestProfile.id };
    }
  } catch (error) {
    employeeUploads = [];
    renderEmployeeDraftPoints(null, null, toErrorMessage(error));
    renderEmployeeProfiles([]);
    renderEmployeeUploads([], toErrorMessage(error));
    if (uploadPanelCatalog.length) {
      renderUploadPanels(uploadPanelCatalog);
    }
  }
}

async function loadReviewQueue() {
  if (!reviewQueue) {
    return;
  }

  reviewQueue.innerHTML = '<div class="notice">Loading employee submission logs...</div>';

  try {
    const data = await apiFetch(buildApiUrl("/api/evaluator/review-queue"), { method: "GET" });
    renderReviewQueue(data.items || []);
  } catch (error) {
    reviewQueue.innerHTML = `<div class="notice notice-error">${escapeHtml(toErrorMessage(error))}</div>`;
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
  uploadPanelGrid.innerHTML = groupedPanels
    .map(
      ([kraTitle, items]) => `
        <section class="upload-group">
          <div class="upload-group-heading">
            <h3>${escapeHtml(kraTitle)}</h3>
            <p class="card-copy">${escapeHtml(describePanelAudience(items))}</p>
          </div>
          <div class="upload-panel-grid">
            ${items
              .map(
                (panel) => `
                  <article class="card upload-card" data-panel-key="${escapeHtml(panel.key)}">
                    <div class="upload-card-header">
                      <h4>${escapeHtml(panel.title)}</h4>
                      <span class="upload-score-cap">Max ${escapeHtml(String(panel.maxScore))} pts</span>
                    </div>
                    ${panel.audienceLabel ? `<p class="upload-audience-chip">${escapeHtml(panel.audienceLabel)}</p>` : ""}
                    <p class="card-copy">${escapeHtml(panel.description)}</p>
                    <p class="card-copy">Accepted: ${escapeHtml(panel.acceptedFormats.join(", "))}</p>
                    <form class="stack-form upload-panel-form" data-panel-key="${escapeHtml(panel.key)}">
                      <label class="field">
                        <span>Select file(s)</span>
                        <input type="file" name="document" multiple required />
                      </label>
                      <button class="button button-primary" type="submit">Upload Evidence</button>
                    </form>
                    <div class="notice panel-result">No files uploaded yet.</div>
                    <div class="upload-preview">
                      <div class="upload-preview-label">Uploaded file preview</div>
                      <div class="upload-file-name">No files selected.</div>
                      <div class="upload-file-view"></div>
                      <div class="upload-text-preview">No extracted text available yet.</div>
                    </div>
                    <div class="upload-history">
                      <div class="upload-preview-label">Saved files for this panel</div>
                      <div class="upload-history-list">${renderPanelUploadHistory(panel.key)}</div>
                      ${renderPanelDeleteManager(panel.key)}
                    </div>
                  </article>
                `,
              )
              .join("")}
          </div>
        </section>
      `,
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
    const fileName = article.querySelector(".upload-file-name");
    const fileView = article.querySelector(".upload-file-view");
    const textPreview = article.querySelector(".upload-text-preview");

    fileInput?.addEventListener("change", () => {
      const files = Array.from(fileInput.files || []);
      if (!files.length) {
        fileName.textContent = "No files selected.";
        fileView.innerHTML = "";
        textPreview.textContent = "No extracted text available yet.";
        return;
      }

      fileName.textContent = describeSelectedFiles(files);
      renderClientPreview(files, fileView, textPreview);
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = Array.from(fileInput.files || []);
      if (!files.length) {
        setNotice(result, "Choose at least one file first.", true);
        return;
      }

      const formData = new FormData();
      files.forEach((file) => formData.append("document", file));
      formData.append("panelKey", panel.key);
      formData.append("kind", "REQUIREMENT");
      if (latestRecordContext?.profileId) {
        formData.append("profileId", latestRecordContext.profileId);
      }

      setNotice(result, files.length === 1 ? "Uploading 1 file..." : `Uploading ${files.length} files...`);
      try {
        const response = await fetch(buildApiUrl("/api/documents/extract"), {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const data = await readJson(response);
        setNotice(result, buildUploadNotice(panel.title, data));
        updateUploadedPreview(data, files, fileName, fileView, textPreview);
        await loadEmployeeDashboard();
      } catch (error) {
        setNotice(result, toErrorMessage(error), true);
      }
    });
  });
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
    <div class="card workspace-summary-card">
      <p class="card-copy">${escapeHtml(draftPoints.note || "")}</p>
      <p class="card-copy">Uploaded panels: ${escapeHtml(String(draftPoints.evidenceCoverage?.uploadedPanelCount ?? 0))} / ${escapeHtml(String(draftPoints.evidenceCoverage?.expectedPanelCount ?? 0))}</p>
      <p class="card-copy">Workflow coverage: ${escapeHtml(String(draftPoints.evidenceCoverage?.workflowCoveragePercent ?? 0))}%</p>
      <p class="card-copy">Average document completeness: ${escapeHtml(String(draftPoints.evidenceCoverage?.documentCompletenessAverage ?? 0))}%</p>
      <p class="card-copy">Profiles saved: ${escapeHtml(String(summary?.profileCount ?? 0))}. Uploads saved: ${escapeHtml(String(summary?.uploadCount ?? 0))}.</p>
    </div>
  `;
}

function renderEmployeeProfiles(profiles) {
  if (!employeeProfiles) {
    return;
  }

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
              <p class="card-copy">Semester: ${escapeHtml(profile.semester || "-")}</p>
              <p class="card-copy">Documents linked: ${escapeHtml(String(profile.documentCount || 0))}</p>
              <p class="card-copy">Approximate total: ${escapeHtml(String(profile.draftPoints?.overallEstimate ?? 0))}</p>
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

  latestTrainingItemById.clear();

  if (!items.length) {
    reviewQueue.innerHTML = '<div class="notice">No employee submissions are waiting in the evaluator queue.</div>';
    return;
  }

  reviewQueue.innerHTML = `
    <div class="review-queue">
      ${items
        .map((item) => {
          const uploads = Array.isArray(item.uploadLogs) ? item.uploadLogs : [];
          const latestTrainingItem = item.latestTrainingItem || null;
          const latestTrainingId = latestTrainingItem?.id || item.latestTrainingExampleId || "";
          if (latestTrainingId && latestTrainingItem) {
            latestTrainingItemById.set(latestTrainingId, latestTrainingItem);
          }
          return `
            <article class="card review-card">
              <div class="training-example-header">
                <strong>${escapeHtml(item.name || "Unnamed employee")}</strong>
                <span class="training-example-status">${escapeHtml(item.employeeId || "No Employee ID")}</span>
              </div>
              <p class="card-copy">Submitted by: ${escapeHtml(item.createdBy?.fullName || "-")} (${escapeHtml(item.createdBy?.email || "-")})</p>
              <p class="card-copy">Semester: ${escapeHtml(item.semester || "-")}</p>
              <p class="card-copy">Approximate total from uploaded data: ${escapeHtml(String(item.draftPoints?.overallEstimate ?? 0))}</p>
              <p class="card-copy">Coverage: ${escapeHtml(String(item.draftPoints?.evidenceCoverage?.uploadedPanelCount ?? 0))} / ${escapeHtml(String(item.draftPoints?.evidenceCoverage?.expectedPanelCount ?? 0))} panels</p>
              <p class="card-copy">Latest evaluator total: ${escapeHtml(String(latestTrainingItem?.evaluatorAssessment?.totalScore ?? 0))}</p>
              <div class="review-log-list">
                ${uploads.length ? uploads.map(renderUploadLogChip).join("") : '<div class="notice">No uploads linked yet.</div>'}
              </div>
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
      hydrateTrainingForm(latestTrainingItem);
      if (trainingResult) {
        setNotice(trainingResult, `Training example ${trainingId} selected for evaluator scoring.`);
      }
      trainingForm?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderUploadLogChip(log) {
  return `
    <article class="upload-log-chip">
      <strong>${escapeHtml(log.originalName)}</strong>
      <span>${escapeHtml(log.metadata?.panelTitle || log.metadata?.panelKey || "unassigned panel")}</span>
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
        { key: "semester", label: "Semester" },
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
  return {
    personalData: {
      fullName: valueOf("fullName"),
      employeeId: valueOf("employeeId"),
      academicRank: valueOf("academicRank"),
      yearsInService: numberOf("yearsInService"),
      highestEducationalAttainment: valueOf("attainment"),
    },
    performanceReview: {
      reviewPeriod: valueOf("reviewPeriod"),
      ipcrAverage: numberOf("ipcrAverage"),
      teachingEffectiveness: numberOf("teachingEffectiveness"),
      researchOutputs: numberOf("researchOutputs"),
      extensionServices: numberOf("extensionServices"),
      administrativeExperience: numberOf("administrativeExperience"),
      professionalDevelopmentHours: numberOf("professionalDevelopmentHours"),
    },
    promotionHistory: [],
    notes: valueOf("analysis-notes"),
  };
}

function renderClientPreview(files, fileView, textPreview) {
  fileView.innerHTML = "";
  const previewMessages = [];

  files.forEach((file) => {
    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.className = "upload-image-preview";
      img.alt = file.name;
      img.src = URL.createObjectURL(file);
      fileView.appendChild(img);
      previewMessages.push(`${file.name}: waiting for OCR after upload.`);
      return;
    }

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const tag = document.createElement("div");
      tag.className = "upload-file-tag";
      tag.textContent = `${file.name}: PDF selected. Extracted text preview will appear after upload.`;
      fileView.appendChild(tag);
      previewMessages.push(`${file.name}: waiting for PDF extraction after upload.`);
      return;
    }

    const tag = document.createElement("div");
    tag.className = "upload-file-tag";
    if (/\.(csv|xls|xlsx)$/i.test(file.name)) {
      tag.textContent = `${file.name}: spreadsheet selected. Upload is not supported for this panel.`;
      previewMessages.push(`${file.name}: spreadsheet uploads are not supported.`);
    } else {
      tag.textContent = `${file.name}: preview not available for this file type.`;
      previewMessages.push(`${file.name}: preview not available for this file type.`);
    }
    fileView.appendChild(tag);
  });

  textPreview.textContent = previewMessages.join("\n");
}

function updateUploadedPreview(data, files, fileName, fileView, textPreview) {
  fileName.textContent = describeUploadedFiles(data, files);
  renderClientPreview(files, fileView, textPreview);

  const successLines = (Array.isArray(data.results) ? data.results : [])
    .map((item) => `${item.originalName}: ${item.analysis?.summary || "Uploaded successfully."}`);
  const failureLines = (Array.isArray(data.failures) ? data.failures : []).map(
    (item) => `${item.originalName}: ${item.error}`,
  );

  if (successLines.length || failureLines.length) {
    textPreview.textContent = [...successLines, ...failureLines].join("\n\n");
    return;
  }

  if (data.textPreview) {
    textPreview.textContent = `Extracted text preview:\n\n${data.textPreview}`;
    return;
  }

  if (data.analysis?.summary) {
    textPreview.textContent = data.analysis.summary;
    return;
  }

  textPreview.textContent = `${files.length} file(s) uploaded successfully.`;
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

function normalizePortalPath(pathname) {
  if (pathname === "/employee.html") {
    return "/employee";
  }
  if (pathname === "/evaluator.html") {
    return "/evaluator";
  }
  if (pathname === "/index.html") {
    return "/";
  }
  return pathname;
}

function prettyRole(role) {
  if (role === "EMPLOYEE") {
    return "Employee";
  }
  if (role === "EVALUATOR") {
    return "Evaluator";
  }
  if (role === "ADMIN") {
    return "Admin";
  }
  return role || "Guest";
}

function setNotice(element, message, isError = false) {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.classList.toggle("notice-error", isError);
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
