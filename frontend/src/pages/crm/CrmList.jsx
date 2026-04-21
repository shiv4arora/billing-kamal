import { useState, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLeads } from '../../context/LeadContext';
import { today, formatDate } from '../../utils/helpers';
import { Button, SearchInput, Badge } from '../../components/ui';
import { useVoiceCommand, parseVoiceDate } from '../../hooks/useVoiceCommand';
import { useGlobalToast } from '../../context/ToastContext';

const STAGES = [
  { key: 'lead',       label: 'Lead',            color: 'gray'   },
  { key: 'contacted',  label: 'Contacted',        color: 'blue'   },
  { key: 'catalogue',  label: 'Send Catalogue',   color: 'purple' },
  { key: 'visit',      label: 'Visit/Video Call', color: 'indigo' },
  { key: 'followup2',  label: 'Follow Up 2nd',    color: 'yellow' },
  { key: 'won',        label: 'Won',              color: 'green'  },
];

function stageColor(s) { return STAGES.find(x => x.key === s)?.color || 'gray'; }
function stageLabel(s) { return STAGES.find(x => x.key === s)?.label || s; }

function isTomorrow(date) {
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  return date === tom.toISOString().slice(0, 10);
}

// Action patterns: each has a regex to detect it and a key
const ACTION_PATTERNS = [
  { key: 'callDone',     regex: /call done|baat ho gayi|baat hui|called|spoke|call kar liya|call kiya/    },
  { key: 'noPickup',     regex: /no pickup|nahi utha|nahin utha|phone nahi|pickup nahi|no answer|busy tha|not pick/ },
  { key: 'catalogue',    regex: /catalogue|catalog|cat bheja|catalogue bheja|photo bheja|photos bheje/   },
  { key: 'followupDone', regex: /follow.?up done|ho gaya|done kar diya|nipta diya|khatam/               },
  { key: 'won',          regex: /won|deal pakki|pakka|converted|order aa gaya|customer ban gaya/         },
  { key: 'followup',     regex: /follow.?up|kal|parso|din mein|din baad|next|agli baar/                 },
];

// Strip action keywords from text to isolate the name part
function extractName(text, actionRegex) {
  return text.replace(actionRegex, '').replace(/\s{2,}/g, ' ').trim();
}

export default function CrmList() {
  const { leads, updateLead } = useLeads();
  const navigate  = useNavigate();
  const toast     = useGlobalToast();
  const [tab,          setTab]          = useState('today');
  const [search,       setSearch]       = useState('');
  const [voiceMatches, setVoiceMatches] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // { actionKey, date? }
  const [voiceHeard,   setVoiceHeard]   = useState('');

  // Fuzzy find leads by a name string
  const findLeadsByName = useCallback((nameStr) => {
    const q = nameStr.toLowerCase().trim();
    if (!q) return [];
    // Exact substring match first
    const exact = leads.filter(l => l.name?.toLowerCase().includes(q));
    if (exact.length) return exact;
    // Word-level match
    return leads.filter(l =>
      q.split(' ').some(word => word.length > 2 && l.name?.toLowerCase().includes(word))
    );
  }, [leads]);

  // Execute an action directly on a lead (no navigation)
  const executeAction = useCallback(async (lead, actionKey, followupDate) => {
    const notes = (() => { try { return JSON.parse(lead.notes || '[]'); } catch { return []; } })();
    const addNote = (text) => JSON.stringify([...notes, { text, createdAt: new Date().toISOString() }]);

    const updates = {
      callDone:     { notes: addNote('Call done ✅'), stage: 'contacted' },
      noPickup: (() => {
        const now = new Date(), s = new Date(now);
        if (now.getHours() < 14) s.setTime(now.getTime() + 4 * 60 * 60 * 1000);
        else s.setDate(s.getDate() + 1);
        const snooze = s.toISOString().slice(0, 10);
        return { noPickupCount: (lead.noPickupCount || 0) + 1, nextFollowUp: snooze, notes: addNote('No pickup') };
      })(),
      catalogue:    { notes: addNote('Sent catalogue 📸'), stage: 'catalogue' },
      followupDone: { nextFollowUp: null, notes: addNote('Follow-up done ✓') },
      won:          { stage: 'won', notes: addNote('Marked as Won 🎉') },
      followup:     followupDate ? { nextFollowUp: followupDate, notes: addNote(`Follow-up set → ${followupDate}`) } : null,
    }[actionKey];

    if (!updates) { toast.error('Action nahi samjha'); return; }

    try {
      await updateLead(lead.id, updates);
      const label = { callDone: 'Call done', noPickup: 'No pickup', catalogue: 'Catalogue sent',
        followupDone: 'Follow-up done', won: 'Won!', followup: `Follow-up → ${followupDate}` }[actionKey];
      toast.success(`${lead.name}: ${label}`);
    } catch (e) { toast.error(e.message); }
  }, [leads, updateLead, toast]);

  const handleVoiceCommand = useCallback((text) => {
    setVoiceHeard(text);
    setVoiceMatches(null);
    setPendingAction(null);

    // "new lead" / "naya lead"
    if (/new lead|naya lead|add lead|nayi entry/.test(text)) { navigate('/crm/new'); return; }

    // Detect action in text
    const actionMatch = ACTION_PATTERNS.find(p => p.regex.test(text));

    if (actionMatch) {
      const followupDate = actionMatch.key === 'followup' ? parseVoiceDate(text) : null;
      const nameStr = extractName(text, actionMatch.regex);
      const matches = nameStr ? findLeadsByName(nameStr) : [];

      if (matches.length === 1) {
        // Perfect — execute immediately
        executeAction(matches[0], actionMatch.key, followupDate);
        return;
      }
      if (matches.length > 1) {
        // Multiple matches — show picker with action pending
        setPendingAction({ key: actionMatch.key, followupDate });
        setVoiceMatches(matches);
        return;
      }
      toast.error(`Lead nahi mila: "${nameStr}"`);
      return;
    }

    // No action — just find lead by name and navigate
    const matches = findLeadsByName(text.replace(/^(open|dikhao|kholo|show|batao)\s+/i, ''));
    if (matches.length === 1)  { navigate(`/crm/${matches[0].id}`); return; }
    if (matches.length > 1)    { setVoiceMatches(matches); return; }

    // Fallback — fill search
    setSearch(text.replace(/^(open|dikhao|kholo|show|batao)\s+/i, '').trim());
  }, [leads, navigate, findLeadsByName, executeAction]);

  const { listening, transcript: liveText, start: startVoice } = useVoiceCommand(handleVoiceCommand);

  const todayStr = today();

  const filtered = useMemo(() => {
    let list = leads;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l => l.name?.toLowerCase().includes(q) || l.phone?.includes(q) || l.place?.toLowerCase().includes(q));
    }
    if (tab === 'today') {
      list = list.filter(l => l.nextFollowUp && l.nextFollowUp <= todayStr && l.stage !== 'won');
    } else if (tab !== 'all') {
      list = list.filter(l => l.stage === tab);
    }
    return list;
  }, [leads, tab, search, todayStr]);

  const stageCounts = useMemo(() => {
    const counts = { today: 0 };
    STAGES.forEach(s => { counts[s.key] = 0; });
    leads.forEach(l => {
      if (l.nextFollowUp && l.nextFollowUp <= todayStr && l.stage !== 'won') counts.today++;
      if (counts[l.stage] !== undefined) counts[l.stage]++;
    });
    return counts;
  }, [leads, todayStr]);

  const tabs = [
    { key: 'today', label: 'Today',  badge: stageCounts.today, badgeRed: stageCounts.today > 0 },
    { key: 'all',   label: 'All',    badge: leads.length,      badgeRed: false },
    ...STAGES.map(s => ({ key: s.key, label: s.label, badge: stageCounts[s.key], badgeRed: false })),
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">CRM Leads</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={startVoice}
            title="Voice search"
            className={`flex items-center justify-center w-9 h-9 rounded-full border text-base transition-colors ${
              listening
                ? 'bg-red-500 text-white border-red-500 animate-pulse'
                : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'
            }`}
          >
            🎤
          </button>
          <Link to="/crm/new"><Button>+ New Lead</Button></Link>
        </div>
      </div>

      {/* Voice listening indicator */}
      {listening && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
          <span className="animate-pulse">🔴</span>
          {liveText
            ? <span>"{liveText}"<span className="animate-pulse">…</span></span>
            : <span>Bol do — naam + kaam ek saath (e.g. "Ramesh call done")</span>
          }
        </div>
      )}

      {/* Voice match picker — multiple results */}
      {voiceMatches && (
        <div className="bg-white border border-blue-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <p className="text-xs font-medium text-blue-700">🎤 "{voiceHeard}" — kaun sa lead?</p>
            <button onClick={() => setVoiceMatches(null)} className="text-blue-400 hover:text-blue-600 text-sm">✕</button>
          </div>
          {voiceMatches.map(l => (
            <button key={l.id} onClick={() => {
              if (pendingAction) {
                executeAction(l, pendingAction.key, pendingAction.followupDate);
              } else {
                navigate(`/crm/${l.id}`);
              }
              setVoiceMatches(null); setPendingAction(null);
            }}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-0">
              <p className="font-semibold text-gray-800">{l.name}</p>
              <p className="text-xs text-gray-400">{l.place}{l.phone ? ` · ${l.phone}` : ''}</p>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <SearchInput value={search} onChange={v => { setSearch(v); setVoiceMatches(null); }} placeholder="Search name, phone, place…" />

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
              tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 leading-none font-semibold ${
                tab === t.key
                  ? 'bg-white/20 text-white'
                  : t.badgeRed ? 'bg-red-500 text-white' : 'bg-gray-300 text-gray-700'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lead cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {tab === 'today' ? 'No follow-ups due today 🎉' : 'No leads found'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(lead => {
            const overdue = lead.nextFollowUp && lead.nextFollowUp < todayStr;
            const dueToday = lead.nextFollowUp === todayStr;
            const visitTomorrow = lead.visitDate && isTomorrow(lead.visitDate);
            const notes = (() => { try { return JSON.parse(lead.notes || '[]'); } catch { return []; } })();

            return (
              <div
                key={lead.id}
                onClick={() => navigate(`/crm/${lead.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-3.5 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all active:scale-[0.99]"
              >
                {visitTomorrow && (
                  <div className="mb-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                    📅 Visit tomorrow — call to confirm
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{lead.name}</p>
                      <Badge color={stageColor(lead.stage)} size="sm">{stageLabel(lead.stage)}</Badge>
                    </div>

                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {lead.place && <span className="text-xs text-gray-400">{lead.place}</span>}
                      {lead.phone && <span className="text-xs text-gray-500 font-mono">{lead.phone}</span>}
                    </div>

                    {lead.nextFollowUp && (
                      <div className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${
                        overdue ? 'text-red-600' : dueToday ? 'text-orange-500' : 'text-gray-400'
                      }`}>
                        {overdue ? '🔴' : dueToday ? '🟠' : '📅'}
                        Follow-up: {formatDate(lead.nextFollowUp)}
                        {lead.noPickupCount > 0 && (
                          <span className="ml-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                            No pickup ×{lead.noPickupCount}
                          </span>
                        )}
                      </div>
                    )}

                    {notes.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1 truncate italic">"{notes[notes.length - 1].text}"</p>
                    )}
                  </div>

                  {/* Quick call/WA */}
                  {lead.phone && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <a href={`tel:${lead.phone}`}
                        className="flex items-center justify-center w-8 h-8 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm">📞</a>
                      <a href={`https://wa.me/91${lead.phone.replace(/\D/g, '')}?text=Hi%20${encodeURIComponent(lead.name)}`}
                        target="_blank" rel="noreferrer"
                        className="flex items-center justify-center w-8 h-8 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 text-sm">💬</a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
