# Privacy Policy for DOT Toolkit

**Last Updated:** December 23, 2024

## Overview

DOT Toolkit is a Chrome extension designed for Salesforce administrators to manage picklist configurations, field dependencies, validation rules, and perform org health checks. This policy explains how the extension handles data.

## Data Collection and Use

**DOT Toolkit does NOT collect, transmit, or sell any personal data to the developer or third parties.**

### Data Accessed Locally

| Data Type | Purpose | Storage |
|-----------|---------|---------|
| Salesforce session cookie | Authenticate API requests to your Salesforce org | Read-only, never stored |
| Salesforce org metadata | Display picklists, fields, validation rules | Cached locally in your browser |
| User preferences | Theme, settings | Stored locally via Chrome sync storage |

### External Connections

The extension only connects to:

1. **Your Salesforce Org** (*.salesforce.com, *.force.com, etc.)
   - Purpose: Execute API requests you initiate
   - Data sent: Standard Salesforce API calls using your existing session
   - Data received: Metadata and records from your org

2. **GitHub API** (api.github.com)
   - Purpose: Check for extension updates
   - Data sent: None (public endpoint query)
   - Data received: Latest release version number

## Data Storage

- All data remains in your browser's local storage
- Preferences sync across your Chrome browsers via Chrome's built-in sync
- No data is stored on external servers
- No analytics or tracking services are used

## Data Sharing

We do not share, sell, or transfer any data to third parties.

## Your Rights

- Uninstall the extension at any time to remove all locally stored data
- Clear extension data via Chrome settings > Extensions > DOT Toolkit > Details > Clear data

## Security

- The extension uses your existing Salesforce authentication
- No credentials are stored or transmitted
- All Salesforce connections use HTTPS

## Changes to This Policy

Updates will be posted at this URL with a revised date.

## Contact

For questions about this privacy policy, contact: ophir@dotcompliance.com

---

*This extension is developed for Salesforce administrators and is not affiliated with Salesforce, Inc.*
