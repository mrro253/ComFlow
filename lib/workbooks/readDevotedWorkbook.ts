import { DevotedValidationError } from "@/lib/carriers/devoted/errors";
import { inflateRawSync } from "node:zlib";
import readXlsxFile from "read-excel-file/node";

const MAX_SOURCE = 15 * 1024 * 1024;
const MAX_EXPANDED = 64 * 1024 * 1024;
export type WorkbookCells = (string | null)[][];

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate every ZIP entry before the reader can inflate anything. No extraction to disk. */
export function validateWorkbookArchive(input: Uint8Array): Map<string, string> {
  const bytes = Buffer.from(input);
  const fail = () => { throw new DevotedValidationError("Unsupported or unsafe workbook archive"); };
  if (!bytes.length || bytes.length > MAX_SOURCE || bytes.readUInt16LE(0) !== 0x4b50) fail();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) fail();
  const count = bytes.readUInt16LE(end + 10);
  if (!count || count > 1000 || bytes.readUInt16LE(end + 8) !== count) fail();
  const start = bytes.readUInt32LE(end + 16);
  if (start + bytes.readUInt32LE(end + 12) !== end) fail();
  let cursor = start, expanded = 0;
  const entries = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) fail();
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
    const nameSize = bytes.readUInt16LE(cursor + 28), extraSize = bytes.readUInt16LE(cursor + 30), commentSize = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42);
    if ((flags & 1) || ![0, 8].includes(method) || size > MAX_EXPANDED - expanded || compressed > MAX_SOURCE || local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50) fail();
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameSize).toString("utf8");
    if (!name || entries.has(name) || name.includes("..") || name.includes("\\") || name.startsWith("/") || /externalLinks|vbaProject|encryption/i.test(name)) fail();
    const localName = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
    const payload = local + 30 + localName + localExtra;
    if (bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || bytes.subarray(local + 30, local + 30 + localName).toString("utf8") !== name || payload + compressed > start) fail();
    const source = bytes.subarray(payload, payload + compressed);
    const data = method === 8 ? inflateRawSync(source, { maxOutputLength: Math.max(1, Math.min(size, MAX_EXPANDED - expanded)) }) : source;
    if (data.length !== size || crc32(data) !== bytes.readUInt32LE(cursor + 16)) fail();
    expanded += size;
    const text = data.toString("utf8");
    if (data.length && (!/\.xml$|\.rels$/.test(name) || !Buffer.from(text, "utf8").equals(data))) fail();
    if (/\.xml$|\.rels$/.test(name) && /<!DOCTYPE|<!ENTITY|<(?:[A-Za-z_][\w.-]*:)?f(?:\s|>)|TargetMode\s*=\s*["']External["']/i.test(text)) fail();
    entries.set(name, text);
    cursor += 46 + nameSize + extraSize + commentSize;
  }
  if (cursor !== end || !entries.has("xl/workbook.xml") || !entries.has("[Content_Types].xml")) fail();
  // Identifiers must have explicit text cells. Numeric member IDs can lose leading zeroes.
  for (const [name, xml] of entries) if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
    if ((xml.match(/<row\b/g) ?? []).length > 50001) fail();
    if (name !== "xl/worksheets/sheet2.xml") continue;
    for (const match of xml.matchAll(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>([\s\S]*?)<\/c>/g)) {
      if (Number(match[3]) > 1 && ["B", "D", "E"].includes(match[2]) && /<v>|<is>/.test(match[4]) && !/\bt="(?:s|inlineStr)"/.test(match[1])) fail();
    }
  }
  return entries;
}


/** The library only receives our bounded, stored ZIP, never unvalidated local headers. */
function boundedReaderArchive(entries: Map<string, string>): Buffer {
  const locals: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const filename = Buffer.from(name), data = Buffer.from(value), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, filename, data); directory.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const index = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.size, 8); end.writeUInt16LE(entries.size, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, index, end]);
}

export async function readDevotedWorkbook(bytes: Uint8Array): Promise<{ summary: WorkbookCells; detail: WorkbookCells }> {
  const entries = validateWorkbookArchive(bytes);
  const sheets = await readXlsxFile(boundedReaderArchive(entries), { parseNumber: (value) => value });
  if (sheets.length !== 2 || sheets[0].sheet !== "Summary" || sheets[1].sheet !== "Detail") throw new DevotedValidationError("Unsupported Devoted workbook sheets");
  const cells = (data: unknown[][]): WorkbookCells => data.map((row) => row.map((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") throw new DevotedValidationError("Workbook dates and identifiers must be explicit text");
    return value.trim();
  }));
  return { summary: cells(sheets[0].data), detail: cells(sheets[1].data) };
}
