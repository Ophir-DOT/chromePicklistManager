// Import API client - runs in popup extension context, can make fetch calls with headers
import SalesforceAPI from '../background/api-client.js';
import MetadataAPI from '../background/metadata-api.js';
import ToolingAPI from '../background/tooling-api.js';
import SessionManager from '../background/session-manager.js';

// Global state
let allObjects = [];
let selectedObjects = new Set();
let filteredObjects = [];

// Dependencies view state
let allDepsObjects = [];
let selectedDepsObject = null;
let filteredDepsObjects = [];

// Update Picklist view state
let updateObjects = [];
let selectedUpdateObject = null;
let selectedUpdateField = null;
let currentFieldMetadata = null;
let previewData = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await checkConnection();
  await checkForUpdates();
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

  // Update Picklist view buttons
  document.getElementById('backFromUpdateBtn').addEventListener('click', showMainView);
  document.getElementById('updateObjectSelect').addEventListener('change', handleUpdateObjectChange);
  document.getElementById('updateFieldSelect').addEventListener('change', handleUpdateFieldChange);
  document.getElementById('csvTextarea').addEventListener('input', handleCSVInput);
  document.getElementById('previewChangesBtn').addEventListener('click', previewPicklistChanges);
  document.getElementById('deployPicklistBtn').addEventListener('click', deployPicklistChanges);
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
  document.getElementById('updatePicklistView').classList.add('hidden');
  document.getElementById('mainView').classList.remove('hidden');

  // Reset state
  selectedObjects.clear();
  allObjects = [];
  filteredObjects = [];

  // Reset dependencies state
  selectedDepsObject = null;
  allDepsObjects = [];
  filteredDepsObjects = [];

  // Reset update picklist state
  resetUpdatePicklistView();
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

function downloadZipFile(zipBlob, filename) {
  // Download ZIP file for user inspection before deployment
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log('[Popup] ZIP package downloaded:', filename);
}

async function handleCompare() {
  alert('Compare functionality: Upload two exports to compare them.\n\nFor full compare features, use the sidepanel interface.');
}

async function handleDeploy() {
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('updatePicklistView').classList.remove('hidden');
  await loadUpdateObjects();
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

// ============================================================================
// UPDATE PICKLIST VALUES VIEW
// ============================================================================

async function loadUpdateObjects() {
  const selectEl = document.getElementById('updateObjectSelect');

  try {
    console.log('[Popup] Loading objects for update picklist...');

    const objects = await SalesforceAPI.getObjects();

    // Filter out History and Share objects
    updateObjects = objects
      .filter(obj => {
        const excludeSuffixes = ['History', 'Share', 'Feed', 'Event', 'ChangeEvent'];
        return !excludeSuffixes.some(suffix => obj.name.endsWith(suffix));
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    // Populate dropdown
    selectEl.innerHTML = '<option value="">-- Select Object --</option>';
    updateObjects.forEach(obj => {
      const option = document.createElement('option');
      option.value = obj.name;
      option.textContent = `${obj.label} (${obj.name})`;
      selectEl.appendChild(option);
    });

    console.log('[Popup] Loaded', updateObjects.length, 'objects');
  } catch (error) {
    console.error('[Popup] Error loading objects:', error);
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
  const previewArea = document.getElementById('previewArea');

  // Reset field selection and preview
  fieldSelect.innerHTML = '<option value="">-- Select Field --</option>';
  fieldSelect.disabled = true;
  previewBtn.disabled = true;
  previewArea.classList.add('hidden');

  if (!objectName) {
    return;
  }

  try {
    // Load picklist fields for this object
    const metadata = await SalesforceAPI.getObjectMetadata(objectName);

    // Filter to only picklist and multipicklist fields
    const picklistFields = metadata.fields.filter(f =>
      f.type === 'picklist' || f.type === 'multipicklist'
    );

    if (picklistFields.length === 0) {
      fieldSelect.innerHTML = '<option value="">No picklist fields found</option>';
      return;
    }

    // Populate field dropdown
    fieldSelect.innerHTML = '<option value="">-- Select Field --</option>';
    picklistFields.forEach(field => {
      const option = document.createElement('option');
      option.value = field.name;
      option.textContent = `${field.label} (${field.name})`;
      option.dataset.fieldData = JSON.stringify(field);
      fieldSelect.appendChild(option);
    });

    fieldSelect.disabled = false;
    console.log('[Popup] Loaded', picklistFields.length, 'picklist fields');
  } catch (error) {
    console.error('[Popup] Error loading fields:', error);
    fieldSelect.innerHTML = '<option value="">Error loading fields</option>';
  }
}

function handleUpdateFieldChange(e) {
  const fieldName = e.target.value;
  selectedUpdateField = fieldName;
  previewData = null;

  const previewArea = document.getElementById('previewArea');
  previewArea.classList.add('hidden');

  if (fieldName && e.target.selectedIndex > 0) {
    const option = e.target.options[e.target.selectedIndex];
    currentFieldMetadata = JSON.parse(option.dataset.fieldData);
    console.log('[Popup] Selected field:', fieldName, currentFieldMetadata);
  } else {
    currentFieldMetadata = null;
  }

  updatePreviewButtonState();
}

function handleCSVInput() {
  updatePreviewButtonState();
}

function updatePreviewButtonState() {
  const csvText = document.getElementById('csvTextarea').value.trim();
  const previewBtn = document.getElementById('previewChangesBtn');

  previewBtn.disabled = !selectedUpdateObject || !selectedUpdateField || !csvText;
}

function parseCSV(csvText) {
  const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);

  // Skip header row if it contains "PicklistValue" (case-insensitive)
  const firstLine = lines[0] || '';
  const startIndex = firstLine.toLowerCase().includes('picklistvalue') ? 1 : 0;

  // Extract values
  const values = lines.slice(startIndex).map(line => {
    // Handle CSV escaping (simple implementation)
    let value = line.trim();

    // Remove surrounding quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/""/g, '"');
    }

    return value;
  }).filter(v => v); // Remove empty values

  // Remove duplicates (case-insensitive)
  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const lower = value.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(value);
    }
  }

  return unique;
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

    // Parse CSV
    const csvText = document.getElementById('csvTextarea').value;
    const csvValues = parseCSV(csvText);

    if (csvValues.length === 0) {
      throw new Error('No valid values found in CSV');
    }

    // Get current picklist values from Salesforce
    const currentValues = currentFieldMetadata.picklistValues || [];
    const currentActiveValues = currentValues.filter(v => v.active).map(v => v.value);
    const allCurrentValues = currentValues.map(v => v.value.toLowerCase());

    // Categorize values
    const toCreate = [];
    const toActivate = [];
    const toDeactivate = [];
    const alreadyActive = [];

    const overwrite = document.getElementById('overwriteCheckbox').checked;

    // Check each CSV value
    csvValues.forEach(value => {
      const valueLower = value.toLowerCase();
      const existingIndex = allCurrentValues.indexOf(valueLower);

      if (existingIndex === -1) {
        // Value doesn't exist - will be created
        toCreate.push(value);
      } else {
        const existingValue = currentValues[existingIndex];
        if (!existingValue.active) {
          // Value exists but is inactive - will be activated
          toActivate.push(existingValue.value);
        } else {
          // Value is already active
          alreadyActive.push(existingValue.value);
        }
      }
    });

    // If overwrite mode, find values to deactivate
    if (overwrite) {
      const csvValuesLower = csvValues.map(v => v.toLowerCase());
      currentActiveValues.forEach(value => {
        if (!csvValuesLower.includes(value.toLowerCase())) {
          toDeactivate.push(value);
        }
      });
    }

    // Store preview data
    previewData = {
      csvValues,
      toCreate,
      toActivate,
      toDeactivate,
      alreadyActive,
      overwrite
    };

    // Render preview
    renderPreview(previewContent, previewData);

    previewArea.classList.remove('hidden');
    statusEl.textContent = '';
    statusEl.className = 'status-message';

  } catch (error) {
    console.error('[Popup] Preview failed:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status-message error';
  } finally {
    previewBtn.disabled = false;
  }
}

function renderPreview(container, data) {
  let html = '';

  // CREATE section
  if (data.toCreate.length > 0) {
    html += `
      <div class="preview-section create">
        <h4>✓ Create New Values <span class="preview-count">(${data.toCreate.length})</span></h4>
        <div class="preview-values">
          ${data.toCreate.map(v => `<span class="preview-value">${escapeHtml(v)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // ACTIVATE section
  if (data.toActivate.length > 0) {
    html += `
      <div class="preview-section activate">
        <h4>↑ Activate Existing Values <span class="preview-count">(${data.toActivate.length})</span></h4>
        <div class="preview-values">
          ${data.toActivate.map(v => `<span class="preview-value">${escapeHtml(v)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // DEACTIVATE section
  if (data.toDeactivate.length > 0) {
    html += `
      <div class="preview-section deactivate">
        <h4>↓ Deactivate Values <span class="preview-count">(${data.toDeactivate.length})</span></h4>
        <div class="preview-values">
          ${data.toDeactivate.map(v => `<span class="preview-value">${escapeHtml(v)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // KEEP ACTIVE section
  if (data.alreadyActive.length > 0) {
    html += `
      <div class="preview-section keep">
        <h4>= Already Active <span class="preview-count">(${data.alreadyActive.length})</span></h4>
        <div class="preview-values">
          ${data.alreadyActive.slice(0, 10).map(v => `<span class="preview-value">${escapeHtml(v)}</span>`).join('')}
          ${data.alreadyActive.length > 10 ? `<span class="preview-value">... and ${data.alreadyActive.length - 10} more</span>` : ''}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function deployPicklistChanges() {
  const statusEl = document.getElementById('updatePicklistStatus');
  const deployBtn = document.getElementById('deployPicklistBtn');

  try {
    deployBtn.disabled = true;
    statusEl.textContent = 'Building deployment package...';
    statusEl.className = 'status-message loading';

    console.log('[Popup] Starting Metadata API deployment for', selectedUpdateObject, selectedUpdateField);

    // Get current session
    const session = await SessionManager.getCurrentSession();

    // Build values array for deployment
    const valuesToDeploy = [];
    const currentValues = currentFieldMetadata.picklistValues || [];
    const csvValuesLower = previewData.csvValues.map(v => v.toLowerCase());

    console.log('[Popup] Current values count:', currentValues.length);
    console.log('[Popup] CSV values count:', previewData.csvValues.length);
    console.log('[Popup] Overwrite mode:', previewData.overwrite);

    if (previewData.overwrite) {
      // OVERWRITE MODE: Only deploy CSV values (both new and existing that match CSV)
      console.log('[Popup] Overwrite mode: deploying ONLY CSV values');

      // For each CSV value, find if it exists or create new
      previewData.csvValues.forEach(csvValue => {
        const csvLower = csvValue.toLowerCase();
        const existing = currentValues.find(v => v.value.toLowerCase() === csvLower);

        if (existing) {
          // Use existing value (keep its label)
          valuesToDeploy.push({
            fullName: existing.value,
            label: existing.label || existing.value,
            default: existing.defaultValue || false
          });
        } else {
          // New value
          valuesToDeploy.push({
            fullName: csvValue,
            label: csvValue,
            default: false
          });
        }
      });

    } else {
      // APPEND MODE: Keep all existing active values + add CSV values
      console.log('[Popup] Append mode: keeping existing active values + adding CSV values');

      // First, add all currently active values
      currentValues.forEach(existing => {
        if (existing.active) {
          valuesToDeploy.push({
            fullName: existing.value,
            label: existing.label || existing.value,
            default: existing.defaultValue || false
          });
        }
      });

      // Then add new CSV values that don't already exist
      previewData.toCreate.forEach(newValue => {
        valuesToDeploy.push({
          fullName: newValue,
          label: newValue,
          default: false
        });
      });

      // Finally, add CSV values that exist but are inactive (to activate them)
      previewData.toActivate.forEach(valueToActivate => {
        const existing = currentValues.find(v => v.value.toLowerCase() === valueToActivate.toLowerCase());
        if (existing) {
          valuesToDeploy.push({
            fullName: existing.value,
            label: existing.label || existing.value,
            default: existing.defaultValue || false
          });
        }
      });
    }

    console.log('[Popup] Total values to deploy:', valuesToDeploy.length);
    console.log('[Popup] Values breakdown:', {
      create: previewData.toCreate.length,
      activate: previewData.toActivate.length,
      deactivate: previewData.toDeactivate.length,
      keep: previewData.alreadyActive.length
    });

    // Build metadata changes object
    const metadataChanges = {
      [selectedUpdateObject]: {
        [selectedUpdateField]: {
          label: currentFieldMetadata.label,
          type: currentFieldMetadata.type === 'multipicklist' ? 'MultiselectPicklist' : 'Picklist',
          restricted: true,
          values: valuesToDeploy
        }
      }
    };

    // Generate ZIP package
    statusEl.textContent = 'Generating deployment package...';
    const zipBlob = await MetadataAPI.buildDeployPackageBlob(metadataChanges);

    // Download ZIP for user inspection
    const timestamp = Date.now();
    const zipFilename = `metadata-deploy-${selectedUpdateObject}-${selectedUpdateField}-${timestamp}.zip`;
    downloadZipFile(zipBlob, zipFilename);

    statusEl.textContent = '✓ Package downloaded! Review the ZIP file, then confirm deployment.';
    statusEl.className = 'status-message success';

    // Ask user to confirm deployment
    const confirmDeploy = confirm(
      'Deployment package has been downloaded.\n\n' +
      'Please review the ZIP file contents.\n\n' +
      'Click OK to deploy to Salesforce, or Cancel to abort.'
    );

    if (!confirmDeploy) {
      statusEl.textContent = 'Deployment cancelled. You can review the downloaded package.';
      statusEl.className = 'status-message';
      deployBtn.disabled = false;
      return;
    }

    // User confirmed - proceed with deployment
    statusEl.textContent = 'Deploying to Salesforce...';
    statusEl.className = 'status-message loading';

    const deployId = await MetadataAPI.deploy(session, metadataChanges);
    console.log('[Popup] Deployment started:', deployId);

    // Poll for deployment status
    statusEl.textContent = `Deployment in progress (ID: ${deployId})...`;

    let attempts = 0;
    const maxAttempts = 30; // 30 attempts x 2 seconds = 60 seconds max

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

      const status = await MetadataAPI.checkDeployStatus(session, deployId);
      console.log('[Popup] Deployment status:', status);

      if (status.done) {
        if (status.success) {
          statusEl.textContent = '✓ Deployment successful! Exporting results...';
          statusEl.className = 'status-message success';

          // Export CSV with final state
          await exportUpdatedPicklist();

          // Reset view after a delay
          setTimeout(() => {
            resetUpdatePicklistView();
            statusEl.textContent = '';
          }, 3000);
          return;
        } else {
          throw new Error(status.errorMessage || 'Deployment failed');
        }
      }

      attempts++;
      statusEl.textContent = `Deploying... (${status.numberComponentsDeployed || 0}/${status.numberComponentsTotal || 0} components)`;
    }

    throw new Error('Deployment timeout - please check Salesforce deployment status');

  } catch (error) {
    console.error('[Popup] Deployment failed:', error);

    // Provide user-friendly error messages
    let errorMessage = error.message;

    if (errorMessage.includes('Session expired')) {
      errorMessage = 'Session expired. Please refresh the Salesforce page and try again.';
    } else if (errorMessage.includes('timeout')) {
      errorMessage = 'Deployment is taking longer than expected. Check Salesforce setup for deployment status.';
    }

    statusEl.textContent = `Error: ${errorMessage}`;
    statusEl.className = 'status-message error';
    deployBtn.disabled = false;
  }
}

async function exportUpdatedPicklist() {
  try {
    // Fetch updated metadata
    const metadata = await SalesforceAPI.getObjectMetadata(selectedUpdateObject);
    const field = metadata.fields.find(f => f.name === selectedUpdateField);

    if (!field) {
      throw new Error('Field not found after deployment');
    }

    // Build CSV
    const rows = [
      ['Object API Name', 'Field API Name', 'Picklist Value', 'Active', 'Default']
    ];

    const values = field.picklistValues || [];
    values.forEach(value => {
      rows.push([
        selectedUpdateObject,
        selectedUpdateField,
        value.label,
        value.active ? 'true' : 'false',
        value.defaultValue ? 'true' : 'false'
      ]);
    });

    // Convert to CSV with BOM
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
    a.download = `picklist-values-${selectedUpdateObject}-${selectedUpdateField}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('[Popup] Updated picklist CSV exported');
  } catch (error) {
    console.error('[Popup] Error exporting updated picklist:', error);
    // Don't throw - deployment was successful, export is optional
  }
}

function resetUpdatePicklistView() {
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
  document.getElementById('previewArea').classList.add('hidden');
  document.getElementById('updatePicklistStatus').textContent = '';
  document.getElementById('updatePicklistStatus').className = 'status-message';
}

// ============================================================================
// UPDATE CHECKER
// ============================================================================

async function checkForUpdates() {
  try {
    // Get update status from storage (set by background worker)
    const result = await chrome.storage.local.get([
      'updateAvailable',
      'latestVersion',
      'downloadUrl'
    ]);

    if (result.updateAvailable) {
      showUpdateBanner(result.latestVersion, result.downloadUrl);
    }
  } catch (error) {
    console.error('[Popup] Error checking for updates:', error);
    // Silently fail - don't disrupt user experience
  }
}

function showUpdateBanner(version, downloadUrl) {
  const banner = document.getElementById('updateBanner');
  const versionSpan = document.getElementById('updateVersion');
  const downloadBtn = document.getElementById('downloadUpdateBtn');
  const dismissBtn = document.getElementById('dismissUpdateBtn');

  versionSpan.textContent = `Version ${version} is ready`;
  banner.classList.remove('hidden');

  // Download button handler
  downloadBtn.onclick = () => {
    chrome.tabs.create({ url: downloadUrl });
  };

  // Dismiss button handler
  dismissBtn.onclick = () => {
    banner.classList.add('hidden');
  };
}
