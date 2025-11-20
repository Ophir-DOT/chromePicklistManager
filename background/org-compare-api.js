// Org Compare API Client
// Provides methods to detect active Salesforce sessions and compare metadata across orgs
// Uses Chrome APIs for tab/session detection and XMLHttpRequest for Salesforce API calls

import SessionManager from './session-manager.js';

class OrgCompareAPI {
  /**
   * Get all active Salesforce sessions from open tabs
   * Scans Chrome tabs for Salesforce domains and extracts session info
   * @returns {Promise<Array>} Array of session objects with org info
   */
  static async getAllActiveSessions() {
    console.log('[OrgCompareAPI] Getting all active Salesforce sessions');

    const sessions = [];
    const seenOrgs = new Set();

    try {
      // Query all tabs for Salesforce domains
      const tabs = await chrome.tabs.query({});

      const salesforceTabs = tabs.filter(tab => {
        if (!tab.url) return false;
        return tab.url.includes('salesforce.com') ||
               tab.url.includes('force.com') ||
               tab.url.includes('salesforce-setup.com');
      });

      console.log('[OrgCompareAPI] Found', salesforceTabs.length, 'Salesforce tabs');

      // Extract session from each tab
      for (const tab of salesforceTabs) {
        try {
          const session = await this.extractSessionFromTab(tab);

          if (session && !seenOrgs.has(session.orgId)) {
            seenOrgs.add(session.orgId);
            sessions.push(session);
          }
        } catch (error) {
          console.warn('[OrgCompareAPI] Could not extract session from tab:', tab.url, error.message);
        }
      }

      console.log('[OrgCompareAPI] Found', sessions.length, 'unique org sessions');
      return sessions;
    } catch (error) {
      console.error('[OrgCompareAPI] Error getting sessions:', error);
      throw error;
    }
  }

  /**
   * Extract session information from a specific tab
   * @param {object} tab - Chrome tab object
   * @returns {Promise<object>} Session object with org info
   */
  static async extractSessionFromTab(tab) {
    if (!tab || !tab.url) {
      throw new Error('No tab URL provided');
    }

    const url = new URL(tab.url);
    const originalHostname = url.hostname;

    // Transform hostname for API calls
    const hostname = SessionManager.getMyDomain(originalHostname);
    const instanceUrl = `${url.protocol}//${hostname}`;

    // Get session cookie
    const sidCookie = await chrome.cookies.get({
      url: instanceUrl,
      name: 'sid'
    });

    if (!sidCookie) {
      // Try broader search
      const cookies = await chrome.cookies.getAll({
        name: 'sid',
        secure: true
      });

      const matchingCookie = cookies.find(c => {
        const cookieDomain = c.domain.replace(/^\./, '');
        return hostname.includes(cookieDomain) ||
               cookieDomain.includes(hostname.split('.')[0]);
      });

      if (!matchingCookie) {
        throw new Error('No session cookie found');
      }

      // Extract org ID from session ID
      const sessionId = matchingCookie.value;
      const orgId = sessionId.substring(0, 15);

      // Get org info
      const orgInfo = await this.getOrgInfo(instanceUrl, sessionId);

      return {
        tabId: tab.id,
        sessionId: sessionId,
        instanceUrl: instanceUrl,
        hostname: hostname,
        orgId: orgId,
        orgName: orgInfo.orgName || hostname,
        orgType: orgInfo.orgType || 'Unknown',
        isSandbox: orgInfo.isSandbox || false,
        timestamp: Date.now()
      };
    }

    // Extract org ID from session ID
    const sessionId = sidCookie.value;
    const orgId = sessionId.substring(0, 15);

    // Get org info
    const orgInfo = await this.getOrgInfo(instanceUrl, sessionId);

    return {
      tabId: tab.id,
      sessionId: sessionId,
      instanceUrl: instanceUrl,
      hostname: hostname,
      orgId: orgId,
      orgName: orgInfo.orgName || hostname,
      orgType: orgInfo.orgType || 'Unknown',
      isSandbox: orgInfo.isSandbox || false,
      timestamp: Date.now()
    };
  }

  /**
   * Get organization information from Salesforce
   * @param {string} instanceUrl - The instance URL
   * @param {string} sessionId - The session ID
   * @returns {Promise<object>} Org info object
   */
  static async getOrgInfo(instanceUrl, sessionId) {
    return new Promise((resolve, reject) => {
      const query = encodeURIComponent("SELECT Id, Name, OrganizationType, IsSandbox FROM Organization LIMIT 1");
      const endpoint = `${instanceUrl}/services/data/v59.0/query/?q=${query}`;

      const xhr = new XMLHttpRequest();
      xhr.open('GET', endpoint, true);
      xhr.setRequestHeader('Authorization', 'Bearer ' + sessionId);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.responseType = 'json';
      xhr.timeout = 10000;

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.records?.[0]) {
            const org = xhr.response.records[0];
            resolve({
              orgName: org.Name,
              orgType: org.OrganizationType,
              isSandbox: org.IsSandbox
            });
          } else {
            // Return defaults on error
            resolve({
              orgName: null,
              orgType: null,
              isSandbox: null
            });
          }
        }
      };

      xhr.onerror = () => resolve({ orgName: null, orgType: null, isSandbox: null });
      xhr.ontimeout = () => resolve({ orgName: null, orgType: null, isSandbox: null });

      xhr.send();
    });
  }

  /**
   * Make API call to a specific org
   * @param {object} session - Session object with instanceUrl and sessionId
   * @param {string} endpoint - API endpoint
   * @returns {Promise<any>} API response
   */
  static async callOrgAPI(session, endpoint) {
    return new Promise((resolve, reject) => {
      const fullUrl = new URL(endpoint, session.instanceUrl);

      const xhr = new XMLHttpRequest();
      xhr.open('GET', fullUrl.toString(), true);
      xhr.setRequestHeader('Authorization', 'Bearer ' + session.sessionId);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.responseType = 'json';
      xhr.timeout = 30000;

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else if (xhr.status === 401) {
            reject(new Error('Session expired for this org. Please refresh the Salesforce tab.'));
          } else {
            const errorMessage = xhr.response
              ? JSON.stringify(xhr.response)
              : xhr.statusText;
            reject(new Error(`API Error ${xhr.status}: ${errorMessage}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.ontimeout = () => reject(new Error('Request timeout'));

      xhr.send();
    });
  }

  /**
   * Get all objects (custom and standard) from an org
   * @param {object} session - Session object
   * @returns {Promise<Array>} Array of object metadata
   */
  static async getObjects(session) {
    console.log('[OrgCompareAPI] Getting objects from', session.orgName);

    const response = await this.callOrgAPI(session, '/services/data/v59.0/sobjects');

    if (!response || !response.sobjects) {
      throw new Error('Invalid response from Salesforce API');
    }

    return response.sobjects.map(obj => ({
      name: obj.name,
      label: obj.label,
      custom: obj.custom,
      queryable: obj.queryable,
      createable: obj.createable
    }));
  }

  /**
   * Get object field metadata (fields, relationships)
   * @param {object} session - Session object
   * @param {string} objectName - API name of the object
   * @returns {Promise<object>} Object metadata with fields
   */
  static async getObjectMetadata(session, objectName) {
    console.log('[OrgCompareAPI] Getting metadata for', objectName, 'from', session.orgName);

    const response = await this.callOrgAPI(session, `/services/data/v59.0/sobjects/${objectName}/describe`);

    return {
      name: response.name,
      label: response.label,
      custom: response.custom,
      fields: response.fields.map(field => ({
        name: field.name,
        label: field.label,
        type: field.type,
        length: field.length,
        precision: field.precision,
        scale: field.scale,
        required: !field.nillable && !field.defaultedOnCreate,
        unique: field.unique,
        externalId: field.externalId,
        custom: field.custom,
        calculated: field.calculated,
        picklistValues: field.picklistValues || [],
        referenceTo: field.referenceTo || [],
        relationshipName: field.relationshipName
      }))
    };
  }

  /**
   * Get validation rules for an object
   * @param {object} session - Session object
   * @param {string} objectName - API name of the object (optional, returns all if not specified)
   * @returns {Promise<Array>} Array of validation rules
   */
  static async getValidationRules(session, objectName = null) {
    console.log('[OrgCompareAPI] Getting validation rules from', session.orgName);

    let query = `
      SELECT Id, ValidationName, Active, Description,
             ErrorDisplayField, ErrorMessage, EntityDefinitionId,
             CreatedDate, LastModifiedDate
      FROM ValidationRule
    `;

    if (objectName) {
      query += ` WHERE EntityDefinitionId = '${objectName}'`;
    }

    query += ' ORDER BY ValidationName LIMIT 200';

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;
    const response = await this.callOrgAPI(session, endpoint);

    return (response.records || []).map(rule => ({
      id: rule.Id,
      name: rule.ValidationName,
      active: rule.Active,
      description: rule.Description || '',
      errorField: rule.ErrorDisplayField || '',
      errorMessage: rule.ErrorMessage || '',
      object: rule.EntityDefinitionId,
      lastModified: rule.LastModifiedDate
    }));
  }

  /**
   * Get flows from an org
   * @param {object} session - Session object
   * @returns {Promise<Array>} Array of flows
   */
  static async getFlows(session) {
    console.log('[OrgCompareAPI] Getting flows from', session.orgName);

    const query = `
      SELECT Id, ApiName, Label, ProcessType, Status,
             Description, LastModifiedDate, VersionNumber
      FROM FlowDefinitionView
      ORDER BY ApiName
      LIMIT 200
    `;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;
    const response = await this.callOrgAPI(session, endpoint);

    return (response.records || []).map(flow => ({
      id: flow.Id,
      name: flow.ApiName,
      label: flow.Label,
      type: flow.ProcessType,
      status: flow.Status,
      description: flow.Description || '',
      version: flow.VersionNumber,
      lastModified: flow.LastModifiedDate
    }));
  }

  /**
   * Get picklist values for a field
   * @param {object} session - Session object
   * @param {string} objectName - API name of the object
   * @param {string} fieldName - API name of the field
   * @returns {Promise<Array>} Array of picklist values
   */
  static async getPicklistValues(session, objectName, fieldName) {
    console.log('[OrgCompareAPI] Getting picklist values for', objectName + '.' + fieldName, 'from', session.orgName);

    const metadata = await this.getObjectMetadata(session, objectName);
    const field = metadata.fields.find(f => f.name === fieldName);

    if (!field) {
      throw new Error(`Field ${fieldName} not found on ${objectName}`);
    }

    return field.picklistValues.map(value => ({
      value: value.value,
      label: value.label,
      active: value.active,
      default: value.defaultValue
    }));
  }

  /**
   * Get field dependencies for an object (controlling/dependent picklists)
   * @param {object} session - Session object
   * @param {string} objectName - API name of the object
   * @returns {Promise<Array>} Array of dependency relationships
   */
  static async getFieldDependencies(session, objectName) {
    console.log('[OrgCompareAPI] Getting field dependencies for', objectName, 'from', session.orgName);

    const metadata = await this.getObjectMetadata(session, objectName);
    const dependencies = [];

    for (const field of metadata.fields) {
      if (field.picklistValues && field.picklistValues.length > 0) {
        // Check if this field is controlled by another
        const hasController = field.picklistValues.some(v => v.validFor);

        if (hasController) {
          dependencies.push({
            dependentField: field.name,
            dependentLabel: field.label,
            controllingField: field.controllerName || 'Unknown',
            valuesCount: field.picklistValues.filter(v => v.active).length
          });
        }
      }
    }

    return dependencies;
  }

  /**
   * Compare metadata between two orgs
   * @param {object} sourceSession - Source org session
   * @param {object} targetSession - Target org session
   * @param {Array} metadataTypes - Array of metadata types to compare
   * @param {object} options - Comparison options
   * @returns {Promise<object>} Comparison results
   */
  static async compareOrgs(sourceSession, targetSession, metadataTypes, options = {}) {
    console.log('[OrgCompareAPI] Comparing orgs:', sourceSession.orgName, 'vs', targetSession.orgName);
    console.log('[OrgCompareAPI] Metadata types:', metadataTypes);

    const results = {
      source: {
        orgId: sourceSession.orgId,
        orgName: sourceSession.orgName,
        instanceUrl: sourceSession.instanceUrl
      },
      target: {
        orgId: targetSession.orgId,
        orgName: targetSession.orgName,
        instanceUrl: targetSession.instanceUrl
      },
      comparisonDate: new Date().toISOString(),
      summary: {
        totalItems: 0,
        matches: 0,
        differences: 0,
        sourceOnly: 0,
        targetOnly: 0
      },
      comparisons: {}
    };

    // Compare each selected metadata type
    for (const metadataType of metadataTypes) {
      try {
        const comparison = await this.compareMetadataType(
          sourceSession,
          targetSession,
          metadataType,
          options
        );

        results.comparisons[metadataType] = comparison;

        // Update summary
        results.summary.totalItems += comparison.totalItems;
        results.summary.matches += comparison.matches;
        results.summary.differences += comparison.differences;
        results.summary.sourceOnly += comparison.sourceOnly;
        results.summary.targetOnly += comparison.targetOnly;

      } catch (error) {
        console.error('[OrgCompareAPI] Error comparing', metadataType, ':', error);
        results.comparisons[metadataType] = {
          error: error.message,
          totalItems: 0,
          matches: 0,
          differences: 0,
          sourceOnly: 0,
          targetOnly: 0,
          items: []
        };
      }
    }

    console.log('[OrgCompareAPI] Comparison complete:', results.summary);
    return results;
  }

  /**
   * Compare a specific metadata type between two orgs
   * @param {object} sourceSession - Source org session
   * @param {object} targetSession - Target org session
   * @param {string} metadataType - Type of metadata to compare
   * @param {object} options - Comparison options
   * @returns {Promise<object>} Comparison result for this type
   */
  static async compareMetadataType(sourceSession, targetSession, metadataType, options) {
    console.log('[OrgCompareAPI] Comparing metadata type:', metadataType);

    let sourceData, targetData;

    switch (metadataType) {
      case 'objects':
        sourceData = await this.getObjects(sourceSession);
        targetData = await this.getObjects(targetSession);
        return this.compareArrayByKey(sourceData, targetData, 'name', ['label', 'custom', 'queryable']);

      case 'fields':
        if (!options.objectName) {
          throw new Error('Object name required for field comparison');
        }
        const sourceMeta = await this.getObjectMetadata(sourceSession, options.objectName);
        const targetMeta = await this.getObjectMetadata(targetSession, options.objectName);
        return this.compareArrayByKey(
          sourceMeta.fields,
          targetMeta.fields,
          'name',
          ['label', 'type', 'length', 'required', 'unique', 'custom']
        );

      case 'validationRules':
        sourceData = await this.getValidationRules(sourceSession, options.objectName);
        targetData = await this.getValidationRules(targetSession, options.objectName);
        return this.compareArrayByKey(
          sourceData,
          targetData,
          'name',
          ['active', 'errorMessage', 'description']
        );

      case 'flows':
        sourceData = await this.getFlows(sourceSession);
        targetData = await this.getFlows(targetSession);
        return this.compareArrayByKey(
          sourceData,
          targetData,
          'name',
          ['label', 'type', 'status', 'version']
        );

      case 'picklists':
        if (!options.objectName || !options.fieldName) {
          throw new Error('Object and field name required for picklist comparison');
        }
        sourceData = await this.getPicklistValues(sourceSession, options.objectName, options.fieldName);
        targetData = await this.getPicklistValues(targetSession, options.objectName, options.fieldName);
        return this.compareArrayByKey(
          sourceData,
          targetData,
          'value',
          ['label', 'active', 'default']
        );

      case 'dependencies':
        if (!options.objectName) {
          throw new Error('Object name required for dependency comparison');
        }
        sourceData = await this.getFieldDependencies(sourceSession, options.objectName);
        targetData = await this.getFieldDependencies(targetSession, options.objectName);
        return this.compareArrayByKey(
          sourceData,
          targetData,
          'dependentField',
          ['controllingField', 'valuesCount']
        );

      default:
        throw new Error(`Unknown metadata type: ${metadataType}`);
    }
  }

  /**
   * Compare two arrays of objects by a key field
   * @param {Array} sourceArray - Source array
   * @param {Array} targetArray - Target array
   * @param {string} keyField - Field to use as unique key
   * @param {Array} compareFields - Fields to compare for differences
   * @returns {object} Comparison result
   */
  static compareArrayByKey(sourceArray, targetArray, keyField, compareFields) {
    const result = {
      totalItems: 0,
      matches: 0,
      differences: 0,
      sourceOnly: 0,
      targetOnly: 0,
      items: []
    };

    // Build maps for quick lookup
    const sourceMap = new Map();
    const targetMap = new Map();

    sourceArray.forEach(item => sourceMap.set(item[keyField], item));
    targetArray.forEach(item => targetMap.set(item[keyField], item));

    // Get all unique keys
    const allKeys = new Set([...sourceMap.keys(), ...targetMap.keys()]);
    result.totalItems = allKeys.size;

    // Compare each item
    for (const key of allKeys) {
      const sourceItem = sourceMap.get(key);
      const targetItem = targetMap.get(key);

      const comparisonItem = {
        key: key,
        status: '',
        sourceValues: {},
        targetValues: {},
        differences: []
      };

      if (sourceItem && targetItem) {
        // Item exists in both - compare fields
        let hasDifference = false;

        for (const field of compareFields) {
          const sourceValue = sourceItem[field];
          const targetValue = targetItem[field];

          comparisonItem.sourceValues[field] = sourceValue;
          comparisonItem.targetValues[field] = targetValue;

          // Handle array comparison (like picklistValues)
          if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
            if (JSON.stringify(sourceValue) !== JSON.stringify(targetValue)) {
              hasDifference = true;
              comparisonItem.differences.push(field);
            }
          } else if (sourceValue !== targetValue) {
            hasDifference = true;
            comparisonItem.differences.push(field);
          }
        }

        if (hasDifference) {
          comparisonItem.status = 'different';
          result.differences++;
        } else {
          comparisonItem.status = 'match';
          result.matches++;
        }

      } else if (sourceItem) {
        // Item only in source
        comparisonItem.status = 'sourceOnly';
        result.sourceOnly++;

        for (const field of compareFields) {
          comparisonItem.sourceValues[field] = sourceItem[field];
          comparisonItem.targetValues[field] = null;
        }

      } else {
        // Item only in target
        comparisonItem.status = 'targetOnly';
        result.targetOnly++;

        for (const field of compareFields) {
          comparisonItem.sourceValues[field] = null;
          comparisonItem.targetValues[field] = targetItem[field];
        }
      }

      result.items.push(comparisonItem);
    }

    // Sort items: differences first, then sourceOnly, then targetOnly, then matches
    const statusOrder = { different: 0, sourceOnly: 1, targetOnly: 2, match: 3 };
    result.items.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return a.key.localeCompare(b.key);
    });

    return result;
  }

  /**
   * Export comparison results to JSON
   * @param {object} results - Comparison results
   * @returns {string} JSON string
   */
  static exportToJSON(results) {
    return JSON.stringify(results, null, 2);
  }

  /**
   * Export comparison results to CSV
   * @param {object} results - Comparison results
   * @returns {string} CSV string
   */
  static exportToCSV(results) {
    const rows = [];

    // Header
    rows.push([
      'Metadata Type',
      'Item Name',
      'Status',
      'Source Value',
      'Target Value',
      'Different Fields'
    ]);

    // Data rows
    for (const [metadataType, comparison] of Object.entries(results.comparisons)) {
      if (comparison.error) {
        rows.push([metadataType, 'ERROR', 'error', comparison.error, '', '']);
        continue;
      }

      for (const item of comparison.items) {
        const sourceValues = Object.entries(item.sourceValues)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        const targetValues = Object.entries(item.targetValues)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');

        rows.push([
          metadataType,
          item.key,
          item.status,
          this.escapeCSV(sourceValues),
          this.escapeCSV(targetValues),
          item.differences.join(', ')
        ]);
      }
    }

    // Convert to CSV string
    const csv = rows.map(row =>
      row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return '"' + cellStr.replace(/"/g, '""') + '"';
        }
        return cellStr;
      }).join(',')
    ).join('\n');

    return csv;
  }

  /**
   * Escape a value for CSV format
   * @param {string} value - The value to escape
   * @returns {string} Escaped value
   */
  static escapeCSV(value) {
    if (!value) return '';
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  /**
   * Get summary statistics for a comparison
   * @param {object} results - Comparison results
   * @returns {object} Summary statistics
   */
  static getSummaryStats(results) {
    return {
      totalItems: results.summary.totalItems,
      matches: results.summary.matches,
      matchPercent: results.summary.totalItems > 0
        ? Math.round((results.summary.matches / results.summary.totalItems) * 100)
        : 0,
      differences: results.summary.differences,
      sourceOnly: results.summary.sourceOnly,
      targetOnly: results.summary.targetOnly,
      metadataTypes: Object.keys(results.comparisons).length
    };
  }
}

export default OrgCompareAPI;
