const cron = require('node-cron');
const { importAllExternalEvents } = require('../utils/eventAggregator');
const { notifyModerationBatch } = require('../utils/mailer');

const scheduleScraperCron = () => {
  // Run every 6 hours: at 00:00, 06:00, 12:00, 18:00
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Autopilot Scraper] Running scheduled Kigali multi-platform event crawl...');
    try {
      const result = await importAllExternalEvents();
      if (result && result.newImported > 0) {
        console.log(`[Autopilot Scraper] ${result.newImported} new events queued. Notifying admin...`);
        await notifyModerationBatch(result.newImported, result.importedEvents);
      } else {
        console.log('[Autopilot Scraper] Crawl completed. No new events to queue.');
      }
    } catch (err) {
      console.error('[Autopilot Scraper Error]:', err.message);
    }
  });
  console.log('[Cron] Autopilot Kigali event scraper scheduled (runs every 6 hours).');
};

module.exports = scheduleScraperCron;
