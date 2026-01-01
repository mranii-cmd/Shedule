import DatabaseService from './services/DatabaseService.js';

const db = new DatabaseService();

const form = document.getElementById('loginForm');
const errEl = document.getElementById('loginError');
const btnCancel = document.getElementById('btnCancel');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = '';
  const username = (document.getElementById('username').value || '').trim();
  const password = (document.getElementById('password').value || '').trim();
  if (!username || !password) {
    errEl.textContent = 'Nom d’utilisateur et mot de passe requis';
    return;
  }
  try {
    await db.login(username, password);
    // redirect to app root or previous location
    const redirect = new URLSearchParams(window.location.search).get('redirect') || '/';
    window.location.replace(redirect);
  } catch (err) {
    console.error('Login error', err);
    errEl.textContent = (err && err.message) ? err.message : 'Erreur lors de la connexion';
  }
});

btnCancel.addEventListener('click', () => {
  // back or home
  try { window.history.back(); } catch (e) { window.location.replace('/'); }
});