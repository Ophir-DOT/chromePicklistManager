// Field Usage API Client
// Provides methods to analyze field usage across Salesforce metadata
// Uses Tooling API to query various metadata types for field references

import SalesforceAPI from './api-client.js';

class FieldUsageAPI {
  /**
   * Get usage statistics for fields on an object (counts actual records with non-null values)
   * @param {string} objectName - The SObject API name
   * @param {Array} fieldNames - Array of field API names to analyze
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Map>} Map of fieldName -> usage statistics
   */
  static async getFieldUsageStats(objectName, fieldNames, progressCallback = null) {

    const usageMap = new Map();

    // Initialize usage map with zero counts
    fieldNames.forEach(fieldName => {
      usageMap.set(fieldName, {
        totalUsage: 0,
        recordsWithValue: 0,
        details: []
      });
    });

    try {
      // Count records with non-null values for each field
      // We'll query in batches to handle many fields efficiently
      const batchSize = 20; // Query up to 20 fields at a time to avoid SOQL limits
      const fieldBatches = [];

      for (let i = 0; i < fieldNames.length; i += batchSize) {
        fieldBatches.push(fieldNames.slice(i, i + batchSize));
      }

      let completed = 0;
      for (const batch of fieldBatches) {
        try {
          // Build query to count records with non-null values
          // Filter out 'Id' from field list to avoid duplicate field error
          const fieldsToQuery = batch.filter(f => f !== 'Id');
          const fieldList = fieldsToQuery.length > 0 ? `, ${fieldsToQuery.join(', ')}` : '';
          const query = `SELECT Id${fieldList} FROM ${objectName} LIMIT 2000`;


          const response = await SalesforceAPI.callAPI(
            `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`
          );


          if (response.records) {
            // Count non-null values for each field
            batch.forEach(fieldName => {
              let count;

              // Special handling for Id field - it always exists on all records
              if (fieldName === 'Id') {
                count = response.records.length;
              } else {
                count = response.records.filter(record => {
                  const value = record[fieldName];
                  // Check if field has a value (not null, not undefined, not empty string)
                  return value !== null && value !== undefined && value !== '';
                }).length;
              }

              const stats = usageMap.get(fieldName);
              stats.recordsWithValue = count;
              stats.totalUsage = count;

              if (count > 0) {
                stats.details.push({
                  type: 'Record Usage',
                  name: `${count} record${count !== 1 ? 's' : ''} with value`,
                  id: null
                });
              }

            });
          }

          completed++;
          if (progressCallback) {
            progressCallback(completed, fieldBatches.length);
          }
        } catch (error) {
          console.error('[FieldUsageAPI] Error querying batch:', error);
          // Continue with other batches even if one fails
        }
      }

      return usageMap;
    } catch (error) {
      console.error('[FieldUsageAPI] Error in getFieldUsageStats:', error);
      return usageMap;
    }
  }

  /**
   * Get validation rule usage for fields
   * @param {string} objectName - Object API name
   * @param {Array} fieldNames - Field names to search for
   * @returns {Promise<Map>} Map of field -> usage info
   */
  static async getValidationRuleUsage(objectName, fieldNames) {

    const usageMap = new Map();
    fieldNames.forEach(f => usageMap.set(f, { count: 0, details: [] }));

    try {
      // Query validation rules for this object
      // Note: We need to get the EntityDefinition ID first, then query rules
      const entityQuery = `
        SELECT DurableId
        FROM EntityDefinition
        WHERE QualifiedApiName = '${objectName}'
        LIMIT 1
      `;
      const entityResponse = await SalesforceAPI.callAPI(
        `/services/data/v59.0/query/?q=${encodeURIComponent(entityQuery)}`
      );

      if (!entityResponse.records || entityResponse.records.length === 0) {
        return usageMap;
      }

      const entityId = entityResponse.records[0].DurableId;

      const query = `
        SELECT Id, ValidationName, Metadata
        FROM ValidationRule
        WHERE EntityDefinitionId = '${entityId}'
      `;

      const response = await SalesforceAPI.callAPI(
        `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`
      );


      if (response.records) {
        response.records.forEach(rule => {
          const formula = rule.Metadata?.errorConditionFormula || '';

          fieldNames.forEach(fieldName => {
            // Check if field is referenced in formula (simple text search)
            if (formula.includes(fieldName)) {
              const usage = usageMap.get(fieldName);
              usage.count++;
              usage.details.push({
                type: 'Validation Rule',
                name: rule.ValidationName,
                id: rule.Id
              });
            }
          });
        });
      }
    } catch (error) {
      console.error('[FieldUsageAPI] Error checking validation rules:', error);
    }

    return usageMap;
  }

  /**
   * Get workflow rule usage (limited - formulas only)
   * @param {string} objectName - Object API name
   * @param {Array} fieldNames - Field names to search for
   * @returns {Promise<Map>} Map of field -> usage info
   */
  static async getWorkflowRuleUsage(objectName, fieldNames) {

    const usageMap = new Map();
    fieldNames.forEach(f => usageMap.set(f, { count: 0, details: [] }));

    try {
      const query = `
        SELECT Id, Name, Metadata
        FROM WorkflowRule
        WHERE TableEnumOrId = '${objectName}'
      `;

      const response = await SalesforceAPI.callAPI(
        `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`
      );

      if (response.records) {
        response.records.forEach(rule => {
          const formula = rule.Metadata?.formula || '';

          fieldNames.forEach(fieldName => {
            if (formula.includes(fieldName)) {
              const usage = usageMap.get(fieldName);
              usage.count++;
              usage.details.push({
                type: 'Workflow Rule',
                name: rule.Name,
                id: rule.Id
              });
            }
          });
        });
      }
    } catch (error) {
      console.error('[FieldUsageAPI] Error checking workflow rules:', error);
    }

    return usageMap;
  }

  /**
   * Get flow usage (basic - searches flow definitions)
   * @param {string} objectName - Object API name
   * @param {Array} fieldNames - Field names to search for
   * @returns {Promise<Map>} Map of field -> usage info
   */
  static async getFlowUsage(objectName, fieldNames) {

    const usageMap = new Map();
    fieldNames.forEach(f => usageMap.set(f, { count: 0, details: [] }));

    try {
      // Query active flows
      const query = `
        SELECT Id, DeveloperName, ActiveVersionId
        FROM FlowDefinition
        WHERE ActiveVersionId != null
        LIMIT 200
      `;

      const response = await SalesforceAPI.callAPI(
        `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`
      );

      if (response.records) {
        // For each flow, we'd need to query the Flow metadata to check field references
        // This is complex and expensive, so we'll implement a simplified version
        // In production, you might want to use Flow.Metadata and parse XML
        for (const flow of response.records.slice(0, 50)) { // Limit to avoid API limits
          try {
            const flowQuery = `
              SELECT Id, Metadata
              FROM Flow
              WHERE Id = '${flow.ActiveVersionId}'
            `;

            const flowResponse = await SalesforceAPI.callAPI(
              `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(flowQuery)}`
            );

            if (flowResponse.records && flowResponse.records[0]) {
              const metadata = JSON.stringify(flowResponse.records[0].Metadata || {});

              fieldNames.forEach(fieldName => {
                if (metadata.includes(fieldName) && metadata.includes(objectName)) {
                  const usage = usageMap.get(fieldName);
                  usage.count++;
                  usage.details.push({
                    type: 'Flow',
                    name: flow.DeveloperName,
                    id: flow.Id
                  });
                }
              });
            }
          } catch (error) {
            // Continue with other flows if one fails
            console.warn('[FieldUsageAPI] Error checking flow:', flow.DeveloperName);
          }
        }
      }
    } catch (error) {
      console.error('[FieldUsageAPI] Error checking flows:', error);
    }

    return usageMap;
  }

  /**
   * Get Apex class usage (searches class body for field references)
   * @param {string} objectName - Object API name
   * @param {Array} fieldNames - Field names to search for
   * @returns {Promise<Map>} Map of field -> usage info
   */
  static async getApexClassUsage(objectName, fieldNames) {

    const usageMap = new Map();
    fieldNames.forEach(f => usageMap.set(f, { count: 0, details: [] }));

    try {
      // Query Apex classes - can't use LIKE on Body field in Tooling API
      // Query all classes and filter in JavaScript
      const query = `
        SELECT Id, Name, Body
        FROM ApexClass
        LIMIT 200
      `;

      const response = await SalesforceAPI.callAPI(
        `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`
      );

      if (response.records) {
        response.records.forEach(apexClass => {
          const body = apexClass.Body || '';

          // Skip if class doesn't reference the object at all
          if (!body.includes(objectName)) {
            return;
          }

          fieldNames.forEach(fieldName => {
            // Look for field references like: objectName.fieldName or .fieldName
            const patterns = [
              new RegExp(`${objectName}\\.${fieldName}`, 'gi'),
              new RegExp(`\\.${fieldName}__c`, 'gi'),
              new RegExp(`'${fieldName}'`, 'gi')
            ];

            const found = patterns.some(pattern => pattern.test(body));

            if (found) {
              const usage = usageMap.get(fieldName);
              usage.count++;
              usage.details.push({
                type: 'Apex Class',
                name: apexClass.Name,
                id: apexClass.Id
              });
            }
          });
        });
      }
    } catch (error) {
      console.error('[FieldUsageAPI] Error checking Apex classes:', error);
    }

    return usageMap;
  }

  /**
   * Get Visualforce page usage
   * @param {string} objectName - Object API name
   * @param {Array} fieldNames - Field names to search for
   * @returns {Promise<Map>} Map of field -> usage info
   */
  static async getVisualforcePageUsage(objectName, fieldNames) {

    const usageMap = new Map();
    fieldNames.forEach(f => usageMap.set(f, { count: 0, details: [] }));

    try {
      // Query Visualforce pages - can't use LIKE on Markup field in Tooling API
      // Query all pages and filter in JavaScript
      const query = `
        SELECT Id, Name, Markup
        FROM ApexPage
        LIMIT 200
      `;

      const response = await SalesforceAPI.callAPI(
        `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`
      );

      if (response.records) {
        response.records.forEach(page => {
          const markup = page.Markup || '';

          // Skip if page doesn't reference the object at all
          if (!markup.includes(objectName)) {
            return;
          }

          fieldNames.forEach(fieldName => {
            if (markup.includes(fieldName)) {
              const usage = usageMap.get(fieldName);
              usage.count++;
              usage.details.push({
                type: 'Visualforce Page',
                name: page.Name,
                id: page.Id
              });
            }
          });
        });
      }
    } catch (error) {
      console.error('[FieldUsageAPI] Error checking Visualforce pages:', error);
    }

    return usageMap;
  }

  /**
   * Get Lightning component usage (Aura and LWC)
   * @param {string} objectName - Object API name
   * @param {Array} fieldNames - Field names to search for
   * @returns {Promise<Map>} Map of field -> usage info
   */
  static async getLightningComponentUsage(objectName, fieldNames) {

    const usageMap = new Map();
    fieldNames.forEach(f => usageMap.set(f, { count: 0, details: [] }));

    try {
      // Query Aura components - Note: AuraDefinition doesn't have DeveloperName, use AuraDefinitionBundle instead
      const bundleQuery = `
        SELECT Id, DeveloperName
        FROM AuraDefinitionBundle
        WHERE DeveloperName != null
        LIMIT 50
      `;

      const bundleResponse = await SalesforceAPI.callAPI(
        `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(bundleQuery)}`
      );

      if (bundleResponse.records) {
        // For each bundle, query its definitions and check markup
        for (const bundle of bundleResponse.records) {
          try {
            const defQuery = `
              SELECT Id, Source
              FROM AuraDefinition
              WHERE AuraDefinitionBundleId = '${bundle.Id}'
              AND DefType = 'COMPONENT'
            `;

            const defResponse = await SalesforceAPI.callAPI(
              `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(defQuery)}`
            );

            if (defResponse.records) {
              defResponse.records.forEach(definition => {
                const source = definition.Source || '';

                // Check if source contains object name and field names
                if (source.includes(objectName)) {
                  fieldNames.forEach(fieldName => {
                    if (source.includes(fieldName)) {
                      const usage = usageMap.get(fieldName);
                      usage.count++;
                      usage.details.push({
                        type: 'Lightning Component',
                        name: bundle.DeveloperName,
                        id: bundle.Id
                      });
                    }
                  });
                }
              });
            }
          } catch (err) {
            console.warn('[FieldUsageAPI] Error checking bundle:', bundle.DeveloperName);
          }
        }
      }
    } catch (error) {
      console.error('[FieldUsageAPI] Error checking Lightning components:', error);
    }

    return usageMap;
  }

  /**
   * Get formula field usage (fields that reference other fields)
   * @param {string} objectName - Object API name
   * @param {Array} fieldNames - Field names to search for
   * @returns {Promise<Map>} Map of field -> usage info
   */
  static async getFormulaFieldUsage(objectName, fieldNames) {

    const usageMap = new Map();
    fieldNames.forEach(f => usageMap.set(f, { count: 0, details: [] }));

    try {
      // Query all custom fields on this object and filter formula fields by checking Metadata
      const query = `
        SELECT Id, DeveloperName, Metadata
        FROM CustomField
        WHERE TableEnumOrId = '${objectName}'
      `;

      const response = await SalesforceAPI.callAPI(
        `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`
      );

      if (response.records) {
        response.records.forEach(field => {
          // Check if this is a formula field by checking if formula exists in metadata
          const formula = field.Metadata?.formula || '';

          // Only process if it's actually a formula field (has a formula)
          if (!formula) return;

          fieldNames.forEach(fieldName => {
            if (formula.includes(fieldName)) {
              const usage = usageMap.get(fieldName);
              usage.count++;
              usage.details.push({
                type: 'Formula Field',
                name: field.DeveloperName,
                id: field.Id
              });
            }
          });
        });
      }
    } catch (error) {
      console.error('[FieldUsageAPI] Error checking formula fields:', error);
    }

    return usageMap;
  }

  /**
   * Get usage level category
   * @param {number} usageCount - Total usage count
   * @returns {string} Usage level (unused, low, medium, high)
   */
  static getUsageLevel(usageCount) {
    if (usageCount === 0) return 'unused';
    if (usageCount <= 2) return 'low';
    if (usageCount <= 10) return 'medium';
    return 'high';
  }

  /**
   * Get usage color for UI
   * @param {string} usageLevel - Usage level
   * @returns {string} CSS color class
   */
  static getUsageColor(usageLevel) {
    const colors = {
      'unused': 'usage-unused',
      'low': 'usage-low',
      'medium': 'usage-medium',
      'high': 'usage-high'
    };
    return colors[usageLevel] || 'usage-unknown';
  }
}

export default FieldUsageAPI;
