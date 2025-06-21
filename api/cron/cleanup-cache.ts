import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is a cron request
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const results = {
      expired_entries_deleted: 0,
      total_cache_size: 0,
      cleanup_completed_at: new Date().toISOString()
    };

    // Delete expired cache entries
    const { data: expiredEntries, error: selectError } = await supabase
      .from('business_cache')
      .select('id')
      .lt('expires_at', new Date().toISOString());

    if (selectError) {
      throw selectError;
    }

    if (expiredEntries && expiredEntries.length > 0) {
      const { error: deleteError } = await supabase
        .from('business_cache')
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (deleteError) {
        throw deleteError;
      }

      results.expired_entries_deleted = expiredEntries.length;
    }

    // Get current cache statistics
    const { count: totalCacheCount, error: countError } = await supabase
      .from('business_cache')
      .select('*', { count: 'exact', head: true });

    if (!countError) {
      results.total_cache_size = totalCacheCount || 0;
    }

    // Optional: Clean up very old entries even if not expired (90+ days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { error: oldDeleteError } = await supabase
      .from('business_cache')
      .delete()
      .lt('created_at', ninetyDaysAgo.toISOString());

    if (oldDeleteError) {
      console.warn('Error cleaning up old cache entries:', oldDeleteError);
    }

    res.status(200).json({
      success: true,
      message: 'Cache cleanup completed successfully',
      results
    });

  } catch (error) {
    console.error('Error in cache cleanup:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}