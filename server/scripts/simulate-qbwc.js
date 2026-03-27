#!/usr/bin/env node
// Simulate QuickBooks Web Connector flow for testing
// Usage: node simulate-qbwc.js [count]
// This simulates QB Desktop responding to sync requests

const https = require('https');

const BASE_URL = 'https://medsys-five.vercel.app/api/quickbooks/soap';

function soapRequest(action, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL);
    const data = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    ${body}
  </soap:Body>
</soap:Envelope>`;

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': `http://developer.intuit.com/${action}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function authenticate() {
  const response = await soapRequest('authenticate', `
    <authenticate xmlns="http://developer.intuit.com/">
      <strUserName>medsys</strUserName>
      <strPassword>medsys123</strPassword>
    </authenticate>
  `);
  const match = response.match(/[a-f0-9]{48}/);
  return match ? match[0] : null;
}

async function sendRequestXML(ticket) {
  const response = await soapRequest('sendRequestXML', `
    <sendRequestXML xmlns="http://developer.intuit.com/">
      <ticket>${ticket}</ticket>
      <strHCPResponse></strHCPResponse>
      <strCompanyFileName></strCompanyFileName>
      <qbXMLCountry>US</qbXMLCountry>
      <qbXMLMajorVers>13</qbXMLMajorVers>
      <qbXMLMinorVers>0</qbXMLMinorVers>
    </sendRequestXML>
  `);

  // Extract QBXML from response (it's HTML-encoded)
  const match = response.match(/<tns:sendRequestXMLResult>(.*?)<\/tns:sendRequestXMLResult>/s);
  if (!match) return null;

  // Decode HTML entities
  let qbxml = match[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

  return qbxml.trim() || null;
}

function generateQBResponse(qbxml, requestId) {
  const timestamp = Date.now();
  const listId = `80000${Math.floor(Math.random() * 900 + 100)}-${timestamp}`;
  const txnId = `${Math.floor(Math.random() * 90000 + 10000)}-${timestamp}`;

  // Determine request type
  if (qbxml.includes('CustomerAddRq')) {
    // Extract name for response
    const nameMatch = qbxml.match(/<Name>([^<]+)<\/Name>/);
    const name = nameMatch ? nameMatch[1] : 'Customer';

    return `<?xml version="1.0"?>
<?qbxml version="13.0"?>
<QBXML>
<QBXMLMsgsRs>
<CustomerAddRs requestID="${requestId}" statusCode="0" statusSeverity="Info" statusMessage="Status OK">
<CustomerRet>
<ListID>${listId}</ListID>
<TimeCreated>2026-03-27T12:00:00-05:00</TimeCreated>
<TimeModified>2026-03-27T12:00:00-05:00</TimeModified>
<EditSequence>${timestamp}</EditSequence>
<Name>${name}</Name>
<FullName>${name}</FullName>
<IsActive>true</IsActive>
</CustomerRet>
</CustomerAddRs>
</QBXMLMsgsRs>
</QBXML>`;
  }

  if (qbxml.includes('InvoiceAddRq')) {
    return `<?xml version="1.0"?>
<?qbxml version="13.0"?>
<QBXML>
<QBXMLMsgsRs>
<InvoiceAddRs requestID="${requestId}" statusCode="0" statusSeverity="Info" statusMessage="Status OK">
<InvoiceRet>
<TxnID>${txnId}</TxnID>
<TimeCreated>2026-03-27T12:00:00-05:00</TimeCreated>
<TimeModified>2026-03-27T12:00:00-05:00</TimeModified>
<EditSequence>${timestamp}</EditSequence>
<TxnNumber>INV-${timestamp}</TxnNumber>
</InvoiceRet>
</InvoiceAddRs>
</QBXMLMsgsRs>
</QBXML>`;
  }

  if (qbxml.includes('ReceivePaymentAddRq')) {
    return `<?xml version="1.0"?>
<?qbxml version="13.0"?>
<QBXML>
<QBXMLMsgsRs>
<ReceivePaymentAddRs requestID="${requestId}" statusCode="0" statusSeverity="Info" statusMessage="Status OK">
<ReceivePaymentRet>
<TxnID>${txnId}</TxnID>
<TimeCreated>2026-03-27T12:00:00-05:00</TimeCreated>
<TimeModified>2026-03-27T12:00:00-05:00</TimeModified>
<EditSequence>${timestamp}</EditSequence>
</ReceivePaymentRet>
</ReceivePaymentAddRs>
</QBXMLMsgsRs>
</QBXML>`;
  }

  return null;
}

async function receiveResponseXML(ticket, response) {
  const result = await soapRequest('receiveResponseXML', `
    <receiveResponseXML xmlns="http://developer.intuit.com/">
      <ticket>${ticket}</ticket>
      <response><![CDATA[${response}]]></response>
      <hresult></hresult>
      <message></message>
    </receiveResponseXML>
  `);

  const match = result.match(/<tns:receiveResponseXMLResult>(\d+)<\/tns:receiveResponseXMLResult>/);
  return match ? parseInt(match[1]) : -1;
}

async function main() {
  const maxItems = parseInt(process.argv[2]) || 10;
  console.log(`\nSimulating QBWC processing for up to ${maxItems} items...\n`);

  let processed = 0;
  let progress = 0;

  while (processed < maxItems && progress >= 0 && progress < 100) {
    // Get fresh ticket
    const ticket = await authenticate();
    if (!ticket) {
      console.error('Failed to authenticate');
      break;
    }

    // Get next request
    const qbxml = await sendRequestXML(ticket);
    if (!qbxml) {
      console.log('No more pending requests');
      break;
    }

    // Extract request ID
    const reqIdMatch = qbxml.match(/requestID="(\d+)"/);
    const requestId = reqIdMatch ? reqIdMatch[1] : '1';

    // Determine type
    let type = 'unknown';
    if (qbxml.includes('CustomerAddRq')) type = 'patient';
    else if (qbxml.includes('InvoiceAddRq')) type = 'invoice';
    else if (qbxml.includes('ReceivePaymentAddRq')) type = 'payment';

    // Generate simulated QB response
    const qbResponse = generateQBResponse(qbxml, requestId);
    if (!qbResponse) {
      console.log(`  [${processed + 1}] Unknown request type, skipping`);
      break;
    }

    // Send response
    progress = await receiveResponseXML(ticket, qbResponse);
    processed++;

    console.log(`  [${processed}] ${type} (req ${requestId}) -> ${progress}% complete`);

    // Small delay
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone! Processed ${processed} items. Final progress: ${progress}%`);
}

main().catch(console.error);
