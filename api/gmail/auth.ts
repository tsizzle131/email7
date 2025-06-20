import { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { supabase } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { auth_code } = req.body;

    if (!auth_code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
      return res.status(400).json({ 
        error: 'Google OAuth credentials not configured',
        note: 'Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to environment variables'
      });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Get tokens from authorization code
    const { tokens } = await oauth2Client.getToken(auth_code);
    oauth2Client.setCredentials(tokens);

    // Get user info to get email address
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    
    const emailAddress = profile.data.emailAddress!;
    const accountName = emailAddress.split('@')[0];

    // Save to database
    const { data, error } = await supabase
      .from('email_accounts')
      .upsert({
        email: emailAddress,
        oauth_tokens: tokens,
        account_name: accountName,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      account: {
        id: data.id,
        email: data.email,
        account_name: data.account_name,
        status: data.status
      }
    });

  } catch (error) {
    console.error('Error in gmail/auth:', error);
    res.status(500).json({ 
      error: 'Failed to authenticate Gmail account',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}