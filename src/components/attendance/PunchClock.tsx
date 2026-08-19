import React, { useState, useEffect, useRef } from 'react';

interface Punch {
  punch_type: string;
  timestamp: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  selfie_url?: string;
}

export function PunchClock({ userRole }: { userRole?: string }) {
  const [punches, setPunches] = useState<Punch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workMode, setWorkMode] = useState<'Office' | 'On site' | 'Manual'>('Office');
  const [officeLocation, setOfficeLocation] = useState('Head Office - Lower Parel');

  // Selfie State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/attendance/punches/status');
      if (res.ok) {
        const data = await res.json();
        setPunches(data);
      }
    } catch (e) {
      console.error('Failed to fetch punch status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    return () => stopCamera(); // Cleanup on unmount
  }, []);

  useEffect(() => {
    if (videoRef.current && stream && cameraActive && !selfieBase64) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.error('Error playing video:', e));
    }
  }, [cameraActive, stream, selfieBase64]);

  const startCamera = async () => {
    try {
      setError(null);
      let s;
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      } catch(e) {
        s = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      setStream(s);
      setCameraActive(true);
    } catch (err) {
      setError('Camera access is required to take a selfie for punching.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // A punch-in selfie only has to be recognisable, so it is downscaled and compressed
  // before upload. The full camera frame at the browser's default quality (0.92) was
  // ~53 kB per punch once base64-encoded, and every selfie is stored in the database.
  // The cap applies to the longest side so portrait (phone) and landscape (laptop)
  // cameras both shrink; 480px is still well above the ~192px preview in the UI.
  const SELFIE_MAX_EDGE = 480;
  const SELFIE_JPEG_QUALITY = 0.6;

  const capturePhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        const sourceWidth = video.videoWidth || SELFIE_MAX_EDGE;
        const sourceHeight = video.videoHeight || SELFIE_MAX_EDGE;
        // Never upscale a camera that is already smaller than the target.
        const scale = Math.min(1, SELFIE_MAX_EDGE / Math.max(sourceWidth, sourceHeight));

        canvas.width = Math.round(sourceWidth * scale);
        canvas.height = Math.round(sourceHeight * scale);

        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        context.setTransform(1, 0, 0, 1, 0, 0);

        const dataUrl = canvas.toDataURL('image/jpeg', SELFIE_JPEG_QUALITY);
        setSelfieBase64(dataUrl);
        stopCamera();
      }
    }
  };

  const retakePhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    setSelfieBase64(null);
    startCamera();
  };

  const handlePunch = (punchType: 'IN' | 'OUT') => {
    if (!selfieBase64) {
      setError('A selfie is compulsory to punch in/out.');
      return;
    }

    setActionLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setActionLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          // Resolved from the employee's own browser (not the server) so each request comes
          // from a different IP and a whole office punching in at once never hits Nominatim's
          // shared rate limit. A failure here must never block the punch itself.
          let address: string | null = null;
          try {
            const geoRes = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`,
              { signal: AbortSignal.timeout(4000) }
            );
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              address = geoData?.display_name || null;
            }
          } catch (e) {
            console.warn('Address lookup failed, saving coordinates only:', e);
          }

          const res = await fetch('/api/attendance/punch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              punchType: punchType,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              address: address,
              workMode: workMode,
              officeLocation: workMode === 'Office' ? officeLocation : undefined,
              selfieBase64: selfieBase64
            })
          });

          if (res.ok) {
            setSelfieBase64(null); // Reset after success
            await fetchStatus();
          } else {
            const data = await res.json();
            setError(data.error || 'Failed to punch ' + punchType);
          }
        } catch (e) {
          setError('Network error');
        } finally {
          setActionLoading(false);
        }
      },
      (err) => {
        setError('Please allow location access to punch in/out');
        setActionLoading(false);
      }
    );
  };

  if (loading) return (
    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs flex items-center justify-center min-h-[160px]">
      <span className="material-symbols-outlined animate-spin text-slate-300 text-3xl">sync</span>
    </div>
  );

  // Timestamps are stored in UTC but a punch belongs to the day it happened in local time,
  // so bucket by local calendar date rather than by the UTC date in the ISO string.
  const toLocalDay = (ts: string) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Only today's punches decide the button state. An IN left open on a previous day is
  // never closed by today's punch-out — that day keeps an empty out-time, and the
  // employee simply punches in again for the new day.
  const todaysPunches = punches.filter(p => toLocalDay(p.timestamp) === todayKey);
  const lastPunchToday = todaysPunches[0]; // API returns newest first
  const isPunchedIn = lastPunchToday?.punch_type === 'IN';
  const canPunchIn = !isPunchedIn;
  const canPunchOut = isPunchedIn;

  // If the previous working day was left open, tell the employee — HR sees it as Incomplete.
  const previousDayLeftOpen = (() => {
    if (todaysPunches.length > 0) return null;
    const mostRecent = punches.find(p => toLocalDay(p.timestamp) !== todayKey);
    return mostRecent && mostRecent.punch_type === 'IN' ? toLocalDay(mostRecent.timestamp) : null;
  })();

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col h-full relative overflow-hidden group">
      <div className="flex justify-between items-center mb-6 relative z-10">
        <div>
          <h3 className="font-bold text-[#021934] tracking-tight">Clock In/Out</h3>
          <p className="text-xs text-slate-500 font-medium">Record your daily attendance</p>
        </div>
        <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center border border-orange-100/50 shadow-sm">
          <span className="material-symbols-outlined text-[20px]">schedule</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center relative z-10">
        {error && (
          <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg mb-4 flex items-start gap-2 border border-red-100">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <p className="font-medium">{error}</p>
          </div>
        )}

        {previousDayLeftOpen && (
          <div className="bg-amber-50 text-amber-700 text-xs p-3 rounded-lg mb-4 flex items-start gap-2 border border-amber-100">
            <span className="material-symbols-outlined text-[16px]">schedule</span>
            <p className="font-medium">
              You did not punch out on {previousDayLeftOpen}. That day stays marked
              Incomplete — contact HR to regularise it. You can punch in as normal today.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Work Mode</label>
            <div className="flex gap-2">
              {(['Office', 'On site', 'Manual'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setWorkMode(mode)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors border ${
                    workMode === mode 
                      ? 'bg-[#021934] text-white border-[#021934]' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Location</label>
            <select 
              value={officeLocation}
              onChange={e => setOfficeLocation(e.target.value)}
              disabled={workMode !== 'Office'}
              className="w-full bg-white border border-slate-200 text-slate-600 text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block p-3 appearance-none disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="Head Office - Lower Parel">Head Office - Lower Parel</option>
              <option value="Khar West Office (Westar)">Khar West Office (Westar)</option>
              <option value="MSRDC Pune">MSRDC Pune</option>
              <option value="MMRDA">MMRDA</option>
              <option value="MSRDC Mumbai">MSRDC Mumbai</option>
              <option value="Pune Regional Office">Pune Regional Office</option>
            </select>
          </div>

          {/* Selfie Capture Section */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 relative flex flex-col items-center justify-center min-h-[200px]">
            {!cameraActive && !selfieBase64 && (
              <div className="p-6 text-center flex flex-col items-center">
                <span className="material-symbols-outlined text-slate-400 text-4xl mb-2">photo_camera</span>
                <p className="text-xs text-slate-500 mb-3 font-medium">A selfie is required to punch in/out</p>
                <button
                  onClick={startCamera}
                  className="bg-[#021934] hover:bg-slate-800 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Start Camera
                </button>
              </div>
            )}

            {cameraActive && !selfieBase64 && (
              <div className="w-full h-full relative">
                <video ref={videoRef} autoPlay playsInline className="w-full h-48 object-cover bg-black" style={{ transform: 'scaleX(-1)' }} />
                <button
                  onClick={capturePhoto}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white text-slate-800 text-xs font-bold py-2 px-6 rounded-full shadow-lg hover:bg-slate-100 transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">camera</span> Capture
                </button>
              </div>
            )}

            {selfieBase64 && (
              <div className="w-full h-full relative">
                <img src={selfieBase64} alt="Selfie" className="w-full h-48 object-cover" />
                <button
                  onClick={retakePhoto}
                  className="absolute top-2 right-2 bg-black/50 text-white text-xs font-bold p-1.5 rounded-lg hover:bg-black/70 transition-colors flex items-center"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                </button>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="w-full flex flex-col sm:flex-row gap-3 mt-4">
            {canPunchIn && (
              <button
                onClick={() => handlePunch('IN')}
                disabled={actionLoading || !selfieBase64 || (workMode === 'Office' && !officeLocation)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? (
                  <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">login</span>
                )}
                Punch In
              </button>
            )}

            {canPunchOut && (
              <button
                onClick={() => handlePunch('OUT')}
                disabled={actionLoading || !selfieBase64}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? (
                  <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">logout</span>
                )}
                Punch Out
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100">
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">PUNCH HISTORY</p>
          <a 
            href="/api/attendance/punches/export" 
            className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">download</span> Export CSV
          </a>
        </div>
        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
          {punches.length === 0 ? (
            <p className="text-sm text-slate-500">No punches recorded yet.</p>
          ) : (
            punches.map((p, idx) => (
              <div key={idx} className="flex flex-row items-center gap-3 text-sm border border-slate-100 p-2.5 rounded-lg bg-slate-50/50">
                {p.selfie_url && (
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                    <img src={p.selfie_url} alt="Selfie" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex flex-col flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className={`font-bold flex items-center gap-1 ${p.punch_type === 'IN' ? 'text-green-600' : 'text-orange-600'}`}>
                      <span className="material-symbols-outlined text-[16px]">
                        {p.punch_type === 'IN' ? 'login' : 'logout'}
                      </span>
                      {p.punch_type}
                    </span>
                    <span className="text-slate-600 font-mono text-xs">
                      {new Date(p.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {/* The readable address is filled in by the scheduled backfill, so until
                      then show the coordinates as a map link rather than nothing. */}
                  {(p.address || (p.latitude != null && p.longitude != null)) && (
                    <a
                      href={p.address
                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`
                        : `https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1 mt-1 text-[10px] text-slate-500 hover:text-orange-600 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[12px] mt-0.5">location_on</span>
                      <span className="truncate">
                        {p.address || `${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)}`}
                      </span>
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
