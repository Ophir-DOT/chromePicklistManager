# Changelog

All notable changes to Salesforce Picklist Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 1.5.0

### Focus: Advanced Administration & Security Features

### Planned
- **Profile/Permission Set Comparison & Import**: Security and compliance tool
  - Compare field-level security across profiles/permission sets
  - Identify permission gaps or over-privileges
  - Export object/field permissions matrix
  - Import permission exports from another environment
  - Bulk permission updates for specific fields
  - Track changes over time
  - Map profiles/permission sets between source and target environments
  - Preview permission changes before deployment
  - Selective import (choose which permissions to apply)

- **Org Compare Tool**: Configuration drift detection and sync
  - Side-by-side object comparison (fields, validation rules, etc.)
  - Configuration drift detection between environments
  - Sync wizard to align configurations
  - Pre-migration verification
  - Compare picklists, workflows, validation rules
  - Export comparison reports
  - Highlight differences with visual diff

### Added
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

### Technical
- Added `background/batch-job-api.js` for AsyncApexJob queries via Tooling API
- Added `batch-jobs/` directory with HTML, CSS, JS for Batch Job Monitor UI
- Added `handleBatchJobMonitor()` function in popup/app.js
- Added keyboard shortcut `batch-job-monitor` in manifest.json commands
- Added `.section-divider` CSS class for popup menu organization
- Updated design-tokens.css with dark mode color variables
- ThemeManager module with system preference detection via `prefers-color-scheme`

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
