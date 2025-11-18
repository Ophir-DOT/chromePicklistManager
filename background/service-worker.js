import SessionManager from './session-manager.js';
import MetadataAPI from './metadata-api.js';
import StorageManager from './storage-manager.js';
import SalesforceAPI from './api-client.js';
import UpdateChecker from './update-checker.js';
import HealthCheckAPI from './health-check-api.js';

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Salesforce Picklist Manager installed');

  // Initialize update checker
  UpdateChecker.initialize();
});

// Initialize update checker on startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Salesforce Picklist Manager started');
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
        let session;

        // If tabId or url provided, try to extract session from that tab
        if (request.tabId || request.url) {
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
                (tab.url.includes('salesforce.com') || tab.url.includes('force.com'))) {
              session = await SessionManager.extractSession(tab);
            } else {
              // Not a Salesforce tab, use stored session
              session = await SessionManager.getCurrentSession();
            }
          } catch (error) {
            console.warn('[ServiceWorker] Failed to extract session, trying stored session:', error.message);
            session = await SessionManager.getCurrentSession();
          }
        } else {
          // No tab info provided, use stored session
          session = await SessionManager.getCurrentSession();
        }

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
  console.log('[getObjects] Starting with new API client...');

  try {
    // Use the new XMLHttpRequest-based API client with Authorization header
    const objects = await SalesforceAPI.getObjects();
    console.log('[getObjects] Success! Got', objects.length, 'objects');
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
