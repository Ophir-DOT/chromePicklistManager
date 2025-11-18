# TODO - Feature Roadmap

This document outlines planned features and enhancements for the Salesforce Picklist Manager Chrome Extension.

---

## 🎯 High Priority (P0) - Requested Features

### 1. Dependency Loader
**Description**: Export and import picklist field dependencies, similar to the current picklist value export/import functionality.

**Features**:
- Export field dependencies to CSV format
- Import dependencies from CSV
- Handle controlling/dependent field relationships
- Manage record type specific picklist value assignments
- Preview changes before deployment
- Deploy via Metadata API

**Technical Approach**:
- Use Metadata API `readMetadata` to read CustomObject with field dependencies
- Parse `valueSettings` for controlling/dependent relationships
- Parse `recordTypePicklists` for record type assignments
- Build CustomObject XML with updated `valueSettings`
- Deploy using existing Metadata API deployment pattern

**API Requirements**:
- Metadata API (SOAP) - already implemented
- CustomObject metadata type

**Complexity**: Medium
**Status**: Not Started

---

### 2. Layout Field Extraction
**Description**: Export all fields present on a Salesforce page layout, useful for documentation and impact analysis.

**Features**:
- Select an object and layout name
- Export all fields on the layout to CSV
- Include field metadata (API name, label, type, required, readonly)
- Support for different layout types (standard, custom)
- Include section names and field positioning

**Technical Approach**:
- Use Metadata API to read Layout metadata
- Parse layout XML to extract field references
- Use REST API describe to get field details
- Generate CSV with layout structure and field metadata

**CSV Format**:
```
Object,Layout Name,Section,Field API Name,Field Label,Field Type,Required,Readonly
Account,Account Layout,Account Information,Name,Account Name,string,true,false
```

**API Requirements**:
- Metadata API for reading Layout metadata
- REST API `/describe` for field details

**Complexity**: Medium
**Status**: Not Started

---

### 3. Document Revision Sharing Query Helper
**Description**: When viewing Document Revision records, automatically generate ContentVersion sharing queries based on PDF_ID and FILE_ID fields.

**Features**:
- Detect when on ContentDocumentLink or ContentVersion pages
- Extract PDF_ID and FILE_ID from current Document Revision record
- Auto-generate query: `SELECT Id, Title, FileType, OwnerId, CreatedDate FROM ContentVersion WHERE Id IN ('PDF_ID', 'FILE_ID')`
- Query ContentDocumentLink for sharing information
- Display results in popup or copy to clipboard
- Option to execute query and show results

**Technical Approach**:
- Content script detects object type from URL
- Extract field values from page DOM or via REST API
- Build dynamic SOQL query with ID values
- Execute query via REST API `/query` endpoint
- Display results in formatted table
- Join with ContentDocumentLink to show sharing

**Example Query Flow**:
```javascript
// Step 1: Get PDF_ID and FILE_ID from Document Revision
const revisionId = 'a1B3t000000XYZ';
const pdfId = 'extractedPdfId';
const fileId = 'extractedFileId';

// Step 2: Query ContentVersion
SELECT Id, Title, FileType, ContentDocumentId, OwnerId
FROM ContentVersion
WHERE Id IN ('pdfId', 'fileId')

// Step 3: Query ContentDocumentLink for sharing
SELECT ContentDocumentId, LinkedEntityId, ShareType, Visibility
FROM ContentDocumentLink
WHERE ContentDocumentId IN (contentDocumentIds)
```

**API Requirements**:
- REST API `/query` for SOQL execution
- DOM parsing or REST API for field extraction

**Complexity**: Medium
**Status**: Not Started

---

## 🔧 Medium Priority (P1) - Core Enhancements

### 4. Global Value Set Management
**Description**: Support for exporting and importing Salesforce Global Value Sets.

**Features**:
- List all Global Value Sets in org
- Export global value set values to CSV
- Import and update global value sets
- Show which fields use each global value set
- Preview impact of changes

**API Requirements**:
- Metadata API - GlobalValueSet type
- Tooling API for usage queries

**Complexity**: Medium
**Status**: Not Started

---

### 5. Field Usage Analytics
**Description**: Analyze which picklist values are actually being used in records.

**Features**:
- Query records to count usage per picklist value
- Identify unused values (0 record count)
- Show percentage distribution of values
- Export usage report to CSV
- Filter by date range or record type

**Technical Approach**:
- Build dynamic SOQL with GROUP BY on picklist field
- Use Aggregate Query API for counts
- Handle large data volumes with query batching

**API Requirements**:
- REST API `/query` with GROUP BY
- Aggregate function support

**Complexity**: Medium
**Status**: Not Started

---

### 6. Bulk Field Operations
**Description**: Update multiple picklist fields across multiple objects in a single operation.

**Features**:
- Upload CSV with multiple objects/fields
- Bulk preview all changes
- Single deployment for all changes
- Progress tracking for large operations

**Complexity**: Large
**Status**: Not Started

---

### 7. Deployment Validation Mode
**Description**: Test deployments before actually committing changes.

**Features**:
- Deploy with `checkOnly: true` flag
- Show validation results and warnings
- Allow user to confirm after successful validation
- Display test coverage and deployment errors

**API Requirements**:
- Metadata API deploy with checkOnly parameter

**Complexity**: Small
**Status**: Not Started

---

### 8. Deployment Rollback
**Description**: Undo the last deployment made through the extension.

**Features**:
- Store deployment history with before/after states
- One-click rollback to previous state
- Preview rollback changes
- Limit to last N deployments

**Complexity**: Medium
**Status**: Not Started

---

## 🎨 Low Priority (P2) - UX Improvements

### 9. Side Panel UI
**Description**: Use Chrome's Side Panel API for persistent interface while browsing Salesforce.

**Features**:
- Always-visible panel alongside Salesforce pages
- Quick access to all features
- Context-aware based on current page
- Better for multi-step workflows

**API Requirements**:
- Chrome Side Panel API (Manifest V3)

**Complexity**: Medium
**Status**: Not Started

---

### 10. Context Menu Integration
**Description**: Right-click context menus on Salesforce pages for quick actions.

**Features**:
- Right-click on field to export picklist values
- Right-click on object to export all picklists
- Quick copy field API name
- Copy SOQL queries

**API Requirements**:
- Chrome Context Menus API

**Complexity**: Small
**Status**: Not Started

---

### 11. Auto-Detect Current Object/Field
**Description**: Automatically populate object and field selections based on current Salesforce page.

**Features**:
- Parse URL to detect object type
- Parse page DOM to detect field name
- Pre-fill export/update forms
- Show "Use Current Object" button

**Complexity**: Small
**Status**: Not Started

---

### 12. Dark Mode Theme
**Description**: Add dark mode support for the extension popup.

**Features**:
- Toggle between light/dark themes
- Persist user preference
- Match Salesforce theme if possible
- Smooth theme transitions

**Complexity**: Small
**Status**: Not Started

---

### 13. Keyboard Shortcuts
**Description**: Power user navigation with keyboard shortcuts.

**Features**:
- Quick open with Ctrl+Shift+P
- Navigate views with arrow keys
- Quick export with hotkeys
- Customizable shortcuts

**API Requirements**:
- Chrome Commands API

**Complexity**: Small
**Status**: Not Started

---

### 14. Field/Object Favorites
**Description**: Save frequently used objects and fields for quick access.

**Features**:
- Star favorite objects
- Quick access list in main menu
- Recently used objects
- Export favorites list

**Complexity**: Small
**Status**: Not Started

---

## 🚀 Future Ideas (P3)

### 15. Picklist Value Reordering
**Description**: Change the order of picklist values.

**Complexity**: Medium
**Status**: Idea

---

### 16. Translation Workbench Support
**Description**: Export and import picklist value translations for multiple languages.

**Complexity**: Large
**Status**: Idea

---

### 17. Default Value Management
**Description**: Set and update default picklist values.

**Complexity**: Small
**Status**: Idea

---

### 18. Restricted Picklist Toggle
**Description**: Enable/disable restricted picklist mode for fields.

**Complexity**: Small
**Status**: Idea

---

### 19. Field-Level Security Export
**Description**: Export field permissions across profiles and permission sets.

**Complexity**: Large
**Status**: Idea

---

### 20. SOQL Query Builder
**Description**: Visual query builder for picklist analysis queries.

**Complexity**: Large
**Status**: Idea

---

### 21. Deployment History Dashboard
**Description**: Visual dashboard showing all deployments made via extension with filtering and search.

**Complexity**: Medium
**Status**: Idea

---

### 22. Batch Export All Org Picklists
**Description**: Background job to export all picklist fields in the entire org at once.

**Complexity**: Large
**Status**: Idea

---

### 23. Org Comparison Tool Enhancement
**Description**: Full comparison between two orgs with diff visualization and sync capabilities.

**Complexity**: Large
**Status**: Idea

---

### 24. Export Format Options
**Description**: Support additional export formats (JSON, Excel, XML).

**Complexity**: Medium
**Status**: Idea

---

### 25. Controlling Field Dependency Creator
**Description**: Create new field dependencies, not just read existing ones.

**Complexity**: Large
**Status**: Idea

---

## 📋 Implementation Notes

### Development Priorities
1. **P0 Features**: Immediate user requests - implement first
2. **P1 Features**: High-value enhancements that improve core functionality
3. **P2 Features**: Quality of life improvements for better UX
4. **P3 Features**: Nice-to-have features for future consideration

### Technical Considerations
- Maintain compatibility with Manifest V3
- Continue using XMLHttpRequest pattern for API calls
- Follow existing modular architecture (background/popup/content)
- Use existing Metadata API deployment patterns
- Add comprehensive error handling
- Update CHANGELOG.md for each feature release

### Testing Requirements
- Test on both Lightning and Classic
- Test with different Salesforce editions
- Validate Metadata API XML generation
- Test deployment rollback scenarios
- Cross-browser testing (Chrome, Edge)

---

## 🤝 Contributing

If you'd like to contribute to any of these features:
1. Pick a feature from the list
2. Comment on or create an issue
3. Submit a PR with your implementation
4. Update this TODO with implementation notes

---

## 🎯 Version 1.2 - Planned Features

### Progressive DOT Health Check (P0)
**Description**: Transform the DOT Health Check from a blocking operation into a progressive, real-time experience with dynamic UI updates.

**Current Behavior**:
- User clicks "DOT Health Check" button
- Loading overlay blocks popup ("Running DOT Health Check - Please wait...")
- All 8 checks run in parallel in background
- User waits (potentially 10+ seconds for slow queries)
- New tab opens with complete results all at once

**New Behavior**:
- User clicks "DOT Health Check" button
- Health check tab opens immediately with all 8 tiles in "loading" state
- Checks execute progressively (individually or in batches)
- Each tile updates dynamically as its check completes
- Real-time progress indicator shows "X of 8 checks complete"
- PDF download enabled once all checks finish

**Benefits**:
- ✅ Instant visual feedback (tab opens immediately)
- ✅ Fast checks display results in 1-2 seconds
- ✅ Users see progress in real-time
- ✅ Better handling of slow queries (Data Migration check can take 5-10+ seconds)
- ✅ More engaging and professional UX
- ✅ Improved perceived performance

**Technical Implementation**:
1. Create `health-check/health-check.html` - Static page with 8 check tiles
2. Create `health-check/health-check.js` - Progressive loading logic with chrome.runtime.sendMessage()
3. Create `health-check/styles.css` - Reuse existing health check styles
4. Update `background/service-worker.js` - Add message handler for individual check execution
5. Update `background/health-check-api.js` - Add method to run single checks by name
6. Update `popup/app.js` - Change to immediately open tab (remove loading overlay)
7. Add loading animations, smooth transitions, error handling per tile

**API Requirements**:
- Chrome Extension Message Passing API (chrome.runtime.sendMessage)
- Existing Salesforce APIs (no new API calls needed)

**Files to Create**: 3
- health-check/health-check.html
- health-check/health-check.js
- health-check/styles.css

**Files to Modify**: 3
- background/service-worker.js
- background/health-check-api.js
- popup/app.js

**Estimated Effort**: 4-6 hours
**Complexity**: Medium
**Status**: Planned for v1.2

---

**Last Updated**: 2025-11-18
**Extension Version**: 1.1.0
