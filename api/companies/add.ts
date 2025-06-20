import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import validator from 'validator';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, website, email, phone, address, category } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    // Validate email if provided
    if (email && !validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Validate website if provided
    if (website && !validator.isURL(website, { require_protocol: true })) {
      return res.status(400).json({ error: 'Invalid website URL' });
    }

    // Check if company already exists
    const { data: existing } = await supabase
      .from('companies')
      .select('id')
      .or(`name.eq.${name},email.eq.${email || 'null'},website.eq.${website || 'null'}`)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Company already exists' });
    }

    // Insert new company
    const { data, error } = await supabase
      .from('companies')
      .insert({
        name: name.trim(),
        website: website?.trim() || null,
        email: email?.trim().toLowerCase() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        category: category?.trim() || null,
        scraped_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json({
      success: true,
      company: data
    });

  } catch (error) {
    console.error('Error in companies/add:', error);
    res.status(500).json({ 
      error: 'Failed to add company',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}