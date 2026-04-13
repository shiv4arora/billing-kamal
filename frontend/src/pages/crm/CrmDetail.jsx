import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useLeads } from '../../context/LeadContext';
import { Button, Input, Badge, Card } from '../../components/ui';
import { useGlobalToast } from '../../context/ToastContext';
import { today, formatDate } from '../../utils/helpers';

const STAGES = [
  { key: 'lead',      label: 'Lead',           color: 'gray'   },
  { key: 'contacted', label: 'Contacted',       color: 'blue'   },
  { key: 'catalogue', label: 'Send Catalogue',  color: 'purple' },
  { key: 'visit',     label: 'Visit/Video Call',color: 'indigo' },
  { key: 'followup2', label: 'Follow Up 2nd',   color: 'yellow' },
  { key: 'won',       label: 'Won',             color: 'green'  },
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

  // Change stage
  const changeStage = (stage) => save({ stage }, '');

  // Add note
  const addNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    const updated = [...notes, { text, createdAt: new Date().toISOString() }];
    await save({ notes: JSON.stringify(updated) }, 'Note added');
    setNoteText('');
  };

  // Save follow-up date
  const saveFollowUp = () => save({ nextFollowUp: nextFollowUp || null }, 'Follow-up saved');

  // Save visit date
  const saveVisitDate = () => save({ visitDate: visitDate || null }, 'Visit date saved');

  // No pickup — auto-snooze +4h or next morning
  const noPickup = async () => {
    const now = new Date();
    let snooze;
    if (now.getHours() < 14) { // before 2pm: +4 hours same day
      const s = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      snooze = s.toISOString().slice(0, 10);
    } else { // after 2pm: next morning
      const s = new Date(now); s.setDate(s.getDate() + 1);
      snooze = s.toISOString().slice(0, 10);
    }
    const updatedNotes = [...notes, { text: 'No pickup', createdAt: new Date().toISOString() }];
    await save({
      noPickupCount: (lead.noPickupCount || 0) + 1,
      nextFollowUp: snooze,
      notes: JSON.stringify(updatedNotes),
    }, `No pickup noted · Follow-up set to ${snooze}`);
    setNextFollowUp(snooze);
  };

  // Mark done → clear follow-up
  const markDone = async () => {
    const updatedNotes = [...notes, { text: 'Follow-up done', createdAt: new Date().toISOString() }];
    await save({ nextFollowUp: null, notes: JSON.stringify(updatedNotes) }, 'Follow-up marked done');
    setNextFollowUp('');
  };

  // Quick-log buttons
  const quickLog = async (text) => {
    const updated = [...notes, { text, createdAt: new Date().toISOString() }];
    await save({ notes: JSON.stringify(updated) }, `${text} logged`);
  };

  // Mark Won
  const markWon = async () => {
    const updatedNotes = [...notes, { text: 'Marked as Won 🎉', createdAt: new Date().toISOString() }];
    await save({ stage: 'won', notes: JSON.stringify(updatedNotes) }, 'Lead marked as Won!');
  };

  // Delete lead
  const deleteLead = async () => {
    if (!window.confirm('Delete this lead?')) return;
    await removeLead(id);
    toast.success('Lead deleted');
    navigate('/crm');
  };

  const isOverdue = lead.nextFollowUp && lead.nextFollowUp < today();

  return (
    <div className="max-w-lg space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/crm')} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900 flex-1 truncate">{lead.name}</h1>
        <Link to={`/crm/${id}/edit`} className="text-sm text-blue-600 hover:underline">Edit</Link>
      </div>

      {/* Lead info card */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-2 items-center mb-1">
              <Badge color={STAGES.find(s => s.key === lead.stage)?.color || 'gray'}>
                {STAGES.find(s => s.key === lead.stage)?.label || lead.stage}
              </Badge>
              <span className="text-xs text-gray-500">{src.icon} {src.label}</span>
              {lead.place && <span className="text-xs text-gray-400">📍 {lead.place}</span>}
            </div>
            {lead.phone && <p className="text-sm font-mono text-gray-700">{lead.phone}</p>}
            <p className="text-xs text-gray-400 mt-1">Added {formatDate(lead.createdAt)}</p>
          </div>

          {/* Quick call/WA */}
          {lead.phone && (
            <div className="flex gap-2">
              <a href={`tel:${lead.phone}`} className="flex items-center justify-center w-10 h-10 bg-blue-50 text-blue-600 rounded-xl text-lg hover:bg-blue-100">📞</a>
              <a href={`https://wa.me/91${lead.phone.replace(/\D/g, '')}?text=Hi%20${encodeURIComponent(lead.name)}`} target="_blank" rel="noreferrer"
                className="flex items-center justify-center w-10 h-10 bg-green-50 text-green-600 rounded-xl text-lg hover:bg-green-100">💬</a>
            </div>
          )}
        </div>

        {/* Stage pills */}
        <div className="mt-4">
          <p className="text-xs text-gray-500 font-medium mb-2">Move to stage:</p>
          <div className="flex flex-wrap gap-2">
            {STAGES.map(s => (
              <button
                key={s.key}
                onClick={() => changeStage(s.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  lead.stage === s.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Follow-up */}
      <Card>
        <h3 className="font-semibold text-gray-800 mb-3">Follow-up</h3>
        {isOverdue && (
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            🔴 Overdue since {formatDate(lead.nextFollowUp)}
            {lead.noPickupCount > 0 && ` · No pickup ×${lead.noPickupCount}`}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input label="Next follow-up date" type="date" value={nextFollowUp} onChange={e => setNextFollowUp(e.target.value)} />
          </div>
          <Button size="sm" onClick={saveFollowUp} disabled={!!saving}>Set</Button>
        </div>
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="outline" onClick={markDone} disabled={!!saving}>✓ Mark Done</Button>
          <Button size="sm" variant="danger" onClick={noPickup} disabled={!!saving}>📵 No Pickup</Button>
        </div>
      </Card>

      {/* Visit date */}
      <Card>
        <h3 className="font-semibold text-gray-800 mb-3">Visit / Video Call Date</h3>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input label="Schedule visit" type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} />
          </div>
          <Button size="sm" onClick={saveVisitDate} disabled={!!saving}>Set</Button>
        </div>
        {lead.visitDate && (
          <p className="text-xs text-gray-500 mt-1.5">📅 Visit on {formatDate(lead.visitDate)}</p>
        )}
      </Card>

      {/* Notes */}
      <Card>
        <h3 className="font-semibold text-gray-800 mb-3">Call Log / Notes</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={() => quickLog('Call done ✅')} disabled={!!saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
            📞 Call Done
          </button>
          <button onClick={() => quickLog('Photos shared 📸')} disabled={!!saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-medium hover:bg-purple-100 transition-colors">
            📸 Photos Shared
          </button>
        </div>
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
          <p className="text-xs text-gray-400 text-center py-3">No notes yet</p>
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
      </Card>

      {/* Mark Won */}
      {lead.stage !== 'won' && (
        <Button variant="success" className="w-full" onClick={markWon} disabled={!!saving}>
          🎉 Mark as Won — Became Regular Buyer
        </Button>
      )}
      {lead.stage === 'won' && (
        <div className="text-center py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 font-semibold text-sm">
          🎉 This lead is Won!
        </div>
      )}

      {/* Delete */}
      <div className="flex justify-center pt-2">
        <button onClick={deleteLead} className="text-xs text-red-400 hover:text-red-600 underline">Delete Lead</button>
      </div>
    </div>
  );
}
