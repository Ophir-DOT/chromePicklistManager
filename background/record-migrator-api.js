/**
 * Record Migrator API
 * Handles backend logic for migrating records between Salesforce orgs
 */

import SessionManager from './session-manager.js';
import SalesforceAPI from './api-client.js';

const RecordMigratorAPI = {

  /**
   * Get all active Salesforce sessions from open tabs
   * @returns {Promise<Array>} Array of session objects
   */
  async getAllActiveSessions() {
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

      // Extract session from each tab
      for (const tab of salesforceTabs) {
        try {
          const session = await this.extractSessionFromTab(tab);

          if (session && !seenOrgs.has(session.orgId)) {
            seenOrgs.add(session.orgId);
            sessions.push(session);
          }
        } catch (error) {
          console.warn('[RecordMigratorAPI] Could not extract session from tab:', tab.url, error.message);
        }
      }

      console.log('[RecordMigratorAPI] Found', sessions.length, 'unique sessions');
      return sessions;

    } catch (error) {
      console.error('[RecordMigratorAPI] Error getting active sessions:', error);
      throw error;
    }
  },

  /**
   * Extract session information from a specific tab
   * @param {object} tab - Chrome tab object
   * @returns {Promise<object>} Session object with org info
   */
  async extractSessionFromTab(tab) {
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
  },

  /**
   * Get organization information from Salesforce
   * @param {string} instanceUrl - The instance URL
   * @param {string} sessionId - The session ID
   * @returns {Promise<object>} Org info object
   */
  async getOrgInfo(instanceUrl, sessionId) {
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
  },

  /**
   * Get all sObjects from the org
   * @param {Object} session - Session object with sessionId and instanceUrl
   * @returns {Promise<Array>} Array of sObject metadata
   */
  async getObjects(session) {
    try {
      const endpoint = `${session.instanceUrl}/services/data/v59.0/sobjects`;

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${session.sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get objects: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.sobjects || [];

    } catch (error) {
      console.error('[RecordMigratorAPI] Error getting objects:', error);
      throw error;
    }
  },

  /**
   * Execute SOQL query
   * @param {Object} session - Session object
   * @param {string} soql - SOQL query
   * @returns {Promise<Object>} Query results
   */
  async queryRecords(session, soql) {
    try {
      const encodedQuery = encodeURIComponent(soql);
      const endpoint = `${session.instanceUrl}/services/data/v59.0/query?q=${encodedQuery}`;

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${session.sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Query failed: ${response.status} - ${errorText}`);
      }

      return await response.json();

    } catch (error) {
      console.error('[RecordMigratorAPI] Error querying records:', error);
      throw error;
    }
  },

  /**
   * Get child relationships for an object
   * @param {Object} session - Session object
   * @param {string} objectName - API name of the object
   * @returns {Promise<Array>} Array of child relationships
   */
  async getChildRelationships(session, objectName) {
    try {
      const endpoint = `${session.instanceUrl}/services/data/v59.0/sobjects/${objectName}/describe`;

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${session.sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to describe ${objectName}: ${response.status}`);
      }

      const describe = await response.json();
      const childRelationships = describe.childRelationships || [];

      // Filter out unwanted relationships
      const filtered = childRelationships.filter(rel => {
        const childObject = rel.childSObject;
        return childObject &&
               !childObject.endsWith('History') &&
               !childObject.endsWith('Share') &&
               !childObject.endsWith('Feed') &&
               !childObject.endsWith('Tag') &&
               !childObject.endsWith('Event') &&
               rel.field; // Must have a field
      });

      return filtered.map(rel => ({
        relationshipName: rel.relationshipName,
        childSObject: rel.childSObject,
        field: rel.field,
        cascadeDelete: rel.cascadeDelete || false
      }));

    } catch (error) {
      console.error('[RecordMigratorAPI] Error getting child relationships:', error);
      throw error;
    }
  },

  /**
   * Get all fields for an object
   * @param {Object} session - Session object
   * @param {string} objectName - API name of the object
   * @returns {Promise<Array>} Array of field names
   */
  async getObjectFields(session, objectName) {
    try {
      const endpoint = `${session.instanceUrl}/services/data/v59.0/sobjects/${objectName}/describe`;

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${session.sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to describe ${objectName}: ${response.status}`);
      }

      const describe = await response.json();
      const fields = describe.fields || [];

      // Filter out non-createable fields
      return fields
        .filter(field => field.createable && !field.calculated)
        .map(field => field.name);

    } catch (error) {
      console.error('[RecordMigratorAPI] Error getting object fields:', error);
      throw error;
    }
  },

  /**
   * Build State ID mapping between source and target orgs
   * Maps State record IDs by Name field
   * @param {Object} sourceSession - Source session
   * @param {Object} targetSession - Target session
   * @param {Array} records - Records that may contain CompSuite__State__c
   * @returns {Promise<Object>} Mapping of source State IDs to target State IDs
   */
  async buildStateIdMapping(sourceSession, targetSession, records) {
    try {
      console.log('[RecordMigratorAPI] buildStateIdMapping called with', records.length, 'records');

      // Collect all unique State IDs from records
      const stateIds = new Set();
      records.forEach(record => {
        console.log('[RecordMigratorAPI] Record fields:', Object.keys(record));
        if (record.CompSuite__State__c) {
          console.log('[RecordMigratorAPI] Found State ID:', record.CompSuite__State__c);
          stateIds.add(record.CompSuite__State__c);
        }
      });

      console.log('[RecordMigratorAPI] Collected', stateIds.size, 'unique State IDs:', Array.from(stateIds));

      if (stateIds.size === 0) {
        console.log('[RecordMigratorAPI] No CompSuite__State__c fields found in records');
        return {};
      }

      console.log('[RecordMigratorAPI] Building State ID mapping for', stateIds.size, 'states...');

      // Query State records from source org to get Names
      const stateIdList = Array.from(stateIds).map(id => `'${id}'`).join(',');
      const sourceQuery = `SELECT Id, Name FROM CompSuite__State__c WHERE Id IN (${stateIdList})`;
      const sourceStates = await this.queryRecords(sourceSession, sourceQuery);

      if (!sourceStates.records || sourceStates.records.length === 0) {
        console.warn('[RecordMigratorAPI] No State records found in source org');
        return {};
      }

      // Build Name -> ID mapping for source
      const stateNames = sourceStates.records.map(s => s.Name);
      const stateNameList = stateNames.map(name => `'${name.replace(/'/g, "\\'")}'`).join(',');

      // Query State records from target org by Name
      const targetQuery = `SELECT Id, Name FROM CompSuite__State__c WHERE Name IN (${stateNameList})`;
      const targetStates = await this.queryRecords(targetSession, targetQuery);

      if (!targetStates.records || targetStates.records.length === 0) {
        console.warn('[RecordMigratorAPI] No matching State records found in target org');
        return {};
      }

      // Build Name -> target ID mapping
      const targetStateMap = {};
      targetStates.records.forEach(state => {
        targetStateMap[state.Name] = state.Id;
      });

      // Build source ID -> target ID mapping
      const stateIdMapping = {};
      sourceStates.records.forEach(sourceState => {
        const targetId = targetStateMap[sourceState.Name];
        if (targetId) {
          stateIdMapping[sourceState.Id] = targetId;
          console.log(`[RecordMigratorAPI] Mapped State: ${sourceState.Name} (${sourceState.Id} -> ${targetId})`);
        } else {
          console.warn(`[RecordMigratorAPI] No matching State found in target org for: ${sourceState.Name}`);
        }
      });

      console.log('[RecordMigratorAPI] State ID mapping complete:', Object.keys(stateIdMapping).length, 'states mapped');
      return stateIdMapping;

    } catch (error) {
      console.error('[RecordMigratorAPI] Error building State ID mapping:', error);
      // Return empty mapping on error - migration can continue without State remapping
      return {};
    }
  },

  /**
   * Export parent records from source org
   * @param {Object} sourceSession - Source session
   * @param {string} objectName - Object API name
   * @param {Array} recordIds - Array of record IDs to export
   * @returns {Promise<Array>} Array of records
   */
  async exportParentRecords(sourceSession, objectName, recordIds) {
    try {
      console.log('[RecordMigratorAPI] Exporting', recordIds.length, 'parent records...');

      // Get all createable fields for the object
      const fields = await this.getObjectFields(sourceSession, objectName);

      // Build SOQL query
      const fieldList = fields.join(', ');
      const idList = recordIds.map(id => `'${id}'`).join(',');
      const soql = `SELECT ${fieldList} FROM ${objectName} WHERE Id IN (${idList})`;

      const result = await this.queryRecords(sourceSession, soql);
      console.log('[RecordMigratorAPI] Exported', result.records.length, 'parent records');

      return result.records || [];

    } catch (error) {
      console.error('[RecordMigratorAPI] Error exporting parent records:', error);
      throw error;
    }
  },

  /**
   * Export child records from source org
   * @param {Object} sourceSession - Source session
   * @param {Object} relationship - Relationship metadata
   * @param {Array} parentIds - Array of parent record IDs
   * @returns {Promise<Array>} Array of child records
   */
  async exportChildRecords(sourceSession, relationship, parentIds) {
    try {
      console.log('[RecordMigratorAPI] Exporting child records for', relationship.childSObject);

      // Get all createable fields for the child object
      const fields = await this.getObjectFields(sourceSession, relationship.childSObject);

      // Build SOQL query
      const fieldList = fields.join(', ');
      const idList = parentIds.map(id => `'${id}'`).join(',');
      const soql = `SELECT ${fieldList} FROM ${relationship.childSObject} WHERE ${relationship.field} IN (${idList})`;

      const result = await this.queryRecords(sourceSession, soql);
      console.log('[RecordMigratorAPI] Exported', result.records.length, 'child records');

      return result.records || [];

    } catch (error) {
      console.error('[RecordMigratorAPI] Error exporting child records:', error);
      throw error;
    }
  },

  /**
   * Upsert parent records to target org
   * @param {Object} targetSession - Target session
   * @param {string} objectName - Object API name
   * @param {Array} records - Records to upsert
   * @param {string} externalIdField - Optional external ID field to store source IDs
   * @param {Object} stateIdMapping - Optional State ID mapping (source -> target)
   * @returns {Promise<Object>} Upsert results with ID mapping
   */
  async upsertParentRecords(targetSession, objectName, records, externalIdField = null, stateIdMapping = {}) {
    try {
      console.log('[RecordMigratorAPI] Upserting', records.length, 'parent records...');
      if (externalIdField) {
        console.log('[RecordMigratorAPI] Using external ID field:', externalIdField);
      }
      if (Object.keys(stateIdMapping).length > 0) {
        console.log('[RecordMigratorAPI] Using State ID mapping for', Object.keys(stateIdMapping).length, 'states');
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [],
        idMapping: {} // sourceId -> targetId
      };

      // Process in batches of 200 (API limit)
      const batchSize = 200;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        // Prepare records for insert (remove Id and attributes)
        const recordsToInsert = batch.map(record => {
          const sourceId = record.Id;
          const cleanRecord = { ...record };
          delete cleanRecord.Id;
          delete cleanRecord.attributes;

          // Remove system fields
          delete cleanRecord.CreatedDate;
          delete cleanRecord.CreatedById;
          delete cleanRecord.LastModifiedDate;
          delete cleanRecord.LastModifiedById;
          delete cleanRecord.SystemModstamp;

          // Store source ID in external ID field if specified
          if (externalIdField) {
            cleanRecord[externalIdField] = sourceId;
          }

          // Remap CompSuite__State__c field if present and mapping exists
          if (cleanRecord.CompSuite__State__c && stateIdMapping[cleanRecord.CompSuite__State__c]) {
            const originalStateId = cleanRecord.CompSuite__State__c;
            cleanRecord.CompSuite__State__c = stateIdMapping[originalStateId];
            console.log(`[RecordMigratorAPI] Remapped State ID: ${originalStateId} -> ${cleanRecord.CompSuite__State__c}`);
          }

          return { sourceId, record: cleanRecord };
        });

        // Use SObject Collection API for batch insert
        const endpoint = `${targetSession.instanceUrl}/services/data/v59.0/composite/sobjects`;

        const requestBody = {
          allOrNone: false,
          records: recordsToInsert.map(r => ({
            attributes: { type: objectName },
            ...r.record
          }))
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${targetSession.sessionId}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          throw new Error(`Upsert failed: ${response.status} ${response.statusText}`);
        }

        const batchResults = await response.json();

        // Process results and build ID mapping
        batchResults.forEach((result, index) => {
          if (result.success) {
            results.success++;
            results.idMapping[recordsToInsert[index].sourceId] = result.id;
          } else {
            results.failed++;
            results.errors.push(`Record ${index + 1}: ${result.errors.map(e => e.message).join(', ')}`);
          }
        });
      }

      console.log('[RecordMigratorAPI] Parent upsert complete:', results.success, 'success,', results.failed, 'failed');
      return results;

    } catch (error) {
      console.error('[RecordMigratorAPI] Error upserting parent records:', error);
      throw error;
    }
  },

  /**
   * Upsert child records to target org
   * @param {Object} targetSession - Target session
   * @param {Object} relationship - Relationship metadata
   * @param {Array} records - Child records to upsert
   * @param {Object} idMapping - Parent ID mapping (sourceId -> targetId)
   * @param {Object} stateIdMapping - Optional State ID mapping (source -> target)
   * @returns {Promise<Object>} Upsert results
   */
  async upsertChildRecords(targetSession, relationship, records, idMapping, stateIdMapping = {}) {
    try {
      console.log('[RecordMigratorAPI] Upserting', records.length, 'child records for', relationship.childSObject);

      const results = {
        success: 0,
        failed: 0,
        errors: []
      };

      // Process in batches
      const batchSize = 200;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        // Remap parent IDs and prepare records
        const recordsToInsert = batch.map(record => {
          const cleanRecord = { ...record };
          delete cleanRecord.Id;
          delete cleanRecord.attributes;

          // Remove system fields
          delete cleanRecord.CreatedDate;
          delete cleanRecord.CreatedById;
          delete cleanRecord.LastModifiedDate;
          delete cleanRecord.LastModifiedById;
          delete cleanRecord.SystemModstamp;

          // Remap parent lookup field
          const oldParentId = record[relationship.field];
          const newParentId = idMapping[oldParentId];

          if (newParentId) {
            cleanRecord[relationship.field] = newParentId;
          } else {
            console.warn('[RecordMigratorAPI] No mapping found for parent ID:', oldParentId);
          }

          // Remap CompSuite__State__c field if present and mapping exists
          if (cleanRecord.CompSuite__State__c && stateIdMapping[cleanRecord.CompSuite__State__c]) {
            const originalStateId = cleanRecord.CompSuite__State__c;
            cleanRecord.CompSuite__State__c = stateIdMapping[originalStateId];
            console.log(`[RecordMigratorAPI] Remapped State ID in child record: ${originalStateId} -> ${cleanRecord.CompSuite__State__c}`);
          }

          return cleanRecord;
        });

        // Use SObject Collection API for batch insert
        const endpoint = `${targetSession.instanceUrl}/services/data/v59.0/composite/sobjects`;

        const requestBody = {
          allOrNone: false,
          records: recordsToInsert.map(record => ({
            attributes: { type: relationship.childSObject },
            ...record
          }))
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${targetSession.sessionId}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          throw new Error(`Upsert failed: ${response.status} ${response.statusText}`);
        }

        const batchResults = await response.json();

        // Process results
        batchResults.forEach((result, index) => {
          if (result.success) {
            results.success++;
          } else {
            results.failed++;
            results.errors.push(`${relationship.childSObject} record ${index + 1}: ${result.errors.map(e => e.message).join(', ')}`);
          }
        });
      }

      console.log('[RecordMigratorAPI] Child upsert complete:', results.success, 'success,', results.failed, 'failed');
      return results;

    } catch (error) {
      console.error('[RecordMigratorAPI] Error upserting child records:', error);
      throw error;
    }
  },

  /**
   * Main migration function - orchestrates the entire migration process
   * @param {Object} sourceSession - Source session
   * @param {Object} targetSession - Target session
   * @param {Object} config - Migration configuration
   * @returns {Promise<Object>} Migration results
   */
  async migrateRecords(sourceSession, targetSession, config) {
    try {
      console.log('[RecordMigratorAPI] Starting migration...');
      console.log('[RecordMigratorAPI] Config:', config);

      const results = {
        parentSuccess: 0,
        parentFailed: 0,
        childSuccess: 0,
        childFailed: 0,
        errors: [],
        idMapping: {}
      };

      // Step 1: Export parent records
      console.log('[RecordMigratorAPI] Step 1: Exporting parent records...');
      const parentRecords = await this.exportParentRecords(
        sourceSession,
        config.objectName,
        config.recordIds
      );

      if (parentRecords.length === 0) {
        throw new Error('No parent records found to migrate');
      }

      // Step 1.5: Build State ID mapping if CompSuite__State__c field exists
      console.log('[RecordMigratorAPI] Step 1.5: Building State ID mapping...');
      const stateIdMapping = await this.buildStateIdMapping(
        sourceSession,
        targetSession,
        parentRecords
      );

      // Step 2: Upsert parent records to target org
      console.log('[RecordMigratorAPI] Step 2: Upserting parent records...');
      const parentResults = await this.upsertParentRecords(
        targetSession,
        config.objectName,
        parentRecords,
        config.externalIdField, // Pass external ID field for storing source IDs
        stateIdMapping // Pass State ID mapping for remapping
      );

      results.parentSuccess = parentResults.success;
      results.parentFailed = parentResults.failed;
      results.errors.push(...parentResults.errors);
      results.idMapping = parentResults.idMapping;

      // Step 3: Process child relationships (if any)
      if (config.relationships && config.relationships.length > 0) {
        console.log('[RecordMigratorAPI] Step 3: Processing child relationships...');

        for (const relationship of config.relationships) {
          try {
            // Export child records
            const childRecords = await this.exportChildRecords(
              sourceSession,
              relationship,
              config.recordIds
            );

            if (childRecords.length === 0) {
              console.log('[RecordMigratorAPI] No child records found for', relationship.childSObject);
              continue;
            }

            // Upsert child records with remapped parent IDs and State IDs
            const childResults = await this.upsertChildRecords(
              targetSession,
              relationship,
              childRecords,
              results.idMapping,
              stateIdMapping // Pass State ID mapping for child records too
            );

            results.childSuccess += childResults.success;
            results.childFailed += childResults.failed;
            results.errors.push(...childResults.errors);

          } catch (error) {
            console.error('[RecordMigratorAPI] Error processing relationship:', relationship.childSObject, error);
            results.errors.push(`Failed to migrate ${relationship.childSObject}: ${error.message}`);
          }
        }
      }

      console.log('[RecordMigratorAPI] Migration complete!');
      console.log('[RecordMigratorAPI] Results:', results);

      return results;

    } catch (error) {
      console.error('[RecordMigratorAPI] Migration failed:', error);
      throw error;
    }
  }
};

export default RecordMigratorAPI;
