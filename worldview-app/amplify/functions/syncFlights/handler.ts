// amplify/functions/syncFlights/handler.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '$amplify/env/syncFlights';
import * as https from 'https';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const chunkArray = (arr: any[], size: number) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

// Neuer Fetch-Wrapper für Airplanes.live (Kein Login nötig, keine AWS-Blockade!)
const fetchAirplanesLive = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.airplanes.live',
      port: 443,
      path: '/v2/all',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WorldViewApp/1.0',
        'Accept': 'application/json'
      },
      timeout: 45000 
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Airplanes.live API Error: HTTP ${res.statusCode}`));
        return;
      }
      
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Failed to parse JSON'));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTPS Connection Timeout'));
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
};

export const handler = async (event: any) => {
  console.log('Fetching live data from Airplanes.live...');

  try {
    const data = await fetchAirplanesLive();
    
    // Airplanes.live liefert die Daten im Array "ac" (Aircraft)
    const flights = (data.ac || [])
      .filter((f: any) => f.lat && f.lon) // Nur gültige Koordinaten
      .map((f: any) => ({
        id: f.hex || Math.random().toString(36).substring(7), // Eindeutige ICAO Hex ID
        callsign: f.flight?.trim() || 'UNKNOWN',
        country: f.r || 'Unknown', // Registration als Herkunft
        lng: f.lon,
        lat: f.lat,
        alt: (f.alt_baro && f.alt_baro !== 'ground') ? f.alt_baro * 0.3048 : 0, // Fuß in Meter umrechnen
        velocity: f.gs ? f.gs * 0.51444 : 0, // Knoten in m/s umrechnen
        heading: f.track || 0,
        squawk: f.squawk || 'N/A'
      }));

    // KOSTENKONTROLLE: Wir begrenzen auf 1500 Einträge, um AWS DynamoDB Free Tier nicht zu sprengen
    const flightsToSave = flights.slice(0, 1500);
    const tableName = env.AMPLIFY_DATA_FLIGHT_TABLE_NAME;

    console.log('Scanning old flights to delete...');
    const scanResponse = await docClient.send(new ScanCommand({ TableName: tableName }));
    
    if (scanResponse.Items && scanResponse.Items.length > 0) {
      const deleteRequests = scanResponse.Items.map(item => ({
        DeleteRequest: { Key: { id: item.id } }
      }));
      
      const deleteChunks = chunkArray(deleteRequests, 25);
      for (const chunk of deleteChunks) {
        await docClient.send(new BatchWriteCommand({
          RequestItems: { [tableName]: chunk }
        }));
      }
    }

    console.log(`Writing ${flightsToSave.length} new flights to database...`);
    const putRequests = flightsToSave.map((flight: any) => ({
      PutRequest: { Item: flight }
    }));

    const putChunks = chunkArray(putRequests, 25);
    for (const chunk of putChunks) {
      await docClient.send(new BatchWriteCommand({
        RequestItems: { [tableName]: chunk }
      }));
    }

    console.log(`Successfully synced ${flightsToSave.length} flights worldwide.`);
    return { statusCode: 200, body: 'Success' };

  } catch (error) {
    console.error('Error syncing flights:', error);
    return { statusCode: 500, body: 'Error' };
  }
};