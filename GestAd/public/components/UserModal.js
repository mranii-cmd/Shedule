class UserModal {
  constructor() {
    this.modal = null;
    this.form = null;
    this.isEditMode = false;
    this.currentUserId = null;
    this.onSave = null;
  }

  create() {
    const modalHTML = `
      <div class="modal" id="userModal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="userModalTitle">Nouvel Utilisateur</h2>
            <button class="modal-close" onclick="userModal.close()">&times;</button>
          </div>
          
          <form id="userForm" class="modal-body">
            <div class="form-row">
              <div class="form-group">
                <label for="username">Nom d'utilisateur *</label>
                <input type="text" id="username" name="username" required>
              </div>
              
              <div class="form-group">
                <label for="email">Email *</label>
                <input type="email" id="email" name="email" required>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="first_name">Prénom</label>
                <input type="text" id="first_name" name="first_name">
              </div>
              
              <div class="form-group">
                <label for="last_name">Nom</label>
                <input type="text" id="last_name" name="last_name">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="phone">Téléphone</label>
                <input type="tel" id="phone" name="phone">
              </div>
              
              <div class="form-group">
                <label for="role">Rôle *</label>
                <select id="role" name="role" required>
                  <option value="viewer">Lecteur</option>
                  <option value="editor">Éditeur</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
            </div>

            <div class="form-group" id="passwordGroup">
              <label for="password">Mot de passe *</label>
              <input type="password" id="password" name="password" minlength="6">
              <small class="form-hint">Minimum 6 caractères</small>
            </div>

            <div class="form-group">
              <label for="bio">Biographie</label>
              <textarea id="bio" name="bio" rows="3"></textarea>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="is_active" name="is_active" checked>
                <span>Compte actif</span>
              </label>
            </div>
          </form>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="userModal.close()">
              Annuler
            </button>
            <button type="submit" form="userForm" class="btn btn-primary">
              <i class="fas fa-save"></i> Enregistrer
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = document.getElementById('userModal');
    this.form = document.getElementById('userForm');
    
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
  }

  open(user = null, onSave = null) {
    if (!this.modal) this.create();
    
    this.onSave = onSave;
    this.isEditMode = !!user;
    this.currentUserId = user?.id || null;

    document.getElementById('userModalTitle').textContent = 
      this.isEditMode ? 'Modifier l\'Utilisateur' : 'Nouvel Utilisateur';

    const passwordGroup = document.getElementById('passwordGroup');
    const passwordInput = document.getElementById('password');
    
    if (this.isEditMode) {
      passwordInput.required = false;
      passwordGroup.querySelector('.form-hint').textContent = 
        'Laisser vide pour conserver le mot de passe actuel';
    } else {
      passwordInput.required = true;
      passwordGroup.querySelector('.form-hint').textContent = 
        'Minimum 6 caractères';
    }

    if (user) {
      document.getElementById('username').value = user.username || '';
      document.getElementById('email').value = user.email || '';
      document.getElementById('first_name').value = user.first_name || '';
      document.getElementById('last_name').value = user.last_name || '';
      document.getElementById('phone').value = user.phone || '';
      document.getElementById('role').value = user.role || 'viewer';
      document.getElementById('bio').value = user.bio || '';
      document.getElementById('is_active').checked = user.is_active !== false;
      document.getElementById('password').value = '';
    } else {
      this.form.reset();
    }

    this.modal.classList.add('active');
  }

  close() {
    if (this.modal) {
      this.modal.classList.remove('active');
      this.form.reset();
    }
  }

  async handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(this.form);
    const data = {
      username: formData.get('username'),
      email: formData.get('email'),
      first_name: formData.get('first_name'),
      last_name: formData.get('last_name'),
      phone: formData.get('phone'),
      role: formData.get('role'),
      bio: formData.get('bio'),
      is_active: formData.get('is_active') === 'on'
    };

    const password = formData.get('password');
    if (password) {
      data.password = password;
    }

    try {
      const url = this.isEditMode 
        ? `/api/users/${this.currentUserId}`
        : '/api/users';
      
      const method = this.isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erreur lors de l\'enregistrement');
      }

      const result = await response.json();
      
      showToast(
        this.isEditMode ? 'Utilisateur modifié avec succès' : 'Utilisateur créé avec succès',
        'success'
      );

      this.close();
      
      if (this.onSave) {
        this.onSave(result);
      }
    } catch (error) {
      console.error('Error saving user:', error);
      showToast(error.message, 'error');
    }
  }
}

const userModal = new UserModal();
