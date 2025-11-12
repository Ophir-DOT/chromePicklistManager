# Quick Reference Card

## Installation (30 seconds)

```
1. chrome://extensions/
2. Enable Developer mode
3. Load unpacked → Select chromePicklistManager folder
4. Done!
```

## First Test (2 minutes)

```
1. Open Salesforce org
2. Click extension icon
3. Should show: "Connected" ✅
```

## Test Export (Service Worker Console)

```javascript
// Get objects
chrome.runtime.sendMessage(
  {action: 'GET_OBJECTS'},
  r => console.log(r)
);

// Export Account
chrome.runtime.sendMessage(
  {action: 'EXPORT_PICKLISTS', objects: ['Account']},
  r => console.log(r)
);
```

## File Structure

```
chromePicklistManager/
├── manifest.json           ← Extension config
├── background/
│   ├── service-worker.js   ← Main controller
│   ├── session-manager.js  ← Reads Salesforce session
│   ├── metadata-api.js     ← SOAP API calls
│   └── storage-manager.js  ← Chrome storage
├── content/
│   ├── injector.js         ← Injects UI on SF pages
│   └── styles.css
├── popup/                   ← Extension popup
├── sidepanel/              ← Full UI
└── lib/
    └── jszip.min.js        ← Deployment packages
```

## Key Actions

| Action | Purpose |
|--------|---------|
| `GET_SESSION` | Extract Salesforce session |
| `GET_OBJECTS` | List all objects |
| `EXPORT_PICKLISTS` | Export picklist metadata |
| `EXPORT_DEPENDENCIES` | Export with dependencies |
| `COMPARE_ORGS` | Compare two exports |
| `DEPLOY_CHANGES` | Deploy to org |

## Troubleshooting

### Not Connected
- Log into Salesforce
- Refresh page
- Check you're on *.salesforce.com

### Can't Load Extension
- Check all files exist
- Icons are in icons/ folder
- manifest.json is valid

### No Objects
- Check service worker console
- Verify Salesforce session
- May need API permissions

## Testing Commands

Open `chrome://extensions/` → Click "service worker"

```javascript
// Test session
chrome.tabs.query({active:true}, (tabs) => {
  chrome.runtime.sendMessage({action:'GET_SESSION'},
    r => console.log(r)
  );
});

// Test export
chrome.runtime.sendMessage(
  {action:'EXPORT_PICKLISTS', objects:['Account','Contact']},
  r => console.log(r)
);

// Test compare
chrome.runtime.sendMessage({
  action:'COMPARE_ORGS',
  source: {...},  // your export
  target: {...}   // other org export
}, r => console.log(r));
```

## Documentation Files

| File | Purpose |
|------|---------|
| [QUICK-START.md](QUICK-START.md) | 5-minute setup |
| [TESTING-GUIDE.md](TESTING-GUIDE.md) | Detailed testing |
| [SETUP-COMPLETE.md](SETUP-COMPLETE.md) | Feature status |
| [README.md](README.md) | Project overview |

## Export JSON Format

```json
{
  "Account": {
    "Industry": {
      "label": "Industry",
      "type": "Picklist",
      "values": [
        {"fullName": "Agriculture", "label": "Agriculture"}
      ],
      "controllingField": null,
      "valueSettings": [],
      "restricted": false
    }
  }
}
```

## Status Indicators

| Status | Meaning |
|--------|---------|
| 🟢 Connected | Session active |
| 🔴 Disconnected | Not logged in |
| ⚠️ Warning | Check permissions |

## Quick Tips

✅ Test in sandbox first
✅ Use "Check Only" for deployments
✅ Export before making changes
✅ Keep API limits in mind
✅ Check service worker for errors

## Need More Help?

1. Check TESTING-GUIDE.md for details
2. Review service worker console
3. Verify Salesforce permissions
4. Check browser console (F12)
