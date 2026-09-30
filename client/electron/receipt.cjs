const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function receiptHtml(receipt, width, fontUrl, reprint = false) {
  if (receipt.status !== 'PAID' || !Array.isArray(receipt.items) || !receipt.items.length || !Number.isFinite(receipt.amount) || receipt.amount <= 0) throw new Error('Invalid paid receipt');
  for (const item of receipt.items) if (typeof item.name !== 'string' || !Number.isInteger(item.count) || item.count <= 0 || !Number.isFinite(item.subtotal) || item.subtotal < 0) throw new Error('Invalid receipt item');
  if (receipt.items.reduce((sum, i) => sum + i.subtotal, 0) !== receipt.amount) throw new Error('Receipt total mismatch');
  const paidDate = receipt.paidAt ? new Intl.DateTimeFormat('lo-LA', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Vientiane' }).format(new Date(receipt.paidAt)) : '';
  const money = n => new Intl.NumberFormat('lo-LA').format(n) + ' ກີບ';
  return `<!doctype html><html lang="lo"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:"><style>
  @font-face{font-family:Lao;src:url('${fontUrl}')} @page{margin:0} *{box-sizing:border-box} body{margin:0;padding:3mm;width:${width}mm;font:12px Lao,sans-serif;color:#000} h1{text-align:center;font-size:18px} p{margin:5px 0;overflow-wrap:anywhere} table{width:100%;border-collapse:collapse} td{padding:4px 0;vertical-align:top;overflow-wrap:anywhere} td:last-child{text-align:right;white-space:nowrap} .total{border-top:1px dashed;font-weight:bold;font-size:15px} footer{text-align:center;margin-top:12px}
  </style></head><body><h1>4B-easy-POS</h1><p style="text-align:center">${reprint ? 'ສຳເນົາໃບຮັບເງິນ' : 'ໃບຮັບເງິນ'}</p><p>ເລກທີ: ${escape(receipt.orderNo)}</p><p>${escape(paidDate)}</p><table>${receipt.items.map(i => `<tr><td>${escape(i.name)} × ${i.count}</td><td>${money(i.subtotal)}</td></tr>`).join('')}<tr class="total"><td>ລວມ</td><td>${money(receipt.amount)}</td></tr></table><p>ຊຳລະ: ${escape(receipt.paymentMethod)}</p><footer>ຂອບໃຈທີ່ໃຊ້ບໍລິການ</footer></body></html>`;
}
module.exports = { receiptHtml };
