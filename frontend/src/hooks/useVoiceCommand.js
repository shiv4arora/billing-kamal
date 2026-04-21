import { useRef, useState, useCallback } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function useVoiceCommand(onCommand) {
  const [listening, setListening]   = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError]           = useState('');
  const recRef = useRef(null);

  const supported = !!SpeechRecognition;

  const start = useCallback(() => {
    if (!SpeechRecognition) { setError('Voice not supported in this browser'); return; }
    if (listening) { recRef.current?.stop(); return; }

    setError('');
    setTranscript('');
    const rec = new SpeechRecognition();
    rec.lang = 'en-IN';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recRef.current = rec;

    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = (e) => { setListening(false); setError(e.error === 'no-speech' ? 'No speech detected' : e.error); };
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript.trim().toLowerCase();
      setTranscript(text);
      onCommand(text);
    };

    rec.start();
  }, [listening, onCommand]);

  const stop = useCallback(() => { recRef.current?.stop(); }, []);

  return { listening, transcript, error, supported, start, stop };
}

// Parse relative dates from voice
export function parseVoiceDate(text) {
  const base = new Date();
  if (/tomorrow/.test(text))         return addDays(base, 1);
  if (/next week/.test(text))        return addDays(base, 7);
  if (/in (\d+) days?/.test(text))   return addDays(base, parseInt(text.match(/in (\d+) days?/)[1]));
  if (/(\d+) days?/.test(text))      return addDays(base, parseInt(text.match(/(\d+) days?/)[1]));
  return null;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
