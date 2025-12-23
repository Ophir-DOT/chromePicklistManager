# CompSuite__State__c Automatic Remapping Feature

## Overview
The Record Migrator automatically remaps `CompSuite__State__c` lookup field values when migrating records between Salesforce orgs. This special field is a lookup to the `CompSuite__State__c` object and acts as a "Status" field found across multiple objects in CompSuite.

## Problem Statement
When migrating records between orgs, the `CompSuite__State__c` field contains record IDs from the source org that don't exist in the target org. Simply copying these IDs would cause:
- "Invalid cross reference id" errors
- Records failing to insert
- Loss of State relationship

## Solution
The Record Migrator now automatically:
1. Detects `CompSuite__State__c` fields in records being migrated
2. Queries the State record Names from the source org
3. Finds matching State records in the target org by Name
4. Remaps source State IDs to target State IDs
5. Updates records with correct target org State IDs before insert

## How It Works

### Step 1: Export Parent Records
```javascript
// Export parent records with all fields including CompSuite__State__c
const parentRecords = await exportParentRecords(sourceSession, 'Account', recordIds);
// Example record: { Id: '001xxx', Name: 'Acme Corp', CompSuite__State__c: 'a1V8d0000038bJm' }
```

### Step 2: Build State ID Mapping
```javascript
// Automatically builds mapping between source and target State IDs
const stateIdMapping = await buildStateIdMapping(sourceSession, targetSession, parentRecords);

// Example mapping:
// {
//   'a1V8d0000038bJm': 'a1V9E000000QzXYQA0',  // Source ID -> Target ID
//   'a1V8d0000038bJl': 'a1V9E000000QzXZQA0'
// }
```

**Internal Process:**
1. **Collect State IDs**: Scan all parent records for `CompSuite__State__c` field values
2. **Query Source States**:
   ```sql
   SELECT Id, Name FROM CompSuite__State__c
   WHERE Id IN ('a1V8d0000038bJm', 'a1V8d0000038bJl')
   ```
3. **Query Target States**:
   ```sql
   SELECT Id, Name FROM CompSuite__State__c
   WHERE Name IN ('Draft', 'Approved', 'Rejected')
   ```
4. **Build Mapping**: Match States by Name and create source ID → target ID mapping

### Step 3: Upsert Parent Records with Remapping
```javascript
// Before insert, remap CompSuite__State__c field
const parentResults = await upsertParentRecords(
  targetSession,
  'Account',
  parentRecords,
  externalIdField,
  stateIdMapping // <-- Pass State mapping
);

// Internal remapping logic:
if (cleanRecord.CompSuite__State__c && stateIdMapping[cleanRecord.CompSuite__State__c]) {
  const originalStateId = cleanRecord.CompSuite__State__c;
  cleanRecord.CompSuite__State__c = stateIdMapping[originalStateId];
  // 'a1V8d0000038bJm' becomes 'a1V9E000000QzXYQA0'
}
```

### Step 4: Upsert Child Records with Remapping
```javascript
// Child records also get State remapping applied
const childResults = await upsertChildRecords(
  targetSession,
  relationship,
  childRecords,
  parentIdMapping,
  stateIdMapping // <-- Pass State mapping to child records too
);
```

## Example Migration Scenario

### Source Org Data
**Account Records:**
```javascript
[
  {
    Id: '001xxx001',
    Name: 'Acme Corp',
    CompSuite__State__c: 'a1V8d0000038bJm' // "Draft" State in source org
  },
  {
    Id: '001xxx002',
    Name: 'Widget Inc',
    CompSuite__State__c: 'a1V8d0000038bJl' // "Approved" State in source org
  }
]
```

**State Records (Source Org):**
```javascript
[
  { Id: 'a1V8d0000038bJm', Name: 'Draft' },
  { Id: 'a1V8d0000038bJl', Name: 'Approved' }
]
```

### Target Org Data
**State Records (Target Org):**
```javascript
[
  { Id: 'a1V9E000000QzXYQA0', Name: 'Draft' },    // Different ID, same Name
  { Id: 'a1V9E000000QzXZQA0', Name: 'Approved' }  // Different ID, same Name
]
```

### Migration Result
**Migrated Account Records (Target Org):**
```javascript
[
  {
    Id: '001yyy001', // New ID in target org
    Name: 'Acme Corp',
    CompSuite__State__c: 'a1V9E000000QzXYQA0' // ✅ Correctly remapped to target org's "Draft" State
  },
  {
    Id: '001yyy002', // New ID in target org
    Name: 'Widget Inc',
    CompSuite__State__c: 'a1V9E000000QzXZQA0' // ✅ Correctly remapped to target org's "Approved" State
  }
]
```

## Console Log Output

When State remapping occurs, you'll see detailed logs:

```
[RecordMigratorAPI] Step 1.5: Building State ID mapping...
[RecordMigratorAPI] Building State ID mapping for 2 states...
[RecordMigratorAPI] Mapped State: Draft (a1V8d0000038bJm -> a1V9E000000QzXYQA0)
[RecordMigratorAPI] Mapped State: Approved (a1V8d0000038bJl -> a1V9E000000QzXZQA0)
[RecordMigratorAPI] State ID mapping complete: 2 states mapped
[RecordMigratorAPI] Step 2: Upserting parent records...
[RecordMigratorAPI] Using State ID mapping for 2 states
[RecordMigratorAPI] Remapped State ID: a1V8d0000038bJm -> a1V9E000000QzXYQA0
[RecordMigratorAPI] Remapped State ID: a1V8d0000038bJl -> a1V9E000000QzXZQA0
```

## Error Handling

### No State Records in Source Org
If State IDs exist in records but can't be queried:
```
[RecordMigratorAPI] No State records found in source org
```
**Behavior**: Migration continues, but `CompSuite__State__c` field will be cleared (set to null) in target records.

### No Matching State in Target Org
If a State exists in source but not in target org by Name:
```
[RecordMigratorAPI] No matching State found in target org for: Pending Review
```
**Behavior**: Warning logged, that specific State won't be remapped (field cleared for those records).

### CompSuite__State__c Object Doesn't Exist
If querying State records fails (object doesn't exist in org):
```
[RecordMigratorAPI] Error building State ID mapping: sObject type 'CompSuite__State__c' is not supported
```
**Behavior**: Empty mapping returned, migration continues without State remapping.

## Implementation Details

### Functions Added

#### `buildStateIdMapping(sourceSession, targetSession, records)`
**Location**: `background/record-migrator-api.js:330-396`

**Purpose**: Builds a mapping of source State IDs to target State IDs by querying both orgs

**Returns**:
```javascript
{
  'a1V8d0000038bJm': 'a1V9E000000QzXYQA0', // source ID -> target ID
  'a1V8d0000038bJl': 'a1V9E000000QzXZQA0'
}
```

**Algorithm**:
1. Collect unique State IDs from records
2. Query source org: `SELECT Id, Name FROM CompSuite__State__c WHERE Id IN (...)`
3. Query target org: `SELECT Id, Name FROM CompSuite__State__c WHERE Name IN (...)`
4. Match by Name and build ID mapping

#### Updated: `upsertParentRecords(targetSession, objectName, records, externalIdField, stateIdMapping)`
**Location**: `background/record-migrator-api.js:467`

**New Parameter**: `stateIdMapping` (optional, default: `{}`)

**Behavior**: Before inserting each record, checks if `CompSuite__State__c` exists and remaps using the mapping

#### Updated: `upsertChildRecords(targetSession, relationship, records, idMapping, stateIdMapping)`
**Location**: `background/record-migrator-api.js:574`

**New Parameter**: `stateIdMapping` (optional, default: `{}`)

**Behavior**: Same remapping logic applied to child records

#### Updated: `migrateRecords(sourceSession, targetSession, config)`
**Location**: `background/record-migrator-api.js:667`

**New Step**: Step 1.5 added between export and upsert to build State mapping

## Benefits

1. ✅ **Automatic**: No user configuration required - works automatically when `CompSuite__State__c` field detected
2. ✅ **Name-Based Matching**: Uses State Name for matching, which is consistent across orgs
3. ✅ **Safe**: Non-breaking - if State remapping fails, migration continues (field cleared)
4. ✅ **Works for All Objects**: Applies to any object with `CompSuite__State__c` field
5. ✅ **Child Record Support**: Also remaps State in child records during parent-child migrations
6. ✅ **Detailed Logging**: Console logs show exactly which States were remapped

## Limitations

1. **Name Matching Only**: Requires State records in both orgs to have identical `Name` values
2. **No Custom Mapping**: Cannot manually specify State mappings (automatic only)
3. **Single Object**: Only remaps `CompSuite__State__c` field (not other lookup fields)
4. **Case Sensitive**: State Name matching is case-sensitive

## Future Enhancements

### Possible Future Improvements:
1. **Generic Lookup Remapping**: Extend to any lookup field, not just `CompSuite__State__c`
2. **Custom Mapping UI**: Allow users to manually map State values before migration
3. **Fuzzy Name Matching**: Handle slight name variations (e.g., "Draft" vs "draft")
4. **Multiple Field Support**: Remap multiple standard lookup fields automatically
5. **Mapping Preview**: Show State mapping in Step 4 summary before migration starts

## Testing Checklist

### Test Scenarios:
- [ ] Migrate records with `CompSuite__State__c` populated
- [ ] Migrate records without `CompSuite__State__c` field
- [ ] Migrate when State Names match in both orgs
- [ ] Migrate when some State Names don't exist in target org
- [ ] Migrate when `CompSuite__State__c` object doesn't exist in one org
- [ ] Migrate child records that also have `CompSuite__State__c` field
- [ ] Verify console logs show correct State remapping
- [ ] Verify migration continues even if State remapping fails

## Related Files

- `background/record-migrator-api.js` - Core implementation
- `EXTERNAL_ID_IMPLEMENTATION.md` - Related External ID feature
- `RECORD_MIGRATOR_STATUS.md` - Overall implementation status
- `.v1.8-progress.md` - Version progress tracking

---

**Implementation Date**: 2025-12-10
**Feature Status**: ✅ Implemented and Ready for Testing
