#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { GmailService } from '../services/gmail-service';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage: npm run send-emails -- <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  check-replies <account_id>  - Check for replies in Gmail');
    console.log('  follow-ups                  - Process scheduled follow-ups');
    console.log('  campaign-stats [campaign_id] - Get campaign statistics');
    process.exit(1);
  }

  try {
    const gmailService = new GmailService();

    switch (command) {
      case 'check-replies':
        const accountId = args[1];
        if (!accountId) {
          console.log('❌ Account ID is required for check-replies command');
          process.exit(1);
        }
        
        console.log(`📬 Checking for replies in account: ${accountId}`);
        await gmailService.checkForReplies(accountId);
        console.log('✅ Reply check completed');
        break;

      case 'follow-ups':
        console.log('📅 Processing scheduled follow-ups...');
        await gmailService.processFollowUps();
        console.log('✅ Follow-ups processed');
        break;

      case 'campaign-stats':
        const campaignId = args[1];
        console.log(`📊 Getting campaign statistics${campaignId ? ` for campaign: ${campaignId}` : ' (all campaigns)'}`);
        
        const stats = await gmailService.getCampaignStats(campaignId);
        
        console.log('\n📈 Campaign Statistics:');
        console.log(`- Total emails: ${stats.totalEmails}`);
        console.log(`- Emails sent: ${stats.sent}`);
        console.log(`- Responses received: ${stats.responses}`);
        console.log(`- Pending emails: ${stats.pending}`);
        console.log(`- Total follow-ups sent: ${stats.followUps}`);
        console.log(`- Response rate: ${stats.responseRate}%`);
        break;

      default:
        console.log(`❌ Unknown command: ${command}`);
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();