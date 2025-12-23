// Picklist Management - Unified page for all picklist tools
// Import dependencies
import { escapeHtml } from '../../shared/utils.js';
import SalesforceAPI from '../../background/api-client.js';
import MetadataAPI from '../../background/metadata-api.js';
import SessionManager from '../../background/session-manager.js';
import ThemeManager from '../../background/theme-manager.js';

// ============================================
// GLOBAL STATE
// ============================================

// Export Picklist state
let allObjects = [];
let selectedObjects = new Set();
let filteredObjects = [];

// Export Dependencies state
let allDepsObjects = [];
let selectedDepsObject = null;
let filteredDepsObjects = [];

// Picklist Loader state
let updateObjects = [];
let selectedUpdateObject = null;
let selectedUpdateField = null;
let currentFieldMetadata = null;
let previewData = null;

// Picklist Loader lock state
let isPicklistLoaderUnlocked = false;

// Dependency Loader state
let parsedDepsData = null;
let isUnlocked = false;
let selectedDependency = null;
let currentObjectMetadata = null;
let depsPreviewData = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize theme
  await ThemeManager.initTheme();

  // Check for stored unlock status
  try {
    const stored = await chrome.storage.session.get(['picklistLoaderUnlocked', 'dependencyLoaderUnlocked']);
    if (stored.picklistLoaderUnlocked) {
      isPicklistLoaderUnlocked = true;
      const lockIcon = document.querySelector('[data-tab="picklist-loader"] .lock-icon');
      if (lockIcon) lockIcon.style.display = 'none';
    }
    if (stored.dependencyLoaderUnlocked) {
      isUnlocked = true;
      const lockIcon = document.querySelector('[data-tab="dependency-loader"] .lock-icon');
      if (lockIcon) lockIcon.style.display = 'none';
    }
  } catch (error) {
    console.warn('[Picklist Management] Could not check unlock status:', error);
  }

  // Load and display org info
  await loadOrgInfo();

  // Setup tab navigation
  setupTabs();

  // Setup event listeners for all tools
  setupExportPicklistListeners();
  setupExportDependencyListeners();
  setupPicklistLoaderListeners();
  setupDependencyLoaderListeners();

  // Setup help button
  document.getElementById('helpBtn')?.addEventListener('click', showHelp);

  // Load initial data for active tab
  loadExportPicklistData();
});

// ============================================
// ORG INFORMATION
// ============================================

async function loadOrgInfo() {
  const orgUrlEl = document.getElementById('orgUrl');

  try {
    const session = await SessionManager.getCurrentSession();

    if (session && session.instanceUrl) {
      orgUrlEl.textContent = session.instanceUrl;
      orgUrlEl.title = `Connected to ${session.instanceUrl}`;
      console.log('[Picklist Management] Connected to org:', session.instanceUrl);
    } else {
      orgUrlEl.textContent = 'Not connected';
      orgUrlEl.style.color = 'var(--color-error)';
      console.warn('[Picklist Management] No active Salesforce session found');
    }
  } catch (error) {
    console.error('[Picklist Management] Error loading org info:', error);
    orgUrlEl.textContent = 'Error loading org';
    orgUrlEl.style.color = 'var(--color-error)';
  }
}

// ============================================
// TAB NAVIGATION
// ============================================

function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;

      // Handle locked picklist loader tab
      if (button.classList.contains('locked-feature') && targetTab === 'picklist-loader') {
        if (!isPicklistLoaderUnlocked) {
          showPicklistLoaderUnlock();
          return;
        }
      }

      // Handle locked dependency loader tab
      if (button.classList.contains('locked-feature') && targetTab === 'dependency-loader') {
        if (!isUnlocked) {
          showDependencyLoaderUnlock();
          return;
        }
      }

      // Remove active class from all tabs and panels
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanels.forEach(panel => panel.classList.remove('active'));

      // Add active class to clicked tab and corresponding panel
      button.classList.add('active');
      document.getElementById(targetTab)?.classList.add('active');

      // Load data for the active tab
      switch (targetTab) {
        case 'export-picklist':
          loadExportPicklistData();
          break;
        case 'export-dependency':
          loadExportDependencyData();
          break;
        case 'picklist-loader':
          loadPicklistLoaderData();
          break;
        case 'dependency-loader':
          loadDependencyLoaderData();
          break;
      }
    });
  });
}

// ============================================
// HELP FUNCTIONALITY
// ============================================

function showHelp() {
  const helpText = `
Picklist Management Tools:

1. Export Picklist - Export picklist values from multiple objects to CSV
2. Export Dependencies - Export field dependencies and record type picklists to CSV
3. Picklist Loader - Bulk load picklist values from CSV (create new or activate inactive)
4. Dependency Loader 🔒 - Bulk load field dependencies from CSV (password-protected)

For more information, visit the extension documentation.
  `.trim();

  alert(helpText);
}

// ============================================
// SECTION 1: EXPORT PICKLIST
// ============================================

function setupExportPicklistListeners() {
  document.getElementById('exportObjectSearch')?.addEventListener('input', handleExportSearch);
  document.getElementById('exportSelectAllBtn')?.addEventListener('click', selectAllExportObjects);
  document.getElementById('exportClearAllBtn')?.addEventListener('click', clearExportSelection);
  document.getElementById('exportPicklistBtn')?.addEventListener('click', doExportPicklist);
}

async function loadExportPicklistData() {
  const listEl = document.getElementById('exportObjectList');

  try {
    listEl.innerHTML = '<div class="loading-state"><span class="material-symbols-rounded spin">sync</span><p>Loading objects...</p></div>';

    console.log('[Picklist Management] Loading objects for export...');
    const objects = await SalesforceAPI.getObjects();

    // Filter out system objects
    allObjects = objects
      .filter(obj => {
        const excludeSuffixes = ['History', 'Share', 'Feed', 'Event', 'ChangeEvent'];
        return !excludeSuffixes.some(suffix => obj.name.endsWith(suffix));
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    console.log('[Picklist Management] Loaded', allObjects.length, 'objects');

    filteredObjects = [...allObjects];
    renderExportObjects(filteredObjects);
  } catch (error) {
    console.error('[Picklist Management] Error loading objects:', error);
    listEl.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">error</span><p>Error: ${escapeHtml(error.message)}</p></div>`;
  }
}

function renderExportObjects(objects) {
  const listEl = document.getElementById('exportObjectList');
  listEl.innerHTML = '';

  if (objects.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">search_off</span><p>No objects found</p></div>';
    return;
  }

  objects.forEach(obj => {
    const item = document.createElement('div');
    item.className = 'object-item';
    item.dataset.objectName = obj.name;

    if (selectedObjects.has(obj.name)) {
      item.classList.add('selected');
    }

    const icon = document.createElement('span');
    icon.className = 'material-symbols-rounded';
    icon.textContent = selectedObjects.has(obj.name) ? 'check_box' : 'check_box_outline_blank';

    const text = document.createElement('span');
    text.textContent = `${obj.label} (${obj.name})`;

    item.appendChild(icon);
    item.appendChild(text);

    item.addEventListener('click', () => handleExportObjectSelection(obj.name));

    listEl.appendChild(item);
  });

  updateExportSelectionInfo();
}

function handleExportObjectSelection(objectName) {
  if (selectedObjects.has(objectName)) {
    selectedObjects.delete(objectName);
  } else {
    selectedObjects.add(objectName);
  }
  renderExportObjects(filteredObjects);
}

function updateExportSelectionInfo() {
  const count = selectedObjects.size;
  const btn = document.getElementById('exportPicklistBtn');
  btn.disabled = count === 0;

  if (count > 0) {
    btn.innerHTML = `<span class="material-symbols-rounded">download</span> Export ${count} Object${count !== 1 ? 's' : ''}`;
  } else {
    btn.innerHTML = '<span class="material-symbols-rounded">download</span> Export to CSV';
  }
}

function handleExportSearch(e) {
  const query = e.target.value.toLowerCase();

  if (!query) {
    filteredObjects = [...allObjects];
  } else {
    filteredObjects = allObjects.filter(obj =>
      obj.name.toLowerCase().includes(query) ||
      obj.label.toLowerCase().includes(query)
    );
  }

  renderExportObjects(filteredObjects);
}

function selectAllExportObjects() {
  filteredObjects.forEach(obj => selectedObjects.add(obj.name));
  renderExportObjects(filteredObjects);
}

function clearExportSelection() {
  selectedObjects.clear();
  renderExportObjects(filteredObjects);
}

async function doExportPicklist() {
  const statusEl = document.getElementById('exportPicklistStatus');
  const exportBtn = document.getElementById('exportPicklistBtn');

  try {
    exportBtn.disabled = true;
    statusEl.textContent = 'Exporting picklist metadata...';
    statusEl.className = 'status-message loading';

    console.log('[Picklist Management] Starting export for', selectedObjects.size, 'objects');

    const exportData = {
      exportDate: new Date().toISOString(),
      objects: {}
    };

    let completed = 0;
    const total = selectedObjects.size;

    for (const objectName of selectedObjects) {
      try {
        statusEl.textContent = `Exporting ${objectName}... (${completed + 1}/${total})`;

        const metadata = await SalesforceAPI.getObjectMetadata(objectName);

        const picklistFields = {};

        if (metadata && metadata.fields) {
          for (const field of metadata.fields) {
            if (field.type === 'picklist' || field.type === 'multipicklist') {
              picklistFields[field.name] = {
                label: field.label,
                type: field.type,
                required: field.nillable === false,
                values: field.picklistValues || []
              };
            }
          }
        }

        exportData.objects[objectName] = {
          label: metadata.label || objectName,
          picklistFields
        };

        completed++;
        console.log('[Picklist Management] Completed:', objectName, '- Found', Object.keys(picklistFields).length, 'picklist fields');

      } catch (error) {
        console.error('[Picklist Management] Error exporting', objectName, ':', error);
        exportData.objects[objectName] = {
          error: error.message
        };
      }
    }

    downloadPicklistCSV(exportData, `picklist-export-${Date.now()}.csv`);

    statusEl.textContent = `✓ Export completed! ${total} objects exported to CSV.`;
    statusEl.className = 'status-message success';

    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
    }, 3000);

  } catch (error) {
    console.error('[Picklist Management] Export failed:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status-message error';
  } finally {
    exportBtn.disabled = selectedObjects.size === 0;
  }
}

function downloadPicklistCSV(exportData, filename) {
  const rows = [];
  rows.push(['Object API Name', 'Object Label', 'Field API Name', 'Field Label', 'Picklist Value']);

  for (const [objectName, objectData] of Object.entries(exportData.objects)) {
    if (objectData.error) {
      rows.push([objectName, objectData.error, '', '', '']);
      continue;
    }

    const objectLabel = objectData.label || objectName;
    const picklistFields = objectData.picklistFields || {};

    if (Object.keys(picklistFields).length === 0) {
      rows.push([objectName, objectLabel, '(No picklist fields)', '', '']);
      continue;
    }

    for (const [fieldName, fieldData] of Object.entries(picklistFields)) {
      const activeValues = fieldData.values.filter(v => v.active);

      if (activeValues.length === 0) {
        rows.push([objectName, objectLabel, fieldName, fieldData.label, '(No active values)']);
      } else {
        for (const value of activeValues) {
          rows.push([objectName, objectLabel, fieldName, fieldData.label, value.label]);
        }
      }
    }
  }

  const csvContent = rows.map(row =>
    row.map(cell => {
      const cellStr = String(cell || '');
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return '"' + cellStr.replace(/"/g, '""') + '"';
      }
      return cellStr;
    }).join(',')
  ).join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log('[Picklist Management] CSV downloaded:', filename, 'Rows:', rows.length);
}

// ============================================
// SECTION 2: EXPORT DEPENDENCY
// ============================================

function setupExportDependencyListeners() {
  document.getElementById('exportDepsObjectSearch')?.addEventListener('input', handleDepsSearch);
  document.getElementById('exportDepsSelectAllBtn')?.addEventListener('click', selectAllDepsObjects);
  document.getElementById('exportDepsClearAllBtn')?.addEventListener('click', clearDepsSelection);
  document.getElementById('exportDependencyBtn')?.addEventListener('click', doExportDependency);
}

async function loadExportDependencyData() {
  const listEl = document.getElementById('exportDepsObjectList');

  try {
    listEl.innerHTML = '<div class="loading-state"><span class="material-symbols-rounded spin">sync</span><p>Loading objects...</p></div>';

    console.log('[Picklist Management] Loading objects for dependencies export...');
    const objects = await SalesforceAPI.getObjects();

    allDepsObjects = objects
      .filter(obj => {
        const excludeSuffixes = ['History', 'Share', 'Feed', 'Event', 'ChangeEvent'];
        return !excludeSuffixes.some(suffix => obj.name.endsWith(suffix));
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    console.log('[Picklist Management] Loaded', allDepsObjects.length, 'objects');

    filteredDepsObjects = [...allDepsObjects];
    renderDepsObjects(filteredDepsObjects);
  } catch (error) {
    console.error('[Picklist Management] Error loading objects:', error);
    listEl.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">error</span><p>Error: ${escapeHtml(error.message)}</p></div>`;
  }
}

function renderDepsObjects(objects) {
  const listEl = document.getElementById('exportDepsObjectList');
  listEl.innerHTML = '';

  if (objects.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">search_off</span><p>No objects found</p></div>';
    return;
  }

  objects.forEach(obj => {
    const item = document.createElement('div');
    item.className = 'object-item';
    item.dataset.objectName = obj.name;

    if (selectedDepsObject === obj.name) {
      item.classList.add('selected');
    }

    const icon = document.createElement('span');
    icon.className = 'material-symbols-rounded';
    icon.textContent = selectedDepsObject === obj.name ? 'radio_button_checked' : 'radio_button_unchecked';

    const text = document.createElement('span');
    text.textContent = `${obj.label} (${obj.name})`;

    item.appendChild(icon);
    item.appendChild(text);

    item.addEventListener('click', () => handleDepsObjectSelection(obj.name));

    listEl.appendChild(item);
  });

  updateDepsSelectionInfo();
}

function handleDepsObjectSelection(objectName) {
  selectedDepsObject = objectName;
  renderDepsObjects(filteredDepsObjects);
}

function updateDepsSelectionInfo() {
  const btn = document.getElementById('exportDependencyBtn');
  btn.disabled = !selectedDepsObject;

  if (selectedDepsObject) {
    btn.innerHTML = `<span class="material-symbols-rounded">download</span> Export ${selectedDepsObject}`;
  } else {
    btn.innerHTML = '<span class="material-symbols-rounded">download</span> Export to CSV';
  }
}

function handleDepsSearch(e) {
  const query = e.target.value.toLowerCase();

  if (!query) {
    filteredDepsObjects = [...allDepsObjects];
  } else {
    filteredDepsObjects = allDepsObjects.filter(obj =>
      obj.name.toLowerCase().includes(query) ||
      obj.label.toLowerCase().includes(query)
    );
  }

  renderDepsObjects(filteredDepsObjects);
}

function selectAllDepsObjects() {
  // For single selection, just select the first filtered object
  if (filteredDepsObjects.length > 0) {
    selectedDepsObject = filteredDepsObjects[0].name;
    renderDepsObjects(filteredDepsObjects);
  }
}

function clearDepsSelection() {
  selectedDepsObject = null;
  renderDepsObjects(filteredDepsObjects);
}

async function doExportDependency() {
  const statusEl = document.getElementById('exportDependencyStatus');
  const exportBtn = document.getElementById('exportDependencyBtn');

  try {
    exportBtn.disabled = true;
    statusEl.textContent = 'Exporting field dependencies...';
    statusEl.className = 'status-message loading';

    console.log('[Picklist Management] Starting field dependencies export for:', selectedDepsObject);

    const session = await SessionManager.getCurrentSession();
    const metadata = await MetadataAPI.readObject(session, selectedDepsObject);

    console.log('[Picklist Management] Metadata retrieved:', metadata);

    const fieldDependencies = extractDependencies(metadata);
    const recordTypeDeps = extractRecordTypePicklists(metadata);

    const exportData = {
      object: selectedDepsObject,
      fields: fieldDependencies,
      recordTypes: recordTypeDeps
    };

    downloadDependenciesCSV(exportData, `field-dependencies-${selectedDepsObject}-${Date.now()}.csv`);

    statusEl.textContent = `✓ Field dependencies exported for ${selectedDepsObject}!`;
    statusEl.className = 'status-message success';

    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
    }, 3000);

  } catch (error) {
    console.error('[Picklist Management] Field dependencies export failed:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status-message error';
  } finally {
    exportBtn.disabled = !selectedDepsObject;
  }
}

function extractDependencies(metadata) {
  const dependencies = [];

  // Build a map of field API names to their picklist values (API name -> label)
  const fieldPicklistMap = new Map();

  metadata.fields.forEach(field => {
    if (field.valueSet?.valueSetDefinition?.value) {
      const picklistValues = new Map();
      field.valueSet.valueSetDefinition.value.forEach(v => {
        picklistValues.set(v.fullName, v.label || v.fullName);
      });
      fieldPicklistMap.set(field.fullName, picklistValues);
    }
  });

  metadata.fields
    .filter(f => f.valueSet?.controllingField)
    .forEach(field => {
      const controllingPicklistMap = fieldPicklistMap.get(field.valueSet.controllingField) || new Map();
      const dependentPicklistMap = fieldPicklistMap.get(field.fullName) || new Map();

      const mappings = field.valueSet.valueSettings.map(vs => ({
        controllingValueApi: vs.controllingFieldValue,
        controllingValueLabel: controllingPicklistMap.get(vs.controllingFieldValue) || vs.controllingFieldValue,
        dependentValueApi: vs.valueName,
        dependentValueLabel: dependentPicklistMap.get(vs.valueName) || vs.valueName
      }));

      dependencies.push({
        dependentField: field.fullName,
        controllingField: field.valueSet.controllingField,
        mappings: mappings
      });
    });

  return dependencies;
}

function extractRecordTypePicklists(metadata) {
  // Build a map of field API names to their picklist values (API name -> label)
  const fieldPicklistMap = new Map();

  metadata.fields.forEach(field => {
    if (field.valueSet?.valueSetDefinition?.value) {
      const picklistValues = new Map();
      field.valueSet.valueSetDefinition.value.forEach(v => {
        picklistValues.set(v.fullName, v.label || v.fullName);
      });
      fieldPicklistMap.set(field.fullName, picklistValues);
    }
  });

  return metadata.recordTypes.map(rt => ({
    recordType: rt.fullName,
    label: rt.label,
    picklistValues: rt.picklistValues.map(pv => {
      const picklistMap = fieldPicklistMap.get(pv.picklist) || new Map();
      return {
        picklist: pv.picklist,
        values: pv.values.map(v => ({
          fullName: v.fullName,
          label: picklistMap.get(v.fullName) || v.fullName
        }))
      };
    })
  }));
}

function downloadDependenciesCSV(exportData, filename) {
  const rows = [];
  rows.push(['Object API Name', 'Type', 'Record Type', 'Picklist Field', 'Dependent Field', 'Controlling Field', 'Controlling Value Label', 'Controlling Value API', 'Dependent Value Label', 'Dependent Value API']);

  // Field dependency rows
  for (const fieldDep of exportData.fields) {
    if (fieldDep.mappings && fieldDep.mappings.length > 0) {
      for (const mapping of fieldDep.mappings) {
        rows.push([
          exportData.object,
          'Field Dependency',
          '',
          '',
          fieldDep.dependentField,
          fieldDep.controllingField,
          mapping.controllingValueLabel,
          mapping.controllingValueApi,
          mapping.dependentValueLabel,
          mapping.dependentValueApi
        ]);
      }
    } else {
      rows.push([exportData.object, 'Field Dependency', '', '', fieldDep.dependentField, fieldDep.controllingField, '(No mappings)', '', '', '']);
    }
  }

  if (exportData.fields.length === 0) {
    rows.push([exportData.object, 'Field Dependency', '', '', '(No field dependencies)', '', '', '', '', '']);
  }

  // Record type picklist rows
  if (exportData.recordTypes && exportData.recordTypes.length > 0) {
    for (const recordType of exportData.recordTypes) {
      if (recordType.picklistValues && recordType.picklistValues.length > 0) {
        for (const picklistValue of recordType.picklistValues) {
          if (picklistValue.values && picklistValue.values.length > 0) {
            for (const value of picklistValue.values) {
              rows.push([
                exportData.object,
                'Record Type Picklist',
                recordType.recordType,
                picklistValue.picklist,
                '',
                '',
                value.label || value.fullName,
                value.fullName,
                '',
                ''
              ]);
            }
          } else {
            rows.push([exportData.object, 'Record Type Picklist', recordType.recordType, picklistValue.picklist, '', '', '(No values)', '', '', '']);
          }
        }
      }
    }
  }

  const csvContent = rows.map(row =>
    row.map(cell => {
      const cellStr = String(cell || '');
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return '"' + cellStr.replace(/"/g, '""') + '"';
      }
      return cellStr;
    }).join(',')
  ).join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log('[Picklist Management] Dependencies CSV downloaded:', filename, 'Rows:', rows.length);
}

// ============================================
// SECTION 3: PICKLIST LOADER
// ============================================

function setupPicklistLoaderListeners() {
  document.getElementById('unlockPicklistLoaderBtn')?.addEventListener('click', unlockPicklistLoader);
  document.getElementById('updateObjectSelect')?.addEventListener('change', handleUpdateObjectChange);
  document.getElementById('updateFieldSelect')?.addEventListener('change', handleUpdateFieldChange);
  document.getElementById('csvTextarea')?.addEventListener('input', handleCSVInput);
  document.getElementById('downloadCurrentBtn')?.addEventListener('click', downloadCurrentValues);
  document.getElementById('previewChangesBtn')?.addEventListener('click', previewPicklistChanges);
  document.getElementById('deployPicklistBtn')?.addEventListener('click', deployPicklistChanges);
}

async function loadPicklistLoaderData() {
  // Check if unlocked
  if (!isPicklistLoaderUnlocked) {
    document.getElementById('picklistLoaderUnlockSection').classList.remove('hidden');
    document.getElementById('picklistLoaderContent').classList.add('hidden');
    return;
  } else {
    document.getElementById('picklistLoaderUnlockSection').classList.add('hidden');
    document.getElementById('picklistLoaderContent').classList.remove('hidden');
  }

  const selectEl = document.getElementById('updateObjectSelect');

  try {
    console.log('[Picklist Management] Loading objects for picklist loader...');
    const objects = await SalesforceAPI.getObjects();

    updateObjects = objects
      .filter(obj => {
        const excludeSuffixes = ['History', 'Share', 'Feed', 'Event', 'ChangeEvent'];
        return !excludeSuffixes.some(suffix => obj.name.endsWith(suffix));
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    selectEl.innerHTML = '<option value="">-- Select Object --</option>';
    updateObjects.forEach(obj => {
      const option = document.createElement('option');
      option.value = obj.name;
      option.textContent = `${obj.label} (${obj.name})`;
      selectEl.appendChild(option);
    });

    console.log('[Picklist Management] Loaded', updateObjects.length, 'objects');
  } catch (error) {
    console.error('[Picklist Management] Error loading objects:', error);
    selectEl.innerHTML = '<option value="">Error loading objects</option>';
  }
}

async function handleUpdateObjectChange(e) {
  const objectName = e.target.value;
  selectedUpdateObject = objectName;
  selectedUpdateField = null;
  currentFieldMetadata = null;
  previewData = null;

  const fieldSelect = document.getElementById('updateFieldSelect');
  const previewBtn = document.getElementById('previewChangesBtn');
  const downloadBtn = document.getElementById('downloadCurrentBtn');
  const previewArea = document.getElementById('previewArea');
  const deployBtn = document.getElementById('deployPicklistBtn');

  fieldSelect.innerHTML = '<option value="">-- Select Field --</option>';
  fieldSelect.disabled = true;
  previewBtn.disabled = true;
  downloadBtn.disabled = true;
  previewArea.classList.add('hidden');
  if (deployBtn) deployBtn.disabled = true;

  if (!objectName) return;

  try {
    const metadata = await SalesforceAPI.getObjectMetadata(objectName);

    const picklistFields = metadata.fields.filter(f =>
      f.type === 'picklist' || f.type === 'multipicklist'
    );

    if (picklistFields.length === 0) {
      fieldSelect.innerHTML = '<option value="">No picklist fields found</option>';
      return;
    }

    fieldSelect.innerHTML = '<option value="">-- Select Field --</option>';
    picklistFields.forEach(field => {
      const option = document.createElement('option');
      option.value = field.name;
      option.textContent = `${field.label} (${field.name})`;
      option.dataset.fieldData = JSON.stringify(field);
      fieldSelect.appendChild(option);
    });

    fieldSelect.disabled = false;
    console.log('[Picklist Management] Loaded', picklistFields.length, 'picklist fields');
  } catch (error) {
    console.error('[Picklist Management] Error loading fields:', error);
    fieldSelect.innerHTML = '<option value="">Error loading fields</option>';
  }
}

function handleUpdateFieldChange(e) {
  const fieldName = e.target.value;
  selectedUpdateField = fieldName;
  previewData = null;

  const previewArea = document.getElementById('previewArea');
  const deployBtn = document.getElementById('deployPicklistBtn');
  const downloadBtn = document.getElementById('downloadCurrentBtn');

  previewArea.classList.add('hidden');
  if (deployBtn) deployBtn.disabled = true;

  if (fieldName && e.target.selectedIndex > 0) {
    const option = e.target.options[e.target.selectedIndex];
    currentFieldMetadata = JSON.parse(option.dataset.fieldData);
    downloadBtn.disabled = false;
    console.log('[Picklist Management] Selected field:', fieldName, currentFieldMetadata);
  } else {
    currentFieldMetadata = null;
    downloadBtn.disabled = true;
  }

  updatePreviewButtonState();
}

function handleCSVInput() {
  const previewArea = document.getElementById('previewArea');
  if (previewArea && !previewArea.classList.contains('hidden')) {
    previewArea.classList.add('hidden');
    previewData = null;

    const deployBtn = document.getElementById('deployPicklistBtn');
    if (deployBtn) deployBtn.disabled = true;
  }

  updatePreviewButtonState();
}

function updatePreviewButtonState() {
  const csvText = document.getElementById('csvTextarea').value.trim();
  const previewBtn = document.getElementById('previewChangesBtn');
  previewBtn.disabled = !selectedUpdateObject || !selectedUpdateField || !csvText;
}

async function downloadCurrentValues() {
  if (!currentFieldMetadata) return;

  try {
    // New format: Label,API Name
    const rows = [['Label', 'API Name']];
    const values = currentFieldMetadata.picklistValues || [];
    const activeValues = values.filter(v => v.active);

    activeValues.forEach(value => {
      rows.push([value.label, value.value]);
    });

    const csvContent = rows.map(row =>
      row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return '"' + cellStr.replace(/"/g, '""') + '"';
        }
        return cellStr;
      }).join(',')
    ).join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `current-values-${selectedUpdateObject}-${selectedUpdateField}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('[Picklist Management] Current values downloaded (Label,API Name format)');
  } catch (error) {
    console.error('[Picklist Management] Error downloading current values:', error);
  }
}

function parseCSV(csvText) {
  const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);

  if (lines.length === 0) {
    return [];
  }

  // Auto-detect format: Check first line for tabs (Excel) vs commas (CSV)
  const firstLine = lines[0] || '';
  const hasTabs = firstLine.includes('\t');
  const hasCommas = firstLine.includes(',');

  let separator = ','; // Default to CSV
  let formatName = 'CSV';

  if (hasTabs && !hasCommas) {
    // Excel format (tab-separated, no commas)
    separator = '\t';
    formatName = 'Excel/TSV';
  } else if (hasTabs && hasCommas) {
    // Both tabs and commas - count which is more frequent to decide
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;

    if (tabCount >= commaCount) {
      separator = '\t';
      formatName = 'Excel/TSV';
    }
  }

  console.log(`[Picklist Management] Auto-detected format: ${formatName}`);

  // Check if header row exists (contains "Label" or "API")
  const hasHeader = firstLine.toLowerCase().includes('label') || firstLine.toLowerCase().includes('api');
  const startIndex = hasHeader ? 1 : 0;

  const values = [];
  const seen = new Set();

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    // Parse line based on detected separator
    const parts = parseCSVLine(line, separator);

    if (parts.length < 2) {
      console.warn('[Picklist Management] Skipping invalid line (expected 2 columns):', line);
      continue;
    }

    const label = parts[0].trim();
    const apiName = parts[1].trim();

    if (!label || !apiName) {
      console.warn('[Picklist Management] Skipping line with empty values:', line);
      continue;
    }

    // Check for duplicates based on API Name (case-insensitive)
    const apiNameLower = apiName.toLowerCase();
    if (seen.has(apiNameLower)) {
      console.warn('[Picklist Management] Skipping duplicate API Name:', apiName);
      continue;
    }

    seen.add(apiNameLower);
    values.push({
      label: label,
      fullName: apiName
    });
  }

  console.log(`[Picklist Management] Parsed ${values.length} values from ${formatName}`);
  return values;
}

function parseCSVLine(line, separator = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;

  // For tab-separated (Excel), quotes are less common but still supported
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current);

  return result;
}

async function previewPicklistChanges() {
  const statusEl = document.getElementById('updatePicklistStatus');
  const previewBtn = document.getElementById('previewChangesBtn');
  const previewArea = document.getElementById('previewArea');
  const previewContent = document.getElementById('previewContent');

  try {
    previewBtn.disabled = true;
    statusEl.textContent = 'Loading current values...';
    statusEl.className = 'status-message loading';

    const csvText = document.getElementById('csvTextarea').value;
    const csvValues = parseCSV(csvText);

    if (csvValues.length === 0) {
      throw new Error('No valid values found in CSV');
    }

    // BUGFIX: Refresh field metadata from Salesforce to get current state
    console.log('[Picklist Management] Refreshing field metadata from Salesforce...');
    const metadata = await SalesforceAPI.getObjectMetadata(selectedUpdateObject);
    const field = metadata.fields.find(f => f.name === selectedUpdateField);

    if (!field) {
      throw new Error(`Field ${selectedUpdateField} not found on ${selectedUpdateObject}`);
    }

    currentFieldMetadata = field;
    console.log('[Picklist Management] Field metadata refreshed:', currentFieldMetadata);

    const currentValues = currentFieldMetadata.picklistValues || [];
    const currentActiveValues = currentValues.filter(v => v.active).map(v => v.value);

    // Build map of current values by API Name (case-insensitive)
    const currentValuesMap = new Map();
    currentValues.forEach(v => {
      currentValuesMap.set(v.value.toLowerCase(), v);
    });

    const toCreate = [];
    const alreadyActive = [];

    // csvValues now contains objects with {label, fullName}
    csvValues.forEach(csvValue => {
      const apiNameLower = csvValue.fullName.toLowerCase();
      const existing = currentValuesMap.get(apiNameLower);

      if (!existing) {
        // New value - will be created
        toCreate.push(csvValue);
      } else {
        // Value exists - add to alreadyActive (Tooling API will handle it)
        alreadyActive.push({
          label: csvValue.label,
          fullName: csvValue.fullName,
          currentLabel: existing.label
        });
      }
    });

    previewData = {
      csvValues,
      toCreate,
      alreadyActive
    };

    renderPreview(previewContent, previewData);

    previewArea.classList.remove('hidden');
    statusEl.textContent = '';
    statusEl.className = 'status-message';

    // Enable deploy button
    const deployBtn = document.getElementById('deployPicklistBtn');
    if (deployBtn) deployBtn.disabled = false;

  } catch (error) {
    console.error('[Picklist Management] Preview failed:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status-message error';
  } finally {
    previewBtn.disabled = false;
  }
}

function renderPreview(container, data) {
  let html = '';

  // Info message about Tooling API append mode
  html += `<div class="info-message" style="margin-bottom: 15px; padding: 10px; background: #e3f2fd; border-left: 4px solid #2196F3; border-radius: 4px;">
    <strong>ℹ️ Append Mode:</strong> New values will be added to the picklist. Existing values will be updated with new labels if different.
  </div>`;

  if (data.toCreate.length > 0) {
    html += `
      <div class="preview-section create">
        <h4>✓ Create New Values <span class="preview-count">(${data.toCreate.length})</span></h4>
        <table class="preview-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>API Name</th>
            </tr>
          </thead>
          <tbody>
            ${data.toCreate.map(v => `
              <tr>
                <td>${escapeHtml(v.label)}</td>
                <td>${escapeHtml(v.fullName)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  if (data.alreadyActive.length > 0) {
    html += `
      <div class="preview-section keep">
        <h4>= Existing Values <span class="preview-count">(${data.alreadyActive.length})</span></h4>
        <table class="preview-table">
          <thead>
            <tr>
              <th>Label (CSV)</th>
              <th>API Name</th>
              <th>Current Label</th>
            </tr>
          </thead>
          <tbody>
            ${data.alreadyActive.slice(0, 10).map(v => `
              <tr>
                <td>${escapeHtml(v.label)}</td>
                <td>${escapeHtml(v.fullName)}</td>
                <td style="color: ${v.label !== v.currentLabel ? '#ff9800' : 'inherit'}">
                  ${escapeHtml(v.currentLabel)}
                  ${v.label !== v.currentLabel ? ' <span style="font-size: 0.9em;">(will update)</span>' : ''}
                </td>
              </tr>
            `).join('')}
            ${data.alreadyActive.length > 10 ? `
              <tr>
                <td colspan="3" style="text-align: center; color: var(--brand-color-text-muted);">
                  ... and ${data.alreadyActive.length - 10} more
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `;
  }

  if (data.toCreate.length === 0 && data.alreadyActive.length === 0) {
    html += `<p style="text-align: center; color: var(--brand-color-text-muted);">No changes detected</p>`;
  }

  container.innerHTML = html;
}

async function deployPicklistChanges() {
  const statusEl = document.getElementById('updatePicklistStatus');
  const deployBtn = document.getElementById('deployPicklistBtn');

  try {
    deployBtn.disabled = true;
    statusEl.textContent = 'Updating picklist via Tooling API...';
    statusEl.className = 'status-message loading';

    console.log('[Picklist Management] Starting Tooling API update for', selectedUpdateObject, selectedUpdateField);

    // Build values array from CSV data (Label + API Name format)
    const valuesToUpdate = previewData.csvValues.map(csvValue => ({
      fullName: csvValue.fullName,
      label: csvValue.label,
      default: null // Always null as per requirements
    }));

    console.log('[Picklist Management] Values to update:', valuesToUpdate);

    // Call service worker to handle Tooling API update
    const response = await chrome.runtime.sendMessage({
      action: 'UPDATE_PICKLIST_VALUES',
      objectName: selectedUpdateObject,
      fieldName: selectedUpdateField,
      values: valuesToUpdate,
      overwrite: false // Always append mode with Tooling API
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to update picklist values');
    }

    console.log('[Picklist Management] Update successful:', response.data);

    statusEl.textContent = `✓ Picklist updated successfully! ${valuesToUpdate.length} values processed.`;
    statusEl.className = 'status-message success';

    setTimeout(() => {
      resetPicklistLoader();
    }, 3000);

  } catch (error) {
    console.error('[Picklist Management] Update failed:', error);

    let errorMessage = error.message;
    if (errorMessage.includes('Session expired') || errorMessage.includes('INVALID_SESSION_ID')) {
      errorMessage = 'Session expired. Please refresh the Salesforce page and try again.';
    } else if (errorMessage.includes('INVALID_TYPE')) {
      errorMessage = 'This field cannot be updated via Tooling API. It may be a standard field or use a StandardValueSet.';
    } else if (errorMessage.includes('Cannot deserialize')) {
      errorMessage = 'Invalid data format. Please check your CSV values.';
    }

    statusEl.textContent = `Error: ${errorMessage}`;
    statusEl.className = 'status-message error';
    deployBtn.disabled = false;
  }
}

function downloadZipFile(zipBlob, filename) {
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log('[Picklist Management] ZIP package downloaded:', filename);
}

function resetPicklistLoader() {
  selectedUpdateObject = null;
  selectedUpdateField = null;
  currentFieldMetadata = null;
  previewData = null;

  document.getElementById('updateObjectSelect').value = '';
  document.getElementById('updateFieldSelect').innerHTML = '<option value="">-- Select Field --</option>';
  document.getElementById('updateFieldSelect').disabled = true;
  document.getElementById('csvTextarea').value = '';
  document.getElementById('overwriteCheckbox').checked = false;
  document.getElementById('previewChangesBtn').disabled = true;
  document.getElementById('downloadCurrentBtn').disabled = true;
  document.getElementById('previewArea').classList.add('hidden');
  document.getElementById('updatePicklistStatus').textContent = '';
  document.getElementById('updatePicklistStatus').className = 'status-message';
}

// ============================================
// SECTION 4: DEPENDENCY LOADER
// ============================================

function setupDependencyLoaderListeners() {
  document.getElementById('unlockDependencyBtn')?.addEventListener('click', unlockDependencyLoader);
  document.getElementById('depsObjectSelect')?.addEventListener('change', handleDepsLoaderObjectChange);
  document.getElementById('depsDependencySelect')?.addEventListener('change', handleDependencySelectionChange);
  document.getElementById('depsTextarea')?.addEventListener('input', updateDepsPreviewButtonState);
  document.getElementById('downloadCurrentDepsBtn')?.addEventListener('click', downloadCurrentDependencies);
  document.getElementById('previewDepsChangesBtn')?.addEventListener('click', previewDependencyChanges);
  document.getElementById('deployDependencyBtn')?.addEventListener('click', deployDependencyChanges);
  document.getElementById('showDebugInfoBtn')?.addEventListener('click', toggleDebugInfo);
}

async function loadDependencyLoaderData() {
  // Check if unlocked
  if (!isUnlocked) {
    document.getElementById('dependencyUnlockSection').classList.remove('hidden');
    document.getElementById('dependencyLoaderContent').classList.add('hidden');
  } else {
    document.getElementById('dependencyUnlockSection').classList.add('hidden');
    document.getElementById('dependencyLoaderContent').classList.remove('hidden');

    // Load objects for dependency loader
    await loadDependencyObjects();
  }
}

async function loadDependencyObjects() {
  const selectEl = document.getElementById('depsObjectSelect');

  if (!selectEl) {
    console.error('[Picklist Management] depsObjectSelect element not found!');
    return;
  }

  try {
    console.log('[Picklist Management] Loading objects for dependency loader...');
    console.log('[Picklist Management] Select element found:', selectEl);

    const objects = await SalesforceAPI.getObjects();
    console.log('[Picklist Management] Fetched', objects.length, 'total objects');

    const filteredObjects = objects
      .filter(obj => {
        const excludeSuffixes = ['History', 'Share', 'Feed', 'Event', 'ChangeEvent'];
        return !excludeSuffixes.some(suffix => obj.name.endsWith(suffix));
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    console.log('[Picklist Management] Filtered to', filteredObjects.length, 'objects');

    selectEl.innerHTML = '<option value="">-- Select Object --</option>';

    filteredObjects.forEach((obj, index) => {
      const option = document.createElement('option');
      option.value = obj.name;
      option.textContent = `${obj.label} (${obj.name})`;
      selectEl.appendChild(option);

      // Log first few to verify
      if (index < 3) {
        console.log('[Picklist Management] Added option:', obj.name, obj.label);
      }
    });

    console.log('[Picklist Management] Successfully loaded', filteredObjects.length, 'objects for dependency loader');
    console.log('[Picklist Management] Select element now has', selectEl.options.length, 'options');
  } catch (error) {
    console.error('[Picklist Management] Error loading objects for dependency loader:', error);
    if (selectEl) {
      selectEl.innerHTML = '<option value="">Error loading objects</option>';
    }
  }
}

async function handleDepsLoaderObjectChange(e) {
  const objectName = e.target.value;

  const dependencySelect = document.getElementById('depsDependencySelect');
  const dependencyInfoSection = document.getElementById('dependencyInfoSection');
  const downloadBtn = document.getElementById('downloadCurrentDepsBtn');
  const previewBtn = document.getElementById('previewDepsChangesBtn');

  // Reset state
  selectedDependency = null;
  currentObjectMetadata = null;
  dependencySelect.innerHTML = '<option value="">-- Select Dependency --</option>';
  dependencySelect.disabled = true;
  dependencyInfoSection.classList.add('hidden');
  downloadBtn.disabled = true;
  previewBtn.disabled = true;

  if (!objectName) return;

  try {
    console.log('[Picklist Management] Loading dependencies for:', objectName);

    const session = await SessionManager.getCurrentSession();
    const metadata = await MetadataAPI.readObject(session, objectName);

    currentObjectMetadata = metadata;
    console.log('[Picklist Management] Metadata loaded:', metadata);

    // Find all fields with dependencies (fields that have a controllingField)
    const dependentFields = metadata.fields.filter(f => f.valueSet?.controllingField);

    if (dependentFields.length === 0) {
      dependencySelect.innerHTML = '<option value="">No dependencies found</option>';
      return;
    }

    // Populate dependency dropdown
    dependencySelect.innerHTML = '<option value="">-- Select Dependency --</option>';
    dependentFields.forEach((field, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `${field.valueSet.controllingField} → ${field.fullName}`;
      option.dataset.fieldData = JSON.stringify(field);
      dependencySelect.appendChild(option);
    });

    dependencySelect.disabled = false;
    console.log('[Picklist Management] Found', dependentFields.length, 'dependencies');

  } catch (error) {
    console.error('[Picklist Management] Error loading dependencies:', error);
    dependencySelect.innerHTML = '<option value="">Error loading dependencies</option>';
  }
}

function handleDependencySelectionChange(e) {
  const dependencyIndex = e.target.value;
  const dependencyInfoSection = document.getElementById('dependencyInfoSection');
  const downloadBtn = document.getElementById('downloadCurrentDepsBtn');

  if (!dependencyIndex) {
    selectedDependency = null;
    dependencyInfoSection.classList.add('hidden');
    downloadBtn.disabled = true;
    updateDepsPreviewButtonState();
    return;
  }

  const option = e.target.options[e.target.selectedIndex];
  selectedDependency = JSON.parse(option.dataset.fieldData);

  // Show dependency info
  document.getElementById('infoControllingField').textContent = selectedDependency.valueSet.controllingField;
  document.getElementById('infoDependentField').textContent = selectedDependency.fullName;
  dependencyInfoSection.classList.remove('hidden');

  downloadBtn.disabled = false;
  updateDepsPreviewButtonState();

  console.log('[Picklist Management] Selected dependency:', selectedDependency);
}

function updateDepsPreviewButtonState() {
  const csvText = document.getElementById('depsTextarea').value.trim();
  const previewBtn = document.getElementById('previewDepsChangesBtn');

  previewBtn.disabled = !selectedDependency || !csvText;
}

async function downloadCurrentDependencies() {
  if (!selectedDependency) return;

  try {
    const rows = [['ControllingValue', 'DependentValue']];

    const valueSettings = selectedDependency.valueSet.valueSettings || [];

    valueSettings.forEach(vs => {
      rows.push([vs.controllingFieldValue, vs.valueName]);
    });

    const csvContent = rows.map(row =>
      row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return '"' + cellStr.replace(/"/g, '""') + '"';
        }
        return cellStr;
      }).join(',')
    ).join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `current-dependencies-${selectedDependency.valueSet.controllingField}-${selectedDependency.fullName}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('[Picklist Management] Current dependencies downloaded');
  } catch (error) {
    console.error('[Picklist Management] Error downloading current dependencies:', error);
  }
}

function parseDependencyCSV(csvText) {
  const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);

  // Check if first line is header
  const firstLine = lines[0] || '';
  const hasHeader = firstLine.toLowerCase().includes('controlling') || firstLine.toLowerCase().includes('dependent');
  const startIndex = hasHeader ? 1 : 0;

  // Determine separator based on selected format
  const formatSelector = document.querySelector('input[name="depsFormat"]:checked');
  const format = formatSelector ? formatSelector.value : 'csv';
  const separator = format === 'excel' ? '\t' : ',';

  console.log('[Picklist Management] Parsing with format:', format, 'separator:', separator === '\t' ? 'TAB' : 'COMMA');

  const mappings = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    // Parse based on format (CSV or tab-separated)
    const parts = line.split(separator).map(part => {
      let value = part.trim();
      // Handle quoted values (common in CSV)
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/""/g, '"');
      }
      return value;
    });

    if (parts.length >= 2 && parts[0] && parts[1]) {
      mappings.push({
        controllingValue: parts[0],
        dependentValue: parts[1]
      });
    }
  }

  console.log('[Picklist Management] Parsed', mappings.length, 'mappings');
  return mappings;
}

async function previewDependencyChanges() {
  const statusEl = document.getElementById('dependencyLoaderStatus');
  const previewBtn = document.getElementById('previewDepsChangesBtn');
  const previewArea = document.getElementById('depsPreviewArea');
  const previewContent = document.getElementById('depsPreviewContent');

  try {
    previewBtn.disabled = true;
    statusEl.textContent = 'Analyzing changes...';
    statusEl.className = 'status-message loading';

    const csvText = document.getElementById('depsTextarea').value;
    const csvMappings = parseDependencyCSV(csvText);

    if (csvMappings.length === 0) {
      throw new Error('No valid mappings found in CSV');
    }

    const currentMappings = selectedDependency.valueSet.valueSettings || [];

    // Compare current vs CSV
    const toAdd = [];
    const toRemove = [];
    const existing = [];

    csvMappings.forEach(csvMapping => {
      const found = currentMappings.find(cm =>
        cm.controllingFieldValue === csvMapping.controllingValue &&
        cm.valueName === csvMapping.dependentValue
      );

      if (!found) {
        toAdd.push(csvMapping);
      } else {
        existing.push(csvMapping);
      }
    });

    currentMappings.forEach(currentMapping => {
      const found = csvMappings.find(cm =>
        cm.controllingValue === currentMapping.controllingFieldValue &&
        cm.dependentValue === currentMapping.valueName
      );

      if (!found) {
        toRemove.push({
          controllingValue: currentMapping.controllingFieldValue,
          dependentValue: currentMapping.valueName
        });
      }
    });

    depsPreviewData = {
      csvMappings,
      toAdd,
      toRemove,
      existing
    };

    renderDepsPreview(previewContent, depsPreviewData);

    previewArea.classList.remove('hidden');
    statusEl.textContent = '';
    statusEl.className = 'status-message';

    const deployBtn = document.getElementById('deployDependencyBtn');
    if (deployBtn) deployBtn.disabled = false;

  } catch (error) {
    console.error('[Picklist Management] Preview failed:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status-message error';
  } finally {
    previewBtn.disabled = false;
  }
}

function renderDepsPreview(container, data) {
  let html = `<div class="info-message" style="margin-bottom: 15px; padding: 10px; background: #e3f2fd; border-left: 4px solid #2196F3; border-radius: 4px;">
    <strong>ℹ️ Append-Only Mode:</strong> Salesforce dependencies are append-only. This will add new mappings to existing ones. To remove mappings, you must do so manually in Salesforce Setup.
  </div>`;

  if (data.toAdd.length > 0) {
    html += `
      <div class="preview-section create">
        <h4>✓ Add New Mappings <span class="preview-count">(${data.toAdd.length})</span></h4>
        <div class="preview-values">
          ${data.toAdd.map(m => `<span class="preview-value">${escapeHtml(m.controllingValue)} → ${escapeHtml(m.dependentValue)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  if (data.existing.length > 0) {
    html += `
      <div class="preview-section keep">
        <h4>= Unchanged Mappings <span class="preview-count">(${data.existing.length})</span></h4>
        <div class="preview-values">
          ${data.existing.slice(0, 10).map(m => `<span class="preview-value">${escapeHtml(m.controllingValue)} → ${escapeHtml(m.dependentValue)}</span>`).join('')}
          ${data.existing.length > 10 ? `<span class="preview-value">... and ${data.existing.length - 10} more</span>` : ''}
        </div>
      </div>
    `;
  }

  if (data.toAdd.length === 0 && data.toRemove.length === 0) {
    html += `<p style="text-align: center; color: var(--brand-color-text-muted);">No changes detected</p>`;
  }

  container.innerHTML = html;
}

function toggleDebugInfo() {
  const debugArea = document.getElementById('debugInfoArea');
  const btn = document.getElementById('showDebugInfoBtn');

  if (debugArea.classList.contains('hidden')) {
    debugArea.classList.remove('hidden');
    btn.innerHTML = '<span class="material-symbols-rounded">visibility_off</span> Hide Request Details';
  } else {
    debugArea.classList.add('hidden');
    btn.innerHTML = '<span class="material-symbols-rounded">bug_report</span> Show Request Details';
  }
}

function populateDebugInfo(fieldId, requestBody, instanceUrl) {
  const debugUrl = document.getElementById('debugUrl');
  const debugBody = document.getElementById('debugBody');

  const fullUrl = `${instanceUrl}/services/data/v59.0/tooling/sobjects/CustomField/${fieldId}`;
  debugUrl.textContent = `PATCH ${fullUrl}`;
  debugBody.textContent = JSON.stringify(requestBody, null, 2);

  console.log('[Picklist Management] Debug info populated:', {
    url: fullUrl,
    body: requestBody
  });
}

async function deployDependencyChanges() {
  const statusEl = document.getElementById('dependencyLoaderStatus');
  const deployBtn = document.getElementById('deployDependencyBtn');

  try {
    deployBtn.disabled = true;
    statusEl.textContent = 'Validating dependency values...';
    statusEl.className = 'status-message loading';

    console.log('[Picklist Management] Starting dependency update via REST API');
    console.log('[Picklist Management] Selected dependency structure:', selectedDependency);

    const objectName = document.getElementById('depsObjectSelect').value;
    const controllingField = selectedDependency.valueSet.controllingField;
    const dependentField = selectedDependency.fullName;

    console.log('[Picklist Management] Object:', objectName);
    console.log('[Picklist Management] Controlling field:', controllingField);
    console.log('[Picklist Management] Dependent field:', dependentField);

    // Build valueSettings array from CSV mappings
    const valueSettings = depsPreviewData.csvMappings.map(m => ({
      controllingFieldValue: Array.isArray(m.controllingValue) ? m.controllingValue : [m.controllingValue],
      valueName: m.dependentValue
    }));

    console.log('[Picklist Management] Value settings to deploy:', valueSettings);

    // Check if this is a global value set
    const hasValueSetName = selectedDependency.valueSet?.valueSetName;
    const valueSetName = hasValueSetName || null;

    // Build mappings for validation (flatten controllingFieldValue arrays)
    const mappingsForValidation = [];
    valueSettings.forEach(vs => {
      vs.controllingFieldValue.forEach(cfv => {
        mappingsForValidation.push({
          controllingValue: cfv,
          dependentValue: vs.valueName
        });
      });
    });

    console.log('[Picklist Management] Mappings for validation:', mappingsForValidation);

    // Build field metadata for API call
    const fieldMetadata = {
      label: selectedDependency.label,
      controllingField: controllingField,
      restricted: true,
      valueSetName: valueSetName,
      required: selectedDependency.required || false,
      trackFeedHistory: selectedDependency.trackFeedHistory || false,
      trackHistory: selectedDependency.trackHistory || false,
      trackTrending: selectedDependency.trackTrending || false,
      valueSettings: valueSettings
    };

    console.log('[Picklist Management] Field metadata:', JSON.stringify(fieldMetadata, null, 2));

    statusEl.textContent = 'Updating dependencies via Tooling API...';

    // Call the new REST API endpoint via service worker
    const response = await chrome.runtime.sendMessage({
      action: 'UPDATE_FIELD_DEPENDENCIES',
      objectName: objectName,
      dependentField: dependentField,
      controllingField: controllingField,
      mappings: mappingsForValidation,
      fieldMetadata: fieldMetadata
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to update dependencies');
    }

    console.log('[Picklist Management] Update successful:', response.data);

    // Populate debug info with actual field ID and instance URL from response
    if (response.data.fieldId && response.data.instanceUrl) {
      // Build the request body that was sent (for debug display)
      const fullName = `${objectName}.${dependentField}`;
      const debugRequestBody = {
        Metadata: {
          label: fieldMetadata.label,
          type: 'Picklist',
          required: fieldMetadata.required,
          trackFeedHistory: fieldMetadata.trackFeedHistory,
          trackHistory: fieldMetadata.trackHistory,
          trackTrending: fieldMetadata.trackTrending,
          valueSet: {
            controllingField: fieldMetadata.controllingField,
            restricted: fieldMetadata.restricted,
            valueSetDefinition: fieldMetadata.valueSetName ? null : undefined,
            valueSetName: fieldMetadata.valueSetName,
            valueSettings: valueSettings
          }
        },
        FullName: fullName
      };

      populateDebugInfo(response.data.fieldId, debugRequestBody, response.data.instanceUrl);
    }

    statusEl.textContent = '✓ Dependencies updated successfully!';
    statusEl.className = 'status-message success';

    setTimeout(() => {
      resetDependencyLoader();
    }, 3000);

  } catch (error) {
    console.error('[Picklist Management] Update failed:', error);

    let errorMessage = error.message;

    // Handle specific error types
    if (errorMessage.includes('Session expired') || errorMessage.includes('INVALID_SESSION_ID')) {
      errorMessage = 'Session expired. Please refresh the Salesforce page and try again.';
    } else if (errorMessage.includes('Missing controlling field values') || errorMessage.includes('Missing dependent field values')) {
      // Validation errors - show as-is with details
      errorMessage = 'Validation failed:\n' + errorMessage;
    } else if (errorMessage.includes('Global Picklist') || errorMessage.includes('StandardValueSet')) {
      // Global value set errors - show as-is
      errorMessage = errorMessage;
    } else if (errorMessage.includes('INVALID_CROSS_REFERENCE_KEY')) {
      errorMessage = 'One or more picklist values do not exist in the controlling or dependent field. Please check your CSV data.';
    }

    statusEl.textContent = `Error: ${errorMessage}`;
    statusEl.className = 'status-message error';
    deployBtn.disabled = false;
  }
}

function resetDependencyLoader() {
  selectedDependency = null;
  currentObjectMetadata = null;
  depsPreviewData = null;

  document.getElementById('depsObjectSelect').value = '';
  document.getElementById('depsDependencySelect').innerHTML = '<option value="">-- Select Dependency --</option>';
  document.getElementById('depsDependencySelect').disabled = true;
  document.getElementById('dependencyInfoSection').classList.add('hidden');
  document.getElementById('depsTextarea').value = '';
  document.getElementById('downloadCurrentDepsBtn').disabled = true;
  document.getElementById('previewDepsChangesBtn').disabled = true;
  document.getElementById('depsPreviewArea').classList.add('hidden');
  document.getElementById('dependencyLoaderStatus').textContent = '';
  document.getElementById('dependencyLoaderStatus').className = 'status-message';
}

// ============================================
// PICKLIST LOADER UNLOCK FUNCTIONS
// ============================================

async function showPicklistLoaderUnlock() {
  // Switch to picklist loader tab and show unlock form
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  document.querySelector('[data-tab="picklist-loader"]').classList.add('active');
  document.getElementById('picklist-loader').classList.add('active');

  document.getElementById('picklistLoaderUnlockSection').classList.remove('hidden');
  document.getElementById('picklistLoaderContent').classList.add('hidden');
}

async function unlockPicklistLoader() {
  const password = document.getElementById('picklistLoaderPassword').value;
  const statusEl = document.getElementById('picklistLoaderUnlockStatus');
  const unlockBtn = document.getElementById('unlockPicklistLoaderBtn');

  if (!password) {
    statusEl.textContent = 'Please enter a password';
    statusEl.className = 'status-message error';
    return;
  }

  try {
    unlockBtn.disabled = true;
    statusEl.textContent = 'Validating...';
    statusEl.className = 'status-message loading';

    // Use the same password as Dependency Loader
    const validKey = 'DOT-DEPS-2024';

    if (password === validKey) {
      isPicklistLoaderUnlocked = true;
      await chrome.storage.session.set({ picklistLoaderUnlocked: true });

      statusEl.textContent = '✓ Unlocked successfully!';
      statusEl.className = 'status-message success';

      setTimeout(async () => {
        document.getElementById('picklistLoaderUnlockSection').classList.add('hidden');
        document.getElementById('picklistLoaderContent').classList.remove('hidden');
        document.getElementById('picklistLoaderPassword').value = '';
        statusEl.textContent = '';

        // Remove lock icon from tab
        const lockIcon = document.querySelector('[data-tab="picklist-loader"] .lock-icon');
        if (lockIcon) lockIcon.style.display = 'none';

        // Load objects after showing the content
        console.log('[Picklist Management] Loading objects after picklist loader unlock...');
        await loadPicklistLoaderData();
      }, 1000);
    } else {
      throw new Error('Invalid password');
    }
  } catch (error) {
    console.error('[Picklist Management] Picklist Loader unlock failed:', error);
    statusEl.textContent = 'Invalid password. Access denied.';
    statusEl.className = 'status-message error';
    unlockBtn.disabled = false;
  }
}

// ============================================
// DEPENDENCY LOADER UNLOCK FUNCTIONS
// ============================================

async function showDependencyLoaderUnlock() {
  // Switch to dependency loader tab and show unlock form
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  document.querySelector('[data-tab="dependency-loader"]').classList.add('active');
  document.getElementById('dependency-loader').classList.add('active');

  document.getElementById('dependencyUnlockSection').classList.remove('hidden');
  document.getElementById('dependencyLoaderContent').classList.add('hidden');
}

async function unlockDependencyLoader() {
  const password = document.getElementById('dependencyPassword').value;
  const statusEl = document.getElementById('unlockStatus');
  const unlockBtn = document.getElementById('unlockDependencyBtn');

  if (!password) {
    statusEl.textContent = 'Please enter a password';
    statusEl.className = 'status-message error';
    return;
  }

  try {
    unlockBtn.disabled = true;
    statusEl.textContent = 'Validating...';
    statusEl.className = 'status-message loading';

    // Simple password validation - can be enhanced with more secure method
    const validKey = 'DOT-DEPS-2024';

    if (password === validKey) {
      isUnlocked = true;
      await chrome.storage.session.set({ dependencyLoaderUnlocked: true });

      statusEl.textContent = '✓ Unlocked successfully!';
      statusEl.className = 'status-message success';

      setTimeout(async () => {
        document.getElementById('dependencyUnlockSection').classList.add('hidden');
        document.getElementById('dependencyLoaderContent').classList.remove('hidden');
        document.getElementById('dependencyPassword').value = '';
        statusEl.textContent = '';

        // Remove lock icon from tab
        const lockIcon = document.querySelector('[data-tab="dependency-loader"] .lock-icon');
        if (lockIcon) lockIcon.style.display = 'none';

        // Load objects after showing the content
        console.log('[Picklist Management] Loading objects after unlock...');
        await loadDependencyObjects();
      }, 1000);
    } else {
      throw new Error('Invalid password');
    }
  } catch (error) {
    console.error('[Picklist Management] Unlock failed:', error);
    statusEl.textContent = 'Invalid password. Access denied.';
    statusEl.className = 'status-message error';
    unlockBtn.disabled = false;
  }
}
