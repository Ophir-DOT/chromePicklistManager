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
- **Automatic Updates**: GitHub integration for update notifications
  - Automatic checks every 24 hours
  - Manual "Check for Updates" in settings page
  - Update banner with download link
- **Compare Orgs**: Compare picklist configurations between different orgs

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
   - **Compare Orgs**: Compare configurations across orgs

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
