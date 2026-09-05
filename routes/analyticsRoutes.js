const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const User = require('../models/User');
const VisitorLog = require('../models/VisitorLog');
const { protect } = require('../middleware/authMiddleware');

// POST /api/analytics/track - Record a visitor pageview or app screen view (Public)
router.post('/track', async (req, res) => {
  try {
    const { 
      visitorId, 
      path = '/', 
      pageTitle = '', 
      eventId = null, 
      platform = 'web', 
      device = 'unknown', 
      browser = 'Other', 
      os = 'Other', 
      referrer = 'Direct',
      country = 'Rwanda',
      city = 'Kigali'
    } = req.body;

    if (!visitorId) {
      return res.status(400).json({ message: 'visitorId required' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const now = new Date();
    const sessionDate = now.toISOString().split('T')[0];

    // Fire and forget insert
    await VisitorLog.create({
      visitorId: String(visitorId).substring(0, 100),
      path: String(path).substring(0, 255),
      pageTitle: String(pageTitle).substring(0, 255),
      eventId: eventId || null,
      platform: ['web', 'ios', 'android'].includes(platform) ? platform : 'web',
      device: ['mobile', 'desktop', 'tablet'].includes(device) ? device : 'unknown',
      browser: String(browser).substring(0, 50),
      os: String(os).substring(0, 50),
      ip: String(ip).substring(0, 60),
      country: String(country).substring(0, 60),
      city: String(city).substring(0, 60),
      referrer: String(referrer).substring(0, 100),
      sessionDate
    });

    res.status(200).json({ success: true });
  } catch (err) {
    // Analytics should not crash or error visibly to client
    res.status(200).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/traffic - Detailed visitor & traffic analytics (Admin/Manager)
router.get('/traffic', protect, async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Total Metrics
    const totalViews = await VisitorLog.countDocuments();
    const totalVisitorsAgg = await VisitorLog.distinct('visitorId');
    const totalUniqueVisitors = totalVisitorsAgg.length;

    // Today's metrics
    const todayViews = await VisitorLog.countDocuments({ sessionDate: todayStr });
    const todayVisitorsAgg = await VisitorLog.distinct('visitorId', { sessionDate: todayStr });
    const todayUniqueVisitors = todayVisitorsAgg.length;

    // Last 7 days metrics
    const weekViews = await VisitorLog.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
    const weekVisitorsAgg = await VisitorLog.distinct('visitorId', { createdAt: { $gte: sevenDaysAgo } });
    const weekUniqueVisitors = weekVisitorsAgg.length;

    // Last 30 days metrics
    const monthViews = await VisitorLog.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    const monthVisitorsAgg = await VisitorLog.distinct('visitorId', { createdAt: { $gte: thirtyDaysAgo } });
    const monthUniqueVisitors = monthVisitorsAgg.length;

    // 2. Daily Trends for the past 14 days
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const dailyViewsAgg = await VisitorLog.aggregate([
      { $match: { createdAt: { $gte: fourteenDaysAgo } } },
      {
        $group: {
          _id: '$sessionDate',
          pageViews: { $sum: 1 },
          visitors: { $addToSet: '$visitorId' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const dailyTrends = dailyViewsAgg.map(item => {
      const parts = item._id.split('-');
      const d = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
      const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        date: formattedDate,
        rawDate: item._id,
        views: item.pageViews,
        uniqueVisitors: item.visitors ? item.visitors.length : 0
      };
    });

    // 3. Platform Breakdown (Web vs iOS App vs Android App)
    const platformAgg = await VisitorLog.aggregate([
      { $group: { _id: '$platform', count: { $sum: 1 } } }
    ]);

    let platforms = { web: 0, ios: 0, android: 0 };
    platformAgg.forEach(p => {
      if (p._id && platforms[p._id] !== undefined) {
        platforms[p._id] = p.count;
      }
    });

    // 4. Device Breakdown (Mobile vs Desktop vs Tablet)
    const deviceAgg = await VisitorLog.aggregate([
      { $group: { _id: '$device', count: { $sum: 1 } } }
    ]);

    let devices = { mobile: 0, desktop: 0, tablet: 0, unknown: 0 };
    deviceAgg.forEach(d => {
      if (d._id && devices[d._id] !== undefined) {
        devices[d._id] = d.count;
      }
    });

    // 5. Top Visited Events
    const topEventsAgg = await VisitorLog.aggregate([
      { $match: { eventId: { $ne: null } } },
      { $group: { _id: '$eventId', viewCount: { $sum: 1 } } },
      { $sort: { viewCount: -1 } },
      { $limit: 8 }
    ]);

    // Populate event titles
    const populatedTopEvents = [];
    for (const item of topEventsAgg) {
      try {
        const ev = await Event.findById(item._id).select('title bannerImage venue category date');
        if (ev) {
          populatedTopEvents.push({
            eventId: ev._id,
            title: ev.title,
            bannerImage: ev.bannerImage,
            venue: ev.venue,
            category: ev.category,
            views: item.viewCount
          });
        }
      } catch (e) {}
    }

    // 6. Top Referrers
    const topReferrersAgg = await VisitorLog.aggregate([
      { $group: { _id: '$referrer', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 }
    ]);

    const referrers = topReferrersAgg.map(r => ({
      source: r._id || 'Direct',
      count: r.count
    }));

    // 7. Recent Live Visitor Feed (Last 25 entries)
    const recentVisits = await VisitorLog.find()
      .sort({ createdAt: -1 })
      .limit(25)
      .select('path pageTitle platform device browser os country city referrer createdAt');

    res.json({
      kpi: {
        today: { views: todayViews, uniqueVisitors: todayUniqueVisitors },
        week: { views: weekViews, uniqueVisitors: weekUniqueVisitors },
        month: { views: monthViews, uniqueVisitors: monthUniqueVisitors },
        allTime: { views: totalViews, uniqueVisitors: totalUniqueVisitors }
      },
      dailyTrends,
      platforms,
      devices,
      topEvents: populatedTopEvents,
      referrers,
      recentVisits
    });
  } catch (error) {
    console.error('[Analytics] Traffic stats error:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch traffic stats' });
  }
});

// GET /api/analytics/ - Revenue & registration overview
router.get('/', protect, async (req, res) => {
  try {
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

