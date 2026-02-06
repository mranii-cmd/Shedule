// public/js/users.js
// Added: updateSidebarUser + loadAndUpdateUser to show avatar on pages that load this script.

//
// ===== Shared sidebar/avatar utilities =====
function updateSidebarUser(user) {
  const selectors = ['#username', '#sidebarUserInfo', '.sidebar-footer .user-info', 'a[href="profile.html"]'];
  let container = null;
  for (const s of selectors) {
    const c = document.querySelector(s);
    if (c) { container = c; break; }
  }
  if (!container) return console.warn('updateSidebarUser: container not found');

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

  // Force layout so the image is visible
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

  // Lightweight observer to re-insert avatar if some other script removes it
  if (!container.__avatarObserverAttached) {
    const parentToWatch = container.parentElement || container;
    let attempts = 0, maxAttempts = 20;
    const mo = new MutationObserver(() => {
      const curImg = container.querySelector('img.avatar-thumb');
      if (avatarUrl && !curImg && attempts < maxAttempts) {
        attempts++;
        const newImg = document.createElement('img');
        newImg.className = 'avatar-thumb';
        newImg.alt = displayName;
        newImg.style.cssText = 'width:32px;height:32px;min-width:32px;min-height:32px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;margin-right:0.5rem;border:1px solid rgba(0,0,0,0.08);';
        newImg.src = avatarUrl;
        const existingSpan = container.querySelector('span') || null;
        container.insertBefore(newImg, existingSpan);
        console.warn('updateSidebarUser: re-inserted avatar (attempt ' + attempts + ')');
      }
      if (attempts >= maxAttempts) mo.disconnect();
    });
    mo.observe(parentToWatch, { childList: true, subtree: true });
    container.__avatarObserverAttached = true;
  }
}

// Fetch profile and update sidebar. Returns Promise<user|null>
function loadAndUpdateUser() {
  return fetch('/api/profile', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
  })
  .then(resp => {
    if (!resp.ok) {
      // 401 or other — ignore gracefully
      console.warn('loadAndUpdateUser: profile fetch failed', resp.status);
      return null;
    }
    return resp.json();
  })
  .then(user => {
    if (user) updateSidebarUser(user);
    return user;
  })
  .catch(err => {
    console.warn('loadAndUpdateUser error:', err);
    return null;
  });
}

//
// ===== Existing users.js logic (unchanged except for init ordering) =====
let allUsers = [];

// Charger les utilisateurs
async function loadUsers() {
  try {
    const response = await fetch('/api/users', {
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
      throw new Error('Erreur lors du chargement');
    }

    const data = await response.json();
    
    // L'API retourne { ok: true, users: [...] }
    allUsers = data.users || [];
    
    console.log('Users loaded:', allUsers);
    renderUsers(allUsers);
  } catch (error) {
    console.error('Error loading users:', error);
    showToast('Erreur lors du chargement des utilisateurs', 'error');
  }
}

// Afficher les utilisateurs
function renderUsers(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return console.warn('renderUsers: usersTableBody not found');

  if (!Array.isArray(users)) {
    console.error('users is not an array:', users);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center">Erreur : données invalides</td>
      </tr>
    `;
    return;
  }
  
  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center">Aucun utilisateur trouvé</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map(user => `
    <tr>
      <td>
        <div class="user-cell">
          ${user.avatar_url 
            ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}" class="user-avatar">` 
            : `<div class="user-avatar-placeholder">${getInitials(user)}</div>`
          }
          <div>
            <div class="user-name">${escapeHtml(user.first_name || '')} ${escapeHtml(user.last_name || '')}</div>
            <div class="user-username">@${escapeHtml(user.username)}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(user.email || '-')}</td>
      <td>${getRoleBadge(user.role)}</td>
      <td>${getStatusBadge(user.is_active)}</td>
      <td>${formatDate(user.last_login)}</td>
      <td class="actions-cell">
        <button 
          class="btn-icon" 
          onclick="editUser(${user.id})"
          title="Modifier"
        >
          <i class="fas fa-edit"></i>
        </button>
        <button 
          class="btn-icon btn-danger" 
          onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')"
          title="Supprimer"
        >
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function getInitials(user) {
  const first = (user.first_name || user.username || '?')[0].toUpperCase();
  const last = (user.last_name || '')[0]?.toUpperCase() || '';
  return first + last;
}

function getRoleBadge(role) {
  const badges = {
    admin: '<span class="badge badge-danger"><i class="fas fa-crown"></i> Admin</span>',
    editor: '<span class="badge badge-primary"><i class="fas fa-edit"></i> Éditeur</span>',
    viewer: '<span class="badge badge-secondary"><i class="fas fa-eye"></i> Lecteur</span>'
  };
  return badges[role] || '<span class="badge">-</span>';
}

function getStatusBadge(isActive) {
  return isActive !== false
    ? '<span class="badge badge-success">Actif</span>'
    : '<span class="badge badge-warning">Inactif</span>';
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function openCreateUserModal() {
  userModal.open(null, () => loadUsers());
}

async function editUser(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  userModal.open(user, () => loadUsers());
}

async function deleteUser(userId, username) {
  if (!confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur "${username}" ?`)) {
    return;
  }

  try {
    const response = await fetch(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) throw new Error('Erreur lors de la suppression');

    showToast('Utilisateur supprimé avec succès', 'success');
    loadUsers();
  } catch (error) {
    console.error('Error deleting user:', error);
    showToast('Erreur lors de la suppression', 'error');
  }
}

function applyFilters() {
  const searchEl = document.getElementById('searchInput');
  const roleEl = document.getElementById('roleFilter');
  const statusEl = document.getElementById('statusFilter');
  const search = searchEl ? searchEl.value.toLowerCase() : '';
  const roleFilter = roleEl ? roleEl.value : '';
  const statusFilter = statusEl ? statusEl.value : '';

  const filtered = allUsers.filter(user => {
    const matchSearch = !search || 
      user.username?.toLowerCase().includes(search) ||
      user.email?.toLowerCase().includes(search) ||
      user.first_name?.toLowerCase().includes(search) ||
      user.last_name?.toLowerCase().includes(search);

    const matchRole = !roleFilter || user.role === roleFilter;
    
    const matchStatus = !statusFilter || 
      (statusFilter === 'active' && user.is_active !== false) ||
      (statusFilter === 'inactive' && user.is_active === false);

    return matchSearch && matchRole && matchStatus;
  });

  renderUsers(filtered);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  // First try to fetch profile and update sidebar (if authenticated)
  loadAndUpdateUser().then(() => {
    // Then proceed loading users
    loadUsers();
  });

  const searchInput = document.getElementById('searchInput');
  const roleFilter = document.getElementById('roleFilter');
  const statusFilter = document.getElementById('statusFilter');

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (roleFilter) roleFilter.addEventListener('change', applyFilters);
  if (statusFilter) statusFilter.addEventListener('change', applyFilters);
});