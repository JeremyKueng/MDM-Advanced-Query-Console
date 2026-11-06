/* Local XLSX export: typed cells, group bands, frozen headings and filters. */
"use strict";
function xlsxXml(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function xlsxColumn(index) {
  let label = "";
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label;
  return label;
}
function xlsxZip(files) {
  const encoder = new TextEncoder(), locals = [], central = [];
  const table = Array.from({length: 256}, (_, n) => {
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
    return n >>> 0;
  });
  let offset = 0, centralSize = 0;
  for (const [name, source] of Object.entries(files)) {
    const filename = encoder.encode(name), data = encoder.encode(source);
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255];
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + filename.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true);
    lv.setUint16(12, 33, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, filename.length, true); local.set(filename, 30);
    const entry = new Uint8Array(46 + filename.length), cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
    cv.setUint16(14, 33, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, filename.length, true); cv.setUint32(42, offset, true); entry.set(filename, 46);
    locals.push(local, data); central.push(entry); offset += local.length + data.length; centralSize += entry.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + end.length); let cursor = 0;
  for (const part of [...locals, ...central, end]) { output.set(part, cursor); cursor += part.length; }
  return output;
}
function groupedListXlsx(headers, groups, widths) {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const cell = (v, c, r, s) => '<c r="' + xlsxColumn(c) + r + '" s="' + s + '"'
    + (typeof v === 'number' && Number.isFinite(v) ? '><v>' + v + '</v></c>' : ' t="inlineStr"><is><t xml:space="preserve">' + xlsxXml(v) + '</t></is></c>');
  let row = 1, body = '<row r="1" ht="34" customHeight="1">' + headers.map((h, c) => cell(h, c, 1, 1)).join('') + '</row>';
  groups.forEach((group, i) => {
    for (const values of group) {
      row++;
      const height = Math.min(72, Math.max(30, ...values.map((v, c) => Math.ceil(String(v ?? '').length / Math.max(5, (widths[c] || 16) / 2)) * 14 + 6)));
      body += '<row r="' + row + '" ht="' + height + '" customHeight="1">' + values.map((v, c) => cell(v, c, row, i % 2 ? 3 : 2)).join('') + '</row>';
    }
  });
  const range = 'A1:' + xlsxColumn(headers.length - 1) + row;
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="' + ns + '">'
    + '<dimension ref="' + range + '"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="30"/><cols>' + headers.map((_, c) => '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + (widths[c] || 16) + '" customWidth="1"/>').join('')
    + '</cols><sheetData>' + body + '</sheetData><autoFilter ref="' + range + '"/></worksheet>';
  const styles = '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="' + ns + '">'
    + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><color rgb="FF16324F"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts>'
    + '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + ['17365D','DCEEF8','FFFFFF'].map((color) => '<fill><patternFill patternType="solid"><fgColor rgb="FF' + color + '"/><bgColor indexed="64"/></patternFill></fill>').join('') + '</fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + [2,3,4].map((fill, i) => '<xf numFmtId="0" fontId="' + (i === 0 ? 1 : 0) + '" fillId="' + fill + '" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>').join('')
    + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  return xlsxZip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="' + ns + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="同V码核查清单" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': styles, 'xl/worksheets/sheet1.xml': sheet,
  });
}
