// Validation Rules Manager UI Controller
// Provides interface for managing Salesforce validation rules

import ThemeManager from '../background/theme-manager.js';
import SessionManager from '../background/session-manager.js';
import ValidationRuleAPI from '../background/validation-rule-api.js';

class ValidationRulesManager {
  constructor() {
    this.rules = [];
    this.filteredRules = [];
    this.selectedRules = new Set();
    this.objects = [];
    this.settings = {
      defaultExportFormat: 'csv',
      showManagedRules: true,
      confirmBulkActions: true
    };
    this.analysis = null;
    this.csvData = null;
  }

  async init() {
    console.log('[ValidationRulesManager] Initializing');

    // Initialize theme
    await ThemeManager.initTheme();

    // Load settings
    await this.loadSettings();

    // Load org info
    await this.loadOrgInfo();

    // Setup event listeners
    this.setupEventListeners();

    // Load validation rules
    await this.loadValidationRules();

    console.log('[ValidationRulesManager] Initialization complete');
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get('validationRulesSettings');
      if (result.validationRulesSettings) {
        this.settings = { ...this.settings, ...result.validationRulesSettings };
        console.log('[ValidationRulesManager] Settings loaded:', this.settings);
      }

      // Apply settings to UI
      document.getElementById('defaultExportFormat').value = this.settings.defaultExportFormat;
      document.getElementById('showManagedRules').checked = this.settings.showManagedRules;
      document.getElementById('confirmBulkActions').checked = this.settings.confirmBulkActions;
    } catch (error) {
      console.error('[ValidationRulesManager] Error loading settings:', error);
    }
  }

  async saveSettings() {
    try {
      this.settings.defaultExportFormat = document.getElementById('defaultExportFormat').value;
      this.settings.showManagedRules = document.getElementById('showManagedRules').checked;
      this.settings.confirmBulkActions = document.getElementById('confirmBulkActions').checked;

      await chrome.storage.local.set({ validationRulesSettings: this.settings });
      console.log('[ValidationRulesManager] Settings saved');
    } catch (error) {
      console.error('[ValidationRulesManager] Error saving settings:', error);
    }
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
      console.error('[ValidationRulesManager] Error loading org info:', error);
      document.getElementById('orgUrl').textContent = 'Error loading';
    }
  }

  setupEventListeners() {
    // Header buttons
    document.getElementById('refreshBtn').addEventListener('click', () => this.loadValidationRules());
    document.getElementById('exportBtn').addEventListener('click', () => this.toggleExportPanel());
    document.getElementById('settingsBtn').addEventListener('click', () => this.toggleSettingsPanel());

    // Settings panel
    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
      this.saveSettings();
      this.toggleSettingsPanel();
    });

    // Export panel
    document.getElementById('doExportBtn').addEventListener('click', () => this.doExport());
    document.getElementById('closeExportBtn').addEventListener('click', () => this.toggleExportPanel());

    // Filters
    document.getElementById('objectFilter').addEventListener('change', () => this.applyFilters());
    document.getElementById('statusFilter').addEventListener('change', () => this.applyFilters());
    document.getElementById('searchInput').addEventListener('input', () => this.applyFilters());

    // Bulk actions
    document.getElementById('selectAllRules').addEventListener('change', (e) => this.selectAllRules(e.target.checked));
    document.getElementById('bulkActivateBtn').addEventListener('click', () => this.bulkUpdateStatus(true));
    document.getElementById('bulkDeactivateBtn').addEventListener('click', () => this.bulkUpdateStatus(false));
    document.getElementById('clearSelectionBtn').addEventListener('click', () => this.clearSelection());

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.closest('.tab-btn').dataset.tab));
    });

    // Test tab
    document.getElementById('uploadCsvBtn').addEventListener('click', () => {
      document.getElementById('csvFileInput').click();
    });
    document.getElementById('csvFileInput').addEventListener('change', (e) => this.handleCsvUpload(e));
    document.getElementById('runTestBtn').addEventListener('click', () => this.runTest());

    // Modals
    document.getElementById('confirmNoBtn').addEventListener('click', () => this.hideModal('confirmModal'));
    document.getElementById('closeRuleDetailBtn').addEventListener('click', () => this.hideModal('ruleDetailModal'));

    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    });
  }

  async loadValidationRules() {
    console.log('[ValidationRulesManager] Loading validation rules');

    // Show loading state
    const container = document.getElementById('rulesContainer');
    container.innerHTML = `
      <div class="loading-message">
        <span class="material-symbols-rounded spinning">sync</span>
        Loading validation rules...
      </div>
    `;
    document.getElementById('noRules').classList.add('hidden');

    try {
      // Load rules and summary in parallel
      const [rules, summary, objects] = await Promise.all([
        ValidationRuleAPI.getValidationRules(),
        ValidationRuleAPI.getValidationRuleSummary(),
        ValidationRuleAPI.getObjectsWithValidationRules()
      ]);

      this.rules = rules;
      this.objects = objects;

      // Object labels are now part of each rule (ObjectLabel, ObjectApiName)
      // No need for a separate label map

      // Update summary stats
      document.getElementById('totalCount').textContent = summary.total;
      document.getElementById('activeCount').textContent = summary.active;
      document.getElementById('inactiveCount').textContent = summary.inactive;
      document.getElementById('objectCount').textContent = summary.objectCount || objects.length;

      // Populate object filter
      this.populateObjectFilter();

      // Apply filters and render
      this.applyFilters();

      // Load analysis
      this.loadAnalysis();

      // Populate test object selector
      this.populateTestObjects();

      console.log('[ValidationRulesManager] Loaded', rules.length, 'validation rules');
    } catch (error) {
      console.error('[ValidationRulesManager] Error loading validation rules:', error);
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">error</span>
          <p>Error loading validation rules: ${error.message}</p>
        </div>
      `;
    }
  }

  populateObjectFilter() {
    const select = document.getElementById('objectFilter');
    select.innerHTML = '<option value="">All Objects</option>';

    this.objects.forEach(obj => {
      const option = document.createElement('option');
      // Use apiName for filtering since that matches rule.ObjectApiName
      option.value = obj.apiName;
      option.textContent = `${obj.label} (${obj.ruleCount})`;
      select.appendChild(option);
    });
  }

  populateTestObjects() {
    const select = document.getElementById('testObject');
    select.innerHTML = '<option value="">Choose an object...</option>';

    this.objects.forEach(obj => {
      const option = document.createElement('option');
      // Use apiName for filtering since that matches rule.ObjectApiName
      option.value = obj.apiName;
      option.textContent = `${obj.label} (${obj.ruleCount} rules)`;
      select.appendChild(option);
    });
  }

  applyFilters() {
    const objectFilter = document.getElementById('objectFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    this.filteredRules = this.rules.filter(rule => {
      // Object filter - use ObjectApiName (enriched from EntityDefinition)
      if (objectFilter && rule.ObjectApiName !== objectFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'active' && !rule.Active) return false;
      if (statusFilter === 'inactive' && rule.Active) return false;

      // Managed package filter
      if (!this.settings.showManagedRules && rule.ManageableState === 'installed') {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const searchFields = [
          rule.ValidationName,
          rule.ErrorMessage,
          rule.Description,
          rule.ObjectLabel,
          rule.ObjectApiName
        ].filter(Boolean).map(s => s.toLowerCase());

        if (!searchFields.some(field => field.includes(searchTerm))) {
          return false;
        }
      }

      return true;
    });

    // Update badge
    document.getElementById('rulesListBadge').textContent = this.filteredRules.length;

    // Render rules
    this.renderRules();
  }

  renderRules() {
    const container = document.getElementById('rulesContainer');
    const noRules = document.getElementById('noRules');

    if (this.filteredRules.length === 0) {
      container.innerHTML = '';
      noRules.classList.remove('hidden');
      return;
    }

    noRules.classList.add('hidden');

    container.innerHTML = this.filteredRules.map(rule => this.renderRuleCard(rule)).join('');

    // Add event listeners to rule cards
    container.querySelectorAll('.rule-checkbox input').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        this.toggleRuleSelection(e.target.dataset.id, e.target.checked);
      });
    });

    container.querySelectorAll('.rule-action-btn[data-action="view"]').forEach(btn => {
      btn.addEventListener('click', () => this.showRuleDetail(btn.dataset.id));
    });

    container.querySelectorAll('.rule-action-btn[data-action="toggle"]').forEach(btn => {
      btn.addEventListener('click', () => this.toggleRuleStatus(btn.dataset.id));
    });
  }

  renderRuleCard(rule) {
    const formatted = ValidationRuleAPI.formatRule(rule);
    // Object label is already enriched in the rule (ObjectLabel field)
    const isSelected = this.selectedRules.has(rule.Id);

    return `
      <div class="rule-card ${isSelected ? 'selected' : ''}" data-id="${rule.Id}">
        <div class="rule-card-header">
          <div class="rule-info">
            <div class="rule-checkbox">
              <input type="checkbox" data-id="${rule.Id}" ${isSelected ? 'checked' : ''}>
            </div>
            <div class="rule-details">
              <h3>
                ${formatted.name}
                ${formatted.isManaged ? '<span class="status-badge status-managed">Managed</span>' : ''}
              </h3>
              <div class="rule-meta">
                ${formatted.objectLabel} (${formatted.object}) &bull;
                Last modified: ${this.formatDate(formatted.lastModifiedDate)} by ${formatted.lastModifiedBy}
              </div>
            </div>
          </div>
          <div class="rule-actions">
            <span class="status-badge ${formatted.active ? 'status-active' : 'status-inactive'}">
              <span class="material-symbols-rounded">${formatted.active ? 'check_circle' : 'cancel'}</span>
              ${formatted.active ? 'Active' : 'Inactive'}
            </span>
            <button class="rule-action-btn" data-action="view" data-id="${rule.Id}" title="View Details">
              <span class="material-symbols-rounded">visibility</span>
            </button>
            <button class="rule-action-btn" data-action="toggle" data-id="${rule.Id}" title="${formatted.active ? 'Deactivate' : 'Activate'}">
              <span class="material-symbols-rounded">${formatted.active ? 'toggle_off' : 'toggle_on'}</span>
            </button>
          </div>
        </div>
        <div class="rule-content">
          ${formatted.errorMessage ? `
            <div class="rule-error-message">
              <strong>Error Message:</strong> ${this.escapeHtml(formatted.errorMessage)}
            </div>
          ` : ''}
          ${formatted.formula ? `
            <div class="rule-formula">${this.escapeHtml(formatted.formula)}</div>
          ` : ''}
        </div>
      </div>
    `;
  }

  toggleRuleSelection(ruleId, selected) {
    if (selected) {
      this.selectedRules.add(ruleId);
    } else {
      this.selectedRules.delete(ruleId);
    }

    // Update card styling
    const card = document.querySelector(`.rule-card[data-id="${ruleId}"]`);
    if (card) {
      card.classList.toggle('selected', selected);
    }

    // Update bulk actions bar
    this.updateBulkActionsBar();

    // Update select all checkbox
    const selectAll = document.getElementById('selectAllRules');
    selectAll.checked = this.selectedRules.size === this.filteredRules.length;
    selectAll.indeterminate = this.selectedRules.size > 0 && this.selectedRules.size < this.filteredRules.length;
  }

  selectAllRules(selected) {
    this.selectedRules.clear();

    if (selected) {
      this.filteredRules.forEach(rule => this.selectedRules.add(rule.Id));
    }

    // Update all checkboxes
    document.querySelectorAll('.rule-checkbox input').forEach(checkbox => {
      checkbox.checked = selected;
      const card = checkbox.closest('.rule-card');
      if (card) {
        card.classList.toggle('selected', selected);
      }
    });

    this.updateBulkActionsBar();
  }

  clearSelection() {
    this.selectedRules.clear();
    document.getElementById('selectAllRules').checked = false;
    document.querySelectorAll('.rule-checkbox input').forEach(checkbox => {
      checkbox.checked = false;
      const card = checkbox.closest('.rule-card');
      if (card) {
        card.classList.remove('selected');
      }
    });
    this.updateBulkActionsBar();
  }

  updateBulkActionsBar() {
    const bar = document.getElementById('bulkActionsBar');
    const count = document.getElementById('selectedCount');

    if (this.selectedRules.size > 0) {
      bar.classList.remove('hidden');
      count.textContent = this.selectedRules.size;
    } else {
      bar.classList.add('hidden');
    }
  }

  async toggleRuleStatus(ruleId) {
    const rule = this.rules.find(r => r.Id === ruleId);
    if (!rule) return;

    const newStatus = !rule.Active;
    const action = newStatus ? 'activate' : 'deactivate';

    if (this.settings.confirmBulkActions) {
      const confirmed = await this.showConfirmModal(
        `${action.charAt(0).toUpperCase() + action.slice(1)} Rule`,
        `Are you sure you want to ${action} "${rule.ValidationName}"?`
      );
      if (!confirmed) return;
    }

    try {
      await ValidationRuleAPI.updateValidationRuleStatus(ruleId, newStatus);
      rule.Active = newStatus;
      this.applyFilters();

      // Update summary
      if (newStatus) {
        document.getElementById('activeCount').textContent =
          parseInt(document.getElementById('activeCount').textContent) + 1;
        document.getElementById('inactiveCount').textContent =
          parseInt(document.getElementById('inactiveCount').textContent) - 1;
      } else {
        document.getElementById('activeCount').textContent =
          parseInt(document.getElementById('activeCount').textContent) - 1;
        document.getElementById('inactiveCount').textContent =
          parseInt(document.getElementById('inactiveCount').textContent) + 1;
      }

      console.log('[ValidationRulesManager] Rule status updated:', ruleId, newStatus);
    } catch (error) {
      console.error('[ValidationRulesManager] Error updating rule status:', error);
      alert(`Error updating rule: ${error.message}`);
    }
  }

  async bulkUpdateStatus(active) {
    if (this.selectedRules.size === 0) return;

    const action = active ? 'activate' : 'deactivate';
    const count = this.selectedRules.size;

    if (this.settings.confirmBulkActions) {
      const confirmed = await this.showConfirmModal(
        `Bulk ${action.charAt(0).toUpperCase() + action.slice(1)}`,
        `Are you sure you want to ${action} ${count} validation rule${count > 1 ? 's' : ''}?`
      );
      if (!confirmed) return;
    }

    try {
      const updates = Array.from(this.selectedRules).map(id => ({ id, active }));
      const results = await ValidationRuleAPI.bulkUpdateValidationRuleStatus(updates);

      // Update local state
      results.success.forEach(id => {
        const rule = this.rules.find(r => r.Id === id);
        if (rule) rule.Active = active;
      });

      // Clear selection
      this.clearSelection();

      // Refresh display
      this.applyFilters();
      await this.loadValidationRules();

      // Show results
      if (results.errors.length > 0) {
        alert(`Updated ${results.success.length} rules. ${results.errors.length} failed.`);
      }

      console.log('[ValidationRulesManager] Bulk update complete:', results);
    } catch (error) {
      console.error('[ValidationRulesManager] Error in bulk update:', error);
      alert(`Error in bulk update: ${error.message}`);
    }
  }

  async showRuleDetail(ruleId) {
    // Show loading state
    document.getElementById('ruleDetailTitle').textContent = 'Loading...';
    document.getElementById('ruleDetailContent').innerHTML = `
      <div class="loading-message">
        <span class="material-symbols-rounded spinning">sync</span>
        Loading rule details...
      </div>
    `;
    document.getElementById('ruleDetailModal').classList.remove('hidden');

    try {
      // Fetch the full rule with Metadata
      const fullRule = await ValidationRuleAPI.getValidationRule(ruleId);
      const formatted = ValidationRuleAPI.formatRule(fullRule);

      document.getElementById('ruleDetailTitle').textContent = formatted.name;
    document.getElementById('ruleDetailContent').innerHTML = `
      <div class="rule-detail-section">
        <div class="rule-detail-fields">
          <div class="rule-detail-field">
            <div class="rule-detail-field-label">Object</div>
            <div class="rule-detail-field-value">${formatted.objectLabel} (${formatted.object})</div>
          </div>
          <div class="rule-detail-field">
            <div class="rule-detail-field-label">Status</div>
            <div class="rule-detail-field-value">
              <span class="status-badge ${formatted.active ? 'status-active' : 'status-inactive'}">
                ${formatted.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          <div class="rule-detail-field">
            <div class="rule-detail-field-label">Last Modified</div>
            <div class="rule-detail-field-value">${this.formatDate(formatted.lastModifiedDate)}</div>
          </div>
          <div class="rule-detail-field">
            <div class="rule-detail-field-label">Modified By</div>
            <div class="rule-detail-field-value">${formatted.lastModifiedBy}</div>
          </div>
          ${formatted.namespace ? `
            <div class="rule-detail-field">
              <div class="rule-detail-field-label">Namespace</div>
              <div class="rule-detail-field-value">${formatted.namespace}</div>
            </div>
          ` : ''}
          <div class="rule-detail-field">
            <div class="rule-detail-field-label">Error Display Field</div>
            <div class="rule-detail-field-value">${formatted.errorField || 'Top of Page'}</div>
          </div>
        </div>
      </div>

      ${formatted.description ? `
        <div class="rule-detail-section">
          <h4>Description</h4>
          <p>${this.escapeHtml(formatted.description)}</p>
        </div>
      ` : ''}

      <div class="rule-detail-section">
        <h4>Error Message</h4>
        <p>${this.escapeHtml(formatted.errorMessage) || 'No error message'}</p>
      </div>

      <div class="rule-detail-section">
        <h4>Error Condition Formula</h4>
        <pre>${this.escapeHtml(formatted.formula) || 'No formula'}</pre>
      </div>

      ${formatted.fieldsReferenced.length > 0 ? `
        <div class="rule-detail-section">
          <h4>Fields Referenced</h4>
          <p>${formatted.fieldsReferenced.join(', ')}</p>
        </div>
      ` : ''}
    `;
    } catch (error) {
      console.error('[ValidationRulesManager] Error loading rule details:', error);
      document.getElementById('ruleDetailContent').innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">error</span>
          <p>Error loading rule details: ${error.message}</p>
        </div>
      `;
    }
  }

  async loadAnalysis() {
    if (this.rules.length === 0) return;

    const container = document.getElementById('analysisContainer');
    this.analysis = ValidationRuleAPI.analyzeRules(this.rules);

    container.innerHTML = `
      <div class="analysis-card">
        <h4>
          <span class="material-symbols-rounded">analytics</span>
          Overview
        </h4>
        <div class="analysis-stats">
          <div class="analysis-stat">
            <div class="analysis-stat-value">${this.analysis.totalRules}</div>
            <div class="analysis-stat-label">Total Rules</div>
          </div>
          <div class="analysis-stat">
            <div class="analysis-stat-value">${this.analysis.activeRules}</div>
            <div class="analysis-stat-label">Active</div>
          </div>
          <div class="analysis-stat">
            <div class="analysis-stat-value">${this.analysis.inactiveRules}</div>
            <div class="analysis-stat-label">Inactive</div>
          </div>
          <div class="analysis-stat">
            <div class="analysis-stat-value">${this.analysis.managedRules}</div>
            <div class="analysis-stat-label">Managed</div>
          </div>
        </div>
      </div>

      ${this.analysis.warnings.length > 0 ? `
        <div class="analysis-card">
          <h4>
            <span class="material-symbols-rounded">warning</span>
            Warnings
          </h4>
          <ul class="warnings-list">
            ${this.analysis.warnings.map(w => `
              <li>
                <span class="material-symbols-rounded">warning</span>
                ${w}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      <div class="analysis-card">
        <h4>
          <span class="material-symbols-rounded">category</span>
          Object Coverage
        </h4>
        <table class="object-coverage-table">
          <thead>
            <tr>
              <th>Object</th>
              <th>Total Rules</th>
              <th>Active</th>
              <th>Coverage</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(this.analysis.objectCoverage)
              .sort((a, b) => b[1].total - a[1].total)
              .slice(0, 20)
              .map(([obj, data]) => `
                <tr>
                  <td>${obj}</td>
                  <td>${data.total}</td>
                  <td>${data.active}</td>
                  <td>${Math.round((data.active / data.total) * 100)}%</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    `;
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

  toggleSettingsPanel() {
    document.getElementById('settingsPanel').classList.toggle('hidden');
    document.getElementById('exportPanel').classList.add('hidden');
  }

  toggleExportPanel() {
    document.getElementById('exportPanel').classList.toggle('hidden');
    document.getElementById('settingsPanel').classList.add('hidden');
  }

  async doExport() {
    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    const selectedOnly = document.getElementById('exportSelectedOnly').checked;

    let rulesToExport = selectedOnly && this.selectedRules.size > 0
      ? this.rules.filter(r => this.selectedRules.has(r.Id))
      : this.filteredRules;

    // Note: Export without formulas for performance
    // Fetching Metadata for each rule would be too slow for large exports
    // due to Salesforce API limitation (one rule at a time)

    let content, filename, mimeType;

    if (format === 'csv') {
      content = ValidationRuleAPI.exportToCSV(rulesToExport);
      filename = 'validation-rules.csv';
      mimeType = 'text/csv';
    } else {
      content = ValidationRuleAPI.exportToJSON(rulesToExport);
      filename = 'validation-rules.json';
      mimeType = 'application/json';
    }

    // Download file
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    this.toggleExportPanel();
    console.log('[ValidationRulesManager] Exported', rulesToExport.length, 'rules as', format);
  }

  handleCsvUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('fileName').textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
      this.csvData = this.parseCSV(e.target.result);
      document.getElementById('runTestBtn').disabled = false;
      console.log('[ValidationRulesManager] CSV loaded with', this.csvData.length, 'records');
    };
    reader.readAsText(file);
  }

  parseCSV(content) {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = this.parseCSVLine(lines[0]);
    const records = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const record = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });
      records.push(record);
    }

    return records;
  }

  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    return values;
  }

  runTest() {
    const objectName = document.getElementById('testObject').value;
    if (!objectName || !this.csvData || this.csvData.length === 0) {
      alert('Please select an object and upload a CSV file');
      return;
    }

    // Get active rules for the selected object
    const rulesForObject = this.rules.filter(r =>
      r.EntityDefinition?.QualifiedApiName === objectName && r.Active
    );

    if (rulesForObject.length === 0) {
      alert(`No active validation rules found for ${objectName}`);
      return;
    }

    // Test each record against each rule
    const results = [];

    this.csvData.forEach((record, index) => {
      rulesForObject.forEach(rule => {
        const testResult = ValidationRuleAPI.testFormula(rule.ErrorConditionFormula, record);
        results.push({
          recordIndex: index + 1,
          ruleName: rule.ValidationName,
          ...testResult
        });
      });
    });

    // Display results
    this.displayTestResults(results);
  }

  displayTestResults(results) {
    const container = document.getElementById('testResults');
    const content = document.getElementById('testResultsContent');

    container.classList.remove('hidden');

    content.innerHTML = `
      <p>Tested ${this.csvData.length} records against ${results.length / this.csvData.length} rules.</p>
      <p class="test-description">
        Note: This is a client-side formula analysis. For accurate results,
        test in a Salesforce sandbox.
      </p>
      ${results.slice(0, 50).map(result => `
        <div class="test-result-item">
          <strong>Record ${result.recordIndex}:</strong> ${result.ruleName}
          <br>
          <small>Fields used: ${result.fieldsUsed?.join(', ') || 'None detected'}</small>
        </div>
      `).join('')}
      ${results.length > 50 ? `<p>...and ${results.length - 50} more results</p>` : ''}
    `;
  }

  showConfirmModal(title, message) {
    return new Promise((resolve) => {
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMessage').textContent = message;
      document.getElementById('confirmModal').classList.remove('hidden');

      const yesBtn = document.getElementById('confirmYesBtn');
      const noBtn = document.getElementById('confirmNoBtn');

      const cleanup = () => {
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
        document.getElementById('confirmModal').classList.add('hidden');
      };

      const onYes = () => {
        cleanup();
        resolve(true);
      };

      const onNo = () => {
        cleanup();
        resolve(false);
      };

      yesBtn.addEventListener('click', onYes);
      noBtn.addEventListener('click', onNo);
    });
  }

  hideModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
  }

  formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const manager = new ValidationRulesManager();
  manager.init();
});
