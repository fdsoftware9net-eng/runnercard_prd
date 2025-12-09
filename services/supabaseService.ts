
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Runner, ApiResponse, WalletConfig, CreateActivityLogParams, UserActivityLog, ActivityStatistics, DailyStatistics } from '../types'; 
import { hashNationalId } from '../utils/hashing';
import { getConfig } from '../constants';

let supabase: SupabaseClient | null = null;

// The client is now a singleton initialized directly from the centralized config.
export const getSupabaseClient = (): SupabaseClient => {
  if (supabase) {
    return supabase;
  }

  // --- KEY CHANGE ---
  // Initialize from the centralized, lazy-loaded config function.
  try {
    const config = getConfig();
    supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    return supabase;
  } catch (e) {
    console.error('Failed to initialize Supabase from config:', e);
    throw new Error('Invalid Supabase credentials provided in config.');
  }
};


const CHUNK_SIZE = 500; // Define batch size for bulk insertion (frontend-side)

export const insertRunners = async (runners: Runner[]): Promise<ApiResponse<{ successCount: number; totalRecords: number; failedCount: number; failedDetails?: Array<{ index: number; bib?: string; error: string }> }>> => {
  try {
    const supabaseClient = getSupabaseClient();
    let recordsInserted = 0;
    const totalRecords = runners.length;
    let failedCount = 0;
    const failedDetails: Array<{ index: number; bib?: string; error: string }> = [];

    for (let i = 0; i < totalRecords; i += CHUNK_SIZE) {
      const chunk = runners.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabaseClient.from('runners').insert(chunk).select('id');

      if (error) {
        console.error(`Error in batch starting at index ${i}:`, error.message);
        console.error(`Failed batch details:`, {
          batchStart: i,
          batchEnd: Math.min(i + CHUNK_SIZE - 1, totalRecords - 1),
          chunkSize: chunk.length,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint
        });

        // Try to insert one by one to identify which records failed
        for (let j = 0; j < chunk.length; j++) {
          const singleRecord = chunk[j];
          const { error: singleError } = await supabaseClient.from('runners').insert(singleRecord);
          if (singleError) {
            failedCount++;
            failedDetails.push({
              index: i + j,
              bib: singleRecord.bib,
              error: singleError.message || 'Unknown error'
            });
            console.warn(`Failed to insert runner at index ${i + j} (BIB: ${singleRecord.bib}):`, singleError.message);
          } else {
            recordsInserted++;
          }
        }
      } else {
        // Success - all records in chunk were inserted
        recordsInserted += chunk.length;
      }
    }

    console.log(`[insertRunners] Inserted ${recordsInserted} of ${totalRecords} runners. Failed: ${failedCount}`);
    if (failedCount > 0) {
      console.warn(`[insertRunners] Failed records:`, failedDetails.slice(0, 10)); // Log first 10 failures
    }

    return {
      data: {
        successCount: recordsInserted,
        totalRecords: totalRecords,
        failedCount: failedCount,
        failedDetails: failedDetails.length > 0 ? failedDetails : undefined
      }
    };
  } catch (error: any) {
    console.error('Error inserting runners:', error);
    return { error: error.message || 'Failed to insert runner data.' };
  }
};


export const getRunners = async (
  page: number = 1, // Default page to 1
  pageSize: number = 20, // Default page size to 20
  searchTerm: string = ''
): Promise<ApiResponse<Runner[]>> => {
  try {
    let queryBuilder = getSupabaseClient()
      .from('runners')
      .select('*', { count: 'exact' }); // Always get exact count

    if (searchTerm) {
      // Basic text search across common fields.
      // Supabase's FTS (Full Text Search) would be better for complex queries.
      // For this example, we'll use a simple ILIKE filter for multiple fields.
      queryBuilder = queryBuilder.or(
        `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,bib.ilike.%${searchTerm}%`
      );
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    queryBuilder = queryBuilder.range(from, to); // Always apply range for pagination

    const { data, error, count } = await queryBuilder
      .order('bib', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }
    console.log(`[supabaseService] Fetched ${data?.length || 0} runners (total: ${count || 0}). Search: "${searchTerm}", Page: ${page}, PageSize: ${pageSize}`);
    return { data: data || [], totalCount: count || 0 };
  } catch (error: any) {
    console.error('Error fetching runners with pagination:', error);
    return { error: error.message || 'Failed to fetch runners with pagination.' };
  }
};


export const getRunnerByAccessKey = async (accessKey: string): Promise<ApiResponse<Runner | null>> => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('runners')
      .select('*')
      .eq('access_key', accessKey)
      .single();

    if (error && error.code === 'PGRST116') { // No rows found
      return { data: null };
    }
    if (error) {
      throw new Error(error.message);
    }
    return { data };
  } catch (error: any) {
    console.error('Error fetching runner by access key:', error);
    return { error: error.message || 'Failed to fetch runner by access key.' };
  }
};

export const findRunnerByDetails = async (
  details: { firstName?: string; lastName?: string; idCardNumber?: string; bib?: number; }
): Promise<ApiResponse<Runner | null>> => {
  try {
    const supabaseClient = getSupabaseClient();
    let queryBuilder = supabaseClient.from('runners').select('*');

    if (details.idCardNumber && details.idCardNumber.trim()) {
      const hashedId = await hashNationalId(details.idCardNumber.trim());
      queryBuilder = queryBuilder.eq('id_card_hash', hashedId);
    } else if (details.firstName && details.lastName && details.firstName.trim() && details.lastName.trim()) {
      queryBuilder = queryBuilder
        // ลบ % ออกทั้งหน้าและหลัง เพื่อให้เป็นการหาแบบตรงเป๊ะๆ
        .ilike('first_name', details.firstName.trim())
        .ilike('last_name', details.lastName.trim());
    } else if (details.bib && details.bib.toString().trim()) {
      queryBuilder = queryBuilder.eq('bib', details.bib.toString());
    } else {
      return { error: 'Either National ID or both First and Last Name are required.' };
    }

    const { data, error } = await queryBuilder.limit(1).maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return { data: null };
      }
      throw new Error(error.message);
    }

    return { data };
  } catch (error: any) {
    console.error('Error finding runner by details:', error);
    return { error: error.message || 'Failed to find runner.' };
  }
};

export const updateRunner = async (runner: Partial<Runner>): Promise<ApiResponse<Runner | null>> => {
  if (!runner.id) {
    return { error: 'Runner ID is required for update.' };
  }
  try {
    const { data, error } = await getSupabaseClient()
      .from('runners')
      .update(runner)
      .eq('id', runner.id)
      .select();

    if (error) {
      throw new Error(error.message);
    }

    // If data is an array (even if 0 or more elements), return the first element if it exists, otherwise null
    const updatedRunner = data && data.length > 0 ? data[0] : null;

    // Return null data if no record was effectively updated, without returning an error.
    // This allows the frontend to handle 'no effective changes' as a soft success.
    return { data: updatedRunner };
  } catch (error: any) {
    console.error('Error updating runner:', error);
    return { error: error.message || 'Failed to update runner.' };
  }
};

// New function to fetch ONLY IDs for bulk operations
export const getAllRunnerIds = async (): Promise<ApiResponse<string[]>> => {
  try {
    const supabaseClient = getSupabaseClient();
    let allIds: string[] = [];
    let hasMore = true;
    let page = 0;
    const pageSize = 1000; // Supabase max limit per request

    while (hasMore) {
      const { data, error } = await supabaseClient
        .from('runners')
        .select('id')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw new Error(error.message);

      if (data) {
        const ids = data.map(r => r.id as string);
        allIds = [...allIds, ...ids];
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    return { data: allIds };
  } catch (error: any) {
    console.error('Error fetching all runner IDs:', error);
    return { error: error.message || 'Failed to fetch all runner IDs.' };
  }
};

const WALLET_CONFIG_ID = 1; // Use a fixed ID for the single config row

export const getWalletConfig = async (): Promise<ApiResponse<WalletConfig | null>> => {
  try {
    const supabaseClient = getSupabaseClient();
    const { data, error } = await supabaseClient
      .from('wallet_config')
      .select('*')
      .eq('id', WALLET_CONFIG_ID)
      .single();

    if (error && error.code === 'PGRST116') { // No rows found
      return { data: null };
    }
    if (error) {
      throw new Error(error.message);
    }
    return { data };
  } catch (error: any) {
    console.error('Error fetching wallet config:', error);
    return { error: error.message || 'Failed to fetch wallet config.' };
  }
};

export const updateWalletConfig = async (config: Omit<WalletConfig, 'created_at'>): Promise<ApiResponse<WalletConfig | null>> => {
  try {
    const supabaseClient = getSupabaseClient();
    const { data, error } = await supabaseClient
      .from('wallet_config')
      .upsert({ ...config, id: WALLET_CONFIG_ID }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return { data };
  } catch (error: any) {
    console.error('Error updating wallet config:', error);
    return { error: error.message || 'Failed to update wallet config.' };
  }
};

// New function to upload images to Supabase Storage
export const uploadPassAsset = async (file: File): Promise<ApiResponse<string>> => {
  try {
    const supabaseClient = getSupabaseClient();

    // Sanitize filename: extract extension, remove special characters, keep only safe chars
    const originalName = file.name;
    const lastDotIndex = originalName.lastIndexOf('.');
    const extension = lastDotIndex > 0 ? originalName.substring(lastDotIndex) : '';
    const baseName = lastDotIndex > 0 ? originalName.substring(0, lastDotIndex) : originalName;

    // Replace spaces and special characters with underscores, keep only alphanumeric, dots, hyphens, underscores
    const sanitizedBase = baseName
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace any non-safe character with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single underscore
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

    // If sanitized name is empty, use a default name
    const safeBaseName = sanitizedBase || 'upload';
    const fileName = `${Date.now()}_${safeBaseName}${extension}`;

    const bucketName = 'pass_assets'; // Ensure this bucket exists in Supabase Storage

    const { data, error } = await supabaseClient.storage
      .from(bucketName)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw new Error(error.message);
    }

    // Get Public URL
    const { data: publicUrlData } = supabaseClient.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    return { data: publicUrlData.publicUrl };
  } catch (error: any) {
    console.error('Error uploading pass asset:', error);
    return { error: error.message || 'Failed to upload image.' };
  }
};

/**
 * Log user activity to the database
 * This function is designed to be non-blocking and fail silently to avoid impacting UX
 */
export const logUserActivity = async (params: CreateActivityLogParams): Promise<void> => {
  try {
    const supabaseClient = getSupabaseClient();
    
    // Get IP address and user agent from browser if available
    const logData: Partial<UserActivityLog> = {
      activity_type: params.activity_type,
      runner_id: params.runner_id || null,
      search_method: params.search_method || null,
      search_input_hash: params.search_input_hash || null,
      success: params.success,
      error_message: params.error_message || null,
      metadata: params.metadata || {},
    };

    // Try to get IP and user agent (may not be available in all environments)
    if (typeof window !== 'undefined') {
      logData.user_agent = params.user_agent || window.navigator?.userAgent || null;
      // Note: IP address cannot be reliably obtained from client-side JavaScript
      // It should be obtained server-side if needed
      logData.ip_address = params.ip_address || null;
    }

    const { error } = await supabaseClient
      .from('user_activity_logs')
      .insert(logData);

    if (error) {
      // Log error but don't throw to avoid impacting UX
      console.warn('Failed to log user activity:', error.message);
    }
  } catch (error: any) {
    // Fail silently to avoid impacting user experience
    console.warn('Error logging user activity:', error.message);
  }
};

/**
 * ดึงสถิติการใช้งานทั้งหมดผ่าน RPC Function
 * @param days จำนวนวันที่ต้องการดึงข้อมูล (default: 30)
 */
export const getActivityStatistics = async (
  days: number = 30
): Promise<ApiResponse<ActivityStatistics>> => {
  try {
    const supabaseClient = getSupabaseClient();
    
    const { data, error } = await supabaseClient.rpc('get_activity_statistics', {
      days_back: days,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      // Return default values if no data
      return {
        data: {
          total_lookups: 0,
          successful_lookups: 0,
          failed_lookups: 0,
          lookup_success_rate: 0,
          total_downloads: 0,
          successful_downloads: 0,
          failed_downloads: 0,
          download_success_rate: 0,
        },
      };
    }

    // RPC function returns array with one object
    const result = data[0];

    return {
      data: {
        total_lookups: Number(result.total_lookups) || 0,
        successful_lookups: Number(result.successful_lookups) || 0,
        failed_lookups: Number(result.failed_lookups) || 0,
        lookup_success_rate: Number(result.lookup_success_rate) || 0,
        total_downloads: Number(result.total_downloads) || 0,
        successful_downloads: Number(result.successful_downloads) || 0,
        failed_downloads: Number(result.failed_downloads) || 0,
        download_success_rate: Number(result.download_success_rate) || 0,
      },
    };
  } catch (error: any) {
    console.error('Error fetching activity statistics:', error);
    return { error: error.message || 'Failed to fetch statistics.' };
  }
};

/**
 * ดึงสถิติรายวันผ่าน RPC Function
 * @param days จำนวนวันที่ต้องการดึงข้อมูล (default: 30)
 */
export const getDailyStatistics = async (
  days: number = 30
): Promise<ApiResponse<DailyStatistics[]>> => {
  try {
    const supabaseClient = getSupabaseClient();
    
    const { data, error } = await supabaseClient.rpc('get_daily_statistics', {
      days_back: days,
    });

    if (error) {
      throw new Error(error.message);
    }

    // Convert date to string format
    const result = (data || []).map((item: any) => ({
      date: item.date, // Already in YYYY-MM-DD format
      lookups: Number(item.lookups) || 0,
      downloads: Number(item.downloads) || 0,
    }));

    return { data: result };
  } catch (error: any) {
    console.error('Error fetching daily statistics:', error);
    return { error: error.message || 'Failed to fetch daily statistics.' };
  }
};
