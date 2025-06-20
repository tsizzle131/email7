import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import OpenAI from 'openai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { batch_size = 5, company_id } = req.body;
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ 
        error: 'OpenAI API key not configured',
        note: 'Add OPENAI_API_KEY to environment variables'
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    let query = supabase
      .from('companies')
      .select('*')
      .not('scraped_content', 'is', null)
      .is('enriched_data', null)
      .not('email', 'is', null);

    if (company_id) {
      query = query.eq('id', company_id);
    } else {
      query = query.limit(batch_size);
    }

    const { data: companies, error } = await query;

    if (error) {
      throw error;
    }

    if (!companies || companies.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No companies found for enrichment',
        stats: {
          processed: 0,
          enriched: 0,
          errors: 0
        }
      });
    }

    let processed = 0;
    let enriched = 0;
    let errors = 0;
    let totalCost = 0;

    for (const company of companies) {
      try {
        processed++;
        
        // Parse scraped content
        let scrapedContent = '';
        try {
          const parsed = JSON.parse(company.scraped_content || '{}');
          scrapedContent = parsed.content || '';
        } catch {
          scrapedContent = company.scraped_content || '';
        }

        if (scrapedContent.length < 50) {
          errors++;
          continue;
        }

        // Create enrichment prompt
        const prompt = `Analyze this company and provide structured insights:

Company: ${company.name}
Website: ${company.website}
Location: ${company.address || 'Unknown'}
Content: ${scrapedContent.substring(0, 1500)}

Return JSON with these fields (keep responses brief):
{
  "industry": "primary industry/sector",
  "company_size": "estimate (1-10, 11-50, 51-200, 200+)",
  "services": ["key service 1", "key service 2", "key service 3"],
  "pain_points": ["potential pain point 1", "potential pain point 2"],
  "key_personnel": ["key person/role if mentioned"],
  "summary": "2-sentence company summary",
  "target_persona": "likely decision maker role/title"
}`;

        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a business analyst. Analyze the provided company information and return structured data in JSON format. Be concise and focus on actionable insights.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 500,
          temperature: 0.3
        });

        // Calculate cost (rough estimate)
        const inputTokens = prompt.length / 4;
        const outputTokens = response.choices[0].message.content?.length || 0 / 4;
        const cost = (inputTokens * 0.0015 + outputTokens * 0.002) / 1000;
        totalCost += cost;

        // Parse response
        const content = response.choices[0].message.content;
        let enrichedData = null;

        if (content) {
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              enrichedData = JSON.parse(jsonMatch[0]);
            }
          } catch (parseError) {
            console.error('Error parsing OpenAI response:', parseError);
          }
        }

        if (enrichedData) {
          // Update company with enriched data
          const { error: updateError } = await supabase
            .from('companies')
            .update({
              enriched_data: enrichedData,
              enriched_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', company.id);

          if (!updateError) {
            enriched++;
          } else {
            errors++;
          }
        } else {
          errors++;
        }

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (companyError) {
        console.error(`Error processing company ${company.name}:`, companyError);
        errors++;
      }
    }

    res.status(200).json({
      success: true,
      stats: {
        processed,
        enriched,
        errors,
        totalCost: totalCost.toFixed(4),
        avgCostPerCompany: processed > 0 ? (totalCost / processed).toFixed(4) : '0'
      }
    });

  } catch (error) {
    console.error('Error in enrich/companies:', error);
    res.status(500).json({ error: 'Failed to enrich companies' });
  }
}