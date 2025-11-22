// Health Check API - Performs 8 validations on Salesforce org health
import SessionManager from './session-manager.js';

// Hard-coded expected values for health checks
const EXPECTED_VALUES = {
  environmentSettings: {
    Closed_System__c: true,
    Lock_Life_Cycle__c: true,
    Help_URL__c: 'https://example.salesforce.com/help' // Replace with actual expected URL
  },
  securitySettings: {
    LockerServiceNext: true
  },
  storageThresholds: {
    warningPercent: 70,
    criticalPercent: 90
  },
  esignatureSettings: {
    Login_URL__c: 'https://login.salesforce.com' // Replace with actual expected URL
  },
  emailDeliverability: {
    // Expected DKIM settings
  }
};

class HealthCheckAPI {
  /**
   * Execute API call with session using fetch API (service worker compatible)
   */
  static async executeQuery(endpoint, method = 'GET') {
    const session = await SessionManager.getCurrentSession();

    if (!session || !session.sessionId) {
      throw new Error('No active Salesforce session. Please refresh the page.');
    }

    const fullUrl = new URL(endpoint, session.instanceUrl);

    try {
      const response = await fetch(fullUrl.toString(), {
        method: method,
        headers: {
          'Authorization': 'Bearer ' + session.sessionId,
          'Accept': 'application/json; charset=UTF-8',
          'Content-Type': 'application/json; charset=UTF-8'
        },
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session expired. Please refresh the Salesforce page.');
        } else if (response.status === 403) {
          throw new Error('Access denied. Check your permissions.');
        } else {
          const errorText = await response.text();
          throw new Error(`API Error ${response.status}: ${errorText}`);
        }
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Execute SOQL query
   */
  static async soqlQuery(query) {
    const encodedQuery = encodeURIComponent(query);
    return await this.executeQuery(`/services/data/v59.0/query?q=${encodedQuery}`);
  }

  /**
   * Execute Tooling API query
   */
  static async toolingQuery(query) {
    const encodedQuery = encodeURIComponent(query);
    return await this.executeQuery(`/services/data/v59.0/tooling/query?q=${encodedQuery}`);
  }

  /**
   * Get org limits
   */
  static async getOrgLimits() {
    return await this.executeQuery('/services/data/v63.0/limits');
  }

  /**
   * Validation 1: System Information
   * Checks org-level configuration flags and email deliverability
   */
  static async validateEnvironmentSettings() {
    try {
      // Query Organization object for standard settings
      const query = `SELECT Name, OrganizationType, IsSandbox, InstanceName, NamespacePrefix FROM Organization LIMIT 1`;
      const result = await this.soqlQuery(query);

      if (!result.records || result.records.length === 0) {
        return {
          name: 'System Information',
          status: 'error',
          message: 'No organization record found',
          fields: []
        };
      }

      const record = result.records[0];
      const fields = [];

      // Organization Name
      fields.push({
        label: 'Organization Name',
        value: record.Name,
        expected: null,
        match: true
      });

      // Organization Type
      fields.push({
        label: 'Organization Type',
        value: record.OrganizationType,
        expected: null,
        match: true
      });

      // Is Sandbox
      fields.push({
        label: 'Is Sandbox',
        value: record.IsSandbox,
        expected: null,
        match: true
      });

      // Instance Name
      fields.push({
        label: 'Instance Name',
        value: record.InstanceName || 'N/A',
        expected: null,
        match: true
      });

      return {
        name: 'System Information',
        status: 'success',
        fields: fields
      };
    } catch (error) {
      return {
        name: 'System Information',
        status: 'error',
        message: error.message,
        fields: []
      };
    }
  }

  /**
   * Validation 2: Security Settings
   * Checks session security settings including Locker Service
   */
  static async validateSecuritySettings() {
    try {
      const query = "SELECT Metadata FROM SecuritySettings";
      const result = await this.toolingQuery(query);

      if (!result.records || result.records.length === 0) {
        return {
          name: 'Security Settings',
          status: 'success',
          fields: [{
            label: 'Session Settings',
            value: 'No data found',
            expected: null,
            match: false
          }]
        };
      }

      // Extract Metadata from first record
      const record = result.records[0];
      let metadata = record.Metadata;
      let lockerServiceNext = null;

      // Handle Metadata.sessionSettings.lockerServiceNext
      if (metadata && typeof metadata === 'object') {
        const sessionSettings = metadata.sessionSettings;
        if (sessionSettings && typeof sessionSettings === 'object') {
          lockerServiceNext = sessionSettings.lockerServiceNext;
        }
      } else if (typeof metadata === 'string') {
        // Fallback if it's a string that needs parsing
        try {
          const metadataParsed = JSON.parse(metadata);
          const sessionSettings = metadataParsed.sessionSettings;
          if (sessionSettings && typeof sessionSettings === 'object') {
            lockerServiceNext = sessionSettings.lockerServiceNext;
          }
        } catch (e) {
          lockerServiceNext = null;
        }
      }

      return {
        name: 'Security Settings',
        status: 'success',
        fields: [{
          label: 'Use Lightning Web Security...',
          value: lockerServiceNext !== null ? lockerServiceNext : 'null',
          expected: true,
          match: lockerServiceNext === true
        }]
      };
    } catch (error) {
      return {
        name: 'Security Settings',
        status: 'error',
        message: error.message,
        fields: []
      };
    }
  }

  /**
   * Validation 3: Org Limits
   * Checks file and data storage usage
   */
  static async validateOrgLimits() {
    try {
      const limits = await this.getOrgLimits();

      const fileStorage = limits.FileStorageMB;
      const dataStorage = limits.DataStorageMB;

      const fileUsedPercent = ((fileStorage.Max - fileStorage.Remaining) / fileStorage.Max) * 100;
      const dataUsedPercent = ((dataStorage.Max - dataStorage.Remaining) / dataStorage.Max) * 100;

      const getStorageStatus = (percent) => {
        if (percent >= EXPECTED_VALUES.storageThresholds.criticalPercent) return 'critical';
        if (percent >= EXPECTED_VALUES.storageThresholds.warningPercent) return 'warning';
        return 'ok';
      };

      return {
        name: 'Org Limits',
        status: 'success',
        storage: {
          file: {
            used: fileStorage.Max - fileStorage.Remaining,
            max: fileStorage.Max,
            remaining: fileStorage.Remaining,
            usedPercent: fileUsedPercent.toFixed(1),
            status: getStorageStatus(fileUsedPercent)
          },
          data: {
            used: dataStorage.Max - dataStorage.Remaining,
            max: dataStorage.Max,
            remaining: dataStorage.Remaining,
            usedPercent: dataUsedPercent.toFixed(1),
            status: getStorageStatus(dataUsedPercent)
          }
        },
        fields: []
      };
    } catch (error) {
      return {
        name: 'Org Limits',
        status: 'error',
        message: error.message,
        fields: []
      };
    }
  }

  /**
   * Validation 4: API Usage
   * Checks API call limits and usage
   */
  static async validateAPIUsage() {
    try {
      const limits = await this.getOrgLimits();

      const apiCalls = limits.DailyApiRequests;
      const usedPercent = ((apiCalls.Max - apiCalls.Remaining) / apiCalls.Max) * 100;

      const getApiStatus = (percent) => {
        if (percent >= 90) return 'critical';
        if (percent >= 70) return 'warning';
        return 'ok';
      };

      return {
        name: 'API Usage',
        status: 'success',
        fields: [{
          label: 'Daily API Calls Used',
          value: `${apiCalls.Max - apiCalls.Remaining} / ${apiCalls.Max} (${usedPercent.toFixed(1)}%)`,
          expected: null,
          match: usedPercent < 90
        }, {
          label: 'API Calls Remaining',
          value: apiCalls.Remaining,
          expected: null,
          match: true
        }]
      };
    } catch (error) {
      return {
        name: 'API Usage',
        status: 'error',
        message: error.message,
        fields: []
      };
    }
  }

  /**
   * Validation 5: Environment Settings (Custom Object)
   * Validates Closed System, Lock Life Cycle, DOT Help URL, and Email Deliverability
   */
  static async validateESignatureSettings() {
    try {
      // Get current session to determine the org URL
      const session = await SessionManager.getCurrentSession();
      const expectedLoginUrl = session.instanceUrl;
      const expectedHelpUrl = `${session.instanceUrl}/lightning/app/dotcomp__Dot_Community`;

      // Query Environment Settings for system configuration
      const envQuery = `SELECT CompSuite__Closed_System__c, CompSuite__Lock_Life_Cycle__c, CompSuite__Dot_Help_URL__c FROM CompSuite__Environment_Settings__c WHERE Name = 'System Settings' LIMIT 1`;
      const envResult = await this.soqlQuery(envQuery);

      // Query E-Signature Settings for Login URL
      const esigQuery = `SELECT Name, CompSuite__Value__c FROM CompSuite__E_Signature_Settings__c WHERE Name = 'Login URL' LIMIT 1`;
      const esigResult = await this.soqlQuery(esigQuery);

      const fields = [];

      // Check Environment Settings
      if (envResult.records && envResult.records.length > 0) {
        const envRecord = envResult.records[0];

        // Closed System (should be true)
        fields.push({
          label: 'Closed System',
          value: envRecord.CompSuite__Closed_System__c,
          expected: true,
          match: envRecord.CompSuite__Closed_System__c === true
        });

        // Lock Life Cycle (should be true)
        fields.push({
          label: 'Lock Life Cycle',
          value: envRecord.CompSuite__Lock_Life_Cycle__c,
          expected: true,
          match: envRecord.CompSuite__Lock_Life_Cycle__c === true
        });

        // DOT Help URL (should match expected)
        fields.push({
          label: 'DOT Help URL',
          value: envRecord.CompSuite__Dot_Help_URL__c || 'Not Set',
          expected: expectedHelpUrl,
          match: envRecord.CompSuite__Dot_Help_URL__c === expectedHelpUrl
        });
      } else {
        fields.push({
          label: 'Environment Settings',
          value: 'Not Found',
          expected: 'System Settings record',
          match: false
        });
      }

      // Check E-Signature Login URL
      if (esigResult.records && esigResult.records.length > 0) {
        const loginUrlRecord = esigResult.records[0];
        fields.push({
          label: 'E-Signature URL',
          value: loginUrlRecord.CompSuite__Value__c || 'Not Set',
          expected: expectedLoginUrl,
          match: loginUrlRecord.CompSuite__Value__c === expectedLoginUrl
        });
      } else {
        fields.push({
          label: 'E-Signature URL',
          value: 'Not Found',
          expected: expectedLoginUrl,
          match: false
        });
      }

      // Email Deliverability Check
      try {
        const emailQuery = "SELECT Metadata FROM EmailAdministrationSettings";
        const emailResult = await this.toolingQuery(emailQuery);

        if (emailResult.records && emailResult.records.length > 0) {
          const emailRecord = emailResult.records[0];
          let metadata = emailRecord.Metadata;
          let hasGmailPref = false;

          if (metadata && typeof metadata === 'object') {
            hasGmailPref = 'enableSendViaGmailPref' in metadata;
          } else if (typeof metadata === 'string') {
            try {
              const metadataParsed = JSON.parse(metadata);
              hasGmailPref = 'enableSendViaGmailPref' in metadataParsed;
            } catch (e) {
              hasGmailPref = false;
            }
          }

          const deliverabilityStatus = hasGmailPref ? 'All Mail' : 'not all mail / no access';

          fields.push({
            label: 'Email Deliverability',
            value: deliverabilityStatus,
            expected: 'All Mail',
            match: hasGmailPref
          });
        } else {
          fields.push({
            label: 'Email Deliverability',
            value: 'No data found',
            expected: 'All Mail',
            match: false
          });
        }
      } catch (emailError) {
        // If email deliverability check fails, add error field
        fields.push({
          label: 'Email Deliverability',
          value: `Error: ${emailError.message}`,
          expected: 'All Mail',
          match: false
        });
      }

      return {
        name: 'Environment Settings',
        status: 'success',
        fields: fields
      };
    } catch (error) {
      return {
        name: 'Environment Settings',
        status: 'error',
        message: error.message,
        fields: []
      };
    }
  }

  /**
   * Validation 6: Data Migration
   * Validates data integrity including requirement revisions, orphaned documents, and content links
   */
  static async validateDataMigration() {
    try {
      const fields = [];

      // Check 1: Opened Requirement Revisions
      try {
        const reqQuery = `SELECT count(id) FROM CompSuite__Requirement_Revision__c WHERE CompSuite__State__r.Name = 'Opened'`;
        const reqResult = await this.soqlQuery(reqQuery);
        const reqCount = reqResult.records && reqResult.records[0] ? (reqResult.records[0].cnt || reqResult.records[0].expr0 || 0) : 0;

        fields.push({
          label: 'Opened Requirement Revisions',
          value: reqCount,
          expected: 0,
          match: reqCount === 0,
          helpText: reqCount > 0 ? `Action Required: Please check if there is new version for these Requirement Revisions, if not, change them to Active.` : null
        });
      } catch (reqError) {
        fields.push({
          label: 'Opened Requirement Revisions',
          value: `Error: ${reqError.message}`,
          expected: 0,
          match: false,
          helpText: 'Action Required: Fix the error and verify access to CompSuite__Requirement_Revision__c object.'
        });
      }

      // Check 2: Orphaned Document Revisions
      try {
        const orphanQuery = `SELECT count(id) FROM CompSuite__Document_Revision__c WHERE Id NOT IN (SELECT CompSuite__Document_Revision__c FROM CompSuite__Document_Revision_Logs__c)`;
        const orphanResult = await this.soqlQuery(orphanQuery);
        const orphanCount = orphanResult.records && orphanResult.records[0] ? (orphanResult.records[0].cnt || orphanResult.records[0].expr0 || 0) : 0;

        fields.push({
          label: 'Orphaned Document Revisions',
          value: orphanCount,
          expected: 0,
          match: orphanCount === 0,
          helpText: orphanCount > 0 ? `Action Required: Link ${orphanCount} orphaned document revision(s) to Document_Revision_Logs__c or delete them before migration.` : null
        });
      } catch (orphanError) {
        fields.push({
          label: 'Orphaned Document Revisions',
          value: `Error: ${orphanError.message}`,
          expected: 0,
          match: false,
          helpText: 'Action Required: Fix the error and verify access to CompSuite__Document_Revision__c and CompSuite__Document_Revision_Logs__c objects.'
        });
      }

      // Check 3: Content Document Links
      try {
        // Query Document Revision Logs (not Revisions) matching Python script logic
        const revisionLogsQuery = `
          SELECT Id, CompSuite__File_URL__c, CompSuite__PDF_URL__c
          FROM CompSuite__Document_Revision_Logs__c
          WHERE CompSuite__Action__c = 'Check In'
            AND CompSuite__Document_Revision__r.CompSuite__Data_Migration_Record__c = true
        `;
        const revisionLogs = await this.soqlQuery(revisionLogsQuery);

        if (!revisionLogs.records || revisionLogs.records.length === 0) {
          fields.push({
            label: 'Missing Content Document Links',
            value: 0,
            expected: 0,
            match: true,
            helpText: null
          });
          fields.push({
            label: 'Total Document Revision Logs',
            value: 0,
            expected: null,
            match: true,
            helpText: null
          });
        } else {
          // Helper function to extract ID from URL (matches Python script logic)
          const extractIdFromUrl = (url) => {
            if (!url) return null;
            const base = url.split('?')[0];
            return base.includes('/') ? base.split('/').pop() : base;
          };

          // Extract ContentVersion IDs from File_URL__c and PDF_URL__c
          const contentVersionIds = new Set();
          revisionLogs.records.forEach(log => {
            const fileId = extractIdFromUrl(log.CompSuite__File_URL__c);
            const pdfId = extractIdFromUrl(log.CompSuite__PDF_URL__c);
            if (fileId) contentVersionIds.add(fileId);
            if (pdfId) contentVersionIds.add(pdfId);
          });

          // Map ContentVersion IDs to ContentDocument IDs
          const versionToDocMap = new Map();
          if (contentVersionIds.size > 0) {
            const chunkSize = 200;
            const versionIdsArray = Array.from(contentVersionIds);

            for (let i = 0; i < versionIdsArray.length; i += chunkSize) {
              const chunk = versionIdsArray.slice(i, i + chunkSize);
              const idsString = chunk.map(id => `'${id}'`).join(',');
              const versionQuery = `SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id IN (${idsString})`;
              const versionResult = await this.soqlQuery(versionQuery);

              if (versionResult.records) {
                versionResult.records.forEach(ver => {
                  versionToDocMap.set(ver.Id, ver.ContentDocumentId);
                });
              }
            }
          }

          // Query existing ContentDocumentLinks for Document Revision Logs
          const revisionLogIds = revisionLogs.records.map(log => log.Id);
          const existingKeys = new Set(); // "{LinkedEntityId}_{ContentDocumentId}"

          const chunkSize = 200;
          for (let i = 0; i < revisionLogIds.length; i += chunkSize) {
            const chunk = revisionLogIds.slice(i, i + chunkSize);
            const idsString = chunk.map(id => `'${id}'`).join(',');
            const linkQuery = `SELECT LinkedEntityId, ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId IN (${idsString})`;
            const linkResult = await this.soqlQuery(linkQuery);

            if (linkResult.records) {
              linkResult.records.forEach(rec => {
                if (rec.LinkedEntityId && rec.ContentDocumentId) {
                  existingKeys.add(`${rec.LinkedEntityId}_${rec.ContentDocumentId}`);
                }
              });
            }
          }

          // Check for missing links (matches Python script logic)
          const affectedLogIds = new Set();
          revisionLogs.records.forEach(log => {
            const fileId = extractIdFromUrl(log.CompSuite__File_URL__c);
            const pdfId = extractIdFromUrl(log.CompSuite__PDF_URL__c);

            [fileId, pdfId].forEach(verId => {
              if (!verId) return;
              const docId = versionToDocMap.get(verId);
              if (!docId) return;
              const key = `${log.Id}_${docId}`;
              if (!existingKeys.has(key)) {
                affectedLogIds.add(log.Id);
              }
            });
          });

          const missingCount = affectedLogIds.size;

          fields.push({
            label: 'Missing Content Document Links',
            value: missingCount,
            expected: 0,
            match: missingCount === 0,
            helpText: missingCount > 0 ? `Action Required: Use Jenkins to run the script: "python/affectedDRL/affectedDRL.py"` : null
          });
        }
      } catch (linkError) {
        fields.push({
          label: 'Missing Content Document Links',
          value: `Error: ${linkError.message}`,
          expected: 0,
          match: false,
          helpText: 'Action Required: Use Jenkins to run the script: "python/affectedDRL/affectedDRL.py"'
        });
      }

      return {
        name: 'Data Migration',
        status: 'success',
        fields: fields
      };
    } catch (error) {
      return {
        name: 'Data Migration',
        status: 'error',
        message: error.message,
        fields: []
      };
    }
  }

  /**
   * Load custom health checks from storage
   */
  static async loadCustomChecks() {
    const result = await chrome.storage.local.get('customHealthChecks');
    return result.customHealthChecks || [];
  }

  /**
   * Execute a custom health check
   */
  static async executeCustomCheck(customCheck) {
    try {
      const result = await this.soqlQuery(customCheck.query);

      // Handle different result types
      let fields = [];

      if (result.totalSize !== undefined) {
        // COUNT() query
        fields.push({
          label: 'Count',
          value: result.totalSize,
          expected: customCheck.expectedValue,
          match: customCheck.expectedType === 'none' ? true : result.totalSize == customCheck.expectedValue
        });
      } else if (result.records && result.records.length > 0) {
        const record = result.records[0];

        // Handle aggregate COUNT queries
        if (record.expr0 !== undefined || record.cnt !== undefined) {
          const count = record.expr0 !== undefined ? record.expr0 : record.cnt;
          fields.push({
            label: 'Count',
            value: count,
            expected: customCheck.expectedValue,
            match: customCheck.expectedType === 'none' ? true : count == customCheck.expectedValue
          });
        } else {
          // Regular query - show all fields
          for (const [key, value] of Object.entries(record)) {
            if (key !== 'attributes') {
              fields.push({
                label: key,
                value: value || 'N/A',
                expected: customCheck.expectedValue,
                match: customCheck.expectedType === 'none' ? true : value == customCheck.expectedValue
              });
            }
          }
        }
      } else {
        fields.push({
          label: 'Result',
          value: 'No records found',
          expected: customCheck.expectedValue,
          match: customCheck.expectedType === 'zero'
        });
      }

      return {
        name: customCheck.title,
        status: 'success',
        fields: fields
      };
    } catch (error) {
      return {
        name: customCheck.title,
        status: 'error',
        message: error.message,
        fields: []
      };
    }
  }

  /**
   * Check Document Revision File Sharing
   * Analyzes ContentDocumentLink sharing for files associated with a Document Revision record
   * @param {string} recordId - CompSuite__Document_Revision__c record ID
   * @returns {Promise<object>} - Check result with sharing details
   */
  static async checkDocumentRevisionSharing(recordId) {

    try {
      // Step 1: Get PDF_ID__c, FILE_ID__c, and State from Document Revision record
      const revisionQuery = `SELECT Id, Name, CompSuite__PDF_Id__c, CompSuite__File_Id__c,
                             CompSuite__PDF_URL__c, CompSuite__File_URL__c,
                             CompSuite__State__r.Name
                             FROM CompSuite__Document_Revision__c
                             WHERE Id = '${recordId}'`;

      const revisionResult = await this.soqlQuery(revisionQuery);

      if (!revisionResult.records || revisionResult.records.length === 0) {
        return {
          status: 'error',
          message: 'Document Revision record not found',
          summary: 'Record not found'
        };
      }

      const revision = revisionResult.records[0];
      // Use the exact case as it appears in the SOQL query
      const pdfId = revision.CompSuite__PDF_Id__c;
      const fileId = revision.CompSuite__File_Id__c;
      const stateName = revision.CompSuite__State__r?.Name || '';


      if (!pdfId && !fileId) {
        return {
          status: 'warning',
          message: 'No file IDs found on this Document Revision1',
          summary: 'No files attached (PDF_ID and FILE_ID are both empty)'
        };
      }

      const fileDetails = [];

      // Step 2: Build a map of file types to IDs to handle properly
      const fileTypeMap = [];
      if (pdfId) fileTypeMap.push({ type: 'PDF', id: pdfId });
      if (fileId) fileTypeMap.push({ type: 'FILE', id: fileId });

      if (fileTypeMap.length === 0) {
        return {
          status: 'warning',
          message: 'No valid file IDs to check',
          summary: 'No files to analyze'
        };
      }

      // Get unique version IDs for the query
      const uniqueVersionIds = [...new Set(fileTypeMap.map(f => f.id))];

      const versionQuery = `SELECT Id, ContentDocumentId, Title
                            FROM ContentVersion
                            WHERE Id IN ('${uniqueVersionIds.join("','")}')`;

      const versionResult = await this.soqlQuery(versionQuery);

      if (!versionResult.records || versionResult.records.length === 0) {
        return {
          status: 'error',
          message: 'ContentVersion records not found for the specified IDs',
          summary: 'File version records not found'
        };
      }


      // Create a map of version ID to version record
      const versionMap = {};
      versionResult.records.forEach(v => {
        versionMap[v.Id] = v;
      });

      // Step 3: For each ContentDocumentId, query ContentDocumentLink
      const documentIds = versionResult.records.map(v => v.ContentDocumentId);

      const linkQuery = `SELECT Id, ContentDocumentId, LinkedEntityId, ShareType, Visibility
                         FROM ContentDocumentLink
                         WHERE ContentDocumentId IN ('${documentIds.join("','")}')`;

      const linkResult = await this.soqlQuery(linkQuery);


      // Step 4: Get EntityDefinition mapping for key prefixes
      const entityDefQuery = `SELECT KeyPrefix, Label FROM EntityDefinition WHERE KeyPrefix != null`;
      const entityDefResult = await this.soqlQuery(entityDefQuery);


      // Create a map of KeyPrefix to Label (case-sensitive)
      const keyPrefixMap = {};
      if (entityDefResult.records) {
        entityDefResult.records.forEach(entity => {
          if (entity.KeyPrefix) {
            keyPrefixMap[entity.KeyPrefix] = entity.Label;
          }
        });
      }

      // Step 5: Organize results by file - create separate entries for PDF and FILE
      fileTypeMap.forEach(fileInfo => {
        const version = versionMap[fileInfo.id];
        if (version) {
          const links = linkResult.records.filter(link => link.ContentDocumentId === version.ContentDocumentId);

          fileDetails.push({
            type: fileInfo.type,
            versionId: version.Id,
            documentId: version.ContentDocumentId,
            title: version.Title,
            shareCount: links.length,
            shares: links.map(link => {
              // Extract first 3 characters from LinkedEntityId as key prefix (case-sensitive)
              const keyPrefix = link.LinkedEntityId ? link.LinkedEntityId.substring(0, 3) : '';
              const objectName = keyPrefixMap[keyPrefix] || 'Unknown';

              return {
                linkedEntityId: link.LinkedEntityId,
                objectName: objectName,
                shareType: link.ShareType,
                visibility: link.Visibility
              };
            })
          });
        }
      });

      // Step 5: Generate summary
      const totalShares = fileDetails.reduce((sum, file) => sum + file.shareCount, 0);
      const pdfFile = fileDetails.find(f => f.type === 'PDF');
      const docFile = fileDetails.find(f => f.type === 'FILE');

      let summary = `Found ${totalShares} share record(s): `;
      if (pdfFile) summary += `PDF has ${pdfFile.shareCount} share(s)`;
      if (pdfFile && docFile) summary += ', ';
      if (docFile) summary += `FILE has ${docFile.shareCount} share(s)`;

      // Step 6: Validate shares based on state
      const validation = this.validateDocumentRevisionShares(fileDetails, stateName);

      return {
        status: 'success',
        message: 'Share check completed successfully',
        summary: summary,
        data: {
          revisionName: revision.Name,
          revisionId: recordId,
          stateName: stateName,
          files: fileDetails,
          totalShares: totalShares,
          validation: validation
        }
      };

    } catch (error) {
      console.error('[HealthCheckAPI] Error checking document revision sharing:', error);
      return {
        status: 'error',
        message: error.message || 'Unknown error occurred',
        summary: `Error: ${error.message}`
      };
    }
  }

  /**
   * Validate document revision shares based on state
   * @param {Array} fileDetails - Array of file details with shares
   * @param {string} stateName - Name of the document state
   * @returns {object} - Validation result
   */
  static validateDocumentRevisionShares(fileDetails, stateName) {
    const issues = [];
    const warnings = [];

    // Normalize state name for comparison (case-insensitive, handle parentheses and spaces)
    const normalizedState = stateName.toLowerCase().trim();

    // Determine expected shares based on state
    // Effective states: "Effective (Simple)" and "Effective"
    const isEffective = normalizedState === 'effective' || normalizedState === 'effective (simple)';
    // Superseded states: "Superseded (Simple)" and "Superseded"
    const isSuperseded = normalizedState === 'superseded' || normalizedState === 'superseded (simple)';

    if (!isEffective && !isSuperseded) {
      warnings.push(`Unknown state: "${stateName}". Cannot validate sharing rules.`);
      return { isValid: null, issues, warnings };
    }

    // Check each file for expected shares
    fileDetails.forEach(file => {
      const objectNames = file.shares.map(share => share.objectName);
      const hasDocRevisionLogs = objectNames.includes('Document Revision Logs');
      const hasMasterDocument = objectNames.includes('Master Document');

      if (!hasDocRevisionLogs) {
        issues.push(`${file.type}: Missing required share with "Document Revision Logs"`);
      }

      if (isEffective) {
        // Effective state should have both Document Revision Logs and Master Document
        if (!hasMasterDocument) {
          issues.push(`${file.type}: Missing required share with "Master Document" (State: ${stateName})`);
        }
      } else if (isSuperseded) {
        // Superseded state should have Document Revision Logs but NOT Master Document
        if (hasMasterDocument) {
          issues.push(`${file.type}: Should NOT have share with "Master Document" (State: ${stateName})`);
        }
      }
    });

    const isValid = issues.length === 0;
    return { isValid, issues, warnings, stateName };
  }

  /**
   * Add missing ContentDocumentLinks for Document Revision
   * Finds the matching Revision Log record with the same version number and creates missing share links
   * @param {string} recordId - CompSuite__Document_Revision__c record ID
   * @returns {Promise<object>} - Result of the operation
   */
  static async addMissingDocumentRevisionLinks(recordId) {

    try {
      // Step 1: Get Document Revision details including Version
      const revisionQuery = `SELECT Id, Name, CompSuite__PDF_Id__c, CompSuite__File_Id__c,
                             CompSuite__Version__c, CompSuite__State__r.Name
                             FROM CompSuite__Document_Revision__c
                             WHERE Id = '${recordId}'`;

      const revisionResult = await this.soqlQuery(revisionQuery);

      if (!revisionResult.records || revisionResult.records.length === 0) {
        return {
          status: 'error',
          message: 'Document Revision record not found'
        };
      }

      const revision = revisionResult.records[0];
      const pdfId = revision.CompSuite__PDF_Id__c;
      const fileId = revision.CompSuite__File_Id__c;
      const versionNumber = revision.CompSuite__Version__c;
      const stateName = revision.CompSuite__State__r?.Name || '';


      if (!pdfId && !fileId) {
        return {
          status: 'warning',
          message: 'No file IDs found on this Document Revision'
        };
      }

      if (!versionNumber) {
        return {
          status: 'error',
          message: 'No version number found on Document Revision'
        };
      }

      // Step 2: Find the matching Revision Log with the same version number
      const revisionLogQuery = `SELECT Id, Name
                                FROM CompSuite__Document_Revision_Logs__c
                                WHERE CompSuite__Document_Revision__c = '${recordId}'
                                  AND CompSuite__Version__c = '${versionNumber}'
                                LIMIT 1`;

      const revisionLogResult = await this.soqlQuery(revisionLogQuery);

      if (!revisionLogResult.records || revisionLogResult.records.length === 0) {
        return {
          status: 'error',
          message: `No Revision Log found with Version ${versionNumber} for this Document Revision`
        };
      }

      const revisionLog = revisionLogResult.records[0];
      const linkedEntityId = revisionLog.Id;


      // Step 3: Get ContentDocumentIds from ContentVersion IDs
      const fileTypeMap = [];
      if (pdfId) fileTypeMap.push({ type: 'PDF', id: pdfId });
      if (fileId) fileTypeMap.push({ type: 'FILE', id: fileId });

      const uniqueVersionIds = [...new Set(fileTypeMap.map(f => f.id))];
      const versionQuery = `SELECT Id, ContentDocumentId, Title
                            FROM ContentVersion
                            WHERE Id IN ('${uniqueVersionIds.join("','")}')`;

      const versionResult = await this.soqlQuery(versionQuery);

      if (!versionResult.records || versionResult.records.length === 0) {
        return {
          status: 'error',
          message: 'ContentVersion records not found for the specified IDs'
        };
      }

      // Create a map of version ID to ContentDocumentId
      const versionMap = {};
      versionResult.records.forEach(v => {
        versionMap[v.Id] = { documentId: v.ContentDocumentId, title: v.Title };
      });

      // Step 4: Check which ContentDocumentLinks already exist
      const documentIds = versionResult.records.map(v => v.ContentDocumentId);
      const linkQuery = `SELECT Id, ContentDocumentId, LinkedEntityId
                         FROM ContentDocumentLink
                         WHERE ContentDocumentId IN ('${documentIds.join("','")}')
                           AND LinkedEntityId = '${linkedEntityId}'`;

      const linkResult = await this.soqlQuery(linkQuery);

      // Create a set of existing links (documentId)
      const existingLinks = new Set();
      if (linkResult.records) {
        linkResult.records.forEach(link => {
          existingLinks.add(link.ContentDocumentId);
        });
      }


      // Step 5: Create missing ContentDocumentLink records
      const linksToCreate = [];
      fileTypeMap.forEach(fileInfo => {
        const versionInfo = versionMap[fileInfo.id];
        if (versionInfo && !existingLinks.has(versionInfo.documentId)) {
          linksToCreate.push({
            type: fileInfo.type,
            documentId: versionInfo.documentId,
            title: versionInfo.title
          });
        }
      });

      if (linksToCreate.length === 0) {
        return {
          status: 'success',
          message: 'All required ContentDocumentLinks already exist',
          created: 0
        };
      }


      // Create ContentDocumentLink records using REST API
      const session = await SessionManager.getCurrentSession();
      const createdLinks = [];

      for (const link of linksToCreate) {
        const linkData = {
          ContentDocumentId: link.documentId,
          LinkedEntityId: linkedEntityId,
          ShareType: 'V', // V = Viewer permission
          Visibility: 'AllUsers' // AllUsers visibility
        };

        const createUrl = new URL('/services/data/v59.0/sobjects/ContentDocumentLink', session.instanceUrl);

        try {
          const response = await fetch(createUrl.toString(), {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + session.sessionId,
              'Accept': 'application/json; charset=UTF-8',
              'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(linkData)
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[HealthCheckAPI] Failed to create link for', link.type, ':', errorText);
            throw new Error(`Failed to create link for ${link.type}: ${errorText}`);
          }

          const result = await response.json();
          createdLinks.push({
            type: link.type,
            title: link.title,
            documentId: link.documentId,
            linkId: result.id
          });

        } catch (error) {
          console.error('[HealthCheckAPI] Error creating link:', error);
          throw error;
        }
      }

      return {
        status: 'success',
        message: `Successfully created ${createdLinks.length} ContentDocumentLink(s)`,
        created: createdLinks.length,
        links: createdLinks,
        revisionLogId: linkedEntityId,
        revisionLogName: revisionLog.Name
      };

    } catch (error) {
      console.error('[HealthCheckAPI] Error adding missing links:', error);
      return {
        status: 'error',
        message: error.message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Run a single health check by name
   * @param {string} checkName - Name of the check to run
   * @param {object} customCheck - Custom check object (if checkName is 'custom')
   * @returns {Promise<object>} - Check result
   */
  static async runSingleCheck(checkName, customCheck = null) {

    try {
      // Map check names to validation methods
      switch (checkName) {
        case 'System Information':
          return await this.validateEnvironmentSettings();

        case 'Security Settings':
          return await this.validateSecuritySettings();

        case 'Org Limits':
          return await this.validateOrgLimits();

        case 'API Usage':
          return await this.validateAPIUsage();

        case 'Environment Settings':
          return await this.validateESignatureSettings();

        case 'Data Migration':
          return await this.validateDataMigration();

        case 'custom':
          if (!customCheck) {
            throw new Error('Custom check object is required for custom checks');
          }
          return await this.executeCustomCheck(customCheck);

        default:
          throw new Error(`Unknown check name: ${checkName}`);
      }
    } catch (error) {
      console.error(`[HealthCheckAPI] Error running check "${checkName}":`, error);
      return {
        name: checkName,
        status: 'error',
        message: error.message || 'Unknown error occurred',
        fields: []
      };
    }
  }

  /**
   * Run all health checks in parallel
   */
  static async runAllHealthChecks() {
    const startTime = Date.now();


    // Load custom checks
    const customChecks = await this.loadCustomChecks();
    const enabledCustomChecks = customChecks.filter(c => c.enabled);


    // Execute standard checks in parallel
    const standardChecks = [
      this.validateEnvironmentSettings(),
      this.validateSecuritySettings(),
      this.validateOrgLimits(),
      this.validateAPIUsage(),
      this.validateESignatureSettings(),
      this.validateDataMigration()
    ];

    // Add custom checks
    const customCheckPromises = enabledCustomChecks.map(check => this.executeCustomCheck(check));

    // Execute all checks in parallel using Promise.allSettled
    const results = await Promise.allSettled([...standardChecks, ...customCheckPromises]);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);


    // Extract values from settled promises
    const checks = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // If promise rejected, return error state
        const checkNames = [
          'System Information',
          'Security Settings',
          'Org Limits',
          'API Usage',
          'Environment Settings',
          'Data Migration'
        ];
        const name = index < checkNames.length ? checkNames[index] : `Custom Check ${index - checkNames.length + 1}`;
        console.error('[HealthCheckAPI] Check', index, 'rejected:', result.reason);
        return {
          name: name,
          status: 'error',
          message: result.reason?.message || 'Unknown error',
          fields: []
        };
      }
    });

    // Get org info
    const session = await SessionManager.getCurrentSession();

    return {
      orgUrl: session.instanceUrl,
      timestamp: new Date().toISOString(),
      duration: duration,
      checks: checks
    };
  }
}

export default HealthCheckAPI;
