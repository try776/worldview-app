// src/App.tsx
import { useState, useEffect } from 'react';
import { Viewer, Entity, PointGraphics, Clock, PathGraphics } from 'resium';
import { Cartesian3, Color, JulianDate, TimeIntervalCollection, TimeInterval, SampledPositionProperty } from 'cesium';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import outputs from '../amplify_outputs.json';
import { Amplify } from 'aws-amplify';

Amplify.configure(outputs);
const client = generateClient<Schema>();

// Hilfsfunktion zur Generierung einer simulierten Flugroute (4D-Pfad)
const generateMockFlightPath = () => {
  const property = new SampledPositionProperty();
  const start = JulianDate.fromDate(new Date());
  
  for (let i = 0; i < 60; i++) {
    const time = JulianDate.addSeconds(start, i * 60, new JulianDate());
    // Start im Iran (Teheran-Nähe) in Richtung Westen
    const position = Cartesian3.fromDegrees(51.3890 - (i * 0.1), 35.6892 + (i * 0.05), 10000);
    property.addSample(time, position);
  }
  
  return { property, start, stop: JulianDate.addSeconds(start, 3600, new JulianDate()) };
};

function App() {
  const [events, setEvents] = useState<Array<Schema['GeoEvent']['type']>>([]);
  const mockFlight = generateMockFlightPath();

  useEffect(() => {
    // Hier würdest du reale Daten aus deinem Amplify Backend abrufen
    const fetchEvents = async () => {
      const { data: geoEvents } = await client.models.GeoEvent.list();
      setEvents(geoEvents);
    };
    fetchEvents();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', 
        top: 20, 
        left: 20, 
        zIndex: 100, 
        background: 'rgba(0,0,0,0.7)', 
        color: 'white', 
        padding: '15px', 
        borderRadius: '8px',
        fontFamily: 'monospace'
      }}>
        <h2>WorldView Command Center</h2>
        <p>Layer-Status:</p>
        <ul>
          <li style={{ color: 'yellow' }}>• Satellitenüberwachung</li>
          <li style={{ color: 'cyan' }}>• ADS-B Flugtracking</li>
          <li style={{ color: 'red' }}>• GPS Jamming-Zonen</li>
        </ul>
      </div>

      <Viewer 
        full 
        timeline={true} 
        animation={true} 
        infoBox={false}
      >
        {/* Die Uhr steuert die 4D-Zeitachse */}
        <Clock 
          startTime={mockFlight.start} 
          stopTime={mockFlight.stop} 
          currentTime={mockFlight.start} 
          multiplier={10} 
        />

        {/* Simulierte GPS-Jamming Zone (Roter Punkt) */}
        <Entity position={Cartesian3.fromDegrees(51.3890, 35.6892, 0)} name="GPS Jamming Signal">
          <PointGraphics pixelSize={20} color={Color.RED.withAlpha(0.6)} outlineColor={Color.WHITE} outlineWidth={2} />
        </Entity>

        {/* Simulierter Flug mit 4D-Pfad (Cyan) */}
        <Entity 
          name="Commercial Flight IR712" 
          position={mockFlight.property} 
          availability={new TimeIntervalCollection([new TimeInterval({ start: mockFlight.start, stop: mockFlight.stop })])}
        >
          <PointGraphics pixelSize={10} color={Color.CYAN} />
          <PathGraphics 
            resolution={1} 
            material={Color.CYAN.withAlpha(0.5)} 
            width={3} 
            leadTime={0} 
            trailTime={600} // Zeichnet den Pfad für die letzten 10 Minuten in der Simulation
          />
        </Entity>
      </Viewer>
    </div>
  );
}

export default App;