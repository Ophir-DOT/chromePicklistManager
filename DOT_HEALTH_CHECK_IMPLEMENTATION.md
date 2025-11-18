# DOT Health Check Implementation

## Overview
The DOT Health Check feature has been successfully implemented in the Salesforce Picklist Manager extension. This feature runs 8 health validations on a Salesforce org and displays the results in a beautiful HTML report with PDF download capability.

## Implementation Summary

### Files Modified
1. **popup/index.html** - Added DOT Health Check button to main menu
2. **popup/app.js** - Added health check handler and HTML report generation logic

### Files Created
1. **background/health-check-api.js** - Core health check API with 8 validation functions

## Features Implemented

### 8 Health Check Validations

1. **Environment Settings**
   - Organization Name, Type, Is Sandbox, Instance Name
   - Uses standard Organization object
   - All Salesforce orgs have this data

2. **Security Settings**
   - Current User, Profile, User Role, Active Status
   - Validates current user's security context
   - Ensures user is active

3. **Org Limits**
   - File Storage and Data Storage usage
   - Displays usage percentages with color-coded status:
     - Green: ≤70% used
     - Yellow: 70-90% used
     - Red: >90% used

4. **API Usage**
   - Daily API calls used vs remaining
   - Shows percentage of daily API limit consumed
   - Warns when >70%, critical when >90%

5. **Object Statistics**
   - Counts of Accounts, Contacts, Leads, Opportunities
   - Provides quick overview of data volume
   - Works with standard objects only

6. **User Activity**
   - Active vs Inactive users
   - Total user count and active percentage
   - Helps track license utilization

7. **Document Storage**
   - ContentDocument and ContentVersion counts
   - Average versions per document
   - Tracks file storage metrics

8. **Workflow & Automation**
   - Pending approval processes
   - Active workflow instances
   - Monitors automation health

### Key Features

#### Parallel Execution
- All 8 checks run concurrently using `Promise.allSettled()`
- Shows total execution duration in report
- Gracefully handles partial failures

#### HTML Report
- Beautiful 2-column responsive tile layout
- Color-coded status indicators (green/yellow/red)
- Animated progress bars for storage metrics
- Displays org URL, timestamp, and execution duration
- Opens in new tab automatically

#### PDF Download
- "Download PDF" button triggers browser print dialog
- Print-optimized CSS removes backgrounds and buttons
- Page-break-aware for clean PDF output

#### Error Handling
- Partial results displayed even if some checks fail
- Error tiles show detailed error messages
- Console logging for debugging

## How to Use

### Running a Health Check

1. Navigate to a Salesforce org in Chrome
2. Click the extension icon to open the popup
3. Click the "DOT Health Check" button
4. Wait for the checks to complete (loading overlay appears)
5. HTML report opens in a new tab automatically

### Downloading PDF

1. Click the "Download PDF" button in the report
2. Browser's print dialog opens
3. Select "Save as PDF" as the destination
4. Click "Save"

## Customization

### Modifying Storage Thresholds

Edit `background/health-check-api.js` to adjust storage warning levels:

```javascript
const EXPECTED_VALUES = {
  storageThresholds: {
    warningPercent: 70,  // Adjust thresholds (default: 70%)
    criticalPercent: 90  // Adjust critical level (default: 90%)
  }
};
```

### Adding Custom Checks

To add your own health checks, add a new validation function in `background/health-check-api.js`:

```javascript
static async validateMyCustomCheck() {
  try {
    const query = `SELECT COUNT() FROM MyObject__c`;
    const result = await this.soqlQuery(query);

    return {
      name: 'My Custom Check',
      status: 'success',
      fields: [{
        label: 'Count',
        value: result.totalSize,
        expected: null,
        match: true
      }]
    };
  } catch (error) {
    return {
      name: 'My Custom Check',
      status: 'error',
      message: error.message,
      fields: []
    };
  }
}
```

Then add it to the `runAllHealthChecks()` method.

## Known Limitations

1. **Standard Objects Only**: All health checks use standard Salesforce objects (Organization, User, Account, Contact, etc.)
   - Works with all Salesforce orgs out of the box
   - No custom object dependencies

2. **API Version**: Uses Salesforce API v59.0 and v63.0
   - May need updates for newer API versions

3. **Permissions Required**: User must have read access to:
   - Organization object
   - User object
   - Standard objects (Account, Contact, Lead, Opportunity)
   - ContentDocument and ContentVersion
   - ProcessInstance

## Troubleshooting

### 401 Authentication Error
- **Cause**: Session expired or invalid
- **Solution**: Refresh the Salesforce page and try again
- **Note**: Extension uses cookies from Salesforce session

### Check Fails with "Insufficient permissions"
- **Cause**: User doesn't have read access to standard objects
- **Solution**: Grant read permission or run as System Administrator
- **Result**: Failed checks show as "error" with partial results displayed

### Storage metrics not displaying
- **Cause**: API version or permissions issue
- **Solution**: Ensure user has access to `/limits` endpoint
- **Note**: Some orgs restrict this for security reasons

### Network Error
- **Cause**: Not logged into Salesforce or CORS issue
- **Solution**:
  1. Ensure you're on a Salesforce page
  2. Refresh the Salesforce tab
  3. Try the health check again

## Testing Checklist

Before deploying:

1. ✅ Test on a Salesforce org with all required custom objects
2. ✅ Test with limited user permissions (verify partial results)
3. ✅ Verify PDF download works in Chrome
4. ✅ Test responsive layout on mobile
5. ✅ Verify all 8 health checks return expected data
6. ✅ Test error handling (e.g., disconnect from Salesforce)
7. ✅ Verify loading overlay appears and disappears correctly
8. ✅ Check console for any JavaScript errors

## Future Enhancements

Potential improvements (not implemented):

1. **User-Configurable Expected Values**: Allow users to set their own expected values in extension settings
2. **Historical Tracking**: Store results over time to show trends
3. **CSV Export**: Export results to CSV in addition to HTML
4. **Scheduled Checks**: Automatic health checks on a schedule
5. **Email Notifications**: Alert on critical issues
6. **Custom Check Builder**: Allow users to add their own health checks

## Support

For issues or questions:
- Check browser console for error messages
- Verify Salesforce session is active
- Ensure custom objects/fields exist in your org
- Review API permissions for the connected user
