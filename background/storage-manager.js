class StorageManager {
  static async saveExportData(key, data) {
    await chrome.storage.local.set({ [key]: data });
  }

  static async getExportData(key) {
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  }

  static async getAllExports() {
    const result = await chrome.storage.local.get(null);
    return result;
  }

  static async deleteExport(key) {
    await chrome.storage.local.remove(key);
  }

  static async clearAll() {
    await chrome.storage.local.clear();
  }

  static async saveDeploymentHistory(deployment) {
    const history = await this.getDeploymentHistory();
    history.push({
      ...deployment,
      timestamp: Date.now()
    });
    await chrome.storage.local.set({ deploymentHistory: history });
  }

  static async getDeploymentHistory() {
    const result = await chrome.storage.local.get('deploymentHistory');
    return result.deploymentHistory || [];
  }
}

export default StorageManager;
