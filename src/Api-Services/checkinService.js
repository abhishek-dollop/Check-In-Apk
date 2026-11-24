// checkinService.js
// Synced with event-management API routes and endpoints using Axios
import axiosInstance from '../axiosInstance/axios';
import API_ROUTES from '../All-Api-Routes/apiroutes';

export const checkinService = {
  // Pre-verification inspects pass eligibility, attendee details, and day validity without committing check-in
  verifyPass: async (rawToken, eventId, eventDayId = null) => {
    try {
      const payload = {
        rawToken,
        eventId,
      };
      if (eventDayId) {
        payload.eventDayId = eventDayId;
      }

      const response = await axiosInstance.post(API_ROUTES.CHECKIN.VERIFY, payload);
      return response.data;
    } catch (error) {
      const data = error.response?.data;
      if (data) {
        const err = new Error(data.message || data.error || 'Pass verification failed');
        err.errorCode =
          data.errorCode ||
          data.error ||
          (error.response?.status === 401 ? 'EVENT_ACCESS_DENIED' : 'VERIFICATION_FAILED');
        err.response = error.response;
        throw err;
      }

      // Offline simulation fallback
      if (rawToken && String(rawToken).includes('INVALID')) {
        const err = new Error('The scanned code is not recognized as a valid EventPass credential.');
        err.errorCode = 'INVALID_QR_TOKEN';
        throw err;
      }
      if (rawToken && String(rawToken).includes('REVOKED')) {
        const err = new Error('This pass has been cancelled or invalidated by event administration.');
        err.errorCode = 'PASS_REVOKED';
        throw err;
      }

      throw error;
    }
  },

  // Perform check-in scan for multi-day or single-day entry with optional goodies provided toggle
  scanCheckin: async (rawToken, eventId, eventDayId = null, requestId = null, goodiesProvided = false) => {
    try {
      const payload = {
        rawToken,
        eventId,
      };
      if (eventDayId) {
        payload.eventDayId = eventDayId;
      }
      if (requestId) {
        payload.requestId = requestId;
      }
      if (typeof goodiesProvided === 'boolean') {
        payload.goodiesProvided = goodiesProvided;
      }

      const response = await axiosInstance.post(API_ROUTES.CHECKIN.SCAN, payload);
      return response.data;
    } catch (error) {
      const data = error.response?.data;
      if (data) {
        const err = new Error(data.message || data.error || 'Check-in failed');
        err.errorCode =
          data.errorCode ||
          data.error ||
          (error.response?.status === 401 ? 'EVENT_ACCESS_DENIED' : 'CHECKIN_REJECTED');
        err.response = error.response;
        throw err;
      }
      throw error;
    }
  },

  // Fetch check-in and goodies distribution statistics for an event
  getCheckinStats: async (eventId, eventDayId = null) => {
    try {
      const params = { eventId };
      if (eventDayId) {
        params.eventDayId = eventDayId;
      }

      const response = await axiosInstance.get(`${API_ROUTES.CHECKIN.SCAN}/stats`, {
        params,
      });
      return response.data;
    } catch (error) {
      // Graceful fallback for stats if server is unreachable
      return {
        data: {
          totalCheckedIn: 0,
          goodiesProvided: 0,
          goodiesNotProvided: 0,
        },
      };
    }
  },

  // Authorized correction of goodies status for a specific check-in record
  updateGoodiesStatus: async (checkInId, goodiesProvided) => {
    try {
      const response = await axiosInstance.patch(
        `${API_ROUTES.CHECKIN.SCAN}/${checkInId}/goodies`,
        null,
        {
          params: { goodiesProvided },
        }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },
};

export default checkinService;
