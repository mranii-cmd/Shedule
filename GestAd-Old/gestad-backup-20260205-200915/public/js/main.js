import { loadEvents } from './modules/events.js';
import { toast } from './components/Toast.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('GestAd UI v2.0');
  
  setupTabs();
  loadEvents();
  toast.info('Bienvenue');
});

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const panelId = tab.getAttribute('aria-controls');
      switchTab(panelId);
    });
  });
}

function switchTab(panelId) {
  document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
    panel.hidden = true;
  });
  
  const activePanel = document.getElementById(panelId);
  if (activePanel) {
    activePanel.hidden = false;
    
    if (panelId === 'panel-events') {
      loadEvents();
    }
  }
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.getAttribute('aria-controls') === panelId;
    btn.setAttribute('aria-selected', isActive);
    btn.tabIndex = isActive ? 0 : -1;
  });
}
