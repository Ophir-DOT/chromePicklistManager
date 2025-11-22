// Deployment History UI
// Display and manage deployment history with filtering and export capabilities

import ThemeManager from '../../background/theme-manager.js';

// Global state
let deploymentHistory = [];
let filteredHistory = [];
let currentView = 'list'; // 'list' or 'timeline'

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize theme
  await ThemeManager.initTheme();

  // Set up event listeners
  setupEventListeners();

  // Load deployment history
  await loadDeploymentHistory();
});

function setupEventListeners() {
  // Header actions
  document.getElementById('refreshBtn').addEventListener('click', loadDeploymentHistory);
  document.getElementById('exportBtn').addEventListener('click', showExportModal);
  document.getElementById('clearBtn').addEventListener('click', confirmClearHistory);

  // Filters
  document.getElementById('metadataTypeFilter').addEventListener('change', applyFilters);
  document.getElementById('actionFilter').addEventListener('change', applyFilters);
  document.getElementById('statusFilter').addEventListener('change', applyFilters);
  document.getElementById('dateFromFilter').addEventListener('change', applyFilters);
  document.getElementById('dateToFilter').addEventListener('change', applyFilters);
  document.getElementById('searchInput').addEventListener('input', applyFilters);

  // View toggle
  document.getElementById('listViewBtn').addEventListener('click', () => switchView('list'));
  document.getElementById('timelineViewBtn').addEventListener('click', () => switchView('timeline'));

  // Export modal
  document.getElementById('doExportBtn').addEventListener('click', doExport);
  document.getElementById('cancelExportBtn').addEventListener('click', hideExportModal);

  // Details modal
  document.getElementById('closeDetailsBtn').addEventListener('click', hideDetailsModal);
}

async function loadDeploymentHistory() {
  try {
    console.log('[DeploymentHistory] Loading deployment history...');

    // Request deployment history from service worker
    const response = await chrome.runtime.sendMessage({
      action: 'GET_DEPLOYMENT_HISTORY',
      payload: {}
    });

    if (response.success) {
      deploymentHistory = response.data;
      filteredHistory = [...deploymentHistory];

      console.log('[DeploymentHistory] Loaded', deploymentHistory.length, 'deployments');

      // Update UI
      updateStatistics();
      renderDeployments();
    } else {
      console.error('[DeploymentHistory] Error loading history:', response.error);
      showError('Failed to load deployment history: ' + response.error);
    }
  } catch (error) {
    console.error('[DeploymentHistory] Error:', error);
    showError('Failed to load deployment history');
  }
}

function updateStatistics() {
  const total = deploymentHistory.length;
  const successful = deploymentHistory.filter(d => d.status === 'success').length;
  const failed = deploymentHistory.filter(d => d.status === 'failure').length;

  // Recent activity (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recent = deploymentHistory.filter(d => new Date(d.timestamp) >= sevenDaysAgo).length;

  document.getElementById('totalCount').textContent = total;
  document.getElementById('successCount').textContent = successful;
  document.getElementById('failedCount').textContent = failed;
  document.getElementById('recentCount').textContent = recent;
}

function applyFilters() {
  const metadataType = document.getElementById('metadataTypeFilter').value;
  const action = document.getElementById('actionFilter').value;
  const status = document.getElementById('statusFilter').value;
  const dateFrom = document.getElementById('dateFromFilter').value;
  const dateTo = document.getElementById('dateToFilter').value;
  const search = document.getElementById('searchInput').value.toLowerCase();

  filteredHistory = deploymentHistory.filter(deployment => {
    // Metadata type filter
    if (metadataType && deployment.metadataType !== metadataType) {
      return false;
    }

    // Action filter
    if (action && deployment.action !== action) {
      return false;
    }

    // Status filter
    if (status && deployment.status !== status) {
      return false;
    }

    // Date from filter
    if (dateFrom && new Date(deployment.timestamp) < new Date(dateFrom)) {
      return false;
    }

    // Date to filter
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      if (new Date(deployment.timestamp) > toDate) {
        return false;
      }
    }

    // Search filter
    if (search) {
      const searchableText = [
        deployment.componentName,
        deployment.objectName,
        deployment.orgName,
        deployment.metadataType,
        deployment.action
      ].filter(Boolean).join(' ').toLowerCase();

      if (!searchableText.includes(search)) {
        return false;
      }
    }

    return true;
  });

  renderDeployments();
}

function renderDeployments() {
  if (currentView === 'list') {
    renderListView();
  } else {
    renderTimelineView();
  }
}

function renderListView() {
  const tbody = document.getElementById('deploymentTableBody');

  if (filteredHistory.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <span class="material-symbols-rounded">history</span>
          <p>No deployments found</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredHistory.map(deployment => `
    <tr class="deployment-row" data-id="${deployment.id}">
      <td class="timestamp">${formatTimestamp(deployment.timestamp)}</td>
      <td class="org-name">${escapeHtml(deployment.orgName || deployment.orgId)}</td>
      <td class="metadata-type">${escapeHtml(deployment.metadataType)}</td>
      <td class="action">
        <span class="action-badge action-${deployment.action}">${deployment.action}</span>
      </td>
      <td class="component-name">
        ${deployment.objectName ? escapeHtml(deployment.objectName) + '.' : ''}${escapeHtml(deployment.componentName)}
      </td>
      <td class="status">
        <span class="status-badge status-${deployment.status}">
          <span class="material-symbols-rounded">${deployment.status === 'success' ? 'check_circle' : 'error'}</span>
          ${deployment.status}
        </span>
      </td>
      <td class="actions">
        <button class="btn btn-icon btn-sm view-details-btn" data-id="${deployment.id}" title="View Details">
          <span class="material-symbols-rounded">visibility</span>
        </button>
        <button class="btn btn-icon btn-sm delete-btn" data-id="${deployment.id}" title="Delete">
          <span class="material-symbols-rounded">delete</span>
        </button>
      </td>
    </tr>
  `).join('');

  // Add event listeners
  tbody.querySelectorAll('.view-details-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      showDeploymentDetails(id);
    });
  });

  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      deleteDeployment(id);
    });
  });
}

function renderTimelineView() {
  const container = document.getElementById('timelineContainer');

  if (filteredHistory.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">timeline</span>
        <p>No deployments found</p>
      </div>
    `;
    return;
  }

  // Group by date
  const groupedByDate = {};
  filteredHistory.forEach(deployment => {
    const date = new Date(deployment.timestamp).toLocaleDateString();
    if (!groupedByDate[date]) {
      groupedByDate[date] = [];
    }
    groupedByDate[date].push(deployment);
  });

  container.innerHTML = Object.keys(groupedByDate).map(date => `
    <div class="timeline-group">
      <div class="timeline-date">${date}</div>
      <div class="timeline-items">
        ${groupedByDate[date].map(deployment => `
          <div class="timeline-item status-${deployment.status}">
            <div class="timeline-icon">
              <span class="material-symbols-rounded">${getMetadataIcon(deployment.metadataType)}</span>
            </div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-time">${formatTime(deployment.timestamp)}</span>
                <span class="action-badge action-${deployment.action}">${deployment.action}</span>
                <span class="status-badge status-${deployment.status}">${deployment.status}</span>
              </div>
              <div class="timeline-title">
                ${deployment.objectName ? escapeHtml(deployment.objectName) + '.' : ''}${escapeHtml(deployment.componentName)}
              </div>
              <div class="timeline-meta">
                <span>${escapeHtml(deployment.metadataType)}</span>
                <span>•</span>
                <span>${escapeHtml(deployment.orgName || deployment.orgId)}</span>
              </div>
              ${deployment.errorMessage ? `<div class="timeline-error">${escapeHtml(deployment.errorMessage)}</div>` : ''}
              <div class="timeline-actions">
                <button class="btn btn-sm view-details-btn" data-id="${deployment.id}">
                  <span class="material-symbols-rounded">visibility</span>
                  Details
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Add event listeners
  container.querySelectorAll('.view-details-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      showDeploymentDetails(id);
    });
  });
}

function switchView(view) {
  currentView = view;

  const listView = document.getElementById('listView');
  const timelineView = document.getElementById('timelineView');
  const listBtn = document.getElementById('listViewBtn');
  const timelineBtn = document.getElementById('timelineViewBtn');

  if (view === 'list') {
    listView.classList.remove('hidden');
    timelineView.classList.add('hidden');
    listBtn.classList.add('active');
    timelineBtn.classList.remove('active');
  } else {
    listView.classList.add('hidden');
    timelineView.classList.remove('hidden');
    listBtn.classList.remove('active');
    timelineBtn.classList.add('active');
  }

  renderDeployments();
}

async function showDeploymentDetails(deploymentId) {
  const deployment = filteredHistory.find(d => d.id === deploymentId);
  if (!deployment) return;

  const detailsContent = document.getElementById('detailsContent');
  detailsContent.innerHTML = `
    <div class="details-grid">
      <div class="detail-item">
        <label>Timestamp:</label>
        <span>${formatTimestamp(deployment.timestamp)}</span>
      </div>
      <div class="detail-item">
        <label>Deployment ID:</label>
        <span>${deployment.id}</span>
      </div>
      <div class="detail-item">
        <label>Org Name:</label>
        <span>${escapeHtml(deployment.orgName || 'N/A')}</span>
      </div>
      <div class="detail-item">
        <label>Org ID:</label>
        <span>${deployment.orgId}</span>
      </div>
      <div class="detail-item">
        <label>Metadata Type:</label>
        <span>${escapeHtml(deployment.metadataType)}</span>
      </div>
      <div class="detail-item">
        <label>Action:</label>
        <span class="action-badge action-${deployment.action}">${deployment.action}</span>
      </div>
      <div class="detail-item">
        <label>Object:</label>
        <span>${escapeHtml(deployment.objectName || 'N/A')}</span>
      </div>
      <div class="detail-item">
        <label>Component:</label>
        <span>${escapeHtml(deployment.componentName)}</span>
      </div>
      <div class="detail-item">
        <label>Status:</label>
        <span class="status-badge status-${deployment.status}">${deployment.status}</span>
      </div>
      ${deployment.deploymentId ? `
        <div class="detail-item">
          <label>Salesforce Deployment ID:</label>
          <span>${deployment.deploymentId}</span>
        </div>
      ` : ''}
      ${deployment.errorMessage ? `
        <div class="detail-item full-width">
          <label>Error Message:</label>
          <div class="error-message">${escapeHtml(deployment.errorMessage)}</div>
        </div>
      ` : ''}
      ${deployment.changeDetails.before || deployment.changeDetails.after ? `
        <div class="detail-item full-width">
          <label>Change Details:</label>
          <div class="change-details">
            ${deployment.changeDetails.before ? `
              <div class="change-section">
                <h4>Before:</h4>
                <pre><code>${escapeHtml(JSON.stringify(deployment.changeDetails.before, null, 2))}</code></pre>
              </div>
            ` : ''}
            ${deployment.changeDetails.after ? `
              <div class="change-section">
                <h4>After:</h4>
                <pre><code>${escapeHtml(JSON.stringify(deployment.changeDetails.after, null, 2))}</code></pre>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('detailsModal').classList.remove('hidden');
}

function hideDetailsModal() {
  document.getElementById('detailsModal').classList.add('hidden');
}

async function deleteDeployment(deploymentId) {
  if (!confirm('Are you sure you want to delete this deployment record?')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'DELETE_DEPLOYMENT',
      payload: { deploymentId }
    });

    if (response.success) {
      await loadDeploymentHistory();
    } else {
      showError('Failed to delete deployment: ' + response.error);
    }
  } catch (error) {
    console.error('[DeploymentHistory] Error deleting deployment:', error);
    showError('Failed to delete deployment');
  }
}

async function confirmClearHistory() {
  if (!confirm('Are you sure you want to clear all deployment history? This action cannot be undone.')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'CLEAR_DEPLOYMENT_HISTORY',
      payload: {}
    });

    if (response.success) {
      await loadDeploymentHistory();
    } else {
      showError('Failed to clear history: ' + response.error);
    }
  } catch (error) {
    console.error('[DeploymentHistory] Error clearing history:', error);
    showError('Failed to clear history');
  }
}

function showExportModal() {
  document.getElementById('exportModal').classList.remove('hidden');
}

function hideExportModal() {
  document.getElementById('exportModal').classList.add('hidden');
}

async function doExport() {
  const format = document.querySelector('input[name="exportFormat"]:checked').value;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'EXPORT_DEPLOYMENT_HISTORY',
      payload: {
        format,
        history: filteredHistory
      }
    });

    if (response.success) {
      const filename = `deployment-history-${Date.now()}.${format}`;
      const blob = new Blob([response.data], {
        type: format === 'csv' ? 'text/csv' : 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      hideExportModal();
    } else {
      showError('Failed to export: ' + response.error);
    }
  } catch (error) {
    console.error('[DeploymentHistory] Error exporting:', error);
    showError('Failed to export deployment history');
  }
}

// Utility functions
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getMetadataIcon(metadataType) {
  const icons = {
    'CustomObject': 'database',
    'CustomField': 'text_fields',
    'ValidationRule': 'rule',
    'Flow': 'account_tree',
    'Picklist': 'list',
    'FieldDependency': 'link',
    'Profile': 'admin_panel_settings',
    'PermissionSet': 'admin_panel_settings'
  };
  return icons[metadataType] || 'deployed_code';
}

function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showError(message) {
  alert(message);
}
