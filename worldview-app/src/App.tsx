// src/App.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Viewer, Entity, PointGraphics, Clock, Scene, CameraFlyTo, ModelGraphics 
} from 'resium';
import { 
  Cartesian3, 
  Color, 
  JulianDate, 
  createWorldTerrainAsync,
  ClockRange,
  ClockStep,
  Math as CesiumMath,
  HeadingPitchRoll,
  Transforms
} from 'cesium';

// --- 1. DEINE SPEZIFISCHEN LINKS (Region Bern) ---
const DIGI4_LINKS = [
  { name: 'Neuenegg', lat: 46.898, lng: 7.298, url: 'https://neuenegg.digi4.click/' },
  { name: 'Bramberg', lat: 46.887, lng: 7.318, url: 'https://bramberg.digi4.click/' },
  { name: 'Grauholz', lat: 47.008, lng: 7.491, url: 'https://grauholz.digi4.click/' },
];

// --- UX OPT 4: KINOREIFE LESEZEICHEN (mit Pitch & Heading) ---
const BOOKMARKS = [
  { name: 'Operation Epic Fury', lat: 35.6892, lng: 51.3890, height: 150000, pitch: -45, heading: 20 },
  { name: 'Bern HQ (Digi4)', lat: 46.948, lng: 7.447, height: 8000, pitch: -35, heading: 0 },
  { name: 'Strait of Hormuz', lat: 26.5667, lng: 56.2500, height: 200000, pitch: -50, heading: 45 },
];

export default function App() {
  const viewerRef = useRef<any>(null);
  
  // --- UI & LAYER STATE ---
  const [layers, setLayers] = useState({
    liveFlights: true,
    liveEarthquakes: true,
    digi4: true,
    terrain3D: true, // Default auf true für bessere 3D UX
  });
  
  const [copiedCoords, setCopiedCoords] = useState<string | null>(null);
  const [customPins, setCustomPins] = useState<{lat: number, lng: number}[]>([]);
  const [activeBookmark, setActiveBookmark] = useState<any>(null);

  // --- LIVE DATA STATES ---
  const [earthquakes, setEarthquakes] = useState<any[]>([]);
  const [flights, setFlights] = useState<any[]>([]);
  const [lastSync, setLastSync] = useState<string>('Syncing...');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncRealTime, setSyncRealTime] = useState<boolean>(true);

  // --- iFRAME SANDBOX FIX ---
  useEffect(() => {
    const timer = setTimeout(() => {
      if (viewerRef.current?.cesiumElement) {
        const viewer = viewerRef.current.cesiumElement;
        if (viewer.infoBox && viewer.infoBox.frame) {
          viewer.infoBox.frame.setAttribute(
            'sandbox', 
            'allow-same-origin allow-scripts allow-popups allow-forms'
          );
        }
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // --- 3D TERRAIN TOGGLE LOGIK ---
  useEffect(() => {
    if (viewerRef.current?.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement;
      if (layers.terrain3D) {
        createWorldTerrainAsync().then(terrain => {
          viewer.terrainProvider = terrain;
        });
      } else {
        import('cesium').then(({ EllipsoidTerrainProvider }) => {
          viewer.terrainProvider = new EllipsoidTerrainProvider();
        });
      }
    }
  }, [layers.terrain3D]);

  // --- KOORDINATEN EXTRAKTOR ---
  const handleMapClick = (movement: any) => {
    if (!viewerRef.current?.cesiumElement) return;
    const viewer = viewerRef.current.cesiumElement;
    const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
    
    if (cartesian) {
      import('cesium').then(({ Cartographic, Math: CesiumMath }) => {
        const cartographic = Cartographic.fromCartesian(cartesian);
        const lng = CesiumMath.toDegrees(cartographic.longitude).toFixed(5);
        const lat = CesiumMath.toDegrees(cartographic.latitude).toFixed(5);
        const coords = `${lat}, ${lng}`;
        
        navigator.clipboard.writeText(coords);
        setCopiedCoords(coords);
        setTimeout(() => setCopiedCoords(null), 3000);

        if (movement.ctrlKey) {
          setCustomPins(prev => [...prev, { lat: parseFloat(lat), lng: parseFloat(lng) }]);
        }
      });
    }
  };

  // --- LIVE DATA FETCHING LOGIC ---
  const fetchLiveData = useCallback(async () => {
    setIsSyncing(true);
    const now = new Date().toLocaleTimeString();
    
    if (layers.liveEarthquakes) {
      try {
        const eqRes = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
        const eqData = await eqRes.json();
        setEarthquakes(eqData.features);
      } catch (e) { console.error("Earthquake fetch failed", e); }
    }

    if (layers.liveFlights) {
      try {
        const flightRes = await fetch('https://opensky-network.org/api/states/all?lomin=5.0&lomax=11.0&lamin=45.0&lamax=48.0');
        if (flightRes.ok) {
          const flightData = await flightRes.json();
          // UX OPT 1: true_track (f[10]) für Heading auslesen
          const parsedFlights = (flightData.states || []).filter((f: any) => f[5] && f[6]).map((f: any) => ({
            id: f[0], callsign: f[1]?.trim() || 'UNKNOWN', lng: f[5], lat: f[6], alt: f[7] || 10000, 
            velocity: f[9], heading: f[10] || 0 
          }));
          setFlights(parsedFlights);
        }
      } catch (e) { console.error("Flight fetch failed", e); }
    }

    setLastSync(now);
    setTimeout(() => setIsSyncing(false), 800); // Kurzer Delay für den visuellen Puls-Effekt
  }, [layers.liveEarthquakes, layers.liveFlights]);

  useEffect(() => {
    fetchLiveData(); 
    const interval = setInterval(fetchLiveData, 15000);
    return () => clearInterval(interval);
  }, [fetchLiveData]);

  const getEqColor = (mag: number) => {
    if (mag > 5) return Color.RED;
    if (mag > 4) return Color.ORANGE;
    return Color.YELLOW;
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', backgroundColor: '#000' }}>
      
      {/* CSS für den Live-Puls Indikator */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(255, 0, 0, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); }
        }
        .pulse-dot {
          display: inline-block; width: 10px; height: 10px; border-radius: 50%;
          background: red; margin-right: 8px;
        }
        .pulse-dot.active { animation: pulse 1s infinite; background: #ff3333; }
        .glass-panel::-webkit-scrollbar { width: 6px; }
        .glass-panel::-webkit-scrollbar-thumb { background: rgba(0, 255, 204, 0.3); border-radius: 4px; }
      `}</style>

      {/* --- UX OPT 5: GLASSMORPHISM UI PANEL --- */}
      <div className="glass-panel" style={{
        position: 'absolute', top: 20, left: 20, zIndex: 100, width: '340px', maxHeight: '90vh', overflowY: 'auto',
        background: 'rgba(10, 15, 20, 0.65)', color: '#00ffcc', padding: '25px', 
        borderRadius: '16px', border: '1px solid rgba(0, 255, 204, 0.2)', fontFamily: 'monospace',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', 
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
      }}>
        <h2 style={{ margin: '0 0 15px 0', fontSize: '1.3rem', textTransform: 'uppercase', letterSpacing: '2px', textShadow: '0 0 10px rgba(0,255,204,0.5)' }}>
          God's Eye OSINT
        </h2>

        {/* TELEMETRIE & STATUS */}
        <div style={{ background: 'rgba(0, 30, 15, 0.5)', padding: '12px', borderRadius: '10px', marginBottom: '20px', border: '1px solid rgba(0, 255, 204, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', color: '#fff', fontWeight: 'bold' }}>
              <span className={`pulse-dot ${isSyncing ? 'active' : ''}`}></span> 
              {isSyncing ? 'UPDATING...' : 'LIVE SYSTEM'}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#888' }}>{lastSync}</span>
          </div>
          <div style={{ fontSize: '0.85rem', marginTop: '8px', color: '#00ffcc' }}>
            Tracking: <strong>{flights.length}</strong> Flights | <strong>{earthquakes.length}</strong> Quakes
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong style={{ color: '#fff' }}>📡 Data Layers</strong>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.keys(layers).map(layer => (
              <label key={layer} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#ccc', fontSize: '0.9rem' }}>
                <input 
                  type="checkbox" 
                  checked={layers[layer as keyof typeof layers]} 
                  onChange={() => setLayers({...layers, [layer]: !layers[layer as keyof typeof layers]})}
                  style={{ marginRight: '10px', accentColor: '#00ffcc' }}
                />
                {layer.toUpperCase().replace('LIVE', 'LIVE ')}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>
          <strong style={{ color: '#fff' }}>⏱️ Environment</strong>
          <label style={{ display: 'flex', alignItems: 'center', marginTop: '10px', cursor: 'pointer', color: '#ccc', fontSize: '0.9rem' }}>
            <input 
              type="checkbox" 
              checked={syncRealTime} 
              onChange={() => setSyncRealTime(!syncRealTime)}
              style={{ marginRight: '10px', accentColor: '#00ffcc' }}
            />
            Sync Real-Time Shadows
          </label>
        </div>

        <div style={{ marginBottom: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>
          <strong style={{ color: '#fff' }}>🚀 Quick Launch</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            {BOOKMARKS.map((bm, idx) => (
              <button 
                key={idx}
                onClick={() => setActiveBookmark(bm)}
                style={{ 
                  background: 'rgba(0, 255, 204, 0.1)', color: '#00ffcc', border: '1px solid rgba(0,255,204,0.3)', 
                  padding: '8px', cursor: 'pointer', borderRadius: '6px', transition: 'all 0.2s', textAlign: 'left',
                  fontSize: '0.85rem'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0, 255, 204, 0.2)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0, 255, 204, 0.1)'}
              >
                ▶ {bm.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px', fontSize: '0.75rem', color: '#888' }}>
          <p style={{ margin: '0 0 5px 0' }}>📍 <strong>UX Controls:</strong></p>
          <ul style={{ paddingLeft: '15px', margin: '0', lineHeight: '1.4' }}>
            <li>Double-Click aircraft to track</li>
            <li>Use Search bar (Top Right)</li>
            <li>Ctrl+Click to drop custom pin</li>
          </ul>
          {copiedCoords && <div style={{ color: '#00ffcc', marginTop: '10px', fontWeight: 'bold' }}>Copied: {copiedCoords}</div>}
        </div>
      </div>

      {/* --- CESIUM VIEWER --- */}
      <Viewer 
        ref={viewerRef}
        full 
        timeline={true} 
        animation={true} 
        infoBox={true} 
        shadows={true} 
        geocoder={true} 
        homeButton={true}
        navigationHelpButton={false}
        onClick={handleMapClick}
      >
        <Scene />

        {syncRealTime && (
          <Clock 
            startTime={JulianDate.fromDate(new Date())}
            currentTime={JulianDate.fromDate(new Date())}
            clockRange={ClockRange.UNBOUNDED}
            clockStep={ClockStep.SYSTEM_CLOCK_MULTIPLIER}
            multiplier={1}
          />
        )}
        
        {/* UX OPT 4: Kinoreife Lesezeichen mit Pitch und Heading (3D Anflug) */}
        {activeBookmark && (
          <CameraFlyTo 
            destination={Cartesian3.fromDegrees(activeBookmark.lng, activeBookmark.lat, activeBookmark.height)} 
            orientation={{
              heading: CesiumMath.toRadians(activeBookmark.heading),
              pitch: CesiumMath.toRadians(activeBookmark.pitch),
              roll: 0.0
            }}
            duration={3}
            onComplete={() => setActiveBookmark(null)}
          />
        )}

        {/* --- DEINE DIGI4 LINKS --- */}
        {layers.digi4 && DIGI4_LINKS.map((loc, idx) => (
          <Entity 
            key={`digi4-${idx}`}
            name={`Digi4 Cam: ${loc.name}`} 
            position={Cartesian3.fromDegrees(loc.lng, loc.lat, 0)}
            description={`
              <div style="background: #111; padding: 10px; color: white; font-family: sans-serif;">
                <h3 style="margin-top: 0; color: #00ffcc;">${loc.name} System</h3>
                <a href="${loc.url}" target="_blank" style="color: #00ffcc; text-decoration: none; border-bottom: 1px solid #00ffcc;">Open in Fullscreen</a>
                <br/><br/>
                <iframe src="${loc.url}" width="100%" height="300px" style="border: 1px solid #333; border-radius: 8px;"></iframe>
              </div>
            `}
          >
            <PointGraphics pixelSize={18} color={Color.LIME} outlineColor={Color.BLACK} outlineWidth={3} />
          </Entity>
        ))}

        {/* --- UX OPT 1: 3D FLIGHTS (OpenSky) --- */}
        {layers.liveFlights && flights.map((flight) => {
          const position = Cartesian3.fromDegrees(flight.lng, flight.lat, flight.alt);
          const heading = CesiumMath.toRadians(flight.heading - 90);
          const pitch = 0;
          const roll = 0;
          const hpr = new HeadingPitchRoll(heading, pitch, roll);
          const orientation = Transforms.headingPitchRollQuaternion(position, hpr);

          return (
            <Entity 
              key={`flight-${flight.id}`} 
              position={position} 
              orientation={orientation}
              name={`Flight: ${flight.callsign}`}
              description={`
                <div style="color: white; font-family: sans-serif;">
                  <h3 style="margin-top:0; color: #00ffcc;">${flight.callsign}</h3>
                  <p><strong>Altitude:</strong> ${Math.round(flight.alt)} m</p>
                  <p><strong>Velocity:</strong> ${Math.round(flight.velocity * 3.6)} km/h</p>
                  <p><strong>Heading:</strong> ${Math.round(flight.heading)}°</p>
                  <hr style="border: 0; border-top: 1px solid #333;"/>
                  <p style="font-size: 0.8rem; color: #aaa;">Double-click aircraft on map to lock camera tracking.</p>
                </div>
              `}
            >
              <ModelGraphics 
                uri="https://sandcastle.cesium.com/SampleData/models/CesiumAir/Cesium_Air.glb" 
                minimumPixelSize={48} 
                maximumScale={20000} 
              />
            </Entity>
          );
        })}

        {/* --- LIVE EARTHQUAKES (USGS) --- */}
        {layers.liveEarthquakes && earthquakes.map((eq) => {
          const coords = eq.geometry.coordinates;
          const mag = eq.properties.mag;
          return (
            <Entity 
              key={`eq-${eq.id}`} 
              position={Cartesian3.fromDegrees(coords[0], coords[1], 0)} 
              name={`Earthquake: M ${mag}`}
              description={`<div style="color: white;"><h3>${eq.properties.title}</h3><p>Time: ${new Date(eq.properties.time).toLocaleString()}</p></div>`}
            >
              <PointGraphics 
                pixelSize={mag * 5} 
                color={getEqColor(mag).withAlpha(0.6)} 
                outlineColor={getEqColor(mag)} 
                outlineWidth={2} 
              />
            </Entity>
          );
        })}

        {/* --- CUSTOM PINS --- */}
        {customPins.map((pin, idx) => (
          <Entity key={`pin-${idx}`} position={Cartesian3.fromDegrees(pin.lng, pin.lat, 0)} name={`Custom Pin ${idx + 1}`}>
            <PointGraphics pixelSize={14} color={Color.MAGENTA} outlineColor={Color.WHITE} outlineWidth={2} />
          </Entity>
        ))}

      </Viewer>
    </div>
  );
}