const Event = require('../models/Event');
const Registration = require('../models/Registration');

async function initMCP() {
  // Dynamically import ESM modules in CommonJS
  const mcpSdk = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const mcpSse = await import('@modelcontextprotocol/sdk/server/sse.js');
  const zod = await import('zod');

  const { McpServer } = mcpSdk;
  const { SSEServerTransport } = mcpSse;
  const { z } = zod;

  const server = new McpServer({
    name: "EventFlow-MCP",
    version: "1.0.0"
  });

  // Tool: list_events
  server.tool(
    "list_events",
    "List all events in the EventFlow database. Returns basic info like ID, title, date, venue, category, and price.",
    {},
    async () => {
      try {
        const events = await Event.find().sort({ date: 1 }).select('title date endDate venue category price isTicketed externalTicketLink');
        return {
          content: [{ type: "text", text: JSON.stringify(events, null, 2) }]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    }
  );

  // Tool: get_event_details
  server.tool(
    "get_event_details",
    "Get full details for a specific event by its ID, including ticket tiers and description.",
    {
      eventId: z.string().describe("The MongoDB ObjectId of the event")
    },
    async ({ eventId }) => {
      try {
        const event = await Event.findById(eventId);
        if (!event) return { content: [{ type: "text", text: "Event not found" }] };
        return {
          content: [{ type: "text", text: JSON.stringify(event, null, 2) }]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    }
  );

  // Tool: get_registrations
  server.tool(
    "get_registrations",
    "Get all attendees/registrations for a specific event ID.",
    {
      eventId: z.string().describe("The MongoDB ObjectId of the event")
    },
    async ({ eventId }) => {
      try {
        const registrations = await Registration.find({ event: eventId }).populate('user', 'name email');
        return {
          content: [{ type: "text", text: JSON.stringify(registrations, null, 2) }]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    }
  );

  return { server, SSEServerTransport };
}

module.exports = { initMCP };
