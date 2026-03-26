// QBXML Builder Service for QuickBooks Desktop Web Connector
// Builds QBXML requests and parses responses

const QBXML_VERSION = '13.0';

// ===== Request Builders =====

export function wrapInQBXML(requestXML: string): string {
  // Trim whitespace and normalize the inner XML
  const trimmedRequest = requestXML.trim();
  return `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="${QBXML_VERSION}"?>
<QBXML>
<QBXMLMsgsRq onError="stopOnError">
${trimmedRequest}
</QBXMLMsgsRq>
</QBXML>`;
}

// Escape XML special characters
function escapeXML(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Format date for QBXML (YYYY-MM-DD)
function formatQBDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

// ===== Customer (Patient) Builders =====

interface PatientData {
  id: number;
  patient_number: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
}

export function buildCustomerAddRq(patient: PatientData, requestId?: string): string {
  const name = `${patient.first_name} ${patient.last_name} (${patient.patient_number})`.substring(0, 41);

  let addressXML = '';
  if (patient.address || patient.city || patient.state) {
    addressXML = `
        <BillAddress>
          ${patient.address ? `<Addr1>${escapeXML(patient.address.substring(0, 41))}</Addr1>` : ''}
          ${patient.city ? `<City>${escapeXML(patient.city.substring(0, 31))}</City>` : ''}
          ${patient.state ? `<State>${escapeXML(patient.state.substring(0, 21))}</State>` : ''}
        </BillAddress>`;
  }

  const requestXML = `
    <CustomerAddRq${requestId ? ` requestID="${requestId}"` : ''}>
      <CustomerAdd>
        <Name>${escapeXML(name)}</Name>
        <IsActive>true</IsActive>
        ${patient.first_name ? `<FirstName>${escapeXML(patient.first_name.substring(0, 25))}</FirstName>` : ''}
        ${patient.last_name ? `<LastName>${escapeXML(patient.last_name.substring(0, 25))}</LastName>` : ''}
        ${patient.phone ? `<Phone>${escapeXML(patient.phone.substring(0, 21))}</Phone>` : ''}
        ${patient.email ? `<Email>${escapeXML(patient.email.substring(0, 1023))}</Email>` : ''}
        ${addressXML}
      </CustomerAdd>
    </CustomerAddRq>`;

  return wrapInQBXML(requestXML);
}

export function buildCustomerModRq(
  patient: PatientData,
  listId: string,
  editSequence: string,
  requestId?: string
): string {
  const name = `${patient.first_name} ${patient.last_name} (${patient.patient_number})`.substring(0, 41);

  let addressXML = '';
  if (patient.address || patient.city || patient.state) {
    addressXML = `
        <BillAddress>
          ${patient.address ? `<Addr1>${escapeXML(patient.address.substring(0, 41))}</Addr1>` : ''}
          ${patient.city ? `<City>${escapeXML(patient.city.substring(0, 31))}</City>` : ''}
          ${patient.state ? `<State>${escapeXML(patient.state.substring(0, 21))}</State>` : ''}
        </BillAddress>`;
  }

  const requestXML = `
    <CustomerModRq${requestId ? ` requestID="${requestId}"` : ''}>
      <CustomerMod>
        <ListID>${escapeXML(listId)}</ListID>
        <EditSequence>${escapeXML(editSequence)}</EditSequence>
        <Name>${escapeXML(name)}</Name>
        ${patient.first_name ? `<FirstName>${escapeXML(patient.first_name.substring(0, 25))}</FirstName>` : ''}
        ${patient.last_name ? `<LastName>${escapeXML(patient.last_name.substring(0, 25))}</LastName>` : ''}
        ${patient.phone ? `<Phone>${escapeXML(patient.phone.substring(0, 21))}</Phone>` : ''}
        ${patient.email ? `<Email>${escapeXML(patient.email.substring(0, 1023))}</Email>` : ''}
        ${addressXML}
      </CustomerMod>
    </CustomerModRq>`;

  return wrapInQBXML(requestXML);
}

export function buildCustomerQueryRq(patientNumber: string, requestId?: string): string {
  const name = `%${patientNumber}%`;

  const requestXML = `
    <CustomerQueryRq${requestId ? ` requestID="${requestId}"` : ''}>
      <NameFilter>
        <MatchCriterion>Contains</MatchCriterion>
        <Name>${escapeXML(name)}</Name>
      </NameFilter>
    </CustomerQueryRq>`;

  return wrapInQBXML(requestXML);
}

// ===== Service Item Builders =====

interface ServiceItemData {
  id: number;
  service_code: string;
  service_name: string;
  price: number;
  description?: string;
}

export function buildItemServiceAddRq(item: ServiceItemData, incomeAccountListId: string, requestId?: string): string {
  const requestXML = `
    <ItemServiceAddRq${requestId ? ` requestID="${requestId}"` : ''}>
      <ItemServiceAdd>
        <Name>${escapeXML(item.service_code.substring(0, 31))}</Name>
        <IsActive>true</IsActive>
        <SalesOrPurchase>
          <Desc>${escapeXML((item.service_name + (item.description ? ' - ' + item.description : '')).substring(0, 4095))}</Desc>
          <Price>${item.price.toFixed(2)}</Price>
          <AccountRef>
            <ListID>${escapeXML(incomeAccountListId)}</ListID>
          </AccountRef>
        </SalesOrPurchase>
      </ItemServiceAdd>
    </ItemServiceAddRq>`;

  return wrapInQBXML(requestXML);
}

// ===== Invoice Builders =====

interface InvoiceData {
  id: number;
  invoice_number: string;
  invoice_date: string | Date;
  due_date?: string | Date;
  patient_id: number;
  total_amount: number;
  notes?: string;
}

interface InvoiceItemData {
  description: string;
  quantity: number;
  unit_price: number;
  charge_master_id?: number;
}

export function buildInvoiceAddRq(
  invoice: InvoiceData,
  items: InvoiceItemData[],
  customerListId: string,
  itemListIds: Map<number, string>, // charge_master_id -> QB ListID
  requestId?: string
): string {
  const lineItems = items.map((item, index) => {
    const itemRef = item.charge_master_id && itemListIds.has(item.charge_master_id)
      ? `<ItemRef><ListID>${escapeXML(itemListIds.get(item.charge_master_id)!)}</ListID></ItemRef>`
      : '';

    return `
      <InvoiceLineAdd>
        ${itemRef}
        <Desc>${escapeXML(item.description.substring(0, 4095))}</Desc>
        <Quantity>${item.quantity}</Quantity>
        <Rate>${item.unit_price.toFixed(2)}</Rate>
      </InvoiceLineAdd>`;
  }).join('');

  const requestXML = `
    <InvoiceAddRq${requestId ? ` requestID="${requestId}"` : ''}>
      <InvoiceAdd>
        <CustomerRef>
          <ListID>${escapeXML(customerListId)}</ListID>
        </CustomerRef>
        <TxnDate>${formatQBDate(invoice.invoice_date)}</TxnDate>
        ${invoice.due_date ? `<DueDate>${formatQBDate(invoice.due_date)}</DueDate>` : ''}
        <RefNumber>${escapeXML(invoice.invoice_number.substring(0, 11))}</RefNumber>
        ${invoice.notes ? `<Memo>${escapeXML(invoice.notes.substring(0, 4095))}</Memo>` : ''}
        ${lineItems}
      </InvoiceAdd>
    </InvoiceAddRq>`;

  return wrapInQBXML(requestXML);
}

export function buildInvoiceQueryRq(invoiceNumber: string, requestId?: string): string {
  const requestXML = `
    <InvoiceQueryRq${requestId ? ` requestID="${requestId}"` : ''}>
      <RefNumberFilter>
        <MatchCriterion>StartsWith</MatchCriterion>
        <RefNumber>${escapeXML(invoiceNumber)}</RefNumber>
      </RefNumberFilter>
    </InvoiceQueryRq>`;

  return wrapInQBXML(requestXML);
}

// ===== Payment Builders =====

interface PaymentData {
  id: number;
  invoice_id: number;
  amount: number;
  payment_date: string | Date;
  payment_method?: string;
  reference_number?: string;
}

export function buildReceivePaymentAddRq(
  payment: PaymentData,
  customerListId: string,
  invoiceTxnId: string,
  requestId?: string
): string {
  const requestXML = `
    <ReceivePaymentAddRq${requestId ? ` requestID="${requestId}"` : ''}>
      <ReceivePaymentAdd>
        <CustomerRef>
          <ListID>${escapeXML(customerListId)}</ListID>
        </CustomerRef>
        <TxnDate>${formatQBDate(payment.payment_date)}</TxnDate>
        ${payment.reference_number ? `<RefNumber>${escapeXML(payment.reference_number.substring(0, 11))}</RefNumber>` : ''}
        <TotalAmount>${payment.amount.toFixed(2)}</TotalAmount>
        ${payment.payment_method ? `<Memo>Payment Method: ${escapeXML(payment.payment_method)}</Memo>` : ''}
        <AppliedToTxnAdd>
          <TxnID>${escapeXML(invoiceTxnId)}</TxnID>
          <PaymentAmount>${payment.amount.toFixed(2)}</PaymentAmount>
        </AppliedToTxnAdd>
      </ReceivePaymentAdd>
    </ReceivePaymentAddRq>`;

  return wrapInQBXML(requestXML);
}

// ===== Account Query (to find income account) =====

export function buildAccountQueryRq(accountType: string = 'Income', requestId?: string): string {
  const requestXML = `
    <AccountQueryRq${requestId ? ` requestID="${requestId}"` : ''}>
      <AccountType>${escapeXML(accountType)}</AccountType>
      <MaxReturned>10</MaxReturned>
    </AccountQueryRq>`;

  return wrapInQBXML(requestXML);
}

// ===== Response Parsers =====

interface QBResponse {
  statusCode: string;
  statusMessage: string;
  statusSeverity: string;
}

interface CustomerResponse extends QBResponse {
  listId?: string;
  editSequence?: string;
  name?: string;
}

interface InvoiceResponse extends QBResponse {
  txnId?: string;
  editSequence?: string;
  refNumber?: string;
}

interface PaymentResponse extends QBResponse {
  txnId?: string;
}

interface AccountResponse extends QBResponse {
  listId?: string;
  name?: string;
  accountType?: string;
}

// Simple XML parser helper (extracts value between tags)
function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function extractAttribute(xml: string, tagName: string, attrName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*\\s${attrName}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

export function parseCustomerResponse(xml: string): CustomerResponse {
  const statusCode = extractAttribute(xml, 'CustomerAddRs|CustomerModRs|CustomerQueryRs', 'statusCode') ||
                     extractTag(xml, 'statusCode') || '0';
  const statusMessage = extractAttribute(xml, 'CustomerAddRs|CustomerModRs|CustomerQueryRs', 'statusMessage') ||
                        extractTag(xml, 'statusMessage') || '';
  const statusSeverity = extractAttribute(xml, 'CustomerAddRs|CustomerModRs|CustomerQueryRs', 'statusSeverity') ||
                         extractTag(xml, 'statusSeverity') || 'Info';

  return {
    statusCode,
    statusMessage,
    statusSeverity,
    listId: extractTag(xml, 'ListID') || undefined,
    editSequence: extractTag(xml, 'EditSequence') || undefined,
    name: extractTag(xml, 'Name') || undefined,
  };
}

export function parseInvoiceResponse(xml: string): InvoiceResponse {
  const statusCode = extractAttribute(xml, 'InvoiceAddRs|InvoiceModRs|InvoiceQueryRs', 'statusCode') ||
                     extractTag(xml, 'statusCode') || '0';
  const statusMessage = extractAttribute(xml, 'InvoiceAddRs|InvoiceModRs|InvoiceQueryRs', 'statusMessage') ||
                        extractTag(xml, 'statusMessage') || '';
  const statusSeverity = extractAttribute(xml, 'InvoiceAddRs|InvoiceModRs|InvoiceQueryRs', 'statusSeverity') ||
                         extractTag(xml, 'statusSeverity') || 'Info';

  return {
    statusCode,
    statusMessage,
    statusSeverity,
    txnId: extractTag(xml, 'TxnID') || undefined,
    editSequence: extractTag(xml, 'EditSequence') || undefined,
    refNumber: extractTag(xml, 'RefNumber') || undefined,
  };
}

export function parsePaymentResponse(xml: string): PaymentResponse {
  const statusCode = extractAttribute(xml, 'ReceivePaymentAddRs', 'statusCode') ||
                     extractTag(xml, 'statusCode') || '0';
  const statusMessage = extractAttribute(xml, 'ReceivePaymentAddRs', 'statusMessage') ||
                        extractTag(xml, 'statusMessage') || '';
  const statusSeverity = extractAttribute(xml, 'ReceivePaymentAddRs', 'statusSeverity') ||
                         extractTag(xml, 'statusSeverity') || 'Info';

  return {
    statusCode,
    statusMessage,
    statusSeverity,
    txnId: extractTag(xml, 'TxnID') || undefined,
  };
}

export function parseAccountResponse(xml: string): AccountResponse {
  const statusCode = extractAttribute(xml, 'AccountQueryRs', 'statusCode') || '0';
  const statusMessage = extractAttribute(xml, 'AccountQueryRs', 'statusMessage') || '';
  const statusSeverity = extractAttribute(xml, 'AccountQueryRs', 'statusSeverity') || 'Info';

  return {
    statusCode,
    statusMessage,
    statusSeverity,
    listId: extractTag(xml, 'ListID') || undefined,
    name: extractTag(xml, 'Name') || undefined,
    accountType: extractTag(xml, 'AccountType') || undefined,
  };
}

export function isSuccessResponse(statusCode: string): boolean {
  // 0 = Success, 500 = Object not found (warning), 1 = User cancelled
  return statusCode === '0' || statusCode === '500';
}

// ===== IMPORT QUERIES (Pull from QuickBooks) =====

// Query ALL customers from QuickBooks
export function buildCustomerQueryAllRq(requestId?: string): string {
  const requestXML = `<CustomerQueryRq${requestId ? ` requestID="${requestId}"` : ''}></CustomerQueryRq>`;
  return wrapInQBXML(requestXML);
}

// Query ALL service items from QuickBooks
export function buildItemServiceQueryAllRq(requestId?: string): string {
  const requestXML = `<ItemServiceQueryRq${requestId ? ` requestID="${requestId}"` : ''}></ItemServiceQueryRq>`;
  return wrapInQBXML(requestXML);
}

// Query ALL invoices from QuickBooks (with date range option)
export function buildInvoiceQueryAllRq(fromDate?: string, toDate?: string, requestId?: string): string {
  let dateFilter = '';
  if (fromDate || toDate) {
    dateFilter = `<ModifiedDateRangeFilter>
${fromDate ? `<FromModifiedDate>${fromDate}</FromModifiedDate>` : ''}
${toDate ? `<ToModifiedDate>${toDate}</ToModifiedDate>` : ''}
</ModifiedDateRangeFilter>`;
  }

  const requestXML = `<InvoiceQueryRq${requestId ? ` requestID="${requestId}"` : ''}>
${dateFilter}<MaxReturned>500</MaxReturned>
<IncludeLineItems>true</IncludeLineItems>
</InvoiceQueryRq>`;
  return wrapInQBXML(requestXML);
}

// ===== IMPORT Response Parsers (Multiple Results) =====

export interface QBCustomer {
  listId: string;
  editSequence: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  isActive: boolean;
}

export interface QBServiceItem {
  listId: string;
  editSequence: string;
  name: string;
  description?: string;
  price?: number;
  isActive: boolean;
}

export interface QBInvoiceLineItem {
  itemListId?: string;
  itemName?: string;
  description?: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface QBInvoice {
  txnId: string;
  editSequence: string;
  refNumber: string;
  customerListId: string;
  customerName?: string;
  txnDate: string;
  dueDate?: string;
  subtotal: number;
  totalAmount: number;
  isPaid: boolean;
  lineItems: QBInvoiceLineItem[];
}

// Parse multiple customers from CustomerQueryRs
export function parseCustomersFromResponse(xml: string): QBCustomer[] {
  const customers: QBCustomer[] = [];

  // Split by CustomerRet tags
  const customerMatches = xml.match(/<CustomerRet>[\s\S]*?<\/CustomerRet>/g) || [];

  for (const customerXml of customerMatches) {
    const listId = extractTag(customerXml, 'ListID');
    const editSequence = extractTag(customerXml, 'EditSequence');
    const name = extractTag(customerXml, 'Name') || extractTag(customerXml, 'FullName');

    if (listId && name) {
      customers.push({
        listId,
        editSequence: editSequence || '',
        name,
        firstName: extractTag(customerXml, 'FirstName') || undefined,
        lastName: extractTag(customerXml, 'LastName') || undefined,
        phone: extractTag(customerXml, 'Phone') || undefined,
        email: extractTag(customerXml, 'Email') || undefined,
        address: extractTag(customerXml, 'Addr1') || undefined,
        city: extractTag(customerXml, 'City') || undefined,
        state: extractTag(customerXml, 'State') || undefined,
        isActive: extractTag(customerXml, 'IsActive') !== 'false',
      });
    }
  }

  return customers;
}

// Parse multiple service items from ItemServiceQueryRs
export function parseServiceItemsFromResponse(xml: string): QBServiceItem[] {
  const items: QBServiceItem[] = [];

  // Split by ItemServiceRet tags
  const itemMatches = xml.match(/<ItemServiceRet>[\s\S]*?<\/ItemServiceRet>/g) || [];

  for (const itemXml of itemMatches) {
    const listId = extractTag(itemXml, 'ListID');
    const name = extractTag(itemXml, 'Name') || extractTag(itemXml, 'FullName');

    if (listId && name) {
      const priceStr = extractTag(itemXml, 'Price') || extractTag(itemXml, 'SalesOrPurchase/Price');
      items.push({
        listId,
        editSequence: extractTag(itemXml, 'EditSequence') || '',
        name,
        description: extractTag(itemXml, 'Desc') || extractTag(itemXml, 'SalesOrPurchase/Desc') || undefined,
        price: priceStr ? parseFloat(priceStr) : undefined,
        isActive: extractTag(itemXml, 'IsActive') !== 'false',
      });
    }
  }

  return items;
}

// Parse multiple invoices from InvoiceQueryRs
export function parseInvoicesFromResponse(xml: string): QBInvoice[] {
  const invoices: QBInvoice[] = [];

  // Split by InvoiceRet tags
  const invoiceMatches = xml.match(/<InvoiceRet>[\s\S]*?<\/InvoiceRet>/g) || [];

  for (const invoiceXml of invoiceMatches) {
    const txnId = extractTag(invoiceXml, 'TxnID');
    const refNumber = extractTag(invoiceXml, 'RefNumber');

    if (txnId) {
      // Parse line items
      const lineItems: QBInvoiceLineItem[] = [];
      const lineMatches = invoiceXml.match(/<InvoiceLineRet>[\s\S]*?<\/InvoiceLineRet>/g) || [];

      for (const lineXml of lineMatches) {
        lineItems.push({
          itemListId: extractTag(lineXml, 'ItemRef/ListID') || extractNestedTag(lineXml, 'ItemRef', 'ListID') || undefined,
          itemName: extractTag(lineXml, 'ItemRef/FullName') || extractNestedTag(lineXml, 'ItemRef', 'FullName') || undefined,
          description: extractTag(lineXml, 'Desc') || '',
          quantity: parseFloat(extractTag(lineXml, 'Quantity') || '1'),
          rate: parseFloat(extractTag(lineXml, 'Rate') || '0'),
          amount: parseFloat(extractTag(lineXml, 'Amount') || '0'),
        });
      }

      const subtotal = parseFloat(extractTag(invoiceXml, 'Subtotal') || '0');
      const totalAmount = parseFloat(extractTag(invoiceXml, 'BalanceRemaining') || extractTag(invoiceXml, 'AppliedAmount') || '0');
      const isPaid = extractTag(invoiceXml, 'IsPaid') === 'true';

      invoices.push({
        txnId,
        editSequence: extractTag(invoiceXml, 'EditSequence') || '',
        refNumber: refNumber || '',
        customerListId: extractTag(invoiceXml, 'CustomerRef/ListID') || extractNestedTag(invoiceXml, 'CustomerRef', 'ListID') || '',
        customerName: extractTag(invoiceXml, 'CustomerRef/FullName') || extractNestedTag(invoiceXml, 'CustomerRef', 'FullName') || undefined,
        txnDate: extractTag(invoiceXml, 'TxnDate') || '',
        dueDate: extractTag(invoiceXml, 'DueDate') || undefined,
        subtotal,
        totalAmount: parseFloat(extractTag(invoiceXml, 'Subtotal') || '0'),
        isPaid,
        lineItems,
      });
    }
  }

  return invoices;
}

// Helper to extract nested tags like <CustomerRef><ListID>xxx</ListID></CustomerRef>
function extractNestedTag(xml: string, parentTag: string, childTag: string): string | null {
  const parentRegex = new RegExp(`<${parentTag}>[\\s\\S]*?</${parentTag}>`, 'i');
  const parentMatch = xml.match(parentRegex);
  if (parentMatch) {
    return extractTag(parentMatch[0], childTag);
  }
  return null;
}
