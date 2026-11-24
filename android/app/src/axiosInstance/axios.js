import axios from 'axios';
import { API_BASE_URL } from '../config/env';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let tokenGetter = null;
let refreshTokenGetter = null;
let tokenSetter = null;
let onUnauthorizedCallback = null;

export const setupAxiosAuth = ({
  getToken,
  getRefreshToken,
  setToken,
  onUnauthorized,
}) => {
  tokenGetter = getToken;
  refreshTokenGetter = getRefreshToken;
  tokenSetter = setToken;
  onUnauthorizedCallback = onUnauthorized;
};

// Request interceptor to attach access token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = tokenGetter ? tokenGetter() : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor with concurrency-safe token refresh
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response) {
      const { status } = error.response;
      const isAuthEndpoint =
        originalRequest.url?.includes('/auth/login') ||
        originalRequest.url?.includes('/auth/refresh');

      if (status === 401 && !originalRequest._retry && !isAuthEndpoint) {
        const refreshToken = refreshTokenGetter ? refreshTokenGetter() : null;

        if (!refreshToken) {
          if (onUnauthorizedCallback) onUnauthorizedCallback();
          return Promise.reject(error);
        }

        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              if (originalRequest.headers?.set) {
                originalRequest.headers.set('Authorization', `Bearer ${token}`);
              } else if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              return axiosInstance(originalRequest);
            })
            .catch((err) => {
              return Promise.reject(err);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken, refreshToken: newRefreshToken } =
            response.data?.data || response.data || {};

          if (!accessToken) {
            throw new Error('No access token returned from refresh');
          }

          if (tokenSetter) {
            tokenSetter(accessToken, newRefreshToken);
          }

          axiosInstance.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
          if (originalRequest.headers?.set) {
            originalRequest.headers.set('Authorization', `Bearer ${accessToken}`);
          } else if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          }

          processQueue(null, accessToken);
          return axiosInstance(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          if (onUnauthorizedCallback) onUnauthorizedCallback();
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
