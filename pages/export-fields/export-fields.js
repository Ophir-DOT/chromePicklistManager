import ThemeManager from '../../background/theme-manager.js';
import SessionManager from '../../background/session-manager.js';
import ExportFieldsAPI from '../../background/export-fields-api.js';
import FieldUsageAPI from '../../background/field-usage-api.js';
import { escapeHtml } from '../../shared/utils.js';

class ExportFieldsManager {
  constructor() {
    this.objects = [];
    this.selectedObjects = new Set();
    this.fields = [];
    this.filteredFields = [];
    this.selectedFields = new Set();
    this.fieldUsageData = new Map(); // Map of field key -> usage stats
    this.settings = {
      defaultExportFormat: 'csv',
      includeToolingMetadata: false
    };
    this.currentPage = 1;
    this.pageSize = 100;
    this.sortColumn = 'objectName';
    this.sortDirection = 'asc';
  }

  async init() {
    console.log('[ExportFieldsManager] Initializing');

    // Initialize theme
    await ThemeManager.initTheme();

    // Load settings
    await this.loadSettings();

    // Load org info
    await this.loadOrgInfo();

    // Setup event listeners
    this.setupEventListeners();

    // Load objects
    await this.loadObjects();

    console.log('[ExportFieldsManager] Initialization complete');
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get('exportFieldsSettings');
      if (result.exportFieldsSettings) {
        this.settings = { ...this.settings, ...result.exportFieldsSettings };
        console.log('[ExportFieldsManager] Settings loaded:', this.settings);
      }

      // Apply settings to UI
      document.getElementById('defaultExportFormat').value = this.settings.defaultExportFormat;
      document.getElementById('includeToolingMetadata').checked = this.settings.includeToolingMetadata;
    } catch (error) {
      console.error('[ExportFieldsManager] Error loading settings:', error);
    }
  }

  async saveSettings() {
    try {
      this.settings.defaultExportFormat = document.getElementById('defaultExportFormat').value;
      this.settings.includeToolingMetadata = document.getElementById('includeToolingMetadata').checked;

      await chrome.storage.local.set({ exportFieldsSettings: this.settings });
      console.log('[ExportFieldsManager] Settings saved');
    } catch (error) {
      console.error('[ExportFieldsManager] Error saving settings:', error);
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
      console.error('[ExportFieldsManager] Error loading org info:', error);
      document.getElementById('orgUrl').textContent = 'Error loading';
    }
  }

  setupEventListeners() {
    // Header buttons
    document.getElementById('refreshBtn').addEventListener('click', () => this.loadObjects());
    document.getElementById('settingsBtn').addEventListener('click', () => this.toggleSettingsPanel());
    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
      this.saveSettings();
      this.toggleSettingsPanel();
    });

    // Object selection
    document.getElementById('objectSearch').addEventListener('input', () => this.filterObjects());
    document.getElementById('selectAllObjectsBtn').addEventListener('click', () => this.selectAllObjects());
    document.getElementById('clearObjectsBtn').addEventListener('click', () => this.clearObjectSelection());

    // Field type filters
    document.getElementById('selectAllTypesBtn').addEventListener('click', () => this.selectAllTypes());
    document.getElementById('clearTypesBtn').addEventListener('click', () => this.clearAllTypes());

    // Load fields button
    document.getElementById('loadFieldsBtn').addEventListener('click', () => this.loadFields());

    // Field search
    document.getElementById('fieldSearch').addEventListener('input', () => this.filterAndDisplayFields());

    // Field selection
    document.getElementById('selectAllFieldsBtn').addEventListener('click', () => this.selectAllVisibleFields());
    document.getElementById('clearFieldsBtn').addEventListener('click', () => this.clearFieldSelection());
    document.getElementById('selectAllFieldsCheckbox').addEventListener('change', (e) => {
      if (e.target.checked) {
        this.selectAllVisibleFields();
      } else {
        this.clearFieldSelection();
      }
    });

    // Table sorting
    document.querySelectorAll('.fields-table th.sortable').forEach(th => {
      th.addEventListener('click', () => this.sortTable(th.dataset.sort));
    });

    // Pagination
    document.getElementById('prevPageBtn').addEventListener('click', () => this.changePage(-1));
    document.getElementById('nextPageBtn').addEventListener('click', () => this.changePage(1));

    // Export
    document.getElementById('exportBtn').addEventListener('click', () => this.exportFields());

    // Usage analytics
    document.getElementById('loadUsageBtn').addEventListener('click', () => this.loadUsageData());
  }

  toggleSettingsPanel() {
    document.getElementById('settingsPanel').classList.toggle('hidden');
  }

  async loadObjects() {
    console.log('[ExportFieldsManager] Loading objects');

    const listContainer = document.getElementById('objectList');
    const loadingMessage = document.getElementById('objectListLoading');

    listContainer.classList.add('hidden');
    loadingMessage.classList.remove('hidden');

    try {
      this.objects = await ExportFieldsAPI.getAllObjects();
      this.renderObjectList();
      console.log('[ExportFieldsManager] Loaded', this.objects.length, 'objects');
    } catch (error) {
      console.error('[ExportFieldsManager] Error loading objects:', error);
      loadingMessage.innerHTML = `
        <span class="material-symbols-rounded">error</span>
        Error loading objects: ${escapeHtml(error.message)}
      `;
    }
  }

  renderObjectList() {
    const container = document.getElementById('objectList');
    const loadingMessage = document.getElementById('objectListLoading');
    const searchTerm = document.getElementById('objectSearch').value.toLowerCase();

    // Filter objects by search term
    const filteredObjects = this.objects.filter(obj => {
      return obj.label.toLowerCase().includes(searchTerm) ||
             obj.name.toLowerCase().includes(searchTerm);
    });

    if (filteredObjects.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No objects found</p></div>';
    } else {
      container.innerHTML = filteredObjects.map(obj => {
        const isSelected = this.selectedObjects.has(obj.name);
        return `
          <div class="object-item ${isSelected ? 'selected' : ''}" data-name="${obj.name}">
            <input type="checkbox" ${isSelected ? 'checked' : ''}>
            <span class="object-item-label">${escapeHtml(obj.label)}</span>
            <span class="object-item-name">(${escapeHtml(obj.name)})</span>
            ${obj.custom ? '<span class="object-item-badge custom">Custom</span>' : ''}
          </div>
        `;
      }).join('');

      // Add click handlers
      container.querySelectorAll('.object-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.type !== 'checkbox') {
            const checkbox = item.querySelector('input[type="checkbox"]');
            checkbox.checked = !checkbox.checked;
          }
          this.toggleObjectSelection(item.dataset.name, item.querySelector('input').checked);
        });
      });
    }

    loadingMessage.classList.add('hidden');
    container.classList.remove('hidden');
    this.updateObjectSelectionInfo();
  }

  filterObjects() {
    this.renderObjectList();
  }

  toggleObjectSelection(objectName, selected) {
    if (selected) {
      this.selectedObjects.add(objectName);
    } else {
      this.selectedObjects.delete(objectName);
    }

    // Update item styling
    const item = document.querySelector(`.object-item[data-name="${objectName}"]`);
    if (item) {
      item.classList.toggle('selected', selected);
    }

    this.updateObjectSelectionInfo();
  }

  selectAllObjects() {
    const searchTerm = document.getElementById('objectSearch').value.toLowerCase();
    const filteredObjects = this.objects.filter(obj => {
      return obj.label.toLowerCase().includes(searchTerm) ||
             obj.name.toLowerCase().includes(searchTerm);
    });

    filteredObjects.forEach(obj => {
      this.selectedObjects.add(obj.name);
    });

    this.renderObjectList();
  }

  clearObjectSelection() {
    this.selectedObjects.clear();
    this.renderObjectList();
  }

  updateObjectSelectionInfo() {
    document.getElementById('selectedObjectCount').textContent = this.selectedObjects.size;
    document.getElementById('loadFieldsBtn').disabled = this.selectedObjects.size === 0;
  }

  selectAllTypes() {
    document.querySelectorAll('#fieldTypeFilters input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
    });
  }

  clearAllTypes() {
    document.querySelectorAll('#fieldTypeFilters input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
  }

  getSelectedFieldTypes() {
    const types = [];
    document.querySelectorAll('#fieldTypeFilters input[type="checkbox"]:checked').forEach(cb => {
      types.push(cb.value);
    });
    return types;
  }

  getFieldCategory() {
    return document.querySelector('input[name="fieldCategory"]:checked').value;
  }

  async loadFields() {
    console.log('[ExportFieldsManager] Loading fields');

    if (this.selectedObjects.size === 0) {
      alert('Please select at least one object');
      return;
    }

    // Show progress section
    const progressSection = document.getElementById('progressSection');
    const resultsSection = document.getElementById('resultsSection');
    const emptyState = document.getElementById('emptyState');

    progressSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    emptyState.classList.add('hidden');

    // Get filter options
    const fieldTypes = this.getSelectedFieldTypes();
    const fieldCategory = this.getFieldCategory();

    const options = {
      fieldTypes,
      customOnly: fieldCategory === 'custom',
      standardOnly: fieldCategory === 'standard',
      includeToolingMetadata: this.settings.includeToolingMetadata
    };

    const objectNames = Array.from(this.selectedObjects);

    try {
      this.fields = await ExportFieldsAPI.getFieldsForObjects(
        objectNames,
        options,
        (current, total, objectName) => {
          const percent = Math.round((current / total) * 100);
          document.getElementById('progressBar').style.width = `${percent}%`;
          document.getElementById('progressText').textContent = `Loading ${escapeHtml(objectName)}...`;
          document.getElementById('progressDetails').textContent = `${current} of ${total} objects`;
        }
      );

      // Hide progress, show results
      progressSection.classList.add('hidden');

      if (this.fields.length === 0) {
        emptyState.classList.remove('hidden');
      } else {
        // Select all fields by default
        this.selectedFields.clear();
        this.fields.forEach(field => {
          this.selectedFields.add(`${field.objectName}.${field.apiName}`);
        });

        this.displayResults();

        // Enable Load Usage button now that we have fields
        document.getElementById('loadUsageBtn').disabled = false;
      }

      console.log('[ExportFieldsManager] Loaded', this.fields.length, 'fields');
    } catch (error) {
      console.error('[ExportFieldsManager] Error loading fields:', error);
      progressSection.classList.add('hidden');
      emptyState.classList.remove('hidden');
      emptyState.querySelector('p').textContent = `Error loading fields: ${escapeHtml(error.message)}`;
    }
  }

  displayResults() {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.classList.remove('hidden');

    // Update summary stats
    const summary = ExportFieldsAPI.getFieldSummary(this.fields);
    document.getElementById('totalFieldsCount').textContent = summary.total;
    document.getElementById('customFieldsCount').textContent = summary.custom;
    document.getElementById('standardFieldsCount').textContent = summary.standard;
    document.getElementById('requiredFieldsCount').textContent = summary.required;

    // Apply default export format
    const formatRadio = document.querySelector(`input[name="exportFormat"][value="${this.settings.defaultExportFormat}"]`);
    if (formatRadio) {
      formatRadio.checked = true;
    }

    // Reset pagination and sort
    this.currentPage = 1;
    this.sortColumn = 'objectName';
    this.sortDirection = 'asc';

    this.filterAndDisplayFields();
  }

  filterAndDisplayFields() {
    const searchTerm = document.getElementById('fieldSearch').value.toLowerCase();

    // Filter fields
    this.filteredFields = this.fields.filter(field => {
      if (!searchTerm) return true;
      return field.label.toLowerCase().includes(searchTerm) ||
             field.apiName.toLowerCase().includes(searchTerm) ||
             field.objectName.toLowerCase().includes(searchTerm) ||
             field.type.toLowerCase().includes(searchTerm);
    });

    // Sort fields
    this.filteredFields.sort((a, b) => {
      let aVal = a[this.sortColumn];
      let bVal = b[this.sortColumn];

      // Handle boolean values
      if (typeof aVal === 'boolean') {
        aVal = aVal ? 1 : 0;
        bVal = bVal ? 1 : 0;
      }

      // Handle string values
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    // Render table
    this.renderFieldsTable();
    this.updatePagination();
    this.updateFieldSelectionInfo();
  }

  renderFieldsTable() {
    const tbody = document.getElementById('fieldsTableBody');
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    const pageFields = this.filteredFields.slice(start, end);

    tbody.innerHTML = pageFields.map(field => {
      const fieldKey = `${field.objectName}.${field.apiName}`;
      const isSelected = this.selectedFields.has(fieldKey);
      const usageStats = this.fieldUsageData.get(fieldKey);
      const usageCount = usageStats?.totalUsage || 0;
      const usageLevel = FieldUsageAPI.getUsageLevel(usageCount);
      const usageColor = FieldUsageAPI.getUsageColor(usageLevel);

      return `
        <tr class="${isSelected ? 'selected' : ''}" data-key="${fieldKey}">
          <td class="col-checkbox">
            <input type="checkbox" ${isSelected ? 'checked' : ''}>
          </td>
          <td class="col-object">${escapeHtml(field.objectName)}</td>
          <td class="col-label">${escapeHtml(field.label)}</td>
          <td class="col-apiname">${escapeHtml(field.apiName)}</td>
          <td class="col-type">${escapeHtml(field.type)}</td>
          <td class="col-required">
            ${field.required ? '<span class="badge-yes badge-required">Yes</span>' : ''}
          </td>
          <td class="col-custom">
            ${field.custom ? '<span class="badge-yes badge-custom">Yes</span>' : ''}
          </td>
          <td class="col-usage">
            ${usageStats ? `<span class="usage-badge ${usageColor}" title="${this.formatUsageTooltip(usageStats)}">${usageCount}</span>` : '<span class="usage-not-loaded">-</span>'}
          </td>
        </tr>
      `;
    }).join('');

    // Add click handlers
    tbody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          const checkbox = row.querySelector('input[type="checkbox"]');
          checkbox.checked = !checkbox.checked;
        }
        this.toggleFieldSelection(row.dataset.key, row.querySelector('input').checked);
      });
    });

    // Update sort indicators
    document.querySelectorAll('.fields-table th.sortable').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === this.sortColumn) {
        th.classList.add(this.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });
  }

  sortTable(column) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.filterAndDisplayFields();
  }

  updatePagination() {
    const totalPages = Math.ceil(this.filteredFields.length / this.pageSize);
    document.getElementById('pageInfo').textContent = `Page ${this.currentPage} of ${totalPages || 1}`;
    document.getElementById('prevPageBtn').disabled = this.currentPage <= 1;
    document.getElementById('nextPageBtn').disabled = this.currentPage >= totalPages;
  }

  changePage(delta) {
    const totalPages = Math.ceil(this.filteredFields.length / this.pageSize);
    this.currentPage = Math.max(1, Math.min(totalPages, this.currentPage + delta));
    this.renderFieldsTable();
    this.updatePagination();
  }

  toggleFieldSelection(fieldKey, selected) {
    if (selected) {
      this.selectedFields.add(fieldKey);
    } else {
      this.selectedFields.delete(fieldKey);
    }

    // Update row styling
    const row = document.querySelector(`tr[data-key="${fieldKey}"]`);
    if (row) {
      row.classList.toggle('selected', selected);
    }

    this.updateFieldSelectionInfo();
  }

  selectAllVisibleFields() {
    this.filteredFields.forEach(field => {
      const fieldKey = `${field.objectName}.${field.apiName}`;
      this.selectedFields.add(fieldKey);
    });

    this.renderFieldsTable();
    this.updateFieldSelectionInfo();
    document.getElementById('selectAllFieldsCheckbox').checked = true;
  }

  clearFieldSelection() {
    this.selectedFields.clear();
    this.renderFieldsTable();
    this.updateFieldSelectionInfo();
    document.getElementById('selectAllFieldsCheckbox').checked = false;
  }

  updateFieldSelectionInfo() {
    document.getElementById('selectedFieldCount').textContent = this.selectedFields.size;
    document.getElementById('displayedFieldCount').textContent = this.filteredFields.length;
    document.getElementById('exportBtn').disabled = this.selectedFields.size === 0;

    // Update select all checkbox state
    const selectAllCheckbox = document.getElementById('selectAllFieldsCheckbox');
    const visibleSelected = this.filteredFields.filter(field => {
      const fieldKey = `${field.objectName}.${field.apiName}`;
      return this.selectedFields.has(fieldKey);
    }).length;

    selectAllCheckbox.checked = visibleSelected === this.filteredFields.length && this.filteredFields.length > 0;
    selectAllCheckbox.indeterminate = visibleSelected > 0 && visibleSelected < this.filteredFields.length;
  }

  exportFields() {
    console.log('[ExportFieldsManager] Exporting fields');

    if (this.selectedFields.size === 0) {
      alert('Please select at least one field to export');
      return;
    }

    // Get selected fields
    const fieldsToExport = this.fields.filter(field => {
      const fieldKey = `${field.objectName}.${field.apiName}`;
      return this.selectedFields.has(fieldKey);
    });

    // Get export format
    const format = document.querySelector('input[name="exportFormat"]:checked').value;

    let content, filename, mimeType;

    if (format === 'csv') {
      content = ExportFieldsAPI.exportToCSV(fieldsToExport);
      filename = 'field-export.csv';
      mimeType = 'text/csv;charset=utf-8';
    } else {
      content = ExportFieldsAPI.exportToJSON(fieldsToExport);
      filename = 'field-export.json';
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

    console.log('[ExportFieldsManager] Exported', fieldsToExport.length, 'fields as', format);
  }

  async loadUsageData() {
    console.log('[ExportFieldsManager] Loading field usage data');

    if (this.filteredFields.length === 0) {
      alert('Please load fields first before analyzing usage');
      return;
    }

    try {
      // Disable button and show progress
      const loadBtn = document.getElementById('loadUsageBtn');
      const progressDiv = document.getElementById('usageProgress');
      const progressFill = document.getElementById('usageProgressFill');
      const progressText = document.getElementById('usageProgressText');

      loadBtn.disabled = true;
      progressDiv.classList.remove('hidden');
      progressFill.style.width = '0%';

      // Group fields by object (use all fields, not just filtered)
      const fieldsByObject = {};
      this.fields.forEach(field => {
        if (!fieldsByObject[field.objectName]) {
          fieldsByObject[field.objectName] = [];
        }
        fieldsByObject[field.objectName].push(field.apiName);
      });

      const objectNames = Object.keys(fieldsByObject);
      let completed = 0;
      const total = objectNames.length;

      // Analyze each object's fields
      for (const objectName of objectNames) {
        const fieldNames = fieldsByObject[objectName];

        progressText.textContent = `Analyzing ${escapeHtml(objectName)}... (${completed + 1}/${total})`;

        try {
          const usageMap = await FieldUsageAPI.getFieldUsageStats(objectName, fieldNames, (current, total) => {
            // Sub-progress within object
            const objectProgress = (current / total) * 100;
            const overallProgress = ((completed + (current / total)) / total) * 100;
            progressFill.style.width = `${overallProgress}%`;
          });

          // Store usage data
          usageMap.forEach((stats, fieldName) => {
            const fieldKey = `${objectName}.${fieldName}`;
            this.fieldUsageData.set(fieldKey, stats);
          });

          completed++;
          const progress = (completed / total) * 100;
          progressFill.style.width = `${progress}%`;
        } catch (error) {
          console.error(`[ExportFieldsManager] Error analyzing ${objectName}:`, error);
          // Continue with other objects
        }
      }

      progressText.textContent = 'Usage analysis complete!';

      // Re-render table to show usage data
      this.displayResults();

      // Hide progress after a moment
      setTimeout(() => {
        progressDiv.classList.add('hidden');
        loadBtn.disabled = false;
      }, 2000);

      console.log('[ExportFieldsManager] Usage data loaded for', this.fieldUsageData.size, 'fields');
    } catch (error) {
      console.error('[ExportFieldsManager] Error loading usage data:', error);
      alert('Failed to load usage data: ' + escapeHtml(error.message));
      document.getElementById('usageProgress').classList.add('hidden');
      document.getElementById('loadUsageBtn').disabled = false;
    }
  }

  formatUsageTooltip(usageStats) {
    if (usageStats.recordsWithValue > 0) {
      return `${usageStats.recordsWithValue} record${usageStats.recordsWithValue !== 1 ? 's' : ''} have a value in this field`;
    }
    return 'No records have a value in this field';
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const manager = new ExportFieldsManager();
  manager.init();
});
