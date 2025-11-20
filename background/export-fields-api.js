// Export Fields API Client
// Provides methods to query and export Salesforce field metadata
// Uses REST API for describe calls and Tooling API for additional metadata

import SalesforceAPI from './api-client.js';
import SessionManager from './session-manager.js';

class ExportFieldsAPI {
  /**
   * Get all objects available in the org
   * @returns {Promise<Array>} Array of objects with name, label, custom properties
   */
  static async getAllObjects() {
    console.log('[ExportFieldsAPI] Getting all objects');

    const endpoint = '/services/data/v59.0/sobjects/';

    try {
      const response = await SalesforceAPI.callAPI(endpoint);

      if (!response || !response.sobjects) {
        throw new Error('Invalid response from Salesforce API');
      }

      // Filter to objects that are queryable and have describe access
      const objects = response.sobjects
        .filter(obj => obj.queryable && obj.searchable !== false)
        .map(obj => ({
          name: obj.name,
          label: obj.label,
          labelPlural: obj.labelPlural,
          custom: obj.custom,
          keyPrefix: obj.keyPrefix
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      console.log('[ExportFieldsAPI] Found', objects.length, 'objects');
      return objects;
    } catch (error) {
      console.error('[ExportFieldsAPI] Error getting objects:', error);
      throw error;
    }
  }

  /**
   * Get field metadata for an object using REST API describe
   * @param {string} objectName - API name of the object
   * @returns {Promise<Array>} Array of field metadata objects
   */
  static async getObjectFields(objectName) {
    console.log('[ExportFieldsAPI] Getting fields for object:', objectName);

    const endpoint = `/services/data/v59.0/sobjects/${objectName}/describe`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);

      if (!response || !response.fields) {
        throw new Error(`Invalid response for object: ${objectName}`);
      }

      const fields = response.fields.map(field => this.formatFieldMetadata(field, objectName));

      console.log('[ExportFieldsAPI] Found', fields.length, 'fields for', objectName);
      return fields;
    } catch (error) {
      console.error('[ExportFieldsAPI] Error getting fields for', objectName, ':', error);
      throw error;
    }
  }

  /**
   * Format field metadata from describe response
   * @param {object} field - Raw field metadata from describe
   * @param {string} objectName - API name of the parent object
   * @returns {object} Formatted field metadata
   */
  static formatFieldMetadata(field, objectName) {
    // Determine field category
    let category = 'Standard';
    if (field.custom) {
      category = 'Custom';
    } else if (field.calculated) {
      category = 'Formula';
    }

    // Format picklist values
    let picklistValues = '';
    if (field.picklistValues && field.picklistValues.length > 0) {
      picklistValues = field.picklistValues
        .filter(pv => pv.active)
        .map(pv => pv.value)
        .join('; ');
    }

    // Format reference to
    let referenceTo = '';
    if (field.referenceTo && field.referenceTo.length > 0) {
      referenceTo = field.referenceTo.join(', ');
    }

    // Determine relationship type
    let relationshipType = '';
    if (field.type === 'reference') {
      if (field.relationshipName) {
        relationshipType = field.cascadeDelete ? 'Master-Detail' : 'Lookup';
      }
    }

    return {
      objectName: objectName,
      label: field.label || '',
      apiName: field.name || '',
      type: field.type || '',
      length: field.length || 0,
      precision: field.precision || 0,
      scale: field.scale || 0,
      digits: field.digits || 0,
      byteLength: field.byteLength || 0,
      required: !field.nillable,
      unique: field.unique || false,
      externalId: field.externalId || false,
      defaultValue: field.defaultValue !== null ? String(field.defaultValue) : '',
      defaultValueFormula: field.defaultValueFormula || '',
      formula: field.calculatedFormula || '',
      picklistValues: picklistValues,
      referenceTo: referenceTo,
      relationshipName: field.relationshipName || '',
      relationshipType: relationshipType,
      inlineHelpText: field.inlineHelpText || '',
      custom: field.custom || false,
      calculated: field.calculated || false,
      autoNumber: field.autoNumber || false,
      caseSensitive: field.caseSensitive || false,
      encrypted: field.encrypted || false,
      compoundFieldName: field.compoundFieldName || '',
      controllerName: field.controllerName || '',
      filterable: field.filterable || false,
      sortable: field.sortable || false,
      groupable: field.groupable || false,
      createable: field.createable || false,
      updateable: field.updateable || false,
      category: category,
      // Will be populated from Tooling API if available
      description: '',
      createdDate: '',
      lastModifiedDate: ''
    };
  }

  /**
   * Get additional field metadata from Tooling API (CustomField)
   * @param {string} objectName - API name of the object
   * @returns {Promise<Map>} Map of fieldName -> additional metadata
   */
  static async getCustomFieldMetadata(objectName) {
    console.log('[ExportFieldsAPI] Getting custom field metadata for:', objectName);

    // Query CustomField records for the object
    const query = `
      SELECT Id, DeveloperName, FullName, Description,
             CreatedDate, LastModifiedDate, LastModifiedById,
             NamespacePrefix, ManageableState
      FROM CustomField
      WHERE TableEnumOrId = '${objectName}'
    `;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      const metadataMap = new Map();

      if (response.records) {
        response.records.forEach(record => {
          // Extract field name from FullName (ObjectName.FieldName)
          const fieldName = record.FullName ? record.FullName.split('.')[1] : record.DeveloperName + '__c';

          metadataMap.set(fieldName, {
            id: record.Id,
            description: record.Description || '',
            createdDate: record.CreatedDate || '',
            lastModifiedDate: record.LastModifiedDate || '',
            lastModifiedBy: record.LastModifiedById || '',
            namespace: record.NamespacePrefix || '',
            isManaged: record.ManageableState === 'installed'
          });
        });
      }

      console.log('[ExportFieldsAPI] Found', metadataMap.size, 'custom field metadata records');
      return metadataMap;
    } catch (error) {
      console.warn('[ExportFieldsAPI] Could not get custom field metadata:', error.message);
      // Return empty map - this is optional metadata
      return new Map();
    }
  }

  /**
   * Get fields for multiple objects with progress callback
   * @param {Array<string>} objectNames - Array of object API names
   * @param {object} options - Export options
   * @param {Function} progressCallback - Progress callback (current, total, objectName)
   * @returns {Promise<Array>} Array of all field metadata
   */
  static async getFieldsForObjects(objectNames, options = {}, progressCallback = null) {
    console.log('[ExportFieldsAPI] Getting fields for', objectNames.length, 'objects');

    const allFields = [];
    const { fieldTypes, customOnly, standardOnly, includeToolingMetadata } = options;

    for (let i = 0; i < objectNames.length; i++) {
      const objectName = objectNames[i];

      try {
        // Get fields from describe
        let fields = await this.getObjectFields(objectName);

        // Get additional metadata from Tooling API if requested
        if (includeToolingMetadata) {
          const toolingMetadata = await this.getCustomFieldMetadata(objectName);

          // Merge tooling metadata
          fields = fields.map(field => {
            const additionalMeta = toolingMetadata.get(field.apiName);
            if (additionalMeta) {
              return {
                ...field,
                description: additionalMeta.description || field.description,
                createdDate: additionalMeta.createdDate || field.createdDate,
                lastModifiedDate: additionalMeta.lastModifiedDate || field.lastModifiedDate
              };
            }
            return field;
          });
        }

        // Apply filters
        fields = this.filterFields(fields, { fieldTypes, customOnly, standardOnly });

        allFields.push(...fields);

        // Report progress
        if (progressCallback) {
          progressCallback(i + 1, objectNames.length, objectName);
        }
      } catch (error) {
        console.error('[ExportFieldsAPI] Error getting fields for', objectName, ':', error);
        // Continue with other objects
      }
    }

    console.log('[ExportFieldsAPI] Total fields collected:', allFields.length);
    return allFields;
  }

  /**
   * Filter fields based on criteria
   * @param {Array} fields - Array of field metadata
   * @param {object} options - Filter options
   * @returns {Array} Filtered fields
   */
  static filterFields(fields, options = {}) {
    const { fieldTypes, customOnly, standardOnly } = options;

    return fields.filter(field => {
      // Custom/Standard filter
      if (customOnly && !field.custom) return false;
      if (standardOnly && field.custom) return false;

      // Field type filter
      if (fieldTypes && fieldTypes.length > 0) {
        const normalizedType = this.normalizeFieldType(field.type);
        if (!fieldTypes.includes(normalizedType)) return false;
      }

      return true;
    });
  }

  /**
   * Normalize field type for filtering
   * @param {string} type - Salesforce field type
   * @returns {string} Normalized type category
   */
  static normalizeFieldType(type) {
    const typeMap = {
      'string': 'Text',
      'textarea': 'Text',
      'url': 'Text',
      'email': 'Text',
      'phone': 'Text',
      'encryptedstring': 'Text',
      'int': 'Number',
      'double': 'Number',
      'currency': 'Number',
      'percent': 'Number',
      'date': 'Date',
      'datetime': 'Date',
      'time': 'Date',
      'picklist': 'Picklist',
      'multipicklist': 'Picklist',
      'combobox': 'Picklist',
      'reference': 'Lookup',
      'boolean': 'Checkbox',
      'id': 'Id',
      'base64': 'Other',
      'address': 'Address',
      'location': 'Geolocation'
    };

    return typeMap[type.toLowerCase()] || 'Other';
  }

  /**
   * Get field type categories for filtering
   * @returns {Array} Array of field type categories
   */
  static getFieldTypeCategories() {
    return [
      { value: 'Text', label: 'Text' },
      { value: 'Number', label: 'Number' },
      { value: 'Date', label: 'Date/Time' },
      { value: 'Picklist', label: 'Picklist' },
      { value: 'Lookup', label: 'Lookup/Master-Detail' },
      { value: 'Checkbox', label: 'Checkbox' },
      { value: 'Id', label: 'ID' },
      { value: 'Address', label: 'Address' },
      { value: 'Geolocation', label: 'Geolocation' },
      { value: 'Other', label: 'Other' }
    ];
  }

  /**
   * Get summary statistics for fields
   * @param {Array} fields - Array of field metadata
   * @returns {object} Summary statistics
   */
  static getFieldSummary(fields) {
    const summary = {
      total: fields.length,
      custom: 0,
      standard: 0,
      required: 0,
      formula: 0,
      byType: {}
    };

    fields.forEach(field => {
      if (field.custom) {
        summary.custom++;
      } else {
        summary.standard++;
      }

      if (field.required) {
        summary.required++;
      }

      if (field.calculated) {
        summary.formula++;
      }

      const typeCategory = this.normalizeFieldType(field.type);
      summary.byType[typeCategory] = (summary.byType[typeCategory] || 0) + 1;
    });

    return summary;
  }

  /**
   * Export fields to JSON format
   * @param {Array} fields - Array of field metadata
   * @returns {string} JSON string
   */
  static exportToJSON(fields) {
    console.log('[ExportFieldsAPI] Exporting', fields.length, 'fields to JSON');

    const exportData = fields.map(field => ({
      objectName: field.objectName,
      label: field.label,
      apiName: field.apiName,
      type: field.type,
      length: field.length,
      precision: field.precision,
      scale: field.scale,
      required: field.required,
      unique: field.unique,
      externalId: field.externalId,
      defaultValue: field.defaultValue,
      formula: field.formula || field.defaultValueFormula,
      picklistValues: field.picklistValues,
      referenceTo: field.referenceTo,
      relationshipName: field.relationshipName,
      relationshipType: field.relationshipType,
      inlineHelpText: field.inlineHelpText,
      description: field.description,
      custom: field.custom,
      calculated: field.calculated,
      createdDate: field.createdDate,
      lastModifiedDate: field.lastModifiedDate
    }));

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export fields to CSV format
   * @param {Array} fields - Array of field metadata
   * @returns {string} CSV string with BOM for Excel compatibility
   */
  static exportToCSV(fields) {
    console.log('[ExportFieldsAPI] Exporting', fields.length, 'fields to CSV');

    const headers = [
      'Object Name',
      'Field Label',
      'Field API Name',
      'Data Type',
      'Length',
      'Precision',
      'Scale',
      'Required',
      'Unique',
      'External ID',
      'Default Value',
      'Formula',
      'Picklist Values',
      'Reference To',
      'Relationship Name',
      'Relationship Type',
      'Inline Help Text',
      'Description',
      'Custom',
      'Calculated',
      'Created Date',
      'Last Modified Date'
    ];

    const rows = fields.map(field => [
      field.objectName || '',
      field.label || '',
      field.apiName || '',
      field.type || '',
      field.length || '',
      field.precision || '',
      field.scale || '',
      field.required ? 'TRUE' : 'FALSE',
      field.unique ? 'TRUE' : 'FALSE',
      field.externalId ? 'TRUE' : 'FALSE',
      this.escapeCSV(field.defaultValue || ''),
      this.escapeCSV(field.formula || field.defaultValueFormula || ''),
      this.escapeCSV(field.picklistValues || ''),
      field.referenceTo || '',
      field.relationshipName || '',
      field.relationshipType || '',
      this.escapeCSV(field.inlineHelpText || ''),
      this.escapeCSV(field.description || ''),
      field.custom ? 'TRUE' : 'FALSE',
      field.calculated ? 'TRUE' : 'FALSE',
      field.createdDate || '',
      field.lastModifiedDate || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Add BOM for Excel compatibility
    return '\uFEFF' + csv;
  }

  /**
   * Escape a value for CSV format
   * @param {string} value - The value to escape
   * @returns {string} Escaped value
   */
  static escapeCSV(value) {
    if (!value) return '';
    const strValue = String(value);
    // If value contains comma, newline, or quote, wrap in quotes and escape existing quotes
    if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
      return '"' + strValue.replace(/"/g, '""') + '"';
    }
    return strValue;
  }

  /**
   * Get field-level security for a specific field
   * @param {string} objectName - Object API name
   * @param {string} fieldName - Field API name
   * @returns {Promise<Array>} Array of FLS entries per profile/permission set
   */
  static async getFieldLevelSecurity(objectName, fieldName) {
    console.log('[ExportFieldsAPI] Getting FLS for', objectName + '.' + fieldName);

    const query = `
      SELECT Id, Field, PermissionsRead, PermissionsEdit,
             Parent.Profile.Name, Parent.PermissionSet.Name, Parent.IsOwnedByProfile
      FROM FieldPermissions
      WHERE SobjectType = '${objectName}'
      AND Field = '${objectName}.${fieldName}'
    `;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);

      return response.records?.map(record => ({
        field: record.Field,
        readable: record.PermissionsRead,
        editable: record.PermissionsEdit,
        profileName: record.Parent?.Profile?.Name || '',
        permissionSetName: record.Parent?.PermissionSet?.Name || '',
        isProfile: record.Parent?.IsOwnedByProfile || false
      })) || [];
    } catch (error) {
      console.error('[ExportFieldsAPI] Error getting FLS:', error);
      return [];
    }
  }
}

export default ExportFieldsAPI;
