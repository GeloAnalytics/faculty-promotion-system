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
const showLoginButton = byId("show-login");
const showRegisterButton = byId("show-register");
const nameField = byId("name-field");
const roleField = byId("role-field");
const authSubmit = byId("auth-submit");

let authMode = "login";
let currentUser = null;
let latestRecordContext = null;

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
  } catch {
    currentUser = null;
    if (sessionUser) {
      sessionUser.textContent = "Guest";
    }
  }
}

async function loadEmployeeWorkspace() {
  await Promise.all([loadUploadPanels(), loadEmployeeDashboard()]);
}

async function loadEvaluatorWorkspace() {
  await Promise.all([loadReviewQueue(), loadDatabaseOverview()]);
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

async function loadUploadPanels() {
  if (!uploadPanelGrid) {
    return;
  }

  try {
    const data = await apiFetch(buildApiUrl("/api/config/upload-panels"), { method: "GET" }, false);
    renderUploadPanels(data.panels);
  } catch (error) {
    uploadPanelGrid.innerHTML = `<div class="notice notice-error">${escapeHtml(toErrorMessage(error))}</div>`;
  }
}

async function loadEmployeeDashboard() {
  try {
    const data = await apiFetch(buildApiUrl("/api/employee/dashboard"), { method: "GET" });
    renderEmployeeDraftPoints(data.latestProfile?.draftPoints, data.summary);
    renderEmployeeProfiles(data.profiles || []);
    renderEmployeeUploads(data.uploads || []);

    if (data.latestProfile?.id) {
      latestRecordContext = { profileId: data.latestProfile.id };
    }
  } catch (error) {
    renderEmployeeDraftPoints(null, null, toErrorMessage(error));
    renderEmployeeProfiles([]);
    renderEmployeeUploads([], toErrorMessage(error));
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

  uploadPanelGrid.innerHTML = "";

  panels.forEach((panel) => {
    const article = document.createElement("article");
    article.className = "card upload-card";
    article.innerHTML = `
      <h3>${escapeHtml(panel.title)}</h3>
      <p class="card-copy">${escapeHtml(panel.description)}</p>
      <p class="card-copy">Accepted: ${escapeHtml(panel.acceptedFormats.join(", "))}</p>
      <form class="stack-form upload-panel-form" data-panel-key="${escapeHtml(panel.key)}">
        <label class="field">
          <span>Select file</span>
          <input type="file" name="document" required />
        </label>
        <button class="button button-primary" type="submit">Upload to Panel</button>
      </form>
      <div class="notice panel-result">No file uploaded yet.</div>
      <div class="upload-preview">
        <div class="upload-preview-label">Uploaded file preview</div>
        <div class="upload-file-name">No file selected.</div>
        <div class="upload-file-view"></div>
        <div class="upload-text-preview">No extracted text available yet.</div>
      </div>
    `;

    const form = article.querySelector(".upload-panel-form");
    const result = article.querySelector(".panel-result");
    const fileInput = form.querySelector('input[type="file"]');
    const fileName = article.querySelector(".upload-file-name");
    const fileView = article.querySelector(".upload-file-view");
    const textPreview = article.querySelector(".upload-text-preview");

    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) {
        fileName.textContent = "No file selected.";
        fileView.innerHTML = "";
        textPreview.textContent = "No extracted text available yet.";
        return;
      }

      fileName.textContent = `Selected: ${file.name}`;
      renderClientPreview(file, fileView, textPreview);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!fileInput.files?.length) {
        setNotice(result, "Choose a file first.", true);
        return;
      }

      const formData = new FormData();
      formData.append("document", fileInput.files[0]);
      formData.append("panelKey", panel.key);
      formData.append("kind", panel.key === "tallied_points" ? "TRAINING_SUPPORT" : "REQUIREMENT");
      if (latestRecordContext?.profileId) {
        formData.append("profileId", latestRecordContext.profileId);
      }

      setNotice(result, "Uploading...");
      try {
        const response = await fetch(buildApiUrl("/api/documents/extract"), {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const data = await readJson(response);
        const message =
          data.fileType === "image" || data.fileType === "pdf" || data.fileType === "csv"
            ? `${panel.title} upload stored successfully. ${data.analysis?.summary ?? "Analysis completed."}`
            : `${panel.title} upload stored successfully.`;
        setNotice(result, message);
        updateUploadedPreview(data, fileInput.files[0], fileView, textPreview);
        await loadEmployeeDashboard();
      } catch (error) {
        setNotice(result, toErrorMessage(error), true);
      }
    });

    uploadPanelGrid.appendChild(article);
  });
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
        Save your base faculty record first. After uploads are processed, this page will show a draft score summary and coverage status.
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
    { label: "Draft Total", value: draftPoints.overallEstimate ?? 0 },
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
              <p class="card-copy">Draft total: ${escapeHtml(String(profile.draftPoints?.overallEstimate ?? 0))}</p>
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
                  <td>${escapeHtml(item.metadata?.panelKey || "-")}</td>
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

  if (!items.length) {
    reviewQueue.innerHTML = '<div class="notice">No employee submissions are waiting in the evaluator queue.</div>';
    return;
  }

  reviewQueue.innerHTML = `
    <div class="review-queue">
      ${items
        .map((item) => {
          const uploads = Array.isArray(item.uploadLogs) ? item.uploadLogs : [];
          const latestTrainingId = item.latestTrainingExampleId || "";
          return `
            <article class="card review-card">
              <div class="training-example-header">
                <strong>${escapeHtml(item.name || "Unnamed employee")}</strong>
                <span class="training-example-status">${escapeHtml(item.employeeId || "No Employee ID")}</span>
              </div>
              <p class="card-copy">Submitted by: ${escapeHtml(item.createdBy?.fullName || "-")} (${escapeHtml(item.createdBy?.email || "-")})</p>
              <p class="card-copy">Semester: ${escapeHtml(item.semester || "-")}</p>
              <p class="card-copy">Draft total from uploaded data: ${escapeHtml(String(item.draftPoints?.overallEstimate ?? 0))}</p>
              <p class="card-copy">Coverage: ${escapeHtml(String(item.draftPoints?.evidenceCoverage?.uploadedPanelCount ?? 0))} / ${escapeHtml(String(item.draftPoints?.evidenceCoverage?.expectedPanelCount ?? 0))} panels</p>
              <div class="review-log-list">
                ${uploads.length ? uploads.map(renderUploadLogChip).join("") : '<div class="notice">No uploads linked yet.</div>'}
              </div>
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
      <span>${escapeHtml(log.metadata?.panelKey || "unassigned panel")}</span>
      <p>${escapeHtml(log.metadata?.analysisSummary || "Stored without extracted summary.")}</p>
      <small>${escapeHtml(formatDatabaseValue(log.createdAt))}</small>
    </article>
  `;
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

function renderClientPreview(file, fileView, textPreview) {
  fileView.innerHTML = "";

  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.className = "upload-image-preview";
    img.alt = file.name;
    img.src = URL.createObjectURL(file);
    fileView.appendChild(img);
    textPreview.textContent = "Waiting for OCR after upload.";
    return;
  }

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const tag = document.createElement("div");
    tag.className = "upload-file-tag";
    tag.textContent = "PDF selected. Extracted text preview will appear after upload.";
    fileView.appendChild(tag);
    textPreview.textContent = "Waiting for PDF extraction after upload.";
    return;
  }

  if (/\.(csv|xls|xlsx)$/i.test(file.name)) {
    const tag = document.createElement("div");
    tag.className = "upload-file-tag";
    tag.textContent = "Spreadsheet selected. Parsed preview will appear when available.";
    fileView.appendChild(tag);
    textPreview.textContent = "Waiting for file analysis after upload.";
    return;
  }

  textPreview.textContent = "Preview not available for this file type.";
}

function updateUploadedPreview(data, file, fileView, textPreview) {
  if (data.textPreview) {
    textPreview.textContent = `Extracted text preview:\n\n${data.textPreview}`;
    return;
  }

  if (data.analysis?.summary) {
    textPreview.textContent = data.analysis.summary;
    return;
  }

  if (file) {
    textPreview.textContent = `${file.name} uploaded successfully.`;
  }
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
    throw new Error(data.error || data.details || `Request failed with status ${response.status}`);
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
