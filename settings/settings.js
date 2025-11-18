// Settings Page JavaScript - Manage Custom Health Checks

class HealthCheckSettings {
  constructor() {
    this.checks = [];
    this.currentEditId = null;
    this.init();
  }

  async init() {
    console.log('[Settings] Initializing settings page');
    await this.loadChecks();
    this.setupEventListeners();
    this.render();
    await this.loadVersionInfo();
    await this.checkUpdateStatus();
    await this.loadKeyboardShortcuts();
  }

  setupEventListeners() {
    // Check for updates button
    const checkUpdateBtn = document.getElementById('checkUpdateBtn');
    if (checkUpdateBtn) {
      checkUpdateBtn.addEventListener('click', () => {
        this.manualUpdateCheck();
      });
    }

    // Clear all shortcuts button
    const clearAllShortcutsBtn = document.getElementById('clearAllShortcutsBtn');
    if (clearAllShortcutsBtn) {
      clearAllShortcutsBtn.addEventListener('click', () => {
        this.clearAllShortcuts();
      });
    }

    // Shortcut item click handlers - open Chrome shortcuts page
    document.querySelectorAll('.shortcut-item').forEach(item => {
      item.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      });
    });

    // Add check button
    document.getElementById('addCheckBtn').addEventListener('click', () => {
      this.openModal();
    });

    // Close modal button
    document.getElementById('closeModal').addEventListener('click', () => {
      this.closeModal();
    });

    // Cancel button
    document.getElementById('cancelBtn').addEventListener('click', () => {
      this.closeModal();
    });

    // Form submit
    document.getElementById('checkForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveCheck();
    });

    // Expected type change
    document.getElementById('expectedType').addEventListener('change', (e) => {
      this.handleExpectedTypeChange(e.target.value);
    });

    // Close modal on background click
    document.getElementById('checkModal').addEventListener('click', (e) => {
      if (e.target.id === 'checkModal') {
        this.closeModal();
      }
    });
  }

  handleExpectedTypeChange(type) {
    const expectedValueGroup = document.getElementById('expectedValueGroup');
    const expectedValueInput = document.getElementById('expectedValue');

    if (type === 'value') {
      expectedValueGroup.style.display = 'block';
      expectedValueInput.required = true;
    } else {
      expectedValueGroup.style.display = 'none';
      expectedValueInput.required = false;
      expectedValueInput.value = '';
    }
  }

  async loadChecks() {
    try {
      const result = await chrome.storage.local.get('customHealthChecks');
      this.checks = result.customHealthChecks || [];
      console.log('[Settings] Loaded checks:', this.checks.length);
    } catch (error) {
      console.error('[Settings] Error loading checks:', error);
      this.checks = [];
    }
  }

  async saveChecks() {
    try {
      await chrome.storage.local.set({ customHealthChecks: this.checks });
      console.log('[Settings] Saved checks:', this.checks.length);
    } catch (error) {
      console.error('[Settings] Error saving checks:', error);
      alert('Failed to save settings. Please try again.');
    }
  }

  render() {
    const checksList = document.getElementById('checksList');
    const emptyState = document.getElementById('emptyState');

    if (this.checks.length === 0) {
      checksList.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    checksList.innerHTML = this.checks.map(check => this.renderCheckItem(check)).join('');

    // Add event listeners to edit/delete buttons
    this.checks.forEach(check => {
      const editBtn = document.getElementById(`edit-${check.id}`);
      const deleteBtn = document.getElementById(`delete-${check.id}`);

      if (editBtn) {
        editBtn.addEventListener('click', () => this.editCheck(check.id));
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => this.deleteCheck(check.id));
      }
    });
  }

  renderCheckItem(check) {
    const expectedValueText = check.expectedType === 'none'
      ? 'No validation'
      : check.expectedType === 'zero'
        ? 'Expect 0'
        : `Expect: ${check.expectedValue}`;

    return `
      <div class="check-item ${check.enabled ? '' : 'disabled'}">
        <div class="check-header">
          <div class="check-title">
            ${this.escapeHtml(check.title)}
            <span class="check-badge ${check.enabled ? 'enabled' : 'disabled'}">
              ${check.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div class="check-actions">
            <button id="edit-${check.id}" class="btn-icon" title="Edit">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
            <button id="delete-${check.id}" class="btn-icon delete" title="Delete">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="check-query">${this.escapeHtml(check.query)}</div>
        <div class="check-meta">
          <div class="check-meta-item">
            <span class="check-meta-label">Expected:</span>
            <span>${expectedValueText}</span>
          </div>
        </div>
      </div>
    `;
  }

  openModal(check = null) {
    const modal = document.getElementById('checkModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('checkForm');

    if (check) {
      // Edit mode
      modalTitle.textContent = 'Edit Custom Health Check';
      this.currentEditId = check.id;
      document.getElementById('checkTitle').value = check.title;
      document.getElementById('checkQuery').value = check.query;
      document.getElementById('expectedType').value = check.expectedType;
      document.getElementById('checkEnabled').checked = check.enabled;

      if (check.expectedType === 'value') {
        document.getElementById('expectedValue').value = check.expectedValue || '';
        document.getElementById('expectedValueGroup').style.display = 'block';
        document.getElementById('expectedValue').required = true;
      } else {
        document.getElementById('expectedValueGroup').style.display = 'none';
        document.getElementById('expectedValue').required = false;
      }
    } else {
      // Add mode
      modalTitle.textContent = 'Add Custom Health Check';
      this.currentEditId = null;
      form.reset();
      document.getElementById('expectedValueGroup').style.display = 'none';
      document.getElementById('expectedValue').required = false;
    }

    modal.classList.add('active');
  }

  closeModal() {
    const modal = document.getElementById('checkModal');
    modal.classList.remove('active');
    this.currentEditId = null;
    document.getElementById('checkForm').reset();
  }

  async saveCheck() {
    const title = document.getElementById('checkTitle').value.trim();
    const query = document.getElementById('checkQuery').value.trim();
    const expectedType = document.getElementById('expectedType').value;
    const expectedValue = document.getElementById('expectedValue').value.trim();
    const enabled = document.getElementById('checkEnabled').checked;

    // Validate
    if (!title || !query) {
      alert('Please fill in all required fields.');
      return;
    }

    // Basic SOQL validation
    if (!query.toUpperCase().startsWith('SELECT')) {
      alert('Query must be a valid SOQL SELECT statement.');
      return;
    }

    // Validate expected value if type is 'value'
    if (expectedType === 'value' && !expectedValue) {
      alert('Please provide an expected value.');
      return;
    }

    // Create or update check
    const checkData = {
      id: this.currentEditId || this.generateId(),
      title,
      query,
      expectedType,
      expectedValue: expectedType === 'value' ? expectedValue : null,
      enabled,
      createdAt: this.currentEditId
        ? this.checks.find(c => c.id === this.currentEditId)?.createdAt || Date.now()
        : Date.now(),
      updatedAt: Date.now()
    };

    if (this.currentEditId) {
      // Update existing check
      const index = this.checks.findIndex(c => c.id === this.currentEditId);
      if (index !== -1) {
        this.checks[index] = checkData;
      }
    } else {
      // Add new check
      this.checks.push(checkData);
    }

    await this.saveChecks();
    this.closeModal();
    this.render();

    console.log('[Settings] Check saved:', checkData);
  }

  editCheck(id) {
    const check = this.checks.find(c => c.id === id);
    if (check) {
      this.openModal(check);
    }
  }

  async deleteCheck(id) {
    const check = this.checks.find(c => c.id === id);
    if (!check) return;

    if (!confirm(`Are you sure you want to delete "${check.title}"?`)) {
      return;
    }

    this.checks = this.checks.filter(c => c.id !== id);
    await this.saveChecks();
    this.render();

    console.log('[Settings] Check deleted:', id);
  }

  generateId() {
    return 'check_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================================
  // KEYBOARD SHORTCUTS
  // ============================================================================

  async loadKeyboardShortcuts() {
    try {
      // Get all commands from Chrome
      const commands = await chrome.commands.getAll();
      console.log('[Settings] Loaded shortcuts:', commands);

      // Update the display for each shortcut
      commands.forEach(command => {
        const displayEl = document.querySelector(`[data-command="${command.name}"]`);
        if (displayEl) {
          if (command.shortcut) {
            // Format the shortcut for display
            const keys = command.shortcut.split('+').map(key => key.trim());
            displayEl.innerHTML = keys.map(key => `<kbd>${key}</kbd>`).join(' + ');
          } else {
            displayEl.innerHTML = '<span class="no-shortcut">Not set</span>';
          }
        }
      });
    } catch (error) {
      console.error('[Settings] Error loading shortcuts:', error);
    }
  }

  async clearAllShortcuts() {
    if (!confirm('Are you sure you want to clear all keyboard shortcuts? You can reconfigure them later in chrome://extensions/shortcuts')) {
      return;
    }

    try {
      // Get all commands
      const commands = await chrome.commands.getAll();

      // Clear each command by updating with empty shortcut
      for (const command of commands) {
        try {
          await chrome.commands.update({
            name: command.name,
            shortcut: ''
          });
        } catch (error) {
          console.warn(`[Settings] Could not clear shortcut for ${command.name}:`, error);
        }
      }

      console.log('[Settings] All shortcuts cleared');

      // Reload the shortcuts display
      await this.loadKeyboardShortcuts();

      // Show success message
      alert('All keyboard shortcuts have been cleared. You can reconfigure them by clicking on any shortcut or visiting chrome://extensions/shortcuts');

    } catch (error) {
      console.error('[Settings] Error clearing shortcuts:', error);
      alert('Failed to clear shortcuts. Please try again.');
    }
  }

  // ============================================================================
  // UPDATE CHECKER
  // ============================================================================

  async loadVersionInfo() {
    try {
      const manifest = chrome.runtime.getManifest();
      document.getElementById('currentVersion').textContent = `v${manifest.version}`;
    } catch (error) {
      console.error('[Settings] Error loading version:', error);
      document.getElementById('currentVersion').textContent = 'Unknown';
    }
  }

  async checkUpdateStatus() {
    try {
      const result = await chrome.storage.local.get([
        'updateAvailable',
        'latestVersion',
        'downloadUrl',
        'updateCheckedAt'
      ]);

      const statusEl = document.getElementById('updateStatus');
      const statusTextEl = document.getElementById('updateStatusText');

      if (result.updateAvailable) {
        statusEl.className = 'update-status update-available';
        statusTextEl.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          Update available: v${result.latestVersion} -
          <a href="${result.downloadUrl}" target="_blank" style="color: inherit; text-decoration: underline;">Download</a>
        `;
      } else if (result.updateCheckedAt) {
        const lastChecked = new Date(result.updateCheckedAt);
        const timeAgo = this.getTimeAgo(lastChecked);
        statusEl.className = 'update-status up-to-date';
        statusTextEl.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          Up to date (checked ${timeAgo})
        `;
      } else {
        statusEl.className = 'update-status';
        statusTextEl.textContent = 'Update status unknown';
      }
    } catch (error) {
      console.error('[Settings] Error checking update status:', error);
    }
  }

  async manualUpdateCheck() {
    const btn = document.getElementById('checkUpdateBtn');
    const statusEl = document.getElementById('updateStatus');
    const statusTextEl = document.getElementById('updateStatusText');

    try {
      // Disable button and show checking status
      btn.disabled = true;
      btn.textContent = 'Checking...';
      statusEl.className = 'update-status checking';
      statusTextEl.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
        Checking for updates...
      `;

      // Send message to background worker to check for updates
      const response = await chrome.runtime.sendMessage({ action: 'CHECK_FOR_UPDATES' });

      console.log('[Settings] Update check response:', response);

      // Wait a moment for the storage to update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh the status display
      await this.checkUpdateStatus();

    } catch (error) {
      console.error('[Settings] Error during manual update check:', error);
      statusEl.className = 'update-status';
      statusTextEl.textContent = 'Error checking for updates';
    } finally {
      // Re-enable button
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
        Check for Updates
      `;
    }
  }

  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new HealthCheckSettings();
  });
} else {
  new HealthCheckSettings();
}
