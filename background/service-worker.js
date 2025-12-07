import SessionManager from './session-manager.js';
import MetadataAPI from './metadata-api.js';
import ToolingAPI from './tooling-api.js';
import StorageManager from './storage-manager.js';
import SalesforceAPI from './api-client.js';
import UpdateChecker from './update-checker.js';
import HealthCheckAPI from './health-check-api.js';
import DeploymentHistoryAPI from './deployment-history-api.js';

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  // Initialize update checker
  UpdateChecker.initialize();
});

// Initialize update checker on startup
chrome.runtime.onStartup.addListener(() => {
  UpdateChecker.initialize();
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  UpdateChecker.handleNotificationClick(notificationId);
});

// Message handler - routes requests to appropriate services
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(request, sender, sendResponse) {
  try {
    switch (request.action) {
      case 'GET_SESSION':
        console.log('[ServiceWorker] GET_SESSION request:', {
          hasTabId: !!request.tabId,
          hasUrl: !!request.url,
          sender: sender.tab ? `tab:${sender.tab.id}` : 'extension-page',
          senderUrl: sender.url?.substring(0, 50)
        });

        let session;

        // Check if sender is from extension page BUT NOT popup
        // Popup sends tabId/url to extract session from Salesforce tab
        // Full-page tools (health check, org compare) don't send tabId/url and should use stored session
        const isFromExtensionPage = sender.url && sender.url.startsWith('chrome-extension://');
        const hasTabContext = !!(request.tabId || request.url);

        if (isFromExtensionPage && !hasTabContext) {
          // Full-page extension tools (no tab context) should use stored session directly
          console.log('[ServiceWorker] Request from full-page extension tool, using stored session');
          const result = await chrome.storage.session.get('currentSession');

          if (!result.currentSession) {
            console.warn('[ServiceWorker] No stored session found for extension page');
            session = {
              error: 'NO_STORED_SESSION',
              message: 'No active Salesforce session found. Please open the extension popup from a Salesforce tab first.'
            };
          } else {
            console.log('[ServiceWorker] Using stored session for extension page');
            session = result.currentSession;
          }
        } else if (request.tabId || request.url) {
          // If tabId or url provided, try to extract session from that tab
          try {
            let tab;
            if (request.tabId) {
              tab = await chrome.tabs.get(request.tabId);
            } else if (request.url) {
              tab = { url: request.url };
            }

            // Only extract if it's a Salesforce URL
            if (tab && tab.url &&
                !tab.url.startsWith('chrome-extension://') &&
                (tab.url.includes('salesforce.com') ||
                 tab.url.includes('salesforce-setup.com') ||
                 tab.url.includes('force.com'))) {
              console.log('[ServiceWorker] Extracting session from Salesforce tab');
              session = await SessionManager.extractSession(tab);
            } else {
              // Not a Salesforce tab, use stored session
              console.log('[ServiceWorker] Using stored session (not Salesforce tab)');
              session = await SessionManager.getCurrentSession();
            }
          } catch (error) {
            console.warn('[ServiceWorker] Failed to extract session, trying stored session:', error.message);
            session = await SessionManager.getCurrentSession();
          }
        } else {
          // No tab info provided, use stored session via getCurrentSession()
          console.log('[ServiceWorker] No tab info provided, using getCurrentSession()');
          session = await SessionManager.getCurrentSession();
        }

        console.log('[ServiceWorker] GET_SESSION response:', {
          hasSession: !!session,
          hasError: !!session?.error,
          errorType: session?.error,
          hasInstanceUrl: !!session?.instanceUrl
        });

        sendResponse({ success: true, data: session });
        break;

      case 'EXPORT_PICKLISTS':
        const picklistData = await exportPicklists(request.objects);
        sendResponse({ success: true, data: picklistData });
        break;

      case 'EXPORT_DEPENDENCIES':
        const dependencies = await exportDependencies(request.objectName);
        sendResponse({ success: true, data: dependencies });
        break;

      case 'DEPLOY_CHANGES':
        const deployResult = await deployChanges(request.metadata);
        sendResponse({ success: true, data: deployResult });
        break;

      case 'CHECK_DEPLOY_STATUS':
        const status = await checkDeployStatus(request.deployId);
        sendResponse({ success: true, data: status });
        break;

      case 'UPDATE_FIELD_DEPENDENCIES':
        const updateResult = await updateFieldDependencies(
          request.objectName,
          request.dependentField,
          request.controllingField,
          request.mappings,
          request.fieldMetadata
        );
        sendResponse({ success: true, data: updateResult });
        break;

      case 'UPDATE_PICKLIST_VALUES':
        const picklistUpdateResult = await updatePicklistValues(
          request.objectName,
          request.fieldName,
          request.values,
          request.overwrite
        );
        sendResponse({ success: true, data: picklistUpdateResult });
        break;

      case 'COMPARE_ORGS':
        const comparison = await compareOrgs(request.source, request.target);
        sendResponse({ success: true, data: comparison });
        break;

      case 'GET_OBJECTS':
        const objects = await getObjects();
        sendResponse({ success: true, data: objects });
        break;

      case 'CHECK_FOR_UPDATES':
        await UpdateChecker.checkForUpdates();
        sendResponse({ success: true });
        break;

      case 'RUN_SINGLE_HEALTH_CHECK':
        const checkResult = await HealthCheckAPI.runSingleCheck(
          request.checkName,
          request.customCheck
        );
        sendResponse({ success: true, result: checkResult });
        break;

      case 'CHECK_DOCUMENT_REVISION_SHARING':
        const shareCheckResult = await HealthCheckAPI.checkDocumentRevisionSharing(
          request.recordId
        );
        sendResponse({ success: true, data: shareCheckResult });
        break;

      case 'ADD_MISSING_DOCUMENT_REVISION_LINKS':
        const addLinksResult = await HealthCheckAPI.addMissingDocumentRevisionLinks(
          request.recordId
        );
        sendResponse({ success: true, data: addLinksResult });
        break;

      case 'CHECK_APPROVAL_PROCESS':
        const approvalProcessResult = await checkApprovalProcess(request.recordId, request.tabId, request.url);
        sendResponse({ success: true, data: approvalProcessResult });
        break;

      // Deployment History
      case 'LOG_DEPLOYMENT':
        await DeploymentHistoryAPI.logDeployment(request.payload);
        sendResponse({ success: true });
        break;

      case 'GET_DEPLOYMENT_HISTORY':
        const history = await DeploymentHistoryAPI.getDeploymentHistory(request.payload);
        sendResponse({ success: true, data: history });
        break;

      case 'GET_DEPLOYMENT_DETAILS':
        const details = await DeploymentHistoryAPI.getDeploymentDetails(request.payload.deploymentId);
        sendResponse({ success: true, data: details });
        break;

      case 'DELETE_DEPLOYMENT':
        await DeploymentHistoryAPI.deleteDeployment(request.payload.deploymentId);
        sendResponse({ success: true });
        break;

      case 'CLEAR_DEPLOYMENT_HISTORY':
        await DeploymentHistoryAPI.clearHistory();
        sendResponse({ success: true });
        break;

      case 'EXPORT_DEPLOYMENT_HISTORY':
        const exportData = request.payload.format === 'csv'
          ? DeploymentHistoryAPI.exportToCSV(request.payload.history)
          : DeploymentHistoryAPI.exportToJSON(request.payload.history);
        sendResponse({ success: true, data: exportData });
        break;

      case 'GET_DEPLOYMENT_STATISTICS':
        const stats = await DeploymentHistoryAPI.getStatistics(request.payload);
        sendResponse({ success: true, data: stats });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function exportPicklists(objectNames) {
  const session = await SessionManager.getCurrentSession();
  const results = {};

  for (const objectName of objectNames) {
    const metadata = await MetadataAPI.readObject(session, objectName);
    results[objectName] = parsePicklistData(metadata);
  }

  return results;
}

async function exportDependencies(objectName) {
  const session = await SessionManager.getCurrentSession();
  const metadata = await MetadataAPI.readObject(session, objectName);

  return {
    object: objectName,
    fields: extractDependencies(metadata),
    recordTypes: extractRecordTypePicklists(metadata)
  };
}

async function deployChanges(metadataChanges) {
  const session = await SessionManager.getCurrentSession();

  // Use Metadata API for deployment
  const deployId = await MetadataAPI.deploy(session, metadataChanges);

  return deployId;
}

async function checkDeployStatus(deployId) {
  const session = await SessionManager.getCurrentSession();
  const status = await MetadataAPI.checkDeployStatus(session, deployId);
  return status;
}

async function updateFieldDependencies(objectName, dependentField, controllingField, mappings, fieldMetadata) {
  const session = await SessionManager.getCurrentSession();

  // Step 1: Validate all values exist
  const validation = await ToolingAPI.validateDependencyValues(
    session,
    objectName,
    controllingField,
    dependentField,
    mappings
  );

  if (!validation.valid) {
    const errors = [];
    if (validation.missingControlling.length > 0) {
      errors.push(`Missing controlling field values: ${validation.missingControlling.join(', ')}`);
    }
    if (validation.missingDependent.length > 0) {
      errors.push(`Missing dependent field values: ${validation.missingDependent.join(', ')}`);
    }
    throw new Error(errors.join('\n'));
  }

  // Step 2: Get CustomField ID for the dependent field
  const fieldId = await ToolingAPI.getCustomFieldId(session, objectName, dependentField);

  // Step 3: Get CURRENT field metadata to preserve existing settings
  console.log('[ServiceWorker] Fetching current field metadata...');
  const currentMetadata = await ToolingAPI.getCustomFieldMetadata(session, fieldId);
  console.log('[ServiceWorker] Current metadata valueSet:', currentMetadata.Metadata.valueSet);

  // Ensure valueSet exists
  if (!currentMetadata.Metadata.valueSet) {
    throw new Error('Field metadata does not contain valueSet. This field may not be a picklist or may not have dependencies configured.');
  }

  // Step 4: Merge new valueSettings with existing ones (append-only)
  const existingValueSettings = currentMetadata.Metadata.valueSet.valueSettings || [];
  const newValueSettings = fieldMetadata.valueSettings;

  if (!Array.isArray(newValueSettings)) {
    throw new Error('fieldMetadata.valueSettings must be an array');
  }

  // Create a map of existing mappings (valueName -> controllingFieldValues)
  const existingMap = new Map();
  existingValueSettings.forEach(vs => {
    if (vs && vs.valueName && Array.isArray(vs.controllingFieldValue)) {
      existingMap.set(vs.valueName, vs.controllingFieldValue);
    }
  });

  // Merge: Update existing or add new
  newValueSettings.forEach(vs => {
    if (!vs || !vs.valueName || !Array.isArray(vs.controllingFieldValue)) {
      console.warn('[ServiceWorker] Skipping invalid valueSetting:', vs);
      return;
    }

    if (existingMap.has(vs.valueName)) {
      // Merge controlling field values
      const existingValues = new Set(existingMap.get(vs.valueName));
      vs.controllingFieldValue.forEach(v => existingValues.add(v));
      existingMap.set(vs.valueName, Array.from(existingValues));
    } else {
      // New mapping
      existingMap.set(vs.valueName, vs.controllingFieldValue);
    }
  });

  // Convert back to array
  const mergedValueSettings = Array.from(existingMap.entries()).map(([valueName, controllingFieldValue]) => ({
    valueName,
    controllingFieldValue
  }));

  console.log('[ServiceWorker] Merged value settings count:', mergedValueSettings.length);

  // Step 5: Build complete dependency metadata matching working format exactly
  // Only include: label, type, valueSet, visibleLines, writeRequiresMasterRead
  // Do NOT include: required, trackFeedHistory, trackHistory, trackTrending
  const dependencyMetadata = {
    label: currentMetadata.Metadata.label,
    type: 'Picklist',
    valueSet: {
      controllingField: currentMetadata.Metadata.valueSet.controllingField,
      restricted: currentMetadata.Metadata.valueSet.restricted !== undefined ? currentMetadata.Metadata.valueSet.restricted : true,
      valueSetDefinition: currentMetadata.Metadata.valueSet.valueSetDefinition || null,
      valueSetName: currentMetadata.Metadata.valueSet.valueSetName || null,
      valueSettings: mergedValueSettings
    },
    visibleLines: currentMetadata.Metadata.visibleLines || null,
    writeRequiresMasterRead: currentMetadata.Metadata.writeRequiresMasterRead || null
  };

  const fullName = `${objectName}.${dependentField}`;

  // Log the request details for debugging
  const patchUrl = `${session.instanceUrl}/services/data/v59.0/tooling/sobjects/CustomField/${fieldId}`;
  const patchBody = {
    Metadata: dependencyMetadata,
    FullName: fullName
  };

  console.log('[ServiceWorker] PATCH URL:', patchUrl);
  console.log('[ServiceWorker] PATCH Body:', JSON.stringify(patchBody, null, 2));

  // Step 6: Update via Tooling API PATCH
  const result = await ToolingAPI.updateFieldDependencies(
    session,
    fieldId,
    dependencyMetadata,
    fullName
  );

  return {
    success: true,
    fieldId: fieldId,
    instanceUrl: session.instanceUrl,
    message: 'Dependencies updated successfully'
  };
}

async function updatePicklistValues(objectName, fieldName, values, overwrite) {
  const session = await SessionManager.getCurrentSession();

  console.log('[ServiceWorker] Updating picklist values via Tooling API:', {
    objectName,
    fieldName,
    valueCount: values.length,
    overwrite
  });

  // Use ToolingAPI.updatePicklist method which handles all the logic
  const result = await ToolingAPI.updatePicklist(
    session,
    objectName,
    fieldName,
    values,
    overwrite
  );

  console.log('[ServiceWorker] Picklist update result:', result);

  return {
    success: true,
    fieldId: result.fieldId,
    valuesUpdated: result.valuesUpdated,
    message: `Successfully updated ${result.valuesUpdated} picklist values`
  };
}

async function compareOrgs(sourceData, targetData) {
  // Simple comparison logic
  const differences = {};

  for (const [objectName, sourceFields] of Object.entries(sourceData)) {
    const targetFields = targetData[objectName] || {};
    const objectDiffs = compareFields(sourceFields, targetFields);

    if (objectDiffs.length > 0) {
      differences[objectName] = objectDiffs;
    }
  }

  return differences;
}

async function getObjects() {
  try {
    // Use the new XMLHttpRequest-based API client with Authorization header
    const objects = await SalesforceAPI.getObjects();
    return objects;
  } catch (error) {
    console.error('[getObjects] API call failed:', error);

    // Provide helpful error messages
    if (error.code === 'SESSION_EXPIRED') {
      throw new Error('Session expired. Please refresh the Salesforce page and try again.');
    } else if (error.code === 'ACCESS_DENIED') {
      throw new Error('Access denied. Check your Salesforce permissions.');
    } else {
      throw error;
    }
  }
}

async function checkApprovalProcess(recordId, tabId, url) {
  try {
    console.log('[checkApprovalProcess] Checking approval processes for record:', recordId);

    // Get session from tab context if provided, otherwise use stored session
    let session;
    if (tabId || url) {
      try {
        let tab;
        if (tabId) {
          tab = await chrome.tabs.get(tabId);
        } else if (url) {
          tab = { url: url };
        }
        session = await SessionManager.extractSession(tab);
      } catch (error) {
        console.warn('[checkApprovalProcess] Failed to extract session from tab, using stored session:', error.message);
        session = await SessionManager.getCurrentSession();
      }
    } else {
      session = await SessionManager.getCurrentSession();
    }

    if (!session || !session.sessionId) {
      throw new Error('No active Salesforce session found. Please open a Salesforce page first.');
    }

    // Build SOQL query
    const soql = `SELECT Id, Name, CompSuite__Status__c, CompSuite__Approval_Process_Init__c, CompSuite__Approval_Process_Init__r.Name, CreatedDate FROM CompSuite__Approval_Process__c WHERE CompSuite__Full_Object_Id__c = '${recordId}' ORDER BY CreatedDate DESC`;

    console.log('[checkApprovalProcess] Executing SOQL:', soql);

    // Execute query via REST API
    const queryUrl = `${session.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`;

    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.sessionId}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[checkApprovalProcess] Query failed:', response.status, errorText);

      if (response.status === 401) {
        throw new Error('Session expired. Please refresh the Salesforce page and try again.');
      } else if (response.status === 400) {
        // Check if error is due to missing object
        if (errorText.includes('sObject type') && errorText.includes('is not supported')) {
          throw new Error('CompSuite__Approval_Process__c object not found. This org may not have CompSuite installed.');
        }
        throw new Error(`Query error: ${errorText}`);
      } else {
        throw new Error(`Failed to query approval processes: ${response.status} ${response.statusText}`);
      }
    }

    const result = await response.json();

    console.log('[checkApprovalProcess] Query result:', {
      totalSize: result.totalSize,
      records: result.records?.length || 0
    });

    return {
      records: result.records || [],
      totalSize: result.totalSize || 0,
      session: session
    };

  } catch (error) {
    console.error('[checkApprovalProcess] Error:', error);
    throw error;
  }
}

function parsePicklistData(metadata) {
  const picklistFields = {};

  metadata.fields
    .filter(f => f.type === 'Picklist' || f.type === 'MultiselectPicklist')
    .forEach(field => {
      picklistFields[field.fullName] = {
        label: field.label,
        type: field.type,
        values: field.valueSet?.valueSetDefinition?.value || [],
        controllingField: field.valueSet?.controllingField,
        valueSettings: field.valueSet?.valueSettings || [],
        restricted: field.valueSet?.restricted || false
      };
    });

  return picklistFields;
}

function extractDependencies(metadata) {
  const dependencies = [];

  metadata.fields
    .filter(f => f.valueSet?.controllingField)
    .forEach(field => {
      dependencies.push({
        dependentField: field.fullName,
        controllingField: field.valueSet.controllingField,
        mappings: field.valueSet.valueSettings.map(vs => ({
          controllingValue: vs.controllingFieldValue,
          dependentValue: vs.valueName
        }))
      });
    });

  return dependencies;
}

function extractRecordTypePicklists(metadata) {
  return metadata.recordTypes?.map(rt => ({
    recordType: rt.fullName,
    label: rt.label,
    picklistValues: rt.picklistValues?.map(pv => ({
      picklist: pv.picklist,
      values: pv.values
    })) || []
  })) || [];
}

function compareFields(sourceFields, targetFields) {
  const differences = [];

  for (const [fieldName, sourceData] of Object.entries(sourceFields)) {
    const targetData = targetFields[fieldName];

    if (!targetData) {
      differences.push({
        field: fieldName,
        type: 'missing_in_target',
        sourceData
      });
    } else {
      const fieldDiffs = compareFieldValues(sourceData, targetData);
      if (fieldDiffs.length > 0) {
        differences.push({
          field: fieldName,
          type: 'modified',
          differences: fieldDiffs
        });
      }
    }
  }

  return differences;
}

function compareFieldValues(source, target) {
  const diffs = [];

  const sourceValues = new Set(source.values.map(v => v.fullName));
  const targetValues = new Set(target.values.map(v => v.fullName));

  for (const value of sourceValues) {
    if (!targetValues.has(value)) {
      diffs.push({ type: 'value_added', value });
    }
  }

  for (const value of targetValues) {
    if (!sourceValues.has(value)) {
      diffs.push({ type: 'value_removed', value });
    }
  }

  return diffs;
}

// Keyboard shortcuts handler
chrome.commands.onCommand.addListener(async (command) => {
  try {
    // Get the current active tab to ensure we're on a Salesforce page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.warn('[ServiceWorker] No active tab found');
      return;
    }

    // Check if we're on a Salesforce page
    const isSalesforcePage = tab.url && (
      tab.url.includes('salesforce.com') ||
      tab.url.includes('force.com') ||
      tab.url.includes('cloudforce.com') ||
      tab.url.includes('visualforce.com')
    );

    if (!isSalesforcePage) {
      console.warn('[ServiceWorker] Not on a Salesforce page, ignoring command');
      return;
    }

    // Route command to appropriate action
    switch (command) {
      case 'export-picklists':
        // Open popup and trigger export picklists
        await chrome.action.openPopup();
        // Send message to popup to trigger export
        setTimeout(() => {
          chrome.runtime.sendMessage({ action: 'TRIGGER_EXPORT_PICKLISTS' });
        }, 100);
        break;

      case 'picklist-loader':
        await chrome.action.openPopup();
        setTimeout(() => {
          chrome.runtime.sendMessage({ action: 'TRIGGER_PICKLIST_LOADER' });
        }, 100);
        break;

      case 'health-check':
        // Directly open health check in new tab
        const healthCheckUrl = chrome.runtime.getURL('health-check/health-check.html');
        await chrome.tabs.create({ url: healthCheckUrl });
        break;

      case 'check-share-files':
        await chrome.action.openPopup();
        setTimeout(() => {
          chrome.runtime.sendMessage({ action: 'TRIGGER_CHECK_SHARE_FILES' });
        }, 100);
        break;

      default:
        console.warn('[ServiceWorker] Unknown command:', command);
    }
  } catch (error) {
    console.error('[ServiceWorker] Error handling command:', error);
  }
});
