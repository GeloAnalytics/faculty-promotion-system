export function byId(id) {
  return document.getElementById(id);
}

export function valueOf(id) {
  const element = byId(id);
  return element ? element.value : "";
}

export function numberOf(id) {
  const value = Number.parseFloat(valueOf(id));
  return Number.isFinite(value) ? value : 0;
}

export function normalizePortalPath(pathname) {
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

export function prettyRole(role) {
  if (role === "EMPLOYEE") {
    return "Faculty";
  }
  if (role === "EVALUATOR") {
    return "Evaluator";
  }
  if (role === "ADMIN") {
    return "Admin";
  }
  return role || "Guest";
}

export function setNotice(element, message, isError = false, isSuccess = false) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle("notice-error", isError);
  element.classList.toggle("notice-success", isSuccess && !isError);
}

export function showToast(message, type = "success") {
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

export function formatDatabaseValue(value) {
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

export function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function normalizeApiBaseUrl(value) {
  if (!value) {
    return "";
  }

  return String(value).replace(/\/+$/, "");
}
