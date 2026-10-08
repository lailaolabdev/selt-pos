const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function receiptHtml(receipt, width, fontUrl, reprint = false) {
  if (receipt.status !== 'PAID' || !Array.isArray(receipt.items) || !receipt.items.length || !Number.isFinite(receipt.amount) || receipt.amount <= 0) throw new Error('Invalid paid receipt');
  for (const item of receipt.items) if (typeof item.name !== 'string' || !Number.isInteger(item.count) || item.count <= 0 || !Number.isFinite(item.subtotal) || item.subtotal < 0) throw new Error('Invalid receipt item');
  if (receipt.items.reduce((sum, item) => sum + item.subtotal, 0) !== receipt.amount) throw new Error('Receipt total mismatch');

  const paperWidth = width === 58 ? 58 : 80;
  const contentWidth = paperWidth - 8;
  const paidDate = receipt.paidAt ? new Intl.DateTimeFormat('lo-LA', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Vientiane' }).format(new Date(receipt.paidAt)) : '';
  const number = value => new Intl.NumberFormat('lo-LA', { maximumFractionDigits: 0 }).format(value);
  const money = value => `${number(value)} ກີບ`;
  const itemRows = receipt.items.map(item => `<tr class="item"><td class="name">${escape(item.name)}</td><td class="qty">${item.count}</td><td class="unit">${number(item.subtotal / item.count)}</td><td class="amount">${number(item.subtotal)}</td></tr>`).join('');

  return `<!doctype html><html lang="lo"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:"><style>
  @font-face{font-family:Lao;src:url('${fontUrl}')} @page{size:${paperWidth}mm auto;margin:0}
  *{box-sizing:border-box} html,body{margin:0;padding:0;background:#fff} body{width:${contentWidth}mm;margin:0 auto;padding:4mm 0 7mm;font:12px Lao,sans-serif;color:#000;line-height:1.35}
  .center{text-align:center}.shop{margin:0;font-size:25px;line-height:1.1;font-weight:900;letter-spacing:.2px}.title{margin:3px 0 1px;font-size:16px;line-height:1.25;font-weight:900}.welcome{font-size:11px;font-weight:700}.copy{font-size:10px;font-weight:700}
  .meta{margin:7px 0 0;font-size:10px;line-height:1.55;overflow-wrap:anywhere}.meta-row{display:flex;justify-content:space-between;gap:8px}.meta-row span:last-child{text-align:right}
  .rule{border:0;border-top:1px dashed #000;margin:7px 0}.items{width:100%;border-collapse:collapse;table-layout:fixed}.items th{padding:2px 0 4px;font-size:10px;line-height:1.2;font-weight:900;border-bottom:1px solid #000}.items td{padding:5px 0;vertical-align:top;line-height:1.3;overflow-wrap:anywhere}.items .name{width:45%;text-align:left;padding-right:3px}.items .qty{width:10%;text-align:center}.items .unit{width:20%;text-align:right;padding-right:3px}.items .amount{width:25%;text-align:right;white-space:nowrap}.item td{border-bottom:1px dotted #999}.items th.unit,.items th.amount{text-align:right}.items th.qty{text-align:center}
  .total{border-top:1px solid #000}.total td{padding-top:7px;font-size:14px;font-weight:900}.total .amount{font-size:16px}.total-sub{display:block;margin-top:1px;font-size:10px;font-weight:700}
  .payment{display:flex;justify-content:space-between;gap:8px;margin:8px 0 2px;font-size:11px;font-weight:800}.payment span:last-child{text-align:right;overflow-wrap:anywhere}
  .thanks{margin:13px 0 0;font-size:13px;font-weight:900}.small{font-size:9px;margin-top:4px;overflow-wrap:anywhere}.cut-space{height:5mm}
  </style></head><body><header class="center"><h1 class="shop">4B POS</h1><div class="title">ໃບຮັບເງິນ</div><div class="welcome">ຍິນດີຕອນຮັບສູ່ 4B POS</div>${reprint ? '<div class="copy">(ສຳເນົາ)</div>' : ''}</header>
  <div class="meta"><div class="meta-row"><span>ເລກບິນ</span><span>${escape(receipt.orderNo)}</span></div><div class="meta-row"><span>ວັນທີ</span><span>${escape(paidDate)}</span></div></div><hr class="rule">
  <table class="items"><thead><tr><th class="name">ລາຍການ</th><th class="qty">ຈຳນວນ</th><th class="unit">ລາຄາ</th><th class="amount">ລວມ</th></tr></thead><tbody>${itemRows}<tr class="total"><td colspan="3">ລວມທັງໝົດ<span class="total-sub">ລາຄາລວມພາສີ</span></td><td class="amount">${number(receipt.amount)}</td></tr></tbody></table>
  <div class="payment"><span>ວິທີຊຳລະ</span><span>${escape(receipt.paymentMethod || 'PhaJay')}</span></div><hr class="rule"><div class="center thanks">ຂອບໃຈທີ່ອຸດໜູນ</div><div class="center small">ກະລຸນາເກັບໃບບິນໄວ້ເປັນຫຼັກຖານ</div><div class="center small">4B POS · ${money(receipt.amount)}</div><div class="cut-space"></div></body></html>`;
}

module.exports = { receiptHtml };
