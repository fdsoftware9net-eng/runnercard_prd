# Analytics Guide - การนับจำนวน Lookup และ Download Images tt

## 📋 สารบัญ
- [ภาพรวม](#ภาพรวม)
- [วิธีที่ 1: Query โดยตรงจาก Supabase](#วิธีที่-1-query-โดยตรงจาก-supabase)
- [วิธีที่ 2: สร้าง Service Function](#วิธีที่-2-สร้าง-service-function)
- [วิธีที่ 3: สร้าง Analytics Dashboard](#วิธีที่-3-สร้าง-analytics-dashboard)
- [ตัวอย่าง UI Components](#ตัวอย่าง-ui-components)
- [Performance Considerations](#performance-considerations)

---

## ภาพรวม

เพื่อนับจำนวนการค้นหา (Lookup) และการดาวน์โหลดรูปภาพ (Save Image) จากตาราง `user_activity_logs` มีหลายวิธี:

1. **Query โดยตรง** - ใช้ SQL query ใน Supabase Dashboard
2. **Service Function** - สร้าง function ใน `supabaseService.ts` เพื่อดึงข้อมูล
3. **Analytics Dashboard** - สร้างหน้า Dashboard ใน Admin เพื่อแสดงสถิติแบบ Real-time

---

## วิธีที่ 1: Query โดยตรงจาก Supabase

### 1.1 นับจำนวน Lookup ทั้งหมด

```sql
-- นับจำนวน Lookup ทั้งหมด (สำเร็จ + ล้มเหลว)
SELECT COUNT(*) as total_lookups
FROM user_activity_logs
WHERE activity_type = 'lookup';
```

### 1.2 นับจำนวน Lookup แยกตามผลลัพธ์

```sql
-- นับจำนวน Lookup แยกตาม success/failed
SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE success = true) as successful,
    COUNT(*) FILTER (WHERE success = false) as failed,
    ROUND(
        COUNT(*) FILTER (WHERE success = true)::numeric / 
        NULLIF(COUNT(*), 0) * 100, 
        2
    ) as success_rate_percent
FROM user_activity_logs
WHERE activity_type = 'lookup';
```

### 1.3 นับจำนวน Save Image ทั้งหมด

```sql
-- นับจำนวน Save Image ทั้งหมด
SELECT COUNT(*) as total_downloads
FROM user_activity_logs
WHERE activity_type = 'save_image';
```

### 1.4 นับจำนวน Save Image แยกตามผลลัพธ์

```sql
-- นับจำนวน Save Image แยกตาม success/failed
SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE success = true) as successful,
    COUNT(*) FILTER (WHERE success = false) as failed
FROM user_activity_logs
WHERE activity_type = 'save_image';
```

### 1.5 สถิติรวมทั้ง Lookup และ Save Image

```sql
-- สถิติรวมทั้ง 2 กิจกรรม
SELECT 
    activity_type,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE success = true) as successful,
    COUNT(*) FILTER (WHERE success = false) as failed
FROM user_activity_logs
WHERE activity_type IN ('lookup', 'save_image')
GROUP BY activity_type
ORDER BY activity_type;
```

### 1.6 สถิติตามช่วงเวลา (รายวัน)

```sql
-- สถิติรายวัน
SELECT 
    DATE(created_at) as date,
    COUNT(*) FILTER (WHERE activity_type = 'lookup') as lookups,
    COUNT(*) FILTER (WHERE activity_type = 'save_image') as downloads
FROM user_activity_logs
WHERE activity_type IN ('lookup', 'save_image')
    AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### 1.7 สถิติตามช่วงเวลา (รายชั่วโมง)

```sql
-- สถิติรายชั่วโมง (สำหรับวันนี้)
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) FILTER (WHERE activity_type = 'lookup') as lookups,
    COUNT(*) FILTER (WHERE activity_type = 'save_image') as downloads
FROM user_activity_logs
WHERE activity_type IN ('lookup', 'save_image')
    AND created_at >= CURRENT_DATE
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

---

## วิธีที่ 2: สร้าง Service Function

### 2.1 เพิ่ม Interface สำหรับ Statistics

**ไฟล์**: `types.ts`

```typescript
// เพิ่มใน types.ts
export interface ActivityStatistics {
  total_lookups: number;
  successful_lookups: number;
  failed_lookups: number;
  lookup_success_rate: number;
  total_downloads: number;
  successful_downloads: number;
  failed_downloads: number;
  download_success_rate: number;
}

export interface DailyStatistics {
  date: string;
  lookups: number;
  downloads: number;
}
```

### 2.2 สร้าง Service Function

**ไฟล์**: `services/supabaseService.ts`

```typescript
/**
 * ดึงสถิติการใช้งานทั้งหมด
 */
export const getActivityStatistics = async (
  days: number = 30
): Promise<ApiResponse<ActivityStatistics>> => {
  try {
    const supabaseClient = getSupabaseClient();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Query สำหรับ Lookup
    const { data: lookupData, error: lookupError } = await supabaseClient
      .from('user_activity_logs')
      .select('success')
      .eq('activity_type', 'lookup')
      .gte('created_at', startDate.toISOString());

    if (lookupError) throw lookupError;

    // Query สำหรับ Save Image
    const { data: downloadData, error: downloadError } = await supabaseClient
      .from('user_activity_logs')
      .select('success')
      .eq('activity_type', 'save_image')
      .gte('created_at', startDate.toISOString());

    if (downloadError) throw downloadError;

    // คำนวณสถิติ
    const totalLookups = lookupData?.length || 0;
    const successfulLookups = lookupData?.filter(l => l.success).length || 0;
    const failedLookups = totalLookups - successfulLookups;
    const lookupSuccessRate = totalLookups > 0 
      ? (successfulLookups / totalLookups) * 100 
      : 0;

    const totalDownloads = downloadData?.length || 0;
    const successfulDownloads = downloadData?.filter(d => d.success).length || 0;
    const failedDownloads = totalDownloads - successfulDownloads;
    const downloadSuccessRate = totalDownloads > 0 
      ? (successfulDownloads / totalDownloads) * 100 
      : 0;

    return {
      data: {
        total_lookups: totalLookups,
        successful_lookups: successfulLookups,
        failed_lookups: failedLookups,
        lookup_success_rate: Math.round(lookupSuccessRate * 100) / 100,
        total_downloads: totalDownloads,
        successful_downloads: successfulDownloads,
        failed_downloads: failedDownloads,
        download_success_rate: Math.round(downloadSuccessRate * 100) / 100,
      },
    };
  } catch (error: any) {
    console.error('Error fetching activity statistics:', error);
    return { error: error.message || 'Failed to fetch statistics.' };
  }
};

/**
 * ดึงสถิติรายวัน
 */
export const getDailyStatistics = async (
  days: number = 30
): Promise<ApiResponse<DailyStatistics[]>> => {
  try {
    const supabaseClient = getSupabaseClient();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // ใช้ RPC หรือ query แบบ manual
    // เนื่องจาก Supabase client ไม่รองรับ DATE() function โดยตรง
    // ต้องใช้ SQL function หรือ query แบบ raw

    // วิธีที่ 1: Query ทุก record แล้ว group ใน JavaScript
    const { data, error } = await supabaseClient
      .from('user_activity_logs')
      .select('activity_type, created_at')
      .in('activity_type', ['lookup', 'save_image'])
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Group by date
    const dailyStats: { [key: string]: DailyStatistics } = {};
    
    data?.forEach((log) => {
      const date = new Date(log.created_at).toISOString().split('T')[0];
      
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          lookups: 0,
          downloads: 0,
        };
      }

      if (log.activity_type === 'lookup') {
        dailyStats[date].lookups++;
      } else if (log.activity_type === 'save_image') {
        dailyStats[date].downloads++;
      }
    });

    const result = Object.values(dailyStats).sort((a, b) => 
      b.date.localeCompare(a.date)
    );

    return { data: result };
  } catch (error: any) {
    console.error('Error fetching daily statistics:', error);
    return { error: error.message || 'Failed to fetch daily statistics.' };
  }
};
```

### 2.3 วิธีที่ดีกว่า: ใช้ Supabase RPC Function

สร้าง SQL Function ใน Supabase:

```sql
-- สร้าง function สำหรับดึงสถิติ
CREATE OR REPLACE FUNCTION get_activity_statistics(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
    total_lookups BIGINT,
    successful_lookups BIGINT,
    failed_lookups BIGINT,
    lookup_success_rate NUMERIC,
    total_downloads BIGINT,
    successful_downloads BIGINT,
    failed_downloads BIGINT,
    download_success_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM user_activity_logs 
         WHERE activity_type = 'lookup' 
         AND created_at >= NOW() - (days_back || ' days')::INTERVAL)::BIGINT as total_lookups,
        
        (SELECT COUNT(*) FROM user_activity_logs 
         WHERE activity_type = 'lookup' 
         AND success = true
         AND created_at >= NOW() - (days_back || ' days')::INTERVAL)::BIGINT as successful_lookups,
        
        (SELECT COUNT(*) FROM user_activity_logs 
         WHERE activity_type = 'lookup' 
         AND success = false
         AND created_at >= NOW() - (days_back || ' days')::INTERVAL)::BIGINT as failed_lookups,
        
        CASE 
            WHEN (SELECT COUNT(*) FROM user_activity_logs 
                  WHERE activity_type = 'lookup' 
                  AND created_at >= NOW() - (days_back || ' days')::INTERVAL) > 0
            THEN ROUND(
                (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                 WHERE activity_type = 'lookup' AND success = true
                 AND created_at >= NOW() - (days_back || ' days')::INTERVAL) /
                (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                 WHERE activity_type = 'lookup'
                 AND created_at >= NOW() - (days_back || ' days')::INTERVAL) * 100,
                2
            )
            ELSE 0
        END as lookup_success_rate,
        
        (SELECT COUNT(*) FROM user_activity_logs 
         WHERE activity_type = 'save_image' 
         AND created_at >= NOW() - (days_back || ' days')::INTERVAL)::BIGINT as total_downloads,
        
        (SELECT COUNT(*) FROM user_activity_logs 
         WHERE activity_type = 'save_image' 
         AND success = true
         AND created_at >= NOW() - (days_back || ' days')::INTERVAL)::BIGINT as successful_downloads,
        
        (SELECT COUNT(*) FROM user_activity_logs 
         WHERE activity_type = 'save_image' 
         AND success = false
         AND created_at >= NOW() - (days_back || ' days')::INTERVAL)::BIGINT as failed_downloads,
        
        CASE 
            WHEN (SELECT COUNT(*) FROM user_activity_logs 
                  WHERE activity_type = 'save_image' 
                  AND created_at >= NOW() - (days_back || ' days')::INTERVAL) > 0
            THEN ROUND(
                (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                 WHERE activity_type = 'save_image' AND success = true
                 AND created_at >= NOW() - (days_back || ' days')::INTERVAL) /
                (SELECT COUNT(*)::NUMERIC FROM user_activity_logs 
                 WHERE activity_type = 'save_image'
                 AND created_at >= NOW() - (days_back || ' days')::INTERVAL) * 100,
                2
            )
            ELSE 0
        END as download_success_rate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

เรียกใช้ใน TypeScript:

```typescript
export const getActivityStatistics = async (
  days: number = 30
): Promise<ApiResponse<ActivityStatistics>> => {
  try {
    const supabaseClient = getSupabaseClient();
    const { data, error } = await supabaseClient.rpc('get_activity_statistics', {
      days_back: days,
    });

    if (error) throw error;

    return {
      data: {
        total_lookups: data[0].total_lookups,
        successful_lookups: data[0].successful_lookups,
        failed_lookups: data[0].failed_lookups,
        lookup_success_rate: Number(data[0].lookup_success_rate),
        total_downloads: data[0].total_downloads,
        successful_downloads: data[0].successful_downloads,
        failed_downloads: data[0].failed_downloads,
        download_success_rate: Number(data[0].download_success_rate),
      },
    };
  } catch (error: any) {
    console.error('Error fetching activity statistics:', error);
    return { error: error.message || 'Failed to fetch statistics.' };
  }
};
```

---

## วิธีที่ 3: สร้าง Analytics Dashboard

### 3.1 สร้าง Analytics Component

**ไฟล์**: `components/AnalyticsDashboard.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { getActivityStatistics, getDailyStatistics } from '../services/supabaseService';
import { ActivityStatistics, DailyStatistics } from '../types';
import LoadingSpinner from './LoadingSpinner';

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
    } else {
      setDailyStats(dailyResult.data || []);
    }

    setLoading(false);
  };

  if (loading) {
    return <LoadingSpinner message="Loading analytics..." />;
  }

  if (error) {
    return (
      <div className="bg-red-900 text-red-100 p-6 rounded-lg">
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!stats) {
    return <div>No statistics available</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Analytics Dashboard</h2>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="px-4 py-2 bg-gray-700 text-white rounded"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lookup Statistics */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold text-white mb-4">Lookup Statistics</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-300">Total Lookups:</span>
              <span className="text-white font-bold">{stats.total_lookups.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Successful:</span>
              <span className="text-green-400 font-bold">{stats.successful_lookups.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Failed:</span>
              <span className="text-red-400 font-bold">{stats.failed_lookups.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-700">
              <span className="text-gray-300">Success Rate:</span>
              <span className="text-white font-bold">{stats.lookup_success_rate.toFixed(2)}%</span>
            </div>
          </div>
        </div>

        {/* Download Statistics */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold text-white mb-4">Download Statistics</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-300">Total Downloads:</span>
              <span className="text-white font-bold">{stats.total_downloads.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Successful:</span>
              <span className="text-green-400 font-bold">{stats.successful_downloads.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Failed:</span>
              <span className="text-red-400 font-bold">{stats.failed_downloads.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-700">
              <span className="text-gray-300">Success Rate:</span>
              <span className="text-white font-bold">{stats.download_success_rate.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Chart */}
      <div className="bg-gray-800 p-6 rounded-lg">
        <h3 className="text-xl font-semibold text-white mb-4">Daily Statistics</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="pb-2 text-gray-300">Date</th>
                <th className="pb-2 text-gray-300 text-right">Lookups</th>
                <th className="pb-2 text-gray-300 text-right">Downloads</th>
              </tr>
            </thead>
            <tbody>
              {dailyStats.map((day) => (
                <tr key={day.date} className="border-b border-gray-700">
                  <td className="py-2 text-white">{day.date}</td>
                  <td className="py-2 text-right text-white">{day.lookups}</td>
                  <td className="py-2 text-right text-white">{day.downloads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
```

### 3.2 เพิ่ม Route ใน App.tsx

```typescript
// เพิ่มใน App.tsx
import AnalyticsDashboard from './components/AnalyticsDashboard';

// ใน Routes
<Route path="/analytics" element={<AnalyticsDashboard />} />
```

---

## ตัวอย่าง UI Components

### Stat Card Component

```typescript
interface StatCardProps {
  title: string;
  value: number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, trend }) => {
  return (
    <div className="bg-gray-800 p-6 rounded-lg">
      <h3 className="text-gray-400 text-sm mb-2">{title}</h3>
      <p className="text-3xl font-bold text-white">{value.toLocaleString()}</p>
      {subtitle && <p className="text-gray-500 text-sm mt-2">{subtitle}</p>}
    </div>
  );
};
```

---

## Performance Considerations

### 1. Indexing
- ✅ ตารางมี index อยู่แล้วสำหรับ `activity_type`, `created_at`, `success`
- ✅ Composite index สำหรับ `(runner_id, activity_type, created_at)`

### 2. Caching
- 💡 พิจารณา cache ผลลัพธ์ 5-10 นาที สำหรับ dashboard
- 💡 ใช้ React Query หรือ SWR สำหรับ caching

### 3. Pagination
- 💡 สำหรับ daily statistics ที่มีข้อมูลเยอะ ควรใช้ pagination
- 💡 Limit จำนวนวันที่แสดง (เช่น แสดงแค่ 30 วันล่าสุด)

### 4. Real-time Updates
- 💡 ใช้ Supabase Realtime subscription สำหรับอัปเดตแบบ real-time (ถ้าต้องการ)
- 💡 หรือ refresh ทุก 30 วินาที - 1 นาที

---

## สรุป

### วิธีที่แนะนำ

1. **สำหรับ Quick Check**: ใช้ SQL Query ใน Supabase Dashboard
2. **สำหรับ Integration**: สร้าง Service Function ใน `supabaseService.ts`
3. **สำหรับ User Interface**: สร้าง Analytics Dashboard Component

### ขั้นตอนการทำ

1. ✅ สร้าง TypeScript interfaces (`ActivityStatistics`, `DailyStatistics`)
2. ✅ สร้าง Service functions (`getActivityStatistics`, `getDailyStatistics`)
3. ✅ สร้าง Analytics Dashboard Component
4. ✅ เพิ่ม Route ใน App.tsx
5. ✅ เพิ่ม Link ใน Admin Dashboard

---

**อัปเดตล่าสุด**: 2024
**ผู้ดูแล**: Development Team



**คำสั่งลบตาราง**
TRUNCATE TABLE user_activity_logs;
TRUNCATE TABLE runners;
TRUNCATE TABLE runners CASCADE;



