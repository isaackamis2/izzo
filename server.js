const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const eventRoutes = require('./routes/eventRoutes');
const authRoutes = require('./routes/authRoutes');
const registrationRoutes = require('./routes/registrationRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const userRoutes = require('./routes/userRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/analytics', analyticsRoutes);

const PORT = process.env.PORT || 5000;

async function startServer() {
  if (process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to external MongoDB');
  } else {
    console.log('No MONGO_URI provided. Starting in-memory MongoDB for local testing...');
    const mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    console.log(`Connected to in-memory MongoDB at ${uri}`);
  }
    
  // Seed some initial events if DB is empty
    // Seed users and events if DB is empty
    const Event = require('./models/Event');
    const User = require('./models/User');
    const Settings = require('./models/Settings');

    const userCount = await User.countDocuments();
    if (userCount === 0) {
      await Settings.create({ logoUrl: '', siteName: 'IzzoEvents' });
      
      const adminHash = await bcrypt.hash('Admin@1234', 10);
      const managerHash = await bcrypt.hash('Manager@1234', 10);

      const superAdmin = await User.create({
        name: 'Super Admin',
        email: 'superadmin@eventflow.com',
        password: adminHash,
        role: 'Admin',
        isVerified: true,
      });

      const manager = await User.create({
        name: 'Event Manager',
        email: 'manager@eventflow.com',
        password: managerHash,
        role: 'Manager',
        isVerified: true,
      });

      console.log('=================================================');
      console.log('  SUPER ADMIN  → superadmin@eventflow.com / Admin@1234');
      console.log('  MANAGER      → manager@eventflow.com / Manager@1234');
      console.log('=================================================');

      await Event.create([
        {
          title: 'Tech Innovators Summit 2026',
          category: 'Educational and Informational Events',
          date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          venue: 'Moscone Center, San Francisco',
          price: 299,
          maxCapacity: 50,
          currentCapacity: 45,
          manager: manager._id,
          description: 'A comprehensive summit for tech enthusiasts.',
          bannerImage: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
          isFeatured: true,
          isTicketed: true,
          ticketTiers: [
            { name: 'Regular', price: 299 },
            { name: 'VIP', price: 599 }
          ]
        },
        {
          title: 'Outdoor Yoga Retreat',
          category: 'Sports and Fitness Events',
          date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
          venue: 'Golden Gate Park, SF',
          price: 0,
          maxCapacity: 20,
          currentCapacity: 12,
          manager: manager._id,
          description: 'Relaxing yoga outdoors.',
          bannerImage: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=800&q=80',
          isFeatured: true,
          isTicketed: false,
          ticketTiers: []
        },
        {
          title: 'Startup Pitch Night',
          category: 'Business and Professional Events',
          date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days from now
          venue: 'WeWork SoMa',
          price: 15,
          maxCapacity: 100,
          currentCapacity: 5,
          manager: manager._id,
          description: 'Pitch your ideas to top VCs.',
          bannerImage: 'https://images.unsplash.com/photo-1556761175-5973dc0f32d7?auto=format&fit=crop&w=800&q=80',
          isFeatured: true,
          isTicketed: true,
          ticketTiers: [
            { name: 'General Admission', price: 15 },
            { name: 'Investor Pass', price: 50 }
          ]
        },
        {
          title: 'Global Food Festival',
          category: 'Food and Drink Events',
          date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
          venue: 'Downtown Plaza',
          price: 25,
          maxCapacity: 200,
          currentCapacity: 150,
          manager: manager._id,
          description: 'Taste the best cuisines from around the world.',
          bannerImage: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80',
          isFeatured: true,
          isTicketed: true,
          ticketTiers: [
            { name: 'Tasting Pass', price: 25 },
            { name: 'All-Inclusive', price: 100 }
          ]
        },
        {
          title: 'Local Art Exhibition',
          category: 'Cultural, Artistic, and Performing Events',
          date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
          venue: 'City Gallery',
          price: 0,
          maxCapacity: 500,
          currentCapacity: 500,
          manager: manager._id,
          description: 'A showcase of modern art from local artists.',
          bannerImage: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=800&q=80',
          isFeatured: false,
          isTicketed: false,
          ticketTiers: []
        }
      ]);
      console.log('Seeded initial events into DB!');
    }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(err => console.error(err));
