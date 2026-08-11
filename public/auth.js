import { normalizeApiBaseUrl, setNotice, toErrorMessage } from './ui-helpers.js';

const apiBaseUrl = normalizeApiBaseUrl(window.APP_CONFIG?.apiBaseUrl);

const authResult = document.getElementById('auth-result');
const authForm = document.getElementById('auth-form');
const showLoginButton = document.getElementById('show-login');
const showRegisterButton = document.getElementById('show-register');
const nameField = document.getElementById('name-field');
const roleField = document.getElementById('role-field');
const employeeIdField = document.getElementById('employee-id-field');
const authRoleSelect = document.getElementById('auth-role');
const authSubmit = document.getElementById('auth-submit');

const authPanel = document.getElementById('auth-panel');
const forcePasswordPanel = document.getElementById('force-password-panel');
const forcePasswordForm = document.getElementById('force-password-form');
const forcePasswordResult = document.getElementById('force-password-result');
const forceCurrentPasswordField = document.getElementById('force-current-password');
const forceNewPasswordField = document.getElementById('force-new-password');
const forceNewPasswordConfirmField = document.getElementById('force-new-password-confirm');

let authMode = 'login';
let pendingHomePath = null;

showLoginButton?.addEventListener('click', () => setAuthMode('login'));
showRegisterButton?.addEventListener('click', () => setAuthMode('register'));
authRoleSelect?.addEventListener('change', updateEmployeeIdVisibility);

authForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setNotice(authResult, authMode === 'login' ? 'Signing in...' : 'Creating account...');

  try {
    const endpoint = authMode === 'login' ? buildApiUrl('/api/auth/login') : buildApiUrl('/api/auth/register');
    const body =
      authMode === 'login'
        ? {
            email: valueOf('auth-email'),
            password: valueOf('auth-password'),
          }
        : {
            fullName: valueOf('auth-name'),
            email: valueOf('auth-email'),
            password: valueOf('auth-password'),
            role: valueOf('auth-role'),
            ...(valueOf('auth-role') === 'EMPLOYEE' ? { employeeId: valueOf('auth-employee-id') } : {}),
          };

    const data = await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (data.user?.mustChangePassword) {
      pendingHomePath = data.homePath || getHomePathForRole(data.user?.role);
      showForcePasswordPanel(valueOf('auth-password'));
      return;
    }

    setNotice(authResult, `${authMode === 'login' ? 'Signed in' : 'Account created'} for ${data.user.fullName}.`, false, true);
    window.location.assign(data.homePath || getHomePathForRole(data.user?.role));
  } catch (error) {
    setNotice(authResult, toErrorMessage(error), true);
  }
});

forcePasswordForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const currentPassword = forceCurrentPasswordField?.value || '';
  const newPassword = forceNewPasswordField?.value || '';
  const confirmPassword = forceNewPasswordConfirmField?.value || '';

  if (newPassword !== confirmPassword) {
    setNotice(forcePasswordResult, 'New password and confirmation do not match.', true);
    return;
  }

  setNotice(forcePasswordResult, 'Updating password...');

  try {
    const data = await apiFetch(buildApiUrl('/api/auth/change-password'), {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    setNotice(forcePasswordResult, 'Password updated. Redirecting...', false, true);
    window.location.assign(data.homePath || pendingHomePath || getHomePathForRole(data.user?.role));
  } catch (error) {
    setNotice(forcePasswordResult, toErrorMessage(error), true);
  }
});

function showForcePasswordPanel(currentPassword) {
  if (authPanel) {
    authPanel.style.display = 'none';
  }
  if (forcePasswordPanel) {
    forcePasswordPanel.style.display = '';
  }
  if (forceCurrentPasswordField) {
    forceCurrentPasswordField.value = currentPassword || '';
  }
  if (forceNewPasswordField) {
    forceNewPasswordField.focus();
  }
}

bootstrap();

async function bootstrap() {
  setAuthMode('login');

  try {
    const data = await apiFetch(buildApiUrl('/api/auth/me'), { method: 'GET' });
    window.location.replace(getHomePathForRole(data.user?.role));
  } catch {
    // Not signed in - stay on the login/register page.
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === 'register';

  if (nameField) {
    nameField.style.display = isRegister ? 'grid' : 'none';
  }
  if (roleField) {
    roleField.style.display = isRegister ? 'grid' : 'none';
  }
  if (authSubmit) {
    authSubmit.textContent = isRegister ? 'Create Account' : 'Sign In';
  }
  showLoginButton?.classList.toggle('button-primary', !isRegister);
  showLoginButton?.classList.toggle('button-secondary', isRegister);
  showRegisterButton?.classList.toggle('button-primary', isRegister);
  showRegisterButton?.classList.toggle('button-secondary', !isRegister);
  updateEmployeeIdVisibility();
}

function updateEmployeeIdVisibility() {
  if (!employeeIdField) {
    return;
  }
  const showEmployeeId = authMode === 'register' && valueOf('auth-role') !== 'EVALUATOR';
  employeeIdField.style.display = showEmployeeId ? 'grid' : 'none';
}

function getHomePathForRole(role) {
  if (role === 'ADMIN') {
    return '/admin';
  }
  return role === 'EVALUATOR' ? '/evaluator' : '/employee';
}

function buildApiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

async function apiFetch(path, init = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error =
      typeof data.error === 'string' && typeof data.details === 'string' && data.error !== data.details
        ? `${data.error}: ${data.details}`
        : data.error || data.details || `Request failed with status ${response.status}`;
    throw new Error(error);
  }
  return data;
}

function valueOf(id) {
  const element = document.getElementById(id);
  return element ? element.value : '';
}
