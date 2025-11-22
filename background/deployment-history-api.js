// Deployment History API
// Tracks all metadata changes made through the extension with audit trail

class DeploymentHistoryAPI {
  // Storage key for deployment history
  static STORAGE_KEY = 'deploymentHistory';
  static MAX_HISTORY_ITEMS = 1000; // Keep last 1000 deployments
  static RETENTION_DAYS = 180; // Keep 6 months of history

  /**
   * Log a deployment to history
   * @param {object} deployment - Deployment metadata
   * @returns {Promise<void>}
   */
  static async logDeployment(deployment) {
    try {
      const history = await this.getDeploymentHistory();

      // Create deployment record
      const record = {
        id: this.generateDeploymentId(),
        timestamp: new Date().toISOString(),
        orgUrl: deployment.orgUrl,
        orgId: deployment.orgId,
        orgName: deployment.orgName || null,
        userId: deployment.userId || null,
        metadataType: deployment.metadataType,
        action: deployment.action, // create, update, delete
        objectName: deployment.objectName || null,
        componentName: deployment.componentName,
        changeDetails: {
          before: deployment.before || null,
          after: deployment.after || null
        },
        status: deployment.status, // success, failure
        deploymentId: deployment.deploymentId || null, // Salesforce deployment ID
        errorMessage: deployment.errorMessage || null,
        source: deployment.source || 'extension' // extension, manual, api
      };

      // Add to history
      history.unshift(record);

      // Apply retention policy
      const cleanedHistory = this.applyRetentionPolicy(history);

      // Save to storage
      await chrome.storage.local.set({ [this.STORAGE_KEY]: cleanedHistory });

      console.log('[DeploymentHistory] Logged deployment:', record.id);
    } catch (error) {
      console.error('[DeploymentHistory] Error logging deployment:', error);
      throw error;
    }
  }

  /**
   * Get deployment history with optional filters
   * @param {object} filters - Filter options
   * @returns {Promise<Array>} Filtered deployment history
   */
  static async getDeploymentHistory(filters = {}) {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      let history = result[this.STORAGE_KEY] || [];

      // Apply filters
      if (filters.orgId) {
        history = history.filter(d => d.orgId === filters.orgId);
      }

      if (filters.metadataType) {
        history = history.filter(d => d.metadataType === filters.metadataType);
      }

      if (filters.action) {
        history = history.filter(d => d.action === filters.action);
      }

      if (filters.status) {
        history = history.filter(d => d.status === filters.status);
      }

      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        history = history.filter(d => new Date(d.timestamp) >= fromDate);
      }

      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        history = history.filter(d => new Date(d.timestamp) <= toDate);
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        history = history.filter(d =>
          d.componentName.toLowerCase().includes(searchLower) ||
          (d.objectName && d.objectName.toLowerCase().includes(searchLower)) ||
          (d.orgName && d.orgName.toLowerCase().includes(searchLower))
        );
      }

      return history;
    } catch (error) {
      console.error('[DeploymentHistory] Error getting history:', error);
      throw error;
    }
  }

  /**
   * Get detailed information for a specific deployment
   * @param {string} deploymentId - Deployment ID
   * @returns {Promise<object|null>} Deployment details
   */
  static async getDeploymentDetails(deploymentId) {
    try {
      const history = await this.getDeploymentHistory();
      return history.find(d => d.id === deploymentId) || null;
    } catch (error) {
      console.error('[DeploymentHistory] Error getting deployment details:', error);
      throw error;
    }
  }

  /**
   * Export deployment history to CSV
   * @param {Array} history - Deployment history array
   * @returns {string} CSV content
   */
  static exportToCSV(history) {
    const headers = [
      'Timestamp',
      'Org Name',
      'Org ID',
      'Metadata Type',
      'Action',
      'Object',
      'Component',
      'Status',
      'Error Message'
    ];

    const rows = history.map(d => [
      d.timestamp,
      d.orgName || '',
      d.orgId,
      d.metadataType,
      d.action,
      d.objectName || '',
      d.componentName,
      d.status,
      d.errorMessage || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Export deployment history to JSON
   * @param {Array} history - Deployment history array
   * @returns {string} JSON content
   */
  static exportToJSON(history) {
    return JSON.stringify(history, null, 2);
  }

  /**
   * Clear deployment history
   * @returns {Promise<void>}
   */
  static async clearHistory() {
    try {
      await chrome.storage.local.remove(this.STORAGE_KEY);
      console.log('[DeploymentHistory] History cleared');
    } catch (error) {
      console.error('[DeploymentHistory] Error clearing history:', error);
      throw error;
    }
  }

  /**
   * Delete specific deployment record
   * @param {string} deploymentId - Deployment ID to delete
   * @returns {Promise<void>}
   */
  static async deleteDeployment(deploymentId) {
    try {
      const history = await this.getDeploymentHistory();
      const filtered = history.filter(d => d.id !== deploymentId);
      await chrome.storage.local.set({ [this.STORAGE_KEY]: filtered });
      console.log('[DeploymentHistory] Deleted deployment:', deploymentId);
    } catch (error) {
      console.error('[DeploymentHistory] Error deleting deployment:', error);
      throw error;
    }
  }

  /**
   * Get deployment statistics
   * @param {object} filters - Filter options
   * @returns {Promise<object>} Statistics
   */
  static async getStatistics(filters = {}) {
    try {
      const history = await this.getDeploymentHistory(filters);

      const stats = {
        total: history.length,
        successful: history.filter(d => d.status === 'success').length,
        failed: history.filter(d => d.status === 'failure').length,
        byMetadataType: {},
        byAction: {},
        byOrg: {},
        recentActivity: []
      };

      // Group by metadata type
      history.forEach(d => {
        stats.byMetadataType[d.metadataType] = (stats.byMetadataType[d.metadataType] || 0) + 1;
        stats.byAction[d.action] = (stats.byAction[d.action] || 0) + 1;
        stats.byOrg[d.orgName || d.orgId] = (stats.byOrg[d.orgName || d.orgId] || 0) + 1;
      });

      // Recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      stats.recentActivity = history.filter(d => new Date(d.timestamp) >= sevenDaysAgo);

      return stats;
    } catch (error) {
      console.error('[DeploymentHistory] Error getting statistics:', error);
      throw error;
    }
  }

  /**
   * Apply retention policy to history
   * @param {Array} history - Deployment history array
   * @returns {Array} Cleaned history
   */
  static applyRetentionPolicy(history) {
    // Sort by timestamp (newest first)
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit by count
    if (history.length > this.MAX_HISTORY_ITEMS) {
      history = history.slice(0, this.MAX_HISTORY_ITEMS);
    }

    // Limit by age
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS);

    history = history.filter(d => new Date(d.timestamp) >= cutoffDate);

    return history;
  }

  /**
   * Generate unique deployment ID
   * @returns {string} Deployment ID
   */
  static generateDeploymentId() {
    return `dep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

export default DeploymentHistoryAPI;
