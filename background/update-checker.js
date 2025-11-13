// Update Checker for Internal Distribution via GitHub
// Checks GitHub Releases API for new versions

class UpdateChecker {
  // Configure your GitHub repository here
  // Format: 'owner/repo' (e.g., 'yourorg/chromePicklistManager')
  static GITHUB_REPO = 'Ophir-DOT/chromePicklistManager';

  // GitHub API endpoint for latest release
  static get GITHUB_API_URL() {
    return `https://api.github.com/repos/${this.GITHUB_REPO}/releases/latest`;
  }

  // Check interval: 24 hours
  static CHECK_INTERVAL = 24 * 60 * 60 * 1000;

  /**
   * Check for updates on extension startup and periodically
   */
  static async initialize() {
    console.log('[UpdateChecker] Initializing GitHub update checker...');

    // Check immediately on startup
    await this.checkForUpdates();

    // Set up periodic checks
    setInterval(() => {
      this.checkForUpdates();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Check if a new version is available via GitHub Releases
   */
  static async checkForUpdates() {
    try {
      console.log('[UpdateChecker] Checking for updates from GitHub...');

      // Get current version from manifest
      const manifest = chrome.runtime.getManifest();
      const currentVersion = manifest.version;

      // Fetch latest release from GitHub
      const response = await fetch(this.GITHUB_API_URL, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        },
        cache: 'no-cache'
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log('[UpdateChecker] No releases found on GitHub');
        } else {
          console.warn('[UpdateChecker] Could not check for updates:', response.status);
        }
        return;
      }

      const release = await response.json();

      // Extract version from tag (e.g., "v1.0.0" or "1.0.0")
      const latestVersion = release.tag_name.replace(/^v/, '');
      const tagName = release.tag_name;

      console.log('[UpdateChecker] Current:', currentVersion, 'Latest:', latestVersion);

      // Compare versions
      if (this.isNewerVersion(latestVersion, currentVersion)) {
        console.log('[UpdateChecker] New version available!');

        // Try to find attached ZIP asset first (if developer uploaded one)
        const zipAsset = release.assets.find(asset =>
          asset.name.endsWith('.zip') &&
          asset.name.includes('salesforce-picklist-manager')
        );

        // Use attached ZIP if available, otherwise use GitHub's archive download
        const downloadUrl = zipAsset
          ? zipAsset.browser_download_url
          : `https://github.com/${this.GITHUB_REPO}/archive/refs/tags/${tagName}.zip`;

        console.log('[UpdateChecker] Download URL:', downloadUrl);

        // Store update info
        await chrome.storage.local.set({
          updateAvailable: true,
          latestVersion: latestVersion,
          downloadUrl: downloadUrl,
          releaseNotes: release.body || 'No release notes provided',
          releaseName: release.name,
          updateCheckedAt: Date.now()
        });

        // Show notification
        this.showUpdateNotification(latestVersion, downloadUrl);
      } else {
        console.log('[UpdateChecker] Extension is up to date');

        // Clear update flag
        await chrome.storage.local.set({
          updateAvailable: false
        });
      }

    } catch (error) {
      console.error('[UpdateChecker] Error checking for updates:', error);
      // Silently fail - don't disrupt user experience
    }
  }

  /**
   * Compare version strings (semantic versioning)
   * Returns true if newVersion > currentVersion
   */
  static isNewerVersion(newVersion, currentVersion) {
    const parseVersion = (v) => v.split('.').map(n => parseInt(n, 10));

    const newParts = parseVersion(newVersion);
    const currentParts = parseVersion(currentVersion);

    for (let i = 0; i < 3; i++) {
      if (newParts[i] > currentParts[i]) return true;
      if (newParts[i] < currentParts[i]) return false;
    }

    return false; // Versions are equal
  }

  /**
   * Show browser notification about available update
   */
  static showUpdateNotification(version, downloadUrl) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Picklist Manager Update Available',
      message: `Version ${version} is now available. Click to download.`,
      priority: 1,
      requireInteraction: true
    }, (notificationId) => {
      // Store notification ID with download URL
      chrome.storage.local.set({
        [`notification_${notificationId}`]: downloadUrl
      });
    });
  }

  /**
   * Handle notification clicks - open download URL
   */
  static handleNotificationClick(notificationId) {
    chrome.storage.local.get([`notification_${notificationId}`], (result) => {
      const downloadUrl = result[`notification_${notificationId}`];
      if (downloadUrl) {
        chrome.tabs.create({ url: downloadUrl });
      }
    });
  }

  /**
   * Get current update status
   */
  static async getUpdateStatus() {
    const result = await chrome.storage.local.get([
      'updateAvailable',
      'latestVersion',
      'downloadUrl',
      'releaseNotes',
      'updateCheckedAt'
    ]);

    return {
      updateAvailable: result.updateAvailable || false,
      latestVersion: result.latestVersion || null,
      downloadUrl: result.downloadUrl || null,
      releaseNotes: result.releaseNotes || null,
      lastChecked: result.updateCheckedAt || null
    };
  }
}

export default UpdateChecker;
