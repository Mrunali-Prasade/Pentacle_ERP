import React, { useEffect, useState } from 'react';

interface HolidaysTabProps {
  triggerToast: (message: string, variant?: string) => void;
}

export default function HolidaysTab({ triggerToast }: HolidaysTabProps) {
  const [holidays, setHolidays] = useState<{ date: string, name: string }[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  useEffect(() => {
    fetch('/api/holidays')
      .then(res => res.json())
      .then(data => setHolidays(data));
  }, []);

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayName) return;
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newHolidayDate, name: newHolidayName })
      });
      if (res.ok) {
        setHolidays([...holidays, { date: newHolidayDate, name: newHolidayName }].sort((a, b) => a.date.localeCompare(b.date)));
        setNewHolidayDate('');
        setNewHolidayName('');
        triggerToast('Holiday added successfully');
      }
    } catch (e) {}
  };

  const handleDeleteHoliday = async (date: string) => {
    try {
      const res = await fetch(`/api/holidays/${date}`, { method: 'DELETE' });
      if (res.ok) {
        setHolidays(holidays.filter(h => h.date !== date));
        triggerToast('Holiday deleted');
      }
    } catch (e) {}
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-[#021934] mb-4">Add New Holiday</h3>
        <form onSubmit={handleAddHoliday} className="flex gap-4 items-end">
          <div className="flex-grow">
            <label className="block text-xs font-bold text-slate-500 mb-1">Holiday Name</label>
            <input
              type="text"
              required
              value={newHolidayName}
              onChange={e => setNewHolidayName(e.target.value)}
              placeholder="e.g. Diwali"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 text-sm"
            />
          </div>
          <div className="flex-grow">
            <label className="block text-xs font-bold text-slate-500 mb-1">Date</label>
            <input
              type="date"
              required
              value={newHolidayDate}
              onChange={e => setNewHolidayDate(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2 bg-[#021934] text-white font-bold rounded-lg hover:bg-slate-800 transition-colors text-sm"
          >
            Add Holiday
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
              <th className="p-4 font-semibold">Date</th>
              <th className="p-4 font-semibold">Holiday Name</th>
              <th className="p-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {holidays.length > 0 ? (
              holidays.map(h => (
                <tr key={h.date} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-sm font-medium text-[#021934]">{h.date}</td>
                  <td className="p-4 text-sm text-slate-700">{h.name}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDeleteHoliday(h.date)}
                      className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="p-8 text-center text-slate-500 text-sm">No holidays configured yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
