import { createApp } from 'vue';
import './style.css'; // Let's use the styles from public/styles.css eventually
import App from './App.vue';
import router from './router';

const app = createApp(App);

app.use(router);
app.mount('#app');
