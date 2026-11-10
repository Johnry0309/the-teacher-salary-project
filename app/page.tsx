export const dynamic = 'force-dynamic'
'use client';


import React, { useState, useEffect, useMemo } from 'react';
import { Printer, Plus, Trash2, Calendar, User, LogOut, Loader2, Zap, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';



interface ClassLog {
  id: string;
  log_date: string;
  student_name: string;
  class_type: 'REGULAR' | 'ELT';
  attendance: 'PRESENT' | 'ABSENT';
  calculated_pay: number;
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [successMsg, setSuccessMsg] = useState('');

  // --- Teacher Profile State ---
  const [teacherName, setTeacherName] = useState('Teacher');
  const [hourlyRate, setHourlyRate] = useState<number>(150);
  const [accountType, setAccountType] = useState<'REGULAR' | 'ELT'>('REGULAR');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // --- Class Logs State ---
  const [logs, setLogs] = useState<ClassLog[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // --- Individual Form State ---
  const [logDate, setLogDate] = useState('');
  const [studentName, setStudentName] = useState('');
  const [classType, setClassType] = useState<'REGULAR' | 'ELT'>('REGULAR');
  const [attendance, setAttendance] = useState<'PRESENT' | 'ABSENT'>('PRESENT');

  // --- Bulk Hours Form State ---
  const [bulkDate, setBulkDate] = useState('');
  const [bulkHours, setBulkHours] = useState<number>(2);
  const [bulkClassType, setBulkClassType] = useState<'REGULAR' | 'ELT'>('REGULAR');
  const [bulkAttendance, setBulkAttendance] = useState<'PRESENT' | 'ABSENT'>('PRESENT');

  // --- Date Range Filter State ---
  const [filterMode, setFilterMode] = useState<'this-week' | 'this-month' | 'custom'>('this-month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Helper for floating success messages
  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg('');
    }, 4000);
  };

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setLogDate(today);
    setBulkDate(today);
  }, []);

  useEffect(() => {
    async function checkUserAndFetchData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth');
        return;
      }
      setUser(session.user);
      await fetchProfileAndLogs(session.user.id);
      setLoading(false);
    }
    checkUserAndFetchData();
  }, [router]);

  const fetchProfileAndLogs = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileData) {
      setTeacherName(profileData.teacher_name);
      setHourlyRate(Number(profileData.hourly_rate));
      setAccountType(profileData.account_type);
      setClassType(profileData.account_type);
      setBulkClassType(profileData.account_type);
    }

    const { data: logsData } = await supabase
      .from('class_logs')
      .select('*')
      .eq('user_id', userId)
      .order('log_date', { ascending: false });

    if (logsData) {
      setLogs(logsData);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    await supabase
      .from('profiles')
      .update({
        teacher_name: teacherName,
        hourly_rate: hourlyRate,
        account_type: accountType,
      })
      .eq('id', user.id);
    setIsSavingProfile(false);
    triggerSuccess('Profile settings successfully saved!');
  };

  const calculatePay = (type: 'REGULAR' | 'ELT', status: 'PRESENT' | 'ABSENT', rate: number) => {
    const halfHourRate = rate / 2;
    if (type === 'ELT') return halfHourRate;
    return status === 'PRESENT' ? halfHourRate : 25;
  };

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const pay = calculatePay(classType, attendance, hourlyRate);
    const newEntry = {
      user_id: user.id,
      log_date: logDate,
      student_name: studentName || 'Unnamed Student',
      class_type: classType,
      attendance,
      audit_duration_minutes: 30,
      calculated_pay: pay,
    };

    const { data, error } = await supabase
      .from('class_logs')
      .insert([newEntry])
      .select()
      .single();

    if (!error && data) {
      setLogs([data, ...logs]);
      setStudentName('');
      triggerSuccess('Class session successfully logged!');
    }
  };

  const handleAddBulkHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || bulkHours <= 0) return;

    const numberOfSessions = Math.round(bulkHours * 2);
    const payPerSession = calculatePay(bulkClassType, bulkAttendance, hourlyRate);

    const entriesToInsert = Array.from({ length: numberOfSessions }, (_, i) => ({
      user_id: user.id,
      log_date: bulkDate,
      student_name: `Bulk Entry #${i + 1} (${bulkHours} hrs total)`,
      class_type: bulkClassType,
      attendance: bulkAttendance,
      audit_duration_minutes: 30,
      calculated_pay: payPerSession,
    }));

    const { data, error } = await supabase
      .from('class_logs')
      .insert(entriesToInsert)
      .select();

    if (!error && data) {
      setLogs([...data, ...logs]);
      triggerSuccess(`Successfully added ${bulkHours} hours (${numberOfSessions} sessions)!`);
    }
  };

  // Delete Single Entry
  const handleDeleteLog = async (id: string) => {
    const { error } = await supabase.from('class_logs').delete().eq('id', id);
    if (!error) {
      setLogs(logs.filter((log) => log.id !== id));
      setSelectedIds(selectedIds.filter((item) => item !== id));
      triggerSuccess('Class entry deleted successfully.');
    }
  };

  // Batch Delete Selected Entries
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;

    const { error } = await supabase.from('class_logs').delete().in('id', selectedIds);
    if (!error) {
      setLogs(logs.filter((log) => !selectedIds.includes(log.id)));
      setSelectedIds([]);
      triggerSuccess(`Successfully deleted ${count} selected entries!`);
    }
  };

  // Selection Checkbox Handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredLogs.map((log) => log.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  const filteredLogs = useMemo(() => {
    const now = new Date();
    return logs.filter((log) => {
      const logDateObj = new Date(log.log_date);

      if (filterMode === 'this-week') {
        const startOfWeek = new Date(now);
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return logDateObj >= startOfWeek && logDateObj <= endOfWeek;
      }

      if (filterMode === 'this-month') {
        return (
          logDateObj.getMonth() === now.getMonth() &&
          logDateObj.getFullYear() === now.getFullYear()
        );
      }

      if (filterMode === 'custom') {
        if (!customStartDate || !customEndDate) return true;
        const start = new Date(customStartDate);
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        return logDateObj >= start && logDateObj <= end;
      }

      return true;
    });
  }, [logs, filterMode, customStartDate, customEndDate]);

  const totalClasses = filteredLogs.length;
  const totalAuditedHours = totalClasses * 0.5;
  const totalEarnings = filteredLogs.reduce((sum, log) => sum + Number(log.calculated_pay), 0);
  const isAllSelected = filteredLogs.length > 0 && selectedIds.length === filteredLogs.length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 gap-2">
        <Loader2 className="animate-spin" size={24} /> Loading your workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto print:hidden space-y-6 mb-8">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Teacher Salary & Hours Tracker</h1>
            <p className="text-sm text-slate-500">Logged in as {user?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow transition text-sm"
            >
              <Printer size={16} /> Print Statement
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg font-medium transition text-sm"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>

        {/* Global Success Notification Banner */}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-2 shadow-sm text-sm font-medium">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Teacher Configuration Profile */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <User size={20} className="text-indigo-600" /> Teacher Profile & Settings
            </h2>
            <button
              onClick={handleUpdateProfile}
              disabled={isSavingProfile}
              className="bg-slate-800 hover:bg-slate-900 text-white text-xs px-3 py-1.5 rounded font-medium transition"
            >
              {isSavingProfile ? 'Saving...' : 'Save Profile Settings'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Teacher Name</label>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Hourly Base Rate (₱/hr)</label>
              <input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Default Account Type</label>
              <select
                value={accountType}
                onChange={(e) => {
                  const val = e.target.value as 'REGULAR' | 'ELT';
                  setAccountType(val);
                  setClassType(val);
                  setBulkClassType(val);
                }}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="REGULAR">Regular Account (₱25 on Absent)</option>
                <option value="ELT">ELT Level Test (Full Pay Always)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Quick Bulk Hours Entry */}
        <section className="bg-indigo-50 p-6 rounded-xl shadow-sm border border-indigo-100">
          <h2 className="text-lg font-semibold mb-2 text-indigo-900 flex items-center gap-2">
            <Zap size={20} className="text-indigo-600" /> Quick Add by Total Hours
          </h2>
          <p className="text-xs text-indigo-700 mb-4">
            Taught multiple classes today? Enter total hours (e.g. 3 hours) to log them instantly without adding students one by one.
          </p>
          <form onSubmit={handleAddBulkHours} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-indigo-900 mb-1">Date</label>
              <input
                type="date"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
                required
                className="w-full border border-indigo-200 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-indigo-900 mb-1">Total Hours</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                placeholder="e.g. 2.5"
                value={bulkHours}
                onChange={(e) => setBulkHours(Number(e.target.value))}
                required
                className="w-full border border-indigo-200 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-indigo-900 mb-1">Class Type</label>
              <select
                value={bulkClassType}
                onChange={(e) => setBulkClassType(e.target.value as 'REGULAR' | 'ELT')}
                className="w-full border border-indigo-200 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="REGULAR">Regular</option>
                <option value="ELT">ELT Test</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-indigo-900 mb-1">Attendance Status</label>
              <select
                value={bulkAttendance}
                onChange={(e) => setBulkAttendance(e.target.value as 'PRESENT' | 'ABSENT')}
                className="w-full border border-indigo-200 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="PRESENT">Present</option>
                <option value="ABSENT">Absent</option>
              </select>
            </div>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium p-2.5 rounded-lg text-sm shadow transition flex items-center justify-center gap-1"
            >
              <Plus size={18} /> Add Hours Batch
            </button>
          </form>
        </section>

        {/* Individual Class Log Entry Form */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 text-slate-900 flex items-center gap-2">
            <Plus size={20} className="text-indigo-600" /> Or Log Individual Session (25 mins / 30 mins audit)
          </h2>
          <form onSubmit={handleAddLog} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Student Name (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Alex"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Class Type</label>
              <select
                value={classType}
                onChange={(e) => setClassType(e.target.value as 'REGULAR' | 'ELT')}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="REGULAR">Regular</option>
                <option value="ELT">ELT Test</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Attendance</label>
              <select
                value={attendance}
                onChange={(e) => setAttendance(e.target.value as 'PRESENT' | 'ABSENT')}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="PRESENT">Present</option>
                <option value="ABSENT">Absent</option>
              </select>
            </div>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium p-2.5 rounded-lg text-sm shadow transition flex items-center justify-center gap-1"
            >
              <Plus size={18} /> Add Session
            </button>
          </form>
        </section>

        {/* Filter Bar Controls & Batch Action */}
        <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar size={18} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Statement Range Filter:</span>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as any)}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
            >
              <option value="this-month">This Month</option>
              <option value="this-week">This Week</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {selectedIds.length > 0 && (
            <button
              onClick={handleBatchDelete}
              className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-2 rounded-lg font-medium shadow transition flex items-center gap-1.5"
            >
              <Trash2 size={15} /> Delete Selected ({selectedIds.length})
            </button>
          )}

          {filterMode === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="border border-slate-300 rounded-lg p-1.5 text-xs"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="border border-slate-300 rounded-lg p-1.5 text-xs"
              />
            </div>
          )}
        </section>
      </div>

      {/* --- PRINT & VIEWABLE STATEMENT CONTENT --- */}
      <main className="max-w-5xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0">
        <div className="border-b-2 border-slate-800 pb-4 mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">
            Teacher Hours & Salary Statement
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Audited Class Logs & Payout Calculation Summary
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm mb-6 print:bg-transparent">
          <div>
            <p><strong>Teacher:</strong> {teacherName}</p>
            <p><strong>Base Hourly Rate:</strong> ₱{Number(hourlyRate).toFixed(2)} / hr</p>
          </div>
          <div>
            <p><strong>Account Type:</strong> {accountType}</p>
            <p><strong>Audit Standard:</strong> 30 Mins (0.5 hr) per Class</p>
          </div>
        </div>

        <table className="w-full text-left border-collapse border border-slate-300 text-sm mb-6">
          <thead>
            <tr className="bg-slate-100 print:bg-slate-200 text-slate-700">
              <th className="border border-slate-300 p-2.5 text-center print:hidden w-10">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </th>
              <th className="border border-slate-300 p-2.5">Date</th>
              <th className="border border-slate-300 p-2.5">Student</th>
              <th className="border border-slate-300 p-2.5">Class Type</th>
              <th className="border border-slate-300 p-2.5">Attendance</th>
              <th className="border border-slate-300 p-2.5">Audited Time</th>
              <th className="border border-slate-300 p-2.5 text-right">Calculated Pay</th>
              <th className="border border-slate-300 p-2.5 text-center print:hidden">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-6 text-slate-400">
                  No classes logged for this selected period.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isChecked = selectedIds.includes(log.id);
                return (
                  <tr key={log.id} className={`hover:bg-slate-50 ${isChecked ? 'bg-indigo-50/50' : ''}`}>
                    <td className="border border-slate-300 p-2.5 text-center print:hidden">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSelect(log.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>
                    <td className="border border-slate-300 p-2.5">{log.log_date}</td>
                    <td className="border border-slate-300 p-2.5">{log.student_name}</td>
                    <td className="border border-slate-300 p-2.5">{log.class_type}</td>
                    <td className="border border-slate-300 p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          log.attendance === 'PRESENT'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {log.attendance}
                      </span>
                    </td>
                    <td className="border border-slate-300 p-2.5">30 Mins (0.5 hr)</td>
                    <td className="border border-slate-300 p-2.5 text-right font-medium">
                      ₱{Number(log.calculated_pay).toFixed(2)}
                    </td>
                    <td className="border border-slate-300 p-2.5 text-center print:hidden">
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Delete entry"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-full sm:w-72 bg-slate-50 p-4 rounded-lg border border-slate-300 space-y-2 text-sm print:border-black">
            <div className="flex justify-between">
              <span className="text-slate-600">Total Classes:</span>
              <span className="font-semibold">{totalClasses}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Total Audited Hours:</span>
              <span className="font-semibold">{totalAuditedHours} Hrs</span>
            </div>
            <hr className="border-slate-300 my-2" />
            <div className="flex justify-between text-base font-bold text-slate-900">
              <span>Total Estimated Pay:</span>
              <span className="text-indigo-600 print:text-black">₱{totalEarnings.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}