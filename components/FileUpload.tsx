import React, { useState, useCallback } from 'react';
import Button from './Button';
import { insertRunners } from '../services/supabaseService';
import { Runner } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { hashNationalId } from '../utils/hashing';

interface FileUploadProps {
  onUploadSuccess: (message: string) => void;
  onUploadError: (message: string) => void;
}

// Define the available Runner fields for mapping
const RUNNER_FIELDS: { key: keyof Runner; label: string; required: boolean }[] = [
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'last_name', label: 'Last Name', required: true },
  { key: 'id_card_hash', label: 'ID Card Number (will be hashed)', required: false },
  { key: 'bib', label: 'BIB', required: true },
  { key: 'race_kit', label: 'Race Kit', required: false },
  { key: 'row', label: 'Row', required: false },
  { key: 'row_no', label: 'Row No', required: false },
  { key: 'shirt', label: 'Shirt Size', required: false },
  { key: 'shirt_type', label: 'Shirt Type', required: false },
  { key: 'gender', label: 'Gender', required: false },
  { key: 'nationality', label: 'Nationality', required: false },
  { key: 'age_category', label: 'Age Category', required: false },
  { key: 'block', label: 'Block', required: false },
  { key: 'wave_start', label: 'Wave Start', required: false },
  { key: 'pre_order', label: 'Pre Order', required: false },
  { key: 'first_half_marathon', label: 'First Half Marathon', required: false },
  { key: 'note', label: 'Note', required: false },
  { key: 'top_50_no', label: 'TOP 50 No', required: false },
  { key: 'top50', label: 'TOP 50', required: false },
  { key: 'colour_sign', label: 'Colour Sign', required: false },
  { key: 'qr', label: 'QR', required: false },
];

// Robust CSV parser that handles quoted values and newlines correctly
const parseCSV = (text: string, maxRows?: number): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  // Remove BOM if present
  const cleanText = text.charCodeAt(0) === 0xFEFF ? text.substring(1) : text;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = i < cleanText.length - 1 ? cleanText[i + 1] : '';

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentVal.trim().replace(/^"|"$/g, ''));
      currentVal = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      currentRow.push(currentVal.trim().replace(/^"|"$/g, ''));
      rows.push(currentRow);
      currentRow = [];
      currentVal = '';

      // Handle \r\n
      if (char === '\r' && nextChar === '\n') i++;

      if (maxRows && rows.length >= maxRows) return rows;
    } else {
      currentVal += char;
    }
  }

  // Add last row if exists
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim().replace(/^"|"$/g, ''));
    rows.push(currentRow);
  }

  return rows;
};

const FileUpload: React.FC<FileUploadProps> = ({ onUploadSuccess, onUploadError }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Mapping State
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [showMapping, setShowMapping] = useState(false);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedFile(file);
      setUploadStatus(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) {
          // Parse just the first row for headers
          const rows = parseCSV(text, 1);

          if (rows.length > 0) {
            const headers = rows[0].filter(h => h.length > 0);
            console.log('Parsed CSV Headers:', headers);
            console.log('Total headers found:', headers.length);
            setCsvHeaders(headers);

            // Auto-map based on name similarity
            const newMapping: Record<string, string> = {};
            RUNNER_FIELDS.forEach(field => {
              // Try exact match first (case insensitive, ignore underscores)
              let match = headers.find(h => h.toLowerCase().replace(/_/g, '').replace(/\s/g, '') === field.key.toLowerCase().replace(/_/g, '').replace(/\s/g, ''));
              
              // If no exact match, try common variations for id_card_hash
              if (!match && field.key === 'id_card_hash') {
                match = headers.find(h => {
                  const normalized = h.toLowerCase().replace(/_/g, '').replace(/\s/g, '').replace(/-/g, '');
                  return normalized.includes('idcard') || 
                         normalized.includes('idcardnumber') || 
                         normalized.includes('idnumber') ||
                         normalized.includes('cardnumber') ||
                         normalized.includes('เลขบัตร') ||
                         normalized.includes('บัตรประชาชน');
                });
              }
              
              if (match) {
                newMapping[field.key] = match;
              }
            });
            
            // Log mapping result for debugging
            console.log('Auto-mapping result:', newMapping);
            if (!newMapping['id_card_hash']) {
              console.warn('⚠️ ID Card Number column not auto-mapped! Available headers:', headers);
            }
            
            setColumnMapping(newMapping);
            setShowMapping(true);
          }
        }
      };
      // Use UTF-8 encoding to properly handle Thai characters
      // If file is exported from Excel on Windows Thai, it might be Windows-874
      // Try UTF-8 first, if it fails, user can re-export CSV as UTF-8
      reader.readAsText(file, 'UTF-8');
    } else {
      setSelectedFile(null);
      setShowMapping(false);
      setCsvHeaders([]);
    }
  }, []);

  const handleMappingChange = (runnerField: string, csvHeader: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [runnerField]: csvHeader
    }));
  };

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      setUploadStatus('Please select a CSV file first.');
      return;
    }

    // Validate required fields
    const missingRequired = RUNNER_FIELDS.filter(f => f.required && !columnMapping[f.key]);
    if (missingRequired.length > 0) {
      setUploadStatus(`Missing mapping for required fields: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }

    setIsUploading(true);
    setUploadStatus('Reading and processing file locally...');

    try {
      const reader = new FileReader();
      // Use UTF-8 encoding to properly handle Thai characters
      reader.readAsText(selectedFile, 'UTF-8');

      reader.onload = async (e) => {
        const csvString = e.target?.result as string;
        if (!csvString) {
          throw new Error("Failed to read CSV file content.");
        }

        // Parse the entire CSV
        const rows = parseCSV(csvString);

        if (rows.length <= 1) { // Only header or empty
          setUploadStatus("File processed, but no data found in the CSV.");
          onUploadSuccess("No new runner data found in the CSV.");
          setIsUploading(false);
          return;
        }

        const runnerData: Runner[] = [];
        const headerRow = rows[0];

        // Helper to get value by mapped header
        const getValue = (rowValues: string[], runnerKey: string): string => {
          const mappedHeader = columnMapping[runnerKey];
          if (!mappedHeader) return '';
          const index = headerRow.indexOf(mappedHeader);
          if (index === -1) return '';
          return rowValues[index] || '';
        };

        // Iterate through data rows (skip header)
        let skippedEmptyRows = 0;
        let skippedMissingData = 0;
        const skippedRowsDetails: Array<{ row: number; reason: string }> = [];

        for (let i = 1; i < rows.length; i++) {
          const rowValues = rows[i];

          // Skip empty rows
          if (rowValues.length === 0 || (rowValues.length === 1 && rowValues[0] === '')) {
            skippedEmptyRows++;
            skippedRowsDetails.push({ row: i + 1, reason: 'Empty row' });
            continue;
          }

          // DEBUG: Log the first row's parsing details
          if (i === 1) {
            console.log('DEBUG ROW 1:', {
              parsed: rowValues,
              headers: headerRow,
              mapping: columnMapping,
              wave_start_idx: headerRow.indexOf(columnMapping['wave_start']),
              wave_start_val: getValue(rowValues, 'wave_start'),
              qr_idx: headerRow.indexOf(columnMapping['qr']),
              qr_val: getValue(rowValues, 'qr')
            });
          }

          const idCardNumber = getValue(rowValues, 'id_card_hash');
          const bib = getValue(rowValues, 'bib');

          if (bib) {
            const runner: Runner = {
              first_name: getValue(rowValues, 'first_name') || 'N/A',
              last_name: getValue(rowValues, 'last_name') || 'N/A',
              id_card_hash: idCardNumber ? await hashNationalId(idCardNumber) : null,
              bib: bib,
              race_kit: getValue(rowValues, 'race_kit') || 'Not Specified',
              row: getValue(rowValues, 'row') || undefined,
              row_no: getValue(rowValues, 'row_no') || undefined,
              shirt: getValue(rowValues, 'shirt') || 'N/A',
              shirt_type: getValue(rowValues, 'shirt_type') || undefined,
              gender: getValue(rowValues, 'gender') || 'N/A',
              nationality: getValue(rowValues, 'nationality') || 'N/A',
              age_category: getValue(rowValues, 'age_category') || 'N/A',
              block: getValue(rowValues, 'block') || 'N/A',
              wave_start: getValue(rowValues, 'wave_start') || 'N/A',
              pre_order: getValue(rowValues, 'pre_order') || 'N/A',
              first_half_marathon: getValue(rowValues, 'first_half_marathon') || '',
              note: getValue(rowValues, 'note') || '',
              top_50_no: getValue(rowValues, 'top_50_no') || undefined,
              top50: getValue(rowValues, 'top50') || undefined,
              colour_sign: getValue(rowValues, 'colour_sign') || undefined,
              qr: getValue(rowValues, 'qr') || undefined,
              pass_generated: false,
              google_jwt: null,
              apple_pass_url: null,
              access_key: uuidv4(),
            };
            runnerData.push(runner);
            
            // Log warning if ID Card Number is missing (but still import)
            if (!idCardNumber) {
              console.warn(`Row ${i + 1} (BIB: ${bib}) imported without ID Card Number. Verification will use BIB instead.`);
            }
          } else {
            skippedMissingData++;
            skippedRowsDetails.push({ 
              row: i + 1, 
              reason: 'Missing required field: BIB' 
            });
            console.warn(`Skipping row ${i + 1} due to missing BIB.`, {
              bib: bib || 'MISSING',
              rowValues: rowValues
            });
          }
        }

        // Log summary of skipped rows
        if (skippedEmptyRows > 0 || skippedMissingData > 0) {
          console.log('=== IMPORT SUMMARY ===');
          console.log(`Total rows in CSV: ${rows.length - 1} (excluding header)`);
          console.log(`Successfully parsed: ${runnerData.length}`);
          console.log(`Skipped empty rows: ${skippedEmptyRows}`);
          console.log(`Skipped missing data: ${skippedMissingData}`);
          console.log(`Total skipped: ${skippedEmptyRows + skippedMissingData}`);
          if (skippedRowsDetails.length > 0 && skippedRowsDetails.length <= 20) {
            console.log('Skipped rows details:', skippedRowsDetails);
          } else if (skippedRowsDetails.length > 20) {
            console.log('First 20 skipped rows:', skippedRowsDetails.slice(0, 20));
            console.log(`... and ${skippedRowsDetails.length - 20} more rows`);
          }
        }

        if (runnerData.length === 0) {
          setUploadStatus("File processed, but no valid runner data found for insertion. Check that BIB and ID Card Hash fields are present and valid.");
          onUploadSuccess("No valid runner data found for insertion.");
          setIsUploading(false);
          return;
        }

        setUploadStatus(`Parsed ${runnerData.length} records. Inserting into database...`);
        const result = await insertRunners(runnerData);

        if (result.data) {
          const { successCount, totalRecords, failedCount, failedDetails } = result.data;
          let statusMessage = `Upload completed! Inserted ${successCount} of ${totalRecords} runners.`;
          
          if (failedCount && failedCount > 0) {
            statusMessage += `\nFailed to insert: ${failedCount} runners.`;
            if (failedDetails && failedDetails.length > 0) {
              const failedBibs = failedDetails.slice(0, 10).map(f => f.bib || 'N/A').join(', ');
              statusMessage += `\nFailed BIBs (first 10): ${failedBibs}`;
              if (failedDetails.length > 10) {
                statusMessage += `\n... and ${failedDetails.length - 10} more`;
              }
            }
          }
          
          setUploadStatus(statusMessage);
          onUploadSuccess(`Processed and inserted ${successCount} of ${totalRecords} runners.${failedCount && failedCount > 0 ? ` ${failedCount} failed.` : ''}`);
          setSelectedFile(null);
          setShowMapping(false);
        } else {
          const errorMessage = result.error || 'Failed to insert runner data.';
          setUploadStatus(`Error: ${errorMessage}`);
          onUploadError(errorMessage);
        }
        setIsUploading(false);
      };

      reader.onerror = () => {
        const errorMessage = "Failed to read file.";
        setUploadStatus(`Error: ${errorMessage}`);
        onUploadError(errorMessage);
        setIsUploading(false);
      };

    } catch (error: any) {
      const errorMessage = error.message || 'An unexpected error occurred during file processing.';
      setUploadStatus(`Error: ${errorMessage}`);
      onUploadError(errorMessage);
      setIsUploading(false);
    }
  }, [selectedFile, columnMapping, onUploadSuccess, onUploadError]);

  return (
    <div className="p-6 bg-gray-800 rounded-lg shadow-md mb-8">
      <h2 className="text-2xl font-bold text-white mb-4">Upload Runner Data (CSV)</h2>

      <div className="flex items-center space-x-4 mb-4">
        <input
          type="file"
          id="csv-upload"
          accept=".csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-400
                     file:mr-4 file:py-2 file:px-4
                     file:rounded-md file:border-0
                     file:text-sm file:font-semibold
                     file:bg-blue-500 file:text-white
                     hover:file:bg-blue-600 cursor-pointer"
          disabled={isUploading}
        />
      </div>

      {showMapping && (
        <div className="mb-6 bg-gray-700 p-4 rounded border border-gray-600">
          <h3 className="text-lg font-semibold text-white mb-3">Map CSV Columns</h3>
          <p className="text-sm text-gray-300 mb-4">Match your CSV columns to the runner data fields.</p>

          {/* Scrollable Container for Mapping Fields */}
          <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {RUNNER_FIELDS.map(field => (
                <div key={field.key} className="flex flex-col">
                  <label className="text-xs text-gray-400 mb-1">
                    {field.label} {field.required && <span className="text-red-400">*</span>}
                  </label>
                  <select
                    value={columnMapping[field.key] || ''}
                    onChange={(e) => handleMappingChange(field.key, e.target.value)}
                    className={`bg-gray-800 border ${field.required && !columnMapping[field.key] ? 'border-red-500' : 'border-gray-600'} text-white text-sm rounded px-2 py-1`}
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleUpload}
          disabled={!selectedFile || isUploading || (showMapping && RUNNER_FIELDS.some(f => f.required && !columnMapping[f.key]))}
          loading={isUploading}
        >
          Upload & Process
        </Button>
      </div>

      {uploadStatus && (
        <p className={`mt-2 text-sm ${uploadStatus.startsWith('Error') ? 'text-red-400' : 'text-green-400'} whitespace-pre-line`}>
          {uploadStatus}
        </p>
      )}
    </div>
  );
};

export default FileUpload;
