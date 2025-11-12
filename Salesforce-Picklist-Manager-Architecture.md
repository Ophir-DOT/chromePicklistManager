# Chrome Extension Architecture: Salesforce Picklist & Dependency Manager

## Executive Summary

A Chrome extension that extracts Salesforce session credentials to read, compare, and deploy picklist configurations including field dependencies and record type assignments across Salesforce orgs using the Metadata API.

---

## 1. Extension Manifest (manifest.json)

```json
{
  "manifest_version": 3,
  "name": "Salesforce Picklist Manager",
  "version": "1.0.0",
  "description": "Export, compare, and deploy picklist values and dependencies across Salesforce orgs",
  
  "permissions": [
    "cookies",
    "storage",
    "scripting"
  ],
  
  "host_permissions": [
    "https://*.salesforce.com/*",
    "https://*.force.com/*",
    "https://*.cloudforce.com/*",
    "https://*.visualforce.com/*"
  ],
  
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  
  "content_scripts": [
    {
      "matches": [
        "https://*.salesforce.com/*",
        "https://*.lightning.force.com/*"
      ],
      "js": ["content/injector.js"],
      "css": ["content/styles.css"],
      "run_at": "document_idle"
    }
  ],
  
  "action": {
    "default_popup": "popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  
  "web_accessible_resources": [
    {
      "resources": ["assets/*", "sidepanel.html"],
      "matches": ["https://*.salesforce.com/*", "https://*.force.com/*"]
    }
  ]
}
```

---

## 2. Project Structure

```
salesforce-picklist-manager/
│
├── manifest.json
│
├── background/
│   ├── service-worker.js          # Main background orchestrator
│   ├── session-manager.js          # Cookie/session extraction
│   ├── metadata-api.js             # Metadata API SOAP operations
│   ├── rest-api.js                 # REST API operations
│   └── storage-manager.js          # Chrome storage operations
│
├── content/
│   ├── injector.js                 # Detects SF pages, injects UI
│   └── styles.css                  # Styles for injected elements
│
├── popup/
│   ├── index.html                  # Extension popup UI
│   ├── app.js                      # Popup logic
│   └── styles.css
│
├── sidepanel/
│   ├── index.html                  # Side panel for detailed operations
│   ├── app.js                      # Side panel logic
│   ├── components/
│   │   ├── object-selector.js
│   │   ├── dependency-viewer.js
│   │   ├── diff-viewer.js
│   │   └── deploy-manager.js
│   └── styles.css
│
├── lib/
│   ├── xml-parser.js               # XML parsing utilities
│   ├── metadata-builder.js         # Build metadata XML structures
│   ├── dependency-analyzer.js      # Analyze dependencies
│   └── jsforce.min.js              # Optional: JSForce library
│
├── utils/
│   ├── api-helpers.js              # Common API utilities
│   ├── error-handler.js            # Error handling
│   └── logger.js                   # Logging utilities
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 3. Core Components Implementation

### 3.1 Background Service Worker (background/service-worker.js)

```javascript
import SessionManager from './session-manager.js';
import MetadataAPI from './metadata-api.js';
import RestAPI from './rest-api.js';
import StorageManager from './storage-manager.js';

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Salesforce Picklist Manager installed');
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
        const session = await SessionManager.extractSession(sender.tab);
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
        
      case 'COMPARE_ORGS':
        const comparison = await compareOrgs(request.source, request.target);
        sendResponse({ success: true, data: comparison });
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
  
  // Use Metadata API for deployment (can add and remove dependencies)
  const deployId = await MetadataAPI.deploy(session, metadataChanges);
  
  // Poll for deployment status
  const status = await MetadataAPI.checkDeployStatus(session, deployId);
  
  return status;
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
```

### 3.2 Session Manager (background/session-manager.js)

```javascript
class SessionManager {
  static async extractSession(tab) {
    const url = new URL(tab.url);
    const instanceUrl = `${url.protocol}//${url.hostname}`;
    
    // Get session cookie
    const sidCookie = await chrome.cookies.get({
      url: instanceUrl,
      name: 'sid'
    });
    
    if (!sidCookie) {
      throw new Error('No Salesforce session found. Please log in to Salesforce.');
    }
    
    // Store session info
    const session = {
      sessionId: sidCookie.value,
      instanceUrl: instanceUrl,
      timestamp: Date.now()
    };
    
    await chrome.storage.session.set({ currentSession: session });
    
    return session;
  }
  
  static async getCurrentSession() {
    const result = await chrome.storage.session.get('currentSession');
    
    if (!result.currentSession) {
      throw new Error('No active session. Please navigate to Salesforce.');
    }
    
    // Check if session is still valid (optional)
    const isValid = await this.validateSession(result.currentSession);
    if (!isValid) {
      throw new Error('Session expired. Please refresh Salesforce.');
    }
    
    return result.currentSession;
  }
  
  static async validateSession(session) {
    try {
      const response = await fetch(
        `${session.instanceUrl}/services/data/v59.0/limits`,
        {
          headers: {
            'Authorization': `Bearer ${session.sessionId}`
          }
        }
      );
      return response.ok;
    } catch (error) {
      return false;
    }
  }
  
  static async clearSession() {
    await chrome.storage.session.remove('currentSession');
  }
}

export default SessionManager;
```

### 3.3 Metadata API Handler (background/metadata-api.js)

```javascript
import { parseXML, buildXML } from '../lib/xml-parser.js';

class MetadataAPI {
  static METADATA_API_VERSION = '59.0';
  
  static async readObject(session, objectName) {
    const soapRequest = this.buildReadRequest(session.sessionId, objectName);
    const endpoint = `${session.instanceUrl}/services/Soap/m/${this.METADATA_API_VERSION}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': '""'
      },
      body: soapRequest
    });
    
    if (!response.ok) {
      throw new Error(`Metadata API read failed: ${response.status}`);
    }
    
    const xmlText = await response.text();
    return this.parseReadResponse(xmlText);
  }
  
  static buildReadRequest(sessionId, objectName) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader>
      <met:sessionId>${sessionId}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:readMetadata>
      <met:type>CustomObject</met:type>
      <met:fullNames>${objectName}</met:fullNames>
    </met:readMetadata>
  </soapenv:Body>
</soapenv:Envelope>`;
  }
  
  static parseReadResponse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // Check for errors
    const faultNode = xmlDoc.querySelector('faultstring');
    if (faultNode) {
      throw new Error(`Metadata API error: ${faultNode.textContent}`);
    }
    
    // Parse the result
    const resultNode = xmlDoc.querySelector('result');
    return this.parseCustomObject(resultNode);
  }
  
  static parseCustomObject(node) {
    const fields = [];
    const fieldNodes = node.querySelectorAll('fields');
    
    fieldNodes.forEach(fieldNode => {
      fields.push({
        fullName: fieldNode.querySelector('fullName')?.textContent,
        label: fieldNode.querySelector('label')?.textContent,
        type: fieldNode.querySelector('type')?.textContent,
        valueSet: this.parseValueSet(fieldNode.querySelector('valueSet'))
      });
    });
    
    const recordTypes = [];
    const recordTypeNodes = node.querySelectorAll('recordTypes');
    
    recordTypeNodes.forEach(rtNode => {
      recordTypes.push({
        fullName: rtNode.querySelector('fullName')?.textContent,
        label: rtNode.querySelector('label')?.textContent,
        picklistValues: this.parseRecordTypePicklists(rtNode)
      });
    });
    
    return { fields, recordTypes };
  }
  
  static parseValueSet(valueSetNode) {
    if (!valueSetNode) return null;
    
    const controllingField = valueSetNode.querySelector('controllingField')?.textContent;
    const restricted = valueSetNode.querySelector('restricted')?.textContent === 'true';
    
    const valueDefinition = valueSetNode.querySelector('valueSetDefinition');
    const values = [];
    
    if (valueDefinition) {
      valueDefinition.querySelectorAll('value').forEach(valueNode => {
        values.push({
          fullName: valueNode.querySelector('fullName')?.textContent,
          default: valueNode.querySelector('default')?.textContent === 'true',
          label: valueNode.querySelector('label')?.textContent
        });
      });
    }
    
    const valueSettings = [];
    valueSetNode.querySelectorAll('valueSettings').forEach(vsNode => {
      valueSettings.push({
        controllingFieldValue: vsNode.querySelector('controllingFieldValue')?.textContent,
        valueName: vsNode.querySelector('valueName')?.textContent
      });
    });
    
    return {
      controllingField,
      restricted,
      valueSetDefinition: { value: values },
      valueSettings
    };
  }
  
  static parseRecordTypePicklists(recordTypeNode) {
    const picklistValues = [];
    
    recordTypeNode.querySelectorAll('picklistValues').forEach(pvNode => {
      const picklist = pvNode.querySelector('picklist')?.textContent;
      const values = [];
      
      pvNode.querySelectorAll('values').forEach(valueNode => {
        values.push({
          fullName: valueNode.querySelector('fullName')?.textContent,
          default: valueNode.querySelector('default')?.textContent === 'true'
        });
      });
      
      picklistValues.push({ picklist, values });
    });
    
    return picklistValues;
  }
  
  static async deploy(session, metadataChanges) {
    // Build deployment package (zip file with package.xml + metadata)
    const deployPackage = await this.buildDeployPackage(metadataChanges);
    
    const soapRequest = this.buildDeployRequest(session.sessionId, deployPackage);
    const endpoint = `${session.instanceUrl}/services/Soap/m/${this.METADATA_API_VERSION}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': '""'
      },
      body: soapRequest
    });
    
    if (!response.ok) {
      throw new Error(`Metadata API deploy failed: ${response.status}`);
    }
    
    const xmlText = await response.text();
    return this.parseDeployResponse(xmlText);
  }
  
  static buildDeployRequest(sessionId, base64Package) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader>
      <met:sessionId>${sessionId}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:deploy>
      <met:ZipFile>${base64Package}</met:ZipFile>
      <met:DeployOptions>
        <met:rollbackOnError>true</met:rollbackOnError>
        <met:singlePackage>true</met:singlePackage>
        <met:checkOnly>false</met:checkOnly>
      </met:DeployOptions>
    </met:deploy>
  </soapenv:Body>
</soapenv:Envelope>`;
  }
  
  static parseDeployResponse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    const idNode = xmlDoc.querySelector('id');
    if (!idNode) {
      throw new Error('Failed to get deployment ID');
    }
    
    return idNode.textContent;
  }
  
  static async checkDeployStatus(session, deployId) {
    const soapRequest = this.buildCheckStatusRequest(session.sessionId, deployId);
    const endpoint = `${session.instanceUrl}/services/Soap/m/${this.METADATA_API_VERSION}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': '""'
      },
      body: soapRequest
    });
    
    const xmlText = await response.text();
    return this.parseStatusResponse(xmlText);
  }
  
  static buildCheckStatusRequest(sessionId, deployId) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader>
      <met:sessionId>${sessionId}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:checkDeployStatus>
      <met:asyncProcessId>${deployId}</met:asyncProcessId>
      <met:includeDetails>true</met:includeDetails>
    </met:checkDeployStatus>
  </soapenv:Body>
</soapenv:Envelope>`;
  }
  
  static parseStatusResponse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    const resultNode = xmlDoc.querySelector('result');
    
    return {
      id: resultNode.querySelector('id')?.textContent,
      status: resultNode.querySelector('status')?.textContent,
      done: resultNode.querySelector('done')?.textContent === 'true',
      success: resultNode.querySelector('success')?.textContent === 'true',
      numberComponentsDeployed: resultNode.querySelector('numberComponentsDeployed')?.textContent,
      numberComponentsTotal: resultNode.querySelector('numberComponentsTotal')?.textContent,
      numberComponentErrors: resultNode.querySelector('numberComponentErrors')?.textContent,
      errorMessage: resultNode.querySelector('errorMessage')?.textContent
    };
  }
  
  static async buildDeployPackage(metadataChanges) {
    // This would use JSZip to create the deployment package
    // For now, returning a placeholder
    // In real implementation:
    // 1. Create package.xml
    // 2. Create object metadata files
    // 3. Zip everything
    // 4. Base64 encode
    
    throw new Error('Deploy package building not yet implemented');
  }
}

export default MetadataAPI;
```

### 3.4 Content Script Injector (content/injector.js)

```javascript
// Detect if we're on a Salesforce page
function isSalesforcePage() {
  return window.location.hostname.includes('salesforce.com') ||
         window.location.hostname.includes('force.com');
}

// Inject floating action button
function injectUI() {
  if (document.getElementById('sf-picklist-manager-fab')) {
    return; // Already injected
  }
  
  const fab = document.createElement('div');
  fab.id = 'sf-picklist-manager-fab';
  fab.className = 'sf-pm-fab';
  fab.innerHTML = `
    <button class="sf-pm-fab-button" title="Salesforce Picklist Manager">
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path d="M12 2L2 7v10c0 5.5 3.8 10.7 10 12 6.2-1.3 10-6.5 10-12V7l-10-5z"/>
      </svg>
    </button>
  `;
  
  document.body.appendChild(fab);
  
  // Add click handler
  fab.querySelector('.sf-pm-fab-button').addEventListener('click', openSidePanel);
}

function openSidePanel() {
  // Send message to background to open side panel
  chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
}

// Detect object name from current page
function detectCurrentObject() {
  const url = window.location.href;
  
  // Lightning
  const lightningMatch = url.match(/\/lightning\/[or]\/([^/]+)/);
  if (lightningMatch) {
    return lightningMatch[1];
  }
  
  // Classic
  const classicMatch = url.match(/\/([a-zA-Z0-9_]+)\/o$/);
  if (classicMatch) {
    return classicMatch[1];
  }
  
  return null;
}

// Initialize
if (isSalesforcePage()) {
  injectUI();
  
  // Listen for page changes in SPA
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    const url = window.location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      const objectName = detectCurrentObject();
      if (objectName) {
        chrome.runtime.sendMessage({ 
          action: 'CURRENT_OBJECT_CHANGED', 
          objectName 
        });
      }
    }
  }).observe(document.body, { subtree: true, childList: true });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_CURRENT_OBJECT') {
    sendResponse({ objectName: detectCurrentObject() });
  }
  return true;
});
```

### 3.5 Side Panel UI (sidepanel/index.html)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Salesforce Picklist Manager</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>Picklist Manager</h1>
      <div class="connection-status" id="connectionStatus">
        <span class="status-indicator"></span>
        <span class="status-text">Not Connected</span>
      </div>
    </header>
    
    <nav class="tabs">
      <button class="tab active" data-tab="export">Export</button>
      <button class="tab" data-tab="compare">Compare</button>
      <button class="tab" data-tab="deploy">Deploy</button>
    </nav>
    
    <!-- Export Tab -->
    <div class="tab-content active" id="export-tab">
      <section class="section">
        <h2>Select Objects</h2>
        <div class="object-selector">
          <input type="text" id="objectSearch" placeholder="Search objects...">
          <div class="object-list" id="objectList">
            <!-- Populated dynamically -->
          </div>
          <button id="selectAllObjects">Select All</button>
          <button id="clearSelection">Clear</button>
        </div>
      </section>
      
      <section class="section">
        <h2>Export Options</h2>
        <label>
          <input type="checkbox" id="includeValues" checked> Picklist Values
        </label>
        <label>
          <input type="checkbox" id="includeDependencies" checked> Field Dependencies
        </label>
        <label>
          <input type="checkbox" id="includeRecordTypes" checked> Record Type Mappings
        </label>
      </section>
      
      <button id="exportButton" class="primary-button">Export Selected</button>
      
      <div id="exportResults" class="results"></div>
    </div>
    
    <!-- Compare Tab -->
    <div class="tab-content" id="compare-tab">
      <section class="section">
        <h2>Source Org</h2>
        <div id="sourceOrg" class="org-info">
          <p>Current Org: <span id="sourceOrgName">Loading...</span></p>
        </div>
        <button id="loadSourceData">Load Source Data</button>
      </section>
      
      <section class="section">
        <h2>Target Org</h2>
        <input type="file" id="targetDataFile" accept=".json">
        <p class="help-text">Upload exported JSON from target org</p>
      </section>
      
      <button id="compareButton" class="primary-button">Compare</button>
      
      <div id="compareResults" class="results">
        <!-- Diff viewer populated here -->
      </div>
    </div>
    
    <!-- Deploy Tab -->
    <div class="tab-content" id="deploy-tab">
      <section class="section">
        <h2>Deploy Changes</h2>
        <input type="file" id="deployFile" accept=".json">
        <p class="help-text">Upload modified configuration JSON</p>
      </section>
      
      <section class="section">
        <h2>Preview Changes</h2>
        <div id="deployPreview" class="preview">
          <!-- Preview populated here -->
        </div>
      </section>
      
      <div class="deploy-options">
        <label>
          <input type="checkbox" id="checkOnly"> Validation Only (Check Only)
        </label>
        <label>
          <input type="checkbox" id="rollbackOnError" checked> Rollback on Error
        </label>
      </div>
      
      <button id="deployButton" class="primary-button">Deploy</button>
      
      <div id="deployStatus" class="status">
        <!-- Deploy status updates -->
      </div>
    </div>
  </div>
  
  <script type="module" src="app.js"></script>
</body>
</html>
```

### 3.6 Side Panel Logic (sidepanel/app.js)

```javascript
import ObjectSelector from './components/object-selector.js';
import DependencyViewer from './components/dependency-viewer.js';
import DiffViewer from './components/diff-viewer.js';
import DeployManager from './components/deploy-manager.js';

class PicklistManagerApp {
  constructor() {
    this.selectedObjects = new Set();
    this.currentSession = null;
    this.init();
  }
  
  async init() {
    await this.connectToSalesforce();
    this.setupEventListeners();
    this.setupTabs();
  }
  
  async connectToSalesforce() {
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'GET_SESSION' 
      });
      
      if (response.success) {
        this.currentSession = response.data;
        this.updateConnectionStatus(true);
        await this.loadObjects();
      } else {
        this.updateConnectionStatus(false, response.error);
      }
    } catch (error) {
      console.error('Connection error:', error);
      this.updateConnectionStatus(false, error.message);
    }
  }
  
  updateConnectionStatus(connected, message = '') {
    const statusEl = document.getElementById('connectionStatus');
    const indicator = statusEl.querySelector('.status-indicator');
    const text = statusEl.querySelector('.status-text');
    
    if (connected) {
      indicator.className = 'status-indicator connected';
      text.textContent = `Connected to ${this.currentSession.instanceUrl}`;
    } else {
      indicator.className = 'status-indicator disconnected';
      text.textContent = message || 'Not Connected';
    }
  }
  
  async loadObjects() {
    // Load all custom and standard objects
    const response = await chrome.runtime.sendMessage({
      action: 'GET_OBJECTS'
    });
    
    if (response.success) {
      this.renderObjectList(response.data);
    }
  }
  
  renderObjectList(objects) {
    const listEl = document.getElementById('objectList');
    listEl.innerHTML = '';
    
    objects.forEach(obj => {
      const item = document.createElement('div');
      item.className = 'object-item';
      item.innerHTML = `
        <label>
          <input type="checkbox" value="${obj.name}" data-label="${obj.label}">
          ${obj.label} (${obj.name})
        </label>
      `;
      listEl.appendChild(item);
      
      item.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectedObjects.add(obj.name);
        } else {
          this.selectedObjects.delete(obj.name);
        }
      });
    });
  }
  
  setupEventListeners() {
    // Export button
    document.getElementById('exportButton').addEventListener('click', () => {
      this.handleExport();
    });
    
    // Select all objects
    document.getElementById('selectAllObjects').addEventListener('click', () => {
      document.querySelectorAll('#objectList input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
        this.selectedObjects.add(cb.value);
      });
    });
    
    // Clear selection
    document.getElementById('clearSelection').addEventListener('click', () => {
      document.querySelectorAll('#objectList input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
      });
      this.selectedObjects.clear();
    });
    
    // Compare button
    document.getElementById('compareButton').addEventListener('click', () => {
      this.handleCompare();
    });
    
    // Deploy button
    document.getElementById('deployButton').addEventListener('click', () => {
      this.handleDeploy();
    });
    
    // File upload for deploy preview
    document.getElementById('deployFile').addEventListener('change', (e) => {
      this.previewDeployment(e.target.files[0]);
    });
  }
  
  setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        // Remove active class from all tabs
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        
        // Add active class to clicked tab
        e.target.classList.add('active');
        const tabName = e.target.dataset.tab;
        document.getElementById(`${tabName}-tab`).classList.add('active');
      });
    });
  }
  
  async handleExport() {
    if (this.selectedObjects.size === 0) {
      alert('Please select at least one object');
      return;
    }
    
    const includeValues = document.getElementById('includeValues').checked;
    const includeDependencies = document.getElementById('includeDependencies').checked;
    const includeRecordTypes = document.getElementById('includeRecordTypes').checked;
    
    const resultsEl = document.getElementById('exportResults');
    resultsEl.innerHTML = '<p class="loading">Exporting...</p>';
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'EXPORT_PICKLISTS',
        objects: Array.from(this.selectedObjects),
        options: {
          includeValues,
          includeDependencies,
          includeRecordTypes
        }
      });
      
      if (response.success) {
        this.downloadJSON(response.data, 'picklist-export.json');
        resultsEl.innerHTML = '<p class="success">✓ Export completed successfully</p>';
      } else {
        resultsEl.innerHTML = `<p class="error">Error: ${response.error}</p>`;
      }
    } catch (error) {
      resultsEl.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
  }
  
  async handleCompare() {
    const resultsEl = document.getElementById('compareResults');
    resultsEl.innerHTML = '<p class="loading">Comparing...</p>';
    
    // Implementation for comparison
    // Would use DiffViewer component
  }
  
  async handleDeploy() {
    const checkOnly = document.getElementById('checkOnly').checked;
    const rollbackOnError = document.getElementById('rollbackOnError').checked;
    
    const statusEl = document.getElementById('deployStatus');
    statusEl.innerHTML = '<p class="loading">Deploying...</p>';
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'DEPLOY_CHANGES',
        metadata: this.deploymentData,
        options: { checkOnly, rollbackOnError }
      });
      
      if (response.success) {
        // Poll for status
        await this.pollDeploymentStatus(response.data);
      } else {
        statusEl.innerHTML = `<p class="error">Deploy failed: ${response.error}</p>`;
      }
    } catch (error) {
      statusEl.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
  }
  
  async pollDeploymentStatus(deployId) {
    const statusEl = document.getElementById('deployStatus');
    
    const poll = async () => {
      const response = await chrome.runtime.sendMessage({
        action: 'CHECK_DEPLOY_STATUS',
        deployId
      });
      
      if (response.success) {
        const status = response.data;
        
        statusEl.innerHTML = `
          <p>Status: ${status.status}</p>
          <p>Progress: ${status.numberComponentsDeployed}/${status.numberComponentsTotal}</p>
        `;
        
        if (status.done) {
          if (status.success) {
            statusEl.innerHTML += '<p class="success">✓ Deployment completed successfully</p>';
          } else {
            statusEl.innerHTML += `<p class="error">✗ Deployment failed: ${status.errorMessage}</p>`;
          }
          return;
        }
        
        // Continue polling
        setTimeout(poll, 2000);
      }
    };
    
    poll();
  }
  
  downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  async previewDeployment(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        this.deploymentData = JSON.parse(e.target.result);
        this.renderDeployPreview(this.deploymentData);
      } catch (error) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }
  
  renderDeployPreview(data) {
    const previewEl = document.getElementById('deployPreview');
    
    let html = '<div class="preview-content">';
    
    for (const [objectName, fields] of Object.entries(data)) {
      html += `<h3>${objectName}</h3>`;
      html += '<ul>';
      
      for (const [fieldName, fieldData] of Object.entries(fields)) {
        html += `<li><strong>${fieldName}</strong>`;
        
        if (fieldData.values) {
          html += `<br>Values: ${fieldData.values.length}`;
        }
        
        if (fieldData.valueSettings) {
          html += `<br>Dependencies: ${fieldData.valueSettings.length}`;
        }
        
        html += '</li>';
      }
      
      html += '</ul>';
    }
    
    html += '</div>';
    previewEl.innerHTML = html;
  }
}

// Initialize app
new PicklistManagerApp();
```

---

## 4. Data Flow Diagrams

### 4.1 Export Flow

```
User → Content Script → Background Worker → Session Manager
                                          ↓
                                    Metadata API
                                          ↓
                                Parse & Transform
                                          ↓
                                Side Panel (Display)
                                          ↓
                                Download JSON
```

### 4.2 Deploy Flow

```
User uploads JSON → Side Panel → Background Worker
                                        ↓
                                Validate Changes
                                        ↓
                                Build Deploy Package
                                        ↓
                                Metadata API Deploy
                                        ↓
                                Poll Status (async)
                                        ↓
                                Update UI with Results
```

---

## 5. Key Features Implementation Details

### 5.1 Dependency Matrix Visualization

```javascript
// In dependency-viewer.js component
function renderDependencyMatrix(controllingField, dependentField, mappings) {
  const controllingValues = [...new Set(mappings.map(m => m.controllingValue))];
  const dependentValues = [...new Set(mappings.map(m => m.dependentValue))];
  
  let html = '<table class="dependency-matrix">';
  html += '<thead><tr><th></th>';
  
  controllingValues.forEach(cv => {
    html += `<th>${cv}</th>`;
  });
  
  html += '</tr></thead><tbody>';
  
  dependentValues.forEach(dv => {
    html += `<tr><th>${dv}</th>`;
    
    controllingValues.forEach(cv => {
      const hasMapping = mappings.some(
        m => m.controllingValue === cv && m.dependentValue === dv
      );
      html += `<td class="${hasMapping ? 'active' : ''}">
        ${hasMapping ? '✓' : ''}
      </td>`;
    });
    
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  
  return html;
}
```

### 5.2 Diff Viewer for Comparison

```javascript
// In diff-viewer.js component
function renderDiff(sourceData, targetData) {
  const diff = {
    added: [],
    removed: [],
    modified: []
  };
  
  // Compare picklist values
  for (const [objectName, sourceFields] of Object.entries(sourceData)) {
    const targetFields = targetData[objectName] || {};
    
    for (const [fieldName, sourceField] of Object.entries(sourceFields)) {
      const targetField = targetFields[fieldName];
      
      if (!targetField) {
        diff.added.push({ object: objectName, field: fieldName, data: sourceField });
      } else {
        const changes = compareFields(sourceField, targetField);
        if (changes.length > 0) {
          diff.modified.push({ 
            object: objectName, 
            field: fieldName, 
            changes 
          });
        }
      }
    }
    
    // Check for removed fields
    for (const fieldName of Object.keys(targetFields)) {
      if (!sourceFields[fieldName]) {
        diff.removed.push({ object: objectName, field: fieldName });
      }
    }
  }
  
  return renderDiffUI(diff);
}

function compareFields(source, target) {
  const changes = [];
  
  // Compare values
  const sourceValues = new Set(source.values.map(v => v.fullName));
  const targetValues = new Set(target.values.map(v => v.fullName));
  
  for (const value of sourceValues) {
    if (!targetValues.has(value)) {
      changes.push({ type: 'valueAdded', value });
    }
  }
  
  for (const value of targetValues) {
    if (!sourceValues.has(value)) {
      changes.push({ type: 'valueRemoved', value });
    }
  }
  
  // Compare dependencies
  if (source.valueSettings && target.valueSettings) {
    // Compare mapping differences
    const sourceMappings = new Set(
      source.valueSettings.map(vs => `${vs.controllingFieldValue}:${vs.valueName}`)
    );
    const targetMappings = new Set(
      target.valueSettings.map(vs => `${vs.controllingFieldValue}:${vs.valueName}`)
    );
    
    for (const mapping of sourceMappings) {
      if (!targetMappings.has(mapping)) {
        changes.push({ type: 'dependencyAdded', mapping });
      }
    }
    
    for (const mapping of targetMappings) {
      if (!sourceMappings.has(mapping)) {
        changes.push({ type: 'dependencyRemoved', mapping });
      }
    }
  }
  
  return changes;
}
```

---

## 6. Error Handling & Validation

### 6.1 Session Validation

- Check session validity before each API call
- Auto-refresh if on Salesforce page
- Clear error messages for expired sessions

### 6.2 Deployment Validation

- Validate JSON structure before deployment
- Check for circular dependencies
- Verify all controlling values exist
- Warn about data loss scenarios

### 6.3 API Error Handling

```javascript
class APIErrorHandler {
  static handle(error, context) {
    if (error.message.includes('INVALID_SESSION_ID')) {
      return {
        userMessage: 'Session expired. Please refresh Salesforce.',
        action: 'REFRESH_SESSION'
      };
    }
    
    if (error.message.includes('INSUFFICIENT_ACCESS')) {
      return {
        userMessage: 'Insufficient permissions to access this metadata.',
        action: 'CHECK_PERMISSIONS'
      };
    }
    
    if (error.message.includes('FIELD_INTEGRITY_EXCEPTION')) {
      return {
        userMessage: 'Cannot modify field: data exists that violates the new dependencies.',
        action: 'SHOW_DETAILS',
        details: error.message
      };
    }
    
    return {
      userMessage: `Error: ${error.message}`,
      action: 'LOG_ERROR'
    };
  }
}
```

---

## 7. Security Considerations

- **Cookie Access**: Only access cookies for Salesforce domains
- **Session Storage**: Use chrome.storage.session for temporary session data
- **Content Security Policy**: Implement strict CSP in manifest
- **Input Validation**: Sanitize all user inputs and API responses
- **Permission Scope**: Request minimum necessary permissions

---

## 8. Testing Strategy

### 8.1 Unit Tests

- Session extraction logic
- XML parsing/building
- Dependency analysis
- Diff calculation

### 8.2 Integration Tests

- API communication (mock Salesforce responses)
- Message passing between components
- File upload/download

### 8.3 Manual Testing Checklist

- ✅ Extract session from Lightning and Classic
- ✅ Export single object picklists
- ✅ Export multiple objects
- ✅ Export with dependencies
- ✅ Export with record types
- ✅ Compare two exports
- ✅ Deploy without dependencies
- ✅ Deploy with new dependencies
- ✅ Deploy removing dependencies
- ✅ Handle API errors gracefully
- ✅ Session expiration handling

---

## 9. Future Enhancements

- **Batch Deployment**: Deploy to multiple orgs simultaneously
- **Change History**: Track deployment history
- **Rollback Capability**: Revert to previous configurations
- **Dependency Graph**: Visual graph of all dependencies
- **Templates**: Save common configurations as templates
- **Scheduling**: Schedule deployments
- **Notifications**: Browser notifications for deployment status
- **Translation Support**: Export/import picklist translations
- **Record Type Cloning**: Clone record type configurations
- **Integration with Git**: Version control for configurations

---

## 10. Deployment & Distribution

### 10.1 Chrome Web Store

- Prepare store listing
- Privacy policy
- Screenshots and demo video
- Support documentation

### 10.2 Private Distribution

- Package as .crx for enterprise
- Internal documentation
- Training materials

---

## Conclusion

This architecture provides a solid foundation for building a comprehensive Salesforce picklist management tool. The modular design allows for incremental development and testing of individual components.
