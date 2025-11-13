# Installation Guide

## For Internal Users

This extension is distributed internally and does not require Chrome Web Store installation.

## Prerequisites

- Google Chrome or Microsoft Edge (Chromium-based)
- Access to Salesforce org(s)
- Active Salesforce session

## Installation Methods

### Method 1: Git Clone (Recommended for Developers)

1. Clone the repository:
   ```bash
   git clone https://github.com/yourorg/chromePicklistManager.git
   cd chromePicklistManager
   ```

2. Open Chrome and navigate to: `chrome://extensions/`

3. Enable **Developer mode** (toggle in top-right corner)

4. Click **"Load unpacked"**

5. Select the `chromePicklistManager` directory

6. ✅ Extension installed! Look for the icon in your Chrome toolbar.

### Method 2: Download ZIP (For Non-Technical Users)

1. Download the latest release ZIP from: `[Your Internal Share Location]`

2. Extract the ZIP to a **permanent location** (e.g., `C:\Apps\chromePicklistManager\`)
   - ⚠️ **Important**: Do NOT extract to Downloads or Desktop, as moving it later will break the extension

3. Open Chrome and navigate to: `chrome://extensions/`

4. Enable **Developer mode** (toggle in top-right corner)

5. Click **"Load unpacked"**

6. Select the extracted folder

7. ✅ Extension installed!

## Updating the Extension

### Git Method

```bash
cd chromePicklistManager
git pull origin main
```

Then in Chrome:
1. Go to `chrome://extensions/`
2. Find "Salesforce Picklist Manager"
3. Click the **Reload** icon (circular arrow)

### ZIP Method

1. Download new version ZIP
2. Extract to the **same location** as before (overwrite files)
3. Go to `chrome://extensions/`
4. Click the **Reload** icon on the extension card

## Verification

After installation:

1. Navigate to any Salesforce org
2. Click the extension icon in Chrome toolbar
3. You should see connection status

If you see "Not connected":
- Refresh the Salesforce page
- Make sure you're logged in to Salesforce
- Check that the URL is a valid Salesforce domain

## Troubleshooting

### Extension Disappeared After Restart

**Cause**: Chrome lost reference to the extension folder (usually because it was moved or deleted)

**Solution**:
- Reinstall by loading unpacked again
- Make sure the folder is in a permanent location

### "Error Loading Extension"

**Cause**: Missing files or incorrect folder selected

**Solution**:
- Make sure you selected the root folder containing `manifest.json`
- Verify all files are present

### "Not Connected" Status

**Cause**: Not on a Salesforce page or session expired

**Solution**:
- Make sure you're on a Salesforce page (*.salesforce.com or *.force.com)
- Refresh the page
- Log in to Salesforce again

## Uninstallation

1. Go to `chrome://extensions/`
2. Find "Salesforce Picklist Manager"
3. Click **Remove**
4. Confirm deletion

## Security Notes

- Extension only accesses Salesforce domains
- No external data transmission
- Uses your existing Salesforce session
- All operations respect your Salesforce permissions
- Test deployments in sandbox first

## Support

For issues or questions, contact: [Your Internal Support Channel]

Version: 1.0.0
Last Updated: 2024-11-13
