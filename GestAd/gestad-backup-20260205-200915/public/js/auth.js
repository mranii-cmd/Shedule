// Vérification de l'authentification
function checkAuth() {
  const token = localStorage.getItem('auth_token');
  
  if (!token) {
    window.location.href = 'login.html';
    return false;
  }
  
  return true;
}

// Charger les informations de l'utilisateur connecté
async function loadCurrentUser() {
  try {
    const response = await fetch('/api/users/me', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        window.location.href = 'login.html';
        return null;
      }
      throw new Error('Erreur lors du chargement du profil');
    }

    const user = await response.json();
    
    // Mettre à jour la sidebar
    const sidebarUserInfo = document.getElementById('sidebarUserInfo');
    if (sidebarUserInfo) {
      sidebarUserInfo.innerHTML = `
        <i class="fas fa-user-circle"></i>
        <span>${user.first_name || user.username}</span>
      `;
    }
    
    return user;
  } catch (error) {
    console.error('Error loading user:', error);
    return null;
  }
}

// Déconnexion
function logout() {
  if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
    localStorage.removeItem('auth_token');
    window.location.href = 'login.html';
  }
}

// Vérifier l'authentification au chargement
document.addEventListener('DOMContentLoaded', () => {
  if (checkAuth()) {
    loadCurrentUser();
  }
});

// Exporter pour utilisation dans d'autres fichiers
window.checkAuth = checkAuth;
window.loadCurrentUser = loadCurrentUser;
window.logout = logout;
