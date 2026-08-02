const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, async (req, res) => {
  try {
    // Only Admin or Manager can access
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const totalUsers = await User.countDocuments();
    const totalEvents = await Event.countDocuments();
    
    // Aggregate Total Revenue
    const revenueAggregation = await Registration.aggregate([
      { $match: { status: 'Registered' } },
      { $group: { _id: null, totalRevenue: { $sum: '$amountPaid' }, totalTicketsSold: { $sum: 1 } } }
    ]);
    
    const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].totalRevenue : 0;
    const totalTicketsSold = revenueAggregation.length > 0 ? revenueAggregation[0].totalTicketsSold : 0;

    // Monthly Revenue for Charts
    const monthlyRevenue = await Registration.aggregate([
      { $match: { status: 'Registered' } },
      { 
        $group: { 
          _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, 
          revenue: { $sum: '$amountPaid' } 
        } 
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const chartData = monthlyRevenue.map(data => {
      const date = new Date(data._id.year, data._id.month - 1, 1);
      const monthName = date.toLocaleString('default', { month: 'short' });
      return {
        name: monthName,
        revenue: data.revenue
      };
    });

    res.json({
      totalUsers,
      totalEvents,
      totalRevenue,
      totalTicketsSold,
      chartData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
