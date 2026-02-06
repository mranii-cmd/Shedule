// public/js/user.js
// Charge le profil et met à jour le sidebar avec l'avatar (utilisable sur toutes les pages)

function updateSidebarUser(user) {
  const selectors = ['#username', '#sidebarUserInfo', '.sidebar-footer .user-info', 'a[href="profile.html"]'];
  let container = null;
  for (const s of selectors) {
    const c = document.querySelector(s);
    if (c) { container = c; break; }
  }
  if (!container) return;

  const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;

  let nameSpan = container.querySelector('span');
  if (!nameSpan) {
    nameSpan = document.createElement('span');
    nameSpan.textContent = displayName;
    container.appendChild(nameSpan);
  } else {
    nameSpan.textContent = displayName;
  }

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
      img.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;margin-right:0.5rem;border:1px solid rgba(0,0,0,0.08);';
      container.insertBefore(img, nameSpan);
    }
    if (img.src !== avatarUrl) img.src = avatarUrl;
  } else {
    if (img) img.remove();
  }

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
        newImg.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;margin-right:0.5rem;border:1px solid rgba(0,0,0,0.08);';
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

function loadAndUpdateUser() {
  return fetch('/api/profile', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
  })
  .then(resp => {
    if (!resp.ok) {
      // probablement non authentifié : ignorer silencieusement
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