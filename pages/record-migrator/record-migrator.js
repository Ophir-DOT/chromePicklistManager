/**
 * Record Migrator - Client-side Logic
 * Handles UI interactions and orchestrates the record migration workflow
 */

import RecordMigratorAPI from '../../background/record-migrator-api.js';

// ============================================================================
// State Management
// ============================================================================

const state = {
  currentStep: 1,
  sourceSession: null,
  targetSession: null,
  allSessions: [],
  selectedObject: null,
  allObjects: [],
  selectedRecords: [],
  allRecords: [],
  childRelationships: [],
  selectedRelationships: [],
  externalIdFields: [],
  selectedExternalIdField: null,
  useExternalId: false,
  migrationLog: [],
  migrationInProgress: false
};

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  // Navigation
  backBtn: document.getElementById('backBtn'),
  resetBtn: document.getElementById('resetBtn'),

  // Status
  statusMessage: document.getElementById('statusMessage'),

  // Step 1: Org Selection
  sourceOrgSelect: document.getElementById('sourceOrgSelect'),
  targetOrgSelect: document.getElementById('targetOrgSelect'),
  sourceOrgInfo: document.getElementById('sourceOrgInfo'),
  targetOrgInfo: document.getElementById('targetOrgInfo'),
  step1NextBtn: document.getElementById('step1NextBtn'),

  // Step 2: Record Selection
  objectSelect: document.getElementById('objectSelect'),
  soqlWhere: document.getElementById('soqlWhere'),
  previewRecordsBtn: document.getElementById('previewRecordsBtn'),
  recordsPreview: document.getElementById('recordsPreview'),
  recordsTable: document.getElementById('recordsTable'),
  recordsTableBody: document.getElementById('recordsTableBody'),
  selectAllCheckbox: document.getElementById('selectAllCheckbox'),
  selectAllBtn: document.getElementById('selectAllBtn'),
  deselectAllBtn: document.getElementById('deselectAllBtn'),
  selectedRecordCount: document.getElementById('selectedRecordCount'),
  totalRecordCount: document.getElementById('totalRecordCount'),
  step2BackBtn: document.getElementById('step2BackBtn'),
  step2NextBtn: document.getElementById('step2NextBtn'),

  // Step 3: Relationship Configuration
  detectRelationshipsBtn: document.getElementById('detectRelationshipsBtn'),
  relationshipsPreview: document.getElementById('relationshipsPreview'),
  relationshipsTable: document.getElementById('relationshipsTable'),
  relationshipsTableBody: document.getElementById('relationshipsTableBody'),
  selectedObjectName: document.getElementById('selectedObjectName'),
  noRelationshipsMessage: document.getElementById('noRelationshipsMessage'),
  selectAllRelationships: document.getElementById('selectAllRelationships'),
  step3BackBtn: document.getElementById('step3BackBtn'),
  step3NextBtn: document.getElementById('step3NextBtn'),

  // Step 4: Migration
  useExternalIdCheckbox: document.getElementById('useExternalIdCheckbox'),
  externalIdFieldContainer: document.getElementById('externalIdFieldContainer'),
  externalIdFieldSelect: document.getElementById('externalIdFieldSelect'),
  refreshExternalIdBtn: document.getElementById('refreshExternalIdBtn'),
  summaryParentCount: document.getElementById('summaryParentCount'),
  summaryRelationshipCount: document.getElementById('summaryRelationshipCount'),
  summaryChildCount: document.getElementById('summaryChildCount'),
  summaryTotalOps: document.getElementById('summaryTotalOps'),
  migrationProgress: document.getElementById('migrationProgress'),
  progressBar: document.getElementById('progressBar'),
  progressBarFill: document.getElementById('progressBarFill'),
  progressText: document.getElementById('progressText'),
  currentStep: document.getElementById('currentStep'),
  migrationLogContainer: document.getElementById('migrationLogContainer'),
  migrationLog: document.getElementById('migrationLog'),
  exportLogBtn: document.getElementById('exportLogBtn'),
  step4BackBtn: document.getElementById('step4BackBtn'),
  startMigrationBtn: document.getElementById('startMigrationBtn')
};

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  console.log('[Record Migrator] Initializing...');

  // Apply saved theme
  applyTheme();

  // Setup event listeners
  setupEventListeners();

  // Load active sessions
  await loadActiveSessions();
}

function applyTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

function setupEventListeners() {
  // Navigation
  elements.backBtn.addEventListener('click', () => window.close());
  elements.resetBtn.addEventListener('click', resetMigration);

  // Step 1
  elements.sourceOrgSelect.addEventListener('change', handleOrgSelection);
  elements.targetOrgSelect.addEventListener('change', handleOrgSelection);
  elements.step1NextBtn.addEventListener('click', () => goToStep(2));

  // Step 2
  elements.objectSelect.addEventListener('change', handleObjectSelection);
  elements.previewRecordsBtn.addEventListener('click', previewRecords);
  elements.selectAllCheckbox.addEventListener('change', toggleSelectAll);
  elements.selectAllBtn.addEventListener('click', () => setAllRecordsSelection(true));
  elements.deselectAllBtn.addEventListener('click', () => setAllRecordsSelection(false));
  elements.step2BackBtn.addEventListener('click', () => goToStep(1));
  elements.step2NextBtn.addEventListener('click', () => goToStep(3));

  // Step 3
  elements.detectRelationshipsBtn.addEventListener('click', detectRelationships);
  elements.selectAllRelationships.addEventListener('change', toggleSelectAllRelationships);
  elements.step3BackBtn.addEventListener('click', () => goToStep(2));
  elements.step3NextBtn.addEventListener('click', () => goToStep(4));

  // Step 4
  elements.useExternalIdCheckbox.addEventListener('change', handleExternalIdToggle);
  elements.refreshExternalIdBtn.addEventListener('click', loadExternalIdFields);
  elements.externalIdFieldSelect.addEventListener('change', handleExternalIdFieldSelection);
  elements.step4BackBtn.addEventListener('click', () => goToStep(3));
  elements.startMigrationBtn.addEventListener('click', startMigration);
  elements.exportLogBtn.addEventListener('click', exportLog);
}

// ============================================================================
// Step Navigation
// ============================================================================

function goToStep(stepNumber) {
  // Hide all steps
  document.querySelectorAll('.wizard-step').forEach(step => {
    step.classList.remove('active');
  });

  // Update progress indicator
  document.querySelectorAll('.progress-step').forEach((step, index) => {
    step.classList.remove('active', 'completed');
    if (index + 1 < stepNumber) {
      step.classList.add('completed');
    } else if (index + 1 === stepNumber) {
      step.classList.add('active');
    }
  });

  // Show target step
  document.getElementById(`step${stepNumber}`).classList.add('active');

  // Update state
  state.currentStep = stepNumber;

  // Step-specific actions
  if (stepNumber === 4) {
    updateMigrationSummary();
    // Only load external ID fields if checkbox is checked and fields not already loaded
    if (elements.useExternalIdCheckbox.checked && state.externalIdFields.length === 0) {
      loadExternalIdFields();
    }
  }

  // Scroll to top
  window.scrollTo(0, 0);
}

// ============================================================================
// Step 1: Org Selection
// ============================================================================

async function loadActiveSessions() {
  try {
    showStatus('Loading active Salesforce sessions...', 'loading');

    // Get all active sessions - call API directly (not through service worker)
    state.allSessions = await RecordMigratorAPI.getAllActiveSessions();

    if (state.allSessions.length === 0) {
      showStatus('No active Salesforce sessions found. Please open Salesforce tabs and refresh.', 'warning');
      return;
    }

    console.log('[Record Migrator] Found', state.allSessions.length, 'active session(s)');
    populateOrgSelects();
    hideStatus();

  } catch (error) {
    console.error('[Record Migrator] Error loading sessions:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

function populateOrgSelects() {
  // Clear existing options (keep placeholder)
  elements.sourceOrgSelect.innerHTML = '<option value="">-- Select Source Org --</option>';
  elements.targetOrgSelect.innerHTML = '<option value="">-- Select Target Org --</option>';

  state.allSessions.forEach((session, index) => {
    const option = document.createElement('option');
    option.value = index;

    let displayText = session.orgName || session.hostname || 'Unknown Org';
    if (session.isSandbox) displayText += ' [Sandbox]';

    const subdomain = session.hostname ? session.hostname.split('.')[0] : '';
    if (subdomain) displayText += ` - ${subdomain}`;

    option.textContent = displayText;

    elements.sourceOrgSelect.appendChild(option.cloneNode(true));
    elements.targetOrgSelect.appendChild(option);
  });
}

function handleOrgSelection() {
  const sourceIndex = elements.sourceOrgSelect.value;
  const targetIndex = elements.targetOrgSelect.value;

  // Display org info
  if (sourceIndex !== '') {
    state.sourceSession = state.allSessions[sourceIndex];
    displayOrgInfo(elements.sourceOrgInfo, state.sourceSession);
  } else {
    state.sourceSession = null;
    elements.sourceOrgInfo.innerHTML = '';
  }

  if (targetIndex !== '') {
    state.targetSession = state.allSessions[targetIndex];
    displayOrgInfo(elements.targetOrgInfo, state.targetSession);
  } else {
    state.targetSession = null;
    elements.targetOrgInfo.innerHTML = '';
  }

  // Validate selection
  validateOrgSelection();
}

function displayOrgInfo(container, session) {
  container.innerHTML = `
    <div class="org-info-item">
      <span class="org-info-label">Instance:</span>
      <span>${session.hostname || 'N/A'}</span>
    </div>
    <div class="org-info-item">
      <span class="org-info-label">Org ID:</span>
      <span>${session.orgId || 'N/A'}</span>
    </div>
    <div class="org-info-item">
      <span class="org-info-label">Type:</span>
      <span>${session.isSandbox ? 'Sandbox' : 'Production'}</span>
    </div>
  `;
}

function validateOrgSelection() {
  const isValid = state.sourceSession &&
                  state.targetSession &&
                  state.sourceSession.orgId !== state.targetSession.orgId;

  elements.step1NextBtn.disabled = !isValid;

  if (state.sourceSession && state.targetSession && state.sourceSession.orgId === state.targetSession.orgId) {
    showStatus('Source and target orgs must be different!', 'warning');
  } else if (isValid) {
    hideStatus();
  }
}

// ============================================================================
// Step 2: Record Selection
// ============================================================================

async function loadObjects() {
  try {
    showStatus('Loading objects...', 'loading');

    const response = await chrome.runtime.sendMessage({
      action: 'GET_OBJECTS',
      sessionId: state.sourceSession.sessionId,
      instanceUrl: state.sourceSession.instanceUrl
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to load objects');
    }

    // Filter out unwanted objects
    state.allObjects = (response.data || [])
      .filter(obj => {
        const name = obj.name || obj.label;
        return !['History', 'Share', 'Feed', 'Tag', 'Event'].some(suffix => name.endsWith(suffix));
      })
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''));

    populateObjectSelect();
    hideStatus();

  } catch (error) {
    console.error('[Record Migrator] Error loading objects:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

function populateObjectSelect() {
  elements.objectSelect.innerHTML = '<option value="">-- Select Object --</option>';

  state.allObjects.forEach(obj => {
    const option = document.createElement('option');
    option.value = obj.name;
    option.textContent = `${obj.label} (${obj.name})`;
    elements.objectSelect.appendChild(option);
  });
}

function handleObjectSelection() {
  const selectedObjectName = elements.objectSelect.value;

  if (selectedObjectName) {
    state.selectedObject = state.allObjects.find(obj => obj.name === selectedObjectName);
    elements.soqlWhere.disabled = false;
    elements.previewRecordsBtn.disabled = false;
  } else {
    state.selectedObject = null;
    elements.soqlWhere.disabled = true;
    elements.previewRecordsBtn.disabled = true;
    elements.recordsPreview.classList.add('hidden');
  }

  // Reset record selection
  state.selectedRecords = [];
  state.allRecords = [];
  elements.step2NextBtn.disabled = true;
}

async function previewRecords() {
  try {
    const whereClause = elements.soqlWhere.value.trim();
    let soql = `SELECT Id, Name FROM ${state.selectedObject.name}`;

    if (whereClause) {
      soql += ` WHERE ${whereClause}`;
    }

    soql += ' LIMIT 200';

    showStatus('Querying records...', 'loading');

    const response = await chrome.runtime.sendMessage({
      action: 'QUERY_RECORDS',
      sessionId: state.sourceSession.sessionId,
      instanceUrl: state.sourceSession.instanceUrl,
      soql: soql
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to query records');
    }

    state.allRecords = response.data.records || [];
    displayRecords();
    hideStatus();

    if (state.allRecords.length === 0) {
      showStatus('No records found matching the criteria.', 'warning');
    }

  } catch (error) {
    console.error('[Record Migrator] Error querying records:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

function displayRecords() {
  elements.recordsPreview.classList.remove('hidden');
  elements.totalRecordCount.textContent = state.allRecords.length;
  elements.selectedRecordCount.textContent = '0';

  elements.recordsTableBody.innerHTML = '';

  state.allRecords.forEach(record => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="checkbox-column">
        <input type="checkbox" data-record-id="${record.Id}" />
      </td>
      <td>${escapeHtml(record.Id)}</td>
      <td>${escapeHtml(record.Name || '(No Name)')}</td>
    `;

    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', handleRecordSelection);

    elements.recordsTableBody.appendChild(row);
  });

  // Reset selections
  state.selectedRecords = [];
  elements.selectAllCheckbox.checked = false;
  updateSelectedRecordCount();
}

function handleRecordSelection(event) {
  const recordId = event.target.dataset.recordId;

  if (event.target.checked) {
    if (!state.selectedRecords.includes(recordId)) {
      state.selectedRecords.push(recordId);
    }
  } else {
    state.selectedRecords = state.selectedRecords.filter(id => id !== recordId);
  }

  updateSelectedRecordCount();
  updateSelectAllCheckbox();
}

function toggleSelectAll(event) {
  setAllRecordsSelection(event.target.checked);
}

function setAllRecordsSelection(selected) {
  const checkboxes = elements.recordsTableBody.querySelectorAll('input[type="checkbox"]');

  checkboxes.forEach(checkbox => {
    checkbox.checked = selected;
    const recordId = checkbox.dataset.recordId;

    if (selected) {
      if (!state.selectedRecords.includes(recordId)) {
        state.selectedRecords.push(recordId);
      }
    } else {
      state.selectedRecords = state.selectedRecords.filter(id => id !== recordId);
    }
  });

  updateSelectedRecordCount();
  updateSelectAllCheckbox();
}

function updateSelectAllCheckbox() {
  const totalCheckboxes = elements.recordsTableBody.querySelectorAll('input[type="checkbox"]').length;
  elements.selectAllCheckbox.checked = state.selectedRecords.length === totalCheckboxes && totalCheckboxes > 0;
}

function updateSelectedRecordCount() {
  elements.selectedRecordCount.textContent = state.selectedRecords.length;
  elements.step2NextBtn.disabled = state.selectedRecords.length === 0;

  if (state.selectedRecords.length > 10000) {
    showStatus('Warning: More than 10,000 records selected. This may exceed API limits.', 'warning');
  }
}

// ============================================================================
// Step 3: Relationship Detection
// ============================================================================

async function detectRelationships() {
  try {
    showStatus('Detecting child relationships...', 'loading');

    const response = await chrome.runtime.sendMessage({
      action: 'GET_CHILD_RELATIONSHIPS',
      sessionId: state.sourceSession.sessionId,
      instanceUrl: state.sourceSession.instanceUrl,
      objectName: state.selectedObject.name
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to detect relationships');
    }

    state.childRelationships = response.data || [];
    displayRelationships();
    hideStatus();

  } catch (error) {
    console.error('[Record Migrator] Error detecting relationships:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

function displayRelationships() {
  elements.relationshipsPreview.classList.remove('hidden');
  elements.selectedObjectName.textContent = `Parent Object: ${state.selectedObject.label} (${state.selectedObject.name})`;

  if (state.childRelationships.length === 0) {
    elements.noRelationshipsMessage.classList.remove('hidden');
    elements.relationshipsTable.style.display = 'none';
    return;
  }

  elements.noRelationshipsMessage.classList.add('hidden');
  elements.relationshipsTable.style.display = 'table';
  elements.relationshipsTableBody.innerHTML = '';

  state.childRelationships.forEach((rel, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="checkbox-column">
        <input type="checkbox" data-relationship-index="${index}" />
      </td>
      <td>${escapeHtml(rel.relationshipName || '(No Name)')}</td>
      <td>${escapeHtml(rel.childSObject)}</td>
      <td>${escapeHtml(rel.field)}</td>
      <td id="count-${index}">-</td>
    `;

    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', handleRelationshipSelection);

    elements.relationshipsTableBody.appendChild(row);
  });

  // Estimate counts
  estimateChildCounts();
}

async function estimateChildCounts() {
  for (let i = 0; i < state.childRelationships.length; i++) {
    const rel = state.childRelationships[i];
    const countCell = document.getElementById(`count-${i}`);

    try {
      const soql = `SELECT COUNT() FROM ${rel.childSObject} WHERE ${rel.field} IN ('${state.selectedRecords.join("','")}')`;

      const response = await chrome.runtime.sendMessage({
        action: 'QUERY_RECORDS',
        sessionId: state.sourceSession.sessionId,
        instanceUrl: state.sourceSession.instanceUrl,
        soql: soql
      });

      if (response.success && response.data.totalSize !== undefined) {
        countCell.textContent = response.data.totalSize;
        rel.estimatedCount = response.data.totalSize;
      } else {
        countCell.textContent = 'Error';
      }
    } catch (error) {
      console.error('[Record Migrator] Error estimating count for', rel.childSObject, error);
      countCell.textContent = 'Error';
    }
  }
}

function handleRelationshipSelection(event) {
  const relIndex = parseInt(event.target.dataset.relationshipIndex);
  const relationship = state.childRelationships[relIndex];

  if (event.target.checked) {
    if (!state.selectedRelationships.find(r => r.field === relationship.field)) {
      state.selectedRelationships.push(relationship);
    }
  } else {
    state.selectedRelationships = state.selectedRelationships.filter(r => r.field !== relationship.field);
  }
}

function toggleSelectAllRelationships(event) {
  const checkboxes = elements.relationshipsTableBody.querySelectorAll('input[type="checkbox"]');

  checkboxes.forEach(checkbox => {
    checkbox.checked = event.target.checked;
    const relIndex = parseInt(checkbox.dataset.relationshipIndex);
    const relationship = state.childRelationships[relIndex];

    if (event.target.checked) {
      if (!state.selectedRelationships.find(r => r.field === relationship.field)) {
        state.selectedRelationships.push(relationship);
      }
    } else {
      state.selectedRelationships = [];
    }
  });
}

// ============================================================================
// Step 4: Migration Summary & Execution
// ============================================================================

function updateMigrationSummary() {
  elements.summaryParentCount.textContent = state.selectedRecords.length;
  elements.summaryRelationshipCount.textContent = state.selectedRelationships.length;

  const totalChildCount = state.selectedRelationships.reduce((sum, rel) => sum + (rel.estimatedCount || 0), 0);
  elements.summaryChildCount.textContent = `~${totalChildCount}`;

  const totalOps = state.selectedRecords.length + totalChildCount;
  elements.summaryTotalOps.textContent = totalOps;
}

async function startMigration() {
  if (state.migrationInProgress) {
    showStatus('Migration already in progress!', 'warning');
    return;
  }

  // Confirm with user
  const confirmed = confirm(
    `You are about to migrate:\n\n` +
    `• ${state.selectedRecords.length} ${state.selectedObject.label} records\n` +
    `• ${state.selectedRelationships.length} child relationships\n\n` +
    `From: ${state.sourceSession.orgName}\n` +
    `To: ${state.targetSession.orgName}\n\n` +
    `This action cannot be undone. Continue?`
  );

  if (!confirmed) return;

  state.migrationInProgress = true;
  state.migrationLog = [];

  // Show progress UI
  elements.migrationProgress.classList.remove('hidden');
  elements.migrationLogContainer.classList.remove('hidden');
  elements.startMigrationBtn.disabled = true;
  elements.step4BackBtn.disabled = true;

  try {
    appendLog('info', 'Migration started...');

    const response = await chrome.runtime.sendMessage({
      action: 'MIGRATE_RECORDS',
      sourceSession: {
        sessionId: state.sourceSession.sessionId,
        instanceUrl: state.sourceSession.instanceUrl
      },
      targetSession: {
        sessionId: state.targetSession.sessionId,
        instanceUrl: state.targetSession.instanceUrl
      },
      config: {
        objectName: state.selectedObject.name,
        recordIds: state.selectedRecords,
        relationships: state.selectedRelationships,
        externalIdField: state.useExternalId && state.selectedExternalIdField ? state.selectedExternalIdField.name : null
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'Migration failed');
    }

    appendLog('success', `Migration completed successfully!`);
    appendLog('info', `Parent records created: ${response.data.parentSuccess || 0}`);
    appendLog('info', `Child records created: ${response.data.childSuccess || 0}`);

    if (response.data.errors && response.data.errors.length > 0) {
      appendLog('warning', `Errors: ${response.data.errors.length}`);
      response.data.errors.forEach(err => appendLog('error', err));
    }

    showStatus('Migration completed successfully!', 'success');
    updateProgress(100, 'Migration complete');
    elements.exportLogBtn.disabled = false;

  } catch (error) {
    console.error('[Record Migrator] Migration error:', error);
    appendLog('error', `Migration failed: ${error.message}`);
    showStatus(`Migration failed: ${error.message}`, 'error');
    updateProgress(0, 'Migration failed');
  } finally {
    state.migrationInProgress = false;
    elements.startMigrationBtn.disabled = false;
    elements.step4BackBtn.disabled = false;
  }
}

function updateProgress(percentage, stepText) {
  elements.progressBarFill.style.width = `${percentage}%`;
  elements.progressText.textContent = `${percentage}%`;
  elements.currentStep.textContent = stepText;
}

function appendLog(severity, message) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${severity}`;
  entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${escapeHtml(message)}`;
  elements.migrationLog.appendChild(entry);

  // Scroll to bottom
  elements.migrationLog.scrollTop = elements.migrationLog.scrollHeight;

  // Add to log array
  state.migrationLog.push({ timestamp, severity, message });
}

function exportLog() {
  const csvRows = [['Timestamp', 'Severity', 'Message']];

  state.migrationLog.forEach(entry => {
    csvRows.push([entry.timestamp, entry.severity, entry.message]);
  });

  const csvContent = csvRows.map(row =>
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
  a.download = `migration-log-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showStatus('Log exported successfully!', 'success');
}

// ============================================================================
// External ID Field Management
// ============================================================================

function handleExternalIdToggle(event) {
  state.useExternalId = event.target.checked;

  if (state.useExternalId) {
    elements.externalIdFieldContainer.classList.remove('hidden');
    // Load fields if not already loaded
    if (state.externalIdFields.length === 0) {
      loadExternalIdFields();
    }
  } else {
    elements.externalIdFieldContainer.classList.add('hidden');
    state.selectedExternalIdField = null;
  }
}

async function loadExternalIdFields() {
  if (!state.targetSession || !state.selectedObject) {
    showStatus('Please select target org and object first', 'warning');
    return;
  }

  try {
    showStatus('Loading external ID fields from target org...', 'loading');

    // Get object describe from target org
    const endpoint = `${state.targetSession.instanceUrl}/services/data/v59.0/sobjects/${state.selectedObject.name}/describe`;

    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${state.targetSession.sessionId}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to describe ${state.selectedObject.name}: ${response.status}`);
    }

    const describe = await response.json();

    // Filter for external ID text fields
    state.externalIdFields = describe.fields.filter(field =>
      field.externalId &&
      field.createable &&
      (field.type === 'string' || field.type === 'text')
    );

    populateExternalIdSelect();
    hideStatus();

    if (state.externalIdFields.length === 0) {
      showStatus('No external ID fields found on target org. Please create an external ID text field first.', 'warning');
    }

  } catch (error) {
    console.error('[Record Migrator] Error loading external ID fields:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

function populateExternalIdSelect() {
  elements.externalIdFieldSelect.innerHTML = '<option value="">-- Select External ID Field --</option>';

  state.externalIdFields.forEach(field => {
    const option = document.createElement('option');
    option.value = field.name;
    option.textContent = `${field.label} (${field.name})`;
    elements.externalIdFieldSelect.appendChild(option);
  });
}

function handleExternalIdFieldSelection(event) {
  const fieldName = event.target.value;

  if (fieldName) {
    state.selectedExternalIdField = state.externalIdFields.find(f => f.name === fieldName);
    console.log('[Record Migrator] Selected external ID field:', state.selectedExternalIdField.name);
  } else {
    state.selectedExternalIdField = null;
  }
}

// ============================================================================
// Reset
// ============================================================================

function resetMigration() {
  if (state.migrationInProgress) {
    const confirmed = confirm('Migration is in progress. Are you sure you want to reset?');
    if (!confirmed) return;
  }

  // Reset state
  state.currentStep = 1;
  state.selectedObject = null;
  state.selectedRecords = [];
  state.allRecords = [];
  state.childRelationships = [];
  state.selectedRelationships = [];
  state.migrationLog = [];
  state.migrationInProgress = false;

  // Reset UI
  elements.sourceOrgSelect.value = '';
  elements.targetOrgSelect.value = '';
  elements.sourceOrgInfo.innerHTML = '';
  elements.targetOrgInfo.innerHTML = '';
  elements.objectSelect.value = '';
  elements.soqlWhere.value = '';
  elements.recordsPreview.classList.add('hidden');
  elements.relationshipsPreview.classList.add('hidden');
  elements.migrationProgress.classList.add('hidden');
  elements.migrationLogContainer.classList.add('hidden');
  elements.migrationLog.innerHTML = '';

  // Go to step 1
  goToStep(1);
  hideStatus();
}

// ============================================================================
// Utilities
// ============================================================================

function showStatus(message, type = 'info') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type} show`;
}

function hideStatus() {
  elements.statusMessage.className = 'status-message';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// Initialize on page load
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  init();

  // When moving to step 2, load objects
  const originalGoToStep = goToStep;
  goToStep = function(stepNumber) {
    if (stepNumber === 2 && state.allObjects.length === 0) {
      loadObjects();
    }
    originalGoToStep(stepNumber);
  };
});
