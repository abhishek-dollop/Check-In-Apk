// authService.js
// Handles login, access token, and user session with Axios
import axiosInstance, { setupAxiosAuth } from '../axiosInstance/axios';
import API_ROUTES from '../All-Api-Routes/apiroutes';

let inMemoryToken = null;
let inMemoryRefreshToken = null;
let inMemoryUser = null;

export const authService = {
  // Set full session from login response
  setSession: (loginData) => {
    if (!loginData) return;
    inMemoryToken = loginData.accessToken || null;
    inMemoryRefreshToken = loginData.refreshToken || null;
    inMemoryUser = {
      userId: loginData.userId,
      email: loginData.email,
      fullName: loginData.fullName,
      roleId: loginData.roleId,
      roleName: loginData.roleName,
      roles: loginData.roles || [],
      tokenType: loginData.tokenType || 'Bearer',
      expiresIn: loginData.expiresIn,
    };
  },

  // Set active token directly
  setToken: (token) => {
    inMemoryToken = token;
  },

  // Get active token
  getToken: () => {
    return inMemoryToken;
  },

  // Get refresh token
  getRefreshToken: () => {
    return inMemoryRefreshToken;
  },

  // Get current user details
  getUser: () => {
    return inMemoryUser;
  },

  // Check if authenticated
  isAuthenticated: () => {
    return !!inMemoryToken;
  },

  // Clear session (Logout)
  clearSession: () => {
    inMemoryToken = null;
    inMemoryRefreshToken = null;
    inMemoryUser = null;
  },

  // Login via API using Axios (POST /auth/login)
  login: async (email, password) => {
    try {
      const response = await axiosInstance.post(API_ROUTES.AUTH.LOGIN, {
        email,
        password,
      });

      const data = response.data;
      const sessionData = data.data || data;
      authService.setSession(sessionData);

      return data;
    } catch (error) {
      const serverData = error.response?.data;
      if (serverData) {
        const err = new Error(serverData.message || serverData.error || 'Login failed');
        err.errorCode = serverData.errorCode || serverData.error || 'LOGIN_FAILED';
        err.response = error.response;
        throw err;
      }
      throw error;
    }
  },

  // Refresh access token via API (POST /auth/refresh)
  refreshToken: async (token) => {
    try {
      const refreshTokenValue = token || authService.getRefreshToken();
      if (!refreshTokenValue) {
        throw new Error('No refresh token available');
      }
      const response = await axiosInstance.post(API_ROUTES.AUTH.REFRESH_TOKEN, {
        refreshToken: refreshTokenValue,
      });
      const data = response.data;
      const sessionData = data.data || data;
      if (sessionData?.accessToken) {
        authService.setToken(sessionData.accessToken);
        if (sessionData.refreshToken) {
          inMemoryRefreshToken = sessionData.refreshToken;
        }
      }
      return data;
    } catch (error) {
      const serverData = error.response?.data;
      if (serverData) {
        const err = new Error(serverData.message || serverData.error || 'Token refresh failed');
        err.errorCode = serverData.errorCode || serverData.error || 'REFRESH_FAILED';
        err.response = error.response;
        throw err;
      }
      throw error;
    }
  },
};

// Wire up axios interceptor with authService
setupAxiosAuth({
  getToken: () => authService.getToken(),
  getRefreshToken: () => authService.getRefreshToken(),
  setToken: (accessToken, refreshToken) => {
    authService.setToken(accessToken);
    if (refreshToken) inMemoryRefreshToken = refreshToken;
  },
  onUnauthorized: () => {
    authService.clearSession();
  },
});

export const getAuthHeader = () => {
  const token = authService.getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};

export default authService;
