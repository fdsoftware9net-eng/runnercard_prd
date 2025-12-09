
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Runner } from '../types';
import { getRunners, updateRunner as updateRunnerService } from '../services/supabaseService';
import { hashNationalId } from '../utils/hashing';
import Button from './Button';
import Input from './Input';
import Select from './Select'; // Import the new Select component
import LoadingSpinner from './LoadingSpinner';
import Modal from './Modal';

interface RunnerTableProps {
  refreshDataTrigger: number;
}

const RUNNERS_PER_PAGE = 20; // For basic pagination
const APP_BASE_URL: string = window.location.origin;

// Define the order of columns for CSV export
const EXPORT_COLUMN_KEYS: Array<keyof Runner> = [
  "id",
  "created_at",
  "first_name",
  "last_name",
  "id_card_hash",
  "bib",
  "top_50_no",
  "race_kit",
  "row",
  "row_no",
  "shirt",
  "shirt_type",
  "gender",
  "nationality",
  "age_category",
  "block",
  "wave_start",
  "pre_order",
  "first_half_marathon",
  "note",
];

// Helper function to escape values for CSV
const escapeCsvValue = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }
  const strValue = String(value);
  // If the string contains a comma, double quote, or newline, enclose it in double quotes.
  // Also, any double quotes within the string must be escaped by doubling them.
  if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
    return `"${strValue.replace(/"/g, '""')}"`;
  }
  return strValue;
};


// Define available columns with labels
type ColumnKey = 'bib' | 'name' | 'wave_start' | 'race_kit' | 'row' | 'row_no' | 'shirt' | 'shirt_type' | 'gender' | 'nationality' | 'age_category' | 'block' | 'pre_order' | 'first_half_marathon' | 'note' | 'top_50_no' | 'top50' | 'colour_sign' | 'qr' | 'bib_pass_link';

const AVAILABLE_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'bib', label: 'BIB' },
  { key: 'wave_start', label: 'Wave Start' },
  { key: 'race_kit', label: 'Race Kit' },
  { key: 'row', label: 'Row' },
  { key: 'row_no', label: 'Row No' },
  { key: 'shirt', label: 'Shirt' },
  { key: 'shirt_type', label: 'Shirt Type' },
  { key: 'gender', label: 'Gender' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'age_category', label: 'Age Category' },
  { key: 'block', label: 'Block' },
  { key: 'pre_order', label: 'Pre Order' },
  { key: 'first_half_marathon', label: 'First Half Marathon' },
  { key: 'note', label: 'Note' },
  { key: 'top_50_no', label: 'TOP 50 No' },
  { key: 'top50', label: 'TOP 50' },
  { key: 'colour_sign', label: 'Colour Sign' },
  { key: 'qr', label: 'QR' },
  { key: 'bib_pass_link', label: 'Bib Pass Link' },
];

const RunnerTable: React.FC<RunnerTableProps> = ({ refreshDataTrigger }) => {
  const [runners, setRunners] = useState<Runner[]>([]); // This will now hold only the current page's runners
  const [totalRunnersCount, setTotalRunnersCount] = useState(0); // New state for total count
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isEditingRunner, setIsEditingRunner] = useState<Runner | null>(null);
  const [editForm, setEditForm] = useState<Partial<Runner>>({});
  const [idCardNumber, setIdCardNumber] = useState<string>(''); // State for raw ID card number
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [hasFormChanges, setHasFormChanges] = useState(false); // New state for tracking form changes
  const [isExporting, setIsExporting] = useState(false); // New state for export loading
  const [idCardHashMatchWarning, setIdCardHashMatchWarning] = useState<string | null>(null); // Warning when ID card hash matches original
  // Column visibility state - all visible by default
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(AVAILABLE_COLUMNS.map(col => col.key))
  );
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  const fetchRunners = useCallback(async (
    page: number,
    pageSize: number,
    query = ''
  ) => {
    setLoading(true);
    setError(null);
    const result = await getRunners(page, pageSize, query); // Use updated getRunners
    if (result.data) {
      setRunners(result.data);
      setTotalRunnersCount(result.totalCount || 0); // Update total count
    } else {
      setError(result.error || 'Failed to fetch runners.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // When search term, refresh trigger, or current page changes, refetch
    fetchRunners(currentPage, RUNNERS_PER_PAGE, searchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, refreshDataTrigger, currentPage]); // Add currentPage to dependencies

  // Function to compare form state with original runner data
  const areFormsEqual = useCallback((obj1: Partial<Runner>, obj2: Runner | null, rawIdCard?: string): boolean => {
    if (!obj2) return false;

    // Keys to compare, excluding internal/non-editable fields like 'id', 'created_at', 'pass_generated', 'google_jwt', 'apple_pass_url', 'access_key'
    // Note: id_card_hash is now included in comparison
    const keysToCompare: Array<keyof Runner> = [
      "first_name", "last_name", "bib", "race_kit",
      "row", "row_no", "shirt", "shirt_type", "gender", "nationality", "age_category",
      "block", "wave_start", "pre_order", "first_half_marathon", "note",
      "top_50_no", "top50", "colour_sign", "qr", "id_card_hash"
    ];

    for (const key of keysToCompare) {
      // Normalize values: trim whitespace and treat null/undefined/empty string as equivalent for comparison
      let val1 = obj1[key] !== undefined && obj1[key] !== null ? String(obj1[key]).trim() : '';
      let val2 = obj2[key] !== undefined && obj2[key] !== null ? String(obj2[key]).trim() : '';

      // Removed special handling for 'first_half_marathon' as it is now free text.
      // The general trimming and null/empty string equivalence are sufficient.

      if (val1 !== val2) {
        return false;
      }
    }
    return true;
  }, []);

  // Effect to update hasFormChanges whenever editForm, isEditingRunner, or idCardNumber changes
  useEffect(() => {
    if (isEditingRunner && editForm) {
      // Check if id_card_hash would change if we hash the current idCardNumber
      const wouldHashChange = async () => {
        if (idCardNumber.trim()) {
          const newHash = await hashNationalId(idCardNumber.trim());
          const currentHash = isEditingRunner.id_card_hash || '';
          return newHash !== currentHash;
        } else {
          // If idCardNumber is empty, check if original had a hash
          return (isEditingRunner.id_card_hash || '') !== (editForm.id_card_hash || '');
        }
      };
      
      // For now, check other fields first
      const otherFieldsChanged = !areFormsEqual(editForm, isEditingRunner);
      
      // If idCardNumber is provided, we need to check hash change
      if (idCardNumber.trim()) {
        hashNationalId(idCardNumber.trim()).then(newHash => {
          const currentHash = isEditingRunner.id_card_hash || '';
          const hashChanged = newHash !== currentHash;
          setHasFormChanges(otherFieldsChanged || hashChanged);
          // Show warning if hash matches original (no change)
          if (!hashChanged && currentHash) {
            setIdCardHashMatchWarning('เลขบัตรนี้ตรงกับข้อมูลเดิม');
          } else {
            setIdCardHashMatchWarning(null);
          }
        });
      } else {
        // Check if id_card_hash was removed
        const hashRemoved = (isEditingRunner.id_card_hash || '') !== (editForm.id_card_hash || '');
        setHasFormChanges(otherFieldsChanged || hashRemoved);
        setIdCardHashMatchWarning(null);
      }
    } else {
      setHasFormChanges(false);
      setIdCardHashMatchWarning(null);
    }
  }, [editForm, isEditingRunner, areFormsEqual, idCardNumber]);


  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setCurrentPage(1); // Reset pagination on search
  }, []);

  const handleExportToCsv = useCallback(async () => {
    setIsExporting(true);
    try {
      const allRunners: Runner[] = [];
      let page = 1;
      const BATCH_SIZE = 1000;
      let hasMore = true;

      // Fetch all runners in paginated batches to overcome server-side limits
      while (hasMore) {
        const result = await getRunners(page, BATCH_SIZE, searchTerm);
        if (result.error || !result.data) {
          throw new Error(result.error || 'Failed to fetch runner data for export.');
        }
        allRunners.push(...result.data);

        if (result.data.length < BATCH_SIZE || allRunners.length >= (result.totalCount || 0)) {
          hasMore = false;
        } else {
          page++;
        }
      }

      if (allRunners.length === 0) {
        alert('No runners found to export.');
        setIsExporting(false);
        return;
      }

      const runnersToExport = allRunners;

      const header = EXPORT_COLUMN_KEYS.map(key => escapeCsvValue(key)).join(',');
      const rows = runnersToExport.map(runner =>
        EXPORT_COLUMN_KEYS.map(key => escapeCsvValue(runner[key])).join(',')
      );

      const csvContent = [header, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'runners_data.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to export CSV: ${err.message || 'Unknown error'}`);
      console.error('CSV export error:', err);
    } finally {
      setIsExporting(false);
    }
  }, [searchTerm]);


  const handleEditClick = useCallback((runner: Runner) => {
    setIsEditingRunner(runner);
    setEditForm({ ...runner }); // Initialize form with current runner data
    setIdCardNumber(''); // Reset ID card number (we don't store raw number, so start empty)
    setIsEditModalOpen(true);
    setUpdateError(null);
    setHasFormChanges(false); // Reset changes flag when opening
    setIdCardHashMatchWarning(null); // Reset warning when opening
  }, []);

  const handleEditFormChange = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!isEditingRunner?.id) {
      setUpdateError("Cannot update runner: ID is missing.");
      return;
    }

    if (!hasFormChanges) {
      setUpdateError("No changes detected to save.");
      setIsEditModalOpen(false); // Close the modal if no changes were made and user clicked save
      setIsEditingRunner(null);
      setEditForm({});
      setIdCardNumber('');
      return;
    }

    setLoading(true); // Use global loading state for modal too
    setUpdateError(null);

    // Prepare update data
    const updateData: Partial<Runner> = { ...editForm };

    // If idCardNumber is provided, hash it and update id_card_hash
    if (idCardNumber.trim()) {
      try {
        const hashedId = await hashNationalId(idCardNumber.trim());
        updateData.id_card_hash = hashedId;
      } catch (error: any) {
        setLoading(false);
        setUpdateError(`Failed to hash ID card number: ${error.message || 'Unknown error'}`);
        return;
      }
    } else if (idCardNumber === '' && isEditingRunner.id_card_hash) {
      // If idCardNumber is cleared, remove the hash
      updateData.id_card_hash = null;
    }

    const result = await updateRunnerService({ id: isEditingRunner.id, ...updateData });
    setLoading(false);

    if (result.error) {
      setUpdateError(result.error);
    } else {
      // No explicit error from service. Check result.data.
      if (result.data) { // Data returned, means an update actually happened
        setIsEditModalOpen(false);
        setIsEditingRunner(null);
        setEditForm({});
        setIdCardNumber('');
        setHasFormChanges(false); // Reset changes flag on successful save
        await fetchRunners(currentPage, RUNNERS_PER_PAGE, searchTerm); // Refetch current page
      } else { // No data returned, but no error - means no effective changes by DB.
        // Frontend detected changes (hasFormChanges was true), but DB considered them a no-op.
        // This is not an error, so we proceed as if successful from a user perspective.
        console.warn(`Update for runner ID ${isEditingRunner.id} resulted in no *effective* database changes.`);
        setIsEditModalOpen(false);
        setIsEditingRunner(null);
        setEditForm({});
        setIdCardNumber('');
        setHasFormChanges(false); // Reset changes flag
        await fetchRunners(currentPage, RUNNERS_PER_PAGE, searchTerm); // Still refresh to ensure consistency in case of subtle sync issues
      }
    }
  }, [isEditingRunner, editForm, idCardNumber, searchTerm, fetchRunners, hasFormChanges, currentPage]);

  const totalPages = useMemo(() => Math.ceil(totalRunnersCount / RUNNERS_PER_PAGE), [totalRunnersCount]);
  // `paginatedRunners` is no longer needed; `runners` state now directly holds the current page's data.

  const handlePreviousPage = useCallback(() => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  const toggleColumn = useCallback((columnKey: ColumnKey) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnKey)) {
        newSet.delete(columnKey);
      } else {
        newSet.add(columnKey);
      }
      return newSet;
    });
  }, []);

  const toggleAllColumns = useCallback((visible: boolean) => {
    if (visible) {
      setVisibleColumns(new Set(AVAILABLE_COLUMNS.map(col => col.key)));
    } else {
      setVisibleColumns(new Set());
    }
  }, []);

  const modalFooter = !loading ? (
    <div className="flex justify-end space-x-3">
      <Button variant="secondary" onClick={() => setIsEditModalOpen(false)} disabled={loading}>
        Cancel
      </Button>
      <Button onClick={handleSaveEdit} loading={loading} disabled={loading || !hasFormChanges}>
        Save Changes
      </Button>
    </div>
  ) : undefined;


  if (loading && totalRunnersCount === 0) { // Check totalRunnersCount to avoid spinner if data already loaded
    return <LoadingSpinner message="Fetching runner data..." />;
  }

  if (error) {
    return <div className="text-red-500 p-4 bg-red-900 rounded-md">Error: {error}</div>;
  }

  return (
    <div className="p-6 bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-white mb-4">Runner Management</h2>

      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0 sm:space-x-4">
        <Input
          id="search"
          type="text"
          placeholder="Search by Name, BIB, Name on BIB..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="w-full"
          autoFocus
        />
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
          <Button
            onClick={handleExportToCsv}
            loading={isExporting}
            disabled={totalRunnersCount === 0 || isExporting}
            variant="secondary"
            className="w-full sm:w-auto flex-shrink-0"
          >
            Export CSV ({totalRunnersCount} runners)
          </Button>
        </div>
      </div>

      {/* Column Visibility Selector */}
      <div className="mb-4">
        <button
          onClick={() => setShowColumnSelector(!showColumnSelector)}
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          {showColumnSelector ? 'Hide' : 'Show'} Column Options
        </button>

        {showColumnSelector && (
          <div className="mt-3 p-4 bg-gray-700 rounded-lg border border-gray-600">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-white">Select Columns to Display</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleAllColumns(true)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Select All
                </button>
                <span className="text-gray-500">|</span>
                <button
                  onClick={() => toggleAllColumns(false)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Deselect All
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {AVAILABLE_COLUMNS.map(column => (
                <label
                  key={column.key}
                  className="flex items-center space-x-2 text-sm text-gray-300 hover:text-white cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns.has(column.key)}
                    onChange={() => toggleColumn(column.key)}
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {runners.length === 0 && totalRunnersCount === 0 && !loading ? (
        <p className="text-gray-400">No runners found matching your criteria.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700 bg-gray-900 rounded-md">
              <thead className="bg-gray-700">
                <tr>
                  {visibleColumns.has('name') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>}
                  {visibleColumns.has('bib') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">BIB</th>}
                  {visibleColumns.has('wave_start') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Wave Start</th>}
                  {visibleColumns.has('race_kit') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Race Kit</th>}
                  {visibleColumns.has('row') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Row</th>}
                  {visibleColumns.has('row_no') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Row No</th>}
                  {visibleColumns.has('shirt') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Shirt</th>}
                  {visibleColumns.has('shirt_type') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Shirt Type</th>}
                  {visibleColumns.has('gender') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Gender</th>}
                  {visibleColumns.has('nationality') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Nationality</th>}
                  {visibleColumns.has('age_category') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Age Category</th>}
                  {visibleColumns.has('block') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Block</th>}
                  {visibleColumns.has('pre_order') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Pre Order</th>}
                  {visibleColumns.has('first_half_marathon') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">First Half Marathon</th>}
                  {visibleColumns.has('note') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Note</th>}
                  {visibleColumns.has('top_50_no') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">TOP 50 No</th>}
                  {visibleColumns.has('top50') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">TOP 50</th>}
                  {visibleColumns.has('colour_sign') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Colour Sign</th>}
                  {visibleColumns.has('qr') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">QR</th>}
                  {visibleColumns.has('bib_pass_link') && <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Bib Pass Link</th>}
                  <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {runners.map((runner) => (
                  <tr key={runner.id} className="hover:bg-gray-700">
                    {visibleColumns.has('name') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.first_name} {runner.last_name}</td>}
                    {visibleColumns.has('bib') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.bib}</td>}
                    {visibleColumns.has('wave_start') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.wave_start}</td>}
                    {visibleColumns.has('race_kit') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.race_kit}</td>}
                    {visibleColumns.has('row') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.row || ''}</td>}
                    {visibleColumns.has('row_no') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.row_no || ''}</td>}
                    {visibleColumns.has('shirt') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.shirt}</td>}
                    {visibleColumns.has('shirt_type') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.shirt_type || ''}</td>}
                    {visibleColumns.has('gender') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.gender}</td>}
                    {visibleColumns.has('nationality') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.nationality}</td>}
                    {visibleColumns.has('age_category') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.age_category}</td>}
                    {visibleColumns.has('block') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.block}</td>}
                    {visibleColumns.has('pre_order') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.pre_order}</td>}
                    {visibleColumns.has('first_half_marathon') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.first_half_marathon}</td>}
                    {visibleColumns.has('note') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.note}</td>}
                    {visibleColumns.has('top_50_no') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.top_50_no || ''}</td>}
                    {visibleColumns.has('top50') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.top50}</td>}
                    {visibleColumns.has('colour_sign') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.colour_sign}</td>}
                    {visibleColumns.has('qr') && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-200">{runner.qr}</td>}
                    {visibleColumns.has('bib_pass_link') && (
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-blue-400 hover:text-blue-300">
                        {runner.access_key && (
                          <a
                            href={`${APP_BASE_URL}/#/bibpass/${runner.access_key}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            View Pass
                          </a>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                      <Button onClick={() => handleEditClick(runner)} size="sm" variant="secondary">
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center mt-4">
            <Button onClick={handlePreviousPage} disabled={currentPage === 1 || loading} size="sm" variant="secondary">
              Previous
            </Button>
            <span className="text-sm text-gray-300">
              Page {currentPage} of {totalPages}
            </span>
            <Button onClick={handleNextPage} disabled={currentPage === totalPages || loading} size="sm" variant="secondary">
              Next
            </Button>
          </div>
        </>
      )}

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setIdCardNumber('');
          setIdCardHashMatchWarning(null);
        }}
        title="Edit Runner Details"
        footer={modalFooter}
      >
        {loading && !updateError ? ( // Only show spinner if actively loading and no error to display
          <LoadingSpinner message="Saving changes..." />
        ) : (
          <>
            {updateError && <p className="text-red-500 mb-4">{updateError}</p>}
            {isEditingRunner && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* New: Runner ID field */}
                <div className="md:col-span-2">
                  <Input
                    id="edit-id"
                    label="Runner ID"
                    name="id"
                    value={isEditingRunner.id || ''}
                    disabled={true} // ID is typically not editable
                  />
                </div>
                <Input
                  id="edit-first_name"
                  label="First Name"
                  name="first_name"
                  value={editForm.first_name || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-last_name"
                  label="Last Name"
                  name="last_name"
                  value={editForm.last_name || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-bib"
                  label="Bib Number"
                  name="bib"
                  value={editForm.bib || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-id_card_number"
                  label="ID Card Number"
                  name="id_card_number"
                  value={idCardNumber}
                  onChange={(e) => setIdCardNumber(e.target.value)}
                  placeholder="Enter ID card number (will be hashed on save)"
                  error={idCardHashMatchWarning || undefined}
                />
                <Input
                  id="edit-id_card_hash"
                  label="ID Card Hash (Current)"
                  name="id_card_hash"
                  value={editForm.id_card_hash || ''}
                  disabled={true}
                  placeholder="Hash will be updated when you save"
                />
                <Input
                  id="edit-race_kit"
                  label="Race Kit"
                  name="race_kit"
                  value={editForm.race_kit || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-row"
                  label="Row"
                  name="row"
                  value={editForm.row || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-row_no"
                  label="Row No"
                  name="row_no"
                  value={editForm.row_no || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-shirt"
                  label="Shirt Size"
                  name="shirt"
                  value={editForm.shirt || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-shirt_type"
                  label="Shirt Type"
                  name="shirt_type"
                  value={editForm.shirt_type || ''}
                  onChange={handleEditFormChange}
                />
                <Input // Changed from Select to Input
                  id="edit-gender"
                  label="Gender"
                  name="gender"
                  value={editForm.gender || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-nationality"
                  label="Nationality"
                  name="nationality"
                  value={editForm.nationality || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-age_category"
                  label="Age Category"
                  name="age_category"
                  value={editForm.age_category || ''}
                  onChange={handleEditFormChange}
                />
                <Input // Changed from Select to Input
                  id="edit-block"
                  label="Block"
                  name="block"
                  value={editForm.block || ''}
                  onChange={handleEditFormChange}
                />
                <Input // Changed from Select to Input
                  id="edit-wave_start"
                  label="Wave Start"
                  name="wave_start"
                  value={editForm.wave_start || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-pre_order"
                  label="Pre Order"
                  name="pre_order"
                  value={editForm.pre_order || ''}
                  onChange={handleEditFormChange}
                />
                <Input // Changed from Select to Input
                  id="edit-first_half_marathon"
                  label="First Half Marathon"
                  name="first_half_marathon"
                  value={editForm.first_half_marathon || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-note"
                  label="Note"
                  name="note"
                  value={editForm.note || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-top_50_no"
                  label="TOP 50 No"
                  name="top_50_no"
                  value={editForm.top_50_no || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-top50"
                  label="TOP 50"
                  name="top50"
                  value={editForm.top50 || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-colour_sign"
                  label="Colour Sign"
                  name="colour_sign"
                  value={editForm.colour_sign || ''}
                  onChange={handleEditFormChange}
                />
                <Input
                  id="edit-qr"
                  label="QR"
                  name="qr"
                  value={editForm.qr || ''}
                  onChange={handleEditFormChange}
                />
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default RunnerTable;
