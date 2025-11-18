// Detect if we're on a Salesforce page (including setup pages)
function isSalesforcePage() {
  return window.location.hostname.includes('salesforce.com') ||
         window.location.hostname.includes('salesforce-setup.com') ||
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
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7v10c0 5.5 3.8 10.7 10 12 6.2-1.3 10-6.5 10-12V7l-10-5z"/>
      </svg>
    </button>
  `;

  document.body.appendChild(fab);

  // Add click handler
  fab.querySelector('.sf-pm-fab-button').addEventListener('click', openPopup);
}

function openPopup() {
  // The popup will open automatically when user clicks extension icon
  // This could be enhanced to open side panel or custom UI
  chrome.runtime.sendMessage({ action: 'OPEN_POPUP' });
}

// Detect object name and record ID from current page
function detectCurrentObject() {
  const url = window.location.href;

  // Lightning Record Page: /lightning/r/ObjectName/RecordId/view
  const lightningRecordMatch = url.match(/\/lightning\/r\/([^/]+)\/([a-zA-Z0-9]{15,18})\/view/);
  if (lightningRecordMatch) {
    return {
      objectName: lightningRecordMatch[1],
      recordId: lightningRecordMatch[2],
      isRecordPage: true
    };
  }

  // Lightning Object Home: /lightning/o/ObjectName/home
  const lightningHomeMatch = url.match(/\/lightning\/o\/([^/]+)\/home/);
  if (lightningHomeMatch) {
    return {
      objectName: lightningHomeMatch[1],
      recordId: null,
      isRecordPage: false
    };
  }

  // Classic Record Page: /RecordId
  const classicRecordMatch = url.match(/\/([a-zA-Z0-9]{15,18})$/);
  if (classicRecordMatch) {
    // Try to determine object from page structure
    const objectName = detectObjectFromClassicPage();
    if (objectName) {
      return {
        objectName: objectName,
        recordId: classicRecordMatch[1],
        isRecordPage: true
      };
    }
  }

  // Classic Object Home
  const classicMatch = url.match(/\/([a-zA-Z0-9_]+)\/o$/);
  if (classicMatch) {
    return {
      objectName: classicMatch[1],
      recordId: null,
      isRecordPage: false
    };
  }

  return null;
}

// Helper to detect object from Classic page structure
function detectObjectFromClassicPage() {
  // Try to find object name from page title or breadcrumbs
  const breadcrumbs = document.querySelectorAll('.breadcrumb');
  if (breadcrumbs.length > 0) {
    // Parse breadcrumb to find object
    const breadcrumbText = breadcrumbs[0].textContent;
    // This is a fallback - may need enhancement
  }
  return null; // Return null if we can't determine
}

// Initialize
if (isSalesforcePage()) {
  // FAB UI injection disabled - user can access via extension icon
  // injectUI();

  // Listen for page changes in SPA
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    const url = window.location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      const context = detectCurrentObject();
      if (context) {
        chrome.runtime.sendMessage({
          action: 'CURRENT_OBJECT_CHANGED',
          context
        });
      }
    }
  }).observe(document.body, { subtree: true, childList: true });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_CURRENT_OBJECT') {
    sendResponse({ context: detectCurrentObject() });
  }
  return true;
});
