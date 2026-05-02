import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';

createApp(App).mount('#app');

const isLocalServer = ['localhost', '127.0.0.1', '0.0.0.0'].includes(location.hostname);
const shouldUseServiceWorker = import.meta.env.PROD && !isLocalServer;

if (shouldUseServiceWorker && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(error => {
      console.error('Service worker registration failed:', error);
    });
  });
}

if (!shouldUseServiceWorker && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
}
