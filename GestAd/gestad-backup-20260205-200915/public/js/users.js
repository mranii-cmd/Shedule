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
  const search = document.getElementById('searchInput').value.toLowerCase();
  const roleFilter = document.getElementById('roleFilter').value;
  const statusFilter = document.getElementById('statusFilter').value;

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
  loadUsers();
  
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('roleFilter').addEventListener('change', applyFilters);
  document.getElementById('statusFilter').addEventListener('change', applyFilters);
});