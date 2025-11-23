// Salesforce API Client - Makes authenticated calls using XMLHttpRequest with Bearer token
// Based on Salesforce Inspector Reloaded's proven approach

import SessionManager from './session-manager.js';

class SalesforceAPI {
  /**
   * Makes an authenticated REST API call to Salesforce
   * @param {string} endpoint - The API endpoint (e.g., '/services/data/v59.0/sobjects')
   * @param {object} options - Request options
   * @param {string} options.method - HTTP method (GET, POST, PUT, DELETE, PATCH)
   * @param {object} options.body - Request body for POST/PUT/PATCH
   * @param {object} options.headers - Additional headers
   * @returns {Promise<any>} - Parsed JSON response
   */
  async callAPI(endpoint, { method = 'GET', body = null, headers = {} } = {}) {
    // Get current session
    const session = await SessionManager.getCurrentSession();

    // Check for error response from SessionManager
    if (!session || session.error) {
      const errorMessage = session?.message || 'No active Salesforce session. Please open this extension from a Salesforce tab.';
      throw new Error(errorMessage);
    }

    if (!session.sessionId) {
      throw new Error('Invalid session: missing session ID.');
    }

    // Build full URL
    const fullUrl = new URL(endpoint, session.instanceUrl);

    // Build headers - THIS IS THE CRITICAL FIX
    // Service workers (Manifest V3) use fetch() but FROM EXTENSION CONTEXT
    // which allows us to set Authorization headers
    const fetchHeaders = {
      'Authorization': 'Bearer ' + session.sessionId,
      'Accept': 'application/json; charset=UTF-8',
      'Content-Type': 'application/json; charset=UTF-8',
      'Sforce-Call-Options': 'client=Salesforce Picklist Manager',
      ...headers
    };

    // Build fetch options
    const fetchOptions = {
      method,
      headers: fetchHeaders
    };

    // Add body for non-GET requests
    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    // CRITICAL: Must use XMLHttpRequest, not fetch()!
    // Extension pages (popup, sidepanel) can use XMLHttpRequest for cross-origin requests
    // but fetch() is still subject to CORS restrictions even in extension context
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, fullUrl.toString(), true);

      // Set headers
      xhr.setRequestHeader('Authorization', 'Bearer ' + session.sessionId);
      xhr.setRequestHeader('Accept', 'application/json; charset=UTF-8');
      xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
      xhr.setRequestHeader('Sforce-Call-Options', 'client=Salesforce Picklist Manager');

      // Add any additional headers
      for (const [name, value] of Object.entries(headers)) {
        xhr.setRequestHeader(name, value);
      }

      // Set response type
      xhr.responseType = 'json';

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else if (xhr.status === 401) {
            const error = new Error('Session expired or invalid. Please refresh the Salesforce page and try again.');
            error.code = 'SESSION_EXPIRED';
            reject(error);
          } else if (xhr.status === 403) {
            const error = new Error('Access denied. Check your Salesforce permissions.');
            error.code = 'ACCESS_DENIED';
            reject(error);
          } else if (xhr.status === 0) {
            reject(new Error('Network error or CORS issue. Make sure you are logged into Salesforce.'));
          } else {
            const errorMessage = xhr.response
              ? JSON.stringify(xhr.response)
              : xhr.statusText;
            reject(new Error(`API Error ${xhr.status}: ${errorMessage}`));
          }
        }
      };

      xhr.onerror = () => {
        console.error('[SalesforceAPI] XHR error event');
        reject(new Error('Network error. Check your internet connection.'));
      };

      xhr.ontimeout = () => {
        console.error('[SalesforceAPI] XHR timeout');
        reject(new Error('Request timeout.'));
      };

      // Set timeout (30 seconds)
      xhr.timeout = 30000;

      // Send request
      try {
        if (body && method !== 'GET') {
          xhr.send(JSON.stringify(body));
        } else {
          xhr.send();
        }
      } catch (error) {
        console.error('[SalesforceAPI] Send error:', error);
        reject(error);
      }
    });
  }

  /**
   * Get all Salesforce objects
   * @returns {Promise<Array>} Array of objects with name, label, custom properties
   */
  async getObjects() {
    const response = await this.callAPI('/services/data/v59.0/sobjects');

    if (!response || !response.sobjects) {
      throw new Error('Invalid response from Salesforce API');
    }

    return response.sobjects.map(obj => ({
      name: obj.name,
      label: obj.label,
      custom: obj.custom
    }));
  }

  /**
   * Get object metadata including picklist fields
   * @param {string} objectName - API name of the object (e.g., 'Account')
   * @returns {Promise<object>} Object metadata
   */
  async getObjectMetadata(objectName) {
    const response = await this.callAPI(`/services/data/v59.0/sobjects/${objectName}/describe`);
    return response;
  }

  /**
   * Execute a SOQL query
   * @param {string} soql - The SOQL query
   * @returns {Promise<object>} Query results
   */
  async query(soql) {
    const encodedQuery = encodeURIComponent(soql);
    const response = await this.callAPI(`/services/data/v59.0/query?q=${encodedQuery}`);
    return response;
  }

  /**
   * Make a SOAP API call (for Metadata API)
   * @param {string} soapEnvelope - The SOAP XML envelope
   * @returns {Promise<string>} XML response
   */
  async soapCall(soapEnvelope) {
    const session = await SessionManager.getCurrentSession();
    const endpoint = '/services/Soap/m/59.0';
    const fullUrl = new URL(endpoint, session.instanceUrl);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', fullUrl.toString(), true);

      xhr.setRequestHeader('Content-Type', 'text/xml; charset=UTF-8');
      xhr.setRequestHeader('SOAPAction', '""');
      xhr.responseType = 'text';

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else {
            reject(new Error(`SOAP Error ${xhr.status}: ${xhr.statusText}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.timeout = 30000;

      xhr.send(soapEnvelope);
    });
  }
}

// Export singleton instance
export default new SalesforceAPI();
