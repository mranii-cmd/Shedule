import StateManager from '../controllers/StateManager.js';

/**
 * Module léger pour persister l'onglet actif et le sous-onglet (configuration).
 * - Sauvegarde StateManager.state.header.activeTab / activeSubtab à chaque changement d'onglet.
 * - Restaure l'onglet / sous-onglet au démarrage en "clickant" sur le bouton correspondant.
 *
 * Intégration : importer et appeler TabPersistence.init() depuis src/js/main.js
 * après l'appel à StateManager.loadState().
 */
const TabPersistence = {
  init() {
    // Attendre que le DOM soit prêt (les boutons d'onglets existent)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._setup());
    } else {
      this._setup();
    }
  },

  _setup() {
    try {
      // Récupérer valeurs sauvegardées (StateManager.loadState() devrait déjà avoir été appelé)
      const header = (StateManager && StateManager.state && StateManager.state.header) ? StateManager.state.header : {};
      const activeTab = header.activeTab || null;
      const activeSubtab = header.activeSubtab || null;

      // Si un onglet sauvegardé existe, simuler un click pour l'activer (réutilise votre logique existante d'activation)
      if (activeTab) {
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${activeTab}"]`);
        if (tabBtn) {
          // petit timeout pour laisser l'initialisation UI se faire
          setTimeout(() => tabBtn.click(), 10);
        }
      }

      // Attacher écouteurs sur les onglets principaux pour persister le choix
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          try {
            const tab = btn.dataset.tab;
            if (!StateManager.state.header) StateManager.state.header = {};
            StateManager.state.header.activeTab = tab;
            // Sauvegarde immédiate (écriture persistante)
            StateManager.saveState();
          } catch (err) {
            console.warn('TabPersistence: erreur lors de saveState', err);
          }
        });
      });

      // Gérer les sous-onglets (ex: .sub-tab-btn) — persister activeSubtab
      document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          try {
            const sub = btn.dataset.subtab;
            if (!StateManager.state.header) StateManager.state.header = {};
            StateManager.state.header.activeSubtab = sub;
            StateManager.saveState();
          } catch (err) {
            console.warn('TabPersistence: erreur lors de saveState (subtab)', err);
          }
        });
      });

      // Si on a un subtab sauvegardé et que l'onglet config est actif, restaurer le subtab
      if (activeTab === 'config' && activeSubtab) {
        const subBtn = document.querySelector(`.sub-tab-btn[data-subtab="${activeSubtab}"]`);
        if (subBtn) {
          // petit délai pour s'assurer que les sous-onglets existent
          setTimeout(() => subBtn.click(), 50);
        }
      }
    } catch (err) {
      console.error('TabPersistence.init failed', err);
    }
  }
};

export default TabPersistence;