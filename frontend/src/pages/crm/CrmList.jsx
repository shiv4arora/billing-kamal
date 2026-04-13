import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLeads } from '../../context/LeadContext';
import { today, formatDate } from '../../utils/helpers';
import { Button, SearchInput, Badge } from '../../components/ui';

const STAGES = [
  { key: 'lead',       label: 'Lead',           color: 'gray'   },
  { key: 'contacted',  label: 'Contacted',       color: 'blue'   },
  { key: 'catalogue',  label: 'Send Catalogue',  color: 'purple' },
  { key: 'visit',      label: 'Visit/Video Call',color: 'indigo' },
  { key: 'followup2',  label: 'Follow Up 2nd',   color: 'yellow' },
  { key: 'won',        label: 'Won',             color: 'green'  },
];

const SOURCE_LABELS = {
  whatsapp: { icon: '💬', label: 'WhatsApp', color: 'green' },
  call:     { icon: '📞', label: 'Call',      color: 'blue'  },
  walkin:   { icon: '🚶', label: 'Walk-in',   color: 'orange'},
  other:    { icon: '📝', label: 'Other',     color: 'gray'  },
};

function stageColor(s) {
  return STAGES.find(x => x.key === s)?.color || 'gray';
}
function stageLabel(s) {
  return STAGES.find(x => x.key === s)?.label || s;
}

function isOverdue(nextFollowUp) {
  return nextFollowUp && nextFollowUp < today();
}
function isDueToday(nextFollowUp) {
  return nextFollowUp === today();
}
function isTomorrow(date) {
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  return date === tom.toISOString().slice(0, 10);
}

export default function CrmList() {
  const { leads } = useLeads();
  const navigate = useNavigate();
  const [tab, setTab] = useState('today');
  const [search, setSearch] = useState('');

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
    { key: 'today', label: 'Today', badge: stageCounts.today, badgeColor: stageCounts.today > 0 ? 'red' : 'gray' },
    { key: 'all',   label: 'All',   badge: leads.length,       badgeColor: 'gray' },
    ...STAGES.map(s => ({ key: s.key, label: s.label, badge: stageCounts[s.key], badgeColor: s.color })),
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">CRM Leads</h1>
        <Link to="/crm/new"><Button>+ New Lead</Button></Link>
      </div>

      {/* Search */}
      <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone, place…" />

      {/* Stage tabs — horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
              tab === t.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 leading-none font-semibold ${
                tab === t.key ? 'bg-white/20 text-white' : 'bg-gray-300 text-gray-700'
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
            const src = SOURCE_LABELS[lead.source] || SOURCE_LABELS.other;
            const overdue = isOverdue(lead.nextFollowUp);
            const dueToday = isDueToday(lead.nextFollowUp);
            const visitTomorrow = lead.visitDate && isTomorrow(lead.visitDate);
            const notes = (() => { try { return JSON.parse(lead.notes || '[]'); } catch { return []; } })();

            return (
              <div
                key={lead.id}
                onClick={() => navigate(`/crm/${lead.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all active:scale-[0.99]"
              >
                {/* Visit reminder banner */}
                {visitTomorrow && (
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                    📞 Call before visit tomorrow ({lead.visitDate})
                  </div>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{lead.name}</p>
                      <Badge color={stageColor(lead.stage)} size="sm">{stageLabel(lead.stage)}</Badge>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium bg-${src.color}-50 text-${src.color}-700`}>
                        {src.icon} {src.label}
                      </span>
                    </div>
                    {lead.place && <p className="text-xs text-gray-400 mt-0.5">{lead.place}</p>}
                    {lead.phone && <p className="text-sm text-gray-600 mt-0.5 font-mono">{lead.phone}</p>}

                    {/* Follow-up date */}
                    {lead.nextFollowUp && (
                      <div className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${overdue ? 'text-red-600' : dueToday ? 'text-orange-500' : 'text-gray-400'}`}>
                        {overdue && <span>🔴</span>}
                        {dueToday && <span>🟠</span>}
                        {!overdue && !dueToday && <span>📅</span>}
                        Follow-up: {formatDate(lead.nextFollowUp)}
                        {lead.noPickupCount > 0 && (
                          <span className="ml-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                            No pickup ×{lead.noPickupCount}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Last note preview */}
                    {notes.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1 truncate italic">"{notes[notes.length - 1].text}"</p>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {lead.phone && (
                      <>
                        <a
                          href={`tel:${lead.phone}`}
                          className="flex items-center justify-center w-9 h-9 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-base"
                          title="Call"
                        >
                          📞
                        </a>
                        <a
                          href={`https://wa.me/91${lead.phone.replace(/\D/g, '')}?text=Hi%20${encodeURIComponent(lead.name)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center w-9 h-9 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 text-base"
                          title="WhatsApp"
                        >
                          💬
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
