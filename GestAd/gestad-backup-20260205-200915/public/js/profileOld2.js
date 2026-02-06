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
  const avatarPreview = document.getElementById('avatarPreview');
  if (user.avatar_url) {
    avatarPreview.innerHTML = `<img src="${user.avatar_url}" alt="Avatar">`;
  } else {
    avatarPreview.innerHTML = `<i class="fas fa-user"></i>`;
  }

  document.getElementById('profileName').textContent =
    `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  document.getElementById('profileUsername').textContent = `@${user.username}`;
  document.getElementById('profileRole').innerHTML = getRoleBadge(user.role);

  document.getElementById('first_name').value = user.first_name || '';
  document.getElementById('last_name').value = user.last_name || '';
  document.getElementById('email').value = user.email || '';
  document.getElementById('phone').value = user.phone || '';
  document.getElementById('bio').value = user.bio || '';
}

function getRoleBadge(role) {
  const badges = {
    admin: '<span class="badge badge-danger"><i class="fas fa-crown"></i> Administrateur</span>',
    editor: '<span class="badge badge-primary"><i class="fas fa-edit"></i> Éditeur</span>',
    viewer: '<span class="badge badge-secondary"><i class="fas fa-eye"></i> Lecteur</span>'
  };
  return badges[role] || '<span class="badge">-</span>';
}

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

// ✅ FONCTION D'INITIALISATION
function initProfile() {
  console.log('🚀 Initialisation du profil...');

  const profileForm = document.getElementById('profileForm');
  const passwordForm = document.getElementById('passwordForm');
  const avatarInput = document.getElementById('avatarInput');
  const changeAvatarBtn = document.getElementById('changeAvatarBtn');

  console.log('=== VÉRIFICATION DES ÉLÉMENTS ===');
  console.log('profileForm:', profileForm ? '✅' : '❌');
  console.log('passwordForm:', passwordForm ? '✅' : '❌');
  console.log('avatarInput:', avatarInput ? '✅' : '❌');
  console.log('changeAvatarBtn:', changeAvatarBtn ? '✅' : '❌');

  // ✅ BOUTON AVATAR - PRIORITAIRE
  if (changeAvatarBtn && avatarInput) {
    console.log('✅ Attachement du listener au bouton avatar...');

    // Méthode 1 : onclick
    changeAvatarBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('🖱️ CLIC DÉTECTÉ (onclick) !');
      avatarInput.click();
    };

    // Méthode 2 : addEventListener (backup)
    changeAvatarBtn.addEventListener('click', function (e) {
      console.log('🖱️ CLIC DÉTECTÉ (addEventListener) !');
    }, true);

    console.log('✅ Listener attaché avec succès');
  } else {
    console.error('❌ changeAvatarBtn ou avatarInput manquant !');
    console.log('changeAvatarBtn:', changeAvatarBtn);
    console.log('avatarInput:', avatarInput);
  }

  // Upload d'avatar
  if (avatarInput) {
    console.log('✅ Attachement du listener à l\'input...');

    avatarInput.addEventListener('change', async (e) => {
      console.log('📁 Fichier sélectionné !');
      const file = e.target.files[0];
      if (!file) {
        console.log('Aucun fichier');
        return;
      }

      console.log('Fichier:', {
        name: file.name,
        size: file.size,
        type: file.type
      });

      if (file.size > 5 * 1024 * 1024) {
        showToast('Le fichier est trop volumineux (max 5MB)', 'error');
        return;
      }

      if (!file.type.startsWith('image/')) {
        showToast('Seules les images sont autorisées', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('avatar', file);

      try {
        console.log('📤 Upload en cours...');
        console.log('Token:', localStorage.getItem('auth_token') ? 'Présent' : 'Absent');

        const response = await fetch('/api/profile/avatar', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: formData
        });

        console.log('📥 Response status:', response.status);
        console.log('📥 Response headers:', [...response.headers.entries()]);

        // ✅ LIRE LA RÉPONSE MÊME EN CAS D'ERREUR
        const responseText = await response.text();
        console.log('📥 Response body (text):', responseText);

        if (!response.ok) {
          let errorMessage = 'Erreur lors de l\'upload';
          try {
            const error = JSON.parse(responseText);
            errorMessage = error.message || error.error || errorMessage;
            console.error('❌ Erreur serveur:', error);
          } catch (e) {
            console.error('❌ Réponse non-JSON:', responseText);
            errorMessage = responseText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        let result;
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          console.error('❌ Réponse non-JSON:', responseText);
          throw new Error('Réponse serveur invalide');
        }

        console.log('✅ Upload réussi:', result);

        document.getElementById('avatarPreview').innerHTML =
          `<img src="${result.avatar_url}?t=${Date.now()}" alt="Avatar">`;

        showToast('Avatar mis à jour avec succès', 'success');
        loadActivity();
      } catch (error) {
        console.error('❌ Error complet:', error);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        showToast(error.message, 'error');
      }
    });
  }

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

  // Charger le profil
  loadProfile();
}

// ✅ TRIPLE SÉCURITÉ POUR LE CHARGEMENT
if (document.readyState === 'loading') {
  console.log('⏳ Document en cours de chargement...');
  document.addEventListener('DOMContentLoaded', initProfile);
} else {
  console.log('✅ Document déjà chargé, init immédiate');
  initProfile();
}

// Backup si DOMContentLoaded ne se déclenche pas
window.addEventListener('load', function () {
  console.log('🔄 window.load - vérification...');
  if (!currentUser) {
    console.log('⚠️ Profil non chargé, réinitialisation...');
    initProfile();
  }
});