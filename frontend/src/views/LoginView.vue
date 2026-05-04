<template>
  <div class="auth-wrapper">
    <div class="auth-container card">
      <div class="auth-header">
        <h1 class="logo-text">GeloAnalytics</h1>
        <p class="subtitle">Faculty Promotion System</p>
      </div>

      <div class="tabs">
        <button class="tab-btn" :class="{ active: activeTab === 'login' }" @click="activeTab = 'login'">Login</button>
        <button class="tab-btn" :class="{ active: activeTab === 'register' }" @click="activeTab = 'register'">Register</button>
      </div>

      <div class="auth-body">
        <div v-if="error" class="alert alert-error">{{ error }}</div>

        <form v-if="activeTab === 'login'" @submit.prevent="handleLogin" class="auth-form">
          <div class="form-group">
            <label for="login-email">Email Address</label>
            <input type="email" id="login-email" v-model="loginForm.email" required placeholder="Enter your email" />
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" v-model="loginForm.password" required placeholder="Enter your password" />
          </div>
          <button type="submit" class="btn btn-primary btn-block" :disabled="loading">
            {{ loading ? 'Signing In...' : 'Sign In' }}
          </button>
        </form>

        <form v-else @submit.prevent="handleRegister" class="auth-form">
          <div class="form-group">
            <label for="reg-name">Full Name</label>
            <input type="text" id="reg-name" v-model="registerForm.fullName" required placeholder="Dr. Jane Doe" />
          </div>
          <div class="form-group">
            <label for="reg-email">Email Address</label>
            <input type="email" id="reg-email" v-model="registerForm.email" required placeholder="Enter your email" />
          </div>
          <div class="form-group">
            <label for="reg-password">Password</label>
            <input type="password" id="reg-password" v-model="registerForm.password" required placeholder="Create a password (min 8 chars)" minlength="8" />
          </div>
          <div class="form-group">
            <label for="reg-role">Role</label>
            <select id="reg-role" v-model="registerForm.role" required>
              <option value="EMPLOYEE">Faculty Member (Employee)</option>
              <option value="EVALUATOR">Evaluator / HR</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary btn-block" :disabled="loading">
            {{ loading ? 'Creating Account...' : 'Create Account' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const activeTab = ref('login');
const loading = ref(false);
const error = ref('');

const loginForm = ref({
  email: '',
  password: ''
});

const registerForm = ref({
  fullName: '',
  email: '',
  password: '',
  role: 'EMPLOYEE'
});

const API_BASE = '/api';

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm.value)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    
    localStorage.setItem('fps_token', data.token);
    localStorage.setItem('fps_role', data.user.role);
    
    router.push(data.homePath);
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function handleRegister() {
  error.value = '';
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerForm.value)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    
    localStorage.setItem('fps_token', data.token);
    localStorage.setItem('fps_role', data.user.role);
    
    router.push(data.homePath);
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: var(--background);
}
.auth-container {
  width: 100%;
  max-width: 480px;
  padding: 2.5rem;
}
.auth-header {
  text-align: center;
  margin-bottom: 2rem;
}
.logo-text {
  color: var(--primary);
  margin-bottom: 0.5rem;
}
.subtitle {
  color: var(--text-muted);
}
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  margin-bottom: 2rem;
}
.tab-btn {
  flex: 1;
  background: none;
  border: none;
  padding: 1rem;
  font-weight: 500;
  color: var(--text-muted);
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}
.tab-btn.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}
.tab-btn:hover:not(.active) {
  color: var(--text);
  background-color: var(--surface-hover);
}
</style>
