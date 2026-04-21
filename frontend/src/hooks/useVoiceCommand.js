import { useRef, useState, useCallback } from 'react';

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useVoiceCommand(onCommand) {
  const [listening, setListening]   = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError]           = useState('');
  const recRef = useRef(null);

  const supported = true; // always show the button; unsupported handled in start()

  const start = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) { setError('Voice not supported — use Chrome or Edge'); return; }
    if (listening) { recRef.current?.stop(); return; }

    setError('');
    setTranscript('');
    const rec = new SR();
    rec.lang = 'hi-IN'; // supports Hindi, English and Hinglish in India
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
  // English
  if (/tomorrow/.test(text))                   return addDays(base, 1);
  if (/day after tomorrow|parso/.test(text))    return addDays(base, 2);
  if (/next week|agli hafta/.test(text))        return addDays(base, 7);
  if (/in (\d+) days?/.test(text))             return addDays(base, parseInt(text.match(/in (\d+) days?/)[1]));
  if (/(\d+) days?/.test(text))                return addDays(base, parseInt(text.match(/(\d+) days?/)[1]));
  // Hindi / Hinglish
  if (/kal/.test(text))                         return addDays(base, 1);
  if (/(\d+) din (baad|mein)/.test(text))       return addDays(base, parseInt(text.match(/(\d+) din/)[1]));
  if (/(\d+) din/.test(text))                   return addDays(base, parseInt(text.match(/(\d+) din/)[1]));
  if (/ek hafte (mein|baad)|ek hafta/.test(text)) return addDays(base, 7);
  return null;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
