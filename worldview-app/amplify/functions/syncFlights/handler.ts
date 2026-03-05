// amplify/functions/syncFlights/handler.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { env } from '$amplify/env/syncFlights';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Hilfsfunktion: Teilt ein riesiges Array in kleine Arrays auf (DynamoDB Limit ist 25)
const chunkArray = (arr: any[], size: number) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

export const handler = async (event: any) => {
  console.log('Fetching OpenSky data...');
  
  try {
    // Timeout auf 60 Sekunden erhöhen und User-Agent setzen
    const res = await fetch('https://opensky-network.org/api/states/all', {
      signal: AbortSignal.timeout(60000), 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) throw new Error(`OpenSky API Error: ${res.status}`);
    
    const data = await res.json();
    const flights = (data.states || [])
      .filter((f: any) => f[5] && f[6]) // Nur Flüge mit Koordinaten
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

    // 1. Alte Daten löschen (im Batch)
    console.log('Scanning old flights to delete...');
    const scanResponse = await docClient.send(new ScanCommand({
      TableName: tableName
    }));
    
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

    // 2. Neue 10.000+ Daten speichern (im Batch)
    console.log(`Writing ${flights.length} new flights...`);
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