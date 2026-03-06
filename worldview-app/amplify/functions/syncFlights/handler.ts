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

const fetchOpenSky = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    
    // @ts-ignore - Unterdrückt den TS-Fehler, da die Typen oft zeitverzögert generiert werden
    const user = env.OPENSKY_USERNAME || process.env.OPENSKY_USERNAME || '';
    // @ts-ignore
    const pass = env.OPENSKY_PASSWORD || process.env.OPENSKY_PASSWORD || '';

    if (!user || !pass) {
      console.error('❌ FEHLER: Zugangsdaten fehlen! Lambda hat keine Berechtigung für die Secrets.');
    } else {
      console.log('✅ Zugangsdaten geladen. Logge bei OpenSky ein...');
    }

    const authString = `${user}:${pass}`;
    const authBase64 = Buffer.from(authString).toString('base64');

    const options = {
      hostname: 'opensky-network.org',
      port: 443,
      path: '/api/states/all',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WorldViewApp/1.0',
        'Accept': 'application/json',
        'Authorization': `Basic ${authBase64}`
      },
      timeout: 45000 
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`OpenSky API Error: HTTP ${res.statusCode}`));
        return;
      }
      
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Failed to parse OpenSky JSON'));
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
  try {
    const data = await fetchOpenSky();
    
    const flights = (data.states || [])
      .filter((f: any) => f[5] && f[6])
      .map((f: any) => ({
        id: f[0],
        callsign: f[1]?.trim() || 'UNKNOWN',
        country: f[2] || 'Unknown',
        lng: f[5],
        lat: f[6],
        alt: f[7] || 10000,
        velocity: f[9] || 0,
        heading: f[10] || 0,
        squawk: f[14] || 'N/A'
      }));

    const tableName = env.AMPLIFY_DATA_FLIGHT_TABLE_NAME;

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

    const putRequests = flights.map((flight: any) => ({
      PutRequest: { Item: flight }
    }));

    const putChunks = chunkArray(putRequests, 25);
    for (const chunk of putChunks) {
      await docClient.send(new BatchWriteCommand({
        RequestItems: { [tableName]: chunk }
      }));
    }

    console.log(`Successfully synced ${flights.length} flights worldwide.`);
    return { statusCode: 200, body: 'Success' };

  } catch (error) {
    console.error('Error syncing flights:', error);
    return { statusCode: 500, body: 'Error' };
  }
};