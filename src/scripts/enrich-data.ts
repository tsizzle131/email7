#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { DataEnrichmentService } from '../services/data-enrichment';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const batchSize = args[0] ? parseInt(args[0]) : 10;

  console.log('🧠 Starting data enrichment...');
  console.log(`Batch size: ${batchSize}`);

  try {
    const enrichmentService = new DataEnrichmentService();

    // Get initial stats
    const initialStats = await enrichmentService.getEnrichmentStats();
    console.log('\n📊 Initial Statistics:');
    console.log(`- Eligible companies: ${initialStats.eligible}`);
    console.log(`- Already enriched: ${initialStats.enriched}`);
    console.log(`- Pending enrichment: ${initialStats.pending}`);
    console.log(`- Current enrichment rate: ${initialStats.enrichmentRate}%`);

    if (initialStats.pending === 0) {
      console.log('✅ All eligible companies are already enriched!');
      return;
    }

    // Start enrichment
    console.log('\n🔄 Starting enrichment process...');
    await enrichmentService.enrichCompanyData(batchSize);

    // Get final stats
    const finalStats = await enrichmentService.getEnrichmentStats();
    console.log('\n📊 Final Statistics:');
    console.log(`- Eligible companies: ${finalStats.eligible}`);
    console.log(`- Enriched companies: ${finalStats.enriched}`);
    console.log(`- Pending enrichment: ${finalStats.pending}`);
    console.log(`- Enrichment rate: ${finalStats.enrichmentRate}%`);
    console.log(`- Total tokens used: ${finalStats.costTracker.totalTokensUsed}`);
    console.log(`- Total cost: $${finalStats.costTracker.totalCost.toFixed(4)}`);
    console.log(`- Average cost per company: $${finalStats.estimatedCostPerCompany}`);
    console.log(`- Requests made: ${finalStats.costTracker.requestCount}`);

    const enrichedThisRun = finalStats.enriched - initialStats.enriched;
    console.log(`\n✅ Enriched ${enrichedThisRun} companies in this run!`);

    // Cost analysis
    if (finalStats.costTracker.totalCost > 0) {
      const costPerEnriched = finalStats.costTracker.totalCost / enrichedThisRun;
      console.log(`\n💰 Cost Analysis:`);
      console.log(`- Cost this run: $${finalStats.costTracker.totalCost.toFixed(4)}`);
      console.log(`- Cost per enriched company: $${costPerEnriched.toFixed(4)}`);
      
      if (costPerEnriched > 0.10) {
        console.log('⚠️  Warning: Cost per company is above $0.10 threshold');
      }
    }

  } catch (error) {
    console.error('❌ Error during enrichment:', error);
    process.exit(1);
  }
}

main();