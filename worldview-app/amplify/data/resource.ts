// amplify/data/resource.ts
import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  GeoEvent: a
    .model({
      type: a.string().required(), // z.B. 'FLIGHT', 'JAMMING', 'SATELLITE'
      latitude: a.float().required(),
      longitude: a.float().required(),
      altitude: a.float(),
      timestamp: a.datetime().required(),
      metadata: a.json(), // Zusätzliche Infos wie Flugnummer, Schiff-ID
    })
    .authorization((allow) => [allow.publicApiKey()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});