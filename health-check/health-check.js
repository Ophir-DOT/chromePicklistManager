// Progressive DOT Health Check
// Executes health checks sequentially with real-time UI updates

import ThemeManager from '../background/theme-manager.js';
import { escapeHtml } from '../shared/utils.js';

class ProgressiveHealthCheck {
  constructor() {
    this.checks = [];
    this.completedCount = 0;
    this.startTime = Date.now();
    this.orgUrl = '';
    this.results = {};

    this.init();
  }

  async init() {
    console.log('[HealthCheck] Initializing progressive health check page...');

    // Initialize theme
    await ThemeManager.initTheme();

    // Set initial meta info
    await this.loadMetaInfo();

    // Load check list (standard + custom)
    await this.loadCheckList();

    // Render tiles
    this.renderTiles();

    // Start executing checks sequentially
    await this.executeChecksSequentially();

    // Setup button handlers
    this.setupButtons();
  }

  async loadMetaInfo() {
    try {
      // Get session info for org URL
      const response = await chrome.runtime.sendMessage({ action: 'GET_SESSION' });
      if (response.success && response.data) {
        this.orgUrl = response.data.instanceUrl;
        document.getElementById('orgUrl').textContent = this.orgUrl;
      }

      // Set timestamp
      const now = new Date();
      document.getElementById('timestamp').textContent = now.toLocaleString();
      document.title = `DOT Health Check - ${now.toLocaleString()}`;
    } catch (error) {
      console.error('[HealthCheck] Error loading meta info:', error);
    }
  }

  async loadCheckList() {
    // Standard checks (always included)
    this.checks = [
      { name: 'System Information', type: 'standard' },
      { name: 'Security Settings', type: 'standard' },
      { name: 'Org Limits', type: 'standard' },
      { name: 'API Usage', type: 'standard' },
      { name: 'Environment Settings', type: 'standard' },
      { name: 'Data Migration', type: 'standard' }
    ];

    // Load custom checks from storage
    try {
      const result = await chrome.storage.local.get('customHealthChecks');
      const customChecks = result.customHealthChecks || [];

      // Add enabled custom checks
      customChecks.forEach(check => {
        if (check.enabled) {
          this.checks.push({
            name: check.title,
            type: 'custom',
            customCheck: check
          });
        }
      });

      console.log(`[HealthCheck] Loaded ${this.checks.length} checks (${this.checks.length - 6} custom)`);
    } catch (error) {
      console.error('[HealthCheck] Error loading custom checks:', error);
    }

    // Update progress counter
    document.getElementById('progressCount').textContent = `0 of ${this.checks.length} complete`;
    document.getElementById('progressText').textContent = 'Starting health checks...';
  }

  renderTiles() {
    const container = document.getElementById('checksContainer');
    container.innerHTML = '';

    this.checks.forEach((check, index) => {
      const tile = this.createTile(check, index);
      container.appendChild(tile);
    });
  }

  createTile(check, index) {
    const tile = document.createElement('div');
    tile.className = 'check-tile loading';
    tile.id = `tile-${index}`;
    tile.setAttribute('data-check-name', check.name);

    tile.innerHTML = `
      <div class="tile-header">
        <div class="tile-icon loading">
          <div class="spinner"></div>
        </div>
        <div class="tile-title">${escapeHtml(check.name)}</div>
      </div>
      <div class="tile-content loading">
        <div class="skeleton long"></div>
        <div class="skeleton medium"></div>
        <div class="skeleton short"></div>
      </div>
    `;

    return tile;
  }

  async executeChecksSequentially() {
    console.log(`[HealthCheck] Starting sequential execution of ${this.checks.length} checks...`);

    for (let i = 0; i < this.checks.length; i++) {
      const check = this.checks[i];

      console.log(`[HealthCheck] Executing check ${i + 1}/${this.checks.length}: ${check.name}`);
      document.getElementById('progressText').textContent = `Running: ${check.name}...`;

      try {
        const result = await this.executeCheck(check);
        this.results[check.name] = result;
        this.updateTile(i, result, 'success');
      } catch (error) {
        console.error(`[HealthCheck] Error in check "${check.name}":`, error);
        const errorResult = {
          name: check.name,
          status: 'error',
          message: error.message || 'Unknown error occurred',
          fields: []
        };
        this.results[check.name] = errorResult;
        this.updateTile(i, errorResult, 'error');
      }

      // Update progress
      this.completedCount++;
      this.updateProgress();
    }

    // All checks complete
    this.onAllChecksComplete();
  }

  async executeCheck(check) {
    if (check.type === 'standard') {
      // Execute standard check
      const response = await chrome.runtime.sendMessage({
        action: 'RUN_SINGLE_HEALTH_CHECK',
        checkName: check.name
      });

      console.log(`[HealthCheck] Response for "${check.name}":`, response);

      if (!response) {
        throw new Error('No response from service worker - extension may need to be reloaded');
      }

      if (!response.success) {
        throw new Error(response.error || 'Check failed');
      }

      return response.result;
    } else if (check.type === 'custom') {
      // Execute custom check
      const response = await chrome.runtime.sendMessage({
        action: 'RUN_SINGLE_HEALTH_CHECK',
        checkName: 'custom',
        customCheck: check.customCheck
      });

      console.log(`[HealthCheck] Response for custom check "${check.name}":`, response);

      if (!response) {
        throw new Error('No response from service worker - extension may need to be reloaded');
      }

      if (!response.success) {
        throw new Error(response.error || 'Check failed');
      }

      return response.result;
    }
  }

  updateTile(index, result, status) {
    const tile = document.getElementById(`tile-${index}`);
    if (!tile) return;

    // Update tile class
    tile.className = `check-tile ${status}`;

    // Update icon
    const icon = tile.querySelector('.tile-icon');
    icon.className = `tile-icon ${status}`;

    if (status === 'success') {
      icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    } else if (status === 'error') {
      icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
    }

    // Update content
    const content = tile.querySelector('.tile-content');
    content.className = 'tile-content';
    content.innerHTML = this.renderCheckContent(result);
  }

  renderCheckContent(result) {
    if (result.status === 'error') {
      return `<div class="error-message">${escapeHtml(result.message)}</div>`;
    }

    // Handle special cases (Org Limits, API Usage with storage/usage displays)
    if (result.name === 'Org Limits' && result.storage) {
      return this.renderStorageDisplay(result.storage);
    }

    // Standard field display
    if (!result.fields || result.fields.length === 0) {
      return '<div style="color: #666; font-size: 14px;">No data to display</div>';
    }

    let html = '';
    result.fields.forEach((field, index) => {
      const valueClass = field.match === true ? 'match' : (field.match === false ? 'no-match' : '');
      const hasCopyable = field.match === false && field.expected !== null && field.expected !== undefined;
      const fieldId = `field-${result.name.replace(/\s+/g, '-')}-${index}`;

      if (hasCopyable) {
        // Clickable value with copy functionality
        html += `
          <div class="field">
            <div class="field-label">${escapeHtml(field.label)}</div>
            <div class="field-value ${valueClass} copyable"
                 data-copy-value="${escapeHtml(String(field.expected))}"
                 data-field-id="${fieldId}"
                 title="Click to copy correct value: ${escapeHtml(String(field.expected))}">
              ${escapeHtml(String(field.value))}
              <span class="copy-icon material-symbols-rounded">content_copy</span>
              <span class="copy-feedback" id="feedback-${fieldId}">Copied!</span>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="field">
            <div class="field-label">${escapeHtml(field.label)}</div>
            <div class="field-value ${valueClass}">${escapeHtml(String(field.value))}</div>
          </div>
        `;
      }

      // Add help text if present
      if (field.helpText) {
        html += `<div class="help-text"><strong>Action Required:</strong> ${escapeHtml(field.helpText)}</div>`;
      }
    });

    return html;
  }

  renderStorageDisplay(storage) {
    return `
      <div class="storage-display">
        <div class="storage-item">
          <div class="storage-label">File Storage</div>
          <div class="storage-bar">
            <div class="storage-fill ${storage.file.status}" style="width: ${storage.file.usedPercent}%"></div>
            <div class="storage-text">${storage.file.used} / ${storage.file.max} MB (${storage.file.usedPercent}%)</div>
          </div>
        </div>
        <div class="storage-item">
          <div class="storage-label">Data Storage</div>
          <div class="storage-bar">
            <div class="storage-fill ${storage.data.status}" style="width: ${storage.data.usedPercent}%"></div>
            <div class="storage-text">${storage.data.used} / ${storage.data.max} MB (${storage.data.usedPercent}%)</div>
          </div>
        </div>
      </div>
    `;
  }

  updateProgress() {
    const percentage = (this.completedCount / this.checks.length) * 100;
    document.getElementById('progressFill').style.width = `${percentage}%`;
    document.getElementById('progressCount').textContent = `${this.completedCount} of ${this.checks.length} complete`;
  }

  onAllChecksComplete() {
    console.log('[HealthCheck] All checks complete!');

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    document.getElementById('duration').textContent = `${duration}s`;
    document.getElementById('progressText').textContent = 'All health checks complete!';

    // Enable PDF button
    document.getElementById('downloadPdfBtn').disabled = false;

    // Update title
    document.title = `DOT Health Check - Complete (${duration}s)`;
  }

  setupButtons() {
    // PDF Download
    document.getElementById('downloadPdfBtn').addEventListener('click', () => {
      window.print();
    });

    // Refresh
    document.getElementById('refreshBtn').addEventListener('click', () => {
      location.reload();
    });

    // Copy to clipboard for incorrect values
    document.addEventListener('click', async (e) => {
      const copyableElement = e.target.closest('.field-value.copyable');
      if (copyableElement) {
        const valueToCopy = copyableElement.dataset.copyValue;
        const fieldId = copyableElement.dataset.fieldId;

        try {
          await navigator.clipboard.writeText(valueToCopy);

          // Show feedback
          const feedback = document.getElementById(`feedback-${fieldId}`);
          if (feedback) {
            feedback.classList.add('show');
            setTimeout(() => {
              feedback.classList.remove('show');
            }, 2000);
          }

          console.log('[HealthCheck] Copied to clipboard:', valueToCopy);
        } catch (error) {
          console.error('[HealthCheck] Failed to copy to clipboard:', error);
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = valueToCopy;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
      }
    });
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  new ProgressiveHealthCheck();
});
