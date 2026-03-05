/**
 * importExportUI.js
 *
 * Small UI helpers to let a user import/export from browser console or from the app.
 *
 * Usage examples (console):
 *  - ProjectStorage.exportProject().then(str => downloadExport(str, 'project_export.json'));
 *  - openImportPicker().then(obj => ProjectStorage.importProject(obj));
 */

function downloadExport(jsonString, filename) {
  const a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
  a.download = filename || 'project_state_export.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function openImportPicker() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    document.body.appendChild(input);
    input.onchange = e => {
      const f = e.target.files && e.target.files[0];
      document.body.removeChild(input);
      if (!f) return reject(new Error('No file selected'));
      const r = new FileReader();
      r.onload = ev => {
        try {
          const txt = ev.target.result;
          // do not auto-save here; return parsed object for caller to importProject()
          const cleaned = txt.replace(/"\s*undefined\s*"/g,'null').replace(/\bundefined\b/g,'null');
          const obj = JSON.parse(cleaned);
          resolve(obj);
        } catch (err) {
          reject(err);
        }
      };
      r.readAsText(f, 'utf-8');
    };
    input.click();
  });
}

// Expose
window.ProjectUI = {
  downloadExport,
  openImportPicker
};