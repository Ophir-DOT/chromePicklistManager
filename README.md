# Salesforce Picklist Manager

A Chrome extension for managing Salesforce picklist configurations, field dependencies, and record type assignments across orgs.

## Features

- **Export Picklists**: Export picklist values and configurations from Salesforce objects to CSV
- **Export Dependencies**: Export field dependencies and record type picklist mappings
- **Picklist Loader**: Deploy picklist value changes using Metadata API
  - Overwrite mode: Replace all values with CSV input
  - Append mode: Add CSV values to existing active values
  - Preview changes before deployment
- **Dependency Loader**: Import and deploy field dependencies from CSV
  - Replace or append mode for dependencies
  - Record type picklist value assignments
  - Preview changes before deployment
- **DOT Health Check**: Run comprehensive org health checks with 6 validation tiles
  - **System Information**: Organization name, type, sandbox status, and instance details
  - **Security Settings**: Lightning Web Security (Locker Service Next) validation
  - **Org Limits**: Real-time data and file storage monitoring with usage percentages
  - **API Usage**: Daily API call limits and current usage tracking
  - **Environment Settings**: Closed system flags, lifecycle locks, DOT Help URL, E-Signature URL, and Email Deliverability status
  - **Data Migration**: Pre-migration data integrity validation
    - Opened Requirement Revisions count (expected: 0)
    - Orphaned Document Revisions detection (expected: 0)
    - Missing Content Document Links verification (expected: 0)
    - Contextual help text with actionable remediation steps for failures
  - Exportable HTML reports with print-to-PDF functionality
- **Check Share Files**: Document revision file sharing analysis and repair
  - Analyzes ContentDocumentLink sharing for document revisions
  - Context-aware: Only enabled on CompSuite__Document_Revision__c record pages
  - Displays PDF and FILE sharing details with validation
  - **Add Missing Links**: One-click creation of missing ContentDocumentLinks
    - Automatically finds matching Revision Log by version number
    - Creates missing links to Document Revision Logs
    - Real-time status feedback and validation refresh
- **Automatic Updates**: GitHub integration for update notifications
  - Automatic checks every 24 hours
  - Manual "Check for Updates" in settings page
  - Update banner with download link
- **Keyboard Shortcuts**: Global shortcuts for quick access
  - Export Picklists: `Ctrl+Shift+E` (Mac: `Cmd+Shift+E`)
  - Picklist Loader: `Ctrl+Shift+L` (Mac: `Cmd+Shift+L`)
  - DOT Health Check: `Ctrl+Shift+H` (Mac: `Cmd+Shift+H`)
  - Check Share Files: `Ctrl+Shift+F` (Mac: `Cmd+Shift+F`)
- **Export Fields**: Comprehensive field metadata export tool
  - Export field definitions from any Salesforce objects to CSV or JSON
  - Multi-object selection with searchable dropdown
  - Filter by field type (Text, Number, Date, Picklist, Lookup, Checkbox, etc.)
  - Filter by field category (Custom only, Standard only, or All)
  - Field preview table with sortable columns
  - Pagination for handling large field sets
  - Select/deselect individual fields for export
  - Comprehensive field properties: Label, API Name, Type, Length, Required, Unique, External ID, Default Value, Formula, Picklist Values, Reference To, Inline Help Text, Description
  - Summary statistics (Total fields, Custom, Standard, Required)
  - Progress indicator for bulk exports
  - CSV export with BOM for Excel compatibility
  - **Field Usage Analytics** ⭐ NEW in v1.6.0
    - On-demand data usage analysis showing how many records have values in each field
    - Counts actual record usage (non-null, non-empty values) across up to 2,000 records per object
    - Identifies unused fields (0 records with values) for potential cleanup
    - Tooltip shows exact count of records using each field
    - Sort by usage count to prioritize field management
    - Progressive loading with per-object progress tracking
  - Full dark mode support
- **Org Compare Tool**: Configuration drift detection between Salesforce orgs
  - **Multi-session support**: Detects ALL active Salesforce sessions across browser tabs
  - Select any two orgs from all available sessions for comparison
  - Compare 7 metadata types:
    - Objects (custom fields, relationships)
    - Fields (metadata, properties)
    - Validation Rules (formulas, active status)
    - Flows (active/inactive, versions)
    - Picklists (values, default values)
    - Dependencies (field dependencies)
    - **Permissions** ⭐ NEW in v1.6.0
      - Compare Profiles and Permission Sets across orgs
      - Object permissions (Create, Read, Edit, Delete, View All, Modify All)
      - Field permissions (Read, Edit)
      - Select permission type (Profile/Permission Set) and specific item
  - Side-by-side comparison view with color-coded differences:
    - Green: Match
    - Yellow: Different
    - Blue: Source only
    - Pink: Target only
  - Summary statistics (total items, matches, differences)
  - Filter and search results
  - Export to CSV or JSON
  - Full dark mode support
- **Permission Comparison**: Security and compliance tool for Profile/Permission Set analysis
  - View all Profiles and Permission Sets with summary statistics
  - Load and view object permissions (CRUD, View All, Modify All)
  - Load and view field permissions (Read, Edit)
  - Side-by-side comparison with visual diff display
  - Color-coded status: Match (green), Different (yellow), Source/Target Only
  - Filter by status, object name, and permission type
  - Export permissions to CSV or JSON format
  - Export comparison results to CSV
  - Import preview for permission data (preview only, no deployment)
  - Full dark mode support
- **Validation Rules Manager**: Comprehensive validation rule management
  - View all validation rules across all objects with correct object labels ⭐ FIXED in v1.6.0
  - Filter by object, status (active/inactive), search by name/formula/error message
  - Bulk enable/disable validation rules (useful during migrations)
  - Export to CSV or JSON format
  - View detailed rule information (formula, error message, referenced fields)
  - Analysis tab with object coverage and warnings
  - Test validation rules against sample CSV data
  - Full dark mode support
- **Batch Job Monitor**: Real-time async operation monitoring
  - View all running/queued AsyncApexJob records
  - Three tabs: Active Jobs, Completed, Scheduled
  - Summary stats dashboard (Active, Queued, Completed, Failed)
  - Job progress bars with percentage and item counts
  - Quick abort capability for running jobs
  - **Execute Scheduled Jobs Now** ⭐ NEW in v1.6.0
    - Run scheduled batch jobs on-demand with one click
    - Confirmation dialog showing class name and next scheduled run
    - Maintains scheduled job configuration (doesn't delete schedule)
    - Auto-refresh and switch to Active Jobs tab after execution
  - Filter by job type and status
  - Search by Apex class name
  - Auto-refresh with configurable interval (15s, 30s, 1m, 2m, 5m)
  - Browser notifications for job completion/failure
  - Keyboard shortcut: `Ctrl+Shift+B` (Mac: `Cmd+Shift+B`)
  - Full dark mode support
- **Dark Mode Theme**: Dot Compliance branded dark mode
  - Three theme options: Light, Dark, System (follows OS preference)
  - Persistent user preference
  - Real-time system theme change detection
  - Maintains brand colors (Deep Purple, Pink) in both modes
  - Applied to all pages: popup, settings, health-check, all advanced tools

## Installation

### For Users

1. Go to https://github.com/Ophir-DOT/chromePicklistManager
2. Click **"Code"** → **"Download ZIP"**
3. Extract to permanent location (e.g., `C:\Apps\chromePicklistManager\`)
4. Chrome → `chrome://extensions/` → Enable "Developer mode"
5. Click "Load unpacked" → Select extracted folder
6. ✅ Done! Extension auto-notifies you of updates.

### Updating

When extension shows "Update Available":
1. Download latest ZIP from GitHub
2. Extract to **same folder** (overwrite files)
3. Go to `chrome://extensions/` → Click reload button

### Documentation

- **Installation Guide**: [INSTALLATION.md](INSTALLATION.md)
- **Release Process**: [RELEASE-PROCESS.md](RELEASE-PROCESS.md)
- **Changelog**: [CHANGELOG.md](CHANGELOG.md)

## Usage

1. Navigate to any Salesforce org (Lightning or Classic)
2. Click the extension icon in your Chrome toolbar
3. The extension will automatically detect your session
4. Use the popup to:
   - **Export Picklists**: Export picklist values to CSV
   - **Export Dependencies**: Export field dependencies to CSV
   - **Picklist Loader**: Import CSV and deploy picklist changes
   - **Dependency Loader**: Import CSV and deploy field dependencies
   - **DOT Health Check**: Run org health validation
   - **Check Share Files**: Analyze and fix document revision file sharing (context-aware)
   - **Org Compare Tool**: Compare configurations across multiple Salesforce orgs
   - **Export Fields**: Export field metadata from objects to CSV or JSON
5. Or use keyboard shortcuts for quick access (see Features section)

## Architecture

- **Background Service Worker**: Handles API calls and session management
- **Content Script**: Injected into Salesforce pages for session detection
- **Popup**: Main user interface
- **Update Checker**: Automatic GitHub release monitoring

## Key Components

- `background/service-worker.js` - Main orchestrator
- `background/session-manager.js` - Session extraction
- `background/metadata-api.js` - Salesforce Metadata API integration
- `background/health-check-api.js` - Org health validation
- `background/update-checker.js` - GitHub update notifications
- `popup/` - Main user interface with 2x2 grid layout

## API Integration

The extension uses:
- Salesforce Metadata API for reading/deploying picklist configurations
- REST API for object listings
- Session cookies for authentication

## Features Status

✅ **Implemented:**
- Session extraction and management
- Object listing via REST API
- Picklist export to CSV
- Field dependency export to CSV
- Record type picklist mappings export
- Deployment via Metadata API (CustomObject format)
- Overwrite/Append modes for picklist updates
- Dependency import and deployment
- DOT Health Check with HTML report generation
- Automatic update notifications via GitHub
- 2x2 grid layout for improved UX

⚠️ **Important Notes:**
- Requires valid Salesforce session
- Test deployments in sandbox first
- Respects Salesforce API limits

## Security

- Only accesses Salesforce domains and GitHub API
- Uses session storage for temporary data
- No external data transmission
- Respects Salesforce permissions
- GitHub update checks use public API (no auth required)

## Development

Built with vanilla JavaScript and Chrome Extension Manifest V3.

### Testing

The extension uses Playwright for E2E testing. Tests run in headed Chrome with the extension loaded.

```bash
# Install dependencies
npm install

# Run all tests (headed mode required for extensions)
npm test

# Run tests with UI
npm run test:ui

# Run tests in debug mode
npm run test:debug

# View test report
npm run test:report
```

**Test Structure:**
- `tests/fixtures/` - Extension loading fixtures and helpers
- `tests/e2e/` - End-to-end tests for all features
- `tests/mocks/` - Mock Salesforce API responses

**Note:** Extension E2E tests require headed mode (not headless) because Chrome extensions cannot run in headless mode.

### Project Structure

```
chromePicklistManager/
├── manifest.json
├── background/
│   ├── service-worker.js       # Main orchestrator
│   ├── session-manager.js      # Session extraction
│   ├── metadata-api.js         # Salesforce Metadata API
│   ├── health-check-api.js     # Org health validation
│   ├── tooling-api.js          # Salesforce Tooling API
│   ├── api-client.js           # REST API client
│   ├── update-checker.js       # GitHub update monitoring
│   └── storage-manager.js      # Local storage
├── content/
│   ├── injector.js             # Session detection
│   └── styles.css
├── popup/
│   ├── index.html              # Main UI with 2x2 grid
│   ├── app.js                  # Main UI logic
│   └── styles.css              # Responsive grid layout
├── settings/
│   ├── settings.html           # Settings page
│   ├── settings.js
│   └── settings.css
├── icons/
└── lib/
    └── jszip.min.js            # ZIP package creation
```

## License

MIT

## Support

For issues and questions, create an issue on GitHub.
