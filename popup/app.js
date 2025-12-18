// Import API client - runs in popup extension context, can make fetch calls with headers
import { escapeHtml } from '../shared/utils.js';
import SalesforceAPI from '../background/api-client.js';
import MetadataAPI from '../background/metadata-api.js';
import ToolingAPI from '../background/tooling-api.js';
import SessionManager from '../background/session-manager.js';
import HealthCheckAPI from '../background/health-check-api.js';
import ThemeManager from '../background/theme-manager.js';

// Global state
let allObjects = [];
let selectedObjects = new Set();
let filteredObjects = [];

// Dependencies view state
let allDepsObjects = [];
let selectedDepsObject = null;
let filteredDepsObjects = [];
let parsedDepsData = null; // For import

// Update Picklist view state
let updateObjects = [];
let selectedUpdateObject = null;
let selectedUpdateField = null;
let currentFieldMetadata = null;
let previewData = null;

// Global state for current page context
let currentPageContext = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize theme first for smooth UX
  await ThemeManager.initTheme();

  // Display version from manifest
  displayVersion();

  await checkConnection();
  await checkForUpdates();
  await updateCheckShareFilesButton();
  await updateCheckApprovalProcessButton();
  setupEventListeners();
});

// Display version from manifest.json
function displayVersion() {
  const manifest = chrome.runtime.getManifest();
  const versionElement = document.querySelector('footer small');
  if (versionElement) {
    versionElement.textContent = `v${manifest.version}`;
  }
}

async function checkConnection() {
  const statusIndicator = document.querySelector('.status-indicator');
  const statusText = document.querySelector('.status-text');
  let isConnected = false;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      statusIndicator.className = 'status-indicator disconnected';
      statusText.textContent = 'No active tab';
      disableAllFeatures('No active tab detected');
      return;
    }

    // Check if URL is a Salesforce domain (including setup pages)
    const isSalesforce = tab.url.includes('salesforce.com') ||
                         tab.url.includes('force.com') ||
                         tab.url.includes('salesforce-setup.com');

    if (!isSalesforce) {
      statusIndicator.className = 'status-indicator disconnected';
      statusText.textContent = 'Not on Salesforce';
      document.getElementById('orgUrl').textContent = 'N/A';
      disableAllFeatures('Please open this extension from a Salesforce tab');
      return;
    }

    // Pass tab info to service worker
    const response = await chrome.runtime.sendMessage({
      action: 'GET_SESSION',
      tabId: tab.id,
      url: tab.url
    });

    if (response.success && response.data && !response.data.error) {
      statusIndicator.className = 'status-indicator connected';
      statusText.textContent = 'Connected';
      document.getElementById('orgUrl').textContent = response.data.instanceUrl;
      isConnected = true;
      enableAllFeatures();
    } else {
      const errorMsg = response.data?.message || response.error || 'Not connected';
      statusIndicator.className = 'status-indicator disconnected';
      statusText.textContent = errorMsg;
      document.getElementById('orgUrl').textContent = 'N/A';
      disableAllFeatures(errorMsg);
    }
  } catch (error) {
    statusIndicator.className = 'status-indicator disconnected';
    statusText.textContent = 'Error: ' + error.message;
    document.getElementById('orgUrl').textContent = 'N/A';
    console.error('Connection check failed:', error);
    disableAllFeatures('Connection error: ' + error.message);
  }
}

/**
 * Disable all feature buttons and show warning message
 */
function disableAllFeatures(reason) {
  const featureButtons = [
    'picklistManagementBtn',
    'healthCheckBtn', 'checkShareFilesBtn', 'checkApprovalProcessBtn', 'batchJobMonitorBtn',
    'validationRulesBtn', 'permissionComparisonBtn', 'orgCompareBtn',
    'deploymentHistoryBtn', 'exportFieldsBtn'
  ];

  featureButtons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.disabled = true;
      btn.classList.add('disabled');
      btn.title = reason || 'Not connected to Salesforce';
    }
  });

  console.log('[Popup] All features disabled:', reason);
}

/**
 * Enable all feature buttons
 */
function enableAllFeatures() {
  const featureButtons = [
    'picklistManagementBtn',
    'healthCheckBtn', 'checkShareFilesBtn', 'checkApprovalProcessBtn', 'batchJobMonitorBtn',
    'validationRulesBtn', 'permissionComparisonBtn', 'orgCompareBtn',
    'deploymentHistoryBtn', 'exportFieldsBtn'
  ];

  featureButtons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('disabled');
      btn.title = '';
    }
  });

  console.log('[Popup] All features enabled');
}

function setupEventListeners() {
  // Main menu buttons
  document.getElementById('picklistManagementBtn').addEventListener('click', handlePicklistManagement);
  document.getElementById('healthCheckBtn').addEventListener('click', handleHealthCheck);
  document.getElementById('checkShareFilesBtn').addEventListener('click', handleCheckShareFiles);
  document.getElementById('checkApprovalProcessBtn').addEventListener('click', handleCheckApprovalProcess);
  document.getElementById('batchJobMonitorBtn').addEventListener('click', handleBatchJobMonitor);
  document.getElementById('validationRulesBtn').addEventListener('click', handleValidationRules);
  document.getElementById('permissionComparisonBtn').addEventListener('click', handlePermissionComparison);
  document.getElementById('orgCompareBtn').addEventListener('click', handleOrgCompare);
  document.getElementById('recordMigratorBtn').addEventListener('click', handleRecordMigrator);
  document.getElementById('deploymentHistoryBtn').addEventListener('click', handleDeploymentHistory);
  document.getElementById('exportFieldsBtn').addEventListener('click', handleExportFields);
  document.getElementById('settingsBtn').addEventListener('click', handleSettings);

  // Share Files view buttons
  document.getElementById('backFromShareFilesBtn').addEventListener('click', showMainView);

  // Approval Process view buttons
  document.getElementById('backFromApprovalProcessBtn').addEventListener('click', showMainView);
}

//Handler for new unified Picklist Management page
function handlePicklistManagement() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('pages/picklist-management/picklist-management.html')
  });
}

// ============================================
// DEPRECATED: OLD PICKLIST MANAGEMENT FUNCTIONS
// These functions have been migrated to pages/picklist-management/
// Keeping them here temporarily for reference/rollback if needed
// TODO: Remove in future version after stable release
// ============================================

async function showExportView() {
  // DEPRECATED: This function is no longer used
  // Picklist Management is now a full-page tool
  console.warn('[Popup] showExportView is deprecated - use Picklist Management button instead');
  return;

  /* Original code kept for reference
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('exportView').classList.remove('hidden');

  // Load objects
  await loadObjects();
  */
}

function showMainView() {
  document.getElementById('shareFilesView').classList.add('hidden');
  document.getElementById('approvalProcessView').classList.add('hidden');
  document.getElementById('mainView').classList.remove('hidden');
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
    listEl.innerHTML = `<div class="error-message">Error: ${escapeHtml(error.message)}</div>`;
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

async function showPicklistLoader() {
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('updatePicklistView').classList.remove('hidden');
  await loadUpdateObjects();
}

async function showDependencyLoader() {
  // Check if Dependency Loader is unlocked
  const isUnlocked = await checkDependencyLoaderUnlock();

  if (!isUnlocked) {
    // Prompt for password
    const password = prompt('Dependency Loader is locked.\n\nThis feature is experimental and not fully validated.\nEnter the unlock key to continue:');

    if (!password) {
      return; // User cancelled
    }

    // Validate password (simple hash check)
    const validPassword = await validateDependencyLoaderPassword(password);

    if (!validPassword) {
      alert('Invalid unlock key. Access denied.');
      return;
    }

    // Store unlock state for this session
    await chrome.storage.session.set({ dependencyLoaderUnlocked: true });
  }

  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('dependencyLoaderView').classList.remove('hidden');

  // Reset dependency loader state
  parsedDepsData = null;
  document.getElementById('depsFileInput').value = '';
  document.getElementById('importDepsBtn').disabled = true;
  document.getElementById('importDepsPreview').classList.add('hidden');
  document.getElementById('importDepsStatus').textContent = '';
  document.getElementById('importDepsStatus').className = 'status-message';
}

async function checkDependencyLoaderUnlock() {
  try {
    const result = await chrome.storage.session.get('dependencyLoaderUnlocked');
    return result.dependencyLoaderUnlocked === true;
  } catch (error) {
    console.error('[Popup] Error checking dependency loader unlock:', error);
    return false;
  }
}

async function validateDependencyLoaderPassword(password) {
  // Simple password validation
  // The unlock key is "DOT-DEPS-2024" (can be changed)
  const validKey = 'DOT-DEPS-2024';
  return password === validKey;
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
    listEl.innerHTML = `<div class="error-message">Error: ${escapeHtml(error.message)}</div>`;
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
// IMPORT DEPENDENCIES
// ============================================================================

async function handleDepsFileUpload(e) {
  const file = e.target.files[0];
  const importBtn = document.getElementById('importDepsBtn');
  const statusEl = document.getElementById('importDepsStatus');
  const previewEl = document.getElementById('importDepsPreview');

  if (!file) {
    importBtn.disabled = true;
    previewEl.classList.add('hidden');
    return;
  }

  try {
    statusEl.textContent = 'Parsing CSV file...';
    statusEl.className = 'status-message loading';

    console.log('[Popup] Parsing dependencies CSV file:', file.name);

    const csvText = await file.text();
    const parsed = parseDependenciesCSV(csvText);

    console.log('[Popup] Parsed dependencies data:', parsed);

    parsedDepsData = parsed;
    importBtn.disabled = false;
    statusEl.textContent = `✓ File loaded: ${parsed.totalRows} rows parsed`;
    statusEl.className = 'status-message success';

  } catch (error) {
    console.error('[Popup] Error parsing CSV:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status-message error';
    importBtn.disabled = true;
    parsedDepsData = null;
  }
}

function parseDependenciesCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }

  // Parse header
  const header = parseCSVLine(lines[0]);
  console.log('[Popup] CSV Header:', header);

  // Validate expected columns
  const expectedColumns = ['Object API Name', 'Type', 'Record Type', 'Picklist Field',
                          'Dependent Field', 'Controlling Field', 'Controlling Value', 'Dependent Value'];

  // Map to organize data by object and type
  const objectData = {};

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);

    if (cells.length < 3) continue; // Skip empty lines

    const [objectName, type, recordType, picklistField, dependentField,
           controllingField, controllingValue, dependentValue] = cells;

    if (!objectData[objectName]) {
      objectData[objectName] = {
        fieldDependencies: [],
        recordTypePicklists: []
      };
    }

    if (type === 'Field Dependency' && dependentField && controllingField) {
      // Find existing dependency or create new
      let dep = objectData[objectName].fieldDependencies.find(
        d => d.dependentField === dependentField && d.controllingField === controllingField
      );

      if (!dep) {
        dep = {
          dependentField,
          controllingField,
          mappings: []
        };
        objectData[objectName].fieldDependencies.push(dep);
      }

      if (controllingValue && dependentValue) {
        dep.mappings.push({
          controllingValue,
          dependentValue
        });
      }
    } else if (type === 'Record Type Picklist' && recordType && picklistField && dependentValue) {
      // Find existing record type or create new
      let rt = objectData[objectName].recordTypePicklists.find(r => r.recordType === recordType);

      if (!rt) {
        rt = {
          recordType,
          picklistValues: []
        };
        objectData[objectName].recordTypePicklists.push(rt);
      }

      // Find existing picklist or create new
      let pv = rt.picklistValues.find(p => p.picklist === picklistField);

      if (!pv) {
        pv = {
          picklist: picklistField,
          values: []
        };
        rt.picklistValues.push(pv);
      }

      if (dependentValue && dependentValue !== '(No values)') {
        pv.values.push(dependentValue);
      }
    }
  }

  return {
    objectData,
    totalRows: lines.length - 1
  };
}

function parseCSVLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

async function previewDepsImport() {
  if (!parsedDepsData) return;

  const previewEl = document.getElementById('importDepsPreview');
  const contentEl = document.getElementById('importDepsPreviewContent');
  const statusEl = document.getElementById('importDepsStatus');
  const replaceMode = false; // Always append mode (Salesforce API limitation)

  try {
    statusEl.textContent = 'Loading preview...';
    statusEl.className = 'status-message loading';

    let html = '<div class="preview-summary">';

    // Show mode
    const modeLabel = replaceMode
      ? '<span style="color: #c23934; font-weight: bold;">Replace Mode</span>'
      : '<span style="color: #0176d3; font-weight: bold;">Append Mode</span>';
    html += `<p style="margin-bottom: 12px;">Mode: ${modeLabel}</p>`;

    for (const [objectName, data] of Object.entries(parsedDepsData.objectData)) {
      html += `<div class="preview-object"><strong>${escapeHtml(objectName)}</strong><ul>`;

      if (data.fieldDependencies.length > 0) {
        html += `<li><strong>Field Dependencies:</strong> ${data.fieldDependencies.length} field(s)</li>`;
        for (const dep of data.fieldDependencies) {
          html += `<ul><li>${escapeHtml(dep.dependentField)} → ${escapeHtml(dep.controllingField)} (${dep.mappings.length} mappings)</li></ul>`;
        }
      }

      if (data.recordTypePicklists.length > 0) {
        html += `<li><strong>Record Type Picklists:</strong> ${data.recordTypePicklists.length} record type(s)</li>`;
        for (const rt of data.recordTypePicklists) {
          html += `<ul><li>${escapeHtml(rt.recordType)} (${rt.picklistValues.length} picklist(s))</li></ul>`;
        }
      }

      html += '</ul></div>';
    }

    html += '</div>';

    // Show mode-specific warning
    if (replaceMode) {
      html += '<p class="warning-text">⚠️ Replace Mode: Only CSV dependencies will exist. All other existing dependencies will be REMOVED.</p>';
    } else {
      html += '<p class="warning-text">⚠️ Append Mode: CSV dependencies will be added to existing dependencies. No dependencies will be removed.</p>';
    }

    contentEl.innerHTML = html;
    previewEl.classList.remove('hidden');

    statusEl.textContent = '✓ Preview ready. Review changes and click "Download Package & Deploy" when ready.';
    statusEl.className = 'status-message success';

  } catch (error) {
    console.error('[Popup] Error generating preview:', error);
    statusEl.textContent = `Error: ${escapeHtml(error.message)}`;
    statusEl.className = 'status-message error';
  }
}

async function deployDepsImport() {
  if (!parsedDepsData) return;

  const deployBtn = document.getElementById('deployDepsBtn');
  const statusEl = document.getElementById('importDepsStatus');
  const replaceMode = false; // Always append mode (Salesforce API limitation)

  try {
    deployBtn.disabled = true;
    statusEl.textContent = 'Building deployment package...';
    statusEl.className = 'status-message loading';

    console.log('[Popup] Starting deployment of dependencies... Replace mode:', replaceMode);

    // Get current session
    const session = await SessionManager.getCurrentSession();

    // Build metadata structure for deployment
    const metadataChanges = {};

    for (const [objectName, data] of Object.entries(parsedDepsData.objectData)) {
      console.log(`[Popup] Processing ${objectName}...`);

      // Read current metadata for this object
      const currentMetadata = await MetadataAPI.readObject(session, objectName);

      // Build fields with dependencies
      if (data.fieldDependencies.length > 0) {
        if (!metadataChanges[objectName]) {
          metadataChanges[objectName] = {};
        }

        for (const dep of data.fieldDependencies) {
          // Find the field in current metadata
          const fieldMeta = currentMetadata.fields.find(f => f.fullName === dep.dependentField);

          if (!fieldMeta) {
            console.warn(`[Popup] Field ${dep.dependentField} not found in ${objectName}`);
            continue;
          }

          // Determine value settings based on mode
          let valueSettings;
          if (replaceMode) {
            // Replace mode: only use CSV mappings
            valueSettings = dep.mappings.map(m => ({
              controllingFieldValue: m.controllingValue,
              valueName: m.dependentValue
            }));
            console.log(`[Popup] Replace mode: Using ${valueSettings.length} mappings from CSV for ${dep.dependentField}`);
          } else {
            // Append mode: merge existing + CSV mappings
            const existingSettings = fieldMeta.valueSet?.valueSettings || [];
            const newMappings = dep.mappings.map(m => ({
              controllingFieldValue: m.controllingValue,
              valueName: m.dependentValue
            }));

            // Merge and deduplicate based on controllingFieldValue + valueName
            const merged = [...existingSettings];
            for (const newMapping of newMappings) {
              const exists = merged.some(m =>
                m.controllingFieldValue === newMapping.controllingFieldValue &&
                m.valueName === newMapping.valueName
              );
              if (!exists) {
                merged.push(newMapping);
              }
            }
            valueSettings = merged;
            console.log(`[Popup] Append mode: Merged ${existingSettings.length} existing + ${newMappings.length} new = ${valueSettings.length} total mappings for ${dep.dependentField}`);
          }

          // Keep ALL existing picklist values - we're only updating dependencies, not the values themselves
          const values = fieldMeta.valueSet?.valueSetDefinition?.value || [];

          console.log(`[Popup] Keeping all ${values.length} existing picklist values (only updating dependency mappings)`);

          // Verify that all values referenced in dependencies exist
          if (replaceMode) {
            const referencedValueNames = new Set(valueSettings.map(vs => vs.valueName));
            const existingValueNames = new Set(values.map(v => v.fullName));
            const missingValues = [...referencedValueNames].filter(v => !existingValueNames.has(v));

            if (missingValues.length > 0) {
              console.warn(`[Popup] Warning: The following values are referenced in dependencies but don't exist in the picklist: ${missingValues.join(', ')}`);
              statusEl.textContent += `\n⚠️ Warning: Some dependency values don't exist in the picklist: ${missingValues.join(', ')}`;
            }
          }

          // Build field with dependencies
          metadataChanges[objectName][dep.dependentField] = {
            label: fieldMeta.label,
            type: fieldMeta.type || 'Picklist',
            controllingField: dep.controllingField,
            valueSettings: valueSettings,
            values: values
          };
        }
      }

      // Note: Record Type Picklist updates would require extending MetadataAPI
      // to handle record type metadata separately - this is more complex
      if (data.recordTypePicklists.length > 0) {
        console.warn('[Popup] Record type picklist updates not yet implemented');
        statusEl.textContent = '⚠️ Warning: Record type picklist updates are not yet supported. Only field dependencies will be deployed.';
      }
    }

    console.log('[Popup] Metadata changes prepared:', metadataChanges);

    // Download package for review
    statusEl.textContent = 'Generating deployment package...';
    const zipBlob = await MetadataAPI.buildDeployPackageBlob(metadataChanges);

    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dependencies-deployment-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    statusEl.textContent = '📦 Package downloaded! Review the package, then confirm to deploy...';
    statusEl.className = 'status-message';

    // Confirm deployment
    const confirmed = confirm('Package downloaded. Would you like to deploy it now?');

    if (!confirmed) {
      statusEl.textContent = 'Deployment cancelled.';
      statusEl.className = 'status-message';
      deployBtn.disabled = false;
      return;
    }

    // Deploy
    statusEl.textContent = 'Deploying to Salesforce...';
    statusEl.className = 'status-message loading';

    const deployId = await MetadataAPI.deploy(session, metadataChanges);
    console.log('[Popup] Deployment started:', deployId);

    // Poll for status
    let done = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!done && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const status = await MetadataAPI.checkDeployStatus(session, deployId);
      console.log('[Popup] Deploy status:', status);

      statusEl.textContent = `Deploying... (${status.numberComponentsDeployed}/${status.numberComponentsTotal} components)`;

      done = status.done;

      if (done) {
        if (status.success) {
          statusEl.textContent = `✓ Deployment successful! ${status.numberComponentsDeployed} components deployed.`;
          statusEl.className = 'status-message success';

          // Reset after success
          setTimeout(() => {
            document.getElementById('depsFileInput').value = '';
            document.getElementById('importDepsPreview').classList.add('hidden');
            parsedDepsData = null;
            statusEl.textContent = '';
            statusEl.className = 'status-message';
          }, 3000);

        } else {
          statusEl.textContent = `✗ Deployment failed: ${status.errorMessage || 'Unknown error'}`;
          statusEl.className = 'status-message error';
        }
      }

      attempts++;
    }

    if (!done) {
      statusEl.textContent = '⚠️ Deployment timeout. Check Salesforce deployment status.';
      statusEl.className = 'status-message error';
    }

  } catch (error) {
    console.error('[Popup] Deployment failed:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status-message error';
  } finally {
    deployBtn.disabled = false;
  }
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
  const deployBtn = document.getElementById('deployPicklistBtn');

  // Reset field selection and preview
  fieldSelect.innerHTML = '<option value="">-- Select Field --</option>';
  fieldSelect.disabled = true;
  previewBtn.disabled = true;
  previewArea.classList.add('hidden');

  // Clear any previous deployment state
  if (deployBtn) {
    deployBtn.disabled = true;
  }

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

  // Clear any previous deployment state
  const deployBtn = document.getElementById('deployPicklistBtn');
  if (deployBtn) {
    deployBtn.disabled = true;
  }

  updatePreviewButtonState();
}

function handleCSVInput() {
  // Hide previous preview when CSV changes
  const previewArea = document.getElementById('previewArea');
  if (previewArea && !previewArea.classList.contains('hidden')) {
    previewArea.classList.add('hidden');
    previewData = null;

    // Disable deploy button until new preview is generated
    const deployBtn = document.getElementById('deployPicklistBtn');
    if (deployBtn) {
      deployBtn.disabled = true;
    }
  }

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

    // BUGFIX: Refresh field metadata from Salesforce to get current state
    // This prevents using cached/stale data from previous deployments
    console.log('[Popup] Refreshing field metadata from Salesforce...');
    const metadata = await SalesforceAPI.getObjectMetadata(selectedUpdateObject);
    const field = metadata.fields.find(f => f.name === selectedUpdateField);

    if (!field) {
      throw new Error(`Field ${selectedUpdateField} not found on ${selectedUpdateObject}`);
    }

    // Update cached metadata with fresh data
    currentFieldMetadata = field;
    console.log('[Popup] Field metadata refreshed:', currentFieldMetadata);

    // Get current picklist values from Salesforce (now using fresh metadata)
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
// DOT HEALTH CHECK
// ============================================================================

async function handleHealthCheck() {
  try {
    console.log('[Popup] Starting Progressive DOT Health Check...');

    // Open health check page immediately (no loading overlay)
    const healthCheckUrl = chrome.runtime.getURL('health-check/health-check.html');

    chrome.tabs.create({ url: healthCheckUrl }, (tab) => {
      console.log('[Popup] Progressive health check page opened in tab:', tab.id);
    });

  } catch (error) {
    console.error('[Popup] Failed to open health check:', error);
    alert(`Failed to open health check: ${error.message}`);
  }
}

function handleBatchJobMonitor() {
  try {
    console.log('[Popup] Opening Batch Job Monitor...');

    const batchJobUrl = chrome.runtime.getURL('batch-jobs/batch-jobs.html');

    chrome.tabs.create({ url: batchJobUrl }, (tab) => {
      console.log('[Popup] Batch Job Monitor opened in tab:', tab.id);
    });

  } catch (error) {
    console.error('[Popup] Failed to open Batch Job Monitor:', error);
    alert(`Failed to open Batch Job Monitor: ${error.message}`);
  }
}

function handleValidationRules() {
  try {
    console.log('[Popup] Opening Validation Rules Manager...');

    const validationRulesUrl = chrome.runtime.getURL('validation-rules/validation-rules.html');

    chrome.tabs.create({ url: validationRulesUrl }, (tab) => {
      console.log('[Popup] Validation Rules Manager opened in tab:', tab.id);
    });

  } catch (error) {
    console.error('[Popup] Failed to open Validation Rules Manager:', error);
    alert(`Failed to open Validation Rules Manager: ${error.message}`);
  }
}

function handlePermissionComparison() {
  try {
    console.log('[Popup] Opening Permission Comparison...');

    const permissionComparisonUrl = chrome.runtime.getURL('permissions/permissions.html');

    chrome.tabs.create({ url: permissionComparisonUrl }, (tab) => {
      console.log('[Popup] Permission Comparison opened in tab:', tab.id);
    });

  } catch (error) {
    console.error('[Popup] Failed to open Permission Comparison:', error);
    alert(`Failed to open Permission Comparison: ${error.message}`);
  }
}

function handleOrgCompare() {
  try {
    console.log('[Popup] Opening Org Compare Tool...');

    const orgCompareUrl = chrome.runtime.getURL('org-compare/org-compare.html');

    chrome.tabs.create({ url: orgCompareUrl }, (tab) => {
      console.log('[Popup] Org Compare Tool opened in tab:', tab.id);
    });

  } catch (error) {
    console.error('[Popup] Failed to open Org Compare Tool:', error);
    alert(`Failed to open Org Compare Tool: ${error.message}`);
  }
}

function handleRecordMigrator() {
  try {
    console.log('[Popup] Opening Record Migrator...');

    const recordMigratorUrl = chrome.runtime.getURL('pages/record-migrator/record-migrator.html');

    chrome.tabs.create({ url: recordMigratorUrl }, (tab) => {
      console.log('[Popup] Record Migrator opened in tab:', tab.id);
    });

  } catch (error) {
    console.error('[Popup] Failed to open Record Migrator:', error);
    alert(`Failed to open Record Migrator: ${error.message}`);
  }
}

function handleDeploymentHistory() {
  try {
    console.log('[Popup] Opening Deployment History...');

    const deploymentHistoryUrl = chrome.runtime.getURL('pages/deployment-history/deployment-history.html');

    chrome.tabs.create({ url: deploymentHistoryUrl }, (tab) => {
      console.log('[Popup] Deployment History opened in tab:', tab.id);
    });

  } catch (error) {
    console.error('[Popup] Failed to open Deployment History:', error);
    alert(`Failed to open Deployment History: ${error.message}`);
  }
}

function handleExportFields() {
  try {
    console.log('[Popup] Opening Export Fields...');

    const exportFieldsUrl = chrome.runtime.getURL('export-fields/export-fields.html');

    chrome.tabs.create({ url: exportFieldsUrl }, (tab) => {
      console.log('[Popup] Export Fields opened in tab:', tab.id);
    });

  } catch (error) {
    console.error('[Popup] Failed to open Export Fields:', error);
    alert(`Failed to open Export Fields: ${error.message}`);
  }
}

async function updateCheckShareFilesButton() {
  const button = document.getElementById('checkShareFilesBtn');

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      button.disabled = true;
      return;
    }

    // Ask content script for current page context
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_CURRENT_OBJECT' });

    currentPageContext = response?.context;

    console.log('[Popup] Current page context:', currentPageContext);

    // Enable button only if on CompSuite__Document_Revision__c record page
    if (currentPageContext &&
        currentPageContext.objectName === 'CompSuite__Document_Revision__c' &&
        currentPageContext.isRecordPage &&
        currentPageContext.recordId) {
      button.disabled = false;
      button.title = 'Check file sharing for this document revision';
    } else {
      button.disabled = true;
      button.title = 'Available only on CompSuite__Document_Revision__c record pages';
    }

  } catch (error) {
    console.log('[Popup] Could not get current object context:', error.message);
    button.disabled = true;
  }
}

async function handleCheckShareFiles() {
  try {
    if (!currentPageContext || !currentPageContext.recordId) {
      alert('Error: No record context available');
      return;
    }

    // Navigate to share files view
    document.getElementById('mainView').classList.add('hidden');
    document.getElementById('shareFilesView').classList.remove('hidden');

    const contentEl = document.getElementById('shareFilesContent');
    contentEl.innerHTML = '<div class="loading-message">Loading share information...</div>';

    console.log('[Popup] Checking share files for record:', currentPageContext.recordId);

    // Get current session for org URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const sessionResponse = await chrome.runtime.sendMessage({
      action: 'GET_SESSION',
      tabId: tab.id,
      url: tab.url
    });

    const orgUrl = sessionResponse.success ? sessionResponse.data.instanceUrl : '';

    // Send message to background to run the check
    const response = await chrome.runtime.sendMessage({
      action: 'CHECK_DOCUMENT_REVISION_SHARING',
      recordId: currentPageContext.recordId
    });

    if (response.success) {
      const result = response.data;

      // Display results
      if (result.status === 'success') {
        contentEl.innerHTML = buildShareFilesTable(result.data, orgUrl);
        console.log('[Popup] Share check results:', result);

        // Attach event listener to "Add Missing Links" button if it exists
        const addLinksBtn = document.getElementById('addMissingLinksBtn');
        if (addLinksBtn) {
          addLinksBtn.addEventListener('click', () => handleAddMissingLinks(currentPageContext.recordId));
        }
      } else if (result.status === 'warning') {
        contentEl.innerHTML = `
          <div class="status-message warning">
            <strong>Warning:</strong><br>
            ${escapeHtml(result.message) || 'No files found to check'}
          </div>
        `;
      } else {
        contentEl.innerHTML = `
          <div class="status-message error">
            <strong>Check Failed:</strong><br>
            ${escapeHtml(result.message) || 'Unknown error occurred'}
          </div>
        `;
      }
    } else {
      throw new Error(response.error || 'Unknown error');
    }

  } catch (error) {
    console.error('[Popup] Check share files error:', error);
    const contentEl = document.getElementById('shareFilesContent');
    contentEl.innerHTML = `
      <div class="status-message error">
        Error: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

async function handleAddMissingLinks(recordId) {
  console.log('[Popup] Adding missing links for record:', recordId);

  const statusEl = document.getElementById('addLinksStatus');
  const btn = document.getElementById('addMissingLinksBtn');

  try {
    // Disable button and show loading
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-rounded icon">hourglass_empty</span> Adding Links...';
    statusEl.innerHTML = '<div class="loading-message">Creating missing ContentDocumentLinks...</div>';

    // Send message to background to add missing links
    const response = await chrome.runtime.sendMessage({
      action: 'ADD_MISSING_DOCUMENT_REVISION_LINKS',
      recordId: recordId
    });

    if (response.success) {
      const result = response.data;

      if (result.status === 'success') {
        if (result.created > 0) {
          statusEl.innerHTML = `
            <div class="status-message success">
              <strong>Success!</strong> Created ${result.created} ContentDocumentLink(s) to ${escapeHtml(result.revisionLogName || 'Revision Log')}.
              <br><br>
              <button id="refreshSharesBtn" class="action-button">
                <span class="material-symbols-rounded icon">refresh</span>
                Refresh Shares
              </button>
            </div>
          `;

          // Attach refresh handler
          const refreshBtn = document.getElementById('refreshSharesBtn');
          if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
              handleCheckShareFiles();
            });
          }

          // Hide the "Add Missing Links" button
          btn.style.display = 'none';
        } else {
          statusEl.innerHTML = `
            <div class="status-message success">
              ${escapeHtml(result.message)}
            </div>
          `;
          btn.disabled = false;
          btn.innerHTML = '<span class="material-symbols-rounded icon">add_link</span> Add Missing Links';
        }
      } else if (result.status === 'warning') {
        statusEl.innerHTML = `
          <div class="status-message warning">
            <strong>Warning:</strong> ${escapeHtml(result.message)}
          </div>
        `;
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-rounded icon">add_link</span> Add Missing Links';
      } else {
        throw new Error(result.message || 'Unknown error');
      }
    } else {
      throw new Error(response.error || 'Unknown error');
    }

  } catch (error) {
    console.error('[Popup] Add missing links error:', error);
    statusEl.innerHTML = `
      <div class="status-message error">
        <strong>Error:</strong> ${escapeHtml(error.message)}
      </div>
    `;
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-rounded icon">add_link</span> Add Missing Links';
  }
}

function buildShareFilesTable(data, orgUrl) {
  if (!data || !data.files || data.files.length === 0) {
    return '<div class="no-shares-message">No files found</div>';
  }

  let html = `
    <div class="share-files-info">
      <h3>Document Revision: ${escapeHtml(data.revisionName || 'N/A')}</h3>
      <div class="info-row">
        <span><strong>Record ID:</strong></span>
        <span>${escapeHtml(data.revisionId)}</span>
      </div>
      <div class="info-row">
        <span><strong>State:</strong></span>
        <span>${escapeHtml(data.stateName || 'Unknown')}</span>
      </div>
      <div class="info-row">
        <span><strong>Total Shares:</strong></span>
        <span>${data.totalShares}</span>
      </div>
      <div class="info-row">
        <span><strong>Files:</strong></span>
        <span>${data.files.length}</span>
      </div>
    </div>
  `;

  // Display validation results if available
  if (data.validation) {
    const validation = data.validation;
    if (validation.isValid === true) {
      html += `
        <div class="validation-success">
          <span class="material-symbols-rounded icon">check_circle</span>
          <div>
            <strong>Validation Passed:</strong> All required shares are present for state "${escapeHtml(validation.stateName)}"
          </div>
        </div>
      `;
    } else if (validation.isValid === false) {
      // Check if missing links are for Document Revision Logs
      const hasMissingRevisionLogLinks = validation.issues.some(issue =>
        issue.includes('Document Revision Logs')
      );

      html += `
        <div class="validation-error">
          <span class="material-symbols-rounded icon">error</span>
          <div>
            <strong>Validation Failed:</strong>
            <ul>
              ${validation.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}
            </ul>
            ${hasMissingRevisionLogLinks ? `
              <button id="addMissingLinksBtn" class="action-button" style="margin-top: 12px;">
                <span class="material-symbols-rounded icon">add_link</span>
                Add Missing Links
              </button>
              <div id="addLinksStatus" style="margin-top: 8px;"></div>
            ` : ''}
          </div>
        </div>
      `;
    }

    if (validation.warnings && validation.warnings.length > 0) {
      html += `
        <div class="validation-warning">
          <span class="material-symbols-rounded icon">warning</span>
          <div>
            <strong>Warnings:</strong>
            <ul>
              ${validation.warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    }
  }

  html += '<div class="share-files-table">';

  // Build a table for each file
  data.files.forEach(file => {
    html += `
      <div class="file-section">
        <div class="file-header">
          <span>${escapeHtml(file.title || 'Untitled')}</span>
          <span class="file-type-badge">${escapeHtml(file.type)}</span>
        </div>
        <div class="file-info">
          <strong>Version ID:</strong> ${escapeHtml(file.versionId)} |
          <strong>Document ID:</strong> ${escapeHtml(file.documentId)} |
          <strong>Shares:</strong> ${file.shareCount}
        </div>
    `;

    if (file.shares && file.shares.length > 0) {
      html += `
        <table class="shares-table">
          <thead>
            <tr>
              <th style="width: 35%">Linked Entity ID</th>
              <th style="width: 25%">Object Name</th>
              <th style="width: 20%">Share Type</th>
              <th style="width: 20%">Visibility</th>
            </tr>
          </thead>
          <tbody>
      `;

      file.shares.forEach(share => {
        // Create clickable link to the record
        const recordUrl = orgUrl ? `${orgUrl}/${share.linkedEntityId}` : '#';
        const linkedEntityHtml = orgUrl
          ? `<a href="${recordUrl}" target="_blank" class="entity-link">${escapeHtml(share.linkedEntityId)}</a>`
          : escapeHtml(share.linkedEntityId);

        html += `
          <tr>
            <td>${linkedEntityHtml}</td>
            <td><span class="object-name-badge">${escapeHtml(share.objectName || 'Unknown')}</span></td>
            <td><span class="share-type-badge">${escapeHtml(share.shareType)}</span></td>
            <td><span class="visibility-badge">${escapeHtml(share.visibility)}</span></td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;
    } else {
      html += '<div class="no-shares-message">No shares found for this file</div>';
    }

    html += '</div>';
  });

  html += '</div>';

  return html;
}

function buildApprovalProcessTable(data, orgUrl, pageContext) {
  if (!data || !data.records || data.records.length === 0) {
    return '<div class="no-shares-message">No approval processes found</div>';
  }

  let html = `
    <div class="share-files-info">
      <h3>Approval Processes for Record</h3>
      <div class="info-row">
        <span><strong>Record ID:</strong></span>
        <span>${escapeHtml(pageContext.recordId)}</span>
      </div>
      <div class="info-row">
        <span><strong>Object:</strong></span>
        <span>${escapeHtml(pageContext.objectName || 'Unknown')}</span>
      </div>
      <div class="info-row">
        <span><strong>Total Processes:</strong></span>
        <span>${data.records.length}</span>
      </div>
    </div>
  `;

  html += '<div class="share-files-table">';

  // Build a section for each approval process (similar to file sections)
  data.records.forEach(process => {
    // Status badge
    const status = (process.CompSuite__Status__c || 'N/A').toLowerCase();
    let statusClass = '';
    if (status.includes('approved')) {
      statusClass = 'status-approved';
    } else if (status.includes('pending') || status.includes('submitted')) {
      statusClass = 'status-pending';
    } else if (status.includes('rejected')) {
      statusClass = 'status-rejected';
    }

    // Format date
    let formattedDate = 'N/A';
    if (process.CreatedDate) {
      try {
        const date = new Date(process.CreatedDate);
        formattedDate = date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (error) {
        formattedDate = process.CreatedDate;
      }
    }

    html += `
      <div class="file-section">
        <div class="file-header">
          <span>${escapeHtml(process.Name || 'Untitled')}</span>
          <span class="share-type-badge ${statusClass}">${escapeHtml(process.CompSuite__Status__c || 'N/A')}</span>
        </div>
        <div class="file-info">
          <strong>Created:</strong> ${escapeHtml(formattedDate)} |
          <strong>Process ID:</strong> ${escapeHtml(process.Id)}
        </div>
    `;

    // Build details table
    html += `
        <table class="shares-table">
          <thead>
            <tr>
              <th style="width: 30%">Field</th>
              <th style="width: 70%">Value</th>
            </tr>
          </thead>
          <tbody>
    `;

    // Process record link
    const processUrl = orgUrl ? `${orgUrl}/${process.Id}` : '#';
    const processLink = orgUrl
      ? `<a href="${processUrl}" target="_blank" class="entity-link">${escapeHtml(process.Id)}</a>`
      : escapeHtml(process.Id);

    html += `
            <tr>
              <td><strong>Process Record</strong></td>
              <td>${processLink}</td>
            </tr>
    `;

    // Approval Process Init
    if (process.CompSuite__Approval_Process_Init__r && process.CompSuite__Approval_Process_Init__r.Name) {
      const initUrl = orgUrl ? `${orgUrl}/${process.CompSuite__Approval_Process_Init__c}` : '#';
      const initLink = orgUrl
        ? `<a href="${initUrl}" target="_blank" class="entity-link">${escapeHtml(process.CompSuite__Approval_Process_Init__r.Name)}</a>`
        : escapeHtml(process.CompSuite__Approval_Process_Init__r.Name);

      html += `
            <tr>
              <td><strong>Approval Process Init</strong></td>
              <td>${initLink}</td>
            </tr>
      `;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;
  });

  html += '</div>';

  return html;
}

async function updateCheckApprovalProcessButton() {
  const button = document.getElementById('checkApprovalProcessBtn');

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      button.disabled = true;
      return;
    }

    // Ask content script for current page context
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_CURRENT_OBJECT' });

    const pageContext = response?.context;

    console.log('[Popup] Current page context for approval process:', pageContext);

    // Enable button only if on a record page (any object)
    if (pageContext && pageContext.isRecordPage && pageContext.recordId) {
      button.disabled = false;
      button.title = `Check approval processes for this ${pageContext.objectName || 'record'}`;
    } else {
      button.disabled = true;
      button.title = 'Available only on record pages';
    }

  } catch (error) {
    console.log('[Popup] Could not get current object context:', error.message);
    button.disabled = true;
  }
}

async function handleCheckApprovalProcess() {
  try {
    if (!currentPageContext || !currentPageContext.recordId) {
      alert('Error: No record context available');
      return;
    }

    // Navigate to approval process view
    document.getElementById('mainView').classList.add('hidden');
    document.getElementById('approvalProcessView').classList.remove('hidden');

    const contentEl = document.getElementById('approvalProcessContent');
    contentEl.innerHTML = '<div class="loading-message">Loading approval processes...</div>';

    console.log('[Popup] Checking approval processes for record:', currentPageContext.recordId);

    // Get current session for org URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const sessionResponse = await chrome.runtime.sendMessage({
      action: 'GET_SESSION',
      tabId: tab.id,
      url: tab.url
    });

    const orgUrl = sessionResponse.success ? sessionResponse.data.instanceUrl : '';

    // Send message to background to run the check
    const response = await chrome.runtime.sendMessage({
      action: 'CHECK_APPROVAL_PROCESS',
      recordId: currentPageContext.recordId,
      tabId: tab.id,
      url: tab.url
    });

    if (response.success) {
      const result = response.data;

      // Display results
      if (result.records && result.records.length > 0) {
        contentEl.innerHTML = buildApprovalProcessTable(result, orgUrl, currentPageContext);
        console.log('[Popup] Approval process check results:', result);
      } else {
        contentEl.innerHTML = `
          <div class="status-message warning">
            <strong>No Approval Processes Found</strong><br>
            No approval processes found for this record.
          </div>
        `;
      }
    } else {
      throw new Error(response.error || 'Unknown error');
    }

  } catch (error) {
    console.error('[Popup] Check approval process error:', error);
    const contentEl = document.getElementById('approvalProcessContent');
    contentEl.innerHTML = `
      <div class="status-message error">
        Error: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

function generateHealthCheckReport(results) {
  // Generate HTML report content
  const reportHTML = buildHealthCheckHTML(results);

  // Open in new tab
  const blob = new Blob([reportHTML], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  chrome.tabs.create({ url: url }, (tab) => {
    console.log('[Popup] Health check report opened in new tab:', tab.id);
  });
}

function buildHealthCheckHTML(results) {
  // Build the complete HTML document with inline CSS
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DOT Health Check Report - ${new Date(results.timestamp).toLocaleString()}</title>
  <style>
    ${getHealthCheckCSS()}
  </style>
</head>
<body>
  <div class="container">
    <header class="report-header">
      <h1>DOT Health Check Report</h1>
      <div class="report-meta">
        <div class="meta-item">
          <strong>Org:</strong> ${escapeHtml(results.orgUrl)}
        </div>
        <div class="meta-item">
          <strong>Date:</strong> ${new Date(results.timestamp).toLocaleString()}
        </div>
        <div class="meta-item">
          <strong>Duration:</strong> ${results.duration}s
        </div>
      </div>
      <button id="downloadPdfBtn" class="download-pdf-btn no-print">Download PDF</button>
    </header>

    <div class="checks-grid">
      ${results.checks.map(check => buildCheckTile(check)).join('')}
    </div>

    <footer class="report-footer no-print">
      <p>Generated by DOT Toolkit v1.3.0</p>
    </footer>
  </div>

  <script>
    // PDF Download functionality - wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', function() {
      const downloadBtn = document.getElementById('downloadPdfBtn');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', function() {
          console.log('Download PDF button clicked - opening print dialog');
          window.print();
        });
        console.log('PDF download button listener attached successfully');
      } else {
        console.error('Download PDF button not found in DOM');
      }
    });
  </script>
</body>
</html>`;

  return html;
}

function buildCheckTile(check) {
  let statusClass = 'status-success';
  let statusIcon = '✓';

  if (check.status === 'error') {
    statusClass = 'status-error';
    statusIcon = '✗';
  } else if (check.status === 'warning') {
    statusClass = 'status-warning';
    statusIcon = '⚠';
  } else {
    // Check if any fields don't match
    const hasIssues = check.fields && check.fields.some(f => !f.match);
    if (hasIssues) {
      statusClass = 'status-warning';
      statusIcon = '⚠';
    }
  }

  let tileContent = '';

  if (check.status === 'error') {
    tileContent = `<div class="error-message">${escapeHtml(check.message)}</div>`;
  } else if (check.name === 'Org Limits' && check.storage) {
    // Special rendering for storage
    tileContent = buildStorageDisplay(check.storage);
  } else if (check.fields && check.fields.length > 0) {
    tileContent = `<div class="fields-list">
      ${check.fields.map(field => buildFieldRow(field)).join('')}
    </div>`;
  } else if (check.status === 'warning') {
    tileContent = `<div class="warning-message">${escapeHtml(check.message)}</div>`;
  }

  return `
    <div class="check-tile ${statusClass}">
      <div class="check-header">
        <h3 class="check-title">${escapeHtml(check.name)}</h3>
        <div class="status-icon">${statusIcon}</div>
      </div>
      <div class="check-content">
        ${tileContent}
      </div>
    </div>
  `;
}

function buildFieldRow(field) {
  const matchClass = field.match ? 'field-match' : 'field-mismatch';
  const statusIndicator = field.match ? '●' : '●';

  // For URL fields that don't match, only show expected value to avoid overflow
  const isUrlField = field.label === 'DOT Help URL' || field.label === 'E-Signature URL';
  const showOnlyExpected = isUrlField && !field.match;

  // Build help text if present and field doesn't match
  const helpTextHtml = (!field.match && field.helpText)
    ? `<div class="field-help-text">
         <span class="help-icon">ℹ</span>
         <span class="help-message">${escapeHtml(field.helpText)}</span>
       </div>`
    : '';

  return `
    <div class="field-row ${matchClass}">
      <div>
        <div class="field-label">${escapeHtml(field.label)}</div>
        <div class="field-value">
          <span class="status-dot">${statusIndicator}</span>
          ${showOnlyExpected
            ? `<span class="value">${escapeHtml(String(field.expected))}</span>`
            : `<span class="value">${escapeHtml(String(field.value))}</span>
          ${field.expected !== null && field.expected !== undefined ?
            `<span class="expected">(Expected: ${escapeHtml(String(field.expected))})</span>` : ''}`}
        </div>
      </div>
      ${helpTextHtml}
    </div>
  `;
}

function buildStorageDisplay(storage) {
  const getStorageClass = (status) => {
    if (status === 'critical') return 'storage-critical';
    if (status === 'warning') return 'storage-warning';
    return 'storage-ok';
  };

  return `
    <div class="storage-section">
      <div class="storage-item ${getStorageClass(storage.file.status)}">
        <div class="storage-label">File Storage</div>
        <div class="storage-bar">
          <div class="storage-progress" style="width: ${storage.file.usedPercent}%"></div>
        </div>
        <div class="storage-text">
          ${storage.file.used} MB / ${storage.file.max} MB (${storage.file.usedPercent}% used)
        </div>
      </div>
      <div class="storage-item ${getStorageClass(storage.data.status)}">
        <div class="storage-label">Data Storage</div>
        <div class="storage-bar">
          <div class="storage-progress" style="width: ${storage.data.usedPercent}%"></div>
        </div>
        <div class="storage-text">
          ${storage.data.used} MB / ${storage.data.max} MB (${storage.data.usedPercent}% used)
        </div>
      </div>
    </div>
  `;
}

function getHealthCheckCSS() {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    .report-header {
      background: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }

    .report-header h1 {
      color: #333;
      font-size: 32px;
      margin-bottom: 20px;
    }

    .report-meta {
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }

    .meta-item {
      color: #666;
      font-size: 14px;
    }

    .meta-item strong {
      color: #333;
      margin-right: 5px;
    }

    .download-pdf-btn {
      background: #0176d3;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .download-pdf-btn:hover {
      background: #014486;
    }

    .checks-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .check-tile {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .check-tile:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.15);
    }

    .check-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f0f0f0;
    }

    .check-title {
      font-size: 18px;
      color: #333;
      font-weight: 600;
    }

    .status-icon {
      font-size: 24px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-weight: bold;
    }

    .status-success .status-icon {
      background: #d4edda;
      color: #155724;
    }

    .status-warning .status-icon {
      background: #fff3cd;
      color: #856404;
    }

    .status-error .status-icon {
      background: #f8d7da;
      color: #721c24;
    }

    .fields-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .field-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      border-radius: 6px;
      background: #f8f9fa;
    }

    .field-row > div:first-child {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .field-label {
      font-weight: 600;
      color: #555;
      font-size: 14px;
    }

    .field-value {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 14px;
      flex-wrap: wrap;
      max-width: 100%;
      overflow: hidden;
    }

    .status-dot {
      font-size: 12px;
    }

    .field-match .status-dot {
      color: #28a745;
    }

    .field-mismatch .status-dot {
      color: #dc3545;
    }

    .value {
      font-weight: 500;
      color: #333;
      word-break: break-all;
      overflow-wrap: break-word;
      max-width: 100%;
    }

    .expected {
      color: #666;
      font-size: 12px;
      font-style: italic;
      word-break: break-all;
      overflow-wrap: break-word;
      max-width: 100%;
    }

    .field-help-text {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px;
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      margin-top: 4px;
    }

    .help-icon {
      color: #856404;
      font-size: 16px;
      font-weight: bold;
      flex-shrink: 0;
    }

    .help-message {
      color: #856404;
      font-size: 13px;
      line-height: 1.5;
    }

    .error-message, .warning-message {
      padding: 12px;
      border-radius: 6px;
      font-size: 14px;
    }

    .error-message {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }

    .warning-message {
      background: #fff3cd;
      color: #856404;
      border: 1px solid #ffeaa7;
    }

    .storage-section {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .storage-item {
      padding: 12px;
      border-radius: 6px;
      background: #f8f9fa;
    }

    .storage-label {
      font-weight: 600;
      color: #555;
      margin-bottom: 8px;
      font-size: 14px;
    }

    .storage-bar {
      width: 100%;
      height: 20px;
      background: #e9ecef;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .storage-progress {
      height: 100%;
      transition: width 0.3s ease;
      border-radius: 10px;
    }

    .storage-ok .storage-progress {
      background: linear-gradient(90deg, #28a745, #20c997);
    }

    .storage-warning .storage-progress {
      background: linear-gradient(90deg, #ffc107, #fd7e14);
    }

    .storage-critical .storage-progress {
      background: linear-gradient(90deg, #dc3545, #c82333);
    }

    .storage-text {
      font-size: 13px;
      color: #666;
    }

    .report-footer {
      text-align: center;
      color: white;
      padding: 20px;
      font-size: 14px;
    }

    @media (max-width: 1200px) {
      .checks-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      .report-meta {
        flex-direction: column;
        gap: 10px;
      }
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .no-print {
        display: none !important;
      }

      .check-tile {
        page-break-inside: avoid;
        box-shadow: none;
        border: 1px solid #ddd;
      }

      .report-header {
        box-shadow: none;
        border: 1px solid #ddd;
      }
    }
  `;
}

// ============================================================================
// SETTINGS
// ============================================================================

function handleSettings() {
  // Open settings page in new tab
  chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') }, (tab) => {
    console.log('[Popup] Settings page opened in new tab:', tab.id);
  });
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
