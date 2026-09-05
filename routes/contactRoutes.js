const express = require('express');
const router = express.Router();
const ContactMessage = require('../models/ContactMessage');
const { protect } = require('../middleware/authMiddleware');
const { notifyNewContactMessage, sendContactReplyEmail } = require('../utils/mailer');

// POST /api/contact - Submit new contact form inquiry (Public)
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, subject, category, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: 'Please provide name, email, subject, and message.' });
    }

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const newContact = await ContactMessage.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : '',
      subject: subject.trim(),
      category: category || 'General Inquiry',
      message: message.trim(),
      ipAddress: String(ipAddress),
      userAgent: String(userAgent)
    });

    // Notify Admin via email in the background
    notifyNewContactMessage(newContact).catch(err => console.error('[Contact] Error sending admin notification:', err));

    res.status(201).json({
      success: true,
      message: 'Thank you for reaching out! Your message has been received. Our team will get back to you shortly.',
      inquiryId: newContact._id
    });
  } catch (error) {
    console.error('[Contact] Submission error:', error);
    res.status(500).json({ message: 'Failed to submit contact message. Please try again later.' });
  }
});

// GET /api/contact - List contact messages (Admin/Manager only)
router.get('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { status, search, limit = 50, page = 1 } = req.query;
    let query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { subject: { $regex: q, $options: 'i' } },
        { message: { $regex: q, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const messages = await ContactMessage.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ContactMessage.countDocuments(query);
    const newCount = await ContactMessage.countDocuments({ status: 'New' });
    const readCount = await ContactMessage.countDocuments({ status: 'Read' });
    const repliedCount = await ContactMessage.countDocuments({ status: 'Replied' });
    const archivedCount = await ContactMessage.countDocuments({ status: 'Archived' });

    res.json({
      messages,
      total,
      stats: {
        totalAll: newCount + readCount + repliedCount + archivedCount,
        new: newCount,
        read: readCount,
        replied: repliedCount,
        archived: archivedCount
      }
    });
  } catch (error) {
    console.error('[Contact] Fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch contact messages' });
  }
});

// PATCH /api/contact/:id - Update message status or notes (Admin/Manager)
router.patch('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { status, adminNotes } = req.body;
    const updateData = {};
    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;

    const message = await ContactMessage.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!message) return res.status(404).json({ message: 'Message not found' });

    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/contact/:id/reply - Send an email reply directly from dashboard
router.post('/:id/reply', protect, async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { replyText } = req.body;
    if (!replyText || !replyText.trim()) {
      return res.status(400).json({ message: 'Reply text cannot be empty.' });
    }

    const contactMsg = await ContactMessage.findById(req.params.id);
    if (!contactMsg) return res.status(404).json({ message: 'Message not found' });

    // Send email to user
    await sendContactReplyEmail(contactMsg.email, contactMsg.name, contactMsg.subject, replyText.trim());

    // Update status and history
    contactMsg.status = 'Replied';
    contactMsg.replyHistory.push({
      repliedBy: req.user.name || 'Admin',
      replyText: replyText.trim(),
      repliedAt: new Date()
    });

    await contactMsg.save();

    res.json({
      success: true,
      message: 'Reply sent successfully to ' + contactMsg.email,
      contactMessage: contactMsg
    });
  } catch (error) {
    console.error('[Contact] Reply error:', error);
    res.status(500).json({ message: error.message || 'Failed to send reply' });
  }
});

// DELETE /api/contact/:id - Delete message
router.delete('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const deleted = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Message not found' });
    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
