# Salesforce Picklist Manager

A Chrome extension for managing Salesforce picklist configurations, field dependencies, and record type assignments across orgs.

## Features

- **Export Picklists**: Export picklist values and configurations from Salesforce objects
- **Compare Orgs**: Compare picklist configurations between different orgs
- **Deploy Changes**: Deploy picklist modifications using Metadata API
- **Field Dependencies**: Manage controlling and dependent field relationships
- **Record Types**: Handle record type picklist assignments

## Installation

### Quick Start (Ready to Test!)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `chromePicklistManager` directory
5. Done! Extension is ready to use

**Note**: Placeholder icons are already included for immediate testing.

### Documentation

- **Quick Start**: [QUICK-START.md](QUICK-START.md) - Get started in 5 minutes
- **Export Guide**: [EXPORT-GUIDE.md](EXPORT-GUIDE.md) - How to export picklists
- **Testing Guide**: [TESTING-GUIDE.md](TESTING-GUIDE.md) - Comprehensive testing instructions
- **Setup Status**: [SETUP-COMPLETE.md](SETUP-COMPLETE.md) - Complete feature list
- **Connection Issues?**: [TROUBLESHOOTING-CONNECTION.md](TROUBLESHOOTING-CONNECTION.md) - Fix "Not connected" errors
- **Run Diagnostics**: [DIAGNOSTIC-TEST.md](DIAGNOSTIC-TEST.md) - Test connection step-by-step
- **How It Works**: [CONNECTION-DESIGN.md](CONNECTION-DESIGN.md) - Technical design details

## Usage

1. Navigate to any Salesforce org (Lightning or Classic)
2. Click the extension icon in your Chrome toolbar
3. The extension will automatically detect your session
4. Use the popup or sidepanel to:
   - Export picklist configurations
   - Compare configurations between orgs
   - Deploy changes

## Architecture

- **Background Service Worker**: Handles API calls and session management
- **Content Script**: Injected into Salesforce pages for context detection
- **Popup**: Quick access interface
- **Sidepanel**: Full-featured management interface

## Key Components

- `background/service-worker.js` - Main orchestrator
- `background/session-manager.js` - Session extraction
- `background/metadata-api.js` - Salesforce Metadata API integration
- `content/injector.js` - Page detection and UI injection
- `popup/` - Quick access popup interface
- `sidepanel/` - Full management interface

## API Integration

The extension uses:
- Salesforce Metadata API for reading/deploying picklist configurations
- REST API for object listings
- Session cookies for authentication

## Current Status

✅ **Fully Implemented:**
- Session extraction and management
- Object listing via REST API
- Picklist export via Metadata API
- Field dependency parsing
- Record type mappings
- Deployment package building (JSZip integrated)
- Compare functionality
- JSON export/import

⚠️ **Notes:**
- Requires valid Salesforce session
- Test deployments in sandbox first
- Respects Salesforce API limits

## Security

- Only accesses Salesforce domains
- Uses session storage for temporary data
- No external data transmission
- Respects Salesforce permissions

## Future Enhancements

- Complete deployment package building with JSZip
- Batch deployment to multiple orgs
- Change history tracking
- Visual dependency graph
- Templates for common configurations

## Development

The extension is built with vanilla JavaScript and uses Chrome Extension Manifest V3.

### Project Structure

```
chromePicklistManager/
├── manifest.json
├── background/
│   ├── service-worker.js
│   ├── session-manager.js
│   ├── metadata-api.js
│   └── storage-manager.js
├── content/
│   ├── injector.js
│   └── styles.css
├── popup/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── sidepanel/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── utils/
    ├── error-handler.js
    └── logger.js
```

## License

MIT

## Support

For issues and questions, please refer to the documentation in `Salesforce-Picklist-Manager-Architecture.md`.
