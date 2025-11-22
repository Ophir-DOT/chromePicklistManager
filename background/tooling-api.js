// Salesforce Tooling API Client
// Based on proven Python implementation from picklist_loader.py
// Uses Tooling API for direct CustomField PATCH operations

import SalesforceAPI from './api-client.js';

class ToolingAPI {
  /**
   * Query FieldDefinition to get field metadata
   * Similar to Python: SELECT FROM FieldDefinition WHERE...
   * @param {object} session - Salesforce session
   * @param {string} objectName - Object API name (e.g., 'Account')
   * @param {string} fieldName - Field API name (e.g., 'MyField__c')
   * @returns {Promise<object>} Field definition metadata
   */
  static async getFieldDefinition(session, objectName, fieldName) {
    const query = `
      SELECT Id, DurableId, QualifiedApiName, MasterLabel, DataType, EntityDefinitionId
      FROM FieldDefinition
      WHERE EntityDefinition.QualifiedApiName = '${objectName}'
      AND QualifiedApiName = '${fieldName}'
    `;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;
    const response = await SalesforceAPI.callAPI(endpoint);

    if (!response.records || response.records.length === 0) {
      throw new Error(`Field ${fieldName} not found on ${objectName}`);
    }

    return response.records[0];
  }

  /**
   * Query PicklistValueInfo to get current picklist values
   * Similar to Python: SELECT FROM PicklistValueInfo WHERE...
   * @param {object} session - Salesforce session
   * @param {string} objectName - Object API name
   * @param {string} fieldName - Field API name
   * @returns {Promise<Array>} Array of picklist values with metadata
   */
  static async getPicklistValues(session, objectName, fieldName) {
    const query = `
      SELECT DurableId, Value, Label, IsDefaultValue
      FROM PicklistValueInfo
      WHERE EntityParticle.EntityDefinition.QualifiedApiName = '${objectName}'
      AND EntityParticle.QualifiedApiName = '${fieldName}'
      ORDER BY DurableId
    `;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;
    const response = await SalesforceAPI.callAPI(endpoint);

    return response.records || [];
  }

  /**
   * Get CustomField ID for PATCH operation
   * Uses Tooling API query to find the CustomField record ID
   * @param {object} session - Salesforce session
   * @param {string} objectName - Object API name
   * @param {string} fieldName - Field API name (with __c)
   * @returns {Promise<string>} CustomField record ID
   */
  static async getCustomFieldId(session, objectName, fieldName) {
    // For namespaced fields (e.g., CompSuite__Template_for_Type__c):
    // - DeveloperName is just "Template_for_Type" (no namespace, no __c)
    // - Remove namespace prefix and __c suffix
    let devName = fieldName;

    // Remove __c suffix first
    devName = devName.replace(/__c$/, '');

    // Remove namespace prefix if present (namespace is before the first __)
    // Example: CompSuite__Template_for_Type -> Template_for_Type
    const namespaceParts = devName.split('__');
    if (namespaceParts.length > 1) {
      // If we have NameSpace__FieldName, take everything after the first __
      devName = namespaceParts.slice(1).join('__');
    }

    // Query by DeveloperName only (FullName is not filterable)
    // Then filter results client-side by matching TableEnumOrId
    const query = `
      SELECT Id, DeveloperName, TableEnumOrId
      FROM CustomField
      WHERE DeveloperName = '${devName}'
    `;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;
    const response = await SalesforceAPI.callAPI(endpoint);

    if (!response.records || response.records.length === 0) {
      throw new Error(`CustomField not found: ${objectName}.${fieldName}`);
    }

    // Filter results client-side
    // TableEnumOrId can be either the object API name OR the object ID
    let matchingField = null;

    for (const record of response.records) {
      // Match by object API name
      if (record.TableEnumOrId === objectName) {
        matchingField = record;
        break;
      }
    }

    // If no match by object name, try to match by querying the object ID
    if (!matchingField) {
      // Get the object's EntityDefinition to find its DurableId
      const objQuery = `
        SELECT DurableId
        FROM EntityDefinition
        WHERE QualifiedApiName = '${objectName}'
      `;
      const objEndpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(objQuery)}`;
      const objResponse = await SalesforceAPI.callAPI(objEndpoint);

      if (objResponse.records && objResponse.records.length > 0) {
        const objectId = objResponse.records[0].DurableId;

        // Now match by object ID
        for (const record of response.records) {
          if (record.TableEnumOrId === objectId) {
            matchingField = record;
            break;
          }
        }
      }
    }

    if (!matchingField) {
      throw new Error(`CustomField not found: ${objectName}.${fieldName} (found ${response.records.length} fields with DeveloperName '${devName}' but none matched the object)`);
    }

    const fieldId = matchingField.Id;
    return fieldId;
  }

  /**
   * Fetch full CustomField metadata (similar to Python fetch_field_details)
   * @param {object} session - Salesforce session
   * @param {string} fieldId - CustomField record ID
   * @returns {Promise<object>} Complete field metadata including Metadata property
   */
  static async getCustomFieldMetadata(session, fieldId) {
    const endpoint = `/services/data/v59.0/tooling/sobjects/CustomField/${fieldId}`;
    const response = await SalesforceAPI.callAPI(endpoint);

    if (!response) {
      throw new Error(`Failed to fetch CustomField metadata for ${fieldId}`);
    }

    return response;
  }

  /**
   * Update picklist values using Tooling API PATCH
   * This is the core update method - matches Python implementation
   * @param {object} session - Salesforce session
   * @param {string} fieldId - CustomField record ID
   * @param {Array} values - Array of picklist values {label, valueName, default}
   * @param {object} fieldInfo - Field metadata {label, type}
   * @returns {Promise<object>} PATCH response
   */
  static async updatePicklistValues(session, fieldId, values, fieldInfo) {
    // Build request body matching Python JSON structure (lines 141-151 in picklist_loader.py)
    const body = {
      Metadata: {
        label: fieldInfo.label,
        type: fieldInfo.type,
        valueSet: {
          valueSetDefinition: {
            value: values.map(v => ({
              label: v.label,
              valueName: v.valueName, // Tooling API uses 'valueName' not 'fullName'
              default: v.default || false
            }))
          }
        }
      }
    };

    // PATCH the CustomField
    const endpoint = `/services/data/v59.0/tooling/sobjects/CustomField/${fieldId}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint, {
        method: 'PATCH',
        body: body
      });

      return response;
    } catch (error) {
      console.error('[ToolingAPI] PATCH failed:', error);

      // Provide helpful error messages
      if (error.message.includes('Cannot deserialize')) {
        throw new Error('Invalid metadata format. Check that all values have label and valueName properties.');
      } else if (error.message.includes('INVALID_TYPE')) {
        throw new Error('This field type cannot be updated via Tooling API. It may be a standard field or StandardValueSet.');
      } else {
        throw error;
      }
    }
  }

  /**
   * Complete update workflow: get field, build values, PATCH
   * This is the high-level method that combines all steps
   * @param {object} session - Salesforce session
   * @param {string} objectName - Object API name
   * @param {string} fieldName - Field API name
   * @param {Array} newValues - Array of {fullName, label, default, active} objects
   * @param {boolean} overwrite - If true, only newValues will be active
   * @returns {Promise<object>} Update result
   */
  static async updatePicklist(session, objectName, fieldName, newValues, overwrite = false) {
    try {
      // Step 1: Get CustomField ID
      const fieldId = await this.getCustomFieldId(session, objectName, fieldName);

      // Step 2: Get current field metadata
      const fieldMetadata = await this.getCustomFieldMetadata(session, fieldId);
      const fieldInfo = {
        label: fieldMetadata.Metadata.label,
        type: fieldMetadata.Metadata.type
      };

      // Step 3: Get current picklist values
      const currentPicklistValues = await this.getPicklistValues(session, objectName, fieldName);

      // Step 4: Build final values array
      // Convert newValues format to match what we need
      const valuesToUpdate = [];
      const newValuesMap = new Map(newValues.map(v => [v.fullName.toLowerCase(), v]));

      // If not overwrite mode, include all existing active values
      if (!overwrite) {
        currentPicklistValues.forEach(current => {
          const key = current.Value.toLowerCase();
          if (!newValuesMap.has(key)) {
            // Keep existing value
            valuesToUpdate.push({
              label: current.Label,
              valueName: current.Value,
              default: current.IsDefaultValue
            });
          }
        });
      }

      // Add all new values (or update existing ones)
      newValues.forEach(newVal => {
        valuesToUpdate.push({
          label: newVal.label,
          valueName: newVal.fullName,
          default: newVal.default || false
        });
      });

      // Step 5: PATCH the field
      const result = await this.updatePicklistValues(session, fieldId, valuesToUpdate, fieldInfo);

      return {
        success: true,
        fieldId: fieldId,
        valuesUpdated: valuesToUpdate.length,
        result: result
      };

    } catch (error) {
      console.error('[ToolingAPI] Picklist update failed:', error);
      throw error;
    }
  }
}

export default ToolingAPI;
