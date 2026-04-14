const healthStatus = document.getElementById("health-status");
const modelStatus = document.getElementById("model-status");
const healthGuideline = document.getElementById("health-guideline");
const sessionUser = document.getElementById("session-user");
const authResult = document.getElementById("auth-result");
const facultyResult = document.getElementById("faculty-result");
const trainingResult = document.getElementById("training-result");
const trainingList = document.getElementById("training-list");
const facultyForm = document.getElementById("faculty-form");
const trainingForm = document.getElementById("training-form");
const authForm = document.getElementById("auth-form");
const uploadPanelGrid = document.getElementById("upload-panel-grid");
const showLoginButton = document.getElementById("show-login");
const showRegisterButton = document.getElementById("show-register");
const nameField = document.getElementById("name-field");
const authSubmit = document.getElementById("auth-submit");

let authMode = "login";
let latestRecordContext = null;

document.querySelectorAll("[data-scroll-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(button.dataset.scrollTarget);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

showLoginButton.addEventListener("click", () => setAuthMode("login"));
showRegisterButton.addEventListener("click", () => setAuthMode("register"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setNotice(authResult, authMode === "login" ? "Signing in..." : "Creating account...");

  try {
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
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
          };

    const data = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });

    await refreshSession();
    await Promise.all([loadUploadPanels(), loadTrainingExamples()]);
    setNotice(authResult, `${authMode === "login" ? "Signed in" : "Account created"} for ${data.user.fullName}.`);
  } catch (error) {
    setNotice(authResult, toErrorMessage(error), true);
  }
});

facultyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setNotice(facultyResult, "Saving faculty record...");

  const payload = buildFacultyPayload();

  try {
    const data = await apiFetch("/api/faculty/ingest", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    latestRecordContext = {
      payload,
      response: data,
    };

    setNotice(
      facultyResult,
      `Faculty record saved. Profile ID: ${data.profileId}. Training example draft created and ready for uploads and labeling.`,
    );
    await loadTrainingExamples();
  } catch (error) {
    setNotice(facultyResult, toErrorMessage(error), true);
  }
});

trainingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!latestRecordContext) {
    setNotice(trainingResult, "Save a faculty record first so there is a training example to label.", true);
    return;
  }

  setNotice(trainingResult, "Saving training label...");

  try {
    const data = await apiFetch(`/api/training/examples/${latestRecordContext.response.trainingExampleId}/label`, {
      method: "PATCH",
      body: JSON.stringify({
        labelPromoted: valueOf("training-label") === "true",
        labelSource: valueOf("training-source"),
        datasetSplit: valueOf("training-split"),
        notes: valueOf("training-notes"),
      }),
    });

    setNotice(trainingResult, `Training example updated. Status is now ${data.status}.`);
    await loadTrainingExamples();
  } catch (error) {
    setNotice(trainingResult, toErrorMessage(error), true);
  }
});

bootstrap();

async function bootstrap() {
  setAuthMode("login");
  await Promise.all([loadHealth(), refreshSession(), loadUploadPanels()]);
  if (sessionUser.textContent !== "Guest") {
    await loadTrainingExamples();
  }
}

async function refreshSession() {
  try {
    const data = await apiFetch("/api/auth/me", { method: "GET" });
    sessionUser.textContent = `${data.user.fullName} (${data.user.role})`;
  } catch {
    sessionUser.textContent = "Guest";
  }
}

async function loadHealth() {
  try {
    const data = await apiFetch("/api/health", { method: "GET" }, false);
    healthStatus.textContent = data.status;
    modelStatus.textContent = data.model?.status ?? "unknown";
    healthGuideline.textContent = data.referenceData?.guidelinePdfFileName ? "Loaded" : "Missing";
  } catch {
    healthStatus.textContent = "Unavailable";
    modelStatus.textContent = "-";
    healthGuideline.textContent = "-";
  }
}

async function loadUploadPanels() {
  try {
    const data = await apiFetch("/api/config/upload-panels", { method: "GET" }, false);
    renderUploadPanels(data.panels, sessionUser.textContent !== "Guest");
  } catch (error) {
    uploadPanelGrid.innerHTML = `<div class="notice notice-error">${escapeHtml(toErrorMessage(error))}</div>`;
  }
}

async function loadTrainingExamples() {
  try {
    const data = await apiFetch("/api/training/examples", { method: "GET" });
    const count = Array.isArray(data.items) ? data.items.length : 0;
    setNotice(trainingList, `Collected training records available: ${count}. Latest records are stored in PostgreSQL.`);
  } catch (error) {
    setNotice(trainingList, toErrorMessage(error), true);
  }
}

function renderUploadPanels(panels, isAuthenticated) {
  uploadPanelGrid.innerHTML = "";

  panels.forEach((panel) => {
    const article = document.createElement("article");
    article.className = "card upload-card";
    article.innerHTML = `
      <h3>${panel.title}</h3>
      <p class="card-copy">${panel.description}</p>
      <p class="card-copy">Accepted: ${panel.acceptedFormats.join(", ")}</p>
      <p class="card-copy">${isAuthenticated ? "Ready for upload." : "Sign in first to upload files into this panel."}</p>
      <form class="stack-form upload-panel-form" data-panel-key="${panel.key}">
        <label class="field">
          <span>Select file</span>
          <input type="file" name="document" ${isAuthenticated ? "" : "disabled"} required />
        </label>
        <button class="button button-primary" type="submit" ${isAuthenticated ? "" : "disabled"}>Upload to Panel</button>
      </form>
      <div class="notice panel-result">${isAuthenticated ? "No file uploaded yet." : "Panel visible. Authentication is required before upload."}</div>
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
      if (latestRecordContext?.response?.profileId) {
        formData.append("profileId", latestRecordContext.response.profileId);
      }

      setNotice(result, "Uploading...");
      try {
        const response = await fetch("/api/documents/extract", {
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

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === "register";
  nameField.style.display = isRegister ? "grid" : "none";
  authSubmit.textContent = isRegister ? "Create Account" : "Sign In";
  showLoginButton.classList.toggle("button-primary", !isRegister);
  showLoginButton.classList.toggle("button-secondary", isRegister);
  showRegisterButton.classList.toggle("button-primary", isRegister);
  showRegisterButton.classList.toggle("button-secondary", !isRegister);
}

function setNotice(element, message, isError = false) {
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

function buildFacultyPayload() {
  return {
    personalData: {
      fullName: valueOf("fullName"),
      teacherId: valueOf("teacherId"),
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

function valueOf(id) {
  return document.getElementById(id).value;
}

function numberOf(id) {
  const value = Number.parseFloat(document.getElementById(id).value);
  return Number.isFinite(value) ? value : 0;
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
