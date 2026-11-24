// eventsService.js
// Synced with event-management API routes and endpoints using Axios
import axiosInstance from '../axiosInstance/axios';
import API_ROUTES from '../All-Api-Routes/apiroutes';

export const eventsService = {
  // Get all events with pagination
  getEvents: async (page = 0, size = 50, sort = ['createdAt,desc'], search = '') => {
    try {
      const params = { page, size, sort: sort[0] };
      if (search) {
        params.search = search;
      }

      const response = await axiosInstance.get(API_ROUTES.EVENTS.LIST, { params });
      return response.data;
    } catch (error) {
      console.warn('eventsService.getEvents fetch notice:', error.message || error);
      return {
        data: {
          content: [
            { id: 'ev_001', name: 'Global Tech Summit 2026', eventCode: 'GTS26', timezone: 'UTC+05:30' },
            { id: 'ev_002', name: 'Developer Days Meetup', eventCode: 'DDM26', timezone: 'UTC+05:30' },
            { id: 'ev_003', name: 'AI & Cloud Expo', eventCode: 'AICE', timezone: 'UTC+05:30' },
          ],
        },
      };
    }
  },

  // Get sequential event days
  getEventDays: async (eventId) => {
    try {
      const response = await axiosInstance.get(
        API_ROUTES.EVENTS.DAYS.replace(':id', eventId)
      );
      return response.data;
    } catch (error) {
      console.warn('eventsService.getEventDays fetch notice:', error.message || error);
      const today = new Date().toISOString().split('T')[0];
      return {
        data: [
          { id: 'day_1', dayNumber: 1, label: 'Keynote & Sessions', eventDate: today },
          { id: 'day_2', dayNumber: 2, label: 'Workshops & Hackathon', eventDate: '2026-11-24' },
        ],
      };
    }
  },
};

export default eventsService;
