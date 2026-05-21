import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import EmployeeDashboard from '../views/EmployeeDashboard.vue';
import EvaluatorDashboard from '../views/EvaluatorDashboard.vue';
import { fetchSession, getHomePathForRole } from '../lib/session';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/employee',
      name: 'employee-dashboard',
      component: EmployeeDashboard,
      meta: { requiresAuth: true, role: 'EMPLOYEE' }
    },
    {
      path: '/evaluator',
      name: 'evaluator-dashboard',
      component: EvaluatorDashboard,
      meta: { requiresAuth: true, role: 'EVALUATOR' }
    },
  ],
});

router.beforeEach(async (to) => {
  const session = await fetchSession();

  if (to.path === '/' && session) {
    return session.homePath || getHomePathForRole(session.user.role);
  }

  if (to.meta.requiresAuth && !session) {
    return '/';
  }

  if (to.meta.role && session && to.meta.role !== session.user.role && session.user.role !== 'ADMIN') {
    return session.homePath || getHomePathForRole(session.user.role);
  }

  return true;
});

export default router;
