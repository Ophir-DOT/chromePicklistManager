class MetadataAPI {
  static METADATA_API_VERSION = '59.0';

  static async readObject(session, objectName) {
    const soapRequest = this.buildReadRequest(session.sessionId, objectName);
    const endpoint = `${session.instanceUrl}/services/Soap/m/${this.METADATA_API_VERSION}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': '""'
      },
      body: soapRequest
    });

    if (!response.ok) {
      throw new Error(`Metadata API read failed: ${response.status}`);
    }

    const xmlText = await response.text();
    return this.parseReadResponse(xmlText);
  }

  static buildReadRequest(sessionId, objectName) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader>
      <met:sessionId>${sessionId}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:readMetadata>
      <met:type>CustomObject</met:type>
      <met:fullNames>${objectName}</met:fullNames>
    </met:readMetadata>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  static parseReadResponse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Check for errors
    const faultNode = xmlDoc.querySelector('faultstring');
    if (faultNode) {
      throw new Error(`Metadata API error: ${faultNode.textContent}`);
    }

    // Parse the result
    const resultNode = xmlDoc.querySelector('result');
    return this.parseCustomObject(resultNode);
  }

  static parseCustomObject(node) {
    const fields = [];
    const fieldNodes = node.querySelectorAll('fields');

    fieldNodes.forEach(fieldNode => {
      fields.push({
        fullName: fieldNode.querySelector('fullName')?.textContent,
        label: fieldNode.querySelector('label')?.textContent,
        type: fieldNode.querySelector('type')?.textContent,
        valueSet: this.parseValueSet(fieldNode.querySelector('valueSet'))
      });
    });

    const recordTypes = [];
    const recordTypeNodes = node.querySelectorAll('recordTypes');

    recordTypeNodes.forEach(rtNode => {
      recordTypes.push({
        fullName: rtNode.querySelector('fullName')?.textContent,
        label: rtNode.querySelector('label')?.textContent,
        picklistValues: this.parseRecordTypePicklists(rtNode)
      });
    });

    return { fields, recordTypes };
  }

  static parseValueSet(valueSetNode) {
    if (!valueSetNode) return null;

    const controllingField = valueSetNode.querySelector('controllingField')?.textContent;
    const restricted = valueSetNode.querySelector('restricted')?.textContent === 'true';

    const valueDefinition = valueSetNode.querySelector('valueSetDefinition');
    const values = [];

    if (valueDefinition) {
      valueDefinition.querySelectorAll('value').forEach(valueNode => {
        values.push({
          fullName: valueNode.querySelector('fullName')?.textContent,
          default: valueNode.querySelector('default')?.textContent === 'true',
          label: valueNode.querySelector('label')?.textContent
        });
      });
    }

    const valueSettings = [];
    valueSetNode.querySelectorAll('valueSettings').forEach(vsNode => {
      valueSettings.push({
        controllingFieldValue: vsNode.querySelector('controllingFieldValue')?.textContent,
        valueName: vsNode.querySelector('valueName')?.textContent
      });
    });

    return {
      controllingField,
      restricted,
      valueSetDefinition: { value: values },
      valueSettings
    };
  }

  static parseRecordTypePicklists(recordTypeNode) {
    const picklistValues = [];

    recordTypeNode.querySelectorAll('picklistValues').forEach(pvNode => {
      const picklist = pvNode.querySelector('picklist')?.textContent;
      const values = [];

      pvNode.querySelectorAll('values').forEach(valueNode => {
        values.push({
          fullName: valueNode.querySelector('fullName')?.textContent,
          default: valueNode.querySelector('default')?.textContent === 'true'
        });
      });

      picklistValues.push({ picklist, values });
    });

    return picklistValues;
  }

  static async deploy(session, metadataChanges) {
    // Build deployment package (zip file with package.xml + metadata)
    const deployPackage = await this.buildDeployPackage(metadataChanges);

    const soapRequest = this.buildDeployRequest(session.sessionId, deployPackage);
    const endpoint = `${session.instanceUrl}/services/Soap/m/${this.METADATA_API_VERSION}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': '""'
      },
      body: soapRequest
    });

    if (!response.ok) {
      throw new Error(`Metadata API deploy failed: ${response.status}`);
    }

    const xmlText = await response.text();
    return this.parseDeployResponse(xmlText);
  }

  static buildDeployRequest(sessionId, base64Package) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader>
      <met:sessionId>${sessionId}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:deploy>
      <met:ZipFile>${base64Package}</met:ZipFile>
      <met:DeployOptions>
        <met:rollbackOnError>true</met:rollbackOnError>
        <met:singlePackage>true</met:singlePackage>
        <met:checkOnly>false</met:checkOnly>
      </met:DeployOptions>
    </met:deploy>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  static parseDeployResponse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    const idNode = xmlDoc.querySelector('id');
    if (!idNode) {
      throw new Error('Failed to get deployment ID');
    }

    return idNode.textContent;
  }

  static async checkDeployStatus(session, deployId) {
    const soapRequest = this.buildCheckStatusRequest(session.sessionId, deployId);
    const endpoint = `${session.instanceUrl}/services/Soap/m/${this.METADATA_API_VERSION}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': '""'
      },
      body: soapRequest
    });

    const xmlText = await response.text();
    return this.parseStatusResponse(xmlText);
  }

  static buildCheckStatusRequest(sessionId, deployId) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader>
      <met:sessionId>${sessionId}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:checkDeployStatus>
      <met:asyncProcessId>${deployId}</met:asyncProcessId>
      <met:includeDetails>true</met:includeDetails>
    </met:checkDeployStatus>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  static parseStatusResponse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    const resultNode = xmlDoc.querySelector('result');

    return {
      id: resultNode.querySelector('id')?.textContent,
      status: resultNode.querySelector('status')?.textContent,
      done: resultNode.querySelector('done')?.textContent === 'true',
      success: resultNode.querySelector('success')?.textContent === 'true',
      numberComponentsDeployed: resultNode.querySelector('numberComponentsDeployed')?.textContent,
      numberComponentsTotal: resultNode.querySelector('numberComponentsTotal')?.textContent,
      numberComponentErrors: resultNode.querySelector('numberComponentErrors')?.textContent,
      errorMessage: resultNode.querySelector('errorMessage')?.textContent
    };
  }

  static async buildDeployPackage(metadataChanges) {
    // Import JSZip dynamically
    const JSZip = (await import('../lib/jszip.min.js')).default;
    const zip = new JSZip();

    // Create package.xml
    const packageXml = this.buildPackageXml(metadataChanges);
    zip.file('package.xml', packageXml);

    // Create objects folder
    const objectsFolder = zip.folder('objects');

    // Add object metadata files
    for (const [objectName, fieldData] of Object.entries(metadataChanges)) {
      const objectXml = this.buildObjectXml(objectName, fieldData);
      objectsFolder.file(`${objectName}.object`, objectXml);
    }

    // Generate zip and convert to base64
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const base64 = await this.blobToBase64(zipBlob);

    return base64;
  }

  static buildPackageXml(metadataChanges) {
    const objectNames = Object.keys(metadataChanges);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>`;

    objectNames.forEach(objName => {
      xml += `
    <members>${objName}</members>`;
    });

    xml += `
    <name>CustomObject</name>
  </types>
  <version>${this.METADATA_API_VERSION}</version>
</Package>`;

    return xml;
  }

  static buildObjectXml(objectName, fieldData) {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">`;

    // Add fields
    for (const [fieldName, field] of Object.entries(fieldData)) {
      xml += `
  <fields>
    <fullName>${fieldName}</fullName>
    <type>${field.type}</type>
    <label>${field.label}</label>`;

      if (field.values && field.values.length > 0) {
        xml += `
    <valueSet>
      <restricted>${field.restricted || false}</restricted>`;

        if (field.controllingField) {
          xml += `
      <controllingField>${field.controllingField}</controllingField>`;
        }

        xml += `
      <valueSetDefinition>`;

        field.values.forEach(value => {
          xml += `
        <value>
          <fullName>${value.fullName}</fullName>
          <label>${value.label || value.fullName}</label>
          <default>${value.default || false}</default>
        </value>`;
        });

        xml += `
      </valueSetDefinition>`;

        if (field.valueSettings && field.valueSettings.length > 0) {
          field.valueSettings.forEach(vs => {
            xml += `
      <valueSettings>
        <controllingFieldValue>${vs.controllingFieldValue}</controllingFieldValue>
        <valueName>${vs.valueName}</valueName>
      </valueSettings>`;
          });
        }

        xml += `
    </valueSet>`;
      }

      xml += `
  </fields>`;
    }

    xml += `
</CustomObject>`;

    return xml;
  }

  static async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export default MetadataAPI;
