// public/js/profile.js
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
  if (user && user.avatar_url) {
    const img = document.createElement('img');
    img.src = user.avatar_url + '?t=' + Date.now();
    img.alt = 'Avatar';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    avatarPreview.innerHTML = '';
    avatarPreview.appendChild(img);
  } else {
    avatarPreview.innerHTML = '<i class="fas fa-user"></i>';
  }

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const profileNameEl = document.getElementById('profileName');
  if (profileNameEl) profileNameEl.textContent = fullName;

  const profileUsernameEl = document.getElementById('profileUsername');
  if (profileUsernameEl) profileUsernameEl.textContent = `@${user.username}`;

  const profileRoleEl = document.getElementById('profileRole');
  if (profileRoleEl) profileRoleEl.innerHTML = getRoleBadge(user.role);

  const setValue = (id, value = '') => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };

  setValue('first_name', user.first_name || '');
  setValue('last_name', user.last_name || '');
  setValue('email', user.email || '');
  setValue('phone', user.phone || '');
  const bioEl = document.getElementById('bio');
  if (bioEl) bioEl.value = user.bio || '';

  // Mettre à jour le sidebar/header user display
  try {
    updateSidebarUser(user);
  } catch (e) {
    console.warn('updateSidebarUser indisponible:', e);
  }
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
    const container = document.getElementById('activityLog');
    if (container) container.innerHTML = '<p class="text-muted">Erreur lors du chargement de l\'activité</p>';
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
        <p class="activity-description">${activity.action}</p>
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

// Robust updateSidebarUser — insertion non destructive et résiliente
function updateSidebarUser(user) {
  const selectors = [
    '#username',
    '#sidebarUserInfo',
    '.sidebar-footer .user-info',
    'a[href="profile.html"]'
  ];

  let container = null;
  for (const s of selectors) {
    const c = document.querySelector(s);
    if (c) { container = c; break; }
  }
  if (!container) {
    console.warn('updateSidebarUser: aucun container sidebar trouvé');
    return;
  }

  const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;

  // Ensure a span exists for the name
  let nameSpan = container.querySelector('span');
  if (!nameSpan) {
    nameSpan = document.createElement('span');
    nameSpan.textContent = displayName;
    container.appendChild(nameSpan);
  } else {
    nameSpan.textContent = displayName;
  }

  // Force layout so avatar is visible
  container.style.display = container.style.display || 'inline-flex';
  container.style.alignItems = container.style.alignItems || 'center';
  container.style.gap = container.style.gap || '0.5rem';

  const avatarUrl = user.avatar_url ? (user.avatar_url + '?t=' + Date.now()) : null;
  let img = container.querySelector('img.avatar-thumb');

  if (avatarUrl) {
    if (!img) {
      img = document.createElement('img');
      img.className = 'avatar-thumb';
      img.alt = displayName;
      img.style.cssText = 'width:32px;height:32px;min-width:32px;min-height:32px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;margin-right:0.5rem;border:1px solid rgba(0,0,0,0.08);';
      container.insertBefore(img, nameSpan);
    }
    if (img.src !== avatarUrl) img.src = avatarUrl;
  } else {
    if (img) img.remove();
  }

  // Attach a MutationObserver once to re-insert avatar if some other script removes it
  if (!container.__avatarObserverAttached) {
    const parentToWatch = container.parentElement || container;
    let retries = 0;
    const maxRetries = 20;
    const mo = new MutationObserver(() => {
      const curImg = container.querySelector('img.avatar-thumb');
      if (avatarUrl && !curImg && retries < maxRetries) {
        retries++;
        const newImg = document.createElement('img');
        newImg.className = 'avatar-thumb';
        newImg.alt = displayName;
        newImg.style.cssText = 'width:32px;height:32px;min-width:32px;min-height:32px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;margin-right:0.5rem;border:1px solid rgba(0,0,0,0.08);';
        newImg.src = avatarUrl;
        const existingSpan = container.querySelector('span') || null;
        container.insertBefore(newImg, existingSpan);
        console.warn('updateSidebarUser: ré-insertion avatar (attempt ' + retries + ')');
      }
      if (retries >= maxRetries) mo.disconnect();
    });
    mo.observe(parentToWatch, { childList: true, subtree: true, attributes: false });
    container.__avatarObserverAttached = true;
  }

  console.log('updateSidebarUser: sidebar mis à jour pour', displayName);
}

// Initialisation
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

  // Bouton avatar
  if (changeAvatarBtn && avatarInput) {
    console.log('✅ Attachement du listener au bouton avatar...');

    changeAvatarBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('🖱️ CLIC DÉTECTÉ !');
      avatarInput.click();
    };

    console.log('✅ Listener attaché avec succès');
  }

  // Upload d'avatar
  if (avatarInput) {
    avatarInput.addEventListener('change', async function (e) {
      console.log('📁 Fichier sélectionné !');
      const file = e.target.files[0];
      if (!file) return;

      console.log('Fichier:', { name: file.name, size: file.size, type: file.type });

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

        const response = await fetch('/api/profile/avatar', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: formData
        });

        console.log('📥 Response status:', response.status);

        const responseText = await response.text();
        console.log('📥 Response body:', responseText);

        if (!response.ok) {
          let errorMessage = 'Erreur lors de l\'upload';
          try {
            const error = JSON.parse(responseText);
            errorMessage = error.message || errorMessage;
          } catch (err) {
            errorMessage = responseText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const result = JSON.parse(responseText);
        console.log('✅ Upload réussi:', result);

        // Mettre à jour l'aperçu
        const avatarPreview = document.getElementById('avatarPreview');
        if (avatarPreview) {
          const avatarUrl = result.avatar_url + '?t=' + Date.now();
          console.log('🖼️ Mise à jour de l\'aperçu avec:', avatarUrl);

          const img = document.createElement('img');
          img.src = avatarUrl;
          img.alt = 'Avatar';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';

          img.onload = function () {
            console.log('✅ Image chargée avec succès');

            // METTRE À JOUR LE SIDEBAR
            if (currentUser) {
              currentUser.avatar_url = result.avatar_url;
              try {
                updateSidebarUser(currentUser);
              } catch (e) {
                console.warn('updateSidebarUser indisponible au moment de l\'upload :', e);
              }
            }
          };

          img.onerror = function () {
            console.error('❌ Erreur de chargement:', avatarUrl);
          };

          avatarPreview.innerHTML = '';
          avatarPreview.appendChild(img);
        }

        showToast('Avatar mis à jour avec succès', 'success');
        loadActivity();
      } catch (error) {
        console.error('❌ Error:', error);
        showToast(error.message, 'error');
      }
    });
  }

  // Formulaire profil
  if (profileForm) {
    profileForm.addEventListener('submit', async function (e) {
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
    passwordForm.addEventListener('submit', async function (e) {
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

  loadProfile();
}

// Chargement
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProfile);
} else {
  initProfile();
}

window.addEventListener('load', function () {
  if (!currentUser) {
    initProfile();
  }
});