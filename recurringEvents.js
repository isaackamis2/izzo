const cron = require('node-cron');
const Event = require('../models/Event');

const scheduleRecurringEvents = () => {
  // Run every day at midnight server time (00:00)
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Checking for expired recurring events...');
    try {
      const now = new Date();
      
      const expiredRecurringEvents = await Event.find({
        date: { $lt: now },
        recurringFrequency: { $in: ['daily', 'weekly', 'monthly', 'yearly'] }
      });

      if (expiredRecurringEvents.length === 0) {
        console.log('[Cron] No expired recurring events found.');
        return;
      }

      console.log(`[Cron] Found ${expiredRecurringEvents.length} events to clone.`);

      for (const event of expiredRecurringEvents) {
        const newDate = new Date(event.date);
        let newEndDate = event.endDate ? new Date(event.endDate) : null;
        
        // Advance the date until it is in the future
        while (newDate < now) {
            switch (event.recurringFrequency) {
              case 'daily': 
                newDate.setDate(newDate.getDate() + 1); 
                if (newEndDate) newEndDate.setDate(newEndDate.getDate() + 1); 
                break;
              case 'weekly': 
                newDate.setDate(newDate.getDate() + 7); 
                if (newEndDate) newEndDate.setDate(newEndDate.getDate() + 7); 
                break;
              case 'monthly': 
                newDate.setMonth(newDate.getMonth() + 1); 
                if (newEndDate) newEndDate.setMonth(newEndDate.getMonth() + 1); 
                break;
              case 'yearly': 
                newDate.setFullYear(newDate.getFullYear() + 1); 
                if (newEndDate) newEndDate.setFullYear(newEndDate.getFullYear() + 1); 
                break;
            }
        }

        // Clone the event
        const newEvent = new Event({
          title: event.title,
          description: event.description,
          category: event.category,
          venue: event.venue,
          organizerName: event.organizerName,
          date: newDate,
          endDate: newEndDate,
          recurringFrequency: event.recurringFrequency,
          price: event.price,
          maxCapacity: event.maxCapacity,
          currentCapacity: event.maxCapacity, // Reset capacity for the new instance
          bannerImage: event.bannerImage,
          manager: event.manager,
          isFeatured: event.isFeatured,
          isTicketed: event.isTicketed,
          ticketTiers: event.ticketTiers,
          priceRange: event.priceRange,
          externalTicketLink: event.externalTicketLink
        });

        await newEvent.save();
        console.log(`[Cron] Cloned event ${event._id} -> ${newEvent._id} (New Date: ${newDate.toISOString()})`);

        // Deactivate recurrence on the old event so it isn't cloned again
        event.recurringFrequency = 'none';
        await event.save();
      }
    } catch (error) {
      console.error('[Cron Error] Failed to process recurring events:', error);
    }
  });
};

module.exports = scheduleRecurringEvents;
