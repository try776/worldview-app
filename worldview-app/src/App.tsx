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
  
  // --- MOBILE RESPONSIVE STATE ---
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isMenuOpen, setIsMenuOpen] = useState(!isMobile);

  // --- UI & LAYER STATE ---
  const [layers, setLayers] = useState({
    liveFlights: true,
    liveEarthquakes: true,
    digi4: true,
    terrain3D: true,
    issTracker: false,
    wildfires: false,
    volcanoes: false,
    seaIce: false,
    meteorites: false,
  });
  
  const [copiedCoords, setCopiedCoords] = useState<string | null>(null);
  const [customPins, setCustomPins] = useState<{lat: number, lng: number}[]>([]);
  const [activeBookmark, setActiveBookmark] = useState<any>(null);

  // --- LIVE DATA STATES ---
  const [earthquakes, setEarthquakes] = useState<any[]>([]);
  const [flights, setFlights] = useState<any[]>([]);
  const [issData, setIssData] = useState<any>(null);
  const [wildfiresData, setWildfiresData] = useState<any[]>([]);
  const [volcanoesData, setVolcanoesData] = useState<any[]>([]);
  const [seaIceData, setSeaIceData] = useState<any[]>([]);
  const [meteoriteData, setMeteoriteData] = useState<any[]>([]);
  
  const [lastSync, setLastSync] = useState<string>('Syncing...');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncRealTime, setSyncRealTime] = useState<boolean>(true);

  // --- RESIZE LISTENER FÜR MOBILE ---
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setIsMenuOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- iFRAME SANDBOX FIX (AGGRESSIVE METHODE) ---
  // Entfernt das sandbox-Attribut direkt aus dem DOM, da Cesium es sonst überschreibt.
  useEffect(() => {
    const fixInfoBoxSandbox = () => {
      const iframes = document.querySelectorAll('.cesium-infoBox-iframe');
      iframes.forEach((iframe) => {
        if (iframe.hasAttribute('sandbox')) {
          iframe.removeAttribute('sandbox'); // Sandbox komplett zerstören = alle Skripte erlaubt
        }
      });
    };

    // Wir prüfen jede halbe Sekunde, ob Cesium das iFrame neu generiert hat
    const timer = setInterval(fixInfoBoxSandbox, 500);
    return () => clearInterval(timer);
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

  // --- EINMALIGER FETCH (Statische/Historische OSINT Daten) ---
  useEffect(() => {
    if (layers.meteorites && meteoriteData.length === 0) {
      fetch('https://data.nasa.gov/resource/gh4g-9sfh.json?$limit=100')
        .then(res => res.json())
        .then(data => {
          const validData = data.filter((m: any) => m.reclat && m.reclong);
          setMeteoriteData(validData);
        })
        .catch(e => console.error("Meteorite fetch failed", e));
    }
  }, [layers.meteorites]);

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
          const parsedFlights = (flightData.states || []).filter((f: any) => f[5] && f[6]).map((f: any) => ({
            id: f[0], callsign: f[1]?.trim() || 'UNKNOWN', lng: f[5], lat: f[6], alt: f[7] || 10000, 
            velocity: f[9], heading: f[10] || 0 
          }));
          setFlights(parsedFlights);
        }
      } catch (e) { console.error("Flight fetch failed", e); }
    }

    if (layers.issTracker) {
      try {
        const issRes = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
        const data = await issRes.json();
        setIssData({ lat: data.latitude, lng: data.longitude, alt: data.altitude * 1000, velocity: data.velocity });
      } catch (e) { console.error("ISS fetch failed", e); }
    }

    if (layers.wildfires || layers.volcanoes || layers.seaIce) {
      try {
        const eonetRes = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open');
        const eonetData = await eonetRes.json();
        
        if (layers.wildfires) {
          setWildfiresData(eonetData.events.filter((e: any) => e.categories[0].id === 'wildfires'));
        }
        if (layers.volcanoes) {
          setVolcanoesData(eonetData.events.filter((e: any) => e.categories[0].id === 'volcanoes'));
        }
        if (layers.seaIce) {
          setSeaIceData(eonetData.events.filter((e: any) => e.categories[0].id === 'seaIce'));
        }
      } catch (e) { console.error("EONET fetch failed", e); }
    }

    setLastSync(now);
    setTimeout(() => setIsSyncing(false), 800);
  }, [layers]);

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
        
        /* Mobile Hamburger Button */
        .mobile-toggle {
          position: absolute; bottom: 20px; right: 20px; z-index: 200;
          background: rgba(10, 15, 20, 0.85); color: #00ffcc; border: 1px solid #00ffcc;
          padding: 12px; border-radius: 50%; cursor: pointer;
          backdrop-filter: blur(10px); box-shadow: 0 4px 15px rgba(0,0,0,0.5);
          display: none;
        }
        @media (max-width: 768px) {
          .mobile-toggle { display: block; }
        }
      `}</style>

      {/* MOBILE TOGGLE BUTTON */}
      <button className="mobile-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)}>
        {isMenuOpen ? '✖' : '☰'}
      </button>

      {/* --- GLASSMORPHISM UI PANEL (Responsive) --- */}
      <div className="glass-panel" style={{
        position: 'absolute', 
        top: isMobile ? 'auto' : 20, 
        bottom: isMobile ? (isMenuOpen ? 20 : '-100%') : 'auto',
        left: isMobile ? '5%' : 20, 
        zIndex: 100, 
        width: isMobile ? '90%' : '340px', 
        maxHeight: isMobile ? '70vh' : '90vh', 
        overflowY: 'auto',
        background: 'rgba(10, 15, 20, 0.75)', color: '#00ffcc', padding: '25px', 
        borderRadius: '16px', border: '1px solid rgba(0, 255, 204, 0.2)', fontFamily: 'monospace',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', 
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
        transition: 'bottom 0.3s ease-in-out',
        boxSizing: 'border-box'
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
          <div style={{ fontSize: '0.85rem', marginTop: '8px', color: '#00ffcc', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            Tracking: <strong>{flights.length}</strong> FLT | <strong>{earthquakes.length}</strong> EQ | <strong>{wildfiresData.length}</strong> FIRE
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong style={{ color: '#fff' }}>📡 Data Layers</strong>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.keys(layers).map(layer => (
              <label key={layer} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#ccc', fontSize: '0.9rem', padding: '4px 0' }}>
                <input 
                  type="checkbox" 
                  checked={layers[layer as keyof typeof layers]} 
                  onChange={() => setLayers({...layers, [layer]: !layers[layer as keyof typeof layers]})}
                  style={{ marginRight: '10px', accentColor: '#00ffcc', width: '16px', height: '16px' }}
                />
                {layer.replace(/([A-Z])/g, ' $1').toUpperCase()}
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
              style={{ marginRight: '10px', accentColor: '#00ffcc', width: '16px', height: '16px' }}
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
                onClick={() => { setActiveBookmark(bm); if(isMobile) setIsMenuOpen(false); }}
                style={{ 
                  background: 'rgba(0, 255, 204, 0.1)', color: '#00ffcc', border: '1px solid rgba(0,255,204,0.3)', 
                  padding: '10px', cursor: 'pointer', borderRadius: '6px', transition: 'all 0.2s', textAlign: 'left',
                  fontSize: '0.85rem'
                }}
              >
                ▶ {bm.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px', fontSize: '0.75rem', color: '#888' }}>
          <p style={{ margin: '0 0 5px 0' }}>📍 <strong>UX Controls:</strong></p>
          <ul style={{ paddingLeft: '15px', margin: '0', lineHeight: '1.4' }}>
            <li>Double-Click / Tap aircraft to track</li>
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
                <a href="${loc.url}" target="_blank" rel="noopener noreferrer" style="color: #00ffcc; text-decoration: none; border-bottom: 1px solid #00ffcc;">Open in Fullscreen (New Tab)</a>
                <br/><br/>
                <iframe src="${loc.url}" width="100%" height="300px" style="border: 1px solid #333; border-radius: 8px;"></iframe>
              </div>
            `}
          >
            <PointGraphics pixelSize={18} color={Color.LIME} outlineColor={Color.BLACK} outlineWidth={3} />
          </Entity>
        ))}

        {/* --- 3D FLIGHTS (OpenSky) --- */}
        {layers.liveFlights && flights.map((flight) => {
          const position = Cartesian3.fromDegrees(flight.lng, flight.lat, flight.alt);
          const heading = CesiumMath.toRadians(flight.heading - 90);
          const hpr = new HeadingPitchRoll(heading, 0, 0);
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

        {/* --- LIVE EARTHQUAKES --- */}
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
              <PointGraphics pixelSize={mag * 5} color={getEqColor(mag).withAlpha(0.6)} outlineColor={getEqColor(mag)} outlineWidth={2} />
            </Entity>
          );
        })}

        {/* --- NEU: ISS TRACKER --- */}
        {layers.issTracker && issData && (
          <Entity
            name="International Space Station"
            position={Cartesian3.fromDegrees(issData.lng, issData.lat, issData.alt)}
            description={`<div style="color: white;"><h3>ISS Telemetry</h3><p>Altitude: ${(issData.alt / 1000).toFixed(2)} km</p><p>Velocity: ${issData.velocity.toFixed(2)} km/h</p></div>`}
          >
            <PointGraphics pixelSize={20} color={Color.CYAN} outlineColor={Color.WHITE} outlineWidth={3} />
          </Entity>
        )}

        {/* --- NEU: NASA WILDFIRES --- */}
        {layers.wildfires && wildfiresData.map((fire: any) => {
          const coords = fire.geometry[0].coordinates;
          return (
            <Entity key={`fire-${fire.id}`} position={Cartesian3.fromDegrees(coords[0], coords[1], 0)} name={fire.title} description={`<div style="color: white;"><h3>${fire.title}</h3><p>Date: ${new Date(fire.geometry[0].date).toLocaleString()}</p></div>`}>
              <PointGraphics pixelSize={12} color={Color.ORANGERED} outlineColor={Color.BLACK} outlineWidth={2} />
            </Entity>
          );
        })}

        {/* --- NEU: NASA VOLCANOES --- */}
        {layers.volcanoes && volcanoesData.map((volcano: any) => {
          const coords = volcano.geometry[0].coordinates;
          return (
            <Entity key={`volc-${volcano.id}`} position={Cartesian3.fromDegrees(coords[0], coords[1], 0)} name={volcano.title} description={`<div style="color: white;"><h3>${volcano.title}</h3><p>Date: ${new Date(volcano.geometry[0].date).toLocaleString()}</p></div>`}>
              <PointGraphics pixelSize={14} color={Color.DARKRED} outlineColor={Color.YELLOW} outlineWidth={2} />
            </Entity>
          );
        })}

        {/* --- NEU: NASA SEA ICE / ICEBERGS --- */}
        {layers.seaIce && seaIceData.map((ice: any) => {
          const coords = ice.geometry[0].coordinates;
          return (
            <Entity key={`ice-${ice.id}`} position={Cartesian3.fromDegrees(coords[0], coords[1], 0)} name={ice.title} description={`<div style="color: white;"><h3>${ice.title}</h3><p>Date: ${new Date(ice.geometry[0].date).toLocaleString()}</p></div>`}>
              <PointGraphics pixelSize={12} color={Color.LIGHTCYAN} outlineColor={Color.BLUE} outlineWidth={2} />
            </Entity>
          );
        })}

        {/* --- NEU: NASA METEORITES --- */}
        {layers.meteorites && meteoriteData.map((met: any) => {
          const mass = parseFloat(met.mass) || 1000;
          const size = Math.min(Math.max(mass / 50000, 5), 25);
          return (
            <Entity key={`met-${met.id}`} position={Cartesian3.fromDegrees(parseFloat(met.reclong), parseFloat(met.reclat), 0)} name={`Meteorite: ${met.name}`} description={`<div style="color: white;"><h3>${met.name}</h3><p>Class: ${met.recclass}</p><p>Mass: ${mass}g</p><p>Year: ${met.year ? met.year.substring(0,4) : 'Unknown'}</p></div>`}>
              <PointGraphics pixelSize={size} color={Color.SLATEGRAY} outlineColor={Color.BLACK} outlineWidth={1} />
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