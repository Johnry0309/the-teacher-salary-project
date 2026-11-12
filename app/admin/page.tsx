'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Printer, ArrowLeft, ShieldCheck, Calendar, Users, Loader2, Search } from 'lucide-react';
import Link from 'next/link';

interface TeacherProfile {
  id: string;
  teacher_name: string;
  hourly_rate: number;
  account_type: 'REGULAR' | 'ELT';
  role?: string;
}

interface ClassLog {
  id: string;
  user_id: string;
  log_date: string;
  student_name: string;
  class_type: 'REGULAR' | 'ELT';
  attendance: 'PRESENT' | 'ABSENT';
  calculated_pay: number;
}

export default function AdminPayrollDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [currentDate, setCurrentDate] = useState<string>('');

  // --- Data State ---
  const [profiles, setProfiles] = useState<TeacherProfile[]>([]);
  const [allLogs, setAllLogs] = useState<ClassLog[]>([]);

  // --- Filter State ---
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('ALL');
  const [filterMode, setFilterMode] = useState<'this-week' | 'this-month' | 'custom'>('this-month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    setCurrentDate(new Date().toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    async function verifyAdminAndLoadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth');
        return;
      }

      // Check if logged-in user has ADMIN role
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (!myProfile || myProfile.role !== 'ADMIN') {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      // Fetch all teacher profiles
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('*')
        .order('teacher_name', { ascending: true });

      // Fetch all class logs across all teachers
      const { data: logsData } = await supabase
        .from('class_logs')
        .select('*')
        .order('log_date', { ascending: false });

      if (profilesData) setProfiles(profilesData);
      if (logsData) setAllLogs(logsData);
      setLoading(false);
    }

    verifyAdminAndLoadData();
  }, [router]);

  // Create quick lookup map for teacher names
  const teacherMap = useMemo(() => {
    const map: Record<string, TeacherProfile> = {};
    profiles.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [profiles]);

  // Filter logs by Date Range & Selected Teacher
  const filteredLogs = useMemo(() => {
    if (!currentDate) return [];
    const now = new Date(currentDate);

    return allLogs.filter((log) => {
      if (!log.log_date) return false;
      if (selectedTeacherId !== 'ALL' && log.user_id !== selectedTeacherId) return false;

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
  }, [allLogs, selectedTeacherId, filterMode, customStartDate, customEndDate, currentDate]);

  // Aggregate Payroll Per Teacher for the selected date range
  const teacherPayrollSummaries = useMemo(() => {
    if (!currentDate) return [];
    const now = new Date(currentDate);

    // Date-filtered logs across all teachers
    const dateFilteredLogs = allLogs.filter((log) => {
      if (!log.log_date) return false;
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

    return profiles.map((teacher) => {
      const tLogs = dateFilteredLogs.filter((l) => l.user_id === teacher.id);
      const classesCount = tLogs.length;
      const auditedHours = classesCount * 0.5;
      const totalPay = tLogs.reduce((sum, l) => sum + Number(l.calculated_pay), 0);

      return {
        ...teacher,
        classesCount,
        auditedHours,
        totalPay,
      };
    });
  }, [profiles, allLogs, filterMode, customStartDate, customEndDate, currentDate]);

  const grandTotalClasses = filteredLogs.length;
  const grandTotalHours = grandTotalClasses * 0.5;
  const grandTotalPayout = filteredLogs.reduce((sum, log) => sum + Number(log.calculated_pay), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 gap-2">
        <Loader2 className="animate-spin" size={24} /> Verifying HR & Admin access...
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-red-200 text-center space-y-4">
          <h1 className="text-xl font-bold text-red-600">Access Restricted</h1>
          <p className="text-sm text-slate-600">
            This portal is restricted to Team Leaders and HR Administrators. Contact your system administrator to request access.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            <ArrowLeft size={16} /> Return to My Tracker
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto print:hidden space-y-6 mb-8">
        {/* Top Admin Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 text-white p-6 rounded-xl shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={22} className="text-emerald-400" />
              <h1 className="text-2xl font-bold">HR & Team Leader Payroll Portal</h1>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Consolidated Teacher Hours & Salary Audit Dashboard
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium shadow transition text-sm"
            >
              <Printer size={16} /> Print Master Payroll
            </button>
            <Link
              href="/"
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg font-medium transition text-sm"
            >
              <ArrowLeft size={16} /> Personal View
            </Link>
          </div>
        </header>

        {/* Filter Controls */}
        <section className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Period:</span>
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
          </div>

          <div className="flex items-center gap-2">
            <Search size={18} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Filter Teacher:</span>
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
            >
              <option value="ALL">All Teachers ({profiles.length})</option>
              {profiles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.teacher_name}
                </option>
              ))}
            </select>
          </div>
        </section>
      </div>

      {/* --- PRINTABLE & VIEWABLE MASTER REPORT --- */}
      <main className="max-w-6xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0 space-y-8">
        <div className="border-b-2 border-slate-800 pb-4 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">
            Master Teacher Payroll & Hours Report
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Official HR & Team Leader Consolidated Audit Statement
          </p>
        </div>

        {/* Summary Table By Teacher */}
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Users size={18} className="text-indigo-600 print:hidden" /> Teacher Payout Summary
          </h2>
          <table className="w-full text-left border-collapse border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100 print:bg-slate-200 text-slate-700">
                <th className="border border-slate-300 p-2.5">Teacher Name</th>
                <th className="border border-slate-300 p-2.5">Account Type</th>
                <th className="border border-slate-300 p-2.5 text-right">Base Rate</th>
                <th className="border border-slate-300 p-2.5 text-center">Total Classes</th>
                <th className="border border-slate-300 p-2.5 text-center">Audited Hours</th>
                <th className="border border-slate-300 p-2.5 text-right">Total Payout</th>
              </tr>
            </thead>
            <tbody>
              {teacherPayrollSummaries.map((teacher) => (
                <tr
                  key={teacher.id}
                  onClick={() =>
                    setSelectedTeacherId(selectedTeacherId === teacher.id ? 'ALL' : teacher.id)
                  }
                  className={`cursor-pointer hover:bg-indigo-50/60 transition ${
                    selectedTeacherId === teacher.id ? 'bg-indigo-50 font-medium' : ''
                  }`}
                  title="Click to filter detailed logs for this teacher"
                >
                  <td className="border border-slate-300 p-2.5 font-medium text-slate-900">
                    {teacher.teacher_name}
                  </td>
                  <td className="border border-slate-300 p-2.5">{teacher.account_type}</td>
                  <td className="border border-slate-300 p-2.5 text-right">
                    ₱{Number(teacher.hourly_rate).toFixed(2)}/hr
                  </td>
                  <td className="border border-slate-300 p-2.5 text-center">
                    {teacher.classesCount}
                  </td>
                  <td className="border border-slate-300 p-2.5 text-center">
                    {teacher.auditedHours} Hrs
                  </td>
                  <td className="border border-slate-300 p-2.5 text-right font-bold text-indigo-700 print:text-black">
                    ₱{teacher.totalPay.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detailed Class Logs Table */}
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">
            Detailed Audit Logs ({selectedTeacherId === 'ALL' ? 'All Teachers' : teacherMap[selectedTeacherId]?.teacher_name})
          </h2>
          <table className="w-full text-left border-collapse border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100 print:bg-slate-200 text-slate-700">
                <th className="border border-slate-300 p-2.5">Date</th>
                <th className="border border-slate-300 p-2.5">Teacher</th>
                <th className="border border-slate-300 p-2.5">Student / Batch</th>
                <th className="border border-slate-300 p-2.5">Type</th>
                <th className="border border-slate-300 p-2.5">Attendance</th>
                <th className="border border-slate-300 p-2.5 text-right">Pay</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-400">
                    No class logs found for the selected filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="border border-slate-300 p-2.5">{log.log_date}</td>
                    <td className="border border-slate-300 p-2.5 font-medium">
                      {teacherMap[log.user_id]?.teacher_name || 'Unknown Teacher'}
                    </td>
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
                    <td className="border border-slate-300 p-2.5 text-right font-medium">
                      ₱{Number(log.calculated_pay).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Grand Totals Box */}
        <div className="flex justify-end">
          <div className="w-full sm:w-80 bg-slate-50 p-4 rounded-lg border border-slate-300 space-y-2 text-sm print:border-black">
            <div className="flex justify-between">
              <span className="text-slate-600">Total Audited Classes:</span>
              <span className="font-semibold">{grandTotalClasses}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Total Audited Hours:</span>
              <span className="font-semibold">{grandTotalHours} Hrs</span>
            </div>
            <hr className="border-slate-300 my-2" />
            <div className="flex justify-between text-base font-bold text-slate-900">
              <span>Grand Total Payroll:</span>
              <span className="text-indigo-600 print:text-black">₱{grandTotalPayout.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}