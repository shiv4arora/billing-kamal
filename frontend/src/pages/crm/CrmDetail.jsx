import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useLeads } from '../../context/LeadContext';
import { Button, Input, Badge } from '../../components/ui';
import { useGlobalToast } from '../../context/ToastContext';
import { today, formatDate } from '../../utils/helpers';

const STAGES = [
  { key: 'lead',      label: 'Lead',            color: 'gray'   },
  { key: 'contacted', label: 'Contacted',        color: 'blue'   },
  { key: 'catalogue', label: 'Send Catalogue',   color: 'purple' },
  { key: 'visit',     label: 'Visit/Video Call', color: 'indigo' },
  { key: 'followup2', label: 'Follow Up 2nd',    color: 'yellow' },
  { key: 'won',       label: 'Won',              color: 'green'  },
];

const SOURCE_LABELS = {
  whatsapp: { icon: '💬', label: 'WhatsApp' },
  call:     { icon: '📞', label: 'Call'     },
  walkin:   { icon: '🚶', label: 'Walk-in'  },
  other:    { icon: '📝', label: 'Other'    },
};

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date} ${time}`;
}

export default function CrmDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const { getLead, updateLead, removeLead } = useLeads();

  const lead = getLead(id);
  const [noteText, setNoteText] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState(lead?.nextFollowUp || '');
  const [visitDate, setVisitDate] = useState(lead?.visitDate || '');
  const [saving, setSaving] = useState('');

  if (!lead) {
    return (
      <div className="text-center py-12 text-gray-400">
        Lead not found. <button onClick={() => navigate('/crm')} className="text-blue-500 underline">Back to CRM</button>
      </div>
    );
  }

  const notes = (() => { try { return JSON.parse(lead.notes || '[]'); } catch { return []; } })();
  const src = SOURCE_LABELS[lead.source] || SOURCE_LABELS.other;
  const stageInfo = STAGES.find(s => s.key === lead.stage) || STAGES[0];
  const isOverdue = lead.nextFollowUp && lead.nextFollowUp < today();
  const isDueToday = lead.nextFollowUp === today();

  const save = async (data, toastMsg) => {
    setSaving(toastMsg);
    try {
      await updateLead(id, data);
      if (toastMsg) toast.success(toastMsg);
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving('');
    }
  };

  const changeStage = (stage) => save({ stage }, '');

  const addNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    await save({ notes: JSON.stringify([...notes, { text, createdAt: new Date().toISOString() }]) }, 'Note added');
    setNoteText('');
  };

  const saveFollowUp = () => save({ nextFollowUp: nextFollowUp || null }, 'Follow-up saved');

  const saveVisitDate = () => save({
    visitDate: visitDate || null,
    ...(visitDate ? { stage: 'visit' } : {}),
  }, visitDate ? 'Visit date saved · moved to Visit stage' : 'Visit date cleared');

  const noPickup = async () => {
    const now = new Date();
    const s = new Date(now);
    if (now.getHours() < 14) { s.setTime(now.getTime() + 4 * 60 * 60 * 1000); }
    else { s.setDate(s.getDate() + 1); }
    const snooze = s.toISOString().slice(0, 10);
    await save({
      noPickupCount: (lead.noPickupCount || 0) + 1,
      nextFollowUp: snooze,
      notes: JSON.stringify([...notes, { text: 'No pickup', createdAt: new Date().toISOString() }]),
    }, `No pickup · Follow-up → ${snooze}`);
    setNextFollowUp(snooze);
  };

  const markDone = async () => {
    await save({
      nextFollowUp: null,
      notes: JSON.stringify([...notes, { text: 'Follow-up done ✓', createdAt: new Date().toISOString() }]),
    }, 'Follow-up marked done');
    setNextFollowUp('');
  };

  const quickLog = async (text, stage) => {
    await save({ notes: JSON.stringify([...notes, { text, createdAt: new Date().toISOString() }]), stage }, `${text} logged`);
  };

  const markWon = async () => {
    await save({
      stage: 'won',
      notes: JSON.stringify([...notes, { text: 'Marked as Won 🎉', createdAt: new Date().toISOString() }]),
    }, 'Lead marked as Won!');
  };

  const deleteLead = async () => {
    if (!window.confirm('Delete this lead?')) return;
    await removeLead(id);
    toast.success('Lead deleted');
    navigate('/crm');
  };

  return (
    <div className="max-w-lg space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/crm')} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{lead.name}</h1>
          {lead.place && <p className="text-xs text-gray-400">{lead.place}</p>}
        </div>
        <Link to={`/crm/${id}/edit`} className="text-sm text-blue-600 hover:underline flex-shrink-0">Edit</Link>
      </div>

      {/* Overdue alert */}
      {(isOverdue || isDueToday) && (
        <div className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-xl border ${
          isOverdue ? 'text-red-700 bg-red-50 border-red-200' : 'text-orange-700 bg-orange-50 border-orange-200'
        }`}>
          {isOverdue ? '🔴' : '🟠'}
          {isOverdue ? `Follow-up overdue since ${formatDate(lead.nextFollowUp)}` : 'Follow-up due today'}
          {lead.noPickupCount > 0 && <span className="ml-1 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">No pickup ×{lead.noPickupCount}</span>}
        </div>
      )}

      {/* Info + Contact */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge color={stageInfo.color}>{stageInfo.label}</Badge>
            <span className="text-xs text-gray-400">{src.icon} {src.label}</span>
            <span className="text-xs text-gray-400">Added {formatDate(lead.createdAt)}</span>
          </div>
          {lead.phone && (
            <div className="flex gap-2 flex-shrink-0">
              <a href={`tel:${lead.phone}`} className="flex items-center justify-center w-9 h-9 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-base">📞</a>
              <a href={`https://wa.me/91${lead.phone.replace(/\D/g, '')}?text=Hi%20${encodeURIComponent(lead.name)}`} target="_blank" rel="noreferrer"
                className="flex items-center justify-center w-9 h-9 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 text-base">💬</a>
            </div>
          )}
        </div>
        {lead.phone && <p className="text-sm font-mono text-gray-700 mt-2">{lead.phone}</p>}

        {/* Stage pills */}
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
          {STAGES.map(s => (
            <button key={s.key} onClick={() => changeStage(s.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                lead.stage === s.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Quick Log</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => quickLog('Call done ✅', 'contacted')} disabled={!!saving}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">
            📞 Call Done
          </button>
          <button onClick={() => quickLog('Sent catalogue 📸', 'catalogue')} disabled={!!saving}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-sm font-medium hover:bg-purple-100 transition-colors">
            📸 Sent Catalogue
          </button>
          <button onClick={noPickup} disabled={!!saving}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors">
            📵 No Pickup
          </button>
          <button onClick={markDone} disabled={!!saving}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors">
            ✓ Follow-up Done
          </button>
        </div>
      </div>

      {/* Schedule: Follow-up + Visit */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Schedule</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input label="Next follow-up" type="date" value={nextFollowUp} onChange={e => setNextFollowUp(e.target.value)} />
          </div>
          <Button size="sm" onClick={saveFollowUp} disabled={!!saving}>Set</Button>
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input label="Visit / video call" type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} />
          </div>
          <Button size="sm" onClick={saveVisitDate} disabled={!!saving}>Set</Button>
        </div>
        {lead.visitDate && (
          <p className="text-xs text-gray-500">📅 Visit on {formatDate(lead.visitDate)}</p>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">Call Log / Notes</p>
        <div className="flex gap-2 mb-4">
          <input
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }}
            placeholder="Type a note and press Enter…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <Button size="sm" onClick={addNote} disabled={!noteText.trim() || !!saving}>Add</Button>
        </div>
        {notes.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">No notes yet</p>
        ) : (
          <div className="space-y-2">
            {[...notes].reverse().map((n, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <div className="w-1 rounded-full bg-blue-200 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="text-gray-800">{n.text}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(n.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mark Won */}
      {lead.stage !== 'won' ? (
        <Button variant="success" className="w-full" onClick={markWon} disabled={!!saving}>
          🎉 Mark as Won — Became Regular Buyer
        </Button>
      ) : (
        <div className="text-center py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 font-semibold text-sm">
          🎉 This lead is Won!
        </div>
      )}

      <div className="flex justify-center pt-1">
        <button onClick={deleteLead} className="text-xs text-red-400 hover:text-red-600 underline">Delete Lead</button>
      </div>
    </div>
  );
}
