// Org Compare API Client
// Provides methods to detect active Salesforce sessions and compare metadata across orgs
// Uses Chrome APIs for tab/session detection and XMLHttpRequest for Salesforce API calls

import SessionManager from './session-manager.js';
import MetadataAPI from './metadata-api.js';

class OrgCompareAPI {
  /**
   * Get all active Salesforce sessions from open tabs
   * Scans Chrome tabs for Salesforce domains and extracts session info
   * @returns {Promise<Array>} Array of session objects with org info
   */
  static async getAllActiveSessions() {

    const sessions = [];
    const seenOrgs = new Set();

    try {
      // Query all tabs for Salesforce domains
      const tabs = await chrome.tabs.query({});

      const salesforceTabs = tabs.filter(tab => {
        if (!tab.url) return false;
        return tab.url.includes('salesforce.com') ||
               tab.url.includes('force.com') ||
               tab.url.includes('salesforce-setup.com');
      });


      // Extract session from each tab
      for (const tab of salesforceTabs) {
        try {
          const session = await this.extractSessionFromTab(tab);

          if (session && !seenOrgs.has(session.orgId)) {
            seenOrgs.add(session.orgId);
            sessions.push(session);
          }
        } catch (error) {
          console.warn('[OrgCompareAPI] Could not extract session from tab:', tab.url, error.message);
        }
      }

      return sessions;
    } catch (error) {
      console.error('[OrgCompareAPI] Error getting sessions:', error);
      throw error;
    }
  }

  /**
   * Extract session information from a specific tab
   * @param {object} tab - Chrome tab object
   * @returns {Promise<object>} Session object with org info
   */
  static async extractSessionFromTab(tab) {
    if (!tab || !tab.url) {
      throw new Error('No tab URL provided');
    }

    const url = new URL(tab.url);
    const originalHostname = url.hostname;

    // Transform hostname for API calls
    const hostname = SessionManager.getMyDomain(originalHostname);
    const instanceUrl = `${url.protocol}//${hostname}`;

    // Get session cookie
    const sidCookie = await chrome.cookies.get({
      url: instanceUrl,
      name: 'sid'
    });

    if (!sidCookie) {
      // Try broader search
      const cookies = await chrome.cookies.getAll({
        name: 'sid',
        secure: true
      });

      const matchingCookie = cookies.find(c => {
        const cookieDomain = c.domain.replace(/^\./, '');
        return hostname.includes(cookieDomain) ||
               cookieDomain.includes(hostname.split('.')[0]);
      });

      if (!matchingCookie) {
        throw new Error('No session cookie found');
      }

      // Extract org ID from session ID
      const sessionId = matchingCookie.value;
      const orgId = sessionId.substring(0, 15);

      // Get org info
      const orgInfo = await this.getOrgInfo(instanceUrl, sessionId);

      return {
        tabId: tab.id,
        sessionId: sessionId,
        instanceUrl: instanceUrl,
        hostname: hostname,
        orgId: orgId,
        orgName: orgInfo.orgName || hostname,
        orgType: orgInfo.orgType || 'Unknown',
        isSandbox: orgInfo.isSandbox || false,
        timestamp: Date.now()
      };
    }

    // Extract org ID from session ID
    const sessionId = sidCookie.value;
    const orgId = sessionId.substring(0, 15);

    // Get org info
    const orgInfo = await this.getOrgInfo(instanceUrl, sessionId);

    return {
      tabId: tab.id,
      sessionId: sessionId,
      instanceUrl: instanceUrl,
      hostname: hostname,
      orgId: orgId,
      orgName: orgInfo.orgName || hostname,
      orgType: orgInfo.orgType || 'Unknown',
      isSandbox: orgInfo.isSandbox || false,
      timestamp: Date.now()
    };
  }

  /**
   * Get organization information from Salesforce
   * @param {string} instanceUrl - The instance URL
   * @param {string} sessionId - The session ID
   * @returns {Promise<object>} Org info object
   */
  static async getOrgInfo(instanceUrl, sessionId) {
    return new Promise((resolve, reject) => {
      const query = encodeURIComponent("SELECT Id, Name, OrganizationType, IsSandbox FROM Organization LIMIT 1");
      const endpoint = `${instanceUrl}/services/data/v59.0/query/?q=${query}`;

      const xhr = new XMLHttpRequest();
      xhr.open('GET', endpoint, true);
      xhr.setRequestHeader('Authorization', 'Bearer ' + sessionId);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.responseType = 'json';
      xhr.timeout = 10000;

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.records?.[0]) {
            const org = xhr.response.records[0];
            resolve({
              orgName: org.Name,
              orgType: org.OrganizationType,
              isSandbox: org.IsSandbox
            });
          } else {
            // Return defaults on error
            resolve({
              orgName: null,
              orgType: null,
              isSandbox: null
            });
          }
        }
      };

      xhr.onerror = () => resolve({ orgName: null, orgType: null, isSandbox: null });
      xhr.ontimeout = () => resolve({ orgName: null, orgType: null, isSandbox: null });

      xhr.send();
    });
  }

  /**
   * Make API call to a specific org
   * @param {object} session - Session object with instanceUrl and sessionId
   * @param {string} endpoint - API endpoint
   * @returns {Promise<any>} API response
   */
  static async callOrgAPI(session, endpoint) {
    return new Promise((resolve, reject) => {
      const fullUrl = new URL(endpoint, session.instanceUrl);

      const xhr = new XMLHttpRequest();
      xhr.open('GET', fullUrl.toString(), true);
      xhr.setRequestHeader('Authorization', 'Bearer ' + session.sessionId);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.responseType = 'json';
      xhr.timeout = 30000;

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else if (xhr.status === 401) {
            reject(new Error('Session expired for this org. Please refresh the Salesforce tab.'));
          } else {
            const errorMessage = xhr.response
              ? JSON.stringify(xhr.response)
              : xhr.statusText;
            reject(new Error(`API Error ${xhr.status}: ${errorMessage}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.ontimeout = () => reject(new Error('Request timeout'));

      xhr.send();
    });
  }

  /**
   * Get all objects (custom and standard) from an org
   * @param {object} session - Session object
   * @returns {Promise<Array>} Array of object metadata
   */
  static async getObjects(session) {

    const response = await this.callOrgAPI(session, '/services/data/v59.0/sobjects');

    if (!response || !response.sobjects) {
      throw new Error('Invalid response from Salesforce API');
    }

    return response.sobjects.map(obj => ({
      name: obj.name,
      label: obj.label,
      custom: obj.custom,
      queryable: obj.queryable,
      createable: obj.createable
    }));
  }

  /**
   * Get object field metadata (fields, relationships)
   * @param {object} session - Session object
   * @param {string} objectName - API name of the object
   * @returns {Promise<object>} Object metadata with fields
   */
  static async getObjectMetadata(session, objectName) {

    const response = await this.callOrgAPI(session, `/services/data/v59.0/sobjects/${objectName}/describe`);

    return {
      name: response.name,
      label: response.label,
      custom: response.custom,
      fields: response.fields.map(field => ({
        name: field.name,
        label: field.label,
        type: field.type,
        length: field.length,
        precision: field.precision,
        scale: field.scale,
        required: !field.nillable && !field.defaultedOnCreate,
        unique: field.unique,
        externalId: field.externalId,
        custom: field.custom,
        calculated: field.calculated,
        picklistValues: field.picklistValues || [],
        referenceTo: field.referenceTo || [],
        relationshipName: field.relationshipName
      }))
    };
  }

  /**
   * Get validation rules for an object
   * @param {object} session - Session object
   * @param {string} objectName - API name of the object (optional, returns all if not specified)
   * @returns {Promise<Array>} Array of validation rules
   */
  static async getValidationRules(session, objectName = null) {

    let query = `
      SELECT Id, ValidationName, Active, Description,
             ErrorDisplayField, ErrorMessage, EntityDefinitionId,
             CreatedDate, LastModifiedDate
      FROM ValidationRule
    `;

    if (objectName) {
      query += ` WHERE EntityDefinitionId = '${objectName}'`;
    }

    query += ' ORDER BY ValidationName LIMIT 200';

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;
    const response = await this.callOrgAPI(session, endpoint);

    return (response.records || []).map(rule => ({
      id: rule.Id,
      name: rule.ValidationName,
      active: rule.Active,
      description: rule.Description || '',
      errorField: rule.ErrorDisplayField || '',
      errorMessage: rule.ErrorMessage || '',
      object: rule.EntityDefinitionId,
      lastModified: rule.LastModifiedDate
    }));
  }

  /**
   * Get flows from an org
   * @param {object} session - Session object
   * @returns {Promise<Array>} Array of flows
   */
  static async getFlows(session) {

    const query = `
      SELECT Id, ApiName, Label, ProcessType, Status,
             Description, LastModifiedDate, VersionNumber
      FROM FlowDefinitionView
      ORDER BY ApiName
      LIMIT 200
    `;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;
    const response = await this.callOrgAPI(session, endpoint);

    return (response.records || []).map(flow => ({
      id: flow.Id,
      name: flow.ApiName,
      label: flow.Label,
      type: flow.ProcessType,
      status: flow.Status,
      description: flow.Description || '',
      version: flow.VersionNumber,
      lastModified: flow.LastModifiedDate
    }));
  }

  /**
   * Get picklist values for a field
   * @param {object} session - Session object
   * @param {string} objectName - API name of the object
   * @param {string} fieldName - API name of the field
   * @returns {Promise<Array>} Array of picklist values
   */
  static async getPicklistValues(session, objectName, fieldName) {

    const metadata = await this.getObjectMetadata(session, objectName);
    const field = metadata.fields.find(f => f.name === fieldName);

    if (!field) {
      throw new Error(`Field ${fieldName} not found on ${objectName}`);
    }

    return field.picklistValues.map(value => ({
      value: value.value,
      label: value.label,
      active: value.active,
      default: value.defaultValue
    }));
  }

  /**
   * Get field dependencies for an object (controlling/dependent picklists)
   * Uses Metadata API to get explicit value mappings (same as Export Dependencies)
   * @param {object} session - Session object
   * @param {string} objectName - API name of the object
   * @returns {Promise<Array>} Array of dependency relationships with value mappings
   */
  static async getFieldDependencies(session, objectName) {
    // Use Metadata API to get valueSet information (same as Export Dependencies)
    const metadata = await MetadataAPI.readObject(session, objectName);
    const dependencies = [];

    // Find fields with valueSet.controllingField (dependent picklists)
    metadata.fields
      .filter(f => f.valueSet?.controllingField)
      .forEach(field => {
        // Group mappings by controlling value
        const mappingsByControllingValue = new Map();

        // Process valueSettings to build mappings
        field.valueSet.valueSettings.forEach(vs => {
          const controllingValues = Array.isArray(vs.controllingFieldValue)
            ? vs.controllingFieldValue
            : [vs.controllingFieldValue];

          controllingValues.forEach(controllingValue => {
            if (!mappingsByControllingValue.has(controllingValue)) {
              mappingsByControllingValue.set(controllingValue, []);
            }
            mappingsByControllingValue.get(controllingValue).push({
              value: vs.valueName,
              label: vs.valueName, // Metadata API doesn't provide labels, use value
              active: true // Assume active from valueSettings
            });
          });
        });

        // Convert map to array format
        const valueMappings = Array.from(mappingsByControllingValue.entries()).map(([controllingValue, dependentValues]) => ({
          controllingValue: controllingValue,
          controllingLabel: controllingValue, // Metadata API doesn't provide labels
          controllingActive: true,
          dependentValues: dependentValues,
          dependentCount: dependentValues.length
        }));

        dependencies.push({
          dependentField: field.fullName,
          dependentLabel: field.label || field.fullName,
          controllingField: field.valueSet.controllingField,
          controllingLabel: field.valueSet.controllingField, // Use field name as label
          valuesCount: field.valueSet.valueSettings.length,
          valueMappings: valueMappings
        });
      });

    return dependencies;
  }

  /**
   * Decode dependency mappings from validFor bitfields
   * @param {Array} controllingValues - Controlling field picklist values
   * @param {Array} dependentValues - Dependent field picklist values
   * @returns {Array} Array of mappings showing which controlling values enable which dependent values
   */
  static decodeDependencyMappings(controllingValues, dependentValues) {
    const mappings = [];

    controllingValues.forEach((controllingValue, controllingIndex) => {
      const enabledDependentValues = [];

      dependentValues.forEach((dependentValue, dependentIndex) => {
        if (dependentValue.validFor) {
          // validFor is a base64-encoded bitfield
          // Each bit represents whether this dependent value is valid for a controlling value
          if (this.isDependentValueValidFor(dependentValue.validFor, controllingIndex)) {
            enabledDependentValues.push({
              value: dependentValue.value,
              label: dependentValue.label,
              active: dependentValue.active
            });
          }
        }
      });

      if (enabledDependentValues.length > 0) {
        mappings.push({
          controllingValue: controllingValue.value,
          controllingLabel: controllingValue.label,
          controllingActive: controllingValue.active,
          dependentValues: enabledDependentValues,
          dependentCount: enabledDependentValues.length
        });
      }
    });

    return mappings;
  }

  /**
   * Check if a dependent value is valid for a specific controlling value index
   * @param {string} validForBase64 - Base64-encoded bitfield from Salesforce
   * @param {number} controllingIndex - Index of the controlling value
   * @returns {boolean} True if valid for this controlling value
   */
  static isDependentValueValidFor(validForBase64, controllingIndex) {
    try {
      // Decode base64 to binary string
      const binaryString = atob(validForBase64);

      // Calculate which byte and bit to check
      const byteIndex = Math.floor(controllingIndex / 8);
      const bitIndex = controllingIndex % 8;

      // Get the byte (as character code)
      if (byteIndex >= binaryString.length) {
        return false;
      }

      const byte = binaryString.charCodeAt(byteIndex);

      // Check if the bit is set (bits are ordered from least significant to most significant)
      return (byte & (1 << bitIndex)) !== 0;
    } catch (error) {
      console.error('[OrgCompareAPI] Error decoding validFor:', error);
      return false;
    }
  }

  /**
   * Get all Profiles from an org
   * @param {object} session - Session object
   * @returns {Promise<Array>} Array of profile records
   */
  static async getProfiles(session) {

    const query = `
      SELECT Id, Name, UserLicense.Name, UserType, Description
      FROM Profile
      ORDER BY Name
      LIMIT 200
    `;

    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;
    const response = await this.callOrgAPI(session, endpoint);

    return (response.records || []).map(profile => ({
      id: profile.Id,
      name: profile.Name,
      license: profile.UserLicense?.Name || 'Unknown',
      userType: profile.UserType,
      description: profile.Description || ''
    }));
  }

  /**
   * Get all Permission Sets from an org (excluding profile-associated ones)
   * @param {object} session - Session object
   * @returns {Promise<Array>} Array of permission set records
   */
  static async getPermissionSets(session) {

    const query = `
      SELECT Id, Name, Label, Description, IsOwnedByProfile,
             License.Name, NamespacePrefix, Type
      FROM PermissionSet
      WHERE IsOwnedByProfile = false
      ORDER BY Label
      LIMIT 200
    `;

    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;
    const response = await this.callOrgAPI(session, endpoint);

    return (response.records || []).map(ps => ({
      id: ps.Id,
      name: ps.Name,
      label: ps.Label || ps.Name,
      description: ps.Description || '',
      license: ps.License?.Name || 'None',
      namespace: ps.NamespacePrefix || ''
    }));
  }

  /**
   * Get the PermissionSet ID associated with a Profile
   * @param {object} session - Session object
   * @param {string} profileId - Profile ID
   * @returns {Promise<string>} PermissionSet ID
   */
  static async getPermissionSetIdForProfile(session, profileId) {

    const query = `
      SELECT Id
      FROM PermissionSet
      WHERE ProfileId = '${profileId}'
      LIMIT 1
    `;

    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;
    const response = await this.callOrgAPI(session, endpoint);

    if (response.records && response.records.length > 0) {
      return response.records[0].Id;
    }
    throw new Error(`No PermissionSet found for Profile ${profileId}`);
  }

  /**
   * Get Object Permissions for a PermissionSet
   * @param {object} session - Session object
   * @param {string} permissionSetId - PermissionSet ID
   * @returns {Promise<Array>} Array of object permissions
   */
  static async getObjectPermissions(session, permissionSetId) {

    const query = `
      SELECT Id, SobjectType, ParentId,
             PermissionsCreate, PermissionsRead, PermissionsEdit,
             PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords
      FROM ObjectPermissions
      WHERE ParentId = '${permissionSetId}'
      ORDER BY SobjectType
    `;

    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;
    const response = await this.callOrgAPI(session, endpoint);

    return (response.records || []).map(perm => ({
      object: perm.SobjectType,
      create: perm.PermissionsCreate,
      read: perm.PermissionsRead,
      edit: perm.PermissionsEdit,
      delete: perm.PermissionsDelete,
      viewAll: perm.PermissionsViewAllRecords,
      modifyAll: perm.PermissionsModifyAllRecords
    }));
  }

  /**
   * Get Field Permissions for a PermissionSet
   * @param {object} session - Session object
   * @param {string} permissionSetId - PermissionSet ID
   * @returns {Promise<Array>} Array of field permissions
   */
  static async getFieldPermissions(session, permissionSetId) {

    const query = `
      SELECT Id, Field, SobjectType, PermissionsEdit, PermissionsRead, ParentId
      FROM FieldPermissions
      WHERE ParentId = '${permissionSetId}'
      ORDER BY SobjectType, Field
      LIMIT 2000
    `;

    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;
    const response = await this.callOrgAPI(session, endpoint);

    return (response.records || []).map(perm => ({
      field: perm.Field,
      object: perm.SobjectType,
      read: perm.PermissionsRead,
      edit: perm.PermissionsEdit
    }));
  }

  /**
   * Get all permissions (object + field) for a Profile or PermissionSet
   * @param {object} session - Session object
   * @param {string} id - Profile or PermissionSet ID
   * @param {string} type - 'Profile' or 'PermissionSet'
   * @returns {Promise<object>} Object and field permissions
   */
  static async getAllPermissions(session, id, type) {

    let permissionSetId = id;

    // If it's a Profile, get the associated PermissionSet
    if (type === 'Profile') {
      permissionSetId = await this.getPermissionSetIdForProfile(session, id);
    }

    // Fetch object and field permissions in parallel
    const [objectPermissions, fieldPermissions] = await Promise.all([
      this.getObjectPermissions(session, permissionSetId),
      this.getFieldPermissions(session, permissionSetId)
    ]);

    return {
      permissionSetId,
      objectPermissions,
      fieldPermissions
    };
  }

  /**
   * Compare metadata between two orgs
   * @param {object} sourceSession - Source org session
   * @param {object} targetSession - Target org session
   * @param {Array} metadataTypes - Array of metadata types to compare
   * @param {object} options - Comparison options
   * @returns {Promise<object>} Comparison results
   */
  static async compareOrgs(sourceSession, targetSession, metadataTypes, options = {}) {

    const results = {
      source: {
        orgId: sourceSession.orgId,
        orgName: sourceSession.orgName,
        instanceUrl: sourceSession.instanceUrl
      },
      target: {
        orgId: targetSession.orgId,
        orgName: targetSession.orgName,
        instanceUrl: targetSession.instanceUrl
      },
      comparisonDate: new Date().toISOString(),
      summary: {
        totalItems: 0,
        matches: 0,
        differences: 0,
        sourceOnly: 0,
        targetOnly: 0
      },
      comparisons: {}
    };

    // Compare each selected metadata type
    for (const metadataType of metadataTypes) {
      try {
        const comparison = await this.compareMetadataType(
          sourceSession,
          targetSession,
          metadataType,
          options
        );

        results.comparisons[metadataType] = comparison;

        // Update summary
        results.summary.totalItems += comparison.totalItems;
        results.summary.matches += comparison.matches;
        results.summary.differences += comparison.differences;
        results.summary.sourceOnly += comparison.sourceOnly;
        results.summary.targetOnly += comparison.targetOnly;

      } catch (error) {
        console.error('[OrgCompareAPI] Error comparing', metadataType, ':', error);
        results.comparisons[metadataType] = {
          error: error.message,
          totalItems: 0,
          matches: 0,
          differences: 0,
          sourceOnly: 0,
          targetOnly: 0,
          items: []
        };
      }
    }

    return results;
  }

  /**
   * Compare a specific metadata type between two orgs
   * @param {object} sourceSession - Source org session
   * @param {object} targetSession - Target org session
   * @param {string} metadataType - Type of metadata to compare
   * @param {object} options - Comparison options
   * @returns {Promise<object>} Comparison result for this type
   */
  static async compareMetadataType(sourceSession, targetSession, metadataType, options) {

    let sourceData, targetData;

    switch (metadataType) {
      case 'objects':
        sourceData = await this.getObjects(sourceSession);
        targetData = await this.getObjects(targetSession);
        return this.compareArrayByKey(sourceData, targetData, 'name', ['label', 'custom', 'queryable']);

      case 'fields':
        if (!options.objectName) {
          throw new Error('Object name required for field comparison');
        }
        const sourceMeta = await this.getObjectMetadata(sourceSession, options.objectName);
        const targetMeta = await this.getObjectMetadata(targetSession, options.objectName);
        return this.compareArrayByKey(
          sourceMeta.fields,
          targetMeta.fields,
          'name',
          ['label', 'type', 'length', 'required', 'unique', 'custom']
        );

      case 'validationRules':
        sourceData = await this.getValidationRules(sourceSession, options.objectName);
        targetData = await this.getValidationRules(targetSession, options.objectName);
        return this.compareArrayByKey(
          sourceData,
          targetData,
          'name',
          ['active', 'errorMessage', 'description']
        );

      case 'flows':
        sourceData = await this.getFlows(sourceSession);
        targetData = await this.getFlows(targetSession);
        return this.compareArrayByKey(
          sourceData,
          targetData,
          'name',
          ['label', 'type', 'status', 'version']
        );

      case 'picklists':
        if (!options.objectName || !options.fieldName) {
          throw new Error('Object and field name required for picklist comparison');
        }
        sourceData = await this.getPicklistValues(sourceSession, options.objectName, options.fieldName);
        targetData = await this.getPicklistValues(targetSession, options.objectName, options.fieldName);
        return this.compareArrayByKey(
          sourceData,
          targetData,
          'value',
          ['label', 'active', 'default']
        );

      case 'dependencies':
        if (!options.objectName) {
          throw new Error('Object name required for dependency comparison');
        }
        sourceData = await this.getFieldDependencies(sourceSession, options.objectName);
        targetData = await this.getFieldDependencies(targetSession, options.objectName);
        return this.compareDependencies(sourceData, targetData);

      case 'permissions':
        if (!options.permissionId || !options.permissionType) {
          throw new Error('Permission ID and type required for permission comparison');
        }
        const sourcePerms = await this.getAllPermissions(
          sourceSession,
          options.permissionId,
          options.permissionType
        );
        const targetPerms = await this.getAllPermissions(
          targetSession,
          options.permissionId,
          options.permissionType
        );
        return this.comparePermissions(sourcePerms, targetPerms);

      default:
        throw new Error(`Unknown metadata type: ${metadataType}`);
    }
  }

  /**
   * Compare field dependencies with detailed value mapping comparison
   * @param {Array} sourceDependencies - Source org dependencies
   * @param {Array} targetDependencies - Target org dependencies
   * @returns {object} Comparison result with value mapping details
   */
  static compareDependencies(sourceDependencies, targetDependencies) {
    const result = {
      totalItems: 0,
      matches: 0,
      differences: 0,
      sourceOnly: 0,
      targetOnly: 0,
      items: []
    };

    // Build maps for quick lookup
    const sourceMap = new Map();
    const targetMap = new Map();

    sourceDependencies.forEach(dep => sourceMap.set(dep.dependentField, dep));
    targetDependencies.forEach(dep => targetMap.set(dep.dependentField, dep));

    // Get all unique dependent fields
    const allFields = new Set([...sourceMap.keys(), ...targetMap.keys()]);
    result.totalItems = allFields.size;

    // Compare each dependency
    for (const dependentField of allFields) {
      const sourceDep = sourceMap.get(dependentField);
      const targetDep = targetMap.get(dependentField);

      const comparisonItem = {
        key: dependentField,
        status: '',
        sourceValues: {},
        targetValues: {},
        differences: [],
        valueMappingDifferences: [] // NEW: Specific differences in value mappings
      };

      if (sourceDep && targetDep) {
        // Both have the dependency - compare details
        let hasDifference = false;

        // Compare controlling field
        comparisonItem.sourceValues.controllingField = sourceDep.controllingField;
        comparisonItem.targetValues.controllingField = targetDep.controllingField;
        comparisonItem.sourceValues.controllingLabel = sourceDep.controllingLabel;
        comparisonItem.targetValues.controllingLabel = targetDep.controllingLabel;

        if (sourceDep.controllingField !== targetDep.controllingField) {
          hasDifference = true;
          comparisonItem.differences.push('controllingField');
        }

        // Compare value mappings in detail
        comparisonItem.sourceValues.valueMappings = sourceDep.valueMappings;
        comparisonItem.targetValues.valueMappings = targetDep.valueMappings;

        const mappingDiffs = this.compareValueMappings(
          sourceDep.valueMappings,
          targetDep.valueMappings
        );

        if (mappingDiffs.length > 0) {
          hasDifference = true;
          comparisonItem.differences.push('valueMappings');
          comparisonItem.valueMappingDifferences = mappingDiffs;
        }

        if (hasDifference) {
          comparisonItem.status = 'different';
          result.differences++;
        } else {
          comparisonItem.status = 'match';
          result.matches++;
        }

      } else if (sourceDep) {
        // Dependency only in source
        comparisonItem.status = 'sourceOnly';
        result.sourceOnly++;
        comparisonItem.sourceValues = {
          controllingField: sourceDep.controllingField,
          controllingLabel: sourceDep.controllingLabel,
          valueMappings: sourceDep.valueMappings
        };
        comparisonItem.targetValues = { valueMappings: [] };

      } else {
        // Dependency only in target
        comparisonItem.status = 'targetOnly';
        result.targetOnly++;
        comparisonItem.sourceValues = { valueMappings: [] };
        comparisonItem.targetValues = {
          controllingField: targetDep.controllingField,
          controllingLabel: targetDep.controllingLabel,
          valueMappings: targetDep.valueMappings
        };
      }

      result.items.push(comparisonItem);
    }

    // Sort items: differences first, then sourceOnly, then targetOnly, then matches
    const statusOrder = { different: 0, sourceOnly: 1, targetOnly: 2, match: 3 };
    result.items.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return a.key.localeCompare(b.key);
    });

    return result;
  }

  /**
   * Compare value mappings between two dependencies
   * @param {Array} sourceMappings - Source value mappings
   * @param {Array} targetMappings - Target value mappings
   * @returns {Array} Array of differences found
   */
  static compareValueMappings(sourceMappings, targetMappings) {
    const differences = [];

    // Build maps by controlling value
    const sourceMap = new Map();
    const targetMap = new Map();

    sourceMappings.forEach(mapping => {
      sourceMap.set(mapping.controllingValue, mapping.dependentValues.map(v => v.value));
    });

    targetMappings.forEach(mapping => {
      targetMap.set(mapping.controllingValue, mapping.dependentValues.map(v => v.value));
    });

    // Get all unique controlling values
    const allControllingValues = new Set([...sourceMap.keys(), ...targetMap.keys()]);

    for (const controllingValue of allControllingValues) {
      const sourceDepValues = sourceMap.get(controllingValue) || [];
      const targetDepValues = targetMap.get(controllingValue) || [];

      // Find differences
      const sourceSet = new Set(sourceDepValues);
      const targetSet = new Set(targetDepValues);

      const onlyInSource = sourceDepValues.filter(v => !targetSet.has(v));
      const onlyInTarget = targetDepValues.filter(v => !sourceSet.has(v));

      if (onlyInSource.length > 0 || onlyInTarget.length > 0) {
        differences.push({
          controllingValue,
          onlyInSource,
          onlyInTarget,
          sourceCount: sourceDepValues.length,
          targetCount: targetDepValues.length
        });
      }
    }

    return differences;
  }

  /**
   * Compare permissions between two orgs
   * @param {object} sourcePerms - Source permissions object
   * @param {object} targetPerms - Target permissions object
   * @returns {object} Comparison result
   */
  static comparePermissions(sourcePerms, targetPerms) {
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

    const totalItems = objectComparison.totalItems + fieldComparison.totalItems;
    const matches = objectComparison.matches + fieldComparison.matches;
    const differences = objectComparison.differences + fieldComparison.differences;
    const sourceOnly = objectComparison.sourceOnly + fieldComparison.sourceOnly;
    const targetOnly = objectComparison.targetOnly + fieldComparison.targetOnly;

    return {
      totalItems,
      matches,
      differences,
      sourceOnly,
      targetOnly,
      items: [
        ...objectComparison.items.map(item => ({ ...item, type: 'object' })),
        ...fieldComparison.items.map(item => ({ ...item, type: 'field' }))
      ],
      objectComparison,
      fieldComparison
    };
  }

  /**
   * Compare object permissions
   * @param {Array} sourcePerms - Source object permissions
   * @param {Array} targetPerms - Target object permissions
   * @returns {object} Comparison result
   */
  static compareObjectPermissions(sourcePerms, targetPerms) {
    const result = {
      totalItems: 0,
      matches: 0,
      differences: 0,
      sourceOnly: 0,
      targetOnly: 0,
      items: []
    };

    const sourceMap = new Map();
    sourcePerms.forEach(p => sourceMap.set(p.object, p));

    const targetMap = new Map();
    targetPerms.forEach(p => targetMap.set(p.object, p));

    const allObjects = new Set([...sourceMap.keys(), ...targetMap.keys()]);
    result.totalItems = allObjects.size;

    for (const objectName of allObjects) {
      const sourcePerm = sourceMap.get(objectName);
      const targetPerm = targetMap.get(objectName);

      const item = {
        key: objectName,
        status: '',
        sourceValues: {},
        targetValues: {},
        differences: []
      };

      if (sourcePerm && targetPerm) {
        // Compare all permission fields
        const fields = ['create', 'read', 'edit', 'delete', 'viewAll', 'modifyAll'];
        let hasDifference = false;

        for (const field of fields) {
          item.sourceValues[field] = sourcePerm[field];
          item.targetValues[field] = targetPerm[field];

          if (sourcePerm[field] !== targetPerm[field]) {
            hasDifference = true;
            item.differences.push(field);
          }
        }

        if (hasDifference) {
          item.status = 'different';
          result.differences++;
        } else {
          item.status = 'match';
          result.matches++;
        }
      } else if (sourcePerm) {
        item.status = 'sourceOnly';
        result.sourceOnly++;
        item.sourceValues = { ...sourcePerm };
        item.targetValues = { create: false, read: false, edit: false, delete: false, viewAll: false, modifyAll: false };
      } else {
        item.status = 'targetOnly';
        result.targetOnly++;
        item.sourceValues = { create: false, read: false, edit: false, delete: false, viewAll: false, modifyAll: false };
        item.targetValues = { ...targetPerm };
      }

      result.items.push(item);
    }

    // Sort by status priority
    const statusOrder = { different: 0, sourceOnly: 1, targetOnly: 2, match: 3 };
    result.items.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return a.key.localeCompare(b.key);
    });

    return result;
  }

  /**
   * Compare field permissions
   * @param {Array} sourcePerms - Source field permissions
   * @param {Array} targetPerms - Target field permissions
   * @returns {object} Comparison result
   */
  static compareFieldPermissions(sourcePerms, targetPerms) {
    const result = {
      totalItems: 0,
      matches: 0,
      differences: 0,
      sourceOnly: 0,
      targetOnly: 0,
      items: []
    };

    const sourceMap = new Map();
    sourcePerms.forEach(p => sourceMap.set(p.field, p));

    const targetMap = new Map();
    targetPerms.forEach(p => targetMap.set(p.field, p));

    const allFields = new Set([...sourceMap.keys(), ...targetMap.keys()]);
    result.totalItems = allFields.size;

    for (const fieldKey of allFields) {
      const sourcePerm = sourceMap.get(fieldKey);
      const targetPerm = targetMap.get(fieldKey);

      const item = {
        key: fieldKey,
        object: sourcePerm?.object || targetPerm?.object,
        status: '',
        sourceValues: {},
        targetValues: {},
        differences: []
      };

      if (sourcePerm && targetPerm) {
        const fields = ['read', 'edit'];
        let hasDifference = false;

        for (const field of fields) {
          item.sourceValues[field] = sourcePerm[field];
          item.targetValues[field] = targetPerm[field];

          if (sourcePerm[field] !== targetPerm[field]) {
            hasDifference = true;
            item.differences.push(field);
          }
        }

        if (hasDifference) {
          item.status = 'different';
          result.differences++;
        } else {
          item.status = 'match';
          result.matches++;
        }
      } else if (sourcePerm) {
        item.status = 'sourceOnly';
        result.sourceOnly++;
        item.sourceValues = { read: sourcePerm.read, edit: sourcePerm.edit };
        item.targetValues = { read: false, edit: false };
      } else {
        item.status = 'targetOnly';
        result.targetOnly++;
        item.sourceValues = { read: false, edit: false };
        item.targetValues = { read: targetPerm.read, edit: targetPerm.edit };
      }

      result.items.push(item);
    }

    // Sort by status priority
    const statusOrder = { different: 0, sourceOnly: 1, targetOnly: 2, match: 3 };
    result.items.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return a.key.localeCompare(b.key);
    });

    return result;
  }

  /**
   * Compare two arrays of objects by a key field
   * @param {Array} sourceArray - Source array
   * @param {Array} targetArray - Target array
   * @param {string} keyField - Field to use as unique key
   * @param {Array} compareFields - Fields to compare for differences
   * @returns {object} Comparison result
   */
  static compareArrayByKey(sourceArray, targetArray, keyField, compareFields) {
    const result = {
      totalItems: 0,
      matches: 0,
      differences: 0,
      sourceOnly: 0,
      targetOnly: 0,
      items: []
    };

    // Build maps for quick lookup
    const sourceMap = new Map();
    const targetMap = new Map();

    sourceArray.forEach(item => sourceMap.set(item[keyField], item));
    targetArray.forEach(item => targetMap.set(item[keyField], item));

    // Get all unique keys
    const allKeys = new Set([...sourceMap.keys(), ...targetMap.keys()]);
    result.totalItems = allKeys.size;

    // Compare each item
    for (const key of allKeys) {
      const sourceItem = sourceMap.get(key);
      const targetItem = targetMap.get(key);

      const comparisonItem = {
        key: key,
        status: '',
        sourceValues: {},
        targetValues: {},
        differences: []
      };

      if (sourceItem && targetItem) {
        // Item exists in both - compare fields
        let hasDifference = false;

        for (const field of compareFields) {
          const sourceValue = sourceItem[field];
          const targetValue = targetItem[field];

          comparisonItem.sourceValues[field] = sourceValue;
          comparisonItem.targetValues[field] = targetValue;

          // Handle array comparison (like picklistValues)
          if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
            if (JSON.stringify(sourceValue) !== JSON.stringify(targetValue)) {
              hasDifference = true;
              comparisonItem.differences.push(field);
            }
          } else if (sourceValue !== targetValue) {
            hasDifference = true;
            comparisonItem.differences.push(field);
          }
        }

        if (hasDifference) {
          comparisonItem.status = 'different';
          result.differences++;
        } else {
          comparisonItem.status = 'match';
          result.matches++;
        }

      } else if (sourceItem) {
        // Item only in source
        comparisonItem.status = 'sourceOnly';
        result.sourceOnly++;

        for (const field of compareFields) {
          comparisonItem.sourceValues[field] = sourceItem[field];
          comparisonItem.targetValues[field] = null;
        }

      } else {
        // Item only in target
        comparisonItem.status = 'targetOnly';
        result.targetOnly++;

        for (const field of compareFields) {
          comparisonItem.sourceValues[field] = null;
          comparisonItem.targetValues[field] = targetItem[field];
        }
      }

      result.items.push(comparisonItem);
    }

    // Sort items: differences first, then sourceOnly, then targetOnly, then matches
    const statusOrder = { different: 0, sourceOnly: 1, targetOnly: 2, match: 3 };
    result.items.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return a.key.localeCompare(b.key);
    });

    return result;
  }

  /**
   * Export comparison results to JSON
   * @param {object} results - Comparison results
   * @returns {string} JSON string
   */
  static exportToJSON(results) {
    return JSON.stringify(results, null, 2);
  }

  /**
   * Export comparison results to CSV
   * @param {object} results - Comparison results
   * @returns {string} CSV string
   */
  static exportToCSV(results) {
    const rows = [];

    // Header
    rows.push([
      'Metadata Type',
      'Item Name',
      'Status',
      'Source Value',
      'Target Value',
      'Different Fields'
    ]);

    // Data rows
    for (const [metadataType, comparison] of Object.entries(results.comparisons)) {
      if (comparison.error) {
        rows.push([metadataType, 'ERROR', 'error', comparison.error, '', '']);
        continue;
      }

      for (const item of comparison.items) {
        const sourceValues = Object.entries(item.sourceValues)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        const targetValues = Object.entries(item.targetValues)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');

        rows.push([
          metadataType,
          item.key,
          item.status,
          this.escapeCSV(sourceValues),
          this.escapeCSV(targetValues),
          item.differences.join(', ')
        ]);
      }
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
   * Escape a value for CSV format
   * @param {string} value - The value to escape
   * @returns {string} Escaped value
   */
  static escapeCSV(value) {
    if (!value) return '';
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  /**
   * Get summary statistics for a comparison
   * @param {object} results - Comparison results
   * @returns {object} Summary statistics
   */
  static getSummaryStats(results) {
    return {
      totalItems: results.summary.totalItems,
      matches: results.summary.matches,
      matchPercent: results.summary.totalItems > 0
        ? Math.round((results.summary.matches / results.summary.totalItems) * 100)
        : 0,
      differences: results.summary.differences,
      sourceOnly: results.summary.sourceOnly,
      targetOnly: results.summary.targetOnly,
      metadataTypes: Object.keys(results.comparisons).length
    };
  }

  /**
   * Get metadata as XML for display in XML viewer
   * @param {object} session - Session object
   * @param {Array} metadataTypes - Array of metadata types to retrieve
   * @param {object} options - Options for metadata retrieval
   * @returns {Promise<string>} XML string
   */
  static async getMetadataAsXml(session, metadataTypes, options = {}) {
    let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xmlContent += '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';

    for (const metadataType of metadataTypes) {
      try {
        const typeXml = await this.getMetadataTypeAsXml(session, metadataType, options);
        xmlContent += typeXml;
      } catch (error) {
        console.error(`[OrgCompareAPI] Error getting XML for ${metadataType}:`, error);
        xmlContent += `  <!-- Error retrieving ${metadataType}: ${error.message} -->\n`;
      }
    }

    xmlContent += '  <version>59.0</version>\n';
    xmlContent += '</Package>';

    return xmlContent;
  }

  /**
   * Get XML for a specific metadata type
   * @param {object} session - Session object
   * @param {string} metadataType - Metadata type
   * @param {object} options - Options
   * @returns {Promise<string>} XML string for this type
   */
  static async getMetadataTypeAsXml(session, metadataType, options) {
    let xml = '';

    switch (metadataType) {
      case 'objects':
        const objects = await this.getObjects(session);
        xml += '  <types>\n';
        objects.forEach(obj => {
          if (obj.custom) {
            xml += `    <members>${obj.name}</members>\n`;
          }
        });
        xml += '    <name>CustomObject</name>\n';
        xml += '  </types>\n';
        break;

      case 'fields':
        if (options.objectName) {
          const metadata = await this.getObjectMetadata(session, options.objectName);
          xml += '  <types>\n';
          metadata.fields.forEach(field => {
            if (field.custom) {
              xml += `    <members>${options.objectName}.${field.name}</members>\n`;
            }
          });
          xml += '    <name>CustomField</name>\n';
          xml += '  </types>\n';
        }
        break;

      case 'validationRules':
        const rules = await this.getValidationRules(session, options.objectName);
        if (rules.length > 0) {
          xml += '  <types>\n';
          rules.forEach(rule => {
            xml += `    <members>${rule.object}.${rule.name}</members>\n`;
          });
          xml += '    <name>ValidationRule</name>\n';
          xml += '  </types>\n';
        }
        break;

      case 'flows':
        const flows = await this.getFlows(session);
        if (flows.length > 0) {
          xml += '  <types>\n';
          flows.forEach(flow => {
            xml += `    <members>${flow.name}</members>\n`;
          });
          xml += '    <name>Flow</name>\n';
          xml += '  </types>\n';
        }
        break;

      case 'permissions':
        if (options.permissionType && options.permissionId) {
          const perms = await this.getAllPermissions(session, options.permissionId, options.permissionType);
          xml += '  <types>\n';

          if (options.permissionType === 'Profile') {
            // Get profile name
            const profiles = await this.getProfiles(session);
            const profile = profiles.find(p => p.id === options.permissionId);
            if (profile) {
              xml += `    <members>${profile.name}</members>\n`;
            }
            xml += '    <name>Profile</name>\n';
          } else {
            // Get permission set name
            const permSets = await this.getPermissionSets(session);
            const permSet = permSets.find(ps => ps.id === options.permissionId);
            if (permSet) {
              xml += `    <members>${permSet.name}</members>\n`;
            }
            xml += '    <name>PermissionSet</name>\n';
          }

          xml += '  </types>\n';
        }
        break;

      default:
        xml += `  <!-- ${metadataType} XML generation not implemented -->\n`;
    }

    return xml;
  }
}

export default OrgCompareAPI;
