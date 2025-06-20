import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import validator from 'validator';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return handleList(req, res);
  } else if (req.method === 'POST') {
    return handleAdd(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  try {
    const { 
      page = '1', 
      limit = '50', 
      search, 
      category, 
      has_email,
      enriched 
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100); // Max 100 per page
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('companies')
      .select(`
        id,
        name,
        website,
        email,
        phone,
        address,
        category,
        rating,
        enriched_data,
        scraped_at,
        enriched_at,
        created_at
      `, { count: 'exact' });

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,website.ilike.%${search}%`);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (has_email === 'true') {
      query = query.not('email', 'is', null);
    } else if (has_email === 'false') {
      query = query.is('email', null);
    }

    if (enriched === 'true') {
      query = query.not('enriched_data', 'is', null);
    } else if (enriched === 'false') {
      query = query.is('enriched_data', null);
    }

    // Apply pagination and ordering
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      throw error;
    }

    // Calculate pagination info
    const totalPages = Math.ceil((count || 0) / limitNum);

    res.status(200).json({
      success: true,
      companies: data || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (error) {
    console.error('Error in companies list:', error);
    res.status(500).json({ 
      error: 'Failed to fetch companies',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleAdd(req: VercelRequest, res: VercelResponse) {
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
    console.error('Error in companies add:', error);
    res.status(500).json({ 
      error: 'Failed to add company',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}