# TODO - Feature Roadmap

This document outlines planned features and enhancements for the Salesforce Picklist Manager Chrome Extension.

---

## ✅ Completed Features

### 1. Dependency Loader ✅
**Status**: Completed in v1.1.0
**Implementation**: Export and import field dependencies and record type picklist mappings
- Implemented in popup with dedicated "Export Dependencies" and "Dependency Loader" buttons
- CSV export with controlling/dependent field relationships
- Record type specific picklist value assignments
- Deploy via Metadata API

### 2. Automatic Update Checker ✅
**Status**: Completed in v1.1.0
**Implementation**: GitHub integration for automatic update notifications
- Background worker checks for new releases every 24 hours
- Update banner in popup when new version available
- One-click download to latest release
- Version comparison and notification system
- Manual "Check for Updates" button in settings page

### 3. DOT Health Check ✅
**Status**: Completed in v1.1.0
**Implementation**: Comprehensive org health check with 6 validations
- System Information: Organization details
- Security Settings: Lightning Web Security validation
- Org Limits: Data and file storage monitoring
- API Usage: Daily API call limits tracking
- Environment Settings: Closed system, lifecycle locks, URLs, Email Deliverability
- Data Migration: Pre-migration data integrity checks
- Exportable HTML reports with print-to-PDF functionality
- Custom health checks support via Settings page

---

## 🎯 High Priority (P0) - Requested Features

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

## 🎨 Low Priority (P2) - UX Improvements

### 5. Side Panel UI
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

### 6. Context Menu Integration
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

### 7. Auto-Detect Current Object/Field
**Description**: Automatically populate object and field selections based on current Salesforce page.

**Features**:
- Parse URL to detect object type
- Parse page DOM to detect field name
- Pre-fill export/update forms
- Show "Use Current Object" button

**Complexity**: Small
**Status**: Not Started

---

### 8. Dark Mode Theme
**Description**: Add dark mode support for the extension popup.

**Features**:
- Toggle between light/dark themes
- Persist user preference
- Match Salesforce theme if possible
- Smooth theme transitions

**Complexity**: Small
**Status**: Not Started

---

### 9. Keyboard Shortcuts
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

### 10. Field/Object Favorites
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

### 11. Picklist Value Reordering
**Description**: Change the order of picklist values.

**Complexity**: Medium
**Status**: Idea

---

### 12. Translation Workbench Support
**Description**: Export and import picklist value translations for multiple languages.

**Complexity**: Large
**Status**: Idea

---

### 13. Default Value Management
**Description**: Set and update default picklist values.

**Complexity**: Small
**Status**: Idea

---

### 14. Restricted Picklist Toggle
**Description**: Enable/disable restricted picklist mode for fields.

**Complexity**: Small
**Status**: Idea

---

### 15. Field-Level Security Export
**Description**: Export field permissions across profiles and permission sets.

**Complexity**: Large
**Status**: Idea

---

### 16. SOQL Query Builder
**Description**: Visual query builder for picklist analysis queries.

**Complexity**: Large
**Status**: Idea

---

### 17. Deployment History Dashboard
**Description**: Visual dashboard showing all deployments made via extension with filtering and search.

**Complexity**: Medium
**Status**: Idea

---

### 18. Batch Export All Org Picklists
**Description**: Background job to export all picklist fields in the entire org at once.

**Complexity**: Large
**Status**: Idea

---

### 19. Org Comparison Tool Enhancement
**Description**: Full comparison between two orgs with diff visualization and sync capabilities.

**Complexity**: Large
**Status**: Idea

---

### 20. Export Format Options
**Description**: Support additional export formats (JSON, Excel, XML).

**Complexity**: Medium
**Status**: Idea

---

### 21. Controlling Field Dependency Creator
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
**Extension Version**: 1.2.0
