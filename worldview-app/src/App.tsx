// src/App.tsx
import { useState, useRef, useEffect } from 'react';
import { Viewer, Entity, PointGraphics, Clock, Scene, CameraFlyTo } from 'resium';
import { 
  Cartesian3, 
  Color, 
  JulianDate, 
  ScreenSpaceEventHandler, 
  ScreenSpaceEventType, 
  createWorldTerrainAsync,
  IonResource
} from 'cesium';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import outputs from '../amplify_outputs.json';
import { Amplify } from 'aws-amplify';

Amplify.configure(outputs);
const client = generateClient<Schema>();

// --- 1. DEINE SPEZIFISCHEN LINKS (Region Bern) ---
const DIGI4_LINKS = [
  { name: 'Neuenegg', lat: 46.898, lng: 7.298, url: 'https://neuenegg.digi4.click/' },
  { name: 'Bramberg', lat: 46.887, lng: 7.318, url: 'https://bramberg.digi4.click/' },
  { name: 'Grauholz', lat: 47.008, lng: 7.491, url: 'https://grauholz.digi4.click/' },
];

// --- KAMERA-LESEZEICHEN (Bookmarks) ---
const BOOKMARKS = [
  { name: 'Operation Epic Fury (Iran)', lat: 35.6892, lng: 51.3890, height: 2500000 },
  { name: 'Bern HQ (Digi4)', lat: 46.948, lng: 7.447, height: 15000 },
  { name: 'Strait of Hormuz', lat: 26.5667, lng: 56.2500, height: 1000000 },
];

export default function App() {
  const viewerRef = useRef<any>(null);
  
  // --- UI & LAYER STATE ---
  const [layers, setLayers] = useState({
    adsb: true,
    jamming: true,
    satellites: false,
    firms: false,
    acled: false,
    digi4: true,
    terrain3D: false
  });
  const [copiedCoords, setCopiedCoords] = useState<string | null>(null);
  const [customPins, setCustomPins] = useState<{lat: number, lng: number}[]>([]);
  const [activeBookmark, setActiveBookmark] = useState<any>(null);

  // --- 3D TERRAIN TOGGLE LOGIK ---
  useEffect(() => {
    if (viewerRef.current?.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement;
      if (layers.terrain3D) {
        createWorldTerrainAsync().then(terrain => {
          viewer.terrainProvider = terrain;
        });
      } else {
        // Fallback zu flachem Terrain (Workaround für aktuelles Cesium)
        import('cesium').then(({ EllipsoidTerrainProvider }) => {
          viewer.terrainProvider = new EllipsoidTerrainProvider();
        });
      }
    }
  }, [layers.terrain3D]);

  // --- KOORDINATEN EXTRAKTOR (Mausklick) ---
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
        
        // In Zwischenablage kopieren
        navigator.clipboard.writeText(coords);
        setCopiedCoords(coords);
        setTimeout(() => setCopiedCoords(null), 3000);

        // Optional: Custom Pin setzen
        if (movement.ctrlKey) {
          setCustomPins(prev => [...prev, { lat: parseFloat(lat), lng: parseFloat(lng) }]);
        }
      });
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', backgroundColor: '#000' }}>
      
      {/* --- COMMAND CENTER UI PANEL --- */}
      <div style={{
        position: 'absolute', top: 20, left: 20, zIndex: 100, width: '320px',
        background: 'rgba(15, 20, 25, 0.85)', color: '#00ffcc', padding: '20px', 
        borderRadius: '12px', border: '1px solid #00ffcc', fontFamily: 'monospace',
        backdropFilter: 'blur(10px)', boxShadow: '0 0 20px rgba(0, 255, 204, 0.2)'
      }}>
        <h2 style={{ margin: '0 0 15px 0', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '2px' }}>
          God's Eye OSINT
        </h2>

        <div style={{ marginBottom: '15px' }}>
          <strong>📡 OSINT Data Layers</strong>
          {Object.keys(layers).map(layer => (
            <label key={layer} style={{ display: 'block', margin: '8px 0', cursor: 'pointer', color: '#fff' }}>
              <input 
                type="checkbox" 
                checked={layers[layer as keyof typeof layers]} 
                onChange={() => setLayers({...layers, [layer]: !layers[layer as keyof typeof layers]})}
                style={{ marginRight: '10px' }}
              />
              {layer.toUpperCase()}
            </label>
          ))}
        </div>

        <div style={{ marginBottom: '15px', borderTop: '1px solid #333', paddingTop: '15px' }}>
          <strong>🚀 Camera Bookmarks</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            {BOOKMARKS.map((bm, idx) => (
              <button 
                key={idx}
                onClick={() => setActiveBookmark(bm)}
                style={{ background: '#003322', color: '#00ffcc', border: '1px solid #00ffcc', padding: '5px', cursor: 'pointer', borderRadius: '4px' }}
              >
                {bm.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #333', paddingTop: '15px', fontSize: '0.8rem', color: '#aaa' }}>
          <p>📍 <strong>Features Active:</strong></p>
          <ul style={{ paddingLeft: '15px', margin: '5px 0' }}>
            <li>Click map to copy coordinates</li>
            <li>Ctrl+Click to drop custom pin</li>
            <li>Shadows & Sun synced to 4D Time</li>
            <li>Full AWS Amplify Gen 2 Sync</li>
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
        infoBox={true} // Wichtig: Aktiviert, damit die iFrames angezeigt werden
        shadows={true} // Feature 6: Echtzeit Schatten
        onClick={handleMapClick}
      >
        <Scene />
        
        {/* Sprung-Logik für Bookmarks */}
        {activeBookmark && (
          <CameraFlyTo 
            destination={Cartesian3.fromDegrees(activeBookmark.lng, activeBookmark.lat, activeBookmark.height)} 
            duration={2.5}
            onComplete={() => setActiveBookmark(null)}
          />
        )}

        {/* --- DEINE DIGI4 LINKS --- */}
        {layers.digi4 && DIGI4_LINKS.map((loc, idx) => (
          <Entity 
            key={`digi4-${idx}`}
            name={`Digi4 Cam: ${loc.name}`} 
            position={Cartesian3.fromDegrees(loc.lng, loc.lat, 0)}
            // iFrame Injection in die Cesium InfoBox
            description={`
              <div style="background: #222; padding: 10px; color: white;">
                <h3>${loc.name} System</h3>
                <a href="${loc.url}" target="_blank" style="color: #00ffcc;">Open in new tab</a>
                <br/><br/>
                <iframe src="${loc.url}" width="100%" height="300px" style="border: none; border-radius: 8px;"></iframe>
              </div>
            `}
          >
            <PointGraphics pixelSize={15} color={Color.LIME} outlineColor={Color.BLACK} outlineWidth={2} />
          </Entity>
        ))}

        {/* --- CUSTOM PINS (Ctrl + Click) --- */}
        {customPins.map((pin, idx) => (
          <Entity key={`pin-${idx}`} position={Cartesian3.fromDegrees(pin.lng, pin.lat, 0)} name={`Custom Pin ${idx + 1}`}>
            <PointGraphics pixelSize={12} color={Color.MAGENTA} outlineColor={Color.WHITE} outlineWidth={2} />
          </Entity>
        ))}

        {/* --- MOCK OSINT DATEN --- */}
        {layers.jamming && (
          <Entity position={Cartesian3.fromDegrees(51.3890, 35.6892, 0)} name="GPS Jamming Signal Detected">
            <PointGraphics pixelSize={25} color={Color.RED.withAlpha(0.6)} outlineColor={Color.RED} outlineWidth={2} />
          </Entity>
        )}

        {layers.firms && (
          <Entity position={Cartesian3.fromDegrees(49.8890, 34.6892, 0)} name="NASA FIRMS: Thermal Anomaly">
            <PointGraphics pixelSize={10} color={Color.ORANGE} outlineColor={Color.YELLOW} outlineWidth={2} />
          </Entity>
        )}

      </Viewer>
    </div>
  );
}