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
  // FAB UI injection disabled - user can access via extension icon
  // injectUI();

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
