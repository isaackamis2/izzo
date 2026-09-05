const express = require('express');
const Event = require('../models/Event');
const User = require('../models/User');
const { postEventToTwitter } = require('../utils/twitter');
const { postEventToInstagram } = require('../utils/instagram');
const router = express.Router();

// GET all events
router.get('/', async (req, res) => {
  try {
    const { category, isFeatured, upcoming, limit, status } = req.query;
    let query = {};
    
    if (status) {
      if (status !== 'all') query.status = status;
    } else {
      // By default, public API only returns published events
      query.status = { $nin: ['Pending_Moderation', 'Rejected'] };
    }

    if (category) query.category = category;
    if (isFeatured === 'true') query.isFeatured = true;
    if (upcoming === 'true') query.date = { $gte: new Date() };

    let dbQuery = Event.find(query).populate('manager', 'name');
    
    if (upcoming === 'true') dbQuery = dbQuery.sort({ date: 1 });
    else dbQuery = dbQuery.sort({ createdAt: -1 });

    if (limit) dbQuery = dbQuery.limit(parseInt(limit));

    const events = await dbQuery;
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single event
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('manager', 'name');
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET social share proxy for single event
router.get('/share/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).send('Event not found');

    const frontendBase = req.query.frontend || 'https://izzoevents.com';
    const eventUrl = `${frontendBase}/events/${event._id}`;
    const safeTitle = (event.title || 'Event').replace(/"/g, '&quot;');
    const safeDesc = (event.description || '').substring(0, 160).replace(/"/g, '&quot;').replace(/\n|\r/g, ' ') + '...';
    const safeImage = event.bannerImage || 'https://izzoevents.com/favicon.jpg';
    const safeVenue = (event.venue || 'Kigali, Rwanda').replace(/"/g, '&quot;');
    const isoDate = event.date ? new Date(event.date).toISOString() : new Date().toISOString();

    const eventJsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Event",
      "name": event.title,
      "description": safeDesc,
      "image": [safeImage],
      "startDate": isoDate,
      "location": {
        "@type": "Place",
        "name": event.venue || "Kigali",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Kigali",
          "addressCountry": "RW"
        },
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": -1.9441,
          "longitude": 30.0619
        }
      },
      "organizer": {
        "@type": "Organization",
        "name": event.organizerName || "IzzoEvents",
        "url": frontendBase
      }
    });

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${safeTitle} | IzzoEvents Kigali</title>
        <meta name="description" content="${safeDesc}">
        <link rel="canonical" href="${eventUrl}">

        <!-- 🇷🇼 GEO Targeting -->
        <meta name="geo.region" content="RW-01">
        <meta name="geo.placename" content="Kigali, Rwanda">
        <meta name="geo.position" content="-1.9441;30.0619">
        <meta name="ICBM" content="-1.9441, 30.0619">
        
        <!-- OpenGraph -->
        <meta property="og:type" content="event">
        <meta property="og:locale" content="en_RW">
        <meta property="og:site_name" content="IzzoEvents">
        <meta property="og:url" content="${eventUrl}">
        <meta property="og:title" content="${safeTitle} | IzzoEvents Kigali">
        <meta property="og:description" content="${safeDesc}">
        <meta property="og:image" content="${safeImage}">

        <!-- Twitter Card -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:site" content="@izzoevents">
        <meta name="twitter:domain" content="izzoevents.com">
        <meta name="twitter:title" content="${safeTitle} | Kigali, Rwanda">
        <meta name="twitter:description" content="${safeDesc}">
        <meta name="twitter:image" content="${safeImage}">

        <!-- Schema.org Event -->
        <script type="application/ld+json">
          ${eventJsonLd}
        </script>

        <script>
          window.location.href = "${eventUrl}";
        </script>
      </head>
      <body>
        <p>Redirecting to <a href="${eventUrl}">${safeTitle}</a>...</p>
      </body>
      </html>
    `;
    res.send(html);
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// POST new event
router.post('/', async (req, res) => {
  try {
    const { title, description, category, venue, organizerName, date, endDate, recurringFrequency, price, maxCapacity, manager, bannerImage, isFeatured, isTicketed, ticketTiers, priceRange, externalTicketLink } = req.body;
    
    // Admin check for isFeatured
    let finalIsFeatured = false;
    if (isFeatured) {
      const user = await User.findById(manager);
      if (user && user.role === 'Admin') finalIsFeatured = true;
    }

    const newEvent = new Event({
      title, description, category, venue, organizerName, date, endDate, recurringFrequency, price,
      maxCapacity, currentCapacity: parseInt(maxCapacity), manager,
      bannerImage: bannerImage || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
      isFeatured: finalIsFeatured,
      isTicketed,
      ticketTiers, priceRange, externalTicketLink
    });
    await newEvent.save();
    
    // Asynchronously cross-post to Twitter and Instagram
    postEventToTwitter(newEvent).catch(err => console.error('[Twitter AutoPost Error]:', err));
    postEventToInstagram(newEvent).catch(err => console.error('[Instagram AutoPost Error]:', err));
    
    res.status(201).json(newEvent);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT update event
router.put('/:id', async (req, res) => {
  try {
    const { title, description, category, venue, organizerName, date, endDate, recurringFrequency, price, maxCapacity, bannerImage, isFeatured, manager, isTicketed, ticketTiers, priceRange, externalTicketLink } = req.body;
    
    // Admin check for isFeatured
    let finalIsFeatured = false;
    if (isFeatured) {
      const user = await User.findById(manager);
      if (user && user.role === 'Admin') finalIsFeatured = true;
    }

    const updated = await Event.findByIdAndUpdate(
      req.params.id,
      { title, description, category, venue, organizerName, date, endDate, recurringFrequency, price, maxCapacity, bannerImage, isFeatured: finalIsFeatured, isTicketed, ticketTiers, priceRange, externalTicketLink },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Event not found' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE event
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Event.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
