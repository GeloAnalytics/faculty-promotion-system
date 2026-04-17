const portal = document.body.dataset.portal || "employee";
const apiBaseUrl = normalizeApiBaseUrl(window.APP_CONFIG?.apiBaseUrl);

const healthStatus = byId("health-status");
const modelStatus = byId("model-status");
const healthGuideline = byId("health-guideline");
const sessionUser = byId("session-user");
const authResult = byId("auth-result");
const facultyResult = byId("faculty-result");
const trainingResult = byId("training-result");
const trainingList = byId("training-list");
const databaseViewer = byId("database-viewer");
const facultyForm = byId("faculty-form");
const trainingForm = byId("training-form");
const authForm = byId("auth-form");
const uploadPanelGrid = byId("upload-panel-grid");
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

    await refreshSession();
    redirectIfOnWrongPortal(data.homePath || getHomePathForRole(currentUser?.role));
    await loadPortalData();
    setNotice(authResult, `${authMode === "login" ? "Signed in" : "Account created"} for ${data.user.fullName}.`);
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
      `Faculty record saved. Profile ID: ${data.profileId}. You can now upload evidence files to the five panels.`,
    );
    if (trainingList) {
      setNotice(
        trainingList,
        `Latest employee submission saved. Training example draft ID: ${data.trainingExampleId}. Evaluators can now review it in their portal.`,
      );
    }
  } catch (error) {
    setNotice(facultyResult, toErrorMessage(error), true);
  }
});

trainingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const trainingExampleId = valueOf("training-example-id");
  if (!trainingExampleId) {
    setNotice(trainingResult, "Select or enter a training example ID first.", true);
    return;
  }

  setNotice(trainingResult, "Saving training label...");

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

    setNotice(trainingResult, `Training example updated. Status is now ${data.status}.`);
    await Promise.all([loadTrainingExamples(), loadDatabaseOverview()]);
  } catch (error) {
    setNotice(trainingResult, toErrorMessage(error), true);
  }
});

bootstrap();

async function bootstrap() {
  setAuthMode("login");
  await Promise.all([loadHealth(), refreshSession()]);
  redirectIfOnWrongPortal(getHomePathForRole(currentUser?.role));
  await loadPortalData();
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
    resetDatabaseOverview();
  }
}

async function loadPortalData() {
  if (portal === "employee") {
    await loadUploadPanels();
    if (currentUser?.role === "EMPLOYEE" || currentUser?.role === "ADMIN") {
      if (trainingList) {
        setNotice(
          trainingList,
          latestRecordContext
            ? `Latest employee submission saved. Training example draft ID: ${latestRecordContext.trainingExampleId}.`
            : "Employee portal ready. Save your faculty record, then upload evidence files.",
        );
      }
    } else if (trainingList) {
      setNotice(trainingList, "Sign in with an employee account to submit faculty records and uploads.");
    }
  }

  if (portal === "evaluator") {
    if (currentUser?.role === "EVALUATOR" || currentUser?.role === "ADMIN") {
      await Promise.all([loadTrainingExamples(), loadDatabaseOverview()]);
    } else {
      if (trainingList) {
        setNotice(trainingList, "Sign in with an evaluator account to review training examples.");
      }
      resetDatabaseOverview();
    }
  }
}

function redirectIfOnWrongPortal(homePath) {
  if (!currentUser || !homePath) {
    return;
  }

  const currentPath = window.location.pathname;
  const normalizedCurrent =
    currentPath === "/index.html" ? "/" : currentPath === "/evaluator.html" ? "/evaluator" : currentPath;

  if (normalizedCurrent !== homePath) {
    window.location.assign(homePath);
  }
}

function getHomePathForRole(role) {
  return role === "EVALUATOR" ? "/evaluator" : "/";
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
    const canUpload = currentUser?.role === "EMPLOYEE" || currentUser?.role === "ADMIN";
    renderUploadPanels(data.panels, canUpload);
  } catch (error) {
    uploadPanelGrid.innerHTML = `<div class="notice notice-error">${escapeHtml(toErrorMessage(error))}</div>`;
  }
}

async function loadTrainingExamples() {
  if (!trainingList) {
    return;
  }

  try {
    const data = await apiFetch(buildApiUrl("/api/training/examples"), { method: "GET" });
    const items = Array.isArray(data.items) ? data.items : [];
    renderTrainingExamples(items);
  } catch (error) {
    setNotice(trainingList, toErrorMessage(error), true);
  }
}

async function loadDatabaseOverview() {
  if (!databaseViewer) {
    return;
  }

  if (!(currentUser?.role === "EVALUATOR" || currentUser?.role === "ADMIN")) {
    resetDatabaseOverview();
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

function renderUploadPanels(panels, canUpload) {
  if (!uploadPanelGrid) {
    return;
  }

  uploadPanelGrid.innerHTML = "";

  panels.forEach((panel) => {
    const article = document.createElement("article");
    article.className = "card upload-card";
    article.innerHTML = `
      <h3>${panel.title}</h3>
      <p class="card-copy">${panel.description}</p>
      <p class="card-copy">Accepted: ${panel.acceptedFormats.join(", ")}</p>
      <p class="card-copy">${canUpload ? "Ready for upload." : "Sign in with an employee account to upload files into this panel."}</p>
      <form class="stack-form upload-panel-form" data-panel-key="${panel.key}">
        <label class="field">
          <span>Select file</span>
          <input type="file" name="document" ${canUpload ? "" : "disabled"} required />
        </label>
        <button class="button button-primary" type="submit" ${canUpload ? "" : "disabled"}>Upload to Panel</button>
      </form>
      <div class="notice panel-result">${canUpload ? "No file uploaded yet." : "Panel visible. Employee access is required before upload."}</div>
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
      } catch (error) {
        setNotice(result, toErrorMessage(error), true);
      }
    });

    uploadPanelGrid.appendChild(article);
  });
}

function renderTrainingExamples(items) {
  if (!trainingList) {
    return;
  }

  if (!items.length) {
    trainingList.innerHTML = '<div class="notice">No training examples yet.</div>';
    return;
  }

  trainingList.innerHTML = `
    <div class="training-example-list">
      ${items
        .map(
          (item) => `
            <article class="training-example-card">
              <div class="training-example-header">
                <strong>${escapeHtml(item.profile?.name ?? "Unlinked record")}</strong>
                <span class="training-example-status">${escapeHtml(item.status ?? "DRAFT")}</span>
              </div>
              <p class="card-copy">Example ID: ${escapeHtml(item.id)}</p>
              <p class="card-copy">Employee ID: ${escapeHtml(item.profile?.employeeId ?? "-")}</p>
              <p class="card-copy">Created: ${escapeHtml(formatDatabaseValue(item.createdAt))}</p>
              <button class="button button-secondary training-select-button" type="button" data-training-id="${escapeHtml(item.id)}">
                Use This Record
              </button>
            </article>
          `,
        )
        .join("")}
    </div>
  `;

  trainingList.querySelectorAll(".training-select-button").forEach((button) => {
    button.addEventListener("click", () => {
      const input = byId("training-example-id");
      if (input) {
        input.value = button.dataset.trainingId || "";
      }
      if (trainingResult) {
        setNotice(trainingResult, `Training example ${button.dataset.trainingId} selected for labeling.`);
      }
    });
  });
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

function setNotice(element, message, isError = false) {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.classList.toggle("notice-error", isError);
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

function resetDatabaseOverview() {
  if (!databaseViewer) {
    return;
  }
  databaseViewer.innerHTML = '<div class="notice">Sign in with an evaluator account to load the database contents.</div>';
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
