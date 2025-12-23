/**
 * Record Migrator - Client-side Logic
 * Handles UI interactions and orchestrates the record migration workflow
 */

import RecordMigratorAPI from '../../background/record-migrator-api.js';
import FieldMapper from './field-mapper.js';
import PicklistMapper from './picklist-mapper.js';

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
  // Field mapping state
  sourceFields: [],
  targetFields: [],
  fieldMapping: null,
  picklistFields: [],
  picklistMappings: {}, // fieldName -> { sourceValue: targetValue }
  // Relationship state
  childRelationships: [],
  selectedRelationships: [],
  // External ID state
  externalIdFields: [],
  selectedExternalIdField: null,
  useExternalId: true,
  // Migration state
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

  // Step 3: Field Mapping
  analyzeFieldsBtn: document.getElementById('analyzeFieldsBtn'),
  fieldMappingPreview: document.getElementById('fieldMappingPreview'),
  fieldMappingSummary: document.getElementById('fieldMappingSummary'),
  exactMatchesSection: document.getElementById('exactMatchesSection'),
  exactMatchCount: document.getElementById('exactMatchCount'),
  exactMatchesList: document.getElementById('exactMatchesList'),
  mismatchesSection: document.getElementById('mismatchesSection'),
  mismatchCount: document.getElementById('mismatchCount'),
  mismatchesList: document.getElementById('mismatchesList'),
  missingFieldsSection: document.getElementById('missingFieldsSection'),
  missingFieldCount: document.getElementById('missingFieldCount'),
  missingFieldsList: document.getElementById('missingFieldsList'),
  picklistSection: document.getElementById('picklistSection'),
  picklistFieldCount: document.getElementById('picklistFieldCount'),
  picklistFieldsList: document.getElementById('picklistFieldsList'),
  mapPicklistsBtn: document.getElementById('mapPicklistsBtn'),
  step3BackBtn: document.getElementById('step3BackBtn'),
  step3NextBtn: document.getElementById('step3NextBtn'),

  // Step 4: Relationship Configuration
  detectRelationshipsBtn: document.getElementById('detectRelationshipsBtn'),
  relationshipsPreview: document.getElementById('relationshipsPreview'),
  relationshipsTable: document.getElementById('relationshipsTable'),
  relationshipsTableBody: document.getElementById('relationshipsTableBody'),
  selectedObjectName: document.getElementById('selectedObjectName'),
  noRelationshipsMessage: document.getElementById('noRelationshipsMessage'),
  selectAllRelationships: document.getElementById('selectAllRelationships'),
  step4BackBtn: document.getElementById('step4BackBtn'),
  step4NextBtn: document.getElementById('step4NextBtn'),

  // Step 5: Migration
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
  step5BackBtn: document.getElementById('step5BackBtn'),
  startMigrationBtn: document.getElementById('startMigrationBtn')
};

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  console.log('[Record Migrator] Initializing...');

  // Check if feature is unlocked
  const unlocked = await checkUnlockStatus();
  if (!unlocked) {
    setupUnlockListeners();
    return;
  }

  // Show main content
  showMainContent();

  // Apply saved theme
  applyTheme();

  // Setup event listeners
  setupEventListeners();

  // Load active sessions
  await loadActiveSessions();
}

// ============================================================================
// Unlock Functions
// ============================================================================

async function checkUnlockStatus() {
  try {
    const stored = await chrome.storage.session.get(['recordMigratorUnlocked']);
    return stored.recordMigratorUnlocked === true;
  } catch (error) {
    console.warn('[Record Migrator] Could not check unlock status:', error);
    return false;
  }
}

function setupUnlockListeners() {
  document.getElementById('unlockPageBtn')?.addEventListener('click', unlockPage);
  document.getElementById('pagePassword')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') unlockPage();
  });
  document.getElementById('pagePassword')?.focus();
}

function showMainContent() {
  document.getElementById('unlockGate')?.classList.add('hidden');
  document.getElementById('mainContent')?.classList.remove('hidden');
}

async function unlockPage() {
  const password = document.getElementById('pagePassword').value;
  const statusEl = document.getElementById('pageUnlockStatus');
  const unlockBtn = document.getElementById('unlockPageBtn');

  if (!password) {
    statusEl.textContent = 'Please enter a password';
    statusEl.className = 'status-message error';
    return;
  }

  try {
    unlockBtn.disabled = true;
    statusEl.textContent = 'Validating...';
    statusEl.className = 'status-message loading';

    // Use the same password as other locked features
    const validKey = 'DOT-DEPS-2024';

    if (password === validKey) {
      await chrome.storage.session.set({ recordMigratorUnlocked: true });

      statusEl.textContent = 'Unlocked successfully!';
      statusEl.className = 'status-message success';

      setTimeout(async () => {
        showMainContent();
        applyTheme();
        setupEventListeners();
        await loadActiveSessions();
      }, 1000);
    } else {
      throw new Error('Invalid password');
    }
  } catch (error) {
    console.error('[Record Migrator] Unlock failed:', error);
    statusEl.textContent = 'Invalid password. Access denied.';
    statusEl.className = 'status-message error';
    unlockBtn.disabled = false;
  }
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
  elements.analyzeFieldsBtn.addEventListener('click', analyzeFields);
  elements.mapPicklistsBtn.addEventListener('click', configurePicklistMappings);
  elements.step3BackBtn.addEventListener('click', () => goToStep(2));
  elements.step3NextBtn.addEventListener('click', () => goToStep(4));

  // Step 4
  elements.detectRelationshipsBtn.addEventListener('click', detectRelationships);
  elements.selectAllRelationships.addEventListener('change', toggleSelectAllRelationships);
  elements.step4BackBtn.addEventListener('click', () => goToStep(3));
  elements.step4NextBtn.addEventListener('click', () => goToStep(5));

  // Step 5
  elements.useExternalIdCheckbox.addEventListener('change', handleExternalIdToggle);
  elements.refreshExternalIdBtn.addEventListener('click', loadExternalIdFields);
  elements.externalIdFieldSelect.addEventListener('change', handleExternalIdFieldSelection);
  elements.step5BackBtn.addEventListener('click', () => goToStep(4));
  elements.startMigrationBtn.addEventListener('click', startMigration);
  elements.exportLogBtn.addEventListener('click', exportLog);
}

// ============================================================================
// Step Navigation
// ============================================================================

function goToStep(stepNumber) {
  // Validate step range
  if (stepNumber < 1 || stepNumber > 5) {
    console.error('[Record Migrator] Invalid step number:', stepNumber);
    return;
  }

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
  if (stepNumber === 5) {
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
// Step 3: Field Mapping
// ============================================================================

async function analyzeFields() {
  try {
    showStatus('Analyzing field differences between orgs...', 'loading');

    // Get field metadata from both orgs
    state.sourceFields = await FieldMapper.getFieldMetadata(state.sourceSession, state.selectedObject.name);
    state.targetFields = await FieldMapper.getFieldMetadata(state.targetSession, state.selectedObject.name);

    console.log('[Record Migrator] Source fields:', state.sourceFields.length);
    console.log('[Record Migrator] Target fields:', state.targetFields.length);

    // Build field mapping
    state.fieldMapping = FieldMapper.buildFieldMapping(state.sourceFields, state.targetFields);

    // Detect picklist fields
    state.picklistFields = PicklistMapper.detectPicklistFields(state.sourceFields, state.targetFields);

    console.log('[Record Migrator] Field mapping:', state.fieldMapping);
    console.log('[Record Migrator] Picklist fields:', state.picklistFields.length);

    // Display results
    displayFieldMapping();
    hideStatus();

    // Enable next button
    elements.step3NextBtn.disabled = false;

  } catch (error) {
    console.error('[Record Migrator] Error analyzing fields:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

function displayFieldMapping() {
  elements.fieldMappingPreview.classList.remove('hidden');

  // Display summary
  const totalFields = state.fieldMapping.exact.length + state.fieldMapping.compatible.length;
  const exactMatches = state.fieldMapping.exact.length;
  const mismatches = state.fieldMapping.compatible.length;
  const missing = state.fieldMapping.missingInTarget.length;

  elements.fieldMappingSummary.innerHTML = `
    <div class="summary-item">
      <span class="material-symbols-rounded status-ok">check_circle</span>
      <span>${exactMatches} exact matches</span>
    </div>
    <div class="summary-item">
      <span class="material-symbols-rounded status-warning">warning</span>
      <span>${mismatches} type mismatches</span>
    </div>
    <div class="summary-item">
      <span class="material-symbols-rounded status-error">error</span>
      <span>${missing} missing in target</span>
    </div>
  `;

  // Display exact matches
  if (state.fieldMapping.exact.length > 0) {
    elements.exactMatchesSection.classList.remove('hidden');
    elements.exactMatchCount.textContent = state.fieldMapping.exact.length;

    const matchesList = state.fieldMapping.exact.map(field =>
      `<div class="field-item">
        <span class="field-name">${escapeHtml(field.label)}</span>
        <span class="field-api">${escapeHtml(field.sourceField)}</span>
        <span class="field-type">${escapeHtml(field.type)}</span>
      </div>`
    ).join('');

    elements.exactMatchesList.innerHTML = matchesList;
  } else {
    elements.exactMatchesSection.classList.add('hidden');
  }

  // Display type mismatches
  if (state.fieldMapping.compatible.length > 0) {
    elements.mismatchesSection.classList.remove('hidden');
    elements.mismatchCount.textContent = state.fieldMapping.compatible.length;

    const mismatchesList = state.fieldMapping.compatible.map(field =>
      `<div class="field-item warning">
        <span class="field-name">${escapeHtml(field.label)}</span>
        <span class="field-api">${escapeHtml(field.sourceField)}</span>
        <span class="field-type">${escapeHtml(field.sourceType)} → ${escapeHtml(field.targetType)}</span>
        <span class="field-warning">${escapeHtml(field.warning)}</span>
      </div>`
    ).join('');

    elements.mismatchesList.innerHTML = mismatchesList;
  } else {
    elements.mismatchesSection.classList.add('hidden');
  }

  // Display missing fields
  if (state.fieldMapping.missingInTarget.length > 0) {
    elements.missingFieldsSection.classList.remove('hidden');
    elements.missingFieldCount.textContent = state.fieldMapping.missingInTarget.length;

    const missingList = state.fieldMapping.missingInTarget.map(field =>
      `<div class="field-item error">
        <span class="field-name">${escapeHtml(field.label)}</span>
        <span class="field-api">${escapeHtml(field.name)}</span>
        <span class="field-type">${escapeHtml(field.type)}</span>
        ${field.required ? '<span class="field-warning">REQUIRED</span>' : ''}
      </div>`
    ).join('');

    elements.missingFieldsList.innerHTML = missingList;
  } else {
    elements.missingFieldsSection.classList.add('hidden');
  }

  // Display picklist fields
  if (state.picklistFields.length > 0) {
    elements.picklistSection.classList.remove('hidden');
    elements.picklistFieldCount.textContent = state.picklistFields.length;

    const picklistList = state.picklistFields.map(field => {
      const mapping = PicklistMapper.buildPicklistMapping(field.sourceValues, field.targetValues);
      const hasMismatches = mapping.missingInTarget.length > 0;

      return `<div class="field-item ${hasMismatches ? 'warning' : ''}">
        <span class="field-name">${escapeHtml(field.label)}</span>
        <span class="field-api">${escapeHtml(field.name)}</span>
        <span class="field-type">
          ${field.sourceValues.length} values (${mapping.missingInTarget.length} missing in target)
        </span>
      </div>`;
    }).join('');

    elements.picklistFieldsList.innerHTML = picklistList;
  } else {
    elements.picklistSection.classList.add('hidden');
  }
}

async function configurePicklistMappings() {
  if (state.picklistFields.length === 0) {
    showStatus('No picklist fields require mapping', 'info');
    return;
  }

  try {
    showStatus('Configuring picklist mappings...', 'loading');

    // Build picklist mappings automatically for exact matches
    state.picklistMappings = {};

    state.picklistFields.forEach(field => {
      const mapping = PicklistMapper.buildPicklistMapping(field.sourceValues, field.targetValues);

      // Use the valueMap from the mapping (sourceValue -> targetValue)
      state.picklistMappings[field.name] = mapping.valueMap;

      // Log fields with missing values
      if (mapping.missingInTarget.length > 0) {
        console.warn(`[Record Migrator] Field "${field.name}" has ${mapping.missingInTarget.length} values missing in target:`,
          mapping.missingInTarget.map(v => v.value));
      }
    });

    console.log('[Record Migrator] Picklist mappings configured:', state.picklistMappings);

    // Generate report
    const report = PicklistMapper.generateMappingReport(state.picklistFields);

    if (report.fieldsWithMismatches > 0) {
      showStatus(
        `Picklist mappings configured with warnings: ${report.fieldsWithMismatches} fields have value mismatches (${report.totalMissingValues} values missing in target). Records with unmapped values may fail.`,
        'warning'
      );
    } else {
      showStatus('Picklist mappings configured successfully - all values match!', 'success');
    }

  } catch (error) {
    console.error('[Record Migrator] Error configuring picklist mappings:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

// ============================================================================
// Step 4: Relationship Detection
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
// Step 5: Migration Summary & Execution
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
  state.migrationResults = null; // Store results for potential rollback

  // Show progress UI
  elements.migrationProgress.classList.remove('hidden');
  elements.migrationLogContainer.classList.remove('hidden');
  elements.startMigrationBtn.disabled = true;
  elements.step4BackBtn.disabled = true;

  // Reset progress
  updateProgress(0, 'Initializing migration...');

  try {
    appendLog('info', 'Migration started...');

    // Apply field mapping validation
    if (state.fieldMapping) {
      const validation = FieldMapper.validateFieldMapping(state.fieldMapping, state.sourceFields, state.targetFields);

      if (!validation.valid) {
        throw new Error(`Field mapping validation failed: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        appendLog('warning', `Field mapping warnings: ${validation.warnings.length} issues detected`);
        validation.warnings.forEach(warning => {
          console.warn('[Record Migrator]', warning);
        });
      }
    }

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
        externalIdField: state.useExternalId && state.selectedExternalIdField ? state.selectedExternalIdField.name : null,
        fieldMapping: state.fieldMapping,
        picklistMappings: state.picklistMappings
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'Migration failed');
    }

    // Store results for potential rollback
    state.migrationResults = response.data;

    appendLog('success', `Migration completed successfully!`);
    appendLog('info', `Parent records created: ${response.data.parentSuccess || 0}`);
    appendLog('info', `Parent records failed: ${response.data.parentFailed || 0}`);
    appendLog('info', `Child records created: ${response.data.childSuccess || 0}`);
    appendLog('info', `Child records failed: ${response.data.childFailed || 0}`);

    // Display detailed errors if any
    if (response.data.detailedErrors && response.data.detailedErrors.length > 0) {
      appendLog('warning', `Encountered ${response.data.detailedErrors.length} errors during migration`);
      displayDetailedErrors(response.data.detailedErrors);
    }

    // Legacy error display
    if (response.data.errors && response.data.errors.length > 0) {
      response.data.errors.forEach(err => appendLog('error', err));
    }

    // Show rollback button if there were failures
    const totalFailures = (response.data.parentFailed || 0) + (response.data.childFailed || 0);
    if (totalFailures > 0 && response.data.createdRecordIds && response.data.createdRecordIds.length > 0) {
      showRollbackButton();
    }

    showStatus('Migration completed!', totalFailures > 0 ? 'warning' : 'success');
    updateProgress(100, 'Migration complete');
    elements.exportLogBtn.disabled = false;

    // Display migration report with all created record IDs
    if (response.data.createdRecordIds && response.data.createdRecordIds.length > 0) {
      displayMigrationReport(response.data);
    }

    // Disable navigation buttons after successful migration
    elements.startMigrationBtn.disabled = true;
    elements.step5BackBtn.disabled = true;

  } catch (error) {
    console.error('[Record Migrator] Migration error:', error);
    appendLog('error', `Migration failed: ${error.message}`);
    showStatus(`Migration failed: ${error.message}`, 'error');
    updateProgress(0, 'Migration failed');
    // Re-enable buttons on error so user can retry
    elements.startMigrationBtn.disabled = false;
    elements.step5BackBtn.disabled = false;
  } finally {
    state.migrationInProgress = false;
  }
}

/**
 * Display detailed errors grouped by category
 * @param {Array} detailedErrors - Array of detailed error objects
 */
function displayDetailedErrors(detailedErrors) {
  // Group errors by code
  const errorGroups = {};
  detailedErrors.forEach(error => {
    const code = error.code || 'UNKNOWN_ERROR';
    if (!errorGroups[code]) {
      errorGroups[code] = [];
    }
    errorGroups[code].push(error);
  });

  // Display grouped errors
  Object.keys(errorGroups).forEach(code => {
    const errors = errorGroups[code];
    appendLog('error', `${getErrorCategoryLabel(code)} (${errors.length} records):`);

    // Show first 5 errors in each category
    errors.slice(0, 5).forEach(error => {
      appendLog('error', `  - Record ${error.recordId}: ${error.message}`);
    });

    if (errors.length > 5) {
      appendLog('error', `  ... and ${errors.length - 5} more`);
    }
  });
}

/**
 * Get human-readable label for error category
 * @param {string} code - Error code
 * @returns {string} Human-readable label
 */
function getErrorCategoryLabel(code) {
  const labels = {
    'REQUIRED_FIELD_MISSING': 'Required Field Missing',
    'FIELD_TYPE_MISMATCH': 'Field Type Mismatch',
    'VALIDATION_RULE_FAILED': 'Validation Rule Failed',
    'LOOKUP_NOT_FOUND': 'Lookup Record Not Found',
    'API_LIMIT_EXCEEDED': 'API Limit Exceeded',
    'PERMISSION_DENIED': 'Permission Denied',
    'DUPLICATE_VALUE': 'Duplicate Value',
    'RELATIONSHIP_MIGRATION_FAILED': 'Child Relationship Migration Failed',
    'UNKNOWN_ERROR': 'Unknown Error'
  };
  return labels[code] || code;
}

/**
 * Display migration report with all created record IDs
 * @param {Object} migrationData - Migration results data
 */
function displayMigrationReport(migrationData) {
  const { createdRecordIds, parentSuccess, childSuccess, migratedRecords } = migrationData;

  // Create report container if it doesn't exist
  let reportContainer = document.getElementById('migrationReport');
  if (!reportContainer) {
    reportContainer = document.createElement('div');
    reportContainer.id = 'migrationReport';
    reportContainer.className = 'migration-report';

    // Insert after the log container
    const logContainer = elements.migrationLog.parentElement;
    logContainer.parentElement.insertBefore(reportContainer, logContainer.nextSibling);
  }

  // Build report content
  const targetOrgUrl = state.targetSession?.instanceUrl || '';
  const sourceOrgUrl = state.sourceSession?.instanceUrl || '';
  const totalRecords = migratedRecords?.length || createdRecordIds?.length || 0;

  let reportHTML = `
    <div class="report-header">
      <h3>
        <span class="material-symbols-rounded">summarize</span>
        Migration Report
      </h3>
      <span class="record-count">${totalRecords} records created</span>
    </div>
    <div class="report-content">
      <div class="report-section">
        <h4>Migrated Records</h4>
        <p class="report-description">Click any ID to open the record in Salesforce</p>
        <div class="record-id-list">
  `;

  // Use migratedRecords if available (contains full record data with Name)
  if (migratedRecords && migratedRecords.length > 0) {
    reportHTML += `
          <table class="id-mapping-table">
            <thead>
              <tr>
                <th>Record Name</th>
                <th>Source Record ID</th>
                <th>Target Record ID</th>
              </tr>
            </thead>
            <tbody>
    `;

    migratedRecords.forEach(({ sourceId, targetId, name }) => {
      const sourceUrl = `${sourceOrgUrl}/${sourceId}`;
      const targetUrl = `${targetOrgUrl}/${targetId}`;
      reportHTML += `
              <tr>
                <td class="record-name">${escapeHtml(name || 'N/A')}</td>
                <td>
                  <a href="${sourceUrl}" target="_blank" class="record-link">
                    <code>${sourceId}</code>
                    <span class="material-symbols-rounded">open_in_new</span>
                  </a>
                </td>
                <td>
                  <a href="${targetUrl}" target="_blank" class="record-link">
                    <code>${targetId}</code>
                    <span class="material-symbols-rounded">open_in_new</span>
                  </a>
                </td>
              </tr>
      `;
    });

    reportHTML += `
            </tbody>
          </table>
    `;
  } else if (createdRecordIds && createdRecordIds.length > 0) {
    // Fallback: Simple list of created IDs
    createdRecordIds.forEach(id => {
      const targetUrl = `${targetOrgUrl}/${id}`;
      reportHTML += `
          <div class="record-id-item">
            <a href="${targetUrl}" target="_blank" class="record-link">
              <code>${id}</code>
              <span class="material-symbols-rounded">open_in_new</span>
            </a>
          </div>
      `;
    });
  } else {
    reportHTML += `<p class="empty-message">No records were created.</p>`;
  }

  reportHTML += `
        </div>
      </div>
      <div class="report-actions">
        <button id="copyReportBtn" class="btn btn-secondary btn-sm">
          <span class="material-symbols-rounded">content_copy</span>
          Copy All IDs
        </button>
        <button id="exportCsvBtn" class="btn btn-secondary btn-sm">
          <span class="material-symbols-rounded">csv</span>
          Export CSV
        </button>
        <button id="exportExcelBtn" class="btn btn-primary btn-sm">
          <span class="material-symbols-rounded">table_view</span>
          Export Excel
        </button>
      </div>
    </div>
  `;

  reportContainer.innerHTML = reportHTML;

  // Add event listeners for report actions
  document.getElementById('copyReportBtn').addEventListener('click', () => {
    let idsText;
    if (migratedRecords && migratedRecords.length > 0) {
      idsText = migratedRecords.map(r => `${r.name}\t${r.sourceId}\t${r.targetId}`).join('\n');
    } else {
      idsText = createdRecordIds.join('\n');
    }
    navigator.clipboard.writeText(idsText).then(() => {
      showStatus('Record data copied to clipboard!', 'success');
    }).catch(err => {
      console.error('Failed to copy:', err);
      showStatus('Failed to copy to clipboard', 'error');
    });
  });

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    exportMigrationReportCSV(migrationData);
  });

  document.getElementById('exportExcelBtn').addEventListener('click', () => {
    exportMigrationReportExcel(migrationData);
  });
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Export migration report as CSV
 * @param {Object} migrationData - Migration results data
 */
function exportMigrationReportCSV(migrationData) {
  const { createdRecordIds, migratedRecords, parentSuccess, childSuccess } = migrationData;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const objectName = state.selectedObject?.name || 'records';

  let csvContent = 'Record Name,Source Record ID,Target Record ID,Status\n';

  if (migratedRecords && migratedRecords.length > 0) {
    migratedRecords.forEach(({ sourceId, targetId, name }) => {
      // Escape CSV values that contain commas or quotes
      const escapedName = name ? `"${name.replace(/"/g, '""')}"` : '';
      csvContent += `${escapedName},${sourceId},${targetId},Created\n`;
    });
  } else if (createdRecordIds) {
    createdRecordIds.forEach(id => {
      csvContent += `,,${id},Created\n`;
    });
  }

  // Add summary
  csvContent += `\nSummary\n`;
  csvContent += `Total Records Created,${migratedRecords?.length || createdRecordIds?.length || 0}\n`;
  csvContent += `Parent Records,${parentSuccess || 0}\n`;
  csvContent += `Child Records,${childSuccess || 0}\n`;
  csvContent += `Migration Date,${new Date().toISOString()}\n`;
  csvContent += `Source Org,${state.sourceSession?.instanceUrl || ''}\n`;
  csvContent += `Target Org,${state.targetSession?.instanceUrl || ''}\n`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `migration-report-${objectName}-${timestamp}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);

  appendLog('info', `Migration report exported: migration-report-${objectName}-${timestamp}.csv`);
}

/**
 * Export migration report as Excel with two tabs
 * Tab 1: Summary - Migration summary information
 * Tab 2: Records - All migrated records with full field data
 * @param {Object} migrationData - Migration results data
 */
function exportMigrationReportExcel(migrationData) {
  const { migratedRecords, parentSuccess, childSuccess, createdRecordIds } = migrationData;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const objectName = state.selectedObject?.name || 'records';
  const fileName = `migration-report-${objectName}-${timestamp}.xlsx`;

  // Escape XML special characters
  const escapeXml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Build Summary sheet data
  const summaryData = [
    ['Migration Report Summary'],
    [''],
    ['Property', 'Value'],
    ['Object', objectName],
    ['Total Records Created', migratedRecords?.length || createdRecordIds?.length || 0],
    ['Parent Records', parentSuccess || 0],
    ['Child Records', childSuccess || 0],
    ['Migration Date', new Date().toLocaleString()],
    ['Source Org', state.sourceSession?.instanceUrl || ''],
    ['Target Org', state.targetSession?.instanceUrl || ''],
    [''],
    ['ID Mapping'],
    ['Record Name', 'Source Record ID', 'Target Record ID']
  ];

  // Add ID mapping rows
  if (migratedRecords && migratedRecords.length > 0) {
    migratedRecords.forEach(({ sourceId, targetId, name }) => {
      summaryData.push([name || 'N/A', sourceId, targetId]);
    });
  }

  // Build Records sheet data with all fields
  let recordsData = [];
  if (migratedRecords && migratedRecords.length > 0 && migratedRecords[0].record) {
    // Get all field names from the first record
    const allFields = Object.keys(migratedRecords[0].record);

    // Header row: Source ID, Target ID, Name, then all other fields
    const headerRow = ['Source Record ID', 'Target Record ID', 'Record Name', ...allFields];
    recordsData.push(headerRow);

    // Data rows
    migratedRecords.forEach(({ sourceId, targetId, name, record }) => {
      const row = [sourceId, targetId, name || 'N/A'];
      allFields.forEach(field => {
        let value = record[field];
        // Handle object values (like attributes)
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        row.push(value ?? '');
      });
      recordsData.push(row);
    });
  } else {
    recordsData = [
      ['Target Record ID'],
      ...(createdRecordIds || []).map(id => [id])
    ];
  }

  // Generate Excel XML (SpreadsheetML format - works without external library)
  const generateSheetXml = (data) => {
    let xml = '';
    data.forEach((row, rowIndex) => {
      xml += '<Row ss:Index="' + (rowIndex + 1) + '">';
      row.forEach((cell, cellIndex) => {
        const cellType = typeof cell === 'number' ? 'Number' : 'String';
        xml += `<Cell ss:Index="${cellIndex + 1}"><Data ss:Type="${cellType}">${escapeXml(cell)}</Data></Cell>`;
      });
      xml += '</Row>\n';
    });
    return xml;
  };

  const excelXml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:x2="http://schemas.microsoft.com/office/excel/2003/xml">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Title>Migration Report</Title>
    <Author>Salesforce Picklist Manager</Author>
  </DocumentProperties>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Bottom"/>
      <Borders/>
      <Font/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="Header">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:Bold="1" ss:Color="FFFFFF" ss:Size="11"/>
      <Interior ss:Color="6B3FA0" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Summary">
    <Table ss:ExpandedColumnCount="${Math.max(...summaryData.map(r => r.length))}" ss:ExpandedRowCount="${summaryData.length}">
      ${generateSheetXml(summaryData)}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <PageSetup>
        <Header x:Margin="0.5"/>
        <Footer x:Margin="0.5"/>
        <PageMargins x:Bottom="0.75" x:Left="0.7" x:Right="0.7" x:Top="0.75"/>
      </PageSetup>
      <Print>
        <ValidPrinterInfo/>
        <HorizontalResolution>300</HorizontalResolution>
        <VerticalResolution>300</VerticalResolution>
      </Print>
      <Selected/>
      <Panes>
        <Pane>
          <Number>3</Number>
        </Pane>
      </Panes>
      <ProtectObjects>False</ProtectObjects>
      <ProtectScenarios>False</ProtectScenarios>
    </WorksheetOptions>
  </Worksheet>
  <Worksheet ss:Name="All Records">
    <Table ss:ExpandedColumnCount="${Math.max(...recordsData.map(r => r.length))}" ss:ExpandedRowCount="${recordsData.length}">
      ${generateSheetXml(recordsData)}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <PageSetup>
        <Header x:Margin="0.5"/>
        <Footer x:Margin="0.5"/>
        <PageMargins x:Bottom="0.75" x:Left="0.7" x:Right="0.7" x:Top="0.75"/>
      </PageSetup>
      <Print>
        <ValidPrinterInfo/>
        <HorizontalResolution>300</HorizontalResolution>
        <VerticalResolution>300</VerticalResolution>
      </Print>
      <Selected/>
      <Panes>
        <Pane>
          <Number>3</Number>
        </Pane>
      </Panes>
      <ProtectObjects>False</ProtectObjects>
      <ProtectScenarios>False</ProtectScenarios>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;

  // Download the file using correct MIME type
  const blob = new Blob([excelXml], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);

  appendLog('info', `Migration report exported: ${fileName}`);
}

/**
 * Show rollback button
 */
function showRollbackButton() {
  // Check if rollback button already exists
  if (document.getElementById('rollbackBtn')) {
    return;
  }

  const rollbackBtn = document.createElement('button');
  rollbackBtn.id = 'rollbackBtn';
  rollbackBtn.className = 'btn btn-secondary';
  rollbackBtn.innerHTML = `
    <span class="material-symbols-rounded">undo</span>
    Rollback Migration
  `;
  rollbackBtn.addEventListener('click', rollbackMigration);

  // Insert after start migration button
  elements.startMigrationBtn.parentNode.insertBefore(rollbackBtn, elements.startMigrationBtn.nextSibling);
}

/**
 * Rollback migration by deleting created records
 */
async function rollbackMigration() {
  if (!state.migrationResults || !state.migrationResults.createdRecordIds || state.migrationResults.createdRecordIds.length === 0) {
    showStatus('No records to rollback', 'warning');
    return;
  }

  const confirmed = confirm(
    `This will delete ${state.migrationResults.createdRecordIds.length} records that were created during migration.\n\n` +
    `This action cannot be undone. Continue?`
  );

  if (!confirmed) return;

  try {
    appendLog('info', `Starting rollback of ${state.migrationResults.createdRecordIds.length} records...`);
    updateProgress(0, 'Rolling back migration...');

    const response = await chrome.runtime.sendMessage({
      action: 'ROLLBACK_MIGRATION',
      targetSession: {
        sessionId: state.targetSession.sessionId,
        instanceUrl: state.targetSession.instanceUrl
      },
      recordIds: state.migrationResults.createdRecordIds
    });

    if (!response.success) {
      throw new Error(response.error || 'Rollback failed');
    }

    appendLog('success', `Rollback completed!`);
    appendLog('info', `Records deleted: ${response.data.success || 0}`);
    appendLog('info', `Deletions failed: ${response.data.failed || 0}`);

    if (response.data.errors && response.data.errors.length > 0) {
      appendLog('warning', `Rollback errors: ${response.data.errors.length}`);
      response.data.errors.slice(0, 10).forEach(err => appendLog('error', err));
    }

    showStatus('Rollback completed!', 'success');
    updateProgress(100, 'Rollback complete');

    // Remove rollback button
    const rollbackBtn = document.getElementById('rollbackBtn');
    if (rollbackBtn) {
      rollbackBtn.remove();
    }

  } catch (error) {
    console.error('[Record Migrator] Rollback error:', error);
    appendLog('error', `Rollback failed: ${error.message}`);
    showStatus(`Rollback failed: ${error.message}`, 'error');
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
  state.sourceFields = [];
  state.targetFields = [];
  state.fieldMapping = null;
  state.picklistFields = [];
  state.picklistMappings = {};
  state.childRelationships = [];
  state.selectedRelationships = [];
  state.externalIdFields = [];
  state.selectedExternalIdField = null;
  state.useExternalId = true;
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
  elements.fieldMappingPreview.classList.add('hidden');
  elements.relationshipsPreview.classList.add('hidden');
  elements.migrationProgress.classList.add('hidden');
  elements.migrationLogContainer.classList.add('hidden');
  elements.migrationLog.innerHTML = '';
  elements.useExternalIdCheckbox.checked = true;
  elements.externalIdFieldContainer.classList.remove('hidden');

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
