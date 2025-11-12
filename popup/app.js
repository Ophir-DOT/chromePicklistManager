// Import API client - runs in popup extension context, can make fetch calls with headers
import SalesforceAPI from '../background/api-client.js';
import MetadataAPI from '../background/metadata-api.js';
import SessionManager from '../background/session-manager.js';

// Global state
let allObjects = [];
let selectedObjects = new Set();
let filteredObjects = [];

// Dependencies view state
let allDepsObjects = [];
let selectedDepsObject = null;
let filteredDepsObjects = [];

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await checkConnection();
  setupEventListeners();
});

async function checkConnection() {
  const statusIndicator = document.querySelector('.status-indicator');
  const statusText = document.querySelector('.status-text');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      statusIndicator.className = 'status-indicator disconnected';
      statusText.textContent = 'No active tab';
      return;
    }

    // Check if URL is a Salesforce domain (including setup pages)
    const isSalesforce = tab.url.includes('salesforce.com') ||
                         tab.url.includes('force.com') ||
                         tab.url.includes('salesforce-setup.com');

    if (!isSalesforce) {
      statusIndicator.className = 'status-indicator disconnected';
      statusText.textContent = 'Not on Salesforce';
      return;
    }

    // Pass tab info to service worker
    const response = await chrome.runtime.sendMessage({
      action: 'GET_SESSION',
      tabId: tab.id,
      url: tab.url
    });

    if (response.success) {
      statusIndicator.className = 'status-indicator connected';
      statusText.textContent = 'Connected';
      document.getElementById('orgUrl').textContent = response.data.instanceUrl;
    } else {
      statusIndicator.className = 'status-indicator disconnected';
      statusText.textContent = response.error || 'Not connected';
    }
  } catch (error) {
    statusIndicator.className = 'status-indicator disconnected';
    statusText.textContent = 'Error: ' + error.message;
    console.error('Connection check failed:', error);
  }
}

function setupEventListeners() {
  // Main menu buttons
  document.getElementById('exportBtn').addEventListener('click', showExportView);
  document.getElementById('exportDepsBtn').addEventListener('click', showExportDepsView);
  document.getElementById('compareBtn').addEventListener('click', handleCompare);
  document.getElementById('deployBtn').addEventListener('click', handleDeploy);

  // Export view buttons
  document.getElementById('backBtn').addEventListener('click', showMainView);
  document.getElementById('selectAllBtn').addEventListener('click', selectAllObjects);
  document.getElementById('clearBtn').addEventListener('click', clearSelection);
  document.getElementById('doExportBtn').addEventListener('click', doExport);
  document.getElementById('objectSearch').addEventListener('input', handleSearch);

  // Export Dependencies view buttons
  document.getElementById('backFromDepsBtn').addEventListener('click', showMainView);
  document.getElementById('doExportDepsBtn').addEventListener('click', doExportDeps);
  document.getElementById('depsObjectSearch').addEventListener('input', handleDepsSearch);
}

async function showExportView() {
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('exportView').classList.remove('hidden');

  // Load objects
  await loadObjects();
}

function showMainView() {
  document.getElementById('exportView').classList.add('hidden');
  document.getElementById('exportDepsView').classList.add('hidden');
  document.getElementById('mainView').classList.remove('hidden');

  // Reset state
  selectedObjects.clear();
  allObjects = [];
  filteredObjects = [];

  // Reset dependencies state
  selectedDepsObject = null;
  allDepsObjects = [];
  filteredDepsObjects = [];
}

async function loadObjects() {
  const loadingEl = document.getElementById('loadingObjects');
  const listEl = document.getElementById('objectList');

  try {
    loadingEl.style.display = 'block';
    listEl.innerHTML = '';

    console.log('[Popup] Loading objects directly from popup context...');

    // Call API directly from popup - this works because popup runs in extension context
    // Unlike service workers, extension HTML pages CAN make fetch() calls with custom headers
    const objects = await SalesforceAPI.getObjects();

    console.log('[Popup] Successfully loaded', objects.length, 'objects');

    // Filter out History and Share objects (system objects that rarely have picklists)
    allObjects = objects
      .filter(obj => {
        // Exclude objects ending with History, Share, Feed, or Event
        const excludeSuffixes = ['History', 'Share', 'Feed', 'Event', 'ChangeEvent'];
        return !excludeSuffixes.some(suffix => obj.name.endsWith(suffix));
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    console.log('[Popup] Filtered to', allObjects.length, 'objects (excluded History, Share, Feed, Event, ChangeEvent)');

    filteredObjects = [...allObjects];
    renderObjects(filteredObjects);
  } catch (error) {
    console.error('[Popup] Error loading objects:', error);
    listEl.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
  } finally {
    loadingEl.style.display = 'none';
  }
}

function renderObjects(objects) {
  const listEl = document.getElementById('objectList');
  listEl.innerHTML = '';

  if (objects.length === 0) {
    listEl.innerHTML = '<div class="no-results">No objects found</div>';
    return;
  }

  objects.forEach(obj => {
    const item = document.createElement('label');
    item.className = 'object-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = obj.name;
    checkbox.checked = selectedObjects.has(obj.name);
    checkbox.addEventListener('change', (e) => handleObjectSelection(e, obj.name));

    const text = document.createElement('span');
    text.textContent = `${obj.label} (${obj.name})`;

    item.appendChild(checkbox);
    item.appendChild(text);
    listEl.appendChild(item);
  });
}

function handleObjectSelection(e, objectName) {
  if (e.target.checked) {
    selectedObjects.add(objectName);
  } else {
    selectedObjects.delete(objectName);
  }
  updateSelectionInfo();
}

function updateSelectionInfo() {
  const count = selectedObjects.size;
  document.getElementById('selectionInfo').textContent = `${count} object${count !== 1 ? 's' : ''} selected`;
  document.getElementById('doExportBtn').disabled = count === 0;
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase();

  if (!query) {
    filteredObjects = [...allObjects];
  } else {
    filteredObjects = allObjects.filter(obj =>
      obj.name.toLowerCase().includes(query) ||
      obj.label.toLowerCase().includes(query)
    );
  }

  renderObjects(filteredObjects);
}

function selectAllObjects() {
  filteredObjects.forEach(obj => selectedObjects.add(obj.name));
  renderObjects(filteredObjects);
  updateSelectionInfo();
}

function clearSelection() {
  selectedObjects.clear();
  renderObjects(filteredObjects);
  updateSelectionInfo();
}

async function doExport() {
  const statusEl = document.getElementById('exportStatus');
  const exportBtn = document.getElementById('doExportBtn');

  try {
    exportBtn.disabled = true;
    statusEl.textContent = 'Exporting picklist metadata...';
    statusEl.className = 'status-message loading';

    console.log('[Popup] Starting export for', selectedObjects.size, 'objects');

    const exportData = {
      exportDate: new Date().toISOString(),
      objects: {}
    };

    let completed = 0;
    const total = selectedObjects.size;

    // Export each selected object
    for (const objectName of selectedObjects) {
      try {
        statusEl.textContent = `Exporting ${objectName}... (${completed + 1}/${total})`;

        console.log('[Popup] Fetching metadata for:', objectName);

        // Get object metadata using REST API (has picklist info)
        const metadata = await SalesforceAPI.getObjectMetadata(objectName);

        // Extract picklist fields
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
        console.log('[Popup] Completed:', objectName, '- Found', Object.keys(picklistFields).length, 'picklist fields');

      } catch (error) {
        console.error('[Popup] Error exporting', objectName, ':', error);
        exportData.objects[objectName] = {
          error: error.message
        };
      }
    }

    // Download CSV file only
    downloadCSV(exportData, `picklist-export-${Date.now()}.csv`);

    statusEl.textContent = `✓ Export completed! ${total} objects exported to CSV.`;
    statusEl.className = 'status-message success';

    console.log('[Popup] Export complete:', exportData);

    // Reset after 3 seconds
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
    }, 3000);

  } catch (error) {
    console.error('[Popup] Export failed:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status-message error';
  } finally {
    exportBtn.disabled = selectedObjects.size === 0;
  }
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCSV(exportData, filename) {
  // Convert export data to CSV format
  // Format: One row per picklist value (simplified view)

  const rows = [];

  // Add header row
  rows.push(['Object API Name', 'Object Label', 'Field API Name', 'Field Label', 'Picklist Value']);

  // Add data rows - one row per picklist value
  for (const [objectName, objectData] of Object.entries(exportData.objects)) {
    if (objectData.error) {
      // Show error row
      rows.push([objectName, objectData.error, '', '', '']);
      continue;
    }

    const objectLabel = objectData.label || objectName;
    const picklistFields = objectData.picklistFields || {};

    // If no picklist fields, still show the object
    if (Object.keys(picklistFields).length === 0) {
      rows.push([objectName, objectLabel, '(No picklist fields)', '', '']);
      continue;
    }

    // Add a row for EACH picklist value
    for (const [fieldName, fieldData] of Object.entries(picklistFields)) {
      const activeValues = fieldData.values.filter(v => v.active);

      if (activeValues.length === 0) {
        // Field has no active values
        rows.push([
          objectName,
          objectLabel,
          fieldName,
          fieldData.label,
          '(No active values)'
        ]);
      } else {
        // One row per value
        for (const value of activeValues) {
          rows.push([
            objectName,
            objectLabel,
            fieldName,
            fieldData.label,
            value.label
          ]);
        }
      }
    }
  }

  // Convert to CSV string
  const csvContent = rows.map(row =>
    row.map(cell => {
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const cellStr = String(cell || '');
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return '"' + cellStr.replace(/"/g, '""') + '"';
      }
      return cellStr;
    }).join(',')
  ).join('\n');

  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log('[Popup] CSV downloaded:', filename, 'Rows:', rows.length);
}

async function handleCompare() {
  alert('Compare functionality: Upload two exports to compare them.\n\nFor full compare features, use the sidepanel interface.');
}

async function handleDeploy() {
  alert('Deploy functionality: Upload a modified JSON file to deploy.\n\nFor full deploy features, use the sidepanel interface.');
}

// ============================================================================
// EXPORT DEPENDENCIES VIEW
// ============================================================================

async function showExportDepsView() {
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('exportDepsView').classList.remove('hidden');

  // Load objects
  await loadDepsObjects();
}

async function loadDepsObjects() {
  const loadingEl = document.getElementById('loadingDepsObjects');
  const listEl = document.getElementById('depsObjectList');

  try {
    loadingEl.style.display = 'block';
    listEl.innerHTML = '';

    console.log('[Popup] Loading objects for dependencies export...');

    // Call API directly from popup
    const objects = await SalesforceAPI.getObjects();

    console.log('[Popup] Successfully loaded', objects.length, 'objects');

    // Filter out History and Share objects (same as picklist export)
    allDepsObjects = objects
      .filter(obj => {
        const excludeSuffixes = ['History', 'Share', 'Feed', 'Event', 'ChangeEvent'];
        return !excludeSuffixes.some(suffix => obj.name.endsWith(suffix));
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    console.log('[Popup] Filtered to', allDepsObjects.length, 'objects (excluded History, Share, Feed, Event, ChangeEvent)');

    filteredDepsObjects = [...allDepsObjects];
    renderDepsObjects(filteredDepsObjects);
  } catch (error) {
    console.error('[Popup] Error loading objects:', error);
    listEl.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
  } finally {
    loadingEl.style.display = 'none';
  }
}

function renderDepsObjects(objects) {
  const listEl = document.getElementById('depsObjectList');
  listEl.innerHTML = '';

  if (objects.length === 0) {
    listEl.innerHTML = '<div class="no-results">No objects found</div>';
    return;
  }

  objects.forEach(obj => {
    const item = document.createElement('label');
    item.className = 'object-item';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'depsObject';
    radio.value = obj.name;
    radio.checked = selectedDepsObject === obj.name;
    radio.addEventListener('change', (e) => handleDepsObjectSelection(e, obj.name));

    const text = document.createElement('span');
    text.textContent = `${obj.label} (${obj.name})`;

    item.appendChild(radio);
    item.appendChild(text);
    listEl.appendChild(item);
  });
}

function handleDepsObjectSelection(e, objectName) {
  if (e.target.checked) {
    selectedDepsObject = objectName;
  }
  updateDepsSelectionInfo();
}

function updateDepsSelectionInfo() {
  const hasSelection = selectedDepsObject !== null;
  const infoText = hasSelection ? `Selected: ${selectedDepsObject}` : 'No object selected';
  document.getElementById('depsSelectionInfo').textContent = infoText;
  document.getElementById('doExportDepsBtn').disabled = !hasSelection;
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

async function doExportDeps() {
  const statusEl = document.getElementById('exportDepsStatus');
  const exportBtn = document.getElementById('doExportDepsBtn');

  try {
    exportBtn.disabled = true;
    statusEl.textContent = 'Exporting field dependencies...';
    statusEl.className = 'status-message loading';

    console.log('[Popup] Starting field dependencies export for:', selectedDepsObject);

    // Get current session
    const session = await SessionManager.getCurrentSession();

    // Call Metadata API directly from popup (DOMParser is available here)
    const metadata = await MetadataAPI.readObject(session, selectedDepsObject);

    console.log('[Popup] Metadata retrieved:', metadata);

    // Extract field dependencies
    const fieldDependencies = extractDependencies(metadata);
    const recordTypeDeps = extractRecordTypePicklists(metadata);

    const exportData = {
      object: selectedDepsObject,
      fields: fieldDependencies,
      recordTypes: recordTypeDeps
    };

    console.log('[Popup] Field dependencies data:', exportData);

    // Download CSV file only
    downloadDependenciesCSV(exportData, `field-dependencies-${selectedDepsObject}-${Date.now()}.csv`);

    statusEl.textContent = `✓ Field dependencies exported for ${selectedDepsObject}!`;
    statusEl.className = 'status-message success';

    // Reset after 3 seconds
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
    }, 3000);

  } catch (error) {
    console.error('[Popup] Field dependencies export failed:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status-message error';
  } finally {
    exportBtn.disabled = selectedDepsObject === null;
  }
}

// Extract controlling/dependent picklist relationships from metadata
function extractDependencies(metadata) {
  const dependencies = [];

  metadata.fields
    .filter(f => f.valueSet?.controllingField)
    .forEach(field => {
      const mappings = field.valueSet.valueSettings.map(vs => ({
        controllingValue: vs.controllingFieldValue,
        dependentValue: vs.valueName
      }));

      dependencies.push({
        dependentField: field.fullName,
        controllingField: field.valueSet.controllingField,
        mappings: mappings
      });
    });

  return dependencies;
}

// Extract record type specific picklist values
function extractRecordTypePicklists(metadata) {
  return metadata.recordTypes.map(rt => ({
    recordType: rt.fullName,
    label: rt.label,
    picklistValues: rt.picklistValues.map(pv => ({
      picklist: pv.picklist,
      values: pv.values.map(v => v.fullName)
    }))
  }));
}

// Download field dependencies as CSV
function downloadDependenciesCSV(exportData, filename) {
  const rows = [];

  // Add header row with Type column
  rows.push(['Object API Name', 'Type', 'Record Type', 'Picklist Field', 'Dependent Field', 'Controlling Field', 'Controlling Value', 'Dependent Value']);

  // Add field dependency rows - one row per mapping
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
          mapping.controllingValue,
          mapping.dependentValue
        ]);
      }
    } else {
      // No mappings found
      rows.push([
        exportData.object,
        'Field Dependency',
        '',
        '',
        fieldDep.dependentField,
        fieldDep.controllingField,
        '(No mappings)',
        ''
      ]);
    }
  }

  // If no field dependencies found
  if (exportData.fields.length === 0) {
    rows.push([exportData.object, 'Field Dependency', '', '', '(No field dependencies)', '', '', '']);
  }

  // Add record type picklist rows - one row per value per picklist per record type
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
                '',
                value
              ]);
            }
          } else {
            // No values for this picklist
            rows.push([
              exportData.object,
              'Record Type Picklist',
              recordType.recordType,
              picklistValue.picklist,
              '',
              '',
              '',
              '(No values)'
            ]);
          }
        }
      }
    }
  }

  // Convert to CSV string
  const csvContent = rows.map(row =>
    row.map(cell => {
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const cellStr = String(cell || '');
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return '"' + cellStr.replace(/"/g, '""') + '"';
      }
      return cellStr;
    }).join(',')
  ).join('\n');

  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log('[Popup] Dependencies CSV downloaded:', filename, 'Rows:', rows.length);
}
