import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import EmployeeDashboard from '../views/EmployeeDashboard.vue';
import EvaluatorDashboard from '../views/EvaluatorDashboard.vue';

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

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('fps_token');
  const userRole = localStorage.getItem('fps_role');

  if (to.meta.requiresAuth && !token) {
    return next('/');
  }

  if (to.meta.role && to.meta.role !== userRole) {
    if (userRole === 'EMPLOYEE') return next('/employee');
    if (userRole === 'EVALUATOR') return next('/evaluator');
    if (userRole === 'ADMIN') return next(); // Admin can access everything
    return next('/');
  }

  next();
});

export default router;
