# CLAUDE.md - Salesforce Picklist Manager

> **Purpose**: This file provides context and conventions for AI-assisted development of this Chrome extension.

## Project Overview

A Chrome extension for managing Salesforce picklist configurations, field dependencies, and record type assignments across orgs. Built for Salesforce admins and developers at Dot Compliance.

**Target users**: Salesforce administrators managing complex orgs  
**Platform**: Chrome Extension (Manifest V3)  
**Auth model**: Leverages existing Salesforce session cookies—no separate login required

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                         │
├─────────────┬─────────────┬─────────────┬──────────────────────┤
│   Popup     │   Content   │  Background │      Settings        │
│   (UI)      │   Scripts   │   Worker    │       Page           │
├─────────────┴─────────────┴─────────────┴──────────────────────┤
│                     Chrome APIs Layer                           │
│  (storage, tabs, runtime, cookies, commands)                   │
├────────────────────────────────────────────────────────────────┤
│                   Salesforce APIs                               │
│  (REST API, Metadata API, Tooling API)                         │
└────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Location | Purpose |
|-----------|----------|---------|
| Service Worker | `background/service-worker.js` | Central message router, orchestrates all API calls |
| Session Manager | `background/session-manager.js` | Extracts and validates Salesforce sessions from cookies |
| Metadata API | `background/metadata-api.js` | CRUD operations on picklists, dependencies, validation rules |
| Tooling API | `background/tooling-api.js` | Query metadata, flows, validation rules |
| API Client | `background/api-client.js` | Generic REST API wrapper with error handling |
| Content Script | `content/injector.js` | Detects Salesforce pages, extracts session context |
| Popup | `popup/` | Main user interface, 2x2 grid layout |
| Settings | `settings/` | User preferences, theme, update checks |

## File Structure

```
chromePicklistManager/
├── manifest.json              # Extension configuration (Manifest V3)
├── background/
│   ├── service-worker.js      # Message router - ALL external calls go through here
│   ├── session-manager.js     # Session extraction from cookies
│   ├── metadata-api.js        # Salesforce Metadata API integration
│   ├── health-check-api.js    # DOT Health Check logic
│   ├── tooling-api.js         # Salesforce Tooling API
│   ├── api-client.js          # Base REST client
│   ├── update-checker.js      # GitHub release monitoring
│   └── storage-manager.js     # chrome.storage wrapper
├── content/
│   ├── injector.js            # Salesforce page detection
│   └── styles.css             # Content script styles
├── popup/
│   ├── index.html             # Main popup UI
│   ├── app.js                 # Popup logic
│   └── styles.css             # Popup styles
├── pages/                     # Full-page tools (opened in new tabs)
│   ├── approval-process-check/
│   ├── batch-jobs/
│   ├── deployment-history/
│   ├── export-fields/
│   ├── health-check/
│   ├── org-compare/
│   ├── permission-compare/
│   ├── picklist-management/
│   ├── record-migrator/
│   └── validation-rules/
├── settings/
│   ├── settings.html
│   ├── settings.js
│   └── settings.css
├── icons/
├── lib/
│   └── jszip.min.js           # ZIP creation for deployments
├── doc/                       # Documentation files (plans, guides, status)
│   ├── plan/                  # Implementation plans
│   ├── status/                # Status updates
│   ├── progress/              # Progress reports
│   ├── guide/                 # Testing/user guides
│   └── feature/               # Feature specifications
└── tests/
    ├── fixtures/              # Playwright extension fixtures
    ├── e2e/                   # End-to-end tests
    └── mocks/                 # Mock API responses
```

## Coding Conventions

### JavaScript Style

```javascript
// Use async/await, not callbacks
// ✅ Do this
async function fetchObjects(session) {
  const response = await apiClient.get(session, '/services/data/v59.0/sobjects');
  return response.sobjects;
}

// ❌ Not this
function fetchObjects(session, callback) {
  apiClient.get(session, '/services/data/v59.0/sobjects', function(response) {
    callback(response.sobjects);
  });
}
```

```javascript
// Use descriptive function names that indicate action
// ✅ Do this
async function exportPicklistValuesToCSV(objectName, fieldName) { }
async function deployMetadataChanges(session, packageXml) { }

// ❌ Not this
async function process(obj, field) { }
async function doIt(session, data) { }
```

```javascript
// Destructure message parameters in handlers
// ✅ Do this
case 'EXPORT_PICKLIST':
  const { objectName, fieldName } = request.payload;
  return await exportPicklist(objectName, fieldName);

// ❌ Not this
case 'EXPORT_PICKLIST':
  return await exportPicklist(request.payload.objectName, request.payload.fieldName);
```

### Message Passing Pattern

All communication between popup/content scripts and background uses this pattern:

```javascript
// Sending a message (from popup or content script)
const response = await chrome.runtime.sendMessage({
  action: 'ACTION_NAME',
  payload: { /* data */ }
});

if (response.success) {
  // Handle success
} else {
  // Handle error: response.error contains the message
}

// Handling in service-worker.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true; // Required for async response
});
```

### Standard Response Format

```javascript
// Success response
{ success: true, data: { /* result */ } }

// Error response
{ success: false, error: 'Human-readable error message' }
```

### Error Handling

```javascript
// Always wrap API calls in try-catch with contextual errors
async function getObjectFields(session, objectName) {
  try {
    const url = `${session.instanceUrl}/services/data/v59.0/sobjects/${objectName}/describe`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${session.accessToken}` }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to describe ${objectName}: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`[getObjectFields] Error for ${objectName}:`, error);
    throw error; // Re-throw for caller to handle
  }
}
```

### CSS Conventions

```css
/* Use CSS custom properties for theming */
:root {
  --dot-purple: #6B3FA0;
  --dot-pink: #E91E63;
  --bg-primary: #ffffff;
  --text-primary: #1a1a2e;
}

[data-theme="dark"] {
  --bg-primary: #1a1a2e;
  --text-primary: #e0e0e0;
}

/* Use semantic class names */
.export-button { }      /* ✅ */
.btn-primary-action { } /* ✅ */
.blue-btn { }           /* ❌ */
```

### HTML Conventions

```html
<!-- Use data attributes for JS hooks, classes for styling -->
<button class="action-button" data-action="export" data-object="Account">
  Export
</button>

<!-- Accessible labels -->
<input type="text" id="search-field" aria-label="Search objects">
<label for="search-field" class="visually-hidden">Search objects</label>
```

## Salesforce API Patterns

### Session Object Structure

```javascript
const session = {
  instanceUrl: 'https://mydomain.my.salesforce.com',
  accessToken: 'session_id_from_cookie',
  orgId: '00D...',
  userId: '005...'
};
```

### API Version

Use API version **v59.0** for all REST calls. Defined in `api-client.js`.

### Common API Calls

```javascript
// Query records
GET /services/data/v59.0/query?q=SELECT+Id,Name+FROM+Account

// Describe object
GET /services/data/v59.0/sobjects/Account/describe

// Tooling API query
GET /services/data/v59.0/tooling/query?q=SELECT+Id+FROM+ValidationRule

// Metadata API (SOAP-based, use metadata-api.js helpers)
metadataApi.read(session, 'CustomObject', ['Account']);
metadataApi.deploy(session, zipBase64);
```

## Chrome Extension Patterns

### Storage Usage

```javascript
// Use chrome.storage.local for large/temporary data
await chrome.storage.local.set({ cachedObjects: objects });

// Use chrome.storage.sync for user preferences (syncs across devices)
await chrome.storage.sync.set({ theme: 'dark', autoRefresh: true });
```

### Opening Full-Page Tools

```javascript
// Open tool in new tab
chrome.tabs.create({
  url: chrome.runtime.getURL('pages/health-check/health-check.html')
});
```

### Keyboard Shortcuts

Defined in `manifest.json` under `commands`. Current shortcuts:
- `Ctrl+Shift+E`: Export Picklists
- `Ctrl+Shift+L`: Picklist Loader
- `Ctrl+Shift+H`: Health Check
- `Ctrl+Shift+F`: Check Share Files
- `Ctrl+Shift+B`: Batch Monitor

## Testing

### Running Tests

```bash
npm test              # Run all E2E tests (headed mode)
npm run test:ui       # Interactive test UI
npm run test:debug    # Debug mode
```

### Writing Tests

```javascript
// tests/e2e/example.spec.js
import { test, expect } from '../fixtures/extension';

test('should export picklist values', async ({ page, extensionId }) => {
  // Navigate to a Salesforce page (mocked)
  await page.goto('https://test.salesforce.com');
  
  // Open extension popup
  await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
  
  // Interact and assert
  await page.click('[data-action="export-picklist"]');
  await expect(page.locator('.success-message')).toBeVisible();
});
```

### Mock Data Location

Place mock API responses in `tests/mocks/`. Match Salesforce API response structure exactly.

## Common Tasks

### Adding a New Tool

1. Create folder: `pages/new-tool/`
2. Add HTML, JS, CSS files
3. Add button/link in `popup/index.html`
4. Add message handler in `background/service-worker.js`
5. Add keyboard shortcut in `manifest.json` (optional)
6. Update README.md feature list

### Adding a New API Integration

1. Create module in `background/` (e.g., `new-api.js`)
2. Import and use in `service-worker.js`
3. Add message action constant
4. Document the API endpoint and response format

### Modifying Theme

1. Update CSS variables in the relevant stylesheet
2. Ensure both light and dark mode values are set
3. Test with system preference toggle

### Documentation Files

**IMPORTANT**: All markdown documentation files (except `README.md` and `CLAUDE.md`) must be placed in the `doc/` folder with appropriate sub-folders based on document type.

**Folder Structure**:
```
doc/
├── plan/           # Implementation plans, feature designs
├── status/         # Status updates, progress tracking
├── progress/       # Development progress reports
├── guide/          # Testing guides, user guides, how-tos
├── feature/        # Feature specifications, requirements
└── archive/        # Completed/outdated documentation
```

**Naming Conventions**:
- Use SCREAMING_SNAKE_CASE for document names: `FEATURE_NAME_TYPE.md`
- Examples:
  - `doc/plan/RECORD_MIGRATOR_PLAN.md`
  - `doc/status/RECORD_MIGRATOR_STATUS.md`
  - `doc/guide/RECORD_MIGRATOR_TESTING_GUIDE.md`
  - `doc/feature/STATE_REMAPPING_FEATURE.md`

**When Creating Documentation**:
1. Determine the document type (plan, status, guide, feature, etc.)
2. Create in appropriate sub-folder under `doc/`
3. If sub-folder doesn't exist, create it
4. Never place `.md` files in project root (except README.md, CLAUDE.md, CHANGELOG.md)

**Exceptions** (files that stay in root):
- `README.md` - Project overview
- `CLAUDE.md` - AI development context
- `CHANGELOG.md` - Version history

### Version Management

**IMPORTANT**: The extension version is managed in a **single source of truth** to prevent inconsistencies.

**Version Location**:
- ✅ **manifest.json** (line 4): `"version": "X.Y.Z"` - **SINGLE SOURCE OF TRUTH**
- ✅ **popup/index.html**: Footer displays version **dynamically** from manifest via JavaScript
- ✅ **CHANGELOG.md**: Update with release notes when bumping version

**When Creating a New Version/Branch**:

1. **Update manifest.json ONLY**:
   ```json
   {
     "version": "1.6.0"  // Change this line only
   }
   ```

2. **DO NOT manually update**:
   - ❌ popup/index.html footer (auto-populated via `chrome.runtime.getManifest()`)
   - ❌ Any other hardcoded version strings

3. **Update CHANGELOG.md**:
   - Add new version section with release notes
   - Document all new features, fixes, and technical changes

4. **Verify**:
   - Load extension in Chrome
   - Open popup - version should display correctly in footer
   - Check `chrome.runtime.getManifest().version` returns correct version

**Implementation Details**:
- `popup/app.js` contains `displayVersion()` function that reads version from manifest
- Function is called on DOMContentLoaded
- Footer element is automatically populated: `<small>v${manifest.version}</small>`

**Why This Approach**:
- Single source of truth prevents version drift
- Chrome Extension API provides `chrome.runtime.getManifest()` for accessing manifest
- No need to maintain duplicate version strings across files
- Automatic consistency between manifest and UI display

## Security Requirements

- **Never** store credentials—always use session cookies
- **Never** make requests to non-Salesforce/GitHub domains
- Validate all user input before API calls
- Sanitize HTML when displaying API responses
- Use CSP-compliant patterns (no inline scripts in HTML)

## Permissions Rationale

| Permission | Reason |
|------------|--------|
| `cookies` | Read Salesforce session cookie (sid) |
| `storage` | Store user preferences and cached data |
| `tabs` | Detect active Salesforce tabs, open tool pages |
| `activeTab` | Get current tab URL for session context |
| `scripting` | Inject content scripts dynamically |
| `host_permissions: *.salesforce.com, *.force.com` | API calls to Salesforce |
| `host_permissions: api.github.com` | Check for updates |

## Debugging Tips

1. **Background script console**: `chrome://extensions/` → Find extension → "Inspect views: service worker"
2. **Content script console**: Open DevTools on Salesforce page, filter by extension name
3. **Storage inspection**: DevTools → Application → Extension Storage
4. **Network requests**: Background service worker DevTools → Network tab

## Do Not

- ❌ Use `eval()` or `new Function()` (CSP violation)
- ❌ Store session tokens in localStorage (security risk)
- ❌ Make synchronous XHR requests (deprecated, blocks UI)
- ❌ Use Manifest V2 patterns (deprecated)
- ❌ Inline event handlers in HTML (`onclick="..."`)
- ❌ Hardcode Salesforce instance URLs
- ❌ Skip error handling on API calls
- ❌ Deploy to production without sandbox testing

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## Questions?

If you're unsure about a pattern or approach:
1. Check existing code for similar implementations
2. Refer to [Chrome Extension docs](https://developer.chrome.com/docs/extensions/mv3/)
3. Refer to [Salesforce API docs](https://developer.salesforce.com/docs/apis)