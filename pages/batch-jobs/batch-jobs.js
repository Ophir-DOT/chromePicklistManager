// Batch Job Monitor
// Displays and manages Salesforce asynchronous jobs

import ThemeManager from '../../background/theme-manager.js';
import BatchJobAPI from '../../background/batch-job-api.js';
import SessionManager from '../../background/session-manager.js';

class BatchJobMonitor {
  constructor() {
    // State
    this.activeJobs = [];
    this.completedJobs = [];
    this.scheduledJobs = [];
    this.previousJobStates = new Map(); // Track previous states for notifications

    // Settings
    this.refreshInterval = 30000; // 30 seconds default
    this.notifyOnComplete = true;
    this.notifyOnError = true;
    this.jobHistoryHours = 24;
    this.filterByClassNames = false;
    this.allowedClassNames = [
      'Ctrl_CMP_Data_Migration_Batchable',
      'Batch_Training',
      'Batchable_Generate_PDF',
      'Batchable_File_Updates'
    ];

    // Timer
    this.refreshTimer = null;
    this.countdownValue = 0;
    this.countdownTimer = null;

    // Job to abort
    this.jobToAbort = null;

    // Job to execute now
    this.jobToExecute = null;

    this.init();
  }

  async init() {
    console.log('[BatchJobMonitor] Initializing...');

    // Initialize theme
    await ThemeManager.initTheme();

    // Load settings
    await this.loadSettings();

    // Load org info
    await this.loadOrgInfo();

    // Setup event listeners
    this.setupEventListeners();

    // Load initial data
    await this.loadAllJobs();

    // Start auto-refresh if enabled
    this.startAutoRefresh();

    // Request notification permission
    this.requestNotificationPermission();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get('batchJobMonitorSettings');
      const settings = result.batchJobMonitorSettings || {};

      this.refreshInterval = settings.refreshInterval || 30000;
      this.notifyOnComplete = settings.notifyOnComplete !== false;
      this.notifyOnError = settings.notifyOnError !== false;
      this.jobHistoryHours = settings.jobHistoryHours || 24;
      this.filterByClassNames = settings.filterByClassNames || false;
      if (settings.allowedClassNames && settings.allowedClassNames.length > 0) {
        this.allowedClassNames = settings.allowedClassNames;
      }

      // Apply to UI
      document.getElementById('refreshInterval').value = this.refreshInterval;
      document.getElementById('notifyOnComplete').checked = this.notifyOnComplete;
      document.getElementById('notifyOnError').checked = this.notifyOnError;
      document.getElementById('jobHistoryHours').value = this.jobHistoryHours;
      document.getElementById('filterByClassNames').checked = this.filterByClassNames;
      document.getElementById('allowedClassNames').value = this.allowedClassNames.join('\n');

      console.log('[BatchJobMonitor] Settings loaded:', settings);
    } catch (error) {
      console.error('[BatchJobMonitor] Error loading settings:', error);
    }
  }

  async saveSettings() {
    try {
      const settings = {
        refreshInterval: this.refreshInterval,
        notifyOnComplete: this.notifyOnComplete,
        notifyOnError: this.notifyOnError,
        jobHistoryHours: this.jobHistoryHours,
        filterByClassNames: this.filterByClassNames,
        allowedClassNames: this.allowedClassNames
      };

      await chrome.storage.local.set({ batchJobMonitorSettings: settings });
      console.log('[BatchJobMonitor] Settings saved');
    } catch (error) {
      console.error('[BatchJobMonitor] Error saving settings:', error);
    }
  }

  async loadOrgInfo() {
    try {
      const session = await SessionManager.getCurrentSession();
      if (session && session.instanceUrl) {
        document.getElementById('orgUrl').textContent = session.instanceUrl;
      }
    } catch (error) {
      console.error('[BatchJobMonitor] Error loading org info:', error);
      document.getElementById('orgUrl').textContent = 'Not connected';
    }
  }

  setupEventListeners() {
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.loadAllJobs();
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
      document.getElementById('settingsPanel').classList.toggle('hidden');
    });

    // Close settings
    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
      document.getElementById('settingsPanel').classList.add('hidden');
    });

    // Settings changes
    document.getElementById('refreshInterval').addEventListener('change', (e) => {
      this.refreshInterval = parseInt(e.target.value);
      this.saveSettings();
      this.startAutoRefresh();
    });

    document.getElementById('notifyOnComplete').addEventListener('change', (e) => {
      this.notifyOnComplete = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('notifyOnError').addEventListener('change', (e) => {
      this.notifyOnError = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('jobHistoryHours').addEventListener('change', (e) => {
      this.jobHistoryHours = parseInt(e.target.value);
      this.saveSettings();
      this.loadAllJobs();
    });

    document.getElementById('filterByClassNames').addEventListener('change', (e) => {
      this.filterByClassNames = e.target.checked;
      this.saveSettings();
      this.loadAllJobs();
    });

    document.getElementById('allowedClassNames').addEventListener('change', (e) => {
      // Parse textarea into array, filtering empty lines
      this.allowedClassNames = e.target.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      this.saveSettings();
      if (this.filterByClassNames) {
        this.loadAllJobs();
      }
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Filters
    document.getElementById('jobTypeFilter').addEventListener('change', () => this.applyFilters());
    document.getElementById('statusFilter').addEventListener('change', () => this.applyFilters());
    document.getElementById('searchInput').addEventListener('input', () => this.applyFilters());

    // Abort modal
    document.getElementById('confirmAbortBtn').addEventListener('click', () => this.confirmAbort());
    document.getElementById('cancelAbortBtn').addEventListener('click', () => this.closeAbortModal());

    // Execute Now modal
    document.getElementById('confirmExecuteBtn').addEventListener('click', () => this.confirmExecuteNow());
    document.getElementById('cancelExecuteBtn').addEventListener('click', () => this.closeExecuteNowModal());
  }

  switchTab(tab) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `${tab}Tab`);
      panel.classList.toggle('hidden', panel.id !== `${tab}Tab`);
    });
  }

  async loadAllJobs() {
    console.log('[BatchJobMonitor] Loading all jobs...');

    try {
      // Store previous states for notification comparison
      this.activeJobs.forEach(job => {
        this.previousJobStates.set(job.Id, job.Status);
      });

      // Determine class filter
      const classFilter = this.filterByClassNames && this.allowedClassNames.length > 0
        ? this.allowedClassNames
        : null;

      // Load all job types in parallel
      const [activeJobs, completedJobs, scheduledJobs] = await Promise.all([
        BatchJobAPI.getActiveJobs(50, classFilter),
        BatchJobAPI.getRecentCompletedJobs(this.jobHistoryHours, 50, classFilter),
        BatchJobAPI.getScheduledJobs(50)
      ]);

      this.activeJobs = activeJobs;
      this.completedJobs = completedJobs;
      this.scheduledJobs = scheduledJobs;

      // Check for status changes and notify
      this.checkForNotifications(completedJobs);

      // Update UI
      this.updateSummary();
      this.renderActiveJobs();
      this.renderCompletedJobs();
      this.renderScheduledJobs();
      this.updateLastRefresh();

    } catch (error) {
      console.error('[BatchJobMonitor] Error loading jobs:', error);
      this.showError('Failed to load jobs: ' + error.message);
    }
  }

  checkForNotifications(completedJobs) {
    completedJobs.forEach(job => {
      const previousStatus = this.previousJobStates.get(job.Id);

      // Only notify if status changed from active to completed/failed
      if (previousStatus && ['Queued', 'Preparing', 'Processing', 'Holding'].includes(previousStatus)) {
        if (job.Status === 'Completed' && this.notifyOnComplete) {
          this.showNotification(
            'Job Completed',
            `${job.ApexClass?.Name || 'Unknown'} completed successfully`,
            'success'
          );
        } else if (job.Status === 'Failed' && this.notifyOnError) {
          this.showNotification(
            'Job Failed',
            `${job.ApexClass?.Name || 'Unknown'} failed with ${job.NumberOfErrors} errors`,
            'error'
          );
        }
      }
    });
  }

  updateSummary() {
    const activeCount = this.activeJobs.filter(j =>
      ['Processing', 'Preparing'].includes(j.Status)
    ).length;
    const queuedCount = this.activeJobs.filter(j =>
      ['Queued', 'Holding'].includes(j.Status)
    ).length;
    const completedCount = this.completedJobs.filter(j =>
      j.Status === 'Completed'
    ).length;
    const failedCount = this.completedJobs.filter(j =>
      j.Status === 'Failed'
    ).length;

    document.getElementById('activeCount').textContent = activeCount;
    document.getElementById('queuedCount').textContent = queuedCount;
    document.getElementById('completedCount').textContent = completedCount;
    document.getElementById('failedCount').textContent = failedCount;

    // Update badges
    document.getElementById('activeJobsBadge').textContent = this.activeJobs.length;
    document.getElementById('completedJobsBadge').textContent = this.completedJobs.length;
    document.getElementById('scheduledJobsBadge').textContent = this.scheduledJobs.length;
  }

  renderActiveJobs() {
    const container = document.getElementById('activeJobsContainer');
    const emptyState = document.getElementById('noActiveJobs');

    if (this.activeJobs.length === 0) {
      container.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    const filteredJobs = this.filterJobs(this.activeJobs);
    container.innerHTML = filteredJobs.map(job => this.createJobCard(job, true)).join('');

    // Add abort button handlers
    container.querySelectorAll('.abort-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const jobId = e.currentTarget.dataset.jobId;
        this.showAbortModal(jobId);
      });
    });
  }

  renderCompletedJobs() {
    const container = document.getElementById('completedJobsContainer');
    const emptyState = document.getElementById('noCompletedJobs');

    if (this.completedJobs.length === 0) {
      container.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    const filteredJobs = this.filterJobs(this.completedJobs);
    container.innerHTML = filteredJobs.map(job => this.createJobCard(job, false)).join('');
  }

  renderScheduledJobs() {
    const container = document.getElementById('scheduledJobsContainer');
    const emptyState = document.getElementById('noScheduledJobs');

    if (this.scheduledJobs.length === 0) {
      container.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    container.innerHTML = this.scheduledJobs.map(job => this.createScheduledJobCard(job)).join('');

    // Add execute now button handlers
    container.querySelectorAll('.execute-now-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const jobId = e.currentTarget.dataset.jobId;
        const className = e.currentTarget.dataset.className;
        this.showExecuteNowModal(jobId, className);
      });
    });
  }

  filterJobs(jobs) {
    const typeFilter = document.getElementById('jobTypeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    return jobs.filter(job => {
      if (typeFilter && job.JobType !== typeFilter) return false;
      if (statusFilter && job.Status !== statusFilter) return false;
      if (searchTerm && !(job.ApexClass?.Name || '').toLowerCase().includes(searchTerm)) return false;
      return true;
    });
  }

  applyFilters() {
    this.renderActiveJobs();
    this.renderCompletedJobs();
  }

  createJobCard(job, showAbort = false) {
    const formattedJob = BatchJobAPI.formatJob(job);
    const statusClass = BatchJobAPI.getStatusColor(job.Status);
    const icon = BatchJobAPI.getJobTypeIcon(job.JobType);

    const progress = formattedJob.totalItems > 0 ? formattedJob.progress : 0;
    const showProgress = ['Processing', 'Preparing'].includes(job.Status) && formattedJob.totalItems > 0;

    return `
      <div class="job-card" data-job-id="${job.Id}">
        <div class="job-card-header">
          <div class="job-info">
            <span class="material-symbols-rounded job-type-icon">${icon}</span>
            <div class="job-details">
              <h3>${formattedJob.className}</h3>
              <span class="job-meta">
                ${job.JobType} | Started ${this.formatDate(job.CreatedDate)}
                ${job.CompletedDate ? ` | Completed ${this.formatDate(job.CompletedDate)}` : ''}
              </span>
            </div>
          </div>
          <div class="job-actions">
            <span class="status-badge ${statusClass}">${job.Status}</span>
            ${showAbort ? `
              <button class="job-action-btn abort abort-btn" data-job-id="${job.Id}" title="Abort Job">
                <span class="material-symbols-rounded">cancel</span>
              </button>
            ` : ''}
          </div>
        </div>

        ${showProgress ? `
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="progress-text">
              <span>${progress}% complete</span>
              <span>${formattedJob.itemsProcessed} / ${formattedJob.totalItems} items</span>
            </div>
          </div>
        ` : ''}

        <div class="job-stats">
          <span>
            <span class="material-symbols-rounded">timer</span>
            ${formattedJob.durationFormatted}
          </span>
          ${formattedJob.errors > 0 ? `
            <span class="errors">
              <span class="material-symbols-rounded">error</span>
              ${formattedJob.errors} errors
            </span>
          ` : ''}
          ${formattedJob.methodName ? `
            <span>
              <span class="material-symbols-rounded">code</span>
              ${formattedJob.methodName}
            </span>
          ` : ''}
        </div>

        ${job.ExtendedStatus ? `
          <div class="extended-status" style="margin-top: 8px; font-size: 12px; color: var(--brand-color-neutral-med);">
            ${job.ExtendedStatus}
          </div>
        ` : ''}
      </div>
    `;
  }

  createScheduledJobCard(job) {
    const nextFire = job.NextFireTime ? this.formatDate(job.NextFireTime) : 'Not scheduled';
    const prevFire = job.PreviousFireTime ? this.formatDate(job.PreviousFireTime) : 'Never';
    const className = job.CronJobDetail?.Name || 'Unknown';
    const isActive = job.State === 'WAITING';

    return `
      <div class="job-card">
        <div class="job-card-header">
          <div class="job-info">
            <span class="material-symbols-rounded job-type-icon">event_repeat</span>
            <div class="job-details">
              <h3>${className}</h3>
              <span class="job-meta">
                Scheduled Job | Triggered ${job.TimesTriggered || 0} times
              </span>
            </div>
          </div>
          <div class="job-actions">
            <span class="status-badge ${isActive ? 'status-queued' : 'status-aborted'}">
              ${job.State}
            </span>
            ${isActive ? `
              <button class="job-action-btn execute execute-now-btn" data-job-id="${job.Id}" data-class-name="${className}" title="Execute Now">
                <span class="material-symbols-rounded">play_arrow</span>
              </button>
            ` : ''}
          </div>
        </div>

        <div class="job-stats">
          <span>
            <span class="material-symbols-rounded">schedule</span>
            Next: ${nextFire}
          </span>
          <span>
            <span class="material-symbols-rounded">history</span>
            Last: ${prevFire}
          </span>
        </div>

        ${job.CronExpression ? `
          <div style="margin-top: 8px; font-size: 12px; color: var(--brand-color-neutral-med); font-family: monospace;">
            ${job.CronExpression}
          </div>
        ` : ''}
      </div>
    `;
  }

  formatDate(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    // If less than 24 hours, show relative time
    if (diff < 86400000) {
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      return `${Math.floor(diff / 3600000)}h ago`;
    }

    // Otherwise show date
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  updateLastRefresh() {
    const now = new Date();
    document.getElementById('lastRefresh').textContent =
      `Last updated: ${now.toLocaleTimeString()}`;
  }

  startAutoRefresh() {
    // Clear existing timers
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);

    if (this.refreshInterval === 0) {
      document.getElementById('refreshCountdown').textContent = 'Disabled';
      document.getElementById('autoRefreshStatus').querySelector('.material-symbols-rounded')
        .style.animation = 'none';
      return;
    }

    // Start countdown display
    this.countdownValue = this.refreshInterval / 1000;
    this.updateCountdown();

    this.countdownTimer = setInterval(() => {
      this.countdownValue--;
      if (this.countdownValue <= 0) {
        this.countdownValue = this.refreshInterval / 1000;
      }
      this.updateCountdown();
    }, 1000);

    // Start refresh timer
    this.refreshTimer = setInterval(() => {
      this.loadAllJobs();
    }, this.refreshInterval);

    // Enable spin animation
    document.getElementById('autoRefreshStatus').querySelector('.material-symbols-rounded')
      .style.animation = '';
  }

  updateCountdown() {
    const seconds = this.countdownValue;
    const text = seconds >= 60
      ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
      : `${seconds}s`;
    document.getElementById('refreshCountdown').textContent = text;
  }

  showAbortModal(jobId) {
    const job = this.activeJobs.find(j => j.Id === jobId);
    if (!job) return;

    this.jobToAbort = job;
    document.getElementById('abortJobClass').textContent = job.ApexClass?.Name || 'Unknown';
    document.getElementById('abortJobStatus').textContent = job.Status;
    document.getElementById('abortModal').classList.remove('hidden');
  }

  closeAbortModal() {
    this.jobToAbort = null;
    document.getElementById('abortModal').classList.add('hidden');
  }

  async confirmAbort() {
    if (!this.jobToAbort) return;

    const jobId = this.jobToAbort.Id;
    const className = this.jobToAbort.ApexClass?.Name || 'Unknown';

    try {
      await BatchJobAPI.abortJob(jobId);
      this.showNotification('Job Aborted', `${className} has been aborted`, 'info');
      this.closeAbortModal();
      this.loadAllJobs();
    } catch (error) {
      console.error('[BatchJobMonitor] Error aborting job:', error);
      alert('Failed to abort job: ' + error.message);
    }
  }

  showExecuteNowModal(jobId, className) {
    const job = this.scheduledJobs.find(j => j.Id === jobId);
    if (!job) return;

    this.jobToExecute = { id: jobId, className: className, job: job };
    document.getElementById('executeJobClass').textContent = className;
    const nextRun = job.NextFireTime ? this.formatDate(job.NextFireTime) : 'Not scheduled';
    document.getElementById('executeJobNextRun').textContent = nextRun;
    document.getElementById('executeNowModal').classList.remove('hidden');
  }

  closeExecuteNowModal() {
    this.jobToExecute = null;
    document.getElementById('executeNowModal').classList.add('hidden');
  }

  async confirmExecuteNow() {
    if (!this.jobToExecute) return;

    const { id, className } = this.jobToExecute;

    try {
      // Call the API to execute the scheduled job now
      const result = await BatchJobAPI.executeScheduledJobNow(id, className);

      this.showNotification('Job Started', `${className} is now running`, 'success');
      this.closeExecuteNowModal();
      // Wait a moment then refresh to show the new job in active tab
      setTimeout(() => {
        this.loadAllJobs();
        // Switch to active tab to show the newly started job
        this.switchTab('active');
      }, 1000);
    } catch (error) {
      console.error('[BatchJobMonitor] Error executing job:', error);
      alert('Failed to execute job: ' + error.message);
    }
  }

  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  showNotification(title, message, type = 'info') {
    // Try browser notification first
    if ('Notification' in window && Notification.permission === 'granted') {
      const iconMap = {
        success: 'https://fonts.gstatic.com/s/i/materialiconsround/check_circle/v1/24px.svg',
        error: 'https://fonts.gstatic.com/s/i/materialiconsround/error/v1/24px.svg',
        info: 'https://fonts.gstatic.com/s/i/materialiconsround/info/v1/24px.svg'
      };

      new Notification(title, {
        body: message,
        icon: iconMap[type] || iconMap.info
      });
    }

    // Also try Chrome extension notification
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '../images/icon128.png',
        title: title,
        message: message
      });
    } catch (e) {
      // Notifications API may not be available
      console.log('[BatchJobMonitor] Chrome notifications not available');
    }
  }

  showError(message) {
    // Could add a toast notification here
    console.error('[BatchJobMonitor]', message);
    alert(message);
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  new BatchJobMonitor();
});
