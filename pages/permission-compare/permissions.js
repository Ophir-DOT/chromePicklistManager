// Permission Comparison UI Controller
// Provides interface for comparing Salesforce Profile and Permission Set permissions

import ThemeManager from '../../background/theme-manager.js';
import SessionManager from '../../background/session-manager.js';
import PermissionsAPI from '../../background/permissions-api.js';
import { escapeHtml } from '../../shared/utils.js';

class PermissionComparisonManager {
  constructor() {
    this.profiles = [];
    this.permissionSets = [];
    this.permissionsData = {}; // Cached permissions keyed by ID
    this.comparisonResults = null;
    this.importedData = null;
    this.selectedExportProfiles = new Set();
    this.selectedExportPermSets = new Set();
  }

  async init() {
    console.log('[PermissionComparisonManager] Initializing');

    // Initialize theme
    await ThemeManager.initTheme();

    // Load org info
    await this.loadOrgInfo();

    // Setup event listeners
    this.setupEventListeners();

    // Load initial data
    await this.loadInitialData();

    console.log('[PermissionComparisonManager] Initialization complete');
  }

  async loadOrgInfo() {
    try {
      const session = await SessionManager.getCurrentSession();
      if (session && session.instanceUrl) {
        const hostname = new URL(session.instanceUrl).hostname;
        document.getElementById('orgUrl').textContent = hostname;
      } else {
        document.getElementById('orgUrl').textContent = 'Not connected';
      }
    } catch (error) {
      console.error('[PermissionComparisonManager] Error loading org info:', error);
      document.getElementById('orgUrl').textContent = 'Error loading';
    }
  }

  setupEventListeners() {
    // Header buttons
    document.getElementById('refreshBtn').addEventListener('click', () => this.loadInitialData());
    document.getElementById('exportBtn').addEventListener('click', () => this.switchTab('export'));

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.closest('.tab-btn').dataset.tab));
    });

    // List Tab
    document.getElementById('listTypeSelect').addEventListener('change', () => this.updateListItemSelect());
    document.getElementById('listItemSelect').addEventListener('change', () => this.updateLoadButton());
    document.getElementById('loadPermissionsBtn').addEventListener('click', () => this.loadSelectedPermissions());
    document.getElementById('objectFilter').addEventListener('input', () => this.filterPermissionsList());
    document.getElementById('permTypeFilter').addEventListener('change', () => this.filterPermissionsList());

    // Compare Tab
    document.getElementById('sourceType').addEventListener('change', () => this.updateSourceItems());
    document.getElementById('targetType').addEventListener('change', () => this.updateTargetItems());
    document.getElementById('sourceItem').addEventListener('change', () => this.updateCompareButton());
    document.getElementById('targetItem').addEventListener('change', () => this.updateCompareButton());
    document.getElementById('compareBtn').addEventListener('click', () => this.runComparison());
    document.getElementById('exportComparisonBtn').addEventListener('click', () => this.exportComparison());
    document.getElementById('comparisonObjectFilter').addEventListener('input', () => this.filterComparisonResults());
    document.getElementById('comparisonTypeFilter').addEventListener('change', () => this.filterComparisonResults());
    document.getElementById('comparisonPermType').addEventListener('change', () => this.filterComparisonResults());

    // Import Tab
    document.getElementById('uploadImportBtn').addEventListener('click', () => {
      document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', (e) => this.handleImportFile(e));

    // Export Tab
    document.getElementById('selectAllProfiles').addEventListener('click', () => this.selectAllProfiles(true));
    document.getElementById('clearProfiles').addEventListener('click', () => this.selectAllProfiles(false));
    document.getElementById('selectAllPermSets').addEventListener('click', () => this.selectAllPermSets(true));
    document.getElementById('clearPermSets').addEventListener('click', () => this.selectAllPermSets(false));
    document.getElementById('doExportBtn').addEventListener('click', () => this.doExport());
  }

  async loadInitialData() {
    this.showLoading('Loading profiles and permission sets...');

    try {
      // Load profiles and permission sets in parallel
      const [profiles, permissionSets] = await Promise.all([
        PermissionsAPI.getProfiles(),
        PermissionsAPI.getPermissionSets()
      ]);

      this.profiles = profiles;
      this.permissionSets = permissionSets;

      // Update summary stats
      document.getElementById('profileCount').textContent = profiles.length;
      document.getElementById('permSetCount').textContent = permissionSets.length;
      document.getElementById('objectPermCount').textContent = '-';
      document.getElementById('fieldPermCount').textContent = '-';

      // Populate dropdowns
      this.populateDropdowns();

      // Populate export lists
      this.populateExportLists();

      console.log('[PermissionComparisonManager] Loaded', profiles.length, 'profiles and', permissionSets.length, 'permission sets');
    } catch (error) {
      console.error('[PermissionComparisonManager] Error loading initial data:', error);
      alert(`Error loading data: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  populateDropdowns() {
    // List tab dropdown
    this.updateListItemSelect();

    // Compare tab dropdowns
    this.updateSourceItems();
    this.updateTargetItems();
  }

  updateListItemSelect() {
    const type = document.getElementById('listTypeSelect').value;
    const select = document.getElementById('listItemSelect');
    select.innerHTML = '<option value="">-- Select --</option>';

    const items = type === 'profiles' ? this.profiles : this.permissionSets;
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.Id;
      option.textContent = item.Label || item.Name;
      option.dataset.type = type === 'profiles' ? 'Profile' : 'PermissionSet';
      select.appendChild(option);
    });

    this.updateLoadButton();
  }

  updateLoadButton() {
    const select = document.getElementById('listItemSelect');
    document.getElementById('loadPermissionsBtn').disabled = !select.value;
  }

  updateSourceItems() {
    const type = document.getElementById('sourceType').value;
    const select = document.getElementById('sourceItem');
    select.innerHTML = '<option value="">-- Select --</option>';

    const items = type === 'Profile' ? this.profiles : this.permissionSets;
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.Id;
      option.textContent = item.Label || item.Name;
      select.appendChild(option);
    });

    this.updateCompareButton();
  }

  updateTargetItems() {
    const type = document.getElementById('targetType').value;
    const select = document.getElementById('targetItem');
    select.innerHTML = '<option value="">-- Select --</option>';

    const items = type === 'Profile' ? this.profiles : this.permissionSets;
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.Id;
      option.textContent = item.Label || item.Name;
      select.appendChild(option);
    });

    this.updateCompareButton();
  }

  updateCompareButton() {
    const sourceId = document.getElementById('sourceItem').value;
    const targetId = document.getElementById('targetItem').value;
    document.getElementById('compareBtn').disabled = !sourceId || !targetId;
  }

  populateExportLists() {
    // Populate profiles list
    const profilesList = document.getElementById('exportProfilesList');
    profilesList.innerHTML = this.profiles.map(p => `
      <label>
        <input type="checkbox" value="${p.Id}" data-type="profile">
        ${escapeHtml(p.Name)}
      </label>
    `).join('');

    // Populate permission sets list
    const permSetsList = document.getElementById('exportPermSetsList');
    permSetsList.innerHTML = this.permissionSets.map(ps => `
      <label>
        <input type="checkbox" value="${ps.Id}" data-type="permset">
        ${escapeHtml(ps.Label || ps.Name)}
      </label>
    `).join('');

    // Add change listeners
    profilesList.querySelectorAll('input').forEach(cb => {
      cb.addEventListener('change', () => this.updateExportSelection());
    });
    permSetsList.querySelectorAll('input').forEach(cb => {
      cb.addEventListener('change', () => this.updateExportSelection());
    });
  }

  selectAllProfiles(select) {
    document.querySelectorAll('#exportProfilesList input').forEach(cb => {
      cb.checked = select;
    });
    this.updateExportSelection();
  }

  selectAllPermSets(select) {
    document.querySelectorAll('#exportPermSetsList input').forEach(cb => {
      cb.checked = select;
    });
    this.updateExportSelection();
  }

  updateExportSelection() {
    this.selectedExportProfiles.clear();
    this.selectedExportPermSets.clear();

    document.querySelectorAll('#exportProfilesList input:checked').forEach(cb => {
      this.selectedExportProfiles.add(cb.value);
    });

    document.querySelectorAll('#exportPermSetsList input:checked').forEach(cb => {
      this.selectedExportPermSets.add(cb.value);
    });

    const hasSelection = this.selectedExportProfiles.size > 0 || this.selectedExportPermSets.size > 0;
    document.getElementById('doExportBtn').disabled = !hasSelection;
  }

  switchTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `${tabId}Tab`);
      panel.classList.toggle('hidden', panel.id !== `${tabId}Tab`);
    });
  }

  async loadSelectedPermissions() {
    const select = document.getElementById('listItemSelect');
    const id = select.value;
    const option = select.options[select.selectedIndex];
    const type = option.dataset.type;
    const name = option.textContent;

    if (!id) return;

    this.showLoading(`Loading permissions for ${escapeHtml(name)}...`);

    try {
      const permissions = await PermissionsAPI.getAllPermissions(id, type);

      // Cache the permissions
      this.permissionsData[id] = permissions;

      // Update stats
      document.getElementById('objectPermCount').textContent = permissions.objectPermissions.length;
      document.getElementById('fieldPermCount').textContent = permissions.fieldPermissions.length;

      // Store current display data
      this.currentPermissions = {
        id,
        type,
        name,
        ...permissions
      };

      // Render permissions
      this.renderPermissionsList();

      console.log('[PermissionComparisonManager] Loaded permissions for', name);
    } catch (error) {
      console.error('[PermissionComparisonManager] Error loading permissions:', error);
      alert(`Error loading permissions: ${escapeHtml(error.message)}`);
    } finally {
      this.hideLoading();
    }
  }

  renderPermissionsList() {
    const container = document.getElementById('permissionsListContainer');
    const permType = document.getElementById('permTypeFilter').value;
    const filterText = document.getElementById('objectFilter').value.toLowerCase();

    if (!this.currentPermissions) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">admin_panel_settings</span>
          <p>Select a Profile or Permission Set to view permissions</p>
        </div>
      `;
      return;
    }

    if (permType === 'object') {
      this.renderObjectPermissions(container, filterText);
    } else {
      this.renderFieldPermissions(container, filterText);
    }
  }

  renderObjectPermissions(container, filterText) {
    let perms = this.currentPermissions.objectPermissions;

    if (filterText) {
      perms = perms.filter(p => p.SobjectType.toLowerCase().includes(filterText));
    }

    if (perms.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">search_off</span>
          <p>No object permissions found</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <table class="permissions-table">
        <thead>
          <tr>
            <th>Object</th>
            <th>Create</th>
            <th>Read</th>
            <th>Edit</th>
            <th>Delete</th>
            <th>View All</th>
            <th>Modify All</th>
          </tr>
        </thead>
        <tbody>
          ${perms.map(p => `
            <tr>
              <td>${escapeHtml(p.SobjectType)}</td>
              <td class="${PermissionsAPI.getPermissionClass(p.PermissionsCreate)}">
                <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(p.PermissionsCreate)}</span>
              </td>
              <td class="${PermissionsAPI.getPermissionClass(p.PermissionsRead)}">
                <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(p.PermissionsRead)}</span>
              </td>
              <td class="${PermissionsAPI.getPermissionClass(p.PermissionsEdit)}">
                <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(p.PermissionsEdit)}</span>
              </td>
              <td class="${PermissionsAPI.getPermissionClass(p.PermissionsDelete)}">
                <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(p.PermissionsDelete)}</span>
              </td>
              <td class="${PermissionsAPI.getPermissionClass(p.PermissionsViewAllRecords)}">
                <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(p.PermissionsViewAllRecords)}</span>
              </td>
              <td class="${PermissionsAPI.getPermissionClass(p.PermissionsModifyAllRecords)}">
                <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(p.PermissionsModifyAllRecords)}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  renderFieldPermissions(container, filterText) {
    let perms = this.currentPermissions.fieldPermissions;

    if (filterText) {
      perms = perms.filter(p =>
        p.SobjectType.toLowerCase().includes(filterText) ||
        p.Field.toLowerCase().includes(filterText)
      );
    }

    if (perms.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">search_off</span>
          <p>No field permissions found</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <table class="permissions-table">
        <thead>
          <tr>
            <th>Object</th>
            <th>Field</th>
            <th>Read</th>
            <th>Edit</th>
          </tr>
        </thead>
        <tbody>
          ${perms.map(p => `
            <tr>
              <td>${escapeHtml(p.SobjectType)}</td>
              <td>${escapeHtml(p.Field)}</td>
              <td class="${PermissionsAPI.getPermissionClass(p.PermissionsRead)}">
                <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(p.PermissionsRead)}</span>
              </td>
              <td class="${PermissionsAPI.getPermissionClass(p.PermissionsEdit)}">
                <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(p.PermissionsEdit)}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  filterPermissionsList() {
    this.renderPermissionsList();
  }

  async runComparison() {
    const sourceType = document.getElementById('sourceType').value;
    const sourceId = document.getElementById('sourceItem').value;
    const sourceOption = document.getElementById('sourceItem').options[document.getElementById('sourceItem').selectedIndex];
    const sourceName = sourceOption.textContent;

    const targetType = document.getElementById('targetType').value;
    const targetId = document.getElementById('targetItem').value;
    const targetOption = document.getElementById('targetItem').options[document.getElementById('targetItem').selectedIndex];
    const targetName = targetOption.textContent;

    if (!sourceId || !targetId) return;

    this.showLoading(`Comparing ${escapeHtml(sourceName)} vs ${escapeHtml(targetName)}...`);

    try {
      this.comparisonResults = await PermissionsAPI.comparePermissions(
        { id: sourceId, type: sourceType, name: sourceName },
        { id: targetId, type: targetType, name: targetName }
      );

      // Show filter section and summary
      document.getElementById('comparisonFilterSection').classList.remove('hidden');
      document.getElementById('comparisonSummary').classList.remove('hidden');

      // Update summary counts
      const permType = document.getElementById('comparisonPermType').value;
      this.updateComparisonSummary(permType);

      // Enable export button
      document.getElementById('exportComparisonBtn').disabled = false;

      // Render results
      this.renderComparisonResults();

      console.log('[PermissionComparisonManager] Comparison complete');
    } catch (error) {
      console.error('[PermissionComparisonManager] Error comparing permissions:', error);
      alert(`Error comparing permissions: ${escapeHtml(error.message)}`);
    } finally {
      this.hideLoading();
    }
  }

  updateComparisonSummary(permType) {
    const comparison = permType === 'object'
      ? this.comparisonResults.objectComparison
      : this.comparisonResults.fieldComparison;

    document.getElementById('matchingCount').textContent = comparison.matching.length;
    document.getElementById('differentCount').textContent = comparison.different.length;
    document.getElementById('sourceOnlyCount').textContent = comparison.sourceOnly.length;
    document.getElementById('targetOnlyCount').textContent = comparison.targetOnly.length;
  }

  renderComparisonResults() {
    const container = document.getElementById('comparisonResults');
    const permType = document.getElementById('comparisonPermType').value;
    const filterType = document.getElementById('comparisonTypeFilter').value;
    const filterText = document.getElementById('comparisonObjectFilter').value.toLowerCase();

    if (!this.comparisonResults) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">compare</span>
          <p>Select source and target to compare permissions</p>
        </div>
      `;
      return;
    }

    // Update summary
    this.updateComparisonSummary(permType);

    const comparison = permType === 'object'
      ? this.comparisonResults.objectComparison
      : this.comparisonResults.fieldComparison;

    // Get items based on filter type
    let items;
    switch (filterType) {
      case 'different':
        items = comparison.different;
        break;
      case 'matching':
        items = comparison.matching;
        break;
      case 'sourceOnly':
        items = comparison.sourceOnly;
        break;
      case 'targetOnly':
        items = comparison.targetOnly;
        break;
      default:
        items = comparison.all;
    }

    // Apply text filter
    if (filterText) {
      items = items.filter(item => {
        const searchField = permType === 'object' ? item.objectName : item.field;
        return searchField.toLowerCase().includes(filterText);
      });
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">search_off</span>
          <p>No results match the current filters</p>
        </div>
      `;
      return;
    }

    if (permType === 'object') {
      this.renderObjectComparison(container, items);
    } else {
      this.renderFieldComparison(container, items);
    }
  }

  renderObjectComparison(container, items) {
    const sourceName = this.comparisonResults.source.name;
    const targetName = this.comparisonResults.target.name;

    container.innerHTML = `
      <table class="comparison-table">
        <thead>
          <tr>
            <th>Object</th>
            <th>Status</th>
            <th class="source-header" colspan="6">${escapeHtml(sourceName)}</th>
            <th class="target-header" colspan="6">${escapeHtml(targetName)}</th>
          </tr>
          <tr>
            <th></th>
            <th></th>
            <th class="source-header">C</th>
            <th class="source-header">R</th>
            <th class="source-header">U</th>
            <th class="source-header">D</th>
            <th class="source-header">VA</th>
            <th class="source-header">MA</th>
            <th class="target-header">C</th>
            <th class="target-header">R</th>
            <th class="target-header">U</th>
            <th class="target-header">D</th>
            <th class="target-header">VA</th>
            <th class="target-header">MA</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => {
            const status = this.getComparisonStatus(item, this.comparisonResults.objectComparison);
            const statusClass = this.getStatusClass(status);
            const statusBadgeClass = this.getStatusBadgeClass(status);

            return `
              <tr class="${statusClass}">
                <td>${escapeHtml(item.objectName)}</td>
                <td><span class="status-badge ${statusBadgeClass}">${status}</span></td>
                ${this.renderObjectPermCells(item.source)}
                ${this.renderObjectPermCells(item.target)}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  renderFieldComparison(container, items) {
    const sourceName = this.comparisonResults.source.name;
    const targetName = this.comparisonResults.target.name;

    container.innerHTML = `
      <table class="comparison-table">
        <thead>
          <tr>
            <th>Object</th>
            <th>Field</th>
            <th>Status</th>
            <th class="source-header" colspan="2">${escapeHtml(sourceName)}</th>
            <th class="target-header" colspan="2">${escapeHtml(targetName)}</th>
          </tr>
          <tr>
            <th></th>
            <th></th>
            <th></th>
            <th class="source-header">R</th>
            <th class="source-header">E</th>
            <th class="target-header">R</th>
            <th class="target-header">E</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => {
            const status = this.getComparisonStatus(item, this.comparisonResults.fieldComparison);
            const statusClass = this.getStatusClass(status);
            const statusBadgeClass = this.getStatusBadgeClass(status);

            return `
              <tr class="${statusClass}">
                <td>${escapeHtml(item.objectName)}</td>
                <td>${escapeHtml(item.field)}</td>
                <td><span class="status-badge ${statusBadgeClass}">${status}</span></td>
                ${this.renderFieldPermCells(item.source)}
                ${this.renderFieldPermCells(item.target)}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  renderObjectPermCells(perm) {
    if (!perm) {
      return '<td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>';
    }

    return `
      <td class="${PermissionsAPI.getPermissionClass(perm.create)}">
        <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(perm.create)}</span>
      </td>
      <td class="${PermissionsAPI.getPermissionClass(perm.read)}">
        <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(perm.read)}</span>
      </td>
      <td class="${PermissionsAPI.getPermissionClass(perm.edit)}">
        <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(perm.edit)}</span>
      </td>
      <td class="${PermissionsAPI.getPermissionClass(perm.delete)}">
        <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(perm.delete)}</span>
      </td>
      <td class="${PermissionsAPI.getPermissionClass(perm.viewAll)}">
        <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(perm.viewAll)}</span>
      </td>
      <td class="${PermissionsAPI.getPermissionClass(perm.modifyAll)}">
        <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(perm.modifyAll)}</span>
      </td>
    `;
  }

  renderFieldPermCells(perm) {
    if (!perm) {
      return '<td>-</td><td>-</td>';
    }

    return `
      <td class="${PermissionsAPI.getPermissionClass(perm.read)}">
        <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(perm.read)}</span>
      </td>
      <td class="${PermissionsAPI.getPermissionClass(perm.edit)}">
        <span class="material-symbols-rounded permission-icon">${PermissionsAPI.getPermissionIcon(perm.edit)}</span>
      </td>
    `;
  }

  getComparisonStatus(item, comparison) {
    if (!item.source) return 'Target Only';
    if (!item.target) return 'Source Only';

    const key = item.objectName || item.field;
    if (comparison.different.find(d => (d.objectName || d.field) === key)) {
      return 'Different';
    }
    return 'Match';
  }

  getStatusClass(status) {
    switch (status) {
      case 'Match': return 'comparison-match';
      case 'Different': return 'comparison-diff';
      case 'Source Only': return 'comparison-source-only';
      case 'Target Only': return 'comparison-target-only';
      default: return '';
    }
  }

  getStatusBadgeClass(status) {
    switch (status) {
      case 'Match': return 'status-match';
      case 'Different': return 'status-diff';
      case 'Source Only': return 'status-source';
      case 'Target Only': return 'status-target';
      default: return '';
    }
  }

  filterComparisonResults() {
    this.renderComparisonResults();
  }

  exportComparison() {
    if (!this.comparisonResults) return;

    const permType = document.getElementById('comparisonPermType').value;
    const csv = PermissionsAPI.exportComparisonToCSV(this.comparisonResults, permType);

    const filename = `comparison-${escapeHtml(this.comparisonResults.source.name)}-vs-${escapeHtml(this.comparisonResults.target.name)}-${permType}.csv`;
    this.downloadFile(csv, filename, 'text/csv');
  }

  handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('importFileName').textContent = escapeHtml(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;

        if (file.name.endsWith('.json')) {
          this.importedData = JSON.parse(content);
        } else {
          this.importedData = PermissionsAPI.parseImportCSV(content);
        }

        this.renderImportPreview();
        document.getElementById('importPreview').classList.remove('hidden');
      } catch (error) {
        console.error('[PermissionComparisonManager] Error parsing import file:', error);
        alert(`Error parsing file: ${escapeHtml(error.message)}`);
      }
    };

    reader.readAsText(file);
  }

  renderImportPreview() {
    const summaryContent = document.getElementById('importSummaryContent');
    const dataContent = document.getElementById('importDataContent');

    if (!this.importedData) return;

    // Render summary
    summaryContent.innerHTML = `
      <p><strong>File Type:</strong> ${escapeHtml(this.importedData.type) || 'Unknown'}</p>
      <p><strong>Rows:</strong> ${this.importedData.rowCount || this.importedData.data?.length || 0}</p>
      <p><strong>Columns:</strong> ${escapeHtml(this.importedData.headers?.join(', ')) || 'N/A'}</p>
      <p class="import-description"><em>This is a preview only. No changes will be deployed to Salesforce.</em></p>
    `;

    // Render data table (first 50 rows)
    if (this.importedData.data && this.importedData.data.length > 0) {
      const headers = this.importedData.headers || Object.keys(this.importedData.data[0]);
      const rows = this.importedData.data.slice(0, 50);

      dataContent.innerHTML = `
        <table class="permissions-table">
          <thead>
            <tr>
              ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                ${headers.map(h => `<td>${escapeHtml(row[h] || '')}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${this.importedData.data.length > 50 ? `<p>...and ${this.importedData.data.length - 50} more rows</p>` : ''}
      `;
    }
  }

  async doExport() {
    const statusEl = document.getElementById('exportStatus');
    const exportBtn = document.getElementById('doExportBtn');

    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    const exportObjectPerms = document.getElementById('exportObjectPerms').checked;
    const exportFieldPerms = document.getElementById('exportFieldPerms').checked;

    if (!exportObjectPerms && !exportFieldPerms) {
      alert('Please select at least one permission type to export');
      return;
    }

    exportBtn.disabled = true;
    statusEl.textContent = 'Loading permissions...';
    statusEl.className = 'status-message';

    try {
      // Get selected profiles and permission sets
      const selectedProfiles = this.profiles.filter(p => this.selectedExportProfiles.has(p.Id));
      const selectedPermSets = this.permissionSets.filter(ps => this.selectedExportPermSets.has(ps.Id));

      // Load permissions for all selected items
      const allItems = [
        ...selectedProfiles.map(p => ({ id: p.Id, type: 'Profile', name: p.Name })),
        ...selectedPermSets.map(ps => ({ id: ps.Id, type: 'PermissionSet', name: ps.Label || ps.Name }))
      ];

      let completed = 0;
      for (const item of allItems) {
        statusEl.textContent = `Loading permissions for ${item.name}... (${completed + 1}/${allItems.length})`;

        if (!this.permissionsData[item.id]) {
          const perms = await PermissionsAPI.getAllPermissions(item.id, item.type);
          this.permissionsData[item.id] = perms;
        }
        completed++;
      }

      // Generate export
      statusEl.textContent = 'Generating export...';

      if (format === 'json') {
        const json = PermissionsAPI.exportToJSON(selectedProfiles, selectedPermSets, this.permissionsData);
        this.downloadFile(json, 'permissions-export.json', 'application/json');
      } else {
        // Export to CSV
        if (exportObjectPerms) {
          const objectCsv = PermissionsAPI.exportToCSV(selectedProfiles, selectedPermSets, this.permissionsData, 'object');
          this.downloadFile(objectCsv, 'object-permissions.csv', 'text/csv');
        }

        if (exportFieldPerms) {
          const fieldCsv = PermissionsAPI.exportToCSV(selectedProfiles, selectedPermSets, this.permissionsData, 'field');
          this.downloadFile(fieldCsv, 'field-permissions.csv', 'text/csv');
        }
      }

      statusEl.textContent = 'Export completed successfully!';
      statusEl.className = 'status-message success';

      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'status-message';
      }, 3000);

    } catch (error) {
      console.error('[PermissionComparisonManager] Export error:', error);
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = 'status-message error';
    } finally {
      exportBtn.disabled = this.selectedExportProfiles.size === 0 && this.selectedExportPermSets.size === 0;
    }
  }

  downloadFile(content, filename, mimeType) {
    const BOM = mimeType === 'text/csv' ? '\uFEFF' : '';
    const blob = new Blob([BOM + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  showLoading(message = 'Loading...') {
    document.getElementById('loadingMessage').textContent = message;
    document.getElementById('loadingOverlay').classList.remove('hidden');
  }

  hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
  }


}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const manager = new PermissionComparisonManager();
  manager.init();
});
