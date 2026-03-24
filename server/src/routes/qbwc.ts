// QuickBooks Web Connector SOAP Endpoint
import express, { Request, Response } from 'express';
import * as qbwcService from '../services/qbwcService';

const router = express.Router();

// WSDL for Web Connector
const WSDL = `<?xml version="1.0" encoding="utf-8"?>
<definitions xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
             xmlns:tns="http://developer.intuit.com/"
             xmlns:s="http://www.w3.org/2001/XMLSchema"
             xmlns:http="http://schemas.xmlsoap.org/wsdl/http/"
             xmlns="http://schemas.xmlsoap.org/wsdl/"
             targetNamespace="http://developer.intuit.com/"
             name="QBWebConnectorSvc">
  <types>
    <s:schema elementFormDefault="qualified" targetNamespace="http://developer.intuit.com/">
      <s:element name="serverVersion">
        <s:complexType/>
      </s:element>
      <s:element name="serverVersionResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="serverVersionResult" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="clientVersion">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="strVersion" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="clientVersionResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="clientVersionResult" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="authenticate">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="strUserName" type="s:string"/>
            <s:element minOccurs="0" maxOccurs="1" name="strPassword" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="authenticateResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="authenticateResult" type="tns:ArrayOfString"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:complexType name="ArrayOfString">
        <s:sequence>
          <s:element minOccurs="0" maxOccurs="unbounded" name="string" nillable="true" type="s:string"/>
        </s:sequence>
      </s:complexType>
      <s:element name="sendRequestXML">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="ticket" type="s:string"/>
            <s:element minOccurs="0" maxOccurs="1" name="strHCPResponse" type="s:string"/>
            <s:element minOccurs="0" maxOccurs="1" name="strCompanyFileName" type="s:string"/>
            <s:element minOccurs="0" maxOccurs="1" name="qbXMLCountry" type="s:string"/>
            <s:element minOccurs="1" maxOccurs="1" name="qbXMLMajorVers" type="s:int"/>
            <s:element minOccurs="1" maxOccurs="1" name="qbXMLMinorVers" type="s:int"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="sendRequestXMLResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="sendRequestXMLResult" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="receiveResponseXML">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="ticket" type="s:string"/>
            <s:element minOccurs="0" maxOccurs="1" name="response" type="s:string"/>
            <s:element minOccurs="0" maxOccurs="1" name="hresult" type="s:string"/>
            <s:element minOccurs="0" maxOccurs="1" name="message" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="receiveResponseXMLResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="1" maxOccurs="1" name="receiveResponseXMLResult" type="s:int"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="connectionError">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="ticket" type="s:string"/>
            <s:element minOccurs="0" maxOccurs="1" name="hresult" type="s:string"/>
            <s:element minOccurs="0" maxOccurs="1" name="message" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="connectionErrorResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="connectionErrorResult" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="getLastError">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="ticket" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="getLastErrorResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="getLastErrorResult" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="closeConnection">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="ticket" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
      <s:element name="closeConnectionResponse">
        <s:complexType>
          <s:sequence>
            <s:element minOccurs="0" maxOccurs="1" name="closeConnectionResult" type="s:string"/>
          </s:sequence>
        </s:complexType>
      </s:element>
    </s:schema>
  </types>
  <message name="serverVersionSoapIn">
    <part name="parameters" element="tns:serverVersion"/>
  </message>
  <message name="serverVersionSoapOut">
    <part name="parameters" element="tns:serverVersionResponse"/>
  </message>
  <message name="clientVersionSoapIn">
    <part name="parameters" element="tns:clientVersion"/>
  </message>
  <message name="clientVersionSoapOut">
    <part name="parameters" element="tns:clientVersionResponse"/>
  </message>
  <message name="authenticateSoapIn">
    <part name="parameters" element="tns:authenticate"/>
  </message>
  <message name="authenticateSoapOut">
    <part name="parameters" element="tns:authenticateResponse"/>
  </message>
  <message name="sendRequestXMLSoapIn">
    <part name="parameters" element="tns:sendRequestXML"/>
  </message>
  <message name="sendRequestXMLSoapOut">
    <part name="parameters" element="tns:sendRequestXMLResponse"/>
  </message>
  <message name="receiveResponseXMLSoapIn">
    <part name="parameters" element="tns:receiveResponseXML"/>
  </message>
  <message name="receiveResponseXMLSoapOut">
    <part name="parameters" element="tns:receiveResponseXMLResponse"/>
  </message>
  <message name="connectionErrorSoapIn">
    <part name="parameters" element="tns:connectionError"/>
  </message>
  <message name="connectionErrorSoapOut">
    <part name="parameters" element="tns:connectionErrorResponse"/>
  </message>
  <message name="getLastErrorSoapIn">
    <part name="parameters" element="tns:getLastError"/>
  </message>
  <message name="getLastErrorSoapOut">
    <part name="parameters" element="tns:getLastErrorResponse"/>
  </message>
  <message name="closeConnectionSoapIn">
    <part name="parameters" element="tns:closeConnection"/>
  </message>
  <message name="closeConnectionSoapOut">
    <part name="parameters" element="tns:closeConnectionResponse"/>
  </message>
  <portType name="QBWebConnectorSvcSoap">
    <operation name="serverVersion">
      <input message="tns:serverVersionSoapIn"/>
      <output message="tns:serverVersionSoapOut"/>
    </operation>
    <operation name="clientVersion">
      <input message="tns:clientVersionSoapIn"/>
      <output message="tns:clientVersionSoapOut"/>
    </operation>
    <operation name="authenticate">
      <input message="tns:authenticateSoapIn"/>
      <output message="tns:authenticateSoapOut"/>
    </operation>
    <operation name="sendRequestXML">
      <input message="tns:sendRequestXMLSoapIn"/>
      <output message="tns:sendRequestXMLSoapOut"/>
    </operation>
    <operation name="receiveResponseXML">
      <input message="tns:receiveResponseXMLSoapIn"/>
      <output message="tns:receiveResponseXMLSoapOut"/>
    </operation>
    <operation name="connectionError">
      <input message="tns:connectionErrorSoapIn"/>
      <output message="tns:connectionErrorSoapOut"/>
    </operation>
    <operation name="getLastError">
      <input message="tns:getLastErrorSoapIn"/>
      <output message="tns:getLastErrorSoapOut"/>
    </operation>
    <operation name="closeConnection">
      <input message="tns:closeConnectionSoapIn"/>
      <output message="tns:closeConnectionSoapOut"/>
    </operation>
  </portType>
  <binding name="QBWebConnectorSvcSoap" type="tns:QBWebConnectorSvcSoap">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="serverVersion">
      <soap:operation soapAction="http://developer.intuit.com/serverVersion" style="document"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="clientVersion">
      <soap:operation soapAction="http://developer.intuit.com/clientVersion" style="document"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="authenticate">
      <soap:operation soapAction="http://developer.intuit.com/authenticate" style="document"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="sendRequestXML">
      <soap:operation soapAction="http://developer.intuit.com/sendRequestXML" style="document"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="receiveResponseXML">
      <soap:operation soapAction="http://developer.intuit.com/receiveResponseXML" style="document"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="connectionError">
      <soap:operation soapAction="http://developer.intuit.com/connectionError" style="document"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="getLastError">
      <soap:operation soapAction="http://developer.intuit.com/getLastError" style="document"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="closeConnection">
      <soap:operation soapAction="http://developer.intuit.com/closeConnection" style="document"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>
  <service name="QBWebConnectorSvc">
    <port name="QBWebConnectorSvcSoap" binding="tns:QBWebConnectorSvcSoap">
      <soap:address location="https://medsys-five.vercel.app/api/quickbooks/soap"/>
    </port>
  </service>
</definitions>`;

// Helper to extract value from SOAP XML
function extractSoapValue(xml: string, tagName: string): string {
  const regex = new RegExp(`<[^:]*:?${tagName}[^>]*>([^<]*)<`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : '';
}

// Helper to build SOAP response
function buildSoapResponse(methodName: string, resultName: string, result: string | number | string[]): string {
  let resultXML: string;

  if (Array.isArray(result)) {
    // ArrayOfString needs proper namespace on string elements
    const stringElements = result.map(s => `<tns:string>${escapeXML(s)}</tns:string>`).join('');
    resultXML = `<tns:${resultName}>${stringElements}</tns:${resultName}>`;
  } else if (typeof result === 'number') {
    resultXML = `<tns:${resultName}>${result}</tns:${resultName}>`;
  } else {
    resultXML = `<tns:${resultName}>${escapeXML(result)}</tns:${resultName}>`;
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://developer.intuit.com/">
  <soap:Body>
    <tns:${methodName}Response>
      ${resultXML}
    </tns:${methodName}Response>
  </soap:Body>
</soap:Envelope>`;
}

function escapeXML(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// WSDL endpoint
router.get('/soap', (req: Request, res: Response) => {
  res.set('Content-Type', 'text/xml');
  res.send(WSDL);
});

// SOAP endpoint
router.post('/soap', express.text({ type: '*/*' }), async (req: Request, res: Response) => {
  try {
    const soapAction = req.headers['soapaction']?.toString().replace(/"/g, '') || '';
    const body = req.body as string;

    console.log(`[QBWC SOAP] Action: ${soapAction}`);

    let responseXML: string;

    if (soapAction.includes('serverVersion')) {
      const result = await qbwcService.serverVersion();
      responseXML = buildSoapResponse('serverVersion', 'serverVersionResult', result);
    }
    else if (soapAction.includes('clientVersion')) {
      const strVersion = extractSoapValue(body, 'strVersion');
      const result = await qbwcService.clientVersion(strVersion);
      responseXML = buildSoapResponse('clientVersion', 'clientVersionResult', result);
    }
    else if (soapAction.includes('authenticate')) {
      const strUserName = extractSoapValue(body, 'strUserName');
      const strPassword = extractSoapValue(body, 'strPassword');
      const [ticket, companyFile] = await qbwcService.authenticate(strUserName, strPassword);
      responseXML = buildSoapResponse('authenticate', 'authenticateResult', [ticket, companyFile]);
    }
    else if (soapAction.includes('sendRequestXML')) {
      const ticket = extractSoapValue(body, 'ticket');
      const strHCPResponse = extractSoapValue(body, 'strHCPResponse');
      const strCompanyFileName = extractSoapValue(body, 'strCompanyFileName');
      const qbXMLCountry = extractSoapValue(body, 'qbXMLCountry');
      const qbXMLMajorVers = parseInt(extractSoapValue(body, 'qbXMLMajorVers')) || 13;
      const qbXMLMinorVers = parseInt(extractSoapValue(body, 'qbXMLMinorVers')) || 0;

      const result = await qbwcService.sendRequestXML(
        ticket, strHCPResponse, strCompanyFileName,
        qbXMLCountry, qbXMLMajorVers, qbXMLMinorVers
      );
      responseXML = buildSoapResponse('sendRequestXML', 'sendRequestXMLResult', result);
    }
    else if (soapAction.includes('receiveResponseXML')) {
      const ticket = extractSoapValue(body, 'ticket');
      const response = extractSoapValue(body, 'response');
      const hresult = extractSoapValue(body, 'hresult');
      const message = extractSoapValue(body, 'message');

      const result = await qbwcService.receiveResponseXML(ticket, response, hresult, message);
      responseXML = buildSoapResponse('receiveResponseXML', 'receiveResponseXMLResult', result);
    }
    else if (soapAction.includes('connectionError')) {
      const ticket = extractSoapValue(body, 'ticket');
      const hresult = extractSoapValue(body, 'hresult');
      const message = extractSoapValue(body, 'message');

      const result = await qbwcService.connectionError(ticket, hresult, message);
      responseXML = buildSoapResponse('connectionError', 'connectionErrorResult', result);
    }
    else if (soapAction.includes('getLastError')) {
      const ticket = extractSoapValue(body, 'ticket');
      const result = await qbwcService.getLastError(ticket);
      responseXML = buildSoapResponse('getLastError', 'getLastErrorResult', result);
    }
    else if (soapAction.includes('closeConnection')) {
      const ticket = extractSoapValue(body, 'ticket');
      const result = await qbwcService.closeConnection(ticket);
      responseXML = buildSoapResponse('closeConnection', 'closeConnectionResult', result);
    }
    else {
      console.log(`[QBWC SOAP] Unknown action: ${soapAction}`);
      res.status(400).send('Unknown SOAP action');
      return;
    }

    res.set('Content-Type', 'text/xml');
    res.send(responseXML);

  } catch (error) {
    console.error('[QBWC SOAP] Error:', error);
    res.status(500).send('Internal server error');
  }
});

export default router;
