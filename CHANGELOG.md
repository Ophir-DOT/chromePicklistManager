# Changelog

All notable changes to Salesforce Picklist Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 1.3.0

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
