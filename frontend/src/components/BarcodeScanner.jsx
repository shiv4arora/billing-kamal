import { useEffect, useRef, useState } from 'react';

/**
 * Full-screen barcode / QR scanner overlay.
 * Uses @zxing/browser (lazy-loaded) so it doesn't bloat the main bundle.
 *
 * Props:
 *   onScan(text)  – called once when a code is detected
 *   onClose()     – called when user dismisses the scanner
 */
export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [error, setError] = useState(null);
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    let active = true;

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,          // use default / rear camera
          videoRef.current,
          (result, _err, ctrl) => {
            if (result && active) {
              active = false;
              setDetected(true);
              ctrl.stop();
              // short delay so user sees the green flash before close
              setTimeout(() => onScan(result.getText()), 150);
            }
          }
        );
        controlsRef.current = controls;
      } catch (e) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access in your browser settings.'
            : e?.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : 'Camera not available: ' + (e?.message || e)
        );
      }
    }

    start();

    return () => {
      active = false;
      try { controlsRef.current?.stop(); } catch (_) {}
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 backdrop-blur-sm shrink-0">
        <span className="text-white font-semibold text-sm">📷 Scan QR / Barcode</span>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white text-2xl leading-none p-1 active:text-white/50"
          aria-label="Close scanner"
        >
          ✕
        </button>
      </div>

      {error ? (
        /* Error state */
        <div className="flex-1 flex items-center justify-center px-8 text-center">
          <div>
            <p className="text-5xl mb-4">📷</p>
            <p className="text-white font-semibold text-base mb-2">Camera unavailable</p>
            <p className="text-white/50 text-sm mb-8">{error}</p>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-white text-black font-semibold rounded-xl text-sm active:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        /* Camera feed */
        <div className="flex-1 relative overflow-hidden">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Overlay — dark surround + bright frame */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            {/* Frame box — square for QR codes */}
            <div
              className={`relative w-64 h-64 transition-all duration-200 ${detected ? 'scale-105' : ''}`}
              style={{
                boxShadow: detected
                  ? '0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 3px #22c55e'
                  : '0 0 0 9999px rgba(0,0,0,0.55)',
                borderRadius: 12,
              }}
            >
              {/* Corner brackets */}
              {[
                'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
                'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
                'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
                'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
              ].map((cls, i) => (
                <div
                  key={i}
                  className={`absolute w-7 h-7 ${detected ? 'border-green-400' : 'border-white'} ${cls} transition-colors duration-200`}
                />
              ))}

              {/* Scan line */}
              {!detected && (
                <div
                  className="absolute left-2 right-2 h-0.5 bg-red-400/80 rounded-full"
                  style={{ top: '50%', animation: 'scanline 1.8s ease-in-out infinite' }}
                />
              )}

              {/* Detected flash */}
              {detected && (
                <div className="absolute inset-0 bg-green-400/20 rounded-xl flex items-center justify-center">
                  <span className="text-green-400 text-4xl">✓</span>
                </div>
              )}
            </div>

            <p className="text-white/70 text-sm mt-5 font-medium">
              {detected ? 'Code detected!' : 'Point camera at QR code'}
            </p>
          </div>
        </div>
      )}

      {/* Scan-line keyframe injected once */}
      <style>{`
        @keyframes scanline {
          0%   { top: 10%; }
          50%  { top: 88%; }
          100% { top: 10%; }
        }
      `}</style>
    </div>
  );
}
