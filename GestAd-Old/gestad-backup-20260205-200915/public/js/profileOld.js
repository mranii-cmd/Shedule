console.log('📂 profile.js chargé');
let currentUser = null;

// Charger le profil
async function loadProfile() {
  try {
    const response = await fetch('/api/profile', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        window.location.href = 'login.html';
        return;
      }
      throw new Error('Erreur lors du chargement du profil');
    }

    currentUser = await response.json();
    console.log('✅ Profil chargé:', currentUser);
    displayProfile(currentUser);
    loadActivity();
  } catch (error) {
    console.error('Error loading profile:', error);
    showToast('Erreur lors du chargement du profil', 'error');
  }
}

// Afficher le profil
function displayProfile(user) {
  // Avatar
  const avatarPreview = document.getElementById('avatarPreview');
  if (user.avatar_url) {
    avatarPreview.innerHTML = `<img src="${user.avatar_url}" alt="Avatar">`;
  } else {
    avatarPreview.innerHTML = `<i class="fas fa-user"></i>`;
  }

  // Infos principales
  document.getElementById('profileName').textContent = 
    `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  document.getElementById('profileUsername').textContent = `@${user.username}`;
  document.getElementById('profileRole').innerHTML = getRoleBadge(user.role);

  // Formulaire
  document.getElementById('first_name').value = user.first_name || '';
  document.getElementById('last_name').value = user.last_name || '';
  document.getElementById('email').value = user.email || '';
  document.getElementById('phone').value = user.phone || '';
  document.getElementById('bio').value = user.bio || '';
}

// Badge de rôle
function getRoleBadge(role) {
  const badges = {
    admin: '<span class="badge badge-danger"><i class="fas fa-crown"></i> Administrateur</span>',
    editor: '<span class="badge badge-primary"><i class="fas fa-edit"></i> Éditeur</span>',
    viewer: '<span class="badge badge-secondary"><i class="fas fa-eye"></i> Lecteur</span>'
  };
  return badges[role] || '<span class="badge">-</span>';
}

// Charger l'activité
async function loadActivity() {
  try {
    const response = await fetch('/api/profile/activity?limit=10', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) throw new Error('Erreur lors du chargement de l\'activité');

    const data = await response.json();
    displayActivity(data.activities);
  } catch (error) {
    console.error('Error loading activity:', error);
    document.getElementById('activityLog').innerHTML = 
      '<p class="text-muted">Erreur lors du chargement de l\'activité</p>';
  }
}

// Afficher l'activité
function displayActivity(activities) {
  const container = document.getElementById('activityLog');
  
  if (!activities || activities.length === 0) {
    container.innerHTML = '<p class="text-muted">Aucune activité récente</p>';
    return;
  }

  container.innerHTML = activities.map(activity => `
    <div class="activity-item">
      <div class="activity-icon ${getActivityIconClass(activity.action)}">
        <i class="fas ${getActivityIcon(activity.action)}"></i>
      </div>
      <div class="activity-content">
        <p class="activity-description">${activity.description || activity.action}</p>
        <small class="activity-time">${formatDate(activity.created_at)}</small>
      </div>
    </div>
  `).join('');
}

function getActivityIcon(action) {
  const icons = {
    create: 'fa-plus',
    update: 'fa-edit',
    delete: 'fa-trash',
    login: 'fa-sign-in-alt',
    logout: 'fa-sign-out-alt'
  };
  return icons[action] || 'fa-circle';
}

function getActivityIconClass(action) {
  const classes = {
    create: 'activity-icon-success',
    update: 'activity-icon-primary',
    delete: 'activity-icon-danger',
    login: 'activity-icon-info',
    logout: 'activity-icon-secondary'
  };
  return classes[action] || '';
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
  if (diffHours < 24) return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
  if (diffDays < 7) return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ✅ Init - TOUT dans DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Profile.js initialisé');
  
  // Vérifier les éléments
  const profileForm = document.getElementById('profileForm');
  const passwordForm = document.getElementById('passwordForm');
  const avatarInput = document.getElementById('avatarInput');
  
  console.log('Form profil:', profileForm ? '✅' : '❌');
  console.log('Form password:', passwordForm ? '✅' : '❌');
  console.log('Avatar input:', avatarInput ? '✅' : '❌');
  
  // Formulaire profil
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(e.target);
      const data = {
        first_name: formData.get('first_name'),
        last_name: formData.get('last_name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        bio: formData.get('bio')
      };

      try {
        const response = await fetch('/api/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Erreur lors de la mise à jour');
        }

        const updatedUser = await response.json();
        currentUser = updatedUser;
        displayProfile(updatedUser);
        
        showToast('Profil mis à jour avec succès', 'success');
        loadActivity();
      } catch (error) {
        console.error('Error updating profile:', error);
        showToast(error.message, 'error');
      }
    });
  }
  
  // Formulaire mot de passe
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(e.target);
      const currentPassword = formData.get('current_password');
      const newPassword = formData.get('new_password');
      const confirmPassword = formData.get('confirm_password');

      if (newPassword !== confirmPassword) {
        showToast('Les mots de passe ne correspondent pas', 'error');
        return;
      }

      try {
        const response = await fetch('/api/profile/password', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Erreur lors du changement de mot de passe');
        }

        showToast('Mot de passe modifié avec succès', 'success');
        e.target.reset();
        loadActivity();
      } catch (error) {
        console.error('Error changing password:', error);
        showToast(error.message, 'error');
      }
    });
  }
  
  // Upload d'avatar
  if (avatarInput) {
    avatarInput.addEventListener('change', async (e) => {
      console.log('📁 Fichier sélectionné');
      const file = e.target.files[0];
      if (!file) return;

      console.log('Fichier:', file.name, file.size, file.type);

      // Vérifier la taille
      if (file.size > 5 * 1024 * 1024) {
        showToast('Le fichier est trop volumineux (max 5MB)', 'error');
        return;
      }

      // Vérifier le type
      if (!file.type.startsWith('image/')) {
        showToast('Seules les images sont autorisées', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('avatar', file);

      try {
        console.log('📤 Upload en cours...');
        
        const response = await fetch('/api/profile/avatar', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: formData
        });

        console.log('📥 Response status:', response.status);

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Erreur lors de l\'upload');
        }

        const result = await response.json();
        console.log('✅ Upload réussi:', result);
        
        // Mettre à jour l'aperçu avec un cache buster
        document.getElementById('avatarPreview').innerHTML = 
          `<img src="${result.avatar_url}?t=${Date.now()}" alt="Avatar">`;
        
        showToast('Avatar mis à jour avec succès', 'success');
        loadActivity();
      } catch (error) {
        console.error('❌ Error uploading avatar:', error);
        showToast(error.message, 'error');
      }
    });
  }
  
  // Charger le profil
  loadProfile();
});