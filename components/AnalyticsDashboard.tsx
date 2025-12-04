import React, { useState, useEffect } from 'react';
import { getActivityStatistics, getDailyStatistics } from '../services/supabaseService';
import { ActivityStatistics, DailyStatistics } from '../types';
import LoadingSpinner from './LoadingSpinner';
import Button from './Button';

const AnalyticsDashboard: React.FC = () => {
  const [stats, setStats] = useState<ActivityStatistics | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStatistics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchStatistics();
  }, [days]);

  const fetchStatistics = async () => {
    setLoading(true);
    setError(null);

    try {
      const [statsResult, dailyResult] = await Promise.all([
        getActivityStatistics(days),
        getDailyStatistics(days),
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
    } catch (err: any) {
      setError(err.message || 'Failed to fetch statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchStatistics();
  };

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <span className="text-white font-bold text-lg">{stats.lookup_success_rate.toFixed(2)}%</span>
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
                <span className="text-white font-bold text-lg">{stats.download_success_rate.toFixed(2)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Statistics Table */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Daily Statistics</h2>
          <span className="text-gray-400 text-sm">
            Showing {dailyStats.length} {dailyStats.length === 1 ? 'day' : 'days'}
          </span>
        </div>
        {dailyStats.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No daily statistics available for the selected period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="pb-3 text-gray-300 font-semibold">Date</th>
                  <th className="pb-3 text-gray-300 font-semibold text-right">Lookups</th>
                  <th className="pb-3 text-gray-300 font-semibold text-right">Downloads</th>
                  <th className="pb-3 text-gray-300 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {dailyStats.map((day, index) => (
                  <tr
                    key={day.date}
                    className={`border-b border-gray-700 hover:bg-gray-700 transition-colors ${
                      index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'
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
                    <td className="py-3 text-right text-blue-400 font-semibold">
                      {(day.lookups + day.downloads).toLocaleString()}
                    </td>
                  </tr>
                ))}
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
                    {dailyStats.reduce((sum, day) => sum + day.lookups + day.downloads, 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
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


