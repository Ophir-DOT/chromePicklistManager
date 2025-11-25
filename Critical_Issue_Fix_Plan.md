# Plan to Remediate Critical Security Issues

**Project:** DOT Toolkit - Salesforce Picklist Manager
**Version:** 1.6.0
**Document Date:** 2025-11-24

## 1. Introduction

This document outlines the execution plan to address the four **Critical** security vulnerabilities identified in the "Immediate Actions" section of the `Summary.md` audit report. The goal is to resolve these issues swiftly to secure the extension for its next release.

The four critical action items are:
1.  Fix Cross-Site Scripting (XSS) vulnerabilities by sanitizing all dynamic data rendered in HTML.
2.  Implement a Content Security Policy (CSP) in `manifest.json` as a defense-in-depth measure.
3.  Remove all logging of sensitive session credentials (Salesforce Session IDs) from the console.
4.  Prevent SOQL Injection by implementing an escaping mechanism for all user-controlled input in queries.

---

## 2. Action Item 1: Fix XSS Vulnerabilities [COMPLETED]

**Issue:** Dynamic data from API responses or user input is inserted directly into `innerHTML` without consistent escaping, creating multiple XSS vulnerabilities.

**Affected Files:**
*   `popup/app.js`
*   `pages/deployment-history/deployment-history.js`
*   All other files using `.innerHTML` with dynamic data.

### Execution Plan

1.  **Centralize the `escapeHtml` Utility:**
    *   The audit notes an `escapeHtml()` function exists in `popup/app.js`.
    *   **Action:** Create a new shared utility file: `shared/utils.js`.
    *   **Action:** Move the `escapeHtml` function into `shared/utils.js` and export it. This ensures it can be imported and used consistently across the extension's contexts (popup, pages, etc.).

    ```javascript
    // shared/utils.js
    export function escapeHtml(unsafe) {
      if (!unsafe) return '';
      return String(unsafe)
           .replace(/&/g, "&amp;")
           .replace(/</g, "&lt;")
           .replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;")
           .replace(/'/g, "&#039;");
    }
    ```

2.  **Audit All `.innerHTML` Assignments:**
    *   **Action:** Perform a global search across the entire codebase for the regex `\.innerHTML\s*=`.
    *   **Action:** Create a checklist of all identified locations (the audit mentioned 30+ occurrences).

3.  **Remediate Vulnerable Code:**
    *   **Action:** For each instance found, analyze if the assignment includes dynamic variables.
    *   **Priority 1 (Safer): Use `textContent`**. If the dynamic data is not intended to be HTML, refactor the code to use `.textContent` instead of `.innerHTML`. This is the most secure method as it treats the string as plain text.

        ```javascript
        // BEFORE (Vulnerable)
        // popup/app.js:2027
        contentEl.innerHTML = `<div class="status-message error">Error: ${error.message}</div>`;

        // AFTER (Secure with textContent)
        const errorDiv = document.createElement('div');
        errorDiv.className = 'status-message error';
        errorDiv.textContent = `Error: ${error.message}`;
        contentEl.innerHTML = ''; // Clear previous content
        contentEl.appendChild(errorDiv);
        ```

    *   **Priority 2 (When HTML is needed): Use `escapeHtml`**. If the dynamic data must be part of an HTML string, wrap the variable with the newly centralized `escapeHtml` function.

        ```javascript
        // popup/app.js
        import { escapeHtml } from '../shared/utils.js';

        // BEFORE (Vulnerable)
        // popup/app.js:206
        listEl.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;

        // AFTER (Secure with escaping)
        listEl.innerHTML = `<div class="error-message">Error: ${escapeHtml(error.message)}</div>`;
        ```

4.  **Verification:**
    *   **Action:** Review every changed line of code to confirm that all dynamic variables passed to `innerHTML` are either escaped or that the code has been refactored to use `textContent`.
    *   **Action:** Manually test the UI by triggering errors or using data that could contain HTML characters (`<`, `>`, `&`) to ensure they are rendered as text and not interpreted as HTML.

---

## 3. Action Item 2: Add Content Security Policy (CSP)

**Issue:** The `manifest.json` file lacks a `content_security_policy`, which is a critical security layer to mitigate XSS and data injection attacks.

**Affected File:** `manifest.json`

### Execution Plan

1.  **Modify `manifest.json`:**
    *   **Action:** Add the `content_security_policy` key to the `manifest.json` file.
    *   **Action:** Use the policy recommended in the audit, which is appropriately configured for the extension's needs (including Google Fonts).

    ```json
    {
      "manifest_version": 3,
      "name": "DOT Toolkit",
      // ... other keys
      "content_security_policy": {
        "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;"
      },
      // ... other keys
    }
    ```

2.  **Verification:**
    *   **Action:** Load the unpacked extension in Chrome.
    *   **Action:** Open the popup UI and navigate through its different views. Check the browser's developer console for any CSP-related errors.
    *   **Action:** Confirm that scripts execute correctly and that the Google Fonts still load as expected.

---

## 4. Action Item 3: Remove Session ID Logging

**Issue:** Sensitive Salesforce session IDs are being logged to the browser console, creating a severe information disclosure risk.

**Affected Files:**
*   `background/session-manager.js`
*   `background/api-client.js`

### Execution Plan

1.  **Audit All `console.log` Statements:**
    *   **Action:** Search for all instances of `console.log` in the specified files that involve a session object or session ID variable (e.g., `session.sessionId`, `sidCookie.value`).

2.  **Remediate Logging Statements:**
    *   **Action:** Remove or refactor every log statement that outputs a full session ID.
    *   **Action:** If a log is necessary for debugging, redact the sensitive part of the token. The recommended approach is to show only a small, non-sensitive portion of the string.

    ```javascript
    // BEFORE (Vulnerable)
    // background/session-manager.js
    console.log('[SessionManager] Session ID:', sidCookie.value);

    // AFTER (Secure)
    // For debugging, log metadata or a redacted version.
    console.log('[SessionManager] Session acquired. ID starts with:', sidCookie.value.substring(0, 10) + '...[REDACTED]');
    console.log('[SessionManager] Session ID length:', sidCookie.value.length);
    ```

3.  **Verification:**
    *   **Action:** After making the changes, run the extension and authenticate to a Salesforce org.
    *   **Action:** Inspect the service worker console and the popup console to confirm that no full session IDs are printed in any logs.

---

## 5. Action Item 4: Implement SOQL Escaping

**Issue:** SOQL queries are constructed using template literals with unescaped variables, creating a risk of SOQL Injection.

**Affected Files:**
*   `background/health-check-api.js`
*   `background/tooling-api.js`

### Execution Plan

1.  **Create a Central SOQL Escaping Utility:**
    *   **Action:** Add a new `escapeSoql` function to the `shared/utils.js` file created in step 1. This function will handle the escaping of single quotes and other special characters.

    ```javascript
    // shared/utils.js
    export function escapeSoql(value) {
      if (value === null || typeof value === 'undefined') return '';
      return String(value).replace(/'/g, "\\'");
    }
    ```

2.  **Refactor All SOQL Query Construction:**
    *   **Action:** Identify all locations where SOQL queries are built using string interpolation.
    *   **Action:** Import the `escapeSoql` function and apply it to every variable that is part of a `WHERE` clause.

    ```javascript
    // background/tooling-api.js
    import { escapeSoql } from '../shared/utils.js';

    // BEFORE (Vulnerable)
    const query = `SELECT Id FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}'`;

    // AFTER (Secure)
    const query = `SELECT Id FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${escapeSoql(objectName)}'`;
    ```

3.  **Verification:**
    *   **Action:** Test the features that rely on these SOQL queries (e.g., fetching field definitions).
    *   **Action:** Manually test with input that includes a single quote (e.g., an object name like `My'Object__c`) to ensure the query does not break and that the input is handled correctly.