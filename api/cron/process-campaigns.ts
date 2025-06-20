import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is a cron request
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const results = {
      campaigns_processed: 0,
      threads_updated: 0,
      analytics_updated: 0,
      errors: 0,
      details: [] as any[]
    };

    // 1. Update campaign statistics
    const { data: campaigns, error: campaignsError } = await supabase
      .from('email_campaigns')
      .select(`
        id,
        name,
        status,
        created_at
      `)
      .in('status', ['active', 'paused']);

    if (campaignsError) {
      throw campaignsError;
    }

    for (const campaign of campaigns || []) {
      try {
        // Calculate campaign metrics
        const { data: threads } = await supabase
          .from('email_threads')
          .select('sent_at, conversation_status, follow_up_count')
          .eq('campaign_id', campaign.id);

        if (threads) {
          const sent = threads.filter(t => t.sent_at).length;
          const pending = threads.filter(t => t.conversation_status === 'pending').length;
          const responded = threads.filter(t => t.conversation_status === 'responded').length;
          const bounced = threads.filter(t => t.conversation_status === 'bounced').length;

          // Update campaign metrics
          await supabase
            .from('email_campaigns')
            .update({
              emails_sent: sent,
              responses_received: responded,
              bounce_rate: sent > 0 ? (bounced / sent * 100) : 0,
              response_rate: sent > 0 ? (responded / sent * 100) : 0,
              updated_at: new Date().toISOString()
            })
            .eq('id', campaign.id);

          results.campaigns_processed++;
        }

      } catch (campaignError) {
        results.errors++;
        results.details.push({
          type: 'campaign_processing',
          campaign_id: campaign.id,
          error: campaignError instanceof Error ? campaignError.message : 'Unknown error'
        });
      }
    }

    // 2. Clean up old threads (mark as completed after 6 weeks with no response)
    const sixWeeksAgo = new Date();
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);

    const { data: oldThreads, error: oldThreadsError } = await supabase
      .from('email_threads')
      .update({
        conversation_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .lt('created_at', sixWeeksAgo.toISOString())
      .eq('conversation_status', 'pending')
      .gte('follow_up_count', 6)
      .select('id');

    if (!oldThreadsError && oldThreads) {
      results.threads_updated = oldThreads.length;
    }

    // 3. Update daily analytics
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's stats
    const { data: todayStats } = await supabase
      .from('email_threads')
      .select('sent_at, conversation_status')
      .gte('sent_at', `${today}T00:00:00.000Z`)
      .lt('sent_at', `${today}T23:59:59.999Z`);

    if (todayStats) {
      const dailyStats = {
        date: today,
        emails_sent: todayStats.length,
        responses_received: todayStats.filter(t => t.conversation_status === 'responded').length,
        bounces: todayStats.filter(t => t.conversation_status === 'bounced').length
      };

      // Upsert daily analytics
      await supabase
        .from('analytics')
        .upsert({
          ...dailyStats,
          updated_at: new Date().toISOString()
        });

      results.analytics_updated = 1;
    }

    // 4. Archive completed campaigns
    const { data: completedCampaigns } = await supabase
      .from('email_campaigns')
      .select(`
        id,
        name,
        created_at,
        email_threads!inner(conversation_status)
      `)
      .eq('status', 'active');

    for (const campaign of completedCampaigns || []) {
      // Check if all threads are completed or 8 weeks old
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
      
      const isOld = new Date(campaign.created_at) < eightWeeksAgo;
      
      if (isOld) {
        await supabase
          .from('email_campaigns')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', campaign.id);

        results.details.push({
          type: 'campaign_archived',
          campaign_id: campaign.id,
          reason: 'aged_out'
        });
      }
    }

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    });

  } catch (error) {
    console.error('Error in cron/process-campaigns:', error);
    res.status(500).json({ 
      error: 'Failed to process campaigns',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}