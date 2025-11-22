# Changelog

All notable changes to Salesforce Picklist Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2025-11-21

### Focus: Enhanced Comparisons, Monitoring & Field Analytics

### Added

- **Org Compare - Permissions**: Extended Org Compare Tool with permission comparison capability
  - Compare Profiles and Permission Sets across Salesforce orgs
  - Object permissions: Create, Read, Edit, Delete, View All, Modify All (6 permission types)
  - Field permissions: Read, Edit (2 permission types)
  - Permission type selector (Profile or Permission Set) with dynamic item dropdown
  - Profile → PermissionSet ID mapping for permission retrieval
  - Color-coded status indicators:
    - Green (Match): Permissions are identical
    - Yellow (Different): Permissions exist but differ
    - Blue (Source Only): Only in source org
    - Pink (Target Only): Only in target org
  - Summary statistics showing total items, matches, differences, source-only, target-only
  - Export permission comparison results (CSV/JSON via existing export)
  - Full dark mode support
  - Search and filter functionality
  - Added 9 new methods to `background/org-compare-api.js`:
    - `getProfiles()`, `getPermissionSets()`, `getPermissionSetIdForProfile()`
    - `getObjectPermissions()`, `getFieldPermissions()`, `getAllPermissions()`
    - `comparePermissions()`, `compareObjectPermissions()`, `compareFieldPermissions()`

- **Validation Rules - Object Label Fix**: Fixed object name display in Validation Rules Manager
  - Object names now display as friendly labels (e.g., "Account") instead of record IDs (e.g., "01I8d000002kUKa")
  - Fixed EntityDefinition query to use `DurableId` field instead of `Id` field
  - Enriched validation rule records with `ObjectLabel` and `ObjectApiName` fields
  - Updated filter dropdown to show proper object labels with rule counts
  - Search now works with both object labels and API names
  - Updated `getEntityDefinitionLabels()` in `background/validation-rule-api.js`
  - Updated UI code in `validation-rules/validation-rules.js` to use enriched fields

- **Batch Job Monitor - Execute Scheduled Job Now**: Added ability to execute scheduled jobs immediately
  - "Execute Now" button on active (WAITING) scheduled jobs in Scheduled Jobs tab
  - Confirmation dialog showing class name and next scheduled run time
  - Uses `Database.executeBatch()` via executeAnonymous to run jobs on-demand
  - Maintains scheduled job configuration (doesn't delete the schedule)
  - Real-time notification on execution success/failure
  - Auto-refresh and auto-switch to Active Jobs tab to show newly running job
  - Returns the AsyncApexJob ID of the newly created job
  - Added `executeScheduledJobNow()` method to `background/batch-job-api.js`
  - Added Execute Now modal and button handlers in `batch-jobs/batch-jobs.js`
  - Green hover color for Execute button (`.job-action-btn.execute:hover`)
  - Full dark mode support

- **Export Fields - Field Usage Analytics**: Added comprehensive field usage analysis
  - "Load Usage Data" button to analyze field references across org metadata
  - "Usage" column in field preview table with color-coded badges
  - Queries 7 metadata types for field references:
    - Validation Rules (formula field references)
    - Workflow Rules (formula field references)
    - Flows (field references in flow definitions)
    - Apex Classes (field references in code)
    - Visualforce Pages (field references in markup)
    - Lightning Components (field references in Aura components)
    - Formula Fields (references to other fields)
  - Color-coded usage levels with visual indicators:
    - Gray (Unused): 0 references
    - Blue (Low): 1-2 references
    - Orange (Medium): 3-10 references
    - Red (High): 10+ references
  - Hover tooltip shows breakdown by usage type
  - Sort by usage count via sortable table header
  - Progress indicator with per-object status updates
  - Non-blocking analysis (continues on errors)
  - On-demand loading (usage loads only when requested)
  - Usage data persists across sorting and filtering
  - Created new `background/field-usage-api.js` module with 8 analysis methods
  - Full dark mode support for all usage indicators

- **Popup Menu - Dark Theme**: Fixed dark theme styling issues in main popup menu
  - Fixed `.action-button` white background in dark mode
  - Added dark mode styles for `.container`, `.info`, `.info-item`
  - Added dark mode styles for `.back-button`, `.object-list`, `.selection-info`
  - Fixed icon colors in disabled and enabled states
  - Fixed `footer` dark background with proper border
  - Fixed `.primary-button` colors in dark mode
  - Added dark mode for `.loading-message`, `.status-message`, `.view-header`, `.preview-area`
  - All popup menu elements now properly support dark mode

### Technical Notes

- **API Version**: All REST and Tooling API calls use v59.0
- **EntityDefinition**: Uses `DurableId` field to match `ValidationRule.EntityDefinitionId`
- **Permission Comparison**: Profiles map to PermissionSets for unified permission retrieval
- **Field Usage**: Analyzes fields per-object to optimize API calls and avoid rate limits
- **Execute Anonymous**: Used for triggering scheduled jobs via `Database.executeBatch()`
- **Progressive Enhancement**: Field usage analytics load on-demand to avoid performance impact

### Performance Considerations

- Field usage analytics may be expensive for large orgs with many fields
- Flow analysis limited to 50 flows to avoid timeout
- Apex class search limited to 100 classes per query
- Usage analysis runs per-object with progress tracking
- Non-blocking error handling ensures analysis continues even if some metadata types fail

### Documentation

- Updated `.v1.6-progress.md` with complete implementation details for all 4 phases
- All features include keyboard shortcut references where applicable
- Comprehensive inline JSDoc comments added to new API methods

## [1.5.0] - 2025-11-20

### Focus: Advanced Administration & Security Features

### Added
- **Export Fields**: Comprehensive field metadata export tool
  - Export field definitions from any Salesforce objects to CSV or JSON
  - Multi-object selection with searchable dropdown
  - Filter by field type (Text, Number, Date, Picklist, Lookup, Checkbox, etc.)
  - Filter by field category (Custom only, Standard only, or All)
  - Field preview table with sortable columns (Object, Label, API Name, Type, Required, Custom)
  - Pagination for handling large field sets
  - Select/deselect individual fields for export
  - Comprehensive field properties exported:
    - Label, API Name, Data Type, Length, Precision, Scale
    - Required (nillable), Unique, External ID
    - Default Value, Formula
    - Picklist Values (for picklist fields)
    - Reference To, Relationship Name, Relationship Type (for lookups)
    - Inline Help Text, Description
    - Created Date, Last Modified Date (optional via Tooling API)
  - Summary statistics (Total fields, Custom, Standard, Required)
  - Progress indicator for bulk exports
  - CSV export with BOM for Excel compatibility
  - Full dark mode support
  - Added "Export Fields" button in Advanced Tools section
  - Added `background/export-fields-api.js` for REST API describe calls
  - Added `export-fields/` directory with HTML, CSS, JS files


- **Org Compare Tool**: Configuration drift detection and metadata comparison between Salesforce orgs
  - **Multi-session detection**: Scans ALL active Chrome tabs for Salesforce sessions
  - Supports users with more than 2 simultaneous Salesforce environments
  - Select any two orgs from all detected sessions for comparison
  - Compare 6 metadata types:
    - Objects (custom fields, relationships, queryable status)
    - Fields (type, length, required, unique, custom)
    - Validation Rules (formulas, active status, error messages)
    - Flows (active/inactive, versions, process types)
    - Picklists (values, labels, default values)
    - Dependencies (controlling/dependent field relationships)
  - Side-by-side comparison view with color-coded status:
    - Green: Items that match between orgs
    - Yellow: Items that exist in both but have differences
    - Blue: Items only in source org
    - Pink: Items only in target org
  - Summary statistics dashboard (total items, matches, differences, source-only, target-only)
  - Filter results by status, metadata type, and search term
  - Collapsible sections for each metadata type
  - Export comparison results to CSV or JSON format
  - Full dark mode support
  - Added "Org Compare Tool" button in Advanced Tools section
  - Added `background/org-compare-api.js` for session detection and metadata comparison
  - Added `org-compare/` directory with HTML, CSS, JS files

- **Permission Comparison**: Security and compliance tool for comparing permissions across Profiles and Permission Sets
  - View all Profiles and Permission Sets with summary statistics
  - Load and view object permissions (Create, Read, Edit, Delete, View All, Modify All)
  - Load and view field permissions (Read, Edit)
  - Side-by-side comparison of two Profiles/Permission Sets
  - Visual diff display with color-coded status (Match, Different, Source Only, Target Only)
  - Filter comparison results by status, object name, and permission type
  - Summary statistics showing matching, different, and unique permissions
  - Export permissions to CSV or JSON format
  - Export comparison results to CSV
  - Import preview for permission data (CSV/JSON) - preview only, no deployment
  - Multi-select export with separate object and field permission files
  - Search and filter by object name in all views
  - Full dark mode support
  - Added "Permission Comparison" button in Advanced Tools section
  - Added `background/permissions-api.js` for Tooling API queries (Profile, PermissionSet, FieldPermissions, ObjectPermissions)
  - Added `permissions/` directory with HTML, CSS, JS files

- **Validation Rules Manager**: Comprehensive tool for managing Salesforce validation rules
  - View all validation rules across all objects with summary statistics
  - Filter by object, status (active/inactive), and search by name/formula/error message
  - Bulk enable/disable validation rules (useful during data migrations)
  - Export validation rules to CSV or JSON format
  - View detailed rule information including formula, error message, and referenced fields
  - Analysis tab with object coverage, warnings, and rule statistics
  - Test validation rules against sample CSV data (client-side formula parsing)
  - Settings for export format, managed package rules visibility, and bulk action confirmation
  - Full dark mode support
  - Added "Validation Rules Manager" button in Advanced Tools section
  - Added `background/validation-rule-api.js` for Tooling API queries
  - Added `validation-rules/` directory with HTML, CSS, JS files

- **Dark Mode Theme**: Dot Compliance branded dark mode
  - Three theme options: Light, Dark, System (follows OS preference)
  - Radio button interface with visual previews in Settings
  - Persistent user preference stored in Chrome Storage
  - Real-time system theme change detection
  - Maintains brand colors in both modes (Deep Purple, Pink)
  - Smooth CSS transitions (0.2s ease)
  - Applied to all pages: popup, settings, health-check, batch-jobs
  - 70+ CSS variables for consistent theming
  - Added `background/theme-manager.js` module

- **Batch Job Monitor**: Real-time async operation monitoring
  - View all running/queued AsyncApexJob records
  - Three tabs: Active Jobs, Completed (last 24h), Scheduled
  - Summary stats dashboard (Active, Queued, Completed, Failed)
  - Job progress bars with percentage and item counts
  - Quick abort capability for running jobs
  - Filter by job type (Batch, Future, Queueable, Scheduled)
  - Filter by status (Queued, Preparing, Processing, etc.)
  - Search by Apex class name
  - Auto-refresh with configurable interval (15s, 30s, 1m, 2m, 5m)
  - Browser notifications for job completion/failure
  - Job history configurable (1h, 6h, 24h, 48h, 7 days)
  - Keyboard shortcut: `Ctrl+Shift+B` (Mac: `Cmd+Shift+B`)
  - Full dark mode support
  - Added "Advanced Tools" section divider in popup menu

### Changed
- Updated popup menu with "Advanced Tools" section for new features
- Moved "Check Share Files" button to Advanced Tools section
- Added section divider styling with dark mode support
- **Dependency Loader**: Now password-protected (experimental feature)
  - Lock icon displayed on button to indicate restricted access
  - Requires unlock key "DOT-DEPS-2024" to access
  - Session-based unlock (stays unlocked until browser restart)
  - Warning message indicates feature is experimental and not fully validated

### Improved
- **Health Check Report**: Click-to-copy for incorrect values
  - When a health check field shows an incorrect value, click on it to copy the expected/correct value to clipboard
  - Visual feedback with copy icon on hover and "Copied!" confirmation
  - Tooltip shows the correct value before clicking
  - Works in both light and dark mode

### Technical
- Added `background/batch-job-api.js` for AsyncApexJob queries via Tooling API
- Added `batch-jobs/` directory with HTML, CSS, JS for Batch Job Monitor UI
- Added `handleBatchJobMonitor()` function in popup/app.js
- Added keyboard shortcut `batch-job-monitor` in manifest.json commands
- Added `.section-divider` CSS class for popup menu organization
- Updated design-tokens.css with dark mode color variables
- ThemeManager module with system preference detection via `prefers-color-scheme`

### Testing
- **Playwright E2E Testing Framework**: Complete testing infrastructure for Chrome extension
  - Playwright configuration for Chrome-only testing with extension loading
  - Test fixtures for extension context and page helpers
  - E2E tests for all major features:
    - Popup UI and navigation tests
    - Settings page and theme switching tests
    - Health Check page tests
    - Batch Job Monitor tests
    - Validation Rules Manager tests
  - MCP server configuration for Playwright integration
  - npm scripts: `test`, `test:ui`, `test:headed`, `test:debug`, `test:report`

---

## [1.4.0] - 2025-11-18

### Focus: Enhanced Features & Shortcuts

### Added
- **Check Share Files**: Document revision file sharing analysis feature
  - New button in popup (enabled only on CompSuite__Document_Revision__c record pages)
  - Automatically detects current Salesforce page context and record ID
  - Queries PDF_ID__c and FILE_ID__c from document revision records
  - Converts ContentVersion IDs to ContentDocumentIds
  - Analyzes ContentDocumentLink sharing relationships
  - Displays inline summary with share counts per file
  - Provides detailed sharing information (LinkedEntityId, ShareType, Visibility)
  - Smart context detection for Lightning and Classic UI
  - **NEW: Add Missing Links** - Automatically create missing ContentDocumentLinks
    - Intelligent button shown when validation detects missing Document Revision Log links
    - Finds matching Revision Log record with same version number (CompSuite__Version__c)
    - Creates ContentDocumentLinks for both PDF and FILE to the Revision Log
    - One-click operation with real-time status feedback
    - Success confirmation with "Refresh Shares" button to verify changes
    - Proper error handling with user-friendly messages

- **Keyboard Shortcuts**: Global keyboard shortcuts for main features
  - **Export Picklists**: `Ctrl+Shift+E` (Mac: `Cmd+Shift+E`)
  - **Picklist Loader**: `Ctrl+Shift+L` (Mac: `Cmd+Shift+L`)
  - **DOT Health Check**: `Ctrl+Shift+H` (Mac: `Cmd+Shift+H`)
  - **Check Share Files**: `Ctrl+Shift+F` (Mac: `Cmd+Shift+F`)
  - Shortcuts work globally on any Salesforce page
  - New settings section to view and manage shortcuts
  - Click any shortcut to customize via Chrome's shortcuts page
  - "Clear All" option to reset all shortcuts
  - Chrome extension limit: 4 keyboard shortcuts maximum

### Changed
- Enhanced content script object detection to capture record IDs
- Improved context awareness for Lightning record pages and object homes
- Updated popup button states with disabled styling
- Settings page now displays keyboard shortcuts configuration

### Technical
- Added `commands` section to manifest.json for keyboard shortcuts
- Enhanced `content/injector.js` with record-level page detection
  - Detects Lightning record pages: `/lightning/r/ObjectName/RecordId/view`
  - Detects Lightning object home: `/lightning/o/ObjectName/home`
  - Returns full context object with `objectName`, `recordId`, `isRecordPage`
- Added `chrome.commands.onCommand` listener in service-worker.js
- New method: `HealthCheckAPI.checkDocumentRevisionSharing(recordId)`
  - Multi-step SOQL query process for file sharing analysis
  - Returns structured data with share counts and details
- New method: `HealthCheckAPI.addMissingDocumentRevisionLinks(recordId)`
  - Queries Document Revision for Version number (CompSuite__Version__c)
  - Finds matching Revision Log with same version number
  - Checks existing ContentDocumentLinks to avoid duplicates
  - Creates missing links via REST API (ShareType: 'V', Visibility: 'AllUsers')
  - Returns detailed result with created link IDs and Revision Log information
- Added `CHECK_DOCUMENT_REVISION_SHARING` message handler
- Added `ADD_MISSING_DOCUMENT_REVISION_LINKS` message handler in service-worker.js
- Updated `buildShareFilesTable()` to conditionally show "Add Missing Links" button
- New function: `handleAddMissingLinks(recordId)` in popup/app.js
  - Handles button click, disables during operation, shows progress
  - Displays success message with created link count
  - Provides "Refresh Shares" button to re-run validation
- New keyboard shortcuts section in settings page with full styling
- Updated `settings.js` with shortcuts management logic
  - `loadKeyboardShortcuts()` - Load and display current shortcuts
  - `clearAllShortcuts()` - Clear all shortcut bindings
- CSS enhancements for disabled button states and shortcuts UI

## [1.3.0] - 2025-11-18

### Focus: Pop-up UI Redesign - Dot Compliance Brand Alignment

### Added
- **Dot Compliance Design System Implementation**
  - CSS design tokens file with complete Dot Compliance color palette
  - 8px-based spacing system for consistent layout
  - Typography system using Quicksand (headlines) and PT Serif (body text)
  - Google Fonts integration for brand-compliant typography
  - Material Design Rounded icons integration
  - Comprehensive CSS custom properties for maintainability

### Changed
- **Complete Visual Redesign Following Dot Compliance Brand Book (2025)**
  - Primary color changed from Salesforce blue (#0176d3) to Deep Purple (#270648)
  - All CTAs now use Pink (#DD0087) instead of blue
  - Header background updated to Deep Purple
  - All buttons redesigned with Dot color scheme and hover effects
  - Typography updated to Quicksand (Medium/Bold) for headlines and buttons
  - Body text updated to PT Serif for improved readability
  - All inline SVG icons replaced with Material Design Rounded icons
  - Icon color standardized to Pink (#DD0087)
  - Spacing system refactored to use 8px base unit throughout
  - Form inputs, selects, and textareas redesigned with Dot styling
  - Status messages (success, error, info, warning) updated with Dot color palette
  - Preview areas and object lists redesigned for better visual hierarchy
  - Improved focus states with Pink accents and subtle shadows
  - Enhanced hover interactions across all interactive elements
  - Scrollbar styling updated to match Dot brand colors

### Technical
- Added `popup/design-tokens.css` with comprehensive CSS custom properties
- Updated `popup/index.html` to include Google Fonts and Material Icons
- Complete rewrite of `popup/styles.css` (895 lines) following Dot guidelines
- Updated `settings/settings.html` and `settings/settings.css` with Dot design system
- Updated `health-check/health-check.html` and `health-check/health-check.css` with Dot design system
- Replaced all SVG icons with Material Design Rounded icons across all pages
- Implemented CSS Grid and Flexbox with consistent spacing tokens
- Added smooth transitions and micro-interactions throughout
- Improved semantic color usage (primary, CTA, neutral, semantic states)
- Consistent design system across popup, settings, and health-check pages

## [1.2.0] - 2025-11-18

### Added
- **Progressive DOT Health Check**: Complete UX overhaul for health check functionality
  - Tab opens instantly (no more blocking loading overlay)
  - Health checks execute sequentially with real-time progress updates
  - Each check tile updates dynamically as it completes
  - Progress indicator shows "X of N checks complete" at top of page
  - Loading skeleton animations for tiles in progress
  - Smooth transitions and professional UX
  - PDF download enabled only after all checks complete
  - Error tiles display errors without stopping remaining checks
  - Includes both standard checks (6) and custom checks from settings
  - Improved perceived performance (fast checks show results in 1-2 seconds)

### Changed
- Health Check button now opens new tab immediately instead of showing loading overlay
- Health checks now execute sequentially rather than in parallel
- Health check results display progressively instead of all at once

### Technical
- Added `health-check/` directory with standalone progressive health check page
- Added `HealthCheckAPI.runSingleCheck()` method for individual check execution
- Added `RUN_SINGLE_HEALTH_CHECK` message handler in service worker
- Refactored health check UI to separate HTML/CSS/JS files

## [1.1.0] - 2025-11-15

### Added
- **Picklist Loader**: New dedicated button to deploy picklist value changes
- **Dependency Loader**: New dedicated button to import and deploy field dependencies
- **DOT Health Check**: Comprehensive org health check feature with visual report generation
  - **System Information**: Organization details (name, type, sandbox status, instance name)
  - **Security Settings**: Lightning Web Security (Locker Service Next) validation
  - **Org Limits**: Data and file storage monitoring with usage percentages
  - **API Usage**: Daily API call limits and usage tracking
  - **Environment Settings**: Closed system, lifecycle locks, DOT Help URL, E-Signature URL, and Email Deliverability
  - **Data Migration**: Pre-migration data integrity checks
    - Opened Requirement Revisions validation
    - Orphaned Document Revisions detection
    - Content Document Links verification
    - Actionable help text for failed checks
  - Exportable HTML reports with print-to-PDF functionality
- **Automatic Update Checker**: GitHub integration for automatic update notifications
  - Background worker checks for new releases every 24 hours
  - Update banner in popup when new version available
  - One-click download to latest release
  - Version comparison and notification system
  - Manual "Check for Updates" button in settings page
- **Export Dependencies**: Export field dependencies and record type picklist mappings to CSV
  - Controlling/dependent field relationships
  - Record type specific picklist values
  - Single object selection with radio buttons
- **2x2 Button Grid Layout**: Reorganized main menu for better UX
  - Row 1: Export Picklists | Export Dependencies
  - Row 2: Picklist Loader | Dependency Loader
  - Separate export and import workflows for clarity

### Changed
- Renamed "Deploy Changes" to "Picklist Loader" for clarity
- Moved dependency import functionality from Export Dependencies page to dedicated "Dependency Loader" view
- Improved UI layout with grid-based button organization
- Enhanced user experience with clearer separation between export and loader functions

### Technical
- Added `background/health-check-api.js` for org health validation
- Enhanced Metadata API with dependency reading capabilities
- Implemented GitHub API integration for release checking
- Added update notification system with local storage persistence
- Grid CSS layout for responsive button arrangement

## [1.0.0] - 2024-11-13

### Added
- Initial release
- Export picklist values to CSV format
- Export field dependencies and record type mappings
- Deploy picklist changes via Metadata API
- Overwrite mode: Replace all values with CSV input
- Append mode: Add CSV values to existing active values
- Preview changes before deployment
- Download deployment package for inspection
- ZIP package structure matching Salesforce requirements
- CustomObject format for field deployments
- Session management for Salesforce authentication
- Support for standard and custom objects
- Support for namespaced fields

### Features
- **Export Picklists**: Export active picklist values for selected objects
- **Export Dependencies**: Export controlling/dependent field relationships and record type picklist mappings
- **Deploy Changes**: Update picklist values with CSV input
- **Preview Mode**: Review all changes before deploying
- **Package Download**: Inspect deployment packages before submission

### Technical
- Chrome Extension Manifest V3
- Salesforce Metadata API integration
- Salesforce REST API for object metadata
- JSZip for package generation
- Session cookie-based authentication

### Notes
- Requires active Salesforce session
- Test in sandbox before production deployment
- Supports Lightning and Classic interfaces
