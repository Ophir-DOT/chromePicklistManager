class PicklistManagerApp {
  constructor() {
    this.selectedObjects = new Set();
    this.currentSession = null;
    this.sourceData = null;
    this.deploymentData = null;
    this.init();
  }

  async init() {
    await this.connectToSalesforce();
    this.setupEventListeners();
    this.setupTabs();
  }

  async connectToSalesforce() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.runtime.sendMessage({
        action: 'GET_SESSION'
      });

      if (response.success) {
        this.currentSession = response.data;
        this.updateConnectionStatus(true);
        await this.loadObjects();
      } else {
        this.updateConnectionStatus(false, response.error);
      }
    } catch (error) {
      console.error('Connection error:', error);
      this.updateConnectionStatus(false, error.message);
    }
  }

  updateConnectionStatus(connected, message = '') {
    const statusEl = document.getElementById('connectionStatus');
    const indicator = statusEl.querySelector('.status-indicator');
    const text = statusEl.querySelector('.status-text');

    if (connected) {
      indicator.className = 'status-indicator connected';
      text.textContent = `Connected to ${this.currentSession.instanceUrl}`;
    } else {
      indicator.className = 'status-indicator disconnected';
      text.textContent = message || 'Not Connected';
    }
  }

  async loadObjects() {
    const response = await chrome.runtime.sendMessage({
      action: 'GET_OBJECTS'
    });

    if (response.success) {
      this.renderObjectList(response.data);
    }
  }

  renderObjectList(objects) {
    const listEl = document.getElementById('objectList');
    listEl.innerHTML = '';

    objects.forEach(obj => {
      const item = document.createElement('div');
      item.className = 'object-item';
      item.innerHTML = `
        <label>
          <input type="checkbox" value="${obj.name}" data-label="${obj.label}">
          ${obj.label} (${obj.name})
        </label>
      `;
      listEl.appendChild(item);

      item.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectedObjects.add(obj.name);
        } else {
          this.selectedObjects.delete(obj.name);
        }
      });
    });
  }

  setupEventListeners() {
    // Export button
    document.getElementById('exportButton').addEventListener('click', () => {
      this.handleExport();
    });

    // Select all objects
    document.getElementById('selectAllObjects').addEventListener('click', () => {
      document.querySelectorAll('#objectList input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
        this.selectedObjects.add(cb.value);
      });
    });

    // Clear selection
    document.getElementById('clearSelection').addEventListener('click', () => {
      document.querySelectorAll('#objectList input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
      });
      this.selectedObjects.clear();
    });

    // Compare button
    document.getElementById('compareButton').addEventListener('click', () => {
      this.handleCompare();
    });

    // Deploy button
    document.getElementById('deployButton').addEventListener('click', () => {
      this.handleDeploy();
    });

    // File upload for deploy preview
    document.getElementById('deployFile').addEventListener('change', (e) => {
      this.previewDeployment(e.target.files[0]);
    });

    // Load source data
    document.getElementById('loadSourceData').addEventListener('click', () => {
      this.loadSourceData();
    });

    // Target data file
    document.getElementById('targetDataFile').addEventListener('change', (e) => {
      this.loadTargetData(e.target.files[0]);
    });
  }

  setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        // Remove active class from all tabs
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

        // Add active class to clicked tab
        e.target.classList.add('active');
        const tabName = e.target.dataset.tab;
        document.getElementById(`${tabName}-tab`).classList.add('active');
      });
    });
  }

  async handleExport() {
    if (this.selectedObjects.size === 0) {
      alert('Please select at least one object');
      return;
    }

    const resultsEl = document.getElementById('exportResults');
    resultsEl.innerHTML = '<p class="loading">Exporting...</p>';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'EXPORT_PICKLISTS',
        objects: Array.from(this.selectedObjects)
      });

      if (response.success) {
        this.downloadJSON(response.data, 'picklist-export.json');
        resultsEl.innerHTML = '<p class="success">Export completed successfully</p>';
      } else {
        resultsEl.innerHTML = `<p class="error">Error: ${response.error}</p>`;
      }
    } catch (error) {
      resultsEl.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
  }

  async loadSourceData() {
    if (this.selectedObjects.size === 0) {
      alert('Please select at least one object');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'EXPORT_PICKLISTS',
        objects: Array.from(this.selectedObjects)
      });

      if (response.success) {
        this.sourceData = response.data;
        alert('Source data loaded successfully');
      }
    } catch (error) {
      alert(`Error loading source data: ${error.message}`);
    }
  }

  loadTargetData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        this.targetData = JSON.parse(e.target.result);
        alert('Target data loaded successfully');
      } catch (error) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }

  async handleCompare() {
    if (!this.sourceData || !this.targetData) {
      alert('Please load both source and target data');
      return;
    }

    const resultsEl = document.getElementById('compareResults');
    resultsEl.innerHTML = '<p class="loading">Comparing...</p>';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'COMPARE_ORGS',
        source: this.sourceData,
        target: this.targetData
      });

      if (response.success) {
        this.renderComparison(response.data);
      }
    } catch (error) {
      resultsEl.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
  }

  renderComparison(differences) {
    const resultsEl = document.getElementById('compareResults');
    let html = '<div class="comparison-results">';

    if (Object.keys(differences).length === 0) {
      html += '<p>No differences found</p>';
    } else {
      for (const [objectName, diffs] of Object.entries(differences)) {
        html += `<h3>${objectName}</h3><ul>`;
        diffs.forEach(diff => {
          html += `<li>${diff.field}: ${diff.type}</li>`;
        });
        html += '</ul>';
      }
    }

    html += '</div>';
    resultsEl.innerHTML = html;
  }

  async handleDeploy() {
    if (!this.deploymentData) {
      alert('Please upload a configuration file first');
      return;
    }

    const statusEl = document.getElementById('deployStatus');
    statusEl.innerHTML = '<p class="loading">Deploying...</p>';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'DEPLOY_CHANGES',
        metadata: this.deploymentData
      });

      if (response.success) {
        statusEl.innerHTML = '<p class="success">Deployment initiated. This feature is under development.</p>';
      } else {
        statusEl.innerHTML = `<p class="error">Deploy failed: ${response.error}</p>`;
      }
    } catch (error) {
      statusEl.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
  }

  downloadJSON(data, filename) {
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

  async previewDeployment(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        this.deploymentData = JSON.parse(e.target.result);
        this.renderDeployPreview(this.deploymentData);
      } catch (error) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }

  renderDeployPreview(data) {
    const previewEl = document.getElementById('deployPreview');

    let html = '<div class="preview-content">';

    for (const [objectName, fields] of Object.entries(data)) {
      html += `<h3>${objectName}</h3>`;
      html += '<ul>';

      for (const [fieldName, fieldData] of Object.entries(fields)) {
        html += `<li><strong>${fieldName}</strong>`;

        if (fieldData.values) {
          html += `<br>Values: ${fieldData.values.length}`;
        }

        if (fieldData.valueSettings) {
          html += `<br>Dependencies: ${fieldData.valueSettings.length}`;
        }

        html += '</li>';
      }

      html += '</ul>';
    }

    html += '</div>';
    previewEl.innerHTML = html;
  }
}

// Initialize app
new PicklistManagerApp();
