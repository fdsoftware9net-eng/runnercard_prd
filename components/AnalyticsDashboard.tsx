import React, { useState, useEffect, useCallback } from 'react';
import { getActivityStatistics, getDailyStatistics, getRunnerUpdates, getRunnersByIds } from '../services/supabaseService';
import { ActivityStatistics, DailyStatistics, RunnerUpdate, Runner } from '../types';
import LoadingSpinner from './LoadingSpinner';
import Button from './Button';

const AnalyticsDashboard: React.FC = () => {
  const [stats, setStats] = useState<ActivityStatistics | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStatistics[]>([]);
  const [runnerUpdates, setRunnerUpdates] = useState<RunnerUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [runnerCurrentPage, setRunnerCurrentPage] = useState(1);
  const [runnerItemsPerPage, setRunnerItemsPerPage] = useState(10);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchStatistics();
  }, [days]);

  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage, dailyStats.length]);

  useEffect(() => {
    setRunnerCurrentPage(1);
  }, [runnerItemsPerPage, runnerUpdates.length]);

  const fetchStatistics = async () => {
    setLoading(true);
    setError(null);

    try {
      const [statsResult, dailyResult, updatesResult] = await Promise.all([
        getActivityStatistics(days),
        getDailyStatistics(days),
        getRunnerUpdates(days, 50), // ✅ เพิ่ม: ดึง runner updates
      ]);

      if (statsResult.error) {
        setError(statsResult.error);
      } else {
        setStats(statsResult.data || null);
      }

      if (dailyResult.error) {
        console.error('Failed to fetch daily stats:', dailyResult.error);
        // Don't set error for daily stats, just log it
      } else {
        setDailyStats(dailyResult.data || []);
      }

      if (updatesResult.error) {
        console.error('❌ Failed to fetch runner updates:', updatesResult.error);
        // Don't set error for runner updates, just log it
      } else {
        console.log('✅ Runner updates fetched:', updatesResult.data?.length || 0, 'runners');
        setRunnerUpdates(updatesResult.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchStatistics();
  };

  // Define the order of columns for CSV export
  // Note: last_updated_at and failed_count are from RunnerUpdate, not Runner
  const EXPORT_COLUMN_KEYS: Array<keyof Runner> = [
    "id",
    "first_name",
    "last_name",
    "id_card_hash",
    "bib",
    "top50",
    "top_50_no",
    "race_kit",
    "colour_sign",
    "row",
    "row_no",
    "shirt_type",
    "shirt",
    "gender",
    "nationality",
    "age_category",
    "block",
    "wave_start",
    "pre_order",
    "first_half_marathon",
    "note",
    "qr",
  ];
  
  // Additional columns from RunnerUpdate (not in Runner type)
  const ADDITIONAL_COLUMNS = ['last_updated_at', 'failed_count'];

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

  const handleExportRunnerUpdates = useCallback(async () => {
    if (runnerUpdates.length === 0) {
      alert('No runner updates to export.');
      return;
    }

    setIsExporting(true);
    try {
      // Extract runner_id array from runnerUpdates
      const runnerIds = runnerUpdates.map(update => update.runner_id);

      // Fetch full runner data for all updated runners
      const result = await getRunnersByIds(runnerIds);

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data || result.data.length === 0) {
        alert('No runner data found to export.');
        setIsExporting(false);
        return;
      }

      // Create a map from runnerUpdates for quick lookup
      const updateMap = new Map(
        runnerUpdates.map(update => [update.runner_id, update])
      );

      // Create CSV content with headers
      const allHeaders = [...EXPORT_COLUMN_KEYS, ...ADDITIONAL_COLUMNS];
      const header = allHeaders.map(key => escapeCsvValue(key)).join(',');
      
      // Create rows with merged data
      const rows = result.data.map(runner => {
        const update = updateMap.get(runner.id || '') as RunnerUpdate | undefined;
        const rowData = [
          ...EXPORT_COLUMN_KEYS.map(key => escapeCsvValue(runner[key])),
          escapeCsvValue(update?.last_updated_at || ''),
          escapeCsvValue(update?.failed_count || 0)
        ];
        return rowData.join(',');
      });

      const csvContent = [header, ...rows].join('\n');
      // เพิ่ม UTF-8 BOM เพื่อให้ Excel อ่านภาษาไทยได้ถูกต้อง
      const csvWithBom = '\uFEFF' + csvContent;
      const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `runner_updates_full_data_${days}_days_${dateStr}.csv`);
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
  }, [runnerUpdates, days]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <LoadingSpinner message="Loading analytics..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900 text-red-100 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-bold mb-2">Error Loading Analytics</h2>
        <p className="mb-4">{error}</p>
        <Button onClick={handleRefresh} variant="secondary">
          Retry
        </Button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center">
        <p className="text-gray-300">No statistics available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Analytics Dashboard</h1>
          <p className="text-gray-400">View activity statistics and trends</p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="days-select" className="text-gray-300 text-sm">
            Period:
          </label>
          <select
            id="days-select"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-4 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
          <Button onClick={handleRefresh} variant="secondary" size="sm">
            Refresh
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Lookup Statistics Card */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Lookup Statistics</h2>
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Total Lookups:</span>
              <span className="text-white font-bold text-lg">{stats.total_lookups.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Successful:</span>
              <span className="text-green-400 font-bold">{stats.successful_lookups.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Failed:</span>
              <span className="text-red-400 font-bold">{stats.failed_lookups.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-300 font-semibold">Success Rate:</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(stats.lookup_success_rate, 100)}%` }}
                  ></div>
                </div>
                <span className="text-white font-bold text-base whitespace-nowrap">
                  {stats.lookup_success_rate.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Download Statistics Card */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Download Statistics</h2>
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Total Downloads:</span>
              <span className="text-white font-bold text-lg">{stats.total_downloads.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Successful:</span>
              <span className="text-green-400 font-bold">{stats.successful_downloads.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Failed:</span>
              <span className="text-red-400 font-bold">{stats.failed_downloads.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-300 font-semibold">Success Rate:</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(stats.download_success_rate, 100)}%` }}
                  ></div>
                </div>
                <span className="text-white font-bold text-base whitespace-nowrap">
                  {stats.download_success_rate.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Google Wallet Statistics Card */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Google Wallet</h2>
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Total Downloads:</span>
              <span className="text-white font-bold text-lg">{stats.total_google_wallet.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Successful:</span>
              <span className="text-green-400 font-bold">{stats.successful_google_wallet.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Failed:</span>
              <span className="text-red-400 font-bold">{stats.failed_google_wallet.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-300 font-semibold">Success Rate:</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(stats.google_wallet_success_rate, 100)}%` }}
                  ></div>
                </div>
                <span className="text-white font-bold text-base whitespace-nowrap">
                  {stats.google_wallet_success_rate.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Apple Wallet Statistics Card */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Apple Wallet</h2>
            <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Total Downloads:</span>
              <span className="text-white font-bold text-lg">{stats.total_apple_wallet.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Successful:</span>
              <span className="text-green-400 font-bold">{stats.successful_apple_wallet.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Failed:</span>
              <span className="text-red-400 font-bold">{stats.failed_apple_wallet.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-300 font-semibold">Success Rate:</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-gray-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(stats.apple_wallet_success_rate, 100)}%` }}
                  ></div>
                </div>
                <span className="text-white font-bold text-base whitespace-nowrap">
                  {stats.apple_wallet_success_rate.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* LINE Account Statistics Card */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">LINE Account</h2>
            <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Total Clicks:</span>
              <span className="text-white font-bold text-lg">{stats.total_link_line_account.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Successful:</span>
              <span className="text-green-400 font-bold">{stats.successful_link_line_account.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-gray-300">Failed:</span>
              <span className="text-red-400 font-bold">{stats.failed_link_line_account.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-300 font-semibold">Success Rate:</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(stats.link_line_account_success_rate, 100)}%` }}
                  ></div>
                </div>
                <span className="text-white font-bold text-base whitespace-nowrap">
                  {stats.link_line_account_success_rate.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Statistics Table */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
          <h2 className="text-xl font-semibold text-white">Daily Statistics</h2>
          <div className="flex items-center gap-3">
            <label htmlFor="items-per-page" className="text-gray-300 text-sm">
              Items per page:
            </label>
            <select
              id="items-per-page"
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="px-3 py-1.5 bg-gray-700 text-white rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-gray-400 text-sm">
              Total: {dailyStats.length} {dailyStats.length === 1 ? 'day' : 'days'}
            </span>
          </div>
        </div>
        {dailyStats.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No daily statistics available for the selected period</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="pb-3 text-gray-300 font-semibold">Date</th>
                    <th className="pb-3 text-gray-300 font-semibold text-right">Lookups</th>
                    <th className="pb-3 text-gray-300 font-semibold text-right">Downloads</th>
                    <th className="pb-3 text-gray-300 font-semibold text-right">Google Wallet</th>
                    <th className="pb-3 text-gray-300 font-semibold text-right">Apple Wallet</th>
                    <th className="pb-3 text-gray-300 font-semibold text-right">LINE Account</th>
                    <th className="pb-3 text-gray-300 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyStats
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((day, index) => {
                      const globalIndex = (currentPage - 1) * itemsPerPage + index;
                      return (
                        <tr
                          key={day.date}
                          className={`border-b border-gray-700 hover:bg-gray-700 transition-colors ${
                            globalIndex % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'
                          }`}
                        >
                          <td className="py-3 text-white font-medium">
                            {new Date(day.date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="py-3 text-right text-white">{day.lookups.toLocaleString()}</td>
                          <td className="py-3 text-right text-white">{day.downloads.toLocaleString()}</td>
                          <td className="py-3 text-right text-blue-400">{day.google_wallet.toLocaleString()}</td>
                          <td className="py-3 text-right text-gray-400">{day.apple_wallet.toLocaleString()}</td>
                          <td className="py-3 text-right text-green-400">{day.link_line_account.toLocaleString()}</td>
                          <td className="py-3 text-right text-blue-400 font-semibold">
                            {(day.lookups + day.downloads + day.google_wallet + day.apple_wallet + day.link_line_account).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-600 bg-gray-700">
                    <td className="py-3 text-white font-bold">Total</td>
                    <td className="py-3 text-right text-white font-bold">
                      {dailyStats.reduce((sum, day) => sum + day.lookups, 0).toLocaleString()}
                    </td>
                    <td className="py-3 text-right text-white font-bold">
                      {dailyStats.reduce((sum, day) => sum + day.downloads, 0).toLocaleString()}
                    </td>
                    <td className="py-3 text-right text-blue-400 font-bold">
                      {dailyStats.reduce((sum, day) => sum + day.google_wallet, 0).toLocaleString()}
                    </td>
                    <td className="py-3 text-right text-gray-400 font-bold">
                      {dailyStats.reduce((sum, day) => sum + day.apple_wallet, 0).toLocaleString()}
                    </td>
                    <td className="py-3 text-right text-green-400 font-bold">
                      {dailyStats.reduce((sum, day) => sum + day.link_line_account, 0).toLocaleString()}
                    </td>
                    <td className="py-3 text-right text-blue-400 font-bold">
                      {dailyStats.reduce((sum, day) => sum + day.lookups + day.downloads + day.google_wallet + day.apple_wallet + day.link_line_account, 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Pagination Controls */}
            {dailyStats.length > itemsPerPage && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-gray-700">
                <div className="text-gray-400 text-sm">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, dailyStats.length)} of {dailyStats.length} entries
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-gray-700 text-white rounded-md border border-gray-600 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.ceil(dailyStats.length / itemsPerPage) }, (_, i) => i + 1)
                      .filter((page) => {
                        const totalPages = Math.ceil(dailyStats.length / itemsPerPage);
                        if (totalPages <= 7) return true;
                        if (page === 1 || page === totalPages) return true;
                        if (Math.abs(page - currentPage) <= 1) return true;
                        return false;
                      })
                      .map((page, index, array) => {
                        const prevPage = array[index - 1];
                        const showEllipsis = prevPage && page - prevPage > 1;
                        return (
                          <React.Fragment key={page}>
                            {showEllipsis && (
                              <span className="px-2 text-gray-400">...</span>
                            )}
                            <button
                              onClick={() => setCurrentPage(page)}
                              className={`px-3 py-1.5 rounded-md border transition-colors text-sm ${
                                currentPage === page
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-gray-700 text-white border-gray-600 hover:bg-gray-600'
                              }`}
                            >
                              {page}
                            </button>
                          </React.Fragment>
                        );
                      })}
                  </div>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(Math.ceil(dailyStats.length / itemsPerPage), prev + 1))}
                    disabled={currentPage >= Math.ceil(dailyStats.length / itemsPerPage)}
                    className="px-3 py-1.5 bg-gray-700 text-white rounded-md border border-gray-600 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Runner Updates Table */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
          <h2 className="text-xl font-semibold text-white">Runner Updates</h2>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleExportRunnerUpdates}
              variant="secondary"
              size="sm"
              disabled={runnerUpdates.length === 0 || isExporting}
              loading={isExporting}
            >
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </Button>
            <label htmlFor="runner-items-per-page" className="text-gray-300 text-sm">
              Items per page:
            </label>
            <select
              id="runner-items-per-page"
              value={runnerItemsPerPage}
              onChange={(e) => setRunnerItemsPerPage(Number(e.target.value))}
              className="px-3 py-1.5 bg-gray-700 text-white rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-gray-400 text-sm">
              Total: {runnerUpdates.length} {runnerUpdates.length === 1 ? 'runner' : 'runners'}
            </span>
          </div>
        </div>
        {runnerUpdates.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No runner updates found for the selected period</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="pb-3 text-gray-300 font-semibold">Runner</th>
                    <th className="pb-3 text-gray-300 font-semibold text-right">BIB</th>
                    <th className="pb-3 text-gray-300 font-semibold text-right">Update Count</th>
                    <th className="pb-3 text-gray-300 font-semibold text-right">Successful</th>
                    <th className="pb-3 text-gray-300 font-semibold text-right">Failed</th>
                    <th className="pb-3 text-gray-300 font-semibold">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {runnerUpdates
                    .slice((runnerCurrentPage - 1) * runnerItemsPerPage, runnerCurrentPage * runnerItemsPerPage)
                    .map((update, index) => {
                      const globalIndex = (runnerCurrentPage - 1) * runnerItemsPerPage + index;
                      return (
                        <tr
                          key={update.runner_id}
                          className={`border-b border-gray-700 hover:bg-gray-700 transition-colors ${
                            globalIndex % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'
                          }`}
                        >
                          <td className="py-3 text-white font-medium">
                            {update.runner_name}
                          </td>
                          <td className="py-3 text-right text-white">{update.runner_bib}</td>
                          <td className="py-3 text-right text-blue-400 font-semibold">
                            {update.update_count.toLocaleString()}
                          </td>
                          <td className="py-3 text-right text-green-400">
                            {update.success_count.toLocaleString()}
                          </td>
                          <td className="py-3 text-right text-red-400">
                            {update.failed_count.toLocaleString()}
                          </td>
                          <td className="py-3 text-gray-300">
                            {new Date(update.last_updated_at).toLocaleString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {/* Pagination Controls */}
            {runnerUpdates.length > runnerItemsPerPage && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-gray-700">
                <div className="text-gray-400 text-sm">
                  Showing {(runnerCurrentPage - 1) * runnerItemsPerPage + 1} to {Math.min(runnerCurrentPage * runnerItemsPerPage, runnerUpdates.length)} of {runnerUpdates.length} entries
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRunnerCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={runnerCurrentPage === 1}
                    className="px-3 py-1.5 bg-gray-700 text-white rounded-md border border-gray-600 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.ceil(runnerUpdates.length / runnerItemsPerPage) }, (_, i) => i + 1)
                      .filter((page) => {
                        const totalPages = Math.ceil(runnerUpdates.length / runnerItemsPerPage);
                        if (totalPages <= 7) return true;
                        if (page === 1 || page === totalPages) return true;
                        if (Math.abs(page - runnerCurrentPage) <= 1) return true;
                        return false;
                      })
                      .map((page, index, array) => {
                        const prevPage = array[index - 1];
                        const showEllipsis = prevPage && page - prevPage > 1;
                        return (
                          <React.Fragment key={page}>
                            {showEllipsis && (
                              <span className="px-2 text-gray-400">...</span>
                            )}
                            <button
                              onClick={() => setRunnerCurrentPage(page)}
                              className={`px-3 py-1.5 rounded-md border transition-colors text-sm ${
                                runnerCurrentPage === page
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-gray-700 text-white border-gray-600 hover:bg-gray-600'
                              }`}
                            >
                              {page}
                            </button>
                          </React.Fragment>
                        );
                      })}
                  </div>
                  <button
                    onClick={() => setRunnerCurrentPage((prev) => Math.min(Math.ceil(runnerUpdates.length / runnerItemsPerPage), prev + 1))}
                    disabled={runnerCurrentPage >= Math.ceil(runnerUpdates.length / runnerItemsPerPage)}
                    className="px-3 py-1.5 bg-gray-700 text-white rounded-md border border-gray-600 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Summary Info */}
      {/* <div className="bg-blue-900 bg-opacity-30 border border-blue-700 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-gray-300">
            <p className="font-semibold text-blue-400 mb-1">About this data</p>
            <p>
              Statistics are calculated from user activity logs. Lookups represent search attempts on the Find My Pass page.
              Downloads represent image save operations. Data is updated in real-time.
            </p>
          </div>
        </div>
      </div> */}
    </div>
  );
};

export default AnalyticsDashboard;


