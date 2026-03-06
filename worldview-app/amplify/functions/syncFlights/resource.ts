import { defineFunction, secret } from '@aws-amplify/backend';

export const syncFlights = defineFunction({
  name: 'syncFlights',
  entry: './handler.ts',
  timeoutSeconds: 300, 
  memoryMB: 512,
  environment: {
    OPENSKY_USERNAME: secret('OPENSKY_USERNAME'),
    OPENSKY_PASSWORD: secret('OPENSKY_PASSWORD')
  }
});