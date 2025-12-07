/**
 * Approval Process Check
 * Queries and displays CompSuite__Approval_Process__c records for the current record
 */

// State
let currentRecordId = null;
let currentObjectName = null;
let approvalProcesses = [];
let currentSession = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Approval Process Check] Page loaded');

  // Get record ID from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  currentRecordId = urlParams.get('recordId');
  currentObjectName = urlParams.get('objectName');

  console.log('[Approval Process Check] Record ID:', currentRecordId);
  console.log('[Approval Process Check] Object Name:', currentObjectName);

  // Update record info display
  document.getElementById('recordIdValue').textContent = currentRecordId || 'Unknown';
  document.getElementById('objectTypeValue').textContent = currentObjectName || 'Unknown';

  // Setup event listeners
  setupEventListeners();

  // Load approval processes
  if (currentRecordId) {
    await loadApprovalProcesses();
  } else {
    showError('No record ID provided');
  }
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
  document.getElementById('refreshBtn').addEventListener('click', handleRefresh);
  document.getElementById('exportBtn').addEventListener('click', handleExport);
}

/**
 * Load approval processes for the current record
 */
async function loadApprovalProcesses() {
  try {
    showLoading();

    console.log('[Approval Process Check] Fetching approval processes for record:', currentRecordId);

    // Send message to background to query approval processes
    const response = await chrome.runtime.sendMessage({
      action: 'CHECK_APPROVAL_PROCESS',
      recordId: currentRecordId
    });

    console.log('[Approval Process Check] Response:', response);

    if (!response.success) {
      throw new Error(response.error || 'Failed to load approval processes');
    }

    approvalProcesses = response.data.records || [];
    currentSession = response.data.session;

    if (approvalProcesses.length === 0) {
      showEmpty();
    } else {
      showResults();
    }

  } catch (error) {
    console.error('[Approval Process Check] Error loading approval processes:', error);
    showError(error.message);
  }
}

/**
 * Display loading state
 */
function showLoading() {
  document.getElementById('loadingSection').classList.remove('hidden');
  document.getElementById('errorSection').classList.add('hidden');
  document.getElementById('emptySection').classList.add('hidden');
  document.getElementById('resultsSection').classList.add('hidden');
}

/**
 * Display error state
 */
function showError(message) {
  document.getElementById('loadingSection').classList.add('hidden');
  document.getElementById('errorSection').classList.remove('hidden');
  document.getElementById('emptySection').classList.add('hidden');
  document.getElementById('resultsSection').classList.add('hidden');
  document.getElementById('errorMessage').textContent = message;
}

/**
 * Display empty state
 */
function showEmpty() {
  document.getElementById('loadingSection').classList.add('hidden');
  document.getElementById('errorSection').classList.add('hidden');
  document.getElementById('emptySection').classList.remove('hidden');
  document.getElementById('resultsSection').classList.add('hidden');
}

/**
 * Display results
 */
function showResults() {
  document.getElementById('loadingSection').classList.add('hidden');
  document.getElementById('errorSection').classList.add('hidden');
  document.getElementById('emptySection').classList.add('hidden');
  document.getElementById('resultsSection').classList.remove('hidden');

  // Update count
  document.getElementById('resultCount').textContent = approvalProcesses.length;

  // Build table
  buildApprovalTable();
}

/**
 * Build approval process table
 */
function buildApprovalTable() {
  const tbody = document.getElementById('approvalTableBody');
  tbody.innerHTML = '';

  approvalProcesses.forEach(process => {
    const row = document.createElement('tr');

    // Status column
    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = 'status-badge';
    statusBadge.textContent = process.CompSuite__Status__c || 'N/A';

    // Add status-specific class for styling
    const status = (process.CompSuite__Status__c || '').toLowerCase();
    if (status.includes('approved')) {
      statusBadge.classList.add('status-approved');
    } else if (status.includes('pending') || status.includes('submitted')) {
      statusBadge.classList.add('status-pending');
    } else if (status.includes('rejected')) {
      statusBadge.classList.add('status-rejected');
    }

    statusCell.appendChild(statusBadge);
    row.appendChild(statusCell);

    // Process column (Name with link)
    const processCell = document.createElement('td');
    const processLink = document.createElement('a');
    processLink.href = `${currentSession.instanceUrl}/${process.Id}`;
    processLink.target = '_blank';
    processLink.className = 'record-link';
    processLink.textContent = process.Name || 'N/A';
    processCell.appendChild(processLink);
    row.appendChild(processCell);

    // Approval Process Init column (with link)
    const initCell = document.createElement('td');
    if (process.CompSuite__Approval_Process_Init__r && process.CompSuite__Approval_Process_Init__r.Name) {
      const initLink = document.createElement('a');
      initLink.href = `${currentSession.instanceUrl}/${process.CompSuite__Approval_Process_Init__c}`;
      initLink.target = '_blank';
      initLink.className = 'record-link';
      initLink.textContent = process.CompSuite__Approval_Process_Init__r.Name;
      initCell.appendChild(initLink);
    } else {
      initCell.textContent = 'N/A';
    }
    row.appendChild(initCell);

    // Created Date column
    const createdCell = document.createElement('td');
    createdCell.textContent = formatDate(process.CreatedDate);
    row.appendChild(createdCell);

    tbody.appendChild(row);
  });
}

/**
 * Format date string
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';

  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
}

/**
 * Handle refresh button click
 */
async function handleRefresh() {
  await loadApprovalProcesses();
}

/**
 * Handle export button click
 */
function handleExport() {
  if (!approvalProcesses || approvalProcesses.length === 0) {
    alert('No data to export');
    return;
  }

  try {
    // Build CSV
    const headers = ['Status', 'Process Name', 'Process ID', 'Approval Process Init Name', 'Approval Process Init ID', 'Created Date'];
    const rows = approvalProcesses.map(process => [
      process.CompSuite__Status__c || '',
      process.Name || '',
      process.Id || '',
      process.CompSuite__Approval_Process_Init__r?.Name || '',
      process.CompSuite__Approval_Process_Init__c || '',
      process.CreatedDate || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `approval-processes-${currentRecordId}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[Approval Process Check] Exported to CSV');
  } catch (error) {
    console.error('[Approval Process Check] Export error:', error);
    alert(`Export failed: ${error.message}`);
  }
}