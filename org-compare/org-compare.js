// Org Compare Tool UI Logic
// Handles session detection, metadata comparison, and results display

import OrgCompareAPI from '../background/org-compare-api.js';
import ThemeManager from '../background/theme-manager.js';

// Global state
let availableSessions = [];
let sourceSession = null;
let targetSession = null;
let comparisonResults = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize theme first for smooth UX
  await ThemeManager.initTheme();

  // Set up event listeners
  setupEventListeners();

  // Load available sessions
  await loadSessions();
});

function setupEventListeners() {
  // Session selectors
  document.getElementById('sourceOrgSelect').addEventListener('change', handleSourceOrgChange);
  document.getElementById('targetOrgSelect').addEventListener('change', handleTargetOrgChange);
  document.getElementById('refreshSessionsBtn').addEventListener('click', loadSessions);

  // Metadata type checkboxes
  const metadataCheckboxes = document.querySelectorAll('input[name="metadataType"]');
  metadataCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', handleMetadataTypeChange);
  });

  // Object/Field selectors
  document.getElementById('objectSelect').addEventListener('change', handleObjectSelectChange);

  // Compare button
  document.getElementById('compareBtn').addEventListener('click', runComparison);

  // Export buttons
  document.getElementById('exportBtn').addEventListener('click', showExportModal);
  document.getElementById('doExportBtn').addEventListener('click', doExport);
  document.getElementById('cancelExportBtn').addEventListener('click', hideExportModal);

  // Filters
  document.getElementById('statusFilter').addEventListener('change', filterResults);
  document.getElementById('typeFilter').addEventListener('change', filterResults);
  document.getElementById('searchInput').addEventListener('input', filterResults);
}

async function loadSessions() {
  const statusEl = document.getElementById('sessionStatus');
  const sourceSelect = document.getElementById('sourceOrgSelect');
  const targetSelect = document.getElementById('targetOrgSelect');

  try {
    statusEl.innerHTML = '<span class="material-symbols-rounded spinning">sync</span> Scanning for active Salesforce sessions...';
    statusEl.className = 'session-status';

    // Get all active sessions
    availableSessions = await OrgCompareAPI.getAllActiveSessions();

    if (availableSessions.length === 0) {
      statusEl.innerHTML = '<span class="material-symbols-rounded">warning</span> No active Salesforce sessions found. Please open Salesforce tabs and refresh.';
      statusEl.className = 'session-status error';
      return;
    }

    // Populate dropdowns
    populateOrgSelect(sourceSelect, availableSessions);
    populateOrgSelect(targetSelect, availableSessions);

    statusEl.innerHTML = `<span class="material-symbols-rounded">check_circle</span> Found ${availableSessions.length} active Salesforce session(s)`;
    statusEl.className = 'session-status success';

    console.log('[OrgCompare] Loaded sessions:', availableSessions);

  } catch (error) {
    console.error('[OrgCompare] Error loading sessions:', error);
    statusEl.innerHTML = `<span class="material-symbols-rounded">error</span> Error: ${error.message}`;
    statusEl.className = 'session-status error';
  }
}

function populateOrgSelect(selectEl, sessions) {
  // Keep the first option
  selectEl.innerHTML = '<option value="">-- Select Org --</option>';

  sessions.forEach((session, index) => {
    const option = document.createElement('option');
    option.value = index;

    // Build display text with org name and type
    let displayText = session.orgName || session.hostname;
    if (session.orgType) {
      displayText += ` (${session.orgType})`;
    }
    if (session.isSandbox) {
      displayText += ' [Sandbox]';
    }

    option.textContent = displayText;
    selectEl.appendChild(option);
  });
}

function handleSourceOrgChange(e) {
  const index = e.target.value;
  const infoEl = document.getElementById('sourceOrgInfo');

  if (index === '') {
    sourceSession = null;
    infoEl.textContent = '';
    infoEl.className = 'org-info';
  } else {
    sourceSession = availableSessions[parseInt(index)];
    infoEl.innerHTML = `
      <strong>Org ID:</strong> ${sourceSession.orgId}<br>
      <strong>URL:</strong> ${sourceSession.instanceUrl}
    `;
    infoEl.className = 'org-info populated';
  }

  updateCompareButtonState();
  loadObjectsForComparison();
}

function handleTargetOrgChange(e) {
  const index = e.target.value;
  const infoEl = document.getElementById('targetOrgInfo');

  if (index === '') {
    targetSession = null;
    infoEl.textContent = '';
    infoEl.className = 'org-info';
  } else {
    targetSession = availableSessions[parseInt(index)];
    infoEl.innerHTML = `
      <strong>Org ID:</strong> ${targetSession.orgId}<br>
      <strong>URL:</strong> ${targetSession.instanceUrl}
    `;
    infoEl.className = 'org-info populated';
  }

  updateCompareButtonState();
  loadObjectsForComparison();
}

function handleMetadataTypeChange() {
  const selectedTypes = getSelectedMetadataTypes();

  // Show object/field selector if needed
  const needsObjectSelector = selectedTypes.some(t =>
    ['fields', 'picklists', 'dependencies'].includes(t)
  );
  const needsFieldSelector = selectedTypes.includes('picklists');

  const selectorContainer = document.getElementById('objectFieldSelector');
  const fieldSelectorContainer = document.getElementById('fieldSelectorContainer');

  if (needsObjectSelector) {
    selectorContainer.classList.remove('hidden');
    loadObjectsForComparison();
  } else {
    selectorContainer.classList.add('hidden');
  }

  if (needsFieldSelector) {
    fieldSelectorContainer.style.display = 'block';
  } else {
    fieldSelectorContainer.style.display = 'none';
  }

  updateCompareButtonState();
}

function getSelectedMetadataTypes() {
  const checkboxes = document.querySelectorAll('input[name="metadataType"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

async function loadObjectsForComparison() {
  if (!sourceSession) return;

  const objectSelect = document.getElementById('objectSelect');

  try {
    objectSelect.innerHTML = '<option value="">Loading objects...</option>';

    const objects = await OrgCompareAPI.getObjects(sourceSession);

    // Filter to custom objects and common standard objects
    const filteredObjects = objects
      .filter(obj => {
        if (obj.custom) return true;
        // Include common standard objects
        const standardObjects = ['Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Task', 'Event'];
        return standardObjects.includes(obj.name);
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    objectSelect.innerHTML = '<option value="">-- All Objects --</option>';
    filteredObjects.forEach(obj => {
      const option = document.createElement('option');
      option.value = obj.name;
      option.textContent = `${obj.label} (${obj.name})`;
      objectSelect.appendChild(option);
    });

    console.log('[OrgCompare] Loaded', filteredObjects.length, 'objects');

  } catch (error) {
    console.error('[OrgCompare] Error loading objects:', error);
    objectSelect.innerHTML = '<option value="">Error loading objects</option>';
  }
}

async function handleObjectSelectChange(e) {
  const objectName = e.target.value;
  const fieldSelect = document.getElementById('fieldSelect');

  if (!objectName || !sourceSession) {
    fieldSelect.innerHTML = '<option value="">-- All Fields --</option>';
    return;
  }

  // Load picklist fields if picklists is selected
  const selectedTypes = getSelectedMetadataTypes();
  if (!selectedTypes.includes('picklists')) return;

  try {
    fieldSelect.innerHTML = '<option value="">Loading fields...</option>';

    const metadata = await OrgCompareAPI.getObjectMetadata(sourceSession, objectName);
    const picklistFields = metadata.fields.filter(f =>
      f.type === 'picklist' || f.type === 'multipicklist'
    );

    fieldSelect.innerHTML = '<option value="">-- All Fields --</option>';
    picklistFields.forEach(field => {
      const option = document.createElement('option');
      option.value = field.name;
      option.textContent = `${field.label} (${field.name})`;
      fieldSelect.appendChild(option);
    });

    console.log('[OrgCompare] Loaded', picklistFields.length, 'picklist fields');

  } catch (error) {
    console.error('[OrgCompare] Error loading fields:', error);
    fieldSelect.innerHTML = '<option value="">Error loading fields</option>';
  }

  updateCompareButtonState();
}

function updateCompareButtonState() {
  const compareBtn = document.getElementById('compareBtn');
  const selectedTypes = getSelectedMetadataTypes();

  // Check if we can run comparison
  let canCompare = sourceSession && targetSession && selectedTypes.length > 0;

  // Object/field selection is now OPTIONAL - used as filters, not requirements
  // Users can compare all fields/picklists across all objects, or filter to a specific object

  // Check source and target are different
  if (sourceSession && targetSession && sourceSession.orgId === targetSession.orgId) {
    canCompare = false;
  }

  compareBtn.disabled = !canCompare;
}

async function runComparison() {
  const resultsContainer = document.getElementById('resultsContainer');
  const summarySection = document.getElementById('summarySection');
  const filterBar = document.getElementById('filterBar');
  const exportBtn = document.getElementById('exportBtn');

  try {
    // Show loading state
    resultsContainer.innerHTML = `
      <div class="loading-message">
        <span class="material-symbols-rounded spinning">sync</span>
        Comparing metadata between orgs...
      </div>
    `;

    const selectedTypes = getSelectedMetadataTypes();
    const options = {
      objectName: document.getElementById('objectSelect').value || null,
      fieldName: document.getElementById('fieldSelect').value || null
    };

    console.log('[OrgCompare] Running comparison:', selectedTypes, options);

    // Run the comparison
    comparisonResults = await OrgCompareAPI.compareOrgs(
      sourceSession,
      targetSession,
      selectedTypes,
      options
    );

    console.log('[OrgCompare] Comparison complete:', comparisonResults);

    // Update summary
    updateSummary(comparisonResults.summary);
    summarySection.classList.remove('hidden');

    // Update type filter
    updateTypeFilter(selectedTypes);
    filterBar.classList.remove('hidden');

    // Render results
    renderResults(comparisonResults);

    // Enable export
    exportBtn.disabled = false;

  } catch (error) {
    console.error('[OrgCompare] Comparison error:', error);
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">error</span>
        <p>Error: ${error.message}</p>
      </div>
    `;
  }
}

function updateSummary(summary) {
  document.getElementById('totalCount').textContent = summary.totalItems;
  document.getElementById('matchCount').textContent = summary.matches;
  document.getElementById('differentCount').textContent = summary.differences;
  document.getElementById('sourceOnlyCount').textContent = summary.sourceOnly;
  document.getElementById('targetOnlyCount').textContent = summary.targetOnly;
}

function updateTypeFilter(types) {
  const typeFilter = document.getElementById('typeFilter');
  typeFilter.innerHTML = '<option value="">All Types</option>';

  const typeLabels = {
    objects: 'Objects',
    fields: 'Fields',
    validationRules: 'Validation Rules',
    flows: 'Flows',
    picklists: 'Picklists',
    dependencies: 'Dependencies'
  };

  types.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = typeLabels[type] || type;
    typeFilter.appendChild(option);
  });
}

function renderResults(results) {
  const container = document.getElementById('resultsContainer');
  container.innerHTML = '';

  for (const [metadataType, comparison] of Object.entries(results.comparisons)) {
    const section = createComparisonSection(metadataType, comparison);
    container.appendChild(section);
  }
}

function createComparisonSection(metadataType, comparison) {
  const section = document.createElement('div');
  section.className = 'comparison-section';
  section.dataset.type = metadataType;

  const typeLabels = {
    objects: 'Objects',
    fields: 'Fields',
    validationRules: 'Validation Rules',
    flows: 'Flows',
    picklists: 'Picklists',
    dependencies: 'Dependencies'
  };

  const typeIcons = {
    objects: 'database',
    fields: 'text_fields',
    validationRules: 'rule',
    flows: 'account_tree',
    picklists: 'list',
    dependencies: 'link'
  };

  // Header
  const header = document.createElement('div');
  header.className = 'comparison-header';
  header.innerHTML = `
    <div class="comparison-title">
      <span class="material-symbols-rounded">${typeIcons[metadataType] || 'category'}</span>
      ${typeLabels[metadataType] || metadataType}
    </div>
    <div class="comparison-stats">
      <span class="comparison-stat match">${comparison.matches} match</span>
      <span class="comparison-stat different">${comparison.differences} different</span>
      <span class="comparison-stat source-only">${comparison.sourceOnly} source only</span>
      <span class="comparison-stat target-only">${comparison.targetOnly} target only</span>
    </div>
  `;

  // Toggle collapse on header click
  header.addEventListener('click', () => {
    itemsContainer.classList.toggle('hidden');
  });

  section.appendChild(header);

  // Items
  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'comparison-items';

  if (comparison.error) {
    itemsContainer.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">error</span>
        <p>${comparison.error}</p>
      </div>
    `;
  } else if (comparison.items.length === 0) {
    itemsContainer.innerHTML = `
      <div class="empty-state">
        <p>No items to compare</p>
      </div>
    `;
  } else {
    comparison.items.forEach(item => {
      const itemEl = createComparisonItem(item);
      itemsContainer.appendChild(itemEl);
    });
  }

  section.appendChild(itemsContainer);
  return section;
}

function createComparisonItem(item) {
  const div = document.createElement('div');
  div.className = `comparison-item ${item.status}`;
  div.dataset.status = item.status;
  div.dataset.key = item.key.toLowerCase();

  // Status label
  const statusLabels = {
    match: 'Match',
    different: 'Different',
    sourceOnly: 'Source Only',
    targetOnly: 'Target Only'
  };

  // Key column
  const keyCol = document.createElement('div');
  keyCol.className = 'item-key';
  keyCol.innerHTML = `
    <span>${escapeHtml(item.key)}</span>
    <span class="item-status ${item.status}">${statusLabels[item.status]}</span>
  `;

  // Source values column
  const sourceCol = document.createElement('div');
  sourceCol.className = 'item-values';
  sourceCol.innerHTML = `<h4>Source Org</h4>`;

  for (const [field, value] of Object.entries(item.sourceValues)) {
    const isDifferent = item.differences.includes(field);
    const valueClass = value === null ? 'null' : (isDifferent ? 'different' : '');
    const displayValue = value === null ? '(not present)' : formatValue(value);

    const row = document.createElement('div');
    row.className = 'value-row';
    row.innerHTML = `
      <span class="value-label">${field}:</span>
      <span class="value-data ${valueClass}" title="${escapeHtml(String(displayValue))}">${escapeHtml(String(displayValue))}</span>
    `;
    sourceCol.appendChild(row);
  }

  // Target values column
  const targetCol = document.createElement('div');
  targetCol.className = 'item-values';
  targetCol.innerHTML = `<h4>Target Org</h4>`;

  for (const [field, value] of Object.entries(item.targetValues)) {
    const isDifferent = item.differences.includes(field);
    const valueClass = value === null ? 'null' : (isDifferent ? 'different' : '');
    const displayValue = value === null ? '(not present)' : formatValue(value);

    const row = document.createElement('div');
    row.className = 'value-row';
    row.innerHTML = `
      <span class="value-label">${field}:</span>
      <span class="value-data ${valueClass}" title="${escapeHtml(String(displayValue))}">${escapeHtml(String(displayValue))}</span>
    `;
    targetCol.appendChild(row);
  }

  div.appendChild(keyCol);
  div.appendChild(sourceCol);
  div.appendChild(targetCol);

  return div;
}

function formatValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length + ' items';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function filterResults() {
  const statusFilter = document.getElementById('statusFilter').value;
  const typeFilter = document.getElementById('typeFilter').value;
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();

  // Filter sections by type
  const sections = document.querySelectorAll('.comparison-section');
  sections.forEach(section => {
    const type = section.dataset.type;

    if (typeFilter && type !== typeFilter) {
      section.classList.add('hidden');
    } else {
      section.classList.remove('hidden');

      // Filter items within section
      const items = section.querySelectorAll('.comparison-item');
      items.forEach(item => {
        const itemStatus = item.dataset.status;
        const itemKey = item.dataset.key;

        const statusMatch = !statusFilter || itemStatus === statusFilter;
        const searchMatch = !searchTerm || itemKey.includes(searchTerm);

        if (statusMatch && searchMatch) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    }
  });
}

function showExportModal() {
  document.getElementById('exportModal').classList.remove('hidden');
}

function hideExportModal() {
  document.getElementById('exportModal').classList.add('hidden');
}

function doExport() {
  if (!comparisonResults) return;

  const format = document.querySelector('input[name="exportFormat"]:checked').value;

  let content, filename, mimeType;

  if (format === 'json') {
    content = OrgCompareAPI.exportToJSON(comparisonResults);
    filename = `org-compare-${Date.now()}.json`;
    mimeType = 'application/json';
  } else {
    content = OrgCompareAPI.exportToCSV(comparisonResults);
    filename = `org-compare-${Date.now()}.csv`;
    mimeType = 'text/csv;charset=utf-8';
    // Add BOM for Excel
    content = '\uFEFF' + content;
  }

  // Download
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log('[OrgCompare] Exported results to', filename);
  hideExportModal();
}
