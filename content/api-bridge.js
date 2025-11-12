// ⚠️ DEPRECATED: This file is no longer used
//
// API Bridge: Makes authenticated API calls from within the Salesforce page context
// This script has access to the page's cookies and session
//
// REPLACED BY: background/api-client.js
// The new approach uses XMLHttpRequest from the extension context with
// Authorization: Bearer ${sessionId} headers, which is more reliable.
//
// This file is kept for reference only.

(function() {
  console.log('[API Bridge] Initialized');

  // Listen for API requests from the extension
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'BRIDGE_API_CALL') {
      console.log('[API Bridge] Received API call request:', request.endpoint);
      makeAuthenticatedCall(request.endpoint, request.method || 'GET', request.body)
        .then(data => {
          console.log('[API Bridge] API call successful');
          sendResponse({ success: true, data });
        })
        .catch(error => {
          console.error('[API Bridge] API call failed:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response
    }
  });

  async function makeAuthenticatedCall(endpoint, method = 'GET', body = null) {
    // Get the base URL from current page
    const baseUrl = `${window.location.protocol}//${window.location.hostname}`;
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

    console.log('[API Bridge] Making request to:', url);

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include' // Include cookies
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API call failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }
})();
