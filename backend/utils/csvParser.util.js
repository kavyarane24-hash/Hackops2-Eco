/**
 * utils/csvParser.util.js
 *
 * Zero-dependency RFC 4180 compliant CSV parser designed specifically
 * for NASA FIRMS Area API responses.
 *
 * Implements a character-level finite state machine:
 *  - Handles quoted fields with embedded commas: "28.5,12",...
 *  - Handles escaped quotes: "Text with ""quoted"" content"
 *  - Handles embedded newlines within quoted fields
 *  - Handles CRLF (\r\n) and LF (\n) line endings
 *  - Handles empty fields (e.g. field,,field)
 *  - Detects non-CSV content (HTML error pages, XML, raw error messages like "Invalid MAP_KEY")
 *  - Safely handles 0-byte/empty payloads and malformed quotes without crashing
 */

'use strict';

/**
 * Parses raw CSV string into a 2D array of token strings.
 *
 * @param {string} text - Raw CSV content
 * @returns {{ success: boolean, records: string[][], error?: string }}
 */
function parseCsvToTokens(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { success: true, records: [] };
  }

  // Pre-check: Detect HTML/XML error responses
  const trimmed = text.trim();
  if (trimmed.startsWith('<') && (trimmed.includes('<html') || trimmed.includes('<!DOCTYPE') || trimmed.includes('<xml'))) {
    return {
      success: false,
      records: [],
      error: 'Upstream returned an HTML or XML error page instead of CSV data.',
    };
  }

  // Detect explicit NASA text errors (e.g., "Invalid MAP_KEY", "Error:")
  if (/^(Invalid MAP_KEY|Error:|Unauthorized|Forbidden)/i.test(trimmed)) {
    return {
      success: false,
      records: [],
      error: `NASA FIRMS returned an error: ${trimmed.slice(0, 120)}`,
    };
  }

  const records = [];
  let currentRecord = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // Lookahead for escaped quote ("")
        if (i + 1 < len && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        // Any character inside quotes (including comma, newline, carriage return)
        currentField += char;
        i++;
        continue;
      }
    } else {
      // Outside quotes
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRecord.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        // Handle CRLF or standalone \r
        if (i + 1 < len && text[i + 1] === '\n') {
          i++;
        }
        currentRecord.push(currentField);
        currentField = '';
        records.push(currentRecord);
        currentRecord = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRecord.push(currentField);
        currentField = '';
        records.push(currentRecord);
        currentRecord = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Handle remaining field/record at EOF
  if (inQuotes) {
    // Malformed CSV: unclosed quote
    return {
      success: false,
      records: [],
      error: 'Malformed CSV: Unclosed quote detected at end of file.',
    };
  }

  // If there's an ongoing field or record, push it
  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField);
    records.push(currentRecord);
  }

  // Filter out any purely empty trailing record
  const filtered = records.filter(
    (row, idx) => !(idx === records.length - 1 && row.length === 1 && row[0] === '')
  );

  return { success: true, records: filtered };
}

/**
 * Parses NASA FIRMS CSV text into an array of structured row objects.
 *
 * @param {string} csvText
 * @returns {{ success: boolean, headers: string[], rows: object[], rawCount: number, error?: string }}
 */
function parseNasaFirmsCsv(csvText) {
  const tokenResult = parseCsvToTokens(csvText);
  if (!tokenResult.success) {
    return {
      success: false,
      headers: [],
      rows: [],
      rawCount: 0,
      error: tokenResult.error,
    };
  }

  const records = tokenResult.records;
  if (records.length === 0) {
    return {
      success: true,
      headers: [],
      rows: [],
      rawCount: 0,
    };
  }

  // First non-empty row is header
  const rawHeaders = records[0].map((h) => h.trim().toLowerCase());

  // Check if header resembles expected NASA FIRMS columns
  const hasLatitude = rawHeaders.includes('latitude') || rawHeaders.includes('lat');
  const hasLongitude = rawHeaders.includes('longitude') || rawHeaders.includes('lon');

  if (!hasLatitude && !hasLongitude && records.length === 1) {
    // Possible single-line error message that wasn't caught
    const singleLine = records[0].join(' ');
    if (singleLine.length > 0 && !singleLine.includes(',')) {
      return {
        success: false,
        headers: [],
        rows: [],
        rawCount: 0,
        error: `Invalid response format from NASA FIRMS: ${singleLine}`,
      };
    }
  }

  const rows = [];
  for (let r = 1; r < records.length; r++) {
    const rowTokens = records[r];
    // Skip empty rows
    if (rowTokens.length === 1 && rowTokens[0] === '') continue;

    const rowObj = {};
    for (let c = 0; c < rawHeaders.length; c++) {
      const headerName = rawHeaders[c];
      const rawVal = c < rowTokens.length ? rowTokens[c].trim() : '';

      // Numeric casting where appropriate for NASA FIRMS columns
      if (
        [
          'latitude',
          'longitude',
          'bright_ti4',
          'bright_ti5',
          'brightness',
          'bright_t31',
          'scan',
          'track',
          'frp',
        ].includes(headerName)
      ) {
        const num = parseFloat(rawVal);
        rowObj[headerName] = Number.isNaN(num) ? null : num;
      } else {
        rowObj[headerName] = rawVal;
      }
    }
    rows.push(rowObj);
  }

  return {
    success: true,
    headers: rawHeaders,
    rows,
    rawCount: rows.length,
  };
}

module.exports = {
  parseCsvToTokens,
  parseNasaFirmsCsv,
};
