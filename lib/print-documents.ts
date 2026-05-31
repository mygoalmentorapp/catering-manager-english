import type { Order, Product } from "./types";

// ============ Smart decimal formatting ============
function formatPrice(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const fixed = value.toFixed(2);
  if (fixed.endsWith(".00")) return String(Math.round(value));
  return fixed;
}

function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "";
  }
}

interface PrintDocOptions {
  order: Order;
  products: Product[];
  businessName: string;
  logoBase64?: string; // data:image/png;base64,... or empty
}

const commonStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    direction: rtl;
    text-align: right;
    padding: 30px;
    color: #1E1E2E;
    font-size: 14px;
    line-height: 1.6;
  }
  .header {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid #3AAFA9;
  }
  .header-right {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }
  .logo {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
  }
  .business-name {
    font-size: 22px;
    font-weight: 700;
    color: #3AAFA9;
  }
  .doc-title {
    font-size: 18px;
    font-weight: 600;
    color: #7A7A90;
  }
  .info-section {
    margin-bottom: 20px;
    background: #F8F8FC;
    border-radius: 10px;
    padding: 16px;
  }
  .info-row {
    display: flex;
    flex-direction: row;
    gap: 6px;
    margin-bottom: 6px;
  }
  .info-label {
    font-weight: 600;
    min-width: 100px;
    color: #7A7A90;
  }
  .info-value {
    color: #1E1E2E;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  th {
    background: #3AAFA9;
    color: white;
    padding: 10px 14px;
    text-align: right;
    font-weight: 600;
    font-size: 14px;
  }
  td {
    padding: 10px 14px;
    border-bottom: 1px solid #E8E8F0;
    text-align: right;
    font-size: 14px;
  }
  tr:nth-child(even) td {
    background: #F8F8FC;
  }
  .total-row {
    background: #3AAFA9 !important;
    color: white;
    font-weight: 700;
    font-size: 16px;
  }
  .total-row td {
    border-bottom: none;
    color: white;
    background: #3AAFA9 !important;
  }
  .notes-section {
    margin-top: 20px;
    background: #F8F8FC;
    border-radius: 10px;
    padding: 16px;
  }
  .notes-title {
    font-weight: 600;
    color: #3AAFA9;
    margin-bottom: 8px;
    font-size: 15px;
  }
  .notes-text {
    color: #1E1E2E;
    white-space: pre-wrap;
  }
  @page { margin: 20px; }
`;

function buildHeader(businessName: string, docTitle: string, logoBase64?: string): string {
  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" class="logo" />`
    : "";
  return `
    <div class="header">
      <div class="header-right">
        ${logoHtml}
        <div class="business-name">${businessName}</div>
      </div>
      <div class="doc-title">${docTitle}</div>
    </div>
  `;
}

function buildCustomerInfo(order: Order): string {
  return `
    <div class="info-section">
      <div class="info-row">
        <span class="info-label">שם לקוח:</span>
        <span class="info-value">${order.customerName}</span>
      </div>
      ${order.customerPhone ? `
      <div class="info-row">
        <span class="info-label">טלפון:</span>
        <span class="info-value">${order.customerPhone}</span>
      </div>` : ""}
      ${order.customerAddress ? `
      <div class="info-row">
        <span class="info-label">כתובת:</span>
        <span class="info-value">${order.customerAddress}</span>
      </div>` : ""}
      <div class="info-row">
        <span class="info-label">תאריך אירוע:</span>
        <span class="info-value">${formatDate(order.eventDate)}</span>
      </div>
    </div>
  `;
}

function buildNotes(notes: string): string {
  if (!notes) return "";
  return `
    <div class="notes-section">
      <div class="notes-title">הערות</div>
      <div class="notes-text">${notes}</div>
    </div>
  `;
}

/**
 * Generate HTML for a price quote document (הצעת מחיר)
 * Includes: logo, business name, customer details, products with prices, total, notes
 */
export function generatePriceQuoteHtml(opts: PrintDocOptions): string {
  const { order, products, businessName, logoBase64 } = opts;

  let rows = "";
  let total = 0;
  order.products.forEach((op, idx) => {
    const prod = products.find((p) => p.id === op.productId);
    const unitPrice = prod ? (prod.customerPrice ?? 0) : 0;
    const lineTotal = Math.round(unitPrice * op.quantity * 10) / 10;
    total += lineTotal;
    rows += `
      <tr>
        <td>${idx + 1}</td>
<td>${op.productNameAtAdd}</td>
         <td>${op.quantity}</td>
         <td>₪${formatPrice(unitPrice)}</td>
        <td>₪${formatPrice(lineTotal)}</td>
      </tr>
    `;
  });
  total = Math.round(total * 10) / 10;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${commonStyles}</style>
</head>
<body>
  ${buildHeader(businessName, "הזמנה עם מחירים", logoBase64)}
  ${buildCustomerInfo(order)}
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>מוצר</th>
        <th>כמות</th>
        <th>מחיר ליחידה</th>
        <th>סה"כ</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="4">סה"כ לתשלום</td>
        <td>₪${formatPrice(total)}</td>
      </tr>
    </tbody>
  </table>
  ${buildNotes(order.notes)}
</body>
</html>`;
}

/**
 * Generate HTML for an execution list document (רשימת ביצוע)
 * Includes: logo, business name, customer name, event date, products WITHOUT prices, notes
 */
export function generateExecutionListHtml(opts: PrintDocOptions): string {
  const { order, businessName, logoBase64 } = opts;

  let rows = "";
  order.products.forEach((op, idx) => {
    rows += `
      <tr>
        <td>${idx + 1}</td>
<td>${op.productNameAtAdd}</td>
         <td>${op.quantity}</td>
       </tr>
    `;
  });

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${commonStyles}</style>
</head>
<body>
  ${buildHeader(businessName, "הזמנה לביצוע", logoBase64)}
  ${buildCustomerInfo(order)}
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>מוצר</th>
        <th>כמות</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  ${buildNotes(order.notes)}
</body>
</html>`;
}
