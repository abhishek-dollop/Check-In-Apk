// API Endpoints Configuration (synced from event-management/src/All-Api-Routes/apiroutes.js)
export const API_ROUTES = {
  // Authentication Endpoints
  AUTH: {
    LOGIN: '/auth/login',
    REFRESH_TOKEN: '/auth/refresh',
    ME: '/auth/me',
    LOGOUT: '/auth/logout',
    CHANGE_PASSWORD: '/auth/change-password',
  },

  // Event Management Endpoints
  EVENTS: {
    LIST: '/events',
    DAYS: '/events/:id/days',
    DASHBOARD_STATS: '/events/dashboard-stats',
  },

  // Check-in Management Endpoints
  CHECKIN: {
    SCAN: '/checkin',
    VERIFY: '/checkin/verify',
  },
};

export default API_ROUTES;
