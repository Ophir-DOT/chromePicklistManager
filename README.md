# Salesforce Picklist Manager

A Chrome extension for managing Salesforce picklist configurations, field dependencies, and advanced org administration tasks.

## Key Features

### Data Management
- **Picklist & Dependency Tools** - Export and deploy picklist values and field dependencies with preview
- **Export Fields** - Export field metadata with usage analytics to identify unused fields
- **Record Migration** - Validate data integrity before migrations with comprehensive checks

### Org Administration
- **DOT Health Check** - Six-tile org health validation with exportable HTML reports
- **Validation Rules Manager** - View, filter, and bulk enable/disable validation rules
- **Batch Job Monitor** - Real-time async job monitoring with execute-now capability
- **Check Share Files** - Analyze and repair document revision file sharing (context-aware)

### Multi-Org Tools
- **Org Compare** - Side-by-side configuration drift detection across 7 metadata types
- **Permission Comparison** - Profile and Permission Set security analysis

### User Experience
- **Automatic Updates** - GitHub integration with 24-hour update checks
- **Keyboard Shortcuts** - Quick access to all major features
- **Dark Mode** - Full dark theme support with system preference sync

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

Built with Manifest V3 and vanilla JavaScript:
- **Background Service Worker** - API orchestration and session management
- **Content Scripts** - Salesforce page detection and context extraction
- **Popup & Pages** - User interfaces with responsive grid layouts
- **API Integration** - Salesforce Metadata, REST, and Tooling APIs

## Important Notes

- Requires valid Salesforce session (uses existing cookies)
- Test all deployments in sandbox environments first
- Respects Salesforce API limits and permissions

## Security & Privacy

- Only accesses Salesforce domains and GitHub API
- No external data transmission or tracking
- Respects Salesforce user permissions
- Uses session cookies for authentication (no separate login)

## Development

Built with vanilla JavaScript and Chrome Extension Manifest V3. E2E testing with Playwright.

```bash
npm install       # Install dependencies
npm test          # Run tests (headed mode)
npm run test:ui   # Interactive test UI
```

See [CLAUDE.md](CLAUDE.md) for development conventions and architecture details.

## License

MIT

## Support

For issues and questions, create an issue on GitHub.
