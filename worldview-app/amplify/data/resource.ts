// amplify/data/resource.ts
import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Flight: a.model({
    id: a.string().required(),
    callsign: a.string(),
    country: a.string(),
    lng: a.float(),
    lat: a.float(),
    alt: a.float(),
    velocity: a.float(),
    heading: a.float(),
    squawk: a.string()
  }).authorization(allow => [
    allow.publicApiKey().to(['read']), // Das Frontend darf nur lesen
  ])
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