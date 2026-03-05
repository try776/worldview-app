// amplify/functions/syncFlights/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const syncFlights = defineFunction({
  name: 'syncFlights',
  entry: './handler.ts',
  timeoutSeconds: 30, // Ausreichend Zeit für den Fetch
  memoryMB: 256,
});