import Constants from 'expo-constants';

const extra = (Constants?.expoConfig?.extra ?? Constants?.manifest?.extra ?? {}) as { apiServer?: string };

export const API_BASE: string = extra.apiServer || 'http://127.0.0.1:5050';
