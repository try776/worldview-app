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
  createOsmBuildingsAsync,
  ClockRange,
  ClockStep,
  Math as CesiumMath,
  HeadingPitchRoll,
  Transforms
} from 'cesium';

// --- 1. DEINE SPEZIFISCHEN LINKS (Region Bern) --- , , , 
const DIGI4_LINKS = [
  { name: 'Neuenegg', lat: 46.89717, lng: 7.30725, url: 'https://neuenegg.digi4.click/' },
  { name: 'Bramberg', lat: 46.91195, lng: 7.28276, url: 'https://bramberg.digi4.click/' },
  { name: 'Grauholz', lat: 47.01004, lng: 7.49563, url: 'https://grauholz.digi4.click/' },
];

const BOOKMARKS = [
  { name: 'Operation Epic Fury', lat: 35.6892, lng: 51.3890, height: 150000, pitch: -45, heading: 20 },
  { name: 'Bern', lat: 46.948, lng: 7.447, height: 8000, pitch: -35, heading: 0 },
  { name: 'Strait of Hormuz', lat: 26.5667, lng: 56.2500, height: 200000, pitch: -50, heading: 45 },
];

export default function App() {
  const viewerRef = useRef<any>(null);
  
  // --- UI STATES ---
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isMenuOpen, setIsMenuOpen] = useState(!isMobile);
  
  // Custom Modal für Splat App
  const [activeSplatUrl, setActiveSplatUrl] = useState<string | null>(null);
  const [activeSplatName, setActiveSplatName] = useState<string | null>(null);

  const [layers, setLayers] = useState({
    liveFlights: true,
    liveEarthquakes: true,
    digi4: true,
    terrain3D: true,
    osmBuildings: false, 
    issTracker: false,
    wildfires: false,
    volcanoes: false,
    severeStorms: false, 
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
  const [stormsData, setStormsData] = useState<any[]>([]);
  const [seaIceData, setSeaIceData] = useState<any[]>([]);
  const [meteoriteData, setMeteoriteData] = useState<any[]>([]);
  
  const [lastSync, setLastSync] = useState<string>('Syncing...');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncRealTime, setSyncRealTime] = useState<boolean>(true);
  const [globeLighting, setGlobeLighting] = useState<boolean>(false); 

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setIsMenuOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Terrain Layer Toggle
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

  // OSM Buildings Layer Toggle
  useEffect(() => {
    if (!viewerRef.current?.cesiumElement) return;
    const viewer = viewerRef.current.cesiumElement;
    let tileset: any;

    if (layers.osmBuildings) {
      createOsmBuildingsAsync().then(ts => {
        tileset = ts;
        viewer.scene.primitives.add(tileset);
      });
    }

    return () => {
      if (tileset && !viewer.isDestroyed) {
        viewer.scene.primitives.remove(tileset);
      }
    };
  }, [layers.osmBuildings]);

  // Globe Lighting Toggle
  useEffect(() => {
    if (viewerRef.current?.cesiumElement) {
      viewerRef.current.cesiumElement.scene.globe.enableLighting = globeLighting;
    }
  }, [globeLighting]);

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

  // --- KLICK-LOGIK ---
  const handleMapClick = (movement: any) => {
    if (!viewerRef.current?.cesiumElement) return;
    const viewer = viewerRef.current.cesiumElement;
    
    const pickedObject = viewer.scene.pick(movement.position);
    if (pickedObject && pickedObject.id && typeof pickedObject.id.name === 'string' && pickedObject.id.name.startsWith('Digi4 Cam:')) {
      const camName = pickedObject.id.name.replace('Digi4 Cam: ', '');
      const link = DIGI4_LINKS.find(l => l.name === camName);
      if (link) {
        setActiveSplatUrl(link.url);
        setActiveSplatName(camName);
        setTimeout(() => { viewer.selectedEntity = undefined; }, 10);
        return; 
      }
    }

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

  const dropPinAtCenter = () => {
    if (!viewerRef.current?.cesiumElement) return;
    const viewer = viewerRef.current.cesiumElement;
    const canvas = viewer.canvas;
    const center = new Cartesian3(canvas.clientWidth / 2, canvas.clientHeight / 2, 0);
    const cartesian = viewer.camera.pickEllipsoid(center, viewer.scene.globe.ellipsoid);
    
    if (cartesian) {
      import('cesium').then(({ Cartographic, Math: CesiumMath }) => {
        const cartographic = Cartographic.fromCartesian(cartesian);
        const lng = CesiumMath.toDegrees(cartographic.longitude);
        const lat = CesiumMath.toDegrees(cartographic.latitude);
        setCustomPins(prev => [...prev, { lat, lng }]);
      });
    }
  };

  const locateMe = () => {
    if (navigator.geolocation && viewerRef.current?.cesiumElement) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        viewerRef.current.cesiumElement.camera.flyTo({
          destination: Cartesian3.fromDegrees(longitude, latitude, 5000),
          duration: 2
        });
      }, (err) => console.warn("GPS failed", err));
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  };

  const fetchLiveData = useCallback(async () => {
    setIsSyncing(true);
    const now = new Date().toLocaleTimeString();
    
    if (layers.liveEarthquakes) {
      try {
        const eqRes = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
        const eqData = await eqRes.json();
        setEarthquakes(eqData.features);
      } catch (e) {}
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
      } catch (e) {}
    }

    if (layers.issTracker) {
      try {
        const issRes = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
        const data = await issRes.json();
        setIssData({ lat: data.latitude, lng: data.longitude, alt: data.altitude * 1000, velocity: data.velocity });
      } catch (e) {}
    }

    if (layers.wildfires || layers.volcanoes || layers.seaIce || layers.severeStorms) {
      try {
        const eonetRes = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open');
        const eonetData = await eonetRes.json();
        if (layers.wildfires) setWildfiresData(eonetData.events.filter((e: any) => e.categories[0].id === 'wildfires'));
        if (layers.volcanoes) setVolcanoesData(eonetData.events.filter((e: any) => e.categories[0].id === 'volcanoes'));
        if (layers.seaIce) setSeaIceData(eonetData.events.filter((e: any) => e.categories[0].id === 'seaIce'));
        if (layers.severeStorms) setStormsData(eonetData.events.filter((e: any) => e.categories[0].id === 'severeStorms'));
      } catch (e) {}
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
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', backgroundColor: '#000', position: 'relative' }}>
      
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(255, 0, 0, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); }
        }
        .pulse-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: red; margin-right: 8px; }
        .pulse-dot.active { animation: pulse 1s infinite; background: #ff3333; }
        .glass-panel::-webkit-scrollbar { width: 6px; }
        .glass-panel::-webkit-scrollbar-thumb { background: rgba(0, 255, 204, 0.3); border-radius: 4px; }
        
        .mobile-toggle {
          position: absolute; bottom: 20px; right: 20px; z-index: 200; background: rgba(10, 15, 20, 0.85); color: #00ffcc; 
          border: 1px solid #00ffcc; padding: 12px 16px; border-radius: 50px; cursor: pointer; backdrop-filter: blur(10px); display: none;
          font-family: monospace; font-weight: bold; box-shadow: 0 4px 15px rgba(0,255,204,0.3);
        }
        
        @media (max-width: 768px) { 
          .mobile-toggle { display: block; } 
          .glass-panel {
            top: auto !important;
            bottom: 0 !important;
            left: 0 !important;
            width: 100% !important;
            border-radius: 20px 20px 0 0 !important;
            transform: translateY(${isMenuOpen ? '0%' : '100%'});
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            max-height: 80vh !important;
            border-left: none !important;
            border-right: none !important;
            border-bottom: none !important;
          }
        }
      `}</style>

      {activeSplatUrl && (
        <div style={{
          position: 'absolute', top: isMobile ? '5%' : '10%', left: isMobile ? '5%' : '15%', 
          width: isMobile ? '90%' : '70%', height: isMobile ? '90%' : '80%', 
          zIndex: 9999, background: 'rgba(10, 15, 20, 0.95)', border: '1px solid #00ffcc', 
          borderRadius: '12px', display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 40px rgba(0, 255, 204, 0.3)', backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid rgba(0,255,204,0.2)' }}>
            <h3 style={{ margin: 0, color: '#00ffcc', fontFamily: 'monospace', fontSize: isMobile ? '1rem' : '1.17rem' }}>🛰️ SPLAT FEED: {activeSplatName?.toUpperCase()}</h3>
            <div style={{display: 'flex', gap: '15px'}}>
              <a href={activeSplatUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#fff', textDecoration: 'none', fontFamily: 'monospace', alignSelf: 'center', fontSize: '0.85rem' }}>[ NEW TAB ]</a>
              <button onClick={() => setActiveSplatUrl(null)} style={{ background: 'rgba(255, 51, 51, 0.2)', border: '1px solid #ff3333', color: '#ff3333', padding: '5px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
            </div>
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
            <iframe 
              src={`${activeSplatUrl}?mode=embed`} 
              style={{ width: '100%', height: '100%', border: 'none' }} 
              title={`Splat Viewer ${activeSplatName}`} 
              allow="autoplay; fullscreen; xr-spatial-tracking" 
            />
          </div>
        </div>
      )}

      <button className="mobile-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)}>
        {isMenuOpen ? 'CLOSE DATA PANNEL ▼' : 'OPEN DATA PANNEL ▲'}
      </button>

      <div className="glass-panel" style={{
        position: 'absolute', top: 20, left: 20, zIndex: 100, width: '340px', maxHeight: '90vh', overflowY: 'auto',
        background: 'rgba(10, 15, 20, 0.85)', color: '#00ffcc', padding: '25px', borderRadius: '16px', border: '1px solid rgba(0, 255, 204, 0.2)', 
        fontFamily: 'monospace', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)', boxSizing: 'border-box'
      }}>
        {isMobile && <div style={{width: '40px', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px', margin: '0 auto 15px auto'}} />}

        <h2 style={{ margin: '0 0 15px 0', fontSize: '1.3rem', textTransform: 'uppercase', letterSpacing: '2px', textShadow: '0 0 10px rgba(0,255,204,0.5)' }}>God's Eye OSINT</h2>

        <div style={{ background: 'rgba(0, 30, 15, 0.5)', padding: '12px', borderRadius: '10px', marginBottom: '20px', border: '1px solid rgba(0, 255, 204, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', color: '#fff', fontWeight: 'bold' }}>
              <span className={`pulse-dot ${isSyncing ? 'active' : ''}`}></span> {isSyncing ? 'UPDATING...' : 'LIVE SYSTEM'}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#888' }}>{lastSync}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
          <button onClick={locateMe} style={{ background: 'rgba(0, 150, 255, 0.2)', color: '#4da6ff', border: '1px solid #4da6ff', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
            🎯 Locate Me
          </button>
          <button onClick={dropPinAtCenter} style={{ background: 'rgba(255, 0, 255, 0.2)', color: '#ff4dff', border: '1px solid #ff4dff', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
            📍 Drop Pin
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong style={{ color: '#fff' }}>📡 Data Layers</strong>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.keys(layers).map(layer => (
              <label key={layer} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#ccc', fontSize: '0.9rem', padding: '4px 0' }}>
                <input type="checkbox" checked={layers[layer as keyof typeof layers]} onChange={() => setLayers({...layers, [layer]: !layers[layer as keyof typeof layers]})} style={{ marginRight: '10px', accentColor: '#00ffcc', width: '16px', height: '16px' }} />
                {layer.replace(/([A-Z])/g, ' $1').toUpperCase()}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>
          <strong style={{ color: '#fff' }}>⏱️ Environment & System</strong>
          <label style={{ display: 'flex', alignItems: 'center', marginTop: '10px', cursor: 'pointer', color: '#ccc', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={syncRealTime} onChange={() => setSyncRealTime(!syncRealTime)} style={{ marginRight: '10px', accentColor: '#00ffcc', width: '16px', height: '16px' }} />
            Sync Real-Time Clock
          </label>
          <label style={{ display: 'flex', alignItems: 'center', marginTop: '10px', cursor: 'pointer', color: '#ccc', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={globeLighting} onChange={() => setGlobeLighting(!globeLighting)} style={{ marginRight: '10px', accentColor: '#ffcc00', width: '16px', height: '16px' }} />
            Day/Night Lighting (Sun)
          </label>
        </div>

        <div style={{ marginBottom: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>
          <strong style={{ color: '#fff' }}>🚀 Quick Launch</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            {BOOKMARKS.map((bm, idx) => (
              <button key={idx} onClick={() => { setActiveBookmark(bm); if(isMobile) setIsMenuOpen(false); }} style={{ background: 'rgba(0, 255, 204, 0.1)', color: '#00ffcc', border: '1px solid rgba(0,255,204,0.3)', padding: '10px', cursor: 'pointer', borderRadius: '6px', textAlign: 'left', fontSize: '0.85rem' }}>
                ▶ {bm.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px', fontSize: '0.75rem', color: '#888' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <p style={{ margin: 0 }}>📍 <strong>UX Controls:</strong></p>
            {customPins.length > 0 && (
              <button onClick={() => setCustomPins([])} style={{ background: 'transparent', color: '#ff3333', border: 'none', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>Clear Pins</button>
            )}
          </div>
          <ul style={{ paddingLeft: '15px', margin: '0', lineHeight: '1.4' }}>
            <li>Click points for Info/Splat</li>
            <li>Double-Click aircraft to track</li>
            <li>Ctrl+Click (Desktop) to drop pin</li>
          </ul>
          {copiedCoords && <div style={{ color: '#00ffcc', marginTop: '10px', fontWeight: 'bold' }}>Copied: {copiedCoords}</div>}
        </div>
      </div>

      <Viewer 
        ref={viewerRef} 
        full 
        timeline={!isMobile} 
        animation={!isMobile} 
        infoBox={true} 
        shadows={globeLighting} 
        geocoder={true} 
        homeButton={true} 
        navigationHelpButton={false}
        onClick={handleMapClick}
      >
        <Scene />

        {syncRealTime && (
          <Clock startTime={JulianDate.fromDate(new Date())} currentTime={JulianDate.fromDate(new Date())} clockRange={ClockRange.UNBOUNDED} clockStep={ClockStep.SYSTEM_CLOCK_MULTIPLIER} multiplier={1} />
        )}
        
        {activeBookmark && (
          <CameraFlyTo destination={Cartesian3.fromDegrees(activeBookmark.lng, activeBookmark.lat, activeBookmark.height)} orientation={{ heading: CesiumMath.toRadians(activeBookmark.heading), pitch: CesiumMath.toRadians(activeBookmark.pitch), roll: 0.0 }} duration={3} onComplete={() => setActiveBookmark(null)} />
        )}

        {layers.digi4 && DIGI4_LINKS.map((loc, idx) => (
          <Entity 
            key={`digi4-${idx}`} name={`Digi4 Cam: ${loc.name}`} position={Cartesian3.fromDegrees(loc.lng, loc.lat, 0)}
            description={`
              <div style="background: #111; padding: 10px; color: white; font-family: sans-serif;">
                <h3 style="margin-top: 0; color: #00ffcc;">${loc.name} System</h3>
                <p>Click the point directly on the map to open the Live Splat Stream as an overlay.</p>
                <a href="${loc.url}" target="_blank" rel="noopener noreferrer" style="color: #00ffcc; text-decoration: none; border-bottom: 1px solid #00ffcc;">Open in New Tab</a>
              </div>
            `}
          >
            <PointGraphics pixelSize={18} color={Color.LIME} outlineColor={Color.BLACK} outlineWidth={3} />
          </Entity>
        ))}

        {layers.liveFlights && flights.map((flight) => {
          const position = Cartesian3.fromDegrees(flight.lng, flight.lat, flight.alt);
          const heading = CesiumMath.toRadians(flight.heading - 90);
          const orientation = Transforms.headingPitchRollQuaternion(position, new HeadingPitchRoll(heading, 0, 0));
          return (
            <Entity key={`flight-${flight.id}`} position={position} orientation={orientation} name={`Flight: ${flight.callsign}`} description={`<div style="color: white; font-family: sans-serif;"><h3 style="margin-top:0; color: #00ffcc;">${flight.callsign}</h3><p><strong>Altitude:</strong> ${Math.round(flight.alt)} m</p><p><strong>Velocity:</strong> ${Math.round(flight.velocity * 3.6)} km/h</p></div>`}>
              {/* Hier ist der aktualisierte lokale Pfad: */}
              <ModelGraphics uri="/Cesium_Air.glb" minimumPixelSize={48} maximumScale={20000} />
            </Entity>
          );
        })}

        {layers.liveEarthquakes && earthquakes.map((eq) => {
          const coords = eq.geometry.coordinates; const mag = eq.properties.mag;
          return (
            <Entity key={`eq-${eq.id}`} position={Cartesian3.fromDegrees(coords[0], coords[1], 0)} name={`Earthquake: M ${mag}`} description={`<div style="color: white;"><h3>${eq.properties.title}</h3></div>`}>
              <PointGraphics pixelSize={mag * 5} color={getEqColor(mag).withAlpha(0.6)} outlineColor={getEqColor(mag)} outlineWidth={2} />
            </Entity>
          );
        })}

        {layers.issTracker && issData && (
          <Entity name="International Space Station" position={Cartesian3.fromDegrees(issData.lng, issData.lat, issData.alt)}>
            <PointGraphics pixelSize={20} color={Color.CYAN} outlineColor={Color.WHITE} outlineWidth={3} />
          </Entity>
        )}

        {layers.wildfires && wildfiresData.map((fire: any) => (
          <Entity key={`fire-${fire.id}`} position={Cartesian3.fromDegrees(fire.geometry[0].coordinates[0], fire.geometry[0].coordinates[1], 0)} name={fire.title}>
            <PointGraphics pixelSize={12} color={Color.ORANGERED} outlineColor={Color.BLACK} outlineWidth={2} />
          </Entity>
        ))}

        {layers.volcanoes && volcanoesData.map((volcano: any) => (
          <Entity key={`volc-${volcano.id}`} position={Cartesian3.fromDegrees(volcano.geometry[0].coordinates[0], volcano.geometry[0].coordinates[1], 0)} name={volcano.title}>
            <PointGraphics pixelSize={14} color={Color.DARKRED} outlineColor={Color.YELLOW} outlineWidth={2} />
          </Entity>
        ))}

        {layers.severeStorms && stormsData.map((storm: any) => (
          <Entity key={`storm-${storm.id}`} position={Cartesian3.fromDegrees(storm.geometry[0].coordinates[0], storm.geometry[0].coordinates[1], 0)} name={storm.title}>
            <PointGraphics pixelSize={16} color={Color.BLUEVIOLET} outlineColor={Color.WHITE} outlineWidth={2} />
          </Entity>
        ))}

        {layers.seaIce && seaIceData.map((ice: any) => (
          <Entity key={`ice-${ice.id}`} position={Cartesian3.fromDegrees(ice.geometry[0].coordinates[0], ice.geometry[0].coordinates[1], 0)} name={ice.title}>
            <PointGraphics pixelSize={12} color={Color.LIGHTCYAN} outlineColor={Color.BLUE} outlineWidth={2} />
          </Entity>
        ))}

        {layers.meteorites && meteoriteData.map((met: any) => {
          const size = Math.min(Math.max((parseFloat(met.mass) || 1000) / 50000, 5), 25);
          return (
            <Entity key={`met-${met.id}`} position={Cartesian3.fromDegrees(parseFloat(met.reclong), parseFloat(met.reclat), 0)} name={met.name}>
              <PointGraphics pixelSize={size} color={Color.SLATEGRAY} outlineColor={Color.BLACK} outlineWidth={1} />
            </Entity>
          );
        })}

        {customPins.map((pin, idx) => (
          <Entity key={`pin-${idx}`} position={Cartesian3.fromDegrees(pin.lng, pin.lat, 0)} name={`Custom Pin ${idx + 1}`}>
            <PointGraphics pixelSize={14} color={Color.MAGENTA} outlineColor={Color.WHITE} outlineWidth={2} />
          </Entity>
        ))}

      </Viewer>
    </div>
  );
}