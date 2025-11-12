# Quick Start Guide

## Installation (5 minutes)

### Step 1: Load Extension in Chrome

1. Open Chrome browser
2. Navigate to `chrome://extensions/`
3. Toggle **Developer mode** ON (top right corner)
4. Click **Load unpacked** button
5. Select the `chromePicklistManager` folder
6. Extension should load successfully!

✅ **Icons**: Simple placeholder icons are already included for testing.

### Step 2: Test Basic Functionality

1. **Open Salesforce**
   - Navigate to any Salesforce org
   - Log in to your account

2. **Click Extension Icon**
   - Look for the extension in your Chrome toolbar
   - If not visible, click the puzzle piece icon and pin it
   - Click the extension icon

3. **Verify Connection**
   - Status should show "Connected" (green dot)
   - Current Org should display your Salesforce URL

### Step 3: Try Exporting Picklists

**Using Popup (Quick Test):**
- Click the extension icon
- Click "Export Picklists"
- This will show an alert for now

**Using Sidepanel (Full Test):**
- Right-click the extension icon → Inspect views: popup
- In the console, test with:
  ```javascript
  chrome.runtime.sendMessage(
    { action: 'GET_OBJECTS' },
    (response) => console.log(response)
  );
  ```

### Step 4: Test Export via Service Worker

1. Go to `chrome://extensions/`
2. Find "Salesforce Picklist Manager"
3. Click **service worker** link
4. In the console that opens, run:

```javascript
// Test getting objects list
chrome.runtime.sendMessage(
  { action: 'GET_OBJECTS' },
  (response) => console.log('Objects:', response)
);

// Test export (after confirming objects work)
chrome.runtime.sendMessage(
  { action: 'EXPORT_PICKLISTS', objects: ['Account'] },
  (response) => console.log('Export:', response)
);
```

## Troubleshooting

### "Could not load extension"
- Make sure all files are present
- Icons should be in `icons/` folder (already created)
- Check manifest.json is valid

### "Not Connected" Status
- Make sure you're logged into Salesforce
- Refresh the Salesforce page
- Check that you're on a `*.salesforce.com` or `*.force.com` domain

### Extension Not Working
1. Check service worker console for errors
2. Reload the extension: `chrome://extensions/` → click reload icon
3. Refresh Salesforce page

### No Floating Button on Salesforce Page
- Content script may not have loaded
- Refresh the page
- Check F12 console for errors

## What You Can Test

✅ **Session Extraction** - Automatically reads Salesforce session
✅ **Object List** - Gets all custom and standard objects
✅ **Picklist Export** - Reads picklist metadata via Metadata API
✅ **JSON Download** - Exports data to downloadable file
✅ **Compare** - Compare picklists between orgs
⚠️ **Deploy** - Framework ready (test in sandbox only!)

## Next Steps

Once basic testing works:

1. **Test with Real Data**
   - Export Account object picklists
   - Export custom object picklists
   - Test objects with field dependencies

2. **Test Compare Feature**
   - Export from one org
   - Export from another org
   - Upload both and compare

3. **Enhance Icons** (Optional)
   - Use the icon.svg as a template
   - Convert to proper PNG with your preferred tool
   - Replace icon16.png, icon48.png, icon128.png

4. **Test Deploy** (Sandbox Only!)
   - Upload a modified JSON
   - Use "Check Only" mode for safety
   - Review deployment results

## Need Help?

See [TESTING-GUIDE.md](TESTING-GUIDE.md) for detailed testing instructions.

## Common Test Commands

Open service worker console and try these:

```javascript
// Get current session
chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
  const response = await chrome.runtime.sendMessage({action: 'GET_SESSION'});
  console.log('Session:', response);
});

// List all objects
chrome.runtime.sendMessage(
  {action: 'GET_OBJECTS'},
  (r) => console.log(r)
);

// Export Account picklists
chrome.runtime.sendMessage(
  {action: 'EXPORT_PICKLISTS', objects: ['Account']},
  (r) => console.log(r)
);

// Export with dependencies
chrome.runtime.sendMessage(
  {action: 'EXPORT_DEPENDENCIES', objectName: 'Opportunity'},
  (r) => console.log(r)
);
```

## Success Indicators

When everything is working:

- ✅ Extension loads without errors
- ✅ Popup shows "Connected" on Salesforce pages
- ✅ Service worker console shows objects list
- ✅ Export generates valid JSON data
- ✅ No red errors in any console

You're ready to use the Picklist Manager! 🎉
