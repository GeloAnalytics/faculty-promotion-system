const healthStatus = document.getElementById("health-status");
const modelStatus = document.getElementById("model-status");
const healthGuideline = document.getElementById("health-guideline");
const sessionUser = document.getElementById("session-user");
const tqeSummary = document.getElementById("tqe-summary");
const guidelineSummary = document.getElementById("guideline-summary");
const authResult = document.getElementById("auth-result");
const facultyForm = document.getElementById("faculty-form");
const latestRecordResult = document.getElementById("prediction-result");
const trainingForm = document.getElementById("training-form");
const trainingResult = document.getElementById("training-result");
const trainingList = document.getElementById("training-list");
const registerForm = document.getElementById("register-form");
const loginForm = document.getElementById("login-form");
const logoutButton = document.getElementById("logout-button");
const uploadPanelGrid = document.getElementById("upload-panel-grid");

let latestRecordContext = null;

document.querySelectorAll("[data-scroll-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(button.dataset.scrollTarget);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authResult.textContent = "Creating account...";

  try {
    const data = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        fullName: valueOf("register-name"),
        email: valueOf("register-email"),
        password: valueOf("register-password"),
      }),
    });

    authResult.textContent = JSON.stringify(data, null, 2);
    await refreshSession();
    await Promise.all([loadUploadPanels(), loadTrainingExamples()]);
  } catch (error) {
    authResult.textContent = stringifyError(error);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authResult.textContent = "Signing in...";

  try {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: valueOf("login-email"),
        password: valueOf("login-password"),
      }),
    });

    authResult.textContent = JSON.stringify(data, null, 2);
    await refreshSession();
    await Promise.all([loadUploadPanels(), loadTrainingExamples()]);
  } catch (error) {
    authResult.textContent = stringifyError(error);
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" }, false);
    authResult.textContent = "Signed out.";
    latestRecordContext = null;
    sessionUser.textContent = "Guest";
    uploadPanelGrid.innerHTML = "";
    trainingList.textContent = "No training examples loaded yet.";
  } catch (error) {
    authResult.textContent = stringifyError(error);
  }
});

facultyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  latestRecordResult.textContent = "Saving faculty record...";

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

    latestRecordResult.textContent = JSON.stringify(data, null, 2);
    await loadTrainingExamples();
  } catch (error) {
    latestRecordResult.textContent = stringifyError(error);
  }
});

trainingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!latestRecordContext) {
    trainingResult.textContent = "Save a faculty record first so there is a training example to label.";
    return;
  }

  const existingId = latestRecordContext.response.trainingExampleId;
  trainingResult.textContent = "Saving training label...";

  try {
    const data = await apiFetch(`/api/training/examples/${existingId}/label`, {
      method: "PATCH",
      body: JSON.stringify({
        labelPromoted: valueOf("training-label") === "true",
        labelSource: valueOf("training-source"),
        datasetSplit: valueOf("training-split"),
        notes: valueOf("training-notes"),
      }),
    });

    trainingResult.textContent = JSON.stringify(data, null, 2);
    await loadTrainingExamples();
  } catch (error) {
    trainingResult.textContent = stringifyError(error);
  }
});

bootstrap();

async function bootstrap() {
  await Promise.all([loadHealth(), loadTqeSummary(), loadGuidelines(), refreshSession()]);
  if (sessionUser.textContent !== "Guest") {
    await Promise.all([loadUploadPanels(), loadTrainingExamples()]);
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
    healthGuideline.textContent = data.referenceData?.guidelinePdfFileName ?? "Missing";
  } catch (error) {
    healthStatus.textContent = "Unavailable";
    modelStatus.textContent = "-";
    healthGuideline.textContent = "-";
  }
}

async function loadTqeSummary() {
  try {
    const data = await apiFetch("/api/reference/tqe-summary", { method: "GET" }, false);
    tqeSummary.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    tqeSummary.textContent = stringifyError(error);
  }
}

async function loadGuidelines() {
  try {
    const data = await apiFetch("/api/reference/guidelines", { method: "GET" }, false);
    guidelineSummary.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    guidelineSummary.textContent = stringifyError(error);
  }
}

async function loadUploadPanels() {
  try {
    const data = await apiFetch("/api/config/upload-panels", { method: "GET" });
    renderUploadPanels(data.panels);
  } catch (error) {
    uploadPanelGrid.innerHTML = `<pre class="code-block">${escapeHtml(stringifyError(error))}</pre>`;
  }
}

async function loadTrainingExamples() {
  try {
    const data = await apiFetch("/api/training/examples", { method: "GET" });
    trainingList.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    trainingList.textContent = stringifyError(error);
  }
}

function renderUploadPanels(panels) {
  uploadPanelGrid.innerHTML = "";

  panels.forEach((panel) => {
    const article = document.createElement("article");
    article.className = "card upload-card";
    article.innerHTML = `
      <h3>${panel.title}</h3>
      <p class="card-copy">${panel.description}</p>
      <p class="card-copy">Accepted: ${panel.acceptedFormats.join(", ")}</p>
      <form class="stack-form upload-panel-form" data-panel-key="${panel.key}">
        <label class="field">
          <span>Select file</span>
          <input type="file" name="document" required />
        </label>
        <button class="button button-primary" type="submit">Upload to Panel</button>
      </form>
      <pre class="code-block panel-result">No file uploaded yet.</pre>
    `;

    const form = article.querySelector(".upload-panel-form");
    const result = article.querySelector(".panel-result");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = form.querySelector('input[type="file"]');
      if (!input.files?.length) {
        result.textContent = "Choose a file first.";
        return;
      }

      const formData = new FormData();
      formData.append("document", input.files[0]);
      formData.append("panelKey", panel.key);
      formData.append("kind", panel.key === "tallied_points" ? "TRAINING_SUPPORT" : "REQUIREMENT");
      if (latestRecordContext?.response?.profileId) {
        formData.append("profileId", latestRecordContext.response.profileId);
      }

      result.textContent = "Uploading...";
      try {
        const response = await fetch("/api/documents/extract", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const data = await readJson(response);
        result.textContent = JSON.stringify(data, null, 2);
      } catch (error) {
        result.textContent = stringifyError(error);
      }
    });

    uploadPanelGrid.appendChild(article);
  });
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

function stringifyError(error) {
  return JSON.stringify(
    {
      error: error instanceof Error ? error.message : String(error),
    },
    null,
    2,
  );
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
