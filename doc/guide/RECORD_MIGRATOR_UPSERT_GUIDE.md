# Record Migrator UPSERT Guide

## Overview

The Record Migrator now supports **UPSERT** operations when using an external ID field. This means:
- If a record with the same external ID exists → **UPDATE** it
- If no matching external ID exists → **CREATE** a new record
- This prevents duplicate records on re-runs

## How It Works

### Step 1: Enable External ID (Step 5 - Review and Execute)

By default, the external ID feature is **already enabled**. In Step 5, you'll see:

```
External ID Field Mapping (Optional)
[ CHECKED ] Store source IDs in external ID field
Select External ID Field: [dropdown with available fields]
```

### Step 2: Select External ID Field

Choose a text field from your target object that:
- Is marked as an "External ID"
- Is of type "Text"
- Is createable (writable)

Common external ID fields:
- `External_ID__c`
- `Integration_Key__c`
- `Source_Record_ID__c`
- `API_Name__c`

### Step 3: Migration Execution

When you click **"Start Migration"**, the system will:

1. **Extract source Record IDs** from source org
2. **Store Record IDs** in the external ID field of target org records
3. **On subsequent runs**, use the external ID to find and update existing records

## Technical Details

### UPSERT API Endpoint

```
PATCH /services/data/v59.0/sobjects/{ObjectName}/{ExternalIdFieldName}/{ExternalIdValue}
```

**Example**:
```
PATCH /services/data/v59.0/sobjects/CompSuite__Department__c/External_ID__c/001D000000IRFmaIAH
```

### Data Flow

```
Source Org                          Target Org
──────────────                      ──────────
Record ID: 001xx                    External_ID__c: 001xx
Name: "Sales"        ────UPSERT──→  Name: "Sales"
State: "California"                 State: "California"

On Re-run:
                                    External_ID__c: 001xx (matches)
Record ID: 001xx                    → UPDATE existing record
Name: "Sales Updated"   ────UPSERT──→  Name: "Sales Updated"
State: "Texas"                      State: "Texas"
                                    (No duplicate created)
```

## API Responses

### Success Responses

**Record Created** (201 Created):
```json
{
  "id": "a03xx000000001",
  "success": true,
  "created": true
}
```

**Record Updated** (200 OK):
```json
{
  "id": "a03xx000000001",
  "success": true,
  "created": false
}
```

### Error Responses

**Invalid External ID**:
```json
[
  {
    "statusCode": "NOT_FOUND",
    "message": "The external ID field does not exist",
    "errorCode": "NOT_FOUND"
  }
]
```

**Permission Denied**:
```json
[
  {
    "statusCode": "INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY",
    "message": "You do not have permission to update this external ID field",
    "errorCode": "INSUFFICIENT_ACCESS"
  }
]
```

## Migration Scenarios

### Scenario 1: Initial Migration

**Setup**: First time migrating records
- External ID field exists on target object
- Checkbox: ENABLED
- Result: All records are **created** with external ID values

**Process**:
1. Record ID extracted: `001D000000IRFmaIAH`
2. Stored in External_ID__c: `001D000000IRFmaIAH`
3. New record created with external ID

### Scenario 2: Updated Migration

**Setup**: Re-running migration after modifying source records
- Same external ID field
- Checkbox: ENABLED
- Result: Existing records are **updated**, new records are **created**

**Process**:
1. Record ID extracted: `001D000000IRFmaIAH`
2. External ID found in target org
3. Record updated instead of duplicated
4. New source records create new target records

### Scenario 3: Sync Without External ID

**Setup**: No external ID field available
- Checkbox: DISABLED
- Result: All records are **created** (INSERT mode)

**Process**:
1. Standard INSERT via composite/sobjects API
2. New records always created
3. Older records not updated

## Step-by-Step Example

### Example: Migrating Departments

1. **Source Org Setup**:
   - Department: "Sales" (ID: `001D000000IRFma`)
   - Department: "Engineering" (ID: `001D000000IRFmb`)

2. **Target Org Setup**:
   - External ID field: `External_ID__c` (Text, Unique)
   - Field is createable (can be written to)

3. **Step 5 Configuration**:
   ```
   External ID Field Mapping
   [ CHECKED ] Store source IDs in external ID field
   Select External ID Field: External_ID__c
   ```

4. **First Migration Run**:
   - Upsert Sales → Create record with External_ID__c = `001D000000IRFma`
   - Upsert Engineering → Create record with External_ID__c = `001D000000IRFmb`

5. **Update Source Data**:
   - Sales now: "Sales Division" (still ID: `001D000000IRFma`)
   - Engineering now: "Engineering Division" (still ID: `001D000000IRFmb`)

6. **Second Migration Run**:
   - Upsert Sales Division → Update existing record (External_ID__c matches)
   - Upsert Engineering Division → Update existing record (External_ID__c matches)
   - **Result**: No duplicates, records updated

## Troubleshooting

### Issue: "External ID field does not exist"

**Cause**: Field name is incorrect or field is not marked as external ID

**Solution**:
1. Go to target org object definition
2. Check field "External ID" checkbox
3. Verify field API name matches selected field
4. Try migration again

### Issue: "You do not have permission to update this external ID field"

**Cause**: User profile lacks permissions to write to external ID field

**Solution**:
1. Check user profile permissions for the object
2. Enable "Create", "Read", "Update" on the field
3. Verify field-level security for the user
4. Ask org admin to grant permissions

### Issue: "Insufficient access on cross reference entity"

**Cause**: Similar to permission issue above

**Solution**: Check field-level security and object permissions

### Issue: UPSERT Running But No Updates

**Cause**: External ID values don't match between runs

**Possible reasons**:
- External ID field was cleared/changed on target records
- Different external ID field was selected
- Records were manually created without external ID

**Solution**:
1. Verify external ID values in target org
2. Select correct external ID field
3. Consider INSERT (re-create) if data is out of sync

## Performance Considerations

### UPSERT vs INSERT Performance

**UPSERT** (with external ID):
- One API call per record
- Slower for large datasets (>500 records)
- Best for: Updates + incremental migrations

**INSERT** (without external ID):
- Batch API calls (200 records per call)
- Faster for large initial migrations
- Best for: One-time migrations only

**Recommendation**:
- Use UPSERT for ongoing syncs
- Use INSERT for initial one-time migrations (disable external ID)

### API Rate Limits

Each UPSERT counts as one API call. With daily limits:
- Salesforce Org: 15,000 API calls/day
- This allows ~15,000 UPSERT operations per day

For larger migrations:
- Split into multiple jobs
- Schedule migrations during off-peak hours
- Monitor API usage in target org

## Best Practices

### 1. Create External ID Field First

Before migrating, create the external ID field:
```
Target Org Setup:
- Object: CompSuite__Department__c
- Field Name: Source_Record_ID__c
- Type: Text (255)
- External ID: CHECKED
- Unique: CHECKED
- Required: UNCHECKED
```

### 2. Always Enable External ID for Production

Default behavior (enabled) is correct for:
- Ongoing synchronization
- Multi-phase migrations
- Disaster recovery scenarios

### 3. Verify Field Mappings

Before step 5, ensure:
- External ID field exists on target object
- Field is writable (createable)
- No validation rules prevent writes
- No required fields are missing

### 4. Monitor Failures

Review the migration log for:
- Permission errors (fix before next run)
- Validation rule failures (update rules or data)
- Duplicate value errors (check external ID)

### 5. Test First

Always test on a sandbox:
1. Create test records in source org
2. Run migration to sandbox
3. Verify external ID values
4. Re-run migration (verify updates)
5. Then run on production

## Disabling UPSERT

If you need to use INSERT mode instead:

1. **Step 5**: Uncheck "Store source IDs in external ID field"
2. Migration will fall back to INSERT
3. External ID field will not be populated
4. Each run will create new records (use with caution!)

## API Details for Developers

### Request Format

```javascript
const externalIdValue = "001D000000IRFmaIAH";
const endpoint = `${instanceUrl}/services/data/v59.0/sobjects/Account/External_ID__c/${encodeURIComponent(externalIdValue)}`;

const response = await fetch(endpoint, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${sessionId}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    Name: 'Updated Name',
    Industry: 'Technology',
    // ... other fields
  })
});
```

### Response Handling

```javascript
if (response.ok) {
  const result = await response.json();
  // 200: Update | 201: Insert
  console.log('Success:', result.id, 'Created:', result.created);
} else {
  const error = await response.json();
  // Handle error
  console.error('UPSERT failed:', error);
}
```

## Related Documentation

- [Salesforce UPSERT API Docs](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/dome_upsert.htm)
- [External ID Field Setup](https://help.salesforce.com/s/articleView?id=sf.fields_external_id.htm)
- [Record Migrator Fixes Summary](RECORD_MIGRATOR_FIXES_SUMMARY.md)

---

**Last Updated**: December 21, 2025
**Version**: 1.8+
