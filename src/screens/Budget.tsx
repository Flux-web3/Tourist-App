import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { Card, Button, Modal, Input, Textarea, EmptyState, ProgressBar } from '@/components/ui';
import { BottomNav } from '@/components/BottomNav';
import { ExpenseService, ItineraryService, analytics } from '@/services';
import { formatMoney, formatDate, todayISO } from '@/data/demo';
import type { Expense, ExpenseCategory } from '@/types';
import { Receipt, Plus, Pencil, Trash2, TrendingDown, PiggyBank, Sparkles, Wallet, AlertCircle, Utensils, Car, Home, ShoppingBag, Package, MoreHorizontal } from 'lucide-react';

const CATEGORIES: { value: ExpenseCategory; label: string; icon: typeof Receipt }[] = [
  { value: 'food', label: 'Food', icon: Utensils },
  { value: 'transport', label: 'Transport', icon: Car },
  { value: 'accommodation', label: 'Accommodation', icon: Home },
  { value: 'activities', label: 'Activities', icon: Package },
  { value: 'shopping', label: 'Shopping', icon: ShoppingBag },
  { value: 'other', label: 'Other', icon: MoreHorizontal },
];

export function Budget() {
  const { activeTrip, navigate } = useApp();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Expense | null>(null);
  const [tick, setTick] = useState(0); // force re-render

  useEffect(() => {
    if (activeTrip) {
      setExpenses(ExpenseService.getAll(activeTrip.id));
    }
  }, [activeTrip, tick]);

  const actualSpent = useMemo(() => ExpenseService.getTotal(expenses), [expenses]);
  const itinerary = activeTrip ? ItineraryService.get(activeTrip.id) : null;
  const aiEstimate = ItineraryService.getEstimatedTotal(itinerary);
  const remaining = activeTrip ? activeTrip.budgetAmount - actualSpent : 0;
  const pctUsed = activeTrip && activeTrip.budgetAmount > 0 ? Math.round((actualSpent / activeTrip.budgetAmount) * 100) : 0;

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

  function refresh() { setTick(t => t + 1); }

  function openAdd() {
    setEditingExpense(null);
    setModalOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditingExpense({ ...expense });
    setModalOpen(true);
  }

  function saveExpense(form: {
    title: string; category: ExpenseCategory; amount: number; currency: string; date: string; note: string;
  }) {
    if (!activeTrip) return;
    if (editingExpense) {
      ExpenseService.update(activeTrip.id, editingExpense.id, form);
    } else {
      ExpenseService.add(activeTrip.id, form);
      analytics.track('expense_added', { category: form.category });
    }
    setModalOpen(false);
    setEditingExpense(null);
    refresh();
  }

  function deleteExpense(expense: Expense) {
    if (!activeTrip) return;
    ExpenseService.delete(activeTrip.id, expense.id);
    setDeleteConfirm(null);
    refresh();
  }

  // Group expenses by category for summary
  const byCategory = CATEGORIES.map(cat => {
    const catExpenses = expenses.filter(e => e.category === cat.value);
    return { ...cat, total: catExpenses.reduce((s, e) => s + e.amount, 0), count: catExpenses.length };
  }).filter(c => c.count > 0);

  // Sort expenses by date desc
  const sortedExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="min-h-screen bg-app pb-24 sm:pb-8">
      <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-app px-5 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-primary-c">Budget & Expenses</h1>
          <p className="text-sm text-secondary-c mt-0.5" style={{ color: 'var(--text-secondary)' }}>{activeTrip.title}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-5 animate-fade-in">
        {/* Financial Summary */}
        <Card>
          <h2 className="font-semibold text-primary-c mb-4">Financial Summary</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--elevated)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet size={14} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>Trip Budget</span>
              </div>
              <p className="text-lg font-bold text-primary-c">{formatMoney(activeTrip.budgetAmount, activeTrip.currency)}</p>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--ai-draft) 10%, transparent)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles size={14} style={{ color: 'var(--ai-draft)' }} />
                <span className="text-xs" style={{ color: 'var(--ai-draft)' }}>AI Draft Est.</span>
              </div>
              <p className="text-lg font-bold" style={{ color: 'var(--ai-draft)' }}>{formatMoney(aiEstimate, activeTrip.currency)}</p>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--actual-spend) 10%, transparent)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown size={14} style={{ color: 'var(--actual-spend)' }} />
                <span className="text-xs" style={{ color: 'var(--actual-spend)' }}>Actual Spent</span>
              </div>
              <p className="text-lg font-bold" style={{ color: 'var(--actual-spend)' }}>{formatMoney(actualSpent, activeTrip.currency)}</p>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: remaining >= 0 ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'color-mix(in srgb, var(--error) 10%, transparent)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <PiggyBank size={14} style={{ color: remaining >= 0 ? 'var(--success)' : 'var(--error)' }} />
                <span className="text-xs" style={{ color: remaining >= 0 ? 'var(--success)' : 'var(--error)' }}>Remaining</span>
              </div>
              <p className="text-lg font-bold" style={{ color: remaining >= 0 ? 'var(--success)' : 'var(--error)' }}>{formatMoney(remaining, activeTrip.currency)}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>Budget used</span>
              <span className="text-xs font-medium text-primary-c">{pctUsed}%</span>
            </div>
            <ProgressBar value={actualSpent} max={activeTrip.budgetAmount} color={remaining >= 0 ? 'var(--actual-spend)' : 'var(--error)'} />
          </div>
          <div className="mt-3 p-3 rounded-xl flex items-start gap-2" style={{ backgroundColor: 'color-mix(in srgb, var(--ai-draft) 8%, transparent)' }}>
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--ai-draft)' }} />
            <p className="text-xs" style={{ color: 'var(--ai-draft)' }}>
              AI Draft Estimate is separate from actual spending. Remaining budget = Trip Budget − Actual Spent.
            </p>
          </div>
        </Card>

        {/* Category breakdown */}
        {byCategory.length > 0 && (
          <Card>
            <h2 className="font-semibold text-primary-c mb-3">Spending by Category</h2>
            <div className="space-y-2.5">
              {byCategory.map(cat => (
                <div key={cat.value} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
                    <cat.icon size={15} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-primary-c capitalize">{cat.label}</span>
                      <span className="text-sm font-medium text-primary-c">{formatMoney(cat.total, activeTrip.currency)}</span>
                    </div>
                    <ProgressBar value={cat.total} max={actualSpent} color="var(--accent)" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Expenses list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-primary-c">Expenses</h2>
            <Button size="sm" onClick={openAdd}><Plus size={16} /> Add Expense</Button>
          </div>

          {sortedExpenses.length === 0 ? (
            <EmptyState
              icon={<Receipt size={40} />}
              title="No expenses yet"
              message="Track your spending to keep your budget in check. Add your first expense to get started."
              action={<Button onClick={openAdd}><Plus size={18} /> Add Expense</Button>}
            />
          ) : (
            <div className="space-y-2.5">
              {sortedExpenses.map(expense => {
                const cat = CATEGORIES.find(c => c.value === expense.category) ?? CATEGORIES[5];
                return (
                  <Card key={expense.id} padded={false} className="overflow-hidden">
                    <div className="flex items-center gap-3 p-4 group">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
                        <cat.icon size={18} style={{ color: 'var(--accent)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-primary-c text-sm truncate">{expense.title}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-c capitalize" style={{ color: 'var(--text-muted)' }}>{expense.category}</span>
                          <span className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>·</span>
                          <span className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>{formatDate(expense.date)}</span>
                        </div>
                        {expense.note && <p className="text-xs text-secondary-c mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>{expense.note}</p>}
                      </div>
                      <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--actual-spend)' }}>
                        {formatMoney(expense.amount, expense.currency)}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(expense)} className="p-1.5 rounded-lg hover:bg-elevated text-secondary-c" aria-label="Edit expense">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleteConfirm(expense)} className="p-1.5 rounded-lg hover:bg-elevated" style={{ color: 'var(--error)' }} aria-label="Delete expense">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <ExpenseModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingExpense(null); }}
        onSave={saveExpense}
        editing={editingExpense}
        currency={activeTrip.currency}
      />

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Expense">
        {deleteConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-secondary-c" style={{ color: 'var(--text-secondary)' }}>
              Delete "{deleteConfirm.title}" ({formatMoney(deleteConfirm.amount, deleteConfirm.currency)})? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="danger" fullWidth onClick={() => deleteExpense(deleteConfirm)}>Delete</Button>
            </div>
          </div>
        )}
      </Modal>

      <BottomNav />
    </div>
  );
}

function ExpenseModal({
  open, onClose, onSave, editing, currency,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (form: { title: string; category: ExpenseCategory; amount: number; currency: string; date: string; note: string }) => void;
  editing: Expense | null;
  currency: string;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      if (editing) {
        setTitle(editing.title);
        setCategory(editing.category);
        setAmount(editing.amount);
        setDate(editing.date);
        setNote(editing.note);
      } else {
        setTitle('');
        setCategory('food');
        setAmount(0);
        setDate(todayISO());
        setNote('');
      }
      setErrors({});
    }
  }, [open, editing]);

  function submit() {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (amount <= 0) errs.amount = 'Amount must be greater than 0';
    if (amount > 1000000) errs.amount = 'Amount seems too high';
    if (!date) errs.date = 'Date is required';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({ title: title.trim(), category, amount, currency, date, note: note.trim() });
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Expense' : 'Add Expense'}>
      <div className="space-y-4">
        <Input label="Title" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Lunch at Le Comptoir"
          error={errors.title} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-primary-c mb-2">Category</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CATEGORIES.map(cat => (
                <button key={cat.value} onClick={() => setCategory(cat.value)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${category === cat.value ? 'border-transparent' : 'border-app hover:bg-elevated'}`}
                  style={category === cat.value ? { backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)', borderColor: 'var(--primary)' } : { backgroundColor: 'var(--surface)' }}>
                  <cat.icon size={16} style={{ color: category === cat.value ? 'var(--primary)' : 'var(--text-muted)' }} />
                  <span className="text-[10px] font-medium" style={{ color: category === cat.value ? 'var(--primary)' : 'var(--text-secondary)' }}>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label={`Amount (${currency})`} type="number" value={amount || ''} min={0} step={0.01}
            onChange={e => setAmount(Number(e.target.value))}
            error={errors.amount} />
          <Input label="Date" type="date" value={date}
            onChange={e => setDate(e.target.value)}
            error={errors.date} />
        </div>

        <Textarea label="Note (optional)" value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Add a note about this expense…"
          rows={2} />

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
          <Button fullWidth onClick={submit}>{editing ? 'Save Changes' : 'Add Expense'}</Button>
        </div>
      </div>
    </Modal>
  );
}
