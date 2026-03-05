// Simple utilitaire pour attacher des "indicateurs" aux éléments .tvi-reference
// Adaptable : tooltip, icône, badge, lien vers profil, etc.

export function attachIndicator(inputEl) {
  if (!inputEl || !(inputEl instanceof HTMLElement)) return;
  try {
    if (inputEl._tviAttached) return;
    inputEl._tviAttached = true;

    const value = (inputEl.value || '').toString().trim();
    if (!value) return;

    const badge = document.createElement('span');
    badge.className = 'tvi-badge';
    badge.textContent = value;
    badge.style.marginLeft = '6px';
    badge.style.padding = '2px 6px';
    badge.style.fontSize = '11px';
    badge.style.borderRadius = '10px';
    badge.style.background = '#f1f1f1';
    badge.style.color = '#333';
    badge.setAttribute('aria-hidden', 'true');

    // place badge après l'input ou son parent visible
    const target = inputEl.nextElementSibling || inputEl.parentElement || inputEl;
    if (target && target.parentNode) target.parentNode.insertBefore(badge, target.nextSibling);
    else document.body.appendChild(badge);
  } catch (e) {
    console.warn('attachIndicator error', e);
  }
}