// amplify/functions/syncFlights/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const syncFlights = defineFunction({
  name: 'syncFlights',
  entry: './handler.ts',
  timeoutSeconds: 300, // Auf 5 Minuten erhöht für 10.000+ Flüge
  memoryMB: 512,       // Mehr RAM für das große Array
});