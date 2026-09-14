const mongoose = require('mongoose');
const uri = 'mongodb+srv://isaackamis_db_user:OYbC6C3BNGLP5OES@izz0.7y7gw9d.mongodb.net/eventflow?appName=izz0';

async function run() {
  await mongoose.connect(uri);
  const Event = mongoose.model('Event', new mongoose.Schema({}, { strict: false }));
  const events = await Event.find({}).lean();
  console.log('TOTAL_EVENTS: ' + events.length);

  const genericOrgs = ['Event Host', 'Unknown Organizer', 'Rwanda Events', 'Unknown', ''];
  const badOrg = events.filter(e => !e.organizerName || genericOrgs.includes(e.organizerName.trim()) || e.organizerName.toLowerCase().includes('unknown'));
  console.log('\n=== BAD ORGANIZER COUNT: ' + badOrg.length + ' ===');
  badOrg.forEach(e => {
    console.log(`[${e.sourcePlatform || 'Manual'}] Title: "${e.title}" | Org: "${e.organizerName}" | Venue: "${e.venue}" | Status: ${e.status} | ID: ${e._id}`);
  });

  const onlineKeywords = ['online', 'webinar', 'zoom', 'virtual', 'live stream', 'internet', 'interactive session'];
  const onlineEvents = events.filter(e => {
    const text = ((e.venue || '') + ' ' + (e.title || '')).toLowerCase();
    return onlineKeywords.some(kw => text.includes(kw));
  });
  console.log('\n=== ONLINE/VIRTUAL COUNT: ' + onlineEvents.length + ' ===');
  onlineEvents.forEach(e => {
    console.log(`[${e.sourcePlatform || 'Manual'}] Title: "${e.title}" | Venue: "${e.venue}" | Status: ${e.status} | ID: ${e._id}`);
  });

  const nonRwanda = events.filter(e => {
    const v = (e.venue || '').toLowerCase();
    return (v.includes('nairobi') || v.includes('lagos') || v.includes('kampala') || v.includes('accra') || v.includes('london')) && !v.includes('kigali');
  });
  console.log('\n=== NON-RWANDA VENUE COUNT: ' + nonRwanda.length + ' ===');
  nonRwanda.forEach(e => {
    console.log(`[${e.sourcePlatform || 'Manual'}] Title: "${e.title}" | Venue: "${e.venue}" | Status: ${e.status} | ID: ${e._id}`);
  });

  await mongoose.disconnect();
}
run();
