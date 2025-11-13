# Salesforce Picklist Manager

A Chrome extension for managing Salesforce picklist configurations, field dependencies, and record type assignments across orgs.

## Features

- **Export Picklists**: Export picklist values and configurations from Salesforce objects
- **Compare Orgs**: Compare picklist configurations between different orgs
- **Deploy Changes**: Deploy picklist modifications using Metadata API
- **Field Dependencies**: Manage controlling and dependent field relationships
- **Record Types**: Handle record type picklist assignments

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
   - Export picklist configurations
   - Export field dependencies
   - Deploy picklist changes

## Architecture

- **Background Service Worker**: Handles API calls and session management
- **Content Script**: Injected into Salesforce pages for session detection
- **Popup**: Main user interface
- **Update Checker**: Automatic GitHub release monitoring

## Key Components

- `background/service-worker.js` - Main orchestrator
- `background/session-manager.js` - Session extraction
- `background/metadata-api.js` - Salesforce Metadata API integration
- `background/update-checker.js` - GitHub update notifications
- `popup/` - Main user interface

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
- Field dependency export
- Record type picklist mappings
- Deployment via Metadata API (CustomObject format)
- Overwrite/Append modes for picklist updates
- Automatic update notifications via GitHub

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
│   ├── tooling-api.js          # Salesforce Tooling API
│   ├── api-client.js           # REST API client
│   ├── update-checker.js       # GitHub update monitoring
│   └── storage-manager.js      # Local storage
├── content/
│   ├── injector.js             # Session detection
│   └── styles.css
├── popup/
│   ├── index.html
│   ├── app.js                  # Main UI logic
│   └── styles.css
├── icons/
└── lib/
    └── jszip.min.js            # ZIP package creation
```

## License

MIT

## Support

For issues and questions, create an issue on GitHub.
