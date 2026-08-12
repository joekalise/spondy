import { Platform } from 'react-native';
import * as ios from './healthKit';
import * as android from './healthConnect';

// Single entry point consumers should import from — routes to HealthKit on iOS
// and Health Connect on Android without callers needing to branch themselves.
const impl = Platform.OS === 'android' ? android : ios;

export const isHealthKitAvailable = impl.isHealthKitAvailable;
export const isHealthConnected = impl.isHealthConnected;
export const requestHealthPermissions = impl.requestHealthPermissions;
export const disconnectHealth = impl.disconnectHealth;
export const ensureLatestHealthPermissions = impl.ensureLatestHealthPermissions;
export const fetchTodayHealthData = impl.fetchTodayHealthData;
export const fetchTodayRecoveryData = impl.fetchTodayRecoveryData;
export type HealthSnapshot = ios.HealthSnapshot;
