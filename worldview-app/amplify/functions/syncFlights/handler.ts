// amplify/functions/syncFlights/handler.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '$amplify/env/syncFlights';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event: any) => {
  console.log('Fetching OpenSky data...');
  
  try {
    const res = await fetch('https://opensky-network.org/api/states/all');
    if (!res.ok) throw new Error(`OpenSky API Error: ${res.status}`);
    
    const data = await res.json();
    const flights = (data.states || [])
      .filter((f: any) => f[5] && f[6])
      .slice(0, 150) // RAM Optimierung direkt beim Abholen
      .map((f: any) => ({
        id: f[0], // ICAO24 als eindeutige ID
        callsign: f[1]?.trim() || 'UNKNOWN',
        country: f[2] || 'Unknown',
        lng: f[5],
        lat: f[6],
        alt: f[7] || 10000,
        velocity: f[9] || 0,
        heading: f[10] || 0,
        squawk: f[14] || 'N/A'
      }));

    // Alte Daten bereinigen (verhindert, dass gelandete Flüge als Geister bleiben)
    const scanResponse = await docClient.send(new ScanCommand({
      TableName: env.AMPLIFY_DATA_FLIGHT_TABLE_NAME
    }));
    
    if (scanResponse.Items) {
      for (const item of scanResponse.Items) {
        await docClient.send(new DeleteCommand({
          TableName: env.AMPLIFY_DATA_FLIGHT_TABLE_NAME,
          Key: { id: item.id }
        }));
      }
    }

    // Neue Daten in die Datenbank pushen
    for (const flight of flights) {
      await docClient.send(new PutCommand({
        TableName: env.AMPLIFY_DATA_FLIGHT_TABLE_NAME,
        Item: flight
      }));
    }

    console.log(`Successfully synced ${flights.length} flights.`);
    return { statusCode: 200, body: 'Success' };

  } catch (error) {
    console.error('Error syncing flights:', error);
    return { statusCode: 500, body: 'Error' };
  }
};