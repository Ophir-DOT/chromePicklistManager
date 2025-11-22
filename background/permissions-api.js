// Permissions API Client
// Provides methods to query and compare Salesforce Profile and Permission Set permissions
// Uses Tooling API for PermissionSet, Profile, FieldPermissions, ObjectPermissions

import SalesforceAPI from './api-client.js';

class PermissionsAPI {
  /**
   * Query all Profiles
   * @param {object} options - Query options
   * @param {number} options.limit - Maximum number of records to return (default 200)
   * @returns {Promise<Array>} Array of profile records
   */
  static async getProfiles(options = {}) {

    const { limit = 200 } = options;

    const query = `
      SELECT Id, Name, UserLicense.Name, UserType, Description
      FROM Profile
      ORDER BY Name
      LIMIT ${limit}
    `;

    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      return response.records || [];
    } catch (error) {
      console.error('[PermissionsAPI] Error querying profiles:', error);
      throw error;
    }
  }

  /**
   * Query all Permission Sets (excluding those associated with profiles)
   * @param {object} options - Query options
   * @param {number} options.limit - Maximum number of records to return (default 200)
   * @returns {Promise<Array>} Array of permission set records
   */
  static async getPermissionSets(options = {}) {

    const { limit = 200 } = options;

    const query = `
      SELECT Id, Name, Label, Description, IsOwnedByProfile,
             License.Name, NamespacePrefix, Type
      FROM PermissionSet
      WHERE IsOwnedByProfile = false
      ORDER BY Label
      LIMIT ${limit}
    `;

    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      return response.records || [];
    } catch (error) {
      console.error('[PermissionsAPI] Error querying permission sets:', error);
      throw error;
    }
  }

  /**
   * Get the Permission Set ID for a Profile
   * @param {string} profileId - The Profile ID
   * @returns {Promise<string>} The PermissionSet ID
   */
  static async getPermissionSetIdForProfile(profileId) {

    const query = `
      SELECT Id
      FROM PermissionSet
      WHERE ProfileId = '${profileId}'
      LIMIT 1
    `;

    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      if (response.records && response.records.length > 0) {
        return response.records[0].Id;
      }
      throw new Error(`No PermissionSet found for Profile ${profileId}`);
    } catch (error) {
      console.error('[PermissionsAPI] Error getting PermissionSet for profile:', error);
      throw error;
    }
  }

  /**
   * Get Field Permissions for a Permission Set or Profile
   * @param {string} permissionSetId - The PermissionSet ID (or the PermissionSet associated with a Profile)
   * @returns {Promise<Array>} Array of field permission records
   */
  static async getFieldPermissions(permissionSetId) {

    const query = `
      SELECT Id, Field, SobjectType, PermissionsEdit, PermissionsRead, ParentId
      FROM FieldPermissions
      WHERE ParentId = '${permissionSetId}'
      ORDER BY SobjectType, Field
    `;

    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      return response.records || [];
    } catch (error) {
      console.error('[PermissionsAPI] Error querying field permissions:', error);
      throw error;
    }
  }

  /**
   * Get Object Permissions for a Permission Set or Profile
   * @param {string} permissionSetId - The PermissionSet ID
   * @returns {Promise<Array>} Array of object permission records
   */
  static async getObjectPermissions(permissionSetId) {

    const query = `
      SELECT Id, SobjectType, ParentId,
             PermissionsCreate, PermissionsRead, PermissionsEdit,
             PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords
      FROM ObjectPermissions
      WHERE ParentId = '${permissionSetId}'
      ORDER BY SobjectType
    `;

    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      return response.records || [];
    } catch (error) {
      console.error('[PermissionsAPI] Error querying object permissions:', error);
      throw error;
    }
  }

  /**
   * Get all permissions for a Profile or Permission Set
   * @param {string} id - The Profile or PermissionSet ID
   * @param {string} type - 'Profile' or 'PermissionSet'
   * @returns {Promise<object>} Object containing field and object permissions
   */
  static async getAllPermissions(id, type) {

    let permissionSetId = id;

    // If it's a Profile, get the associated PermissionSet
    if (type === 'Profile') {
      permissionSetId = await this.getPermissionSetIdForProfile(id);
    }

    // Fetch field and object permissions in parallel
    const [fieldPermissions, objectPermissions] = await Promise.all([
      this.getFieldPermissions(permissionSetId),
      this.getObjectPermissions(permissionSetId)
    ]);

    return {
      permissionSetId,
      fieldPermissions,
      objectPermissions
    };
  }

  /**
   * Compare permissions between two profiles/permission sets
   * @param {object} source - Source permissions {id, type, name}
   * @param {object} target - Target permissions {id, type, name}
   * @returns {Promise<object>} Comparison results
   */
  static async comparePermissions(source, target) {

    // Get all permissions for both
    const [sourcePerms, targetPerms] = await Promise.all([
      this.getAllPermissions(source.id, source.type),
      this.getAllPermissions(target.id, target.type)
    ]);

    // Compare object permissions
    const objectComparison = this.compareObjectPermissions(
      sourcePerms.objectPermissions,
      targetPerms.objectPermissions
    );

    // Compare field permissions
    const fieldComparison = this.compareFieldPermissions(
      sourcePerms.fieldPermissions,
      targetPerms.fieldPermissions
    );

    // Calculate summary
    const summary = {
      objectsTotal: objectComparison.all.length,
      objectsMatching: objectComparison.matching.length,
      objectsDifferent: objectComparison.different.length,
      objectsSourceOnly: objectComparison.sourceOnly.length,
      objectsTargetOnly: objectComparison.targetOnly.length,
      fieldsTotal: fieldComparison.all.length,
      fieldsMatching: fieldComparison.matching.length,
      fieldsDifferent: fieldComparison.different.length,
      fieldsSourceOnly: fieldComparison.sourceOnly.length,
      fieldsTargetOnly: fieldComparison.targetOnly.length
    };

    return {
      source: {
        ...source,
        permissionSetId: sourcePerms.permissionSetId
      },
      target: {
        ...target,
        permissionSetId: targetPerms.permissionSetId
      },
      objectComparison,
      fieldComparison,
      summary
    };
  }

  /**
   * Compare object permissions between two sets
   * @param {Array} sourcePerms - Source object permissions
   * @param {Array} targetPerms - Target object permissions
   * @returns {object} Comparison results
   */
  static compareObjectPermissions(sourcePerms, targetPerms) {
    // Create maps for quick lookup
    const sourceMap = new Map();
    sourcePerms.forEach(p => {
      sourceMap.set(p.SobjectType, p);
    });

    const targetMap = new Map();
    targetPerms.forEach(p => {
      targetMap.set(p.SobjectType, p);
    });

    // Get all unique objects
    const allObjects = new Set([...sourceMap.keys(), ...targetMap.keys()]);

    const matching = [];
    const different = [];
    const sourceOnly = [];
    const targetOnly = [];
    const all = [];

    allObjects.forEach(objectName => {
      const sourcePerm = sourceMap.get(objectName);
      const targetPerm = targetMap.get(objectName);

      const comparison = {
        objectName,
        source: sourcePerm ? this.formatObjectPerm(sourcePerm) : null,
        target: targetPerm ? this.formatObjectPerm(targetPerm) : null
      };

      all.push(comparison);

      if (!sourcePerm) {
        targetOnly.push(comparison);
      } else if (!targetPerm) {
        sourceOnly.push(comparison);
      } else {
        // Both have permissions - check if they match
        const match = this.objectPermsMatch(sourcePerm, targetPerm);
        if (match) {
          matching.push(comparison);
        } else {
          different.push(comparison);
        }
      }
    });

    return { all, matching, different, sourceOnly, targetOnly };
  }

  /**
   * Compare field permissions between two sets
   * @param {Array} sourcePerms - Source field permissions
   * @param {Array} targetPerms - Target field permissions
   * @returns {object} Comparison results
   */
  static compareFieldPermissions(sourcePerms, targetPerms) {
    // Create maps for quick lookup
    const sourceMap = new Map();
    sourcePerms.forEach(p => {
      sourceMap.set(p.Field, p);
    });

    const targetMap = new Map();
    targetPerms.forEach(p => {
      targetMap.set(p.Field, p);
    });

    // Get all unique fields
    const allFields = new Set([...sourceMap.keys(), ...targetMap.keys()]);

    const matching = [];
    const different = [];
    const sourceOnly = [];
    const targetOnly = [];
    const all = [];

    allFields.forEach(fieldKey => {
      const sourcePerm = sourceMap.get(fieldKey);
      const targetPerm = targetMap.get(fieldKey);

      const comparison = {
        field: fieldKey,
        objectName: sourcePerm?.SobjectType || targetPerm?.SobjectType,
        source: sourcePerm ? this.formatFieldPerm(sourcePerm) : null,
        target: targetPerm ? this.formatFieldPerm(targetPerm) : null
      };

      all.push(comparison);

      if (!sourcePerm) {
        targetOnly.push(comparison);
      } else if (!targetPerm) {
        sourceOnly.push(comparison);
      } else {
        // Both have permissions - check if they match
        const match = this.fieldPermsMatch(sourcePerm, targetPerm);
        if (match) {
          matching.push(comparison);
        } else {
          different.push(comparison);
        }
      }
    });

    return { all, matching, different, sourceOnly, targetOnly };
  }

  /**
   * Format object permission for display
   * @param {object} perm - Object permission record
   * @returns {object} Formatted permission
   */
  static formatObjectPerm(perm) {
    return {
      create: perm.PermissionsCreate,
      read: perm.PermissionsRead,
      edit: perm.PermissionsEdit,
      delete: perm.PermissionsDelete,
      viewAll: perm.PermissionsViewAllRecords,
      modifyAll: perm.PermissionsModifyAllRecords
    };
  }

  /**
   * Format field permission for display
   * @param {object} perm - Field permission record
   * @returns {object} Formatted permission
   */
  static formatFieldPerm(perm) {
    return {
      read: perm.PermissionsRead,
      edit: perm.PermissionsEdit
    };
  }

  /**
   * Check if two object permissions match
   * @param {object} a - First permission
   * @param {object} b - Second permission
   * @returns {boolean} True if they match
   */
  static objectPermsMatch(a, b) {
    return a.PermissionsCreate === b.PermissionsCreate &&
           a.PermissionsRead === b.PermissionsRead &&
           a.PermissionsEdit === b.PermissionsEdit &&
           a.PermissionsDelete === b.PermissionsDelete &&
           a.PermissionsViewAllRecords === b.PermissionsViewAllRecords &&
           a.PermissionsModifyAllRecords === b.PermissionsModifyAllRecords;
  }

  /**
   * Check if two field permissions match
   * @param {object} a - First permission
   * @param {object} b - Second permission
   * @returns {boolean} True if they match
   */
  static fieldPermsMatch(a, b) {
    return a.PermissionsRead === b.PermissionsRead &&
           a.PermissionsEdit === b.PermissionsEdit;
  }

  /**
   * Export permissions to JSON format
   * @param {Array} profiles - Selected profiles
   * @param {Array} permissionSets - Selected permission sets
   * @param {object} permissionsData - Permissions data keyed by ID
   * @returns {string} JSON string
   */
  static exportToJSON(profiles, permissionSets, permissionsData) {

    const exportData = {
      exportDate: new Date().toISOString(),
      profiles: profiles.map(p => ({
        id: p.Id,
        name: p.Name,
        license: p.UserLicense?.Name,
        objectPermissions: permissionsData[p.Id]?.objectPermissions || [],
        fieldPermissions: permissionsData[p.Id]?.fieldPermissions || []
      })),
      permissionSets: permissionSets.map(ps => ({
        id: ps.Id,
        name: ps.Name,
        label: ps.Label,
        license: ps.License?.Name,
        namespace: ps.NamespacePrefix,
        objectPermissions: permissionsData[ps.Id]?.objectPermissions || [],
        fieldPermissions: permissionsData[ps.Id]?.fieldPermissions || []
      }))
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export permissions to CSV format
   * @param {Array} profiles - Selected profiles
   * @param {Array} permissionSets - Selected permission sets
   * @param {object} permissionsData - Permissions data keyed by ID
   * @param {string} exportType - 'object' or 'field'
   * @returns {string} CSV string
   */
  static exportToCSV(profiles, permissionSets, permissionsData, exportType = 'object') {

    const rows = [];

    if (exportType === 'object') {
      // Object permissions CSV
      rows.push([
        'Profile/Permission Set Type',
        'Profile/Permission Set Name',
        'Object',
        'Create',
        'Read',
        'Edit',
        'Delete',
        'View All',
        'Modify All'
      ]);

      // Add profile object permissions
      profiles.forEach(profile => {
        const perms = permissionsData[profile.Id]?.objectPermissions || [];
        perms.forEach(perm => {
          rows.push([
            'Profile',
            profile.Name,
            perm.SobjectType,
            perm.PermissionsCreate ? 'TRUE' : 'FALSE',
            perm.PermissionsRead ? 'TRUE' : 'FALSE',
            perm.PermissionsEdit ? 'TRUE' : 'FALSE',
            perm.PermissionsDelete ? 'TRUE' : 'FALSE',
            perm.PermissionsViewAllRecords ? 'TRUE' : 'FALSE',
            perm.PermissionsModifyAllRecords ? 'TRUE' : 'FALSE'
          ]);
        });
      });

      // Add permission set object permissions
      permissionSets.forEach(ps => {
        const perms = permissionsData[ps.Id]?.objectPermissions || [];
        perms.forEach(perm => {
          rows.push([
            'Permission Set',
            ps.Label || ps.Name,
            perm.SobjectType,
            perm.PermissionsCreate ? 'TRUE' : 'FALSE',
            perm.PermissionsRead ? 'TRUE' : 'FALSE',
            perm.PermissionsEdit ? 'TRUE' : 'FALSE',
            perm.PermissionsDelete ? 'TRUE' : 'FALSE',
            perm.PermissionsViewAllRecords ? 'TRUE' : 'FALSE',
            perm.PermissionsModifyAllRecords ? 'TRUE' : 'FALSE'
          ]);
        });
      });
    } else {
      // Field permissions CSV
      rows.push([
        'Profile/Permission Set Type',
        'Profile/Permission Set Name',
        'Object',
        'Field',
        'Read',
        'Edit'
      ]);

      // Add profile field permissions
      profiles.forEach(profile => {
        const perms = permissionsData[profile.Id]?.fieldPermissions || [];
        perms.forEach(perm => {
          rows.push([
            'Profile',
            profile.Name,
            perm.SobjectType,
            perm.Field,
            perm.PermissionsRead ? 'TRUE' : 'FALSE',
            perm.PermissionsEdit ? 'TRUE' : 'FALSE'
          ]);
        });
      });

      // Add permission set field permissions
      permissionSets.forEach(ps => {
        const perms = permissionsData[ps.Id]?.fieldPermissions || [];
        perms.forEach(perm => {
          rows.push([
            'Permission Set',
            ps.Label || ps.Name,
            perm.SobjectType,
            perm.Field,
            perm.PermissionsRead ? 'TRUE' : 'FALSE',
            perm.PermissionsEdit ? 'TRUE' : 'FALSE'
          ]);
        });
      });
    }

    // Convert to CSV string
    const csv = rows.map(row =>
      row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return '"' + cellStr.replace(/"/g, '""') + '"';
        }
        return cellStr;
      }).join(',')
    ).join('\n');

    return csv;
  }

  /**
   * Export comparison results to CSV
   * @param {object} comparison - Comparison results
   * @param {string} type - 'object' or 'field'
   * @returns {string} CSV string
   */
  static exportComparisonToCSV(comparison, type = 'object') {

    const rows = [];
    const sourceName = comparison.source.name;
    const targetName = comparison.target.name;

    if (type === 'object') {
      rows.push([
        'Object',
        'Status',
        `${sourceName} - Create`,
        `${sourceName} - Read`,
        `${sourceName} - Edit`,
        `${sourceName} - Delete`,
        `${sourceName} - View All`,
        `${sourceName} - Modify All`,
        `${targetName} - Create`,
        `${targetName} - Read`,
        `${targetName} - Edit`,
        `${targetName} - Delete`,
        `${targetName} - View All`,
        `${targetName} - Modify All`
      ]);

      comparison.objectComparison.all.forEach(item => {
        let status = 'Matching';
        if (!item.source) status = `${targetName} Only`;
        else if (!item.target) status = `${sourceName} Only`;
        else if (comparison.objectComparison.different.find(d => d.objectName === item.objectName)) {
          status = 'Different';
        }

        rows.push([
          item.objectName,
          status,
          item.source?.create ? 'TRUE' : 'FALSE',
          item.source?.read ? 'TRUE' : 'FALSE',
          item.source?.edit ? 'TRUE' : 'FALSE',
          item.source?.delete ? 'TRUE' : 'FALSE',
          item.source?.viewAll ? 'TRUE' : 'FALSE',
          item.source?.modifyAll ? 'TRUE' : 'FALSE',
          item.target?.create ? 'TRUE' : 'FALSE',
          item.target?.read ? 'TRUE' : 'FALSE',
          item.target?.edit ? 'TRUE' : 'FALSE',
          item.target?.delete ? 'TRUE' : 'FALSE',
          item.target?.viewAll ? 'TRUE' : 'FALSE',
          item.target?.modifyAll ? 'TRUE' : 'FALSE'
        ]);
      });
    } else {
      rows.push([
        'Object',
        'Field',
        'Status',
        `${sourceName} - Read`,
        `${sourceName} - Edit`,
        `${targetName} - Read`,
        `${targetName} - Edit`
      ]);

      comparison.fieldComparison.all.forEach(item => {
        let status = 'Matching';
        if (!item.source) status = `${targetName} Only`;
        else if (!item.target) status = `${sourceName} Only`;
        else if (comparison.fieldComparison.different.find(d => d.field === item.field)) {
          status = 'Different';
        }

        rows.push([
          item.objectName,
          item.field,
          status,
          item.source?.read ? 'TRUE' : 'FALSE',
          item.source?.edit ? 'TRUE' : 'FALSE',
          item.target?.read ? 'TRUE' : 'FALSE',
          item.target?.edit ? 'TRUE' : 'FALSE'
        ]);
      });
    }

    // Convert to CSV string
    const csv = rows.map(row =>
      row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return '"' + cellStr.replace(/"/g, '""') + '"';
        }
        return cellStr;
      }).join(',')
    ).join('\n');

    return csv;
  }

  /**
   * Parse imported permission data from CSV
   * @param {string} csvContent - CSV content
   * @returns {object} Parsed permission data
   */
  static parseImportCSV(csvContent) {

    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const headers = this.parseCSVLine(lines[0]);
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }

    // Detect CSV type based on headers
    const isObjectPermissions = headers.includes('Create') || headers.includes('Delete');
    const isFieldPermissions = headers.includes('Field');

    return {
      type: isObjectPermissions ? 'object' : (isFieldPermissions ? 'field' : 'unknown'),
      headers,
      data,
      rowCount: data.length
    };
  }

  /**
   * Parse a CSV line handling quoted values
   * @param {string} line - CSV line
   * @returns {Array} Parsed values
   */
  static parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  /**
   * Get permission summary statistics
   * @param {string} permissionSetId - The PermissionSet ID
   * @returns {Promise<object>} Summary statistics
   */
  static async getPermissionSummary(permissionSetId) {

    const [fieldPerms, objectPerms] = await Promise.all([
      this.getFieldPermissions(permissionSetId),
      this.getObjectPermissions(permissionSetId)
    ]);

    // Calculate object stats
    const objectStats = {
      total: objectPerms.length,
      withCreate: objectPerms.filter(p => p.PermissionsCreate).length,
      withRead: objectPerms.filter(p => p.PermissionsRead).length,
      withEdit: objectPerms.filter(p => p.PermissionsEdit).length,
      withDelete: objectPerms.filter(p => p.PermissionsDelete).length,
      withViewAll: objectPerms.filter(p => p.PermissionsViewAllRecords).length,
      withModifyAll: objectPerms.filter(p => p.PermissionsModifyAllRecords).length
    };

    // Calculate field stats
    const fieldStats = {
      total: fieldPerms.length,
      withRead: fieldPerms.filter(p => p.PermissionsRead).length,
      withEdit: fieldPerms.filter(p => p.PermissionsEdit).length,
      readOnly: fieldPerms.filter(p => p.PermissionsRead && !p.PermissionsEdit).length
    };

    // Group by object
    const objectGroups = {};
    fieldPerms.forEach(fp => {
      if (!objectGroups[fp.SobjectType]) {
        objectGroups[fp.SobjectType] = 0;
      }
      objectGroups[fp.SobjectType]++;
    });

    return {
      objectStats,
      fieldStats,
      objectGroups,
      uniqueObjects: Object.keys(objectGroups).length
    };
  }

  /**
   * Get status icon for permission comparison
   * @param {boolean} hasPermission - Whether permission is granted
   * @returns {string} Material icon name
   */
  static getPermissionIcon(hasPermission) {
    return hasPermission ? 'check_circle' : 'cancel';
  }

  /**
   * Get status color class for permission
   * @param {boolean} hasPermission - Whether permission is granted
   * @returns {string} CSS class
   */
  static getPermissionClass(hasPermission) {
    return hasPermission ? 'permission-granted' : 'permission-denied';
  }

  /**
   * Get comparison status class
   * @param {string} status - 'matching', 'different', 'sourceOnly', 'targetOnly'
   * @returns {string} CSS class
   */
  static getComparisonClass(status) {
    const classes = {
      'matching': 'comparison-match',
      'different': 'comparison-diff',
      'sourceOnly': 'comparison-source-only',
      'targetOnly': 'comparison-target-only'
    };
    return classes[status] || '';
  }
}

export default PermissionsAPI;
