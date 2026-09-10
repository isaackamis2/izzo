const express = require('express');
const Event = require('../models/Event');
const { importAllExternalEvents } = require('../utils/eventAggregator');
const { postEventToTwitter } = require('../utils/twitter');
const { postEventToInstagram } = require('../utils/instagram');
const router = express.Router();

// GET all events in moderation queue
router.get('/pending', async (req, res) => {
  try {
    const { platform } = req.query;
    let query = { status: 'Pending_Moderation' };
    if (platform && platform !== 'all') {
      if (platform === 'instagram') {
        query.sourcePlatform = /instagram/i;
      } else {
        query.sourcePlatform = platform;
      }
    }
    const events = await Event.find(query).sort({ importedAt: -1, createdAt: -1 });
    const count = await Event.countDocuments({ status: 'Pending_Moderation' });
    
    // Stats by platform
    const bkCount = await Event.countDocuments({ status: 'Pending_Moderation', sourcePlatform: 'bkarena.rw' });
    const sincCount = await Event.countDocuments({ status: 'Pending_Moderation', sourcePlatform: 'sinc.events' });
    const bashCount = await Event.countDocuments({ status: 'Pending_Moderation', sourcePlatform: 'eventsbash.rw' });
    const ebCount = await Event.countDocuments({ status: 'Pending_Moderation', sourcePlatform: 'eventbrite.com' });
    const aeCount = await Event.countDocuments({ status: 'Pending_Moderation', sourcePlatform: 'allevents.in' });
    const instaCount = await Event.countDocuments({ status: 'Pending_Moderation', sourcePlatform: /instagram/i });

    res.json({
      totalPending: count,
      stats: { bkArena: bkCount, sinc: sincCount, eventsBash: bashCount, eventbrite: ebCount, allEvents: aeCount, instagram: instaCount },
      events
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch moderation queue', error: error.message });
  }
});

// POST sync / scrape live Rwanda events
router.post('/sync', async (req, res) => {
  try {
    const result = await importAllExternalEvents();
    res.json({
      message: `Sync complete! Imported ${result.newImported} new event(s).`,
      result
    });
  } catch (error) {
    res.status(500).json({ message: 'Scraping / sync failed', error: error.message });
  }
});

// PUT approve single event
router.put('/:id/approve', async (req, res) => {
  try {
    const { autoPostSocial = true } = req.body;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    event.status = 'Published';
    await event.save();

    // Cross-post to Twitter and Instagram if enabled
    if (autoPostSocial) {
      postEventToTwitter(event).catch(err => console.error('[Twitter AutoPost Error]:', err));
      postEventToInstagram(event).catch(err => console.error('[Instagram AutoPost Error]:', err));
    }

    res.json({ message: 'Event approved and published live!', event });
  } catch (error) {
    res.status(500).json({ message: 'Failed to approve event', error: error.message });
  }
});

// PUT edit and approve in one step
router.put('/:id/edit-and-publish', async (req, res) => {
  try {
    const { 
      title, description, category, venue, organizerName, date, endDate, 
      price, bannerImage, isFeatured, isTicketed, ticketTiers, priceRange, externalTicketLink,
      autoPostSocial = true 
    } = req.body;

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (title !== undefined) event.title = title;
    if (description !== undefined) event.description = description;
    if (category !== undefined) event.category = category;
    if (venue !== undefined) event.venue = venue;
    if (organizerName !== undefined) event.organizerName = organizerName;
    if (date !== undefined) event.date = date;
    if (endDate !== undefined) event.endDate = endDate;
    if (price !== undefined) event.price = price;
    if (bannerImage !== undefined) event.bannerImage = bannerImage;
    if (isFeatured !== undefined) event.isFeatured = isFeatured;
    if (isTicketed !== undefined) event.isTicketed = isTicketed;
    if (ticketTiers !== undefined) event.ticketTiers = ticketTiers;
    if (priceRange !== undefined) event.priceRange = priceRange;
    if (externalTicketLink !== undefined) event.externalTicketLink = externalTicketLink;

    event.status = 'Published';
    await event.save();

    if (autoPostSocial) {
      postEventToTwitter(event).catch(err => console.error('[Twitter AutoPost Error]:', err));
      postEventToInstagram(event).catch(err => console.error('[Instagram AutoPost Error]:', err));
    }

    res.json({ message: 'Event updated and published live!', event });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update and publish event', error: error.message });
  }
});

// PUT reject single event
router.put('/:id/reject', async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status: 'Rejected' },
      { new: true }
    );
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'Event rejected', event });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reject event', error: error.message });
  }
});

// POST approve all pending events
router.post('/approve-all', async (req, res) => {
  try {
    const result = await Event.updateMany(
      { status: 'Pending_Moderation' },
      { $set: { status: 'Published' } }
    );
    res.json({ message: `Approved all ${result.modifiedCount} pending events!`, modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: 'Failed to approve all events', error: error.message });
  }
});

// DELETE remove event from moderation
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Event.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'Event removed' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete event', error: error.message });
  }
});

module.exports = router;
