// Org Compare Tool UI Logic
// Handles session detection, metadata comparison, and results display

import OrgCompareAPI from '../../background/org-compare-api.js';
import ThemeManager from '../../background/theme-manager.js';

// Global state
let availableSessions = [];
let sourceSession = null;
let targetSession = null;
let comparisonResults = null;
let collapsedSections = new Set(); // Track collapsed sections by metadata type
let currentView = 'comparison'; // 'comparison' or 'xml'
let xmlData = null; // Store XML data for current comparison

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

  // Permission selectors
  document.getElementById('permissionTypeSelect').addEventListener('change', handlePermissionTypeChange);
  document.getElementById('permissionItemSelect').addEventListener('change', updateCompareButtonState);

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

  // Collapse/Expand buttons
  document.getElementById('expandAllBtn').addEventListener('click', expandAllSections);
  document.getElementById('collapseAllBtn').addEventListener('click', collapseAllSections);

  // View toggle buttons
  document.getElementById('comparisonViewBtn').addEventListener('click', () => switchView('comparison'));
  document.getElementById('xmlViewBtn').addEventListener('click', () => switchView('xml'));

  // XML viewer buttons
  document.getElementById('copySourceXmlBtn').addEventListener('click', () => copyXml('source'));
  document.getElementById('copyTargetXmlBtn').addEventListener('click', () => copyXml('target'));
  document.getElementById('downloadSourceXmlBtn').addEventListener('click', () => downloadXml('source'));
  document.getElementById('downloadTargetXmlBtn').addEventListener('click', () => downloadXml('target'));
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

    // Add instance subdomain to differentiate sandboxes with same name
    // Extract subdomain from hostname (e.g., "mycompany--dev.my.salesforce.com" -> "mycompany--dev")
    const subdomain = session.hostname.split('.')[0];
    displayText += ` - ${subdomain}`;

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
  const needsPermissionSelector = selectedTypes.includes('permissions');

  const selectorContainer = document.getElementById('objectFieldSelector');
  const fieldSelectorContainer = document.getElementById('fieldSelectorContainer');
  const permissionSelector = document.getElementById('permissionSelector');

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

  if (needsPermissionSelector) {
    permissionSelector.classList.remove('hidden');
  } else {
    permissionSelector.classList.add('hidden');
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

async function handlePermissionTypeChange(e) {
  const permissionType = e.target.value;
  const permissionItemContainer = document.getElementById('permissionItemContainer');
  const permissionItemSelect = document.getElementById('permissionItemSelect');

  if (!permissionType || !sourceSession) {
    permissionItemContainer.style.display = 'none';
    permissionItemSelect.innerHTML = '<option value="">-- Select Item --</option>';
    return;
  }

  try {
    permissionItemContainer.style.display = 'block';
    permissionItemSelect.innerHTML = '<option value="">Loading...</option>';

    let items;
    if (permissionType === 'Profile') {
      items = await OrgCompareAPI.getProfiles(sourceSession);
    } else if (permissionType === 'PermissionSet') {
      items = await OrgCompareAPI.getPermissionSets(sourceSession);
    }

    permissionItemSelect.innerHTML = '<option value="">-- Select Item --</option>';
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.label || item.name;
      option.dataset.name = item.name;
      permissionItemSelect.appendChild(option);
    });

    console.log('[OrgCompare] Loaded', items.length, permissionType + 's');

  } catch (error) {
    console.error('[OrgCompare] Error loading permission items:', error);
    permissionItemSelect.innerHTML = '<option value="">Error loading items</option>';
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

  // Check if permissions is selected - requires permission type and item selection
  if (selectedTypes.includes('permissions')) {
    const permissionType = document.getElementById('permissionTypeSelect').value;
    const permissionItem = document.getElementById('permissionItemSelect').value;
    if (!permissionType || !permissionItem) {
      canCompare = false;
    }
  }

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
  const viewToggle = document.getElementById('viewToggle');
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
      fieldName: document.getElementById('fieldSelect').value || null,
      permissionType: document.getElementById('permissionTypeSelect').value || null,
      permissionId: document.getElementById('permissionItemSelect').value || null
    };

    // Run the comparison
    comparisonResults = await OrgCompareAPI.compareOrgs(
      sourceSession,
      targetSession,
      selectedTypes,
      options
    );

    // Clear XML cache when running new comparison
    xmlData = null;

    // Load collapsed state from localStorage
    loadCollapsedState();

    // Update summary
    updateSummary(comparisonResults.summary);
    summarySection.classList.remove('hidden');

    // Update type filter
    updateTypeFilter(selectedTypes);
    filterBar.classList.remove('hidden');

    // Show view toggle
    viewToggle.classList.remove('hidden');

    // Render results
    renderResults(comparisonResults);

    // Switch to comparison view
    switchView('comparison');

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
    dependencies: 'Dependencies',
    permissions: 'Permissions'
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
    dependencies: 'Dependencies',
    permissions: 'Permissions'
  };

  const typeIcons = {
    objects: 'database',
    fields: 'text_fields',
    validationRules: 'rule',
    flows: 'account_tree',
    picklists: 'list',
    dependencies: 'link',
    permissions: 'admin_panel_settings'
  };

  // Header
  const header = document.createElement('div');
  header.className = 'comparison-header';

  const isCollapsed = collapsedSections.has(metadataType);
  const collapseIcon = isCollapsed ? 'expand_more' : 'expand_less';

  header.innerHTML = `
    <div class="comparison-title">
      <span class="material-symbols-rounded collapse-icon">${collapseIcon}</span>
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
    toggleSection(metadataType, itemsContainer, header);
  });

  section.appendChild(header);

  // Items
  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'comparison-items';

  // Set initial collapsed state
  if (isCollapsed) {
    itemsContainer.classList.add('hidden');
  }

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

  // Item header (always visible)
  const itemHeader = document.createElement('div');
  itemHeader.className = 'item-header';
  itemHeader.innerHTML = `
    <span class="material-symbols-rounded item-collapse-icon">expand_less</span>
    <span class="item-name">${escapeHtml(item.key)}</span>
    <span class="item-status ${item.status}">${statusLabels[item.status]}</span>
  `;

  // Item details container (collapsible)
  const itemDetails = document.createElement('div');
  itemDetails.className = 'item-details';

  // Source values column
  const sourceCol = document.createElement('div');
  sourceCol.className = 'item-values';
  sourceCol.innerHTML = `<h4>Source Org</h4>`;

  for (const [field, value] of Object.entries(item.sourceValues)) {
    // Skip valueMappings - it has its own dedicated section
    if (field === 'valueMappings') continue;

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
    // Skip valueMappings - it has its own dedicated section
    if (field === 'valueMappings') continue;

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

  itemDetails.appendChild(sourceCol);
  itemDetails.appendChild(targetCol);

  // Add value mapping section for dependencies
  // Show differences if they exist, OR show mappings for sourceOnly/targetOnly items
  if (item.valueMappingDifferences && item.valueMappingDifferences.length > 0) {
    const mappingSection = createValueMappingSection(item.valueMappingDifferences);
    itemDetails.appendChild(mappingSection);
  } else if (item.sourceValues && item.sourceValues.valueMappings !== undefined && item.sourceValues.valueMappings.length > 0) {
    // Source only - show source mappings
    const mappingSection = createSingleOrgMappingSection(item.sourceValues.valueMappings, 'Source Org');
    itemDetails.appendChild(mappingSection);
  } else if (item.targetValues && item.targetValues.valueMappings !== undefined && item.targetValues.valueMappings.length > 0) {
    // Target only - show target mappings
    const mappingSection = createSingleOrgMappingSection(item.targetValues.valueMappings, 'Target Org');
    itemDetails.appendChild(mappingSection);
  } else if ((item.sourceValues && item.sourceValues.valueMappings !== undefined) ||
             (item.targetValues && item.targetValues.valueMappings !== undefined)) {
    // Dependency exists but has no value mappings (e.g., controlling field not found)
    const noMappingsSection = createNoMappingsSection();
    itemDetails.appendChild(noMappingsSection);
  }

  // Add click handler to toggle details
  itemHeader.addEventListener('click', () => {
    itemDetails.classList.toggle('collapsed');
    const icon = itemHeader.querySelector('.item-collapse-icon');
    icon.textContent = itemDetails.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
  });

  div.appendChild(itemHeader);
  div.appendChild(itemDetails);

  return div;
}

function createValueMappingSection(valueMappingDifferences) {
  const section = document.createElement('div');
  section.className = 'value-mapping-section';

  const header = document.createElement('h4');
  header.className = 'value-mapping-header';
  header.innerHTML = `
    <span class="material-symbols-rounded">compare_arrows</span>
    Controlling → Dependent Value Mappings (${valueMappingDifferences.length} difference${valueMappingDifferences.length !== 1 ? 's' : ''})
  `;
  section.appendChild(header);

  const mappingList = document.createElement('div');
  mappingList.className = 'value-mapping-list';

  valueMappingDifferences.forEach(diff => {
    const mappingItem = document.createElement('div');
    mappingItem.className = 'value-mapping-item';

    // Controlling value header
    const controllingHeader = document.createElement('div');
    controllingHeader.className = 'controlling-value-header';
    controllingHeader.innerHTML = `
      <span class="material-symbols-rounded">arrow_right</span>
      <strong>When "${escapeHtml(diff.controllingValue)}"</strong> is selected:
    `;
    mappingItem.appendChild(controllingHeader);

    // Value differences
    const diffContainer = document.createElement('div');
    diffContainer.className = 'value-diff-container';

    // Only in source (removed values)
    if (diff.onlyInSource.length > 0) {
      const sourceOnlyDiv = document.createElement('div');
      sourceOnlyDiv.className = 'value-diff source-only';
      sourceOnlyDiv.innerHTML = `
        <span class="diff-label">
          <span class="material-symbols-rounded">remove_circle</span>
          Only in Source (${diff.onlyInSource.length}):
        </span>
        <span class="diff-values">${diff.onlyInSource.map(v => escapeHtml(v)).join(', ')}</span>
      `;
      diffContainer.appendChild(sourceOnlyDiv);
    }

    // Only in target (added values)
    if (diff.onlyInTarget.length > 0) {
      const targetOnlyDiv = document.createElement('div');
      targetOnlyDiv.className = 'value-diff target-only';
      targetOnlyDiv.innerHTML = `
        <span class="diff-label">
          <span class="material-symbols-rounded">add_circle</span>
          Only in Target (${diff.onlyInTarget.length}):
        </span>
        <span class="diff-values">${diff.onlyInTarget.map(v => escapeHtml(v)).join(', ')}</span>
      `;
      diffContainer.appendChild(targetOnlyDiv);
    }

    // Count summary
    const countSummary = document.createElement('div');
    countSummary.className = 'value-count-summary';
    countSummary.innerHTML = `
      <span>Source: ${diff.sourceCount} value${diff.sourceCount !== 1 ? 's' : ''}</span>
      <span class="count-separator">|</span>
      <span>Target: ${diff.targetCount} value${diff.targetCount !== 1 ? 's' : ''}</span>
    `;
    diffContainer.appendChild(countSummary);

    mappingItem.appendChild(diffContainer);
    mappingList.appendChild(mappingItem);
  });

  section.appendChild(mappingList);
  return section;
}

function createSingleOrgMappingSection(valueMappings, orgLabel) {
  const section = document.createElement('div');
  section.className = 'value-mapping-section';

  const header = document.createElement('h4');
  header.className = 'value-mapping-header';
  header.innerHTML = `
    <span class="material-symbols-rounded">arrow_forward</span>
    Controlling → Dependent Value Mappings (${orgLabel})
  `;
  section.appendChild(header);

  const mappingList = document.createElement('div');
  mappingList.className = 'value-mapping-list';

  valueMappings.forEach(mapping => {
    const mappingItem = document.createElement('div');
    mappingItem.className = 'value-mapping-item';

    // Controlling value header
    const controllingHeader = document.createElement('div');
    controllingHeader.className = 'controlling-value-header';
    controllingHeader.innerHTML = `
      <span class="material-symbols-rounded">arrow_right</span>
      <strong>When "${escapeHtml(mapping.controllingValue)}"</strong> is selected:
    `;
    mappingItem.appendChild(controllingHeader);

    // Dependent values list
    const valuesList = document.createElement('div');
    valuesList.className = 'value-diff-container';

    const valuesDiv = document.createElement('div');
    valuesDiv.className = 'value-diff-values-only';
    valuesDiv.innerHTML = `
      <span class="values-label">Enabled values (${mapping.dependentValues.length}):</span>
      <span class="values-list">${mapping.dependentValues.map(v => escapeHtml(v.value)).join(', ')}</span>
    `;
    valuesList.appendChild(valuesDiv);

    mappingItem.appendChild(valuesList);
    mappingList.appendChild(mappingItem);
  });

  section.appendChild(mappingList);
  return section;
}

function createNoMappingsSection() {
  const section = document.createElement('div');
  section.className = 'value-mapping-section';

  const message = document.createElement('div');
  message.className = 'no-mappings-message';
  message.innerHTML = `
    <span class="material-symbols-rounded">info</span>
    <p>No value mappings available. This may occur if the controlling field could not be found or does not have picklist values configured.</p>
  `;
  section.appendChild(message);

  return section;
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

// ============================================
// Collapse/Expand Functions
// ============================================

function toggleSection(metadataType, itemsContainer, header) {
  const isCurrentlyCollapsed = itemsContainer.classList.contains('hidden');

  itemsContainer.classList.toggle('hidden');

  // Update icon
  const collapseIcon = header.querySelector('.collapse-icon');
  collapseIcon.textContent = isCurrentlyCollapsed ? 'expand_less' : 'expand_more';

  // Update state
  if (isCurrentlyCollapsed) {
    collapsedSections.delete(metadataType);
  } else {
    collapsedSections.add(metadataType);
  }

  // Save state to localStorage
  saveCollapsedState();
}

function expandAllSections() {
  const sections = document.querySelectorAll('.comparison-section');
  sections.forEach(section => {
    const itemsContainer = section.querySelector('.comparison-items');
    const header = section.querySelector('.comparison-header');
    const collapseIcon = header.querySelector('.collapse-icon');
    const metadataType = section.dataset.type;

    // Expand section
    itemsContainer.classList.remove('hidden');
    collapseIcon.textContent = 'expand_less';
    collapsedSections.delete(metadataType);

    // Expand all items within the section
    const items = section.querySelectorAll('.comparison-item');
    items.forEach(item => {
      const itemDetails = item.querySelector('.item-details');
      const itemIcon = item.querySelector('.item-collapse-icon');
      if (itemDetails && itemIcon) {
        itemDetails.classList.remove('collapsed');
        itemIcon.textContent = 'expand_less';
      }
    });
  });

  saveCollapsedState();
}

function collapseAllSections() {
  const sections = document.querySelectorAll('.comparison-section');
  sections.forEach(section => {
    const itemsContainer = section.querySelector('.comparison-items');
    const header = section.querySelector('.comparison-header');
    const collapseIcon = header.querySelector('.collapse-icon');
    const metadataType = section.dataset.type;

    // Collapse section
    itemsContainer.classList.add('hidden');
    collapseIcon.textContent = 'expand_more';
    collapsedSections.add(metadataType);

    // Collapse all items within the section
    const items = section.querySelectorAll('.comparison-item');
    items.forEach(item => {
      const itemDetails = item.querySelector('.item-details');
      const itemIcon = item.querySelector('.item-collapse-icon');
      if (itemDetails && itemIcon) {
        itemDetails.classList.add('collapsed');
        itemIcon.textContent = 'expand_more';
      }
    });
  });

  saveCollapsedState();
}

function saveCollapsedState() {
  try {
    const state = Array.from(collapsedSections);
    localStorage.setItem('orgCompare_collapsedSections', JSON.stringify(state));
  } catch (error) {
    console.warn('[OrgCompare] Failed to save collapsed state:', error);
  }
}

function loadCollapsedState() {
  try {
    const saved = localStorage.getItem('orgCompare_collapsedSections');
    if (saved) {
      collapsedSections = new Set(JSON.parse(saved));
    }
  } catch (error) {
    console.warn('[OrgCompare] Failed to load collapsed state:', error);
    collapsedSections = new Set();
  }
}

// ============================================
// View Toggle Functions
// ============================================

function switchView(view) {
  currentView = view;

  const comparisonViewBtn = document.getElementById('comparisonViewBtn');
  const xmlViewBtn = document.getElementById('xmlViewBtn');
  const resultsContainer = document.getElementById('resultsContainer');
  const xmlViewerContainer = document.getElementById('xmlViewerContainer');

  if (view === 'comparison') {
    // Show comparison view
    comparisonViewBtn.classList.add('active');
    xmlViewBtn.classList.remove('active');
    resultsContainer.classList.remove('hidden');
    xmlViewerContainer.classList.add('hidden');
  } else if (view === 'xml') {
    // Show XML view
    comparisonViewBtn.classList.remove('active');
    xmlViewBtn.classList.add('active');
    resultsContainer.classList.add('hidden');
    xmlViewerContainer.classList.remove('hidden');

    // Load XML data if not already loaded
    if (!xmlData) {
      loadXmlView();
    }
  }
}

async function loadXmlView() {
  const sourceXmlContent = document.getElementById('sourceXmlContent').querySelector('code');
  const targetXmlContent = document.getElementById('targetXmlContent').querySelector('code');

  try {
    sourceXmlContent.textContent = 'Loading XML...';
    targetXmlContent.textContent = 'Loading XML...';

    // Get XML for selected metadata types
    const selectedTypes = getSelectedMetadataTypes();
    const options = {
      objectName: document.getElementById('objectSelect').value || null,
      fieldName: document.getElementById('fieldSelect').value || null,
      permissionType: document.getElementById('permissionTypeSelect').value || null,
      permissionId: document.getElementById('permissionItemSelect').value || null
    };

    // Fetch XML metadata for both orgs
    const [sourceXml, targetXml] = await Promise.all([
      OrgCompareAPI.getMetadataAsXml(sourceSession, selectedTypes, options),
      OrgCompareAPI.getMetadataAsXml(targetSession, selectedTypes, options)
    ]);

    // Store XML data
    xmlData = {
      source: sourceXml,
      target: targetXml
    };

    // Format and apply diff highlighting
    const formattedSource = formatXml(sourceXml);
    const formattedTarget = formatXml(targetXml);

    // Generate diff-highlighted XML
    const { sourceDiff, targetDiff } = generateXmlDiff(formattedSource, formattedTarget);

    sourceXmlContent.innerHTML = sourceDiff;
    targetXmlContent.innerHTML = targetDiff;

  } catch (error) {
    console.error('[OrgCompare] Error loading XML view:', error);
    sourceXmlContent.textContent = `Error loading XML: ${error.message}`;
    targetXmlContent.textContent = `Error loading XML: ${error.message}`;
  }
}

function formatXml(xml) {
  // Pretty-print XML with indentation
  if (!xml) return '';

  let formatted = '';
  let indent = 0;
  const tab = '  ';

  xml.split(/>\s*</).forEach(node => {
    if (node.match(/^\/\w/)) indent--; // Closing tag
    formatted += tab.repeat(indent) + '<' + node + '>\n';
    if (node.match(/^<?\w[^>]*[^\/]$/)) indent++; // Opening tag
  });

  return formatted.substring(1, formatted.length - 2);
}

function generateXmlDiff(sourceXml, targetXml) {
  // Split into lines
  const sourceLines = sourceXml.split('\n');
  const targetLines = targetXml.split('\n');

  // Build line maps for quick lookup
  const sourceLineSet = new Set(sourceLines.map(line => line.trim()));
  const targetLineSet = new Set(targetLines.map(line => line.trim()));

  // Generate highlighted source (lines not in target = red)
  const sourceDiff = sourceLines.map(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return line; // Keep empty lines as is

    // Check if this line exists in target
    const isInTarget = targetLineSet.has(trimmedLine);

    if (!isInTarget && trimmedLine.startsWith('<members>')) {
      // This line was removed (red background)
      return `<span class="xml-line-removed">${escapeHtml(line)}</span>`;
    }

    return escapeHtml(line);
  }).join('\n');

  // Generate highlighted target (lines not in source = green)
  const targetDiff = targetLines.map(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return line; // Keep empty lines as is

    // Check if this line exists in source
    const isInSource = sourceLineSet.has(trimmedLine);

    if (!isInSource && trimmedLine.startsWith('<members>')) {
      // This line was added (green background)
      return `<span class="xml-line-added">${escapeHtml(line)}</span>`;
    }

    return escapeHtml(line);
  }).join('\n');

  // Apply syntax highlighting on top of diff highlighting
  return {
    sourceDiff: applySyntaxHighlighting(sourceDiff),
    targetDiff: applySyntaxHighlighting(targetDiff)
  };
}

function applySyntaxHighlighting(html) {
  // Highlight XML tags
  html = html.replace(/(&lt;\/?)(\w+)(.*?)(&gt;)/g,
    '<span class="xml-bracket">$1</span><span class="xml-tag">$2</span><span class="xml-attr">$3</span><span class="xml-bracket">$4</span>');

  // Highlight attribute values
  html = html.replace(/=&quot;([^&]*)&quot;/g,
    '=<span class="xml-value">&quot;$1&quot;</span>');

  return html;
}

function copyXml(side) {
  if (!xmlData) {
    alert('No XML data available. Please load the XML view first.');
    return;
  }

  const xml = side === 'source' ? xmlData.source : xmlData.target;

  navigator.clipboard.writeText(xml).then(() => {
    // Show temporary success message
    const btn = document.getElementById(side === 'source' ? 'copySourceXmlBtn' : 'copyTargetXmlBtn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-rounded">check</span>';
    setTimeout(() => {
      btn.innerHTML = originalHtml;
    }, 2000);
  }).catch(error => {
    console.error('[OrgCompare] Failed to copy XML:', error);
    alert('Failed to copy XML to clipboard');
  });
}

function downloadXml(side) {
  if (!xmlData) {
    alert('No XML data available. Please load the XML view first.');
    return;
  }

  const xml = side === 'source' ? xmlData.source : xmlData.target;
  const orgName = side === 'source' ? sourceSession.orgName : targetSession.orgName;
  const filename = `${orgName || 'org'}_metadata_${Date.now()}.xml`;

  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log('[OrgCompare] Downloaded XML to', filename);
}
