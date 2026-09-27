import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { Card, Button, Badge, Modal, Input, Textarea, Spinner, EmptyState } from '@/components/ui';
import { BottomNav } from '@/components/BottomNav';
import { ItineraryService, analytics } from '@/services';
import { formatDate, formatMoney } from '@/data/demo';
import type { ItineraryDay, ItineraryItem } from '@/types';
import { CalendarDays, Clock, MapPin, Sparkles, Pencil, Trash2, RefreshCw, AlertCircle, Wand2, ChevronDown, DollarSign } from 'lucide-react';

type GenState = 'idle' | 'generating' | 'success' | 'error';

export function Itinerary() {
  const { activeTrip, navigate } = useApp();
  const [days, setDays] = useState<ItineraryDay[] | null>(null);
  const [genState, setGenState] = useState<GenState>('idle');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState<ItineraryItem | null>(null);

  const loadItinerary = useCallback(() => {
    if (!activeTrip) return;
    const stored = ItineraryService.get(activeTrip.id);
    setDays(stored);
    setGenState(stored && stored.length > 0 ? 'success' : 'idle');
  }, [activeTrip]);

  useEffect(() => {
    loadItinerary();
  }, [loadItinerary]);

  if (!activeTrip) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-5">
        <Card className="text-center max-w-sm">
          <p className="text-secondary-c mb-4" style={{ color: 'var(--text-secondary)' }}>No active trip selected.</p>
          <Button onClick={() => navigate('trips')}>Back to Trips</Button>
        </Card>
      </div>
    );
  }

  function generate() {
    if (!activeTrip) return;
    setGenState('generating');
    analytics.track('itinerary_generation_started');
    ItineraryService.generate(activeTrip).then(generated => {
      setDays(generated);
      setGenState('success');
      setExpandedDay(generated[0]?.id ?? null);
      analytics.track('itinerary_generation_succeeded');
    }).catch(() => {
      setGenState('error');
      analytics.track('itinerary_generation_failed');
    });
  }

  function regenerate() {
    setGenState('generating');
    generate();
  }

  function editItem(item: ItineraryItem) {
    setEditingItem({ ...item });
    setEditModalOpen(true);
  }

  function saveEdit() {
    if (!editingItem || !activeTrip || !days) return;
    const updated = ItineraryService.updateItem(activeTrip.id, editingItem.dayId, editingItem.id, {
      startTime: editingItem.startTime,
      notes: editingItem.notes,
    });
    if (updated) {
      setDays(updated);
      analytics.track('itinerary_item_edited');
    }
    setEditModalOpen(false);
    setEditingItem(null);
  }

  function removeItem(item: ItineraryItem) {
    if (!activeTrip || !days) return;
    const updated = ItineraryService.removeItem(activeTrip.id, item.dayId, item.id);
    if (updated) {
      setDays(updated);
      analytics.track('itinerary_item_edited');
    }
  }

  function replaceItem(item: ItineraryItem) {
    if (!activeTrip || !days) return;
    const updated = ItineraryService.replaceItem(activeTrip.id, item.dayId, item.id);
    if (updated) {
      setDays(updated);
      analytics.track('itinerary_item_replaced');
    }
    setReplaceConfirm(null);
  }

  const totalEstimate = ItineraryService.getEstimatedTotal(days);

  return (
    <div className="min-h-screen bg-app pb-24 sm:pb-8">
      <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-app px-5 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-primary-c">AI Itinerary</h1>
          <p className="text-sm text-secondary-c mt-0.5" style={{ color: 'var(--text-secondary)' }}>{activeTrip.destination}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6">
        {genState === 'idle' && (!days || days.length === 0) && (
          <EmptyState
            icon={<CalendarDays size={40} />}
            title="No itinerary yet"
            message="Generate a day-by-day AI itinerary based on your trip details and interests. Review and edit it before you travel."
            action={<Button onClick={generate} size="lg"><Sparkles size={18} /> Generate Itinerary</Button>}
          />
        )}

        {genState === 'generating' && (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div className="mb-6 relative">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--ai-draft) 15%, transparent)' }}>
                <Sparkles size={28} style={{ color: 'var(--ai-draft)' }} />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-primary-c mb-1.5">Generating your itinerary</h3>
            <p className="text-sm text-secondary-c mb-6 text-center max-w-xs" style={{ color: 'var(--text-secondary)' }}>
              Crafting day-by-day activities based on your destination, dates, and interests…
            </p>
            <Spinner size={28} />
          </div>
        )}

        {genState === 'error' && (
          <EmptyState
            icon={<AlertCircle size={40} />}
            title="Generation failed"
            message="We couldn't generate your itinerary. Please check your connection and try again."
            action={<Button onClick={regenerate}><RefreshCw size={16} /> Retry</Button>}
          />
        )}

        {genState === 'success' && days && days.length > 0 && (
          <div className="animate-fade-in">
            {/* AI Draft notice */}
            <div className="mb-4 p-4 rounded-2xl flex items-start gap-3" style={{ backgroundColor: 'color-mix(in srgb, var(--ai-draft) 8%, transparent)' }}>
              <Sparkles size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--ai-draft)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--ai-draft)' }}>AI-generated draft</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Estimated activities & costs. Review before relying on this plan. You can edit, replace, or remove any activity.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Badge color="ai"><Sparkles size={10} /> AI Draft</Badge>
                <Badge color="cost"><DollarSign size={10} /> Est. {formatMoney(totalEstimate, activeTrip.currency)}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={regenerate}>
                <RefreshCw size={14} /> Regenerate
              </Button>
            </div>

            <div className="space-y-3">
              {days.map(day => {
                const isExpanded = expandedDay === day.id || days.length <= 3;
                const dayTotal = day.items.reduce((s, i) => s + i.estimatedCost, 0);
                return (
                  <Card key={day.id} padded={false} className="overflow-hidden">
                    <button onClick={() => setExpandedDay(isExpanded ? null : day.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-elevated transition-colors">
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                          <span className="text-xs font-medium" style={{ color: 'var(--primary)' }}>Day</span>
                          <span className="text-base font-bold leading-none" style={{ color: 'var(--primary)' }}>{day.position + 1}</span>
                        </div>
                        <div>
                          <p className="font-medium text-primary-c text-sm">{formatDate(day.date, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                          <p className="text-xs text-muted-c mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {day.items.length} activities · {formatMoney(dayTotal, activeTrip.currency)}
                          </p>
                        </div>
                      </div>
                      <ChevronDown size={18} className={`text-muted-c transition-transform ${isExpanded ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-2.5 animate-slide-down">
                        {day.items.length === 0 ? (
                          <p className="text-sm text-muted-c text-center py-4" style={{ color: 'var(--text-muted)' }}>No activities planned for this day.</p>
                        ) : (
                          <div className="relative">
                            {/* Timeline line */}
                            <div className="absolute left-[7px] top-2 bottom-2 w-px" style={{ backgroundColor: 'var(--border)' }} />
                            {day.items.map((item) => (
                              <div key={item.id} className="relative pl-8 pb-3 last:pb-0">
                                {/* Timeline dot */}
                                <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 bg-surface flex items-center justify-center" style={{ borderColor: 'var(--primary)' }}>
                                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--primary)' }} />
                                </div>
                                <div className="bg-elevated rounded-xl p-3.5 group">
                                  <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-medium text-primary-c text-sm">{item.title}</h4>
                                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className="text-xs text-secondary-c flex items-center gap-0.5" style={{ color: 'var(--text-secondary)' }}>
                                          <Clock size={11} /> {item.startTime}
                                        </span>
                                        <span className="text-xs text-secondary-c flex items-center gap-0.5" style={{ color: 'var(--text-secondary)' }}>
                                          <MapPin size={11} /> {item.location}
                                        </span>
                                      </div>
                                    </div>
                                    {item.estimatedCost > 0 && (
                                      <span className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--est-cost)' }}>
                                        ~{formatMoney(item.estimatedCost, activeTrip.currency)}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-secondary-c mb-2" style={{ color: 'var(--text-secondary)' }}>{item.description}</p>
                                  {item.notes && (
                                    <p className="text-xs italic text-muted-c mb-2" style={{ color: 'var(--text-muted)' }}>Note: {item.notes}</p>
                                  )}
                                  <div className="flex items-center justify-between">
                                    <Badge color="ai">{item.sourceLabel}</Badge>
                                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => editItem(item)} className="p-1.5 rounded-lg hover:bg-surface text-secondary-c" aria-label="Edit activity">
                                        <Pencil size={13} />
                                      </button>
                                      <button onClick={() => setReplaceConfirm(item)} className="p-1.5 rounded-lg hover:bg-surface text-secondary-c" aria-label="Replace activity">
                                        <RefreshCw size={13} />
                                      </button>
                                      <button onClick={() => removeItem(item)} className="p-1.5 rounded-lg hover:bg-surface text-error-c" style={{ color: 'var(--error)' }} aria-label="Remove activity">
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Edit Modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Activity">
        {editingItem && (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-primary-c text-sm mb-1">{editingItem.title}</h3>
              <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>{editingItem.location}</p>
            </div>
            <Input label="Start time" type="time" value={editingItem.startTime}
              onChange={e => setEditingItem({ ...editingItem, startTime: e.target.value })} />
            <Textarea label="Notes" value={editingItem.notes}
              onChange={e => setEditingItem({ ...editingItem, notes: e.target.value })}
              placeholder="Add personal notes about this activity…"
              rows={3} />
            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => setEditModalOpen(false)}>Cancel</Button>
              <Button fullWidth onClick={saveEdit}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Replace Confirm Modal */}
      <Modal open={!!replaceConfirm} onClose={() => setReplaceConfirm(null)} title="Replace Activity">
        {replaceConfirm && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--ai-draft) 8%, transparent)' }}>
              <Wand2 size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--ai-draft)' }} />
              <div>
                <p className="text-sm font-medium text-primary-c">Replace "{replaceConfirm.title}"?</p>
                <p className="text-xs text-secondary-c mt-1" style={{ color: 'var(--text-secondary)' }}>
                  This will generate a new AI-suggested activity in its place. All other activities in your itinerary will remain unchanged.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => setReplaceConfirm(null)}>Cancel</Button>
              <Button fullWidth onClick={() => replaceItem(replaceConfirm)}>
                <RefreshCw size={16} /> Replace Activity
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <BottomNav />
    </div>
  );
}
