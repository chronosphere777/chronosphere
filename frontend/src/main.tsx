import { render } from 'preact';
import { App } from './App';
import './style.css';
import { initTelegramApp } from './utils/telegram';

// Очистка кеша и service workers (для Telegram WebApp)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
}

// Очистка старого кеша
if ('caches' in window) {
  caches.keys().then(names => {
    names.forEach(name => caches.delete(name));
  });
}

// Инициализация Telegram Mini App
initTelegramApp();

render(<App />, document.getElementById('app')!);
