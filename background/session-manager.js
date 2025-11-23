class SessionManager {
  /**
   * Transforms Lightning URLs to My.Salesforce domain format
   * Based on Salesforce Inspector Reloaded's approach
   * Avoids HTTP redirects that would drop Authorization headers
   */
  static getMyDomain(hostname) {
    if (!hostname) return hostname;

    return hostname
      .replace(/\.lightning\.force\.com$/, '.my.salesforce.com') // Transform lightning to my.salesforce
      .replace(/\.mcas\.ms$/, ''); // Remove Microsoft Cloud App Security suffix
  }

  static async extractSession(tab) {
    console.log('[SessionManager] Extracting session from tab:', tab);

    if (!tab || !tab.url) {
      throw new Error('No tab URL provided');
    }

    const url = new URL(tab.url);
    const originalHostname = url.hostname;

    // Transform hostname to handle My Domain
    const hostname = this.getMyDomain(originalHostname);
    const instanceUrl = `${url.protocol}//${hostname}`;

    console.log('[SessionManager] Original hostname:', originalHostname);
    console.log('[SessionManager] Transformed hostname:', hostname);
    console.log('[SessionManager] Instance URL:', instanceUrl);

    // Try to find sid cookie across multiple Salesforce domains
    // This handles cases where users switch between orgs or use different Salesforce domains
    const domains = [
      '', // Try exact URL first
      'salesforce.com',
      'force.com',
      'cloudforce.com',
      'visualforce.com',
      'salesforce.mil',
      'salesforce-setup.com'
    ];

    let sidCookie = null;

    // Try exact URL first
    sidCookie = await chrome.cookies.get({
      url: instanceUrl,
      name: 'sid'
    });

    console.log('[SessionManager] Cookie from exact URL:', !!sidCookie);

    // If not found, search across all cookies with 'sid' name
    if (!sidCookie) {
      console.log('[SessionManager] Searching across all Salesforce domains...');

      for (const domain of domains.slice(1)) { // Skip empty string
        try {
          const cookies = await chrome.cookies.getAll({
            name: 'sid',
            domain: domain,
            secure: true
          });

          console.log(`[SessionManager] Found ${cookies.length} cookies for domain:`, domain);

          if (cookies && cookies.length > 0) {
            // Find cookie that matches current hostname
            sidCookie = cookies.find(c => {
              const cookieDomain = c.domain.replace(/^\./, ''); // Remove leading dot
              const matches =
                hostname.includes(cookieDomain) ||
                cookieDomain.includes(hostname.split('.')[0]); // Match subdomain

              console.log(`[SessionManager] Checking cookie domain ${c.domain} against ${hostname}: ${matches}`);
              return matches;
            });

            if (sidCookie) {
              console.log('[SessionManager] Found matching cookie for domain:', sidCookie.domain);
              break;
            }
          }
        } catch (error) {
          console.warn(`[SessionManager] Error checking domain ${domain}:`, error.message);
        }
      }
    }

    if (!sidCookie) {
      throw new Error('No Salesforce session found. Please log in to Salesforce.');
    }

    console.log('[SessionManager] Session ID length:', sidCookie.value.length);
    console.log('[SessionManager] Session ID format:',
      sidCookie.value.substring(0, 3) === '00D' ? 'Valid (starts with 00D)' : 'Unknown format'
    );

    // Store session info
    const session = {
      sessionId: sidCookie.value,
      instanceUrl: instanceUrl,
      hostname: hostname,
      cookieDomain: sidCookie.domain,
      timestamp: Date.now()
    };

    await chrome.storage.session.set({ currentSession: session });

    console.log('[SessionManager] Session stored successfully');
    return session;
  }

  static async getCurrentSession() {
    // CRITICAL: Always validate against active tab to ensure org isolation
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url) {
        return {
          error: 'NOT_SALESFORCE_TAB',
          message: 'No active tab found. Please open this extension from a Salesforce tab.'
        };
      }

      // Check if current tab is Salesforce
      if (!this.isSalesforceUrl(tab.url)) {
        return {
          error: 'NOT_SALESFORCE_TAB',
          message: 'Please open this extension from a Salesforce tab.'
        };
      }

      // Extract org domain from current tab
      const currentOrgDomain = this.extractOrgDomain(tab.url);

      if (!currentOrgDomain) {
        return {
          error: 'INVALID_URL',
          message: 'Unable to determine Salesforce org from current tab.'
        };
      }

      // Get stored session
      const result = await chrome.storage.session.get('currentSession');

      if (!result.currentSession) {
        // No stored session - extract fresh one from current tab
        console.log('[SessionManager] No stored session, extracting from current tab');
        return await this.extractSession(tab);
      }

      // Validate stored session matches current tab's org
      const storedOrgDomain = this.extractOrgDomain(result.currentSession.instanceUrl);

      if (storedOrgDomain !== currentOrgDomain) {
        console.warn('[SessionManager] ORG MISMATCH DETECTED!');
        console.warn('[SessionManager] Current tab org:', currentOrgDomain);
        console.warn('[SessionManager] Stored session org:', storedOrgDomain);
        console.warn('[SessionManager] Extracting fresh session from current tab');

        // Org mismatch - extract fresh session from current tab
        return await this.extractSession(tab);
      }

      // Check if session is too old (2 hours)
      const sessionAge = Date.now() - result.currentSession.timestamp;
      const twoHours = 2 * 60 * 60 * 1000;

      if (sessionAge > twoHours) {
        console.warn('[SessionManager] Session older than 2 hours, may be expired - refreshing');
        return await this.extractSession(tab);
      }

      console.log('[SessionManager] Using stored session from', new Date(result.currentSession.timestamp).toLocaleTimeString());
      console.log('[SessionManager] Session org:', storedOrgDomain);
      return result.currentSession;
    } catch (error) {
      console.error('[SessionManager] Error in getCurrentSession:', error);
      throw new Error('Failed to get session: ' + error.message);
    }
  }

  /**
   * Check if URL is a Salesforce domain
   */
  static isSalesforceUrl(url) {
    return url && (
      url.includes('.salesforce.com') ||
      url.includes('.salesforce-setup.com') ||
      url.includes('.force.com') ||
      url.includes('.visual.force.com') ||
      url.includes('.cloudforce.com') ||
      url.includes('.salesforce.mil')
    );
  }

  /**
   * Extract org domain from Salesforce URL
   * Returns normalized domain for comparison (e.g., "myorg.my.salesforce.com")
   */
  static extractOrgDomain(url) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      // Normalize: Convert lightning URLs to my.salesforce format
      const normalized = this.getMyDomain(hostname);

      return normalized;
    } catch (error) {
      console.error('[SessionManager] Error extracting org domain from URL:', url, error);
      return null;
    }
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
