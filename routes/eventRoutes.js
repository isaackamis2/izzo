const express = require('express');
const Event = require('../models/Event');
const User = require('../models/User');
const router = express.Router();

// GET all events
router.get('/', async (req, res) => {
  try {
    const { category, isFeatured, upcoming, limit } = req.query;
    let query = {};
    
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
    const safeDesc = event.description.substring(0, 150).replace(/"/g, '&quot;') + '...';

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${event.title} | IzzoEvents</title>
        <meta name="description" content="${safeDesc}">
        
        <meta property="og:type" content="website">
        <meta property="og:url" content="${eventUrl}">
        <meta property="og:title" content="${event.title}">
        <meta property="og:description" content="${safeDesc}">
        <meta property="og:image" content="${event.bannerImage}">

        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:url" content="${eventUrl}">
        <meta name="twitter:title" content="${event.title}">
        <meta name="twitter:description" content="${safeDesc}">
        <meta name="twitter:image" content="${event.bannerImage}">

        <script>
          window.location.href = "${eventUrl}";
        </script>
      </head>
      <body>
        <p>Redirecting to <a href="${eventUrl}">${event.title}</a>...</p>
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
    const { title, description, category, venue, date, price, maxCapacity, manager, bannerImage, isFeatured, isTicketed, ticketTiers } = req.body;
    
    // Admin check for isFeatured
    let finalIsFeatured = false;
    if (isFeatured) {
      const user = await User.findById(manager);
      if (user && user.role === 'Admin') finalIsFeatured = true;
    }

    const newEvent = new Event({
      title, description, category, venue, date, price,
      maxCapacity, currentCapacity: parseInt(maxCapacity), manager,
      bannerImage: bannerImage || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
      isFeatured: finalIsFeatured,
      isTicketed,
      ticketTiers
    });
    await newEvent.save();
    res.status(201).json(newEvent);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT update event
router.put('/:id', async (req, res) => {
  try {
    const { title, description, category, venue, date, price, maxCapacity, bannerImage, isFeatured, manager, isTicketed, ticketTiers } = req.body;
    
    // Admin check for isFeatured
    let finalIsFeatured = false;
    if (isFeatured) {
      const user = await User.findById(manager);
      if (user && user.role === 'Admin') finalIsFeatured = true;
    }

    const updated = await Event.findByIdAndUpdate(
      req.params.id,
      { title, description, category, venue, date, price, maxCapacity, bannerImage, isFeatured: finalIsFeatured, isTicketed, ticketTiers },
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
