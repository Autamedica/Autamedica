export type InvestorExportRow = {
  organization_name?: string | null;
  contact_name?: string | null;
  role_title?: string | null;
  country_code?: string | null;
  thesis?: string | null;
  stage_focus?: string[] | null;
  ticket_range?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
  source_url?: string | null;
  fit_score?: number | null;
  priority?: string | null;
  status?: string | null;
  last_contacted_at?: string | null;
  next_follow_up_at?: string | null;
  outreach_message?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

const encoder = new TextEncoder();

function xml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function littleEndian(size: number, write: (view: DataView) => void): Uint8Array {
  const buffer = new ArrayBuffer(size);
  write(new DataView(buffer));
  return new Uint8Array(buffer);
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function zipStored(files: Array<{ name: string; content: string }>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const localHeader = littleEndian(30, (view) => {
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, name.length, true);
      view.setUint16(28, 0, true);
    });
    localParts.push(localHeader, name, data);

    const centralHeader = littleEndian(46, (view) => {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint16(14, 0, true);
      view.setUint32(16, crc, true);
      view.setUint32(20, data.length, true);
      view.setUint32(24, data.length, true);
      view.setUint16(28, name.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, offset, true);
    });
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = concatenate(centralParts);
  const end = littleEndian(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, files.length, true);
    view.setUint16(10, files.length, true);
    view.setUint32(12, centralDirectory.length, true);
    view.setUint32(16, offset, true);
    view.setUint16(20, 0, true);
  });
  return concatenate([...localParts, centralDirectory, end]);
}

const columns: Array<{ key: keyof InvestorExportRow; label: string; width: number }> = [
  { key: 'organization_name', label: 'Fondo / Organización', width: 30 },
  { key: 'contact_name', label: 'Responsable', width: 24 },
  { key: 'role_title', label: 'Cargo', width: 24 },
  { key: 'country_code', label: 'País', width: 10 },
  { key: 'thesis', label: 'Tesis de inversión', width: 42 },
  { key: 'stage_focus', label: 'Etapas', width: 22 },
  { key: 'ticket_range', label: 'Ticket', width: 20 },
  { key: 'fit_score', label: 'Encaje (0-100)', width: 16 },
  { key: 'priority', label: 'Prioridad', width: 12 },
  { key: 'status', label: 'Estado', width: 22 },
  { key: 'linkedin_url', label: 'LinkedIn', width: 38 },
  { key: 'website_url', label: 'Web', width: 32 },
  { key: 'source_url', label: 'Fuente', width: 38 },
  { key: 'last_contacted_at', label: 'Último contacto', width: 22 },
  { key: 'next_follow_up_at', label: 'Próximo seguimiento', width: 22 },
  { key: 'outreach_message', label: 'Borrador de conexión', width: 55 },
  { key: 'notes', label: 'Notas', width: 45 },
  { key: 'created_at', label: 'Creado', width: 22 },
];

export function buildInvestorXlsx(rows: InvestorExportRow[]): Uint8Array {
  const rowXml = [columns.map((column, index) => {
    const ref = `${columnName(index)}1`;
    return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${xml(column.label)}</t></is></c>`;
  }).join('')];

  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    rowXml.push(columns.map((column, columnIndex) => {
      const value = column.key === 'stage_focus'
        ? (row.stage_focus ?? []).join(', ')
        : row[column.key];
      const ref = `${columnName(columnIndex)}${rowNumber}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join(''));
  });

  const lastCell = `${columnName(columns.length - 1)}${rows.length + 1}`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastCell}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rowXml.map((cells, index) => `<row r="${index + 1}">${cells}</row>`).join('')}</sheetData>
<autoFilter ref="A1:${lastCell}"/>
</worksheet>`;

  const files = [
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Inversores" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { name: 'xl/styles.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>` },
    { name: 'xl/worksheets/sheet1.xml', content: sheet },
  ];

  return zipStored(files);
}
