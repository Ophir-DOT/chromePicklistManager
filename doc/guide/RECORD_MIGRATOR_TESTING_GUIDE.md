# Record Migrator - Testing Guide

**Version**: 1.8.0
**Last Updated**: 2025-12-10
**Status**: Ready for Testing

---

## Pre-Testing Setup

### Required Environment
1. **Two Salesforce Orgs**: Sandbox or Developer Edition recommended
   - Source Org: Where records will be copied FROM
   - Target Org: Where records will be copied TO
2. **Chrome Browser**: With DOT Toolkit extension installed
3. **Test Data**: Sample records in source org with various field types

### Test Data Preparation

#### Create Test Records in Source Org

**For Basic Testing:**
```
Object: Account
- Create 3-5 Account records
- Populate fields: Name, Industry, Phone, Website
- If using CompSuite: Set CompSuite__State__c to different States
```

**For External ID Testing (Target Org):**
```
1. Create custom field on Account object:
   - Field Type: Text(18)
   - Field Name: Source_Record_ID__c
   - Check "External ID" and "Unique" checkboxes
   - Make field visible to your profile
```

**For CompSuite__State__c Testing:**
```
Source Org States: Draft, In Review, Approved, Rejected
Target Org States: Must have matching Names (Draft, In Review, etc.)
```

**For Parent-Child Testing:**
```
Object: Account (parent)
- Create 2-3 Account records

Object: Contact (child)
- Create 2-3 Contacts per Account
- Link via AccountId lookup field
- Populate fields: FirstName, LastName, Email
```

---

## Test Scenarios

### Test 1: Basic Parent Record Migration ⭐ CRITICAL

**Objective**: Verify basic record migration without any advanced features

**Steps**:
1. Open Source Org in one browser tab
2. Open Target Org in another browser tab
3. Click DOT Toolkit extension icon
4. Click "Record Migrator" button (or press Ctrl+Shift+M)
5. **Step 1**: Verify both orgs appear in dropdowns
   - ✅ Check: Both orgs show correct names
   - ✅ Check: Source and target must be different (validation works)
6. Select Source and Target orgs, click "Next"
7. **Step 2**: Select "Account" object
   - ✅ Check: Object dropdown populates
   - ✅ Check: "Preview Records" button enables
8. Click "Preview Records" (no WHERE clause)
   - ✅ Check: Records table displays
   - ✅ Check: Can select/deselect individual records
   - ✅ Check: "Select All" / "Deselect All" work
9. Select 2-3 records, click "Next"
10. **Step 3**: Skip relationships - click "Next"
11. **Step 4**: Review summary
    - ✅ Check: Parent record count correct
    - ✅ Check: No relationships shown
12. Click "Start Migration"
    - ✅ Check: Progress bar appears
    - ✅ Check: Log updates in real-time
    - ✅ Check: Success message appears
13. **Verify in Target Org**:
    - Open Target Org
    - Go to Accounts
    - ✅ Check: New records exist with correct field values
    - ✅ Check: Record count matches

**Expected Console Logs**:
```
[RecordMigratorAPI] Starting migration...
[RecordMigratorAPI] Step 1: Exporting parent records...
[RecordMigratorAPI] Exported 3 parent records
[RecordMigratorAPI] Step 1.5: Building State ID mapping...
[RecordMigratorAPI] No CompSuite__State__c fields found in records
[RecordMigratorAPI] Step 2: Upserting parent records...
[RecordMigratorAPI] Upserting 3 parent records...
[RecordMigratorAPI] Migration complete: 3 parent records, 0 child records
```

---

### Test 2: External ID Field Mapping ⭐ CRITICAL

**Objective**: Verify External ID field stores source IDs correctly

**Prerequisites**:
- Target org has `Source_Record_ID__c` field created (see Pre-Testing Setup)

**Steps**:
1. Follow Test 1 steps 1-10 (up to Step 4)
2. **Step 4**:
   - ✅ Check: External ID section visible
   - Check checkbox: "Store source IDs in external ID field"
   - ✅ Check: Field dropdown appears
   - ✅ Check: `Source_Record_ID__c` appears in dropdown
3. Select `Source_Record_ID__c` from dropdown
4. Click "Start Migration"
5. Wait for completion
6. **Verify in Target Org**:
   - Open migrated Account records
   - ✅ Check: `Source_Record_ID__c` field populated with source org IDs
   - ✅ Check: IDs are 18 characters (Salesforce format)
   - ✅ Check: No "insufficient access rights" errors in log

**Expected Console Logs**:
```
[RecordMigratorAPI] Using external ID field: Source_Record_ID__c
[RecordMigratorAPI] Upserting 3 parent records...
```

**Expected Log Entries**:
```
[timestamp] Migration started...
[timestamp] Exporting parent records...
[timestamp] Exported 3 records successfully
[timestamp] Upserting records to target org...
[timestamp] Created 3 records successfully
[timestamp] Migration completed successfully!
```

---

### Test 3: CompSuite__State__c Automatic Remapping ⭐ CRITICAL

**Objective**: Verify State IDs are automatically remapped by Name

**Prerequisites**:
- Both orgs have `CompSuite__State__c` object with matching State Names
- Source Account records have `CompSuite__State__c` field populated

**Steps**:
1. In Source Org, note State values:
   - Record 1: State = "Draft" (ID: a1Vxxx001)
   - Record 2: State = "Approved" (ID: a1Vxxx002)
2. In Target Org, note State IDs:
   - "Draft" State has different ID (ID: a1Vyyy001)
   - "Approved" State has different ID (ID: a1Vyyy002)
3. Follow Test 1 migration flow
4. **Check Console Logs** during migration:
   - ✅ Check: "Building State ID mapping" appears
   - ✅ Check: Shows "Mapped State: Draft (a1Vxxx001 -> a1Vyyy001)"
   - ✅ Check: Shows "Remapped State ID: a1Vxxx001 -> a1Vyyy001"
5. **Verify in Target Org**:
   - Open migrated Account records
   - ✅ Check: `CompSuite__State__c` field has correct target org State IDs
   - ✅ Check: State Names match (Draft -> Draft, Approved -> Approved)
   - ✅ Check: No "Invalid cross reference id" errors

**Expected Console Logs**:
```
[RecordMigratorAPI] Step 1.5: Building State ID mapping...
[RecordMigratorAPI] Building State ID mapping for 2 states...
[RecordMigratorAPI] Mapped State: Draft (a1Vxxx001 -> a1Vyyy001)
[RecordMigratorAPI] Mapped State: Approved (a1Vxxx002 -> a1Vyyy002)
[RecordMigratorAPI] State ID mapping complete: 2 states mapped
[RecordMigratorAPI] Using State ID mapping for 2 states
[RecordMigratorAPI] Remapped State ID: a1Vxxx001 -> a1Vyyy001
[RecordMigratorAPI] Remapped State ID: a1Vxxx002 -> a1Vyyy002
```

---

### Test 4: Parent-Child Relationship Migration ⭐ CRITICAL

**Objective**: Verify child records migrate with correct parent references

**Prerequisites**:
- Source org has Accounts with related Contacts

**Steps**:
1. Follow Test 1 steps 1-9 (select Accounts)
2. **Step 3**: Click "Detect Child Relationships"
   - ✅ Check: Relationships table populates
   - ✅ Check: Shows "Contacts" relationship
   - ✅ Check: Shows correct lookup field (AccountId)
   - ✅ Check: Estimated count displays
3. Check "Contacts" relationship checkbox
4. Click "Next"
5. **Step 4**: Review summary
   - ✅ Check: Parent count = 3
   - ✅ Check: Child relationships count = 1
   - ✅ Check: Estimated child count = 6-9
6. Click "Start Migration"
7. Wait for completion
8. **Verify in Target Org**:
   - Open migrated Account records
   - ✅ Check: All Accounts created
   - Click "Related" tab on each Account
   - ✅ Check: Contacts appear under each Account
   - ✅ Check: Contact count matches source org
   - ✅ Check: Contact fields populated correctly
   - ✅ Check: AccountId points to correct target org Account

**Expected Console Logs**:
```
[RecordMigratorAPI] Step 3: Processing child relationships...
[RecordMigratorAPI] Exporting 6 child records for Contact
[RecordMigratorAPI] Exported 6 child records
[RecordMigratorAPI] Upserting 6 child records for Contact
[RecordMigratorAPI] Child upsert complete: 6 success, 0 failed
[RecordMigratorAPI] Migration complete: 3 parent records, 6 child records
```

---

### Test 5: SOQL WHERE Clause Filtering

**Objective**: Verify record filtering works correctly

**Steps**:
1. Follow Test 1 steps 1-7
2. **Step 2**: Enter WHERE clause: `Industry = 'Technology'`
3. Click "Preview Records"
   - ✅ Check: Only Technology industry Accounts shown
   - ✅ Check: Record count updates
4. Complete migration
5. **Verify**: Only filtered records migrated

**Test WHERE Clauses**:
```sql
Industry = 'Technology'
AnnualRevenue > 1000000
CreatedDate = THIS_YEAR
Name LIKE 'Test%'
(Industry = 'Finance' OR Industry = 'Banking') AND Rating = 'Hot'
```

---

### Test 6: Error Handling

**Objective**: Verify errors are handled gracefully

#### Test 6A: Required Field Missing
**Steps**:
1. In target org, make a field required (e.g., Phone on Account)
2. Source records don't have Phone populated
3. Migrate records
4. **Expected**:
   - ✅ Migration continues for valid records
   - ✅ Error message in log: "Required field missing: Phone"
   - ✅ Failed record count shown
   - ✅ Some records succeed, others fail

#### Test 6B: Validation Rule Failure
**Steps**:
1. In target org, create validation rule (e.g., "Phone must be 10 digits")
2. Source records have invalid phone numbers
3. Migrate records
4. **Expected**:
   - ✅ Validation error logged
   - ✅ Rule name shown in error message
   - ✅ Migration continues for valid records

#### Test 6C: No External ID Fields
**Steps**:
1. Target org has NO external ID fields
2. Check "Store source IDs in external ID field"
3. **Expected**:
   - ✅ Warning message: "No external ID fields found"
   - ✅ Dropdown remains empty
   - ✅ Can still migrate (checkbox disabled or ignored)

#### Test 6D: State Name Mismatch
**Steps**:
1. Source org has State "Pending Review"
2. Target org doesn't have State with that Name
3. Migrate records
4. **Expected**:
   - ✅ Warning logged: "No matching State found for: Pending Review"
   - ✅ CompSuite__State__c field cleared (null) in target
   - ✅ Migration continues successfully

---

### Test 7: UI/UX Testing

**Objective**: Verify user interface works correctly

#### Test 7A: Step Navigation
- ✅ Can navigate forward through steps
- ✅ Can navigate backward through steps
- ✅ Step indicator updates correctly
- ✅ "Next" buttons disable when invalid selections

#### Test 7B: Dark Mode
1. Enable dark mode in OS/browser
2. Open Record Migrator
3. **Check all steps**:
   - ✅ Background colors correct
   - ✅ Text readable (sufficient contrast)
   - ✅ Buttons styled correctly
   - ✅ Tables have dark backgrounds
   - ✅ Status messages visible
   - ✅ External ID section styled correctly

#### Test 7C: Status Messages
- ✅ Loading spinner shows during async operations
- ✅ Success messages green
- ✅ Error messages red
- ✅ Warning messages yellow/orange
- ✅ Messages auto-hide after success

#### Test 7D: Form Validation
- ✅ Can't select same org for source and target
- ✅ Can't proceed without selecting records
- ✅ "Preview Records" disabled until object selected
- ✅ "Start Migration" disabled until records selected

---

### Test 8: Large Dataset

**Objective**: Verify batching works with large record sets

**Steps**:
1. Select 50+ records (up to 200)
2. Migrate
3. **Expected**:
   - ✅ Batching occurs (200 records per batch)
   - ✅ Progress updates smoothly
   - ✅ All records migrate successfully
   - ✅ No timeout errors

**Note**: Test with 1000+ records if possible (requires Bulk API - future enhancement)

---

### Test 9: Export Log Functionality

**Objective**: Verify migration log can be exported

**Steps**:
1. Complete any migration test
2. Click "Export Log" button
3. **Expected**:
   - ✅ CSV file downloads
   - ✅ Filename includes timestamp
   - ✅ CSV contains: Timestamp, Severity, Message columns
   - ✅ All log entries included
   - ✅ Opens correctly in Excel/Sheets

**Sample CSV**:
```csv
Timestamp,Severity,Message
2025-12-10T09:15:23Z,info,Migration started...
2025-12-10T09:15:25Z,success,Exported 3 records successfully
2025-12-10T09:15:30Z,success,Created 3 records successfully
2025-12-10T09:15:31Z,success,Migration completed successfully!
```

---

### Test 10: Session Expiration Handling

**Objective**: Verify behavior when session expires

**Steps**:
1. Start migration
2. Wait for source org session to expire (or clear cookies)
3. Try to continue migration
4. **Expected**:
   - ✅ Error message: "Session expired"
   - ✅ Prompt to refresh page
   - ✅ No app crash

---

## Test Results Template

Use this template to record test results:

```markdown
## Test Results - [Date]

### Test 1: Basic Parent Record Migration
- Status: [ ] PASS / [ ] FAIL
- Notes:
- Issues Found:

### Test 2: External ID Field Mapping
- Status: [ ] PASS / [ ] FAIL
- Notes:
- Issues Found:

### Test 3: CompSuite__State__c Remapping
- Status: [ ] PASS / [ ] FAIL
- Notes:
- Issues Found:

### Test 4: Parent-Child Relationships
- Status: [ ] PASS / [ ] FAIL
- Notes:
- Issues Found:

### Test 5: SOQL Filtering
- Status: [ ] PASS / [ ] FAIL
- Notes:
- Issues Found:

### Test 6: Error Handling
- Status: [ ] PASS / [ ] FAIL
- Notes:
- Issues Found:

### Test 7: UI/UX
- Status: [ ] PASS / [ ] FAIL
- Notes:
- Issues Found:

### Test 8: Large Dataset
- Status: [ ] PASS / [ ] FAIL
- Notes:
- Issues Found:

### Test 9: Export Log
- Status: [ ] PASS / [ ] FAIL
- Notes:
- Issues Found:

### Test 10: Session Expiration
- Status: [ ] PASS / [ ] FAIL
- Notes:
- Issues Found:

### Overall Result
- Total Tests: 10
- Passed: X
- Failed: Y
- Critical Issues: [List]
- Minor Issues: [List]

### Ready for Release?
- [ ] YES - All critical tests passed
- [ ] NO - Issues need fixing
```

---

## Known Limitations

Document any known limitations discovered during testing:

1. **Max Records**: 10,000 records per migration (API limit)
2. **No Attachments**: File attachments not migrated
3. **No Formula Fields**: Formula fields excluded (read-only)
4. **No Audit Fields**: CreatedDate, LastModifiedDate not preserved
5. **Single Lookup**: Only CompSuite__State__c auto-remapped (others manual)

---

## Troubleshooting Guide

### Issue: No orgs found in dropdown
**Solution**:
- Open Salesforce tabs before opening Record Migrator
- Ensure you're logged into both orgs
- Refresh page and try again

### Issue: "Session expired" error
**Solution**:
- Refresh both Salesforce tabs
- Close and reopen Record Migrator
- Log back into Salesforce orgs

### Issue: Records fail to insert
**Solution**:
- Check required fields in target org
- Check validation rules
- Review error messages in migration log
- Verify user permissions in target org

### Issue: Child records not linking to parents
**Solution**:
- Verify relationship field is correct
- Check if lookup field is createable
- Review ID mapping in console logs

### Issue: CompSuite__State__c not remapping
**Solution**:
- Verify State Names match exactly (case-sensitive)
- Check CompSuite__State__c object exists in both orgs
- Review console logs for mapping details

---

## Console Debugging

### Enable Verbose Logging

Open browser console (F12) before starting migration to see detailed logs:

```javascript
// All RecordMigratorAPI logs are prefixed with:
[RecordMigratorAPI]

// Key log entries to watch for:
- "Found X unique sessions" - Session detection working
- "Exporting X parent records" - SOQL query successful
- "Building State ID mapping for X states" - State remapping triggered
- "Mapped State: [Name] ([sourceId] -> [targetId])" - State mapping successful
- "Upserting X parent records" - Insert starting
- "Using external ID field: [fieldName]" - External ID feature active
- "Migration complete: X parent records, Y child records" - Success!
```

### Common Error Messages

```
"No session cookie found" - Session detection failed
"Failed to describe [Object]" - Invalid object or permissions issue
"No matching State found" - State Name mismatch
"Required field missing" - Target org field validation failure
"Validation rule failed" - Target org validation rule triggered
```

---

## Performance Benchmarks

Target performance metrics:

| Records | Expected Time | Actual Time | Status |
|---------|--------------|-------------|--------|
| 10 records | < 5 seconds | | |
| 50 records | < 15 seconds | | |
| 100 records | < 30 seconds | | |
| 500 records | < 2 minutes | | |
| 1000 records | < 5 minutes | | |

---

## Post-Testing Checklist

After completing all tests:

- [ ] All critical tests passed
- [ ] All discovered bugs documented
- [ ] Known limitations documented
- [ ] User documentation updated
- [ ] CHANGELOG.md updated
- [ ] README.md updated with Record Migrator feature
- [ ] Screenshots captured (optional)
- [ ] Performance acceptable
- [ ] Dark mode works correctly
- [ ] Error handling verified
- [ ] Ready for production deployment

---

**Testing Complete!** 🎉

Document all results and issues found. Create GitHub issues for any bugs that need fixing before release.
