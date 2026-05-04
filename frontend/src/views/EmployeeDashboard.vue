<template>
  <div>
    <header class="header">
      <div class="container header-content">
        <h1 class="logo-text">GeloAnalytics <span class="badge">Faculty</span></h1>
        <div class="header-actions">
          <span class="user-email">{{ userEmail }}</span>
          <button class="btn btn-outline btn-sm" @click="logout">Logout</button>
        </div>
      </div>
    </header>

    <main class="container page-content">
      <div class="card">
        <div class="card-header">
          <h2>Employee Dashboard</h2>
        </div>
        <div class="card-body">
          <p>Welcome to the new Vue.js Frontend!</p>
          <p>This is a lightweight version of the dashboard. Your features from the monolithic app will be migrated here.</p>
          <div class="alert alert-info mt-4">
            <strong>Next Steps:</strong> Port the document upload and dashboard components from <code>public/app.js</code> into Vue components.
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const userEmail = ref('');

onMounted(async () => {
  const token = localStorage.getItem('fps_token');
  if (!token) {
    router.push('/');
    return;
  }
  
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Session expired');
    const data = await res.json();
    userEmail.value = data.user.email;
  } catch (err) {
    localStorage.removeItem('fps_token');
    localStorage.removeItem('fps_role');
    router.push('/');
  }
});

async function logout() {
  const token = localStorage.getItem('fps_token');
  try {
    await fetch('/api/auth/logout', { 
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (err) {
    console.error(err);
  } finally {
    localStorage.removeItem('fps_token');
    localStorage.removeItem('fps_role');
    router.push('/');
  }
}
</script>

<style scoped>
.header {
  background-color: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 1rem 0;
  margin-bottom: 2rem;
}
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.page-content {
  max-width: 1200px;
  margin: 0 auto;
}
.mt-4 {
  margin-top: 1rem;
}
</style>
