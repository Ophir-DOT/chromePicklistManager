# Phase 4: Record Migrator - Detailed Task Breakdown

## Overview
Build a record migration tool to migrate records (with child records) between two Salesforce environments. The tool will handle parent-child relationships and ensure data integrity during migration.

## Architecture Pattern
Following existing patterns from Org Compare and Dependency Loader:
- **Full-page tool**: `pages/record-migrator/` directory
- **Multi-org pattern**: Scan tabs for active Salesforce sessions (like Org Compare)
- **Service worker handlers**: Background API orchestration
- **Progress tracking**: Real-time status updates with loading states
- **CSV export**: Migration log export functionality

---

## Implementation Status

**Phase 1: Foundation** ⏳ In Progress
**Phase 2: Org Management** ⏸️ Pending
**Phase 3: Record Selection** ⏸️ Pending
**Phase 4: Relationships** ⏸️ Pending
**Phase 5: Core Migration** ⏸️ Pending
**Phase 6: Field Mapping** ⏸️ Pending
**Phase 7: Progress & Logging** ⏸️ Pending
**Phase 8: Polish & Testing** ⏸️ Pending

---

## Technical Dependencies

### Required APIs
- **REST API v59.0**: Object describe, SOQL queries
- **SObject Collection API**: Batch upsert (POST /composite/sobjects)
- **Composite Tree API**: Parent-child upsert (POST /composite/tree/{Object})

### Required Chrome Extension Components
- `chrome.tabs.query()` - Scan for active Salesforce tabs
- `chrome.runtime.sendMessage()` - UI ↔ Service Worker communication
- `chrome.storage.session` - Temporary session storage

### Existing Modules to Reuse
- `background/api-client.js` - REST API calls
- `background/session-manager.js` - Session extraction
- `background/org-compare-api.js` - Multi-org session detection pattern
- `shared/utils.js` - HTML escaping, CSV parsing

---

## Success Criteria

✅ User can select source and target orgs from active tabs
✅ User can search and select parent records
✅ User can choose which child relationships to include
✅ Parent records are upserted to target org with new IDs
✅ Child records are upserted with correct parent references
✅ Real-time progress updates displayed
✅ Migration log exported to CSV
✅ Errors handled gracefully with clear messages
✅ Works in both light and dark modes
✅ No security vulnerabilities (session handling, input validation)

---

## Critical Files

**New Files to Create:**
- `pages/record-migrator/record-migrator.html` (UI)
- `pages/record-migrator/record-migrator.js` (Client logic)
- `pages/record-migrator/record-migrator.css` (Styling)
- `background/record-migrator-api.js` (Core migration logic)

**Files to Modify:**
- `manifest.json` (add new files, keyboard shortcut)
- `popup/index.html` (add button)
- `popup/app.js` (add button handler)
- `background/service-worker.js` (add message handlers)

---

See the full detailed plan in the Claude plans directory.
