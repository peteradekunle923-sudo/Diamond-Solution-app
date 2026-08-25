import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { DEPARTMENTS, DEPARTMENT_PRICES } from '../constants';
import { ImageUploader } from './ImageUploader';
import { compressImage } from '../lib/imageUtils';
import { 
  Building2, 
  BookOpen, 
  Search, 
  Upload, 
  CheckCircle2, 
  Sparkles, 
  Image as ImageIcon, 
  Layers, 
  ArrowRight,
  Eye,
  RefreshCw
} from 'lucide-react';

export function MediaManager() {
  const [activeSubTab, setActiveSubTab] = useState<'departments' | 'courses'>('departments');
  const [customFaculties, setCustomFaculties] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubFaculties = onSnapshot(collection(db, 'faculties'), (snap) => {
      setCustomFaculties(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    const unsubCourses = onSnapshot(collection(db, 'courses'), (snap) => {
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubFaculties();
      unsubCourses();
    };
  }, []);

  const flashSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  // Compile combined departments
  const allDepts = (() => {
    const activeCustom = customFaculties.filter(f => !f.isDeleted);
    const deletedStatic = customFaculties.filter(f => f.isDeleted).map(f => f.name);
    
    const staticList = DEPARTMENTS.filter(d => !deletedStatic.includes(d)).map(name => {
      const custom = customFaculties.find(cf => cf.name === name && !cf.isDeleted);
      return custom ? { ...custom, isStatic: false } : {
        name,
        isStatic: true,
        price: DEPARTMENT_PRICES[name]?.ngn || 10000,
        imageUrl: ''
      };
    });

    const additionalCustom = activeCustom.filter(cf => !DEPARTMENTS.includes(cf.name));
    return [...staticList, ...additionalCustom];
  })();

  const handleUpdateFacultyImage = async (dept: any, imageUrl: string) => {
    try {
      setUpdatingId(dept.name || dept.id);
      if (dept.id && !dept.isStatic) {
        await updateDoc(doc(db, 'faculties', dept.id), {
          imageUrl,
          updatedAt: new Date().toISOString()
        });
      } else {
        await setDoc(doc(db, 'faculties', dept.name), {
          name: dept.name,
          price: dept.price || 10000,
          priceUSD: dept.priceUSD || 7,
          imageUrl,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
      flashSuccess(`Picture updated for ${dept.name}!`);
    } catch (e) {
      console.error(e);
      alert('Failed to save department image.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdateCourseImage = async (course: any, imageUrl: string) => {
    try {
      setUpdatingId(course.id);
      await updateDoc(doc(db, 'courses', course.id), {
        imageUrl,
        thumbnail: imageUrl,
        updatedAt: new Date().toISOString()
      });
      flashSuccess(`Picture updated for ${course.title}!`);
    } catch (e) {
      console.error(e);
      alert('Failed to save course image.');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredDepts = allDepts.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCourses = courses.filter(c => {
    if (c.isDeleted) return false;
    const matchesDept = selectedDeptFilter === 'all' || c.department === selectedDeptFilter;
    const matchesSearch = c.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.level?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDept && matchesSearch;
  });

  return (
    <div className="space-y-8 font-sans">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#0B1E3D] to-[#1B3FA0] rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[#D4AF37] text-[11px] font-black uppercase tracking-widest mb-3">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Media & Visual Assets Hub</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-serif font-black tracking-tight text-white">
              Department & Course Picture Manager
            </h1>
            <p className="text-white/80 text-xs md:text-sm mt-1.5 max-w-2xl font-light">
              Upload and manage high-definition pictures displayed prominently on the <span className="text-[#D4AF37] font-semibold">left side</span> of each Department and Course card across the student dashboard.
            </p>
          </div>

          {/* Sub-tab Switcher */}
          <div className="flex bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/15 self-start md:self-auto shrink-0">
            <button
              onClick={() => { setActiveSubTab('departments'); setSearchQuery(''); }}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeSubTab === 'departments'
                  ? 'bg-white text-[#0B1E3D] shadow-lg shadow-black/10 scale-100'
                  : 'text-white/80 hover:text-white hover:bg-white/5'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Departments ({allDepts.length})
            </button>
            <button
              onClick={() => { setActiveSubTab('courses'); setSearchQuery(''); }}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeSubTab === 'courses'
                  ? 'bg-white text-[#0B1E3D] shadow-lg shadow-black/10 scale-100'
                  : 'text-white/80 hover:text-white hover:bg-white/5'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Courses ({courses.filter(c => !c.isDeleted).length})
            </button>
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-3.5 rounded-2xl flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-xs font-bold">{successMessage}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-[#D8E3FF] rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={activeSubTab === 'departments' ? "Search department by name..." : "Search courses by title or level..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-900 placeholder-slate-400 outline-none focus:border-[#2563EB] transition-all"
            />
          </div>

          {activeSubTab === 'courses' && (
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="bg-[#EEF3FF] border border-[#D8E3FF] rounded-xl px-4 py-2.5 text-xs font-bold text-[#2563EB] uppercase tracking-wider outline-none focus:border-[#2563EB] cursor-pointer"
            >
              <option value="all">All Departments</option>
              {allDepts.map(d => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="text-[11px] font-bold text-slate-500 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-600" />
          Showing {activeSubTab === 'departments' ? filteredDepts.length : filteredCourses.length} items
        </div>
      </div>

      {/* DEPARTMENTS MEDIA TAB */}
      {activeSubTab === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredDepts.map((dept) => {
            const isBusy = updatingId === (dept.name || dept.id);
            return (
              <div 
                key={dept.name} 
                className="bg-white border border-[#D8E3FF] rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-5 group"
              >
                {/* Header info */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#2563EB] bg-[#EEF3FF] px-2.5 py-1 rounded-md border border-[#D8E3FF]">
                      Department
                    </span>
                    <h3 className="font-serif font-black text-xl text-slate-900 mt-2">{dept.name}</h3>
                    <p className="text-slate-400 text-[11px] font-mono mt-0.5">
                      ₦{Number(dept.price || 10000).toLocaleString()} • ${Number(dept.priceUSD || 7).toLocaleString()}
                    </p>
                  </div>

                  {/* Left-card preview badge */}
                  <div className="shrink-0 text-right">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                      dept.imageUrl ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      {dept.imageUrl ? '✓ Live Picture Set' : '• No Picture'}
                    </span>
                  </div>
                </div>

                {/* Dashboard Card Preview Simulation */}
                <div className="bg-[#F8F9FB] border border-dashed border-[#D8E3FF] rounded-2xl p-3.5">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Eye className="w-3 h-3 text-[#2563EB]" />
                    <span>Dashboard Card Preview (Left-Picture Layout):</span>
                  </div>
                  
                  {/* Simulated Card */}
                  <div className="bg-white border border-[#D8E3FF] rounded-2xl p-3.5 shadow-sm flex items-center gap-4">
                    {/* Left Picture */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#EEF3FF] border border-[#D8E3FF] shrink-0 flex items-center justify-center shadow-xs">
                      {dept.imageUrl ? (
                        <img 
                          src={dept.imageUrl} 
                          alt={dept.name} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Building2 className="w-7 h-7 text-[#2563EB]" />
                      )}
                    </div>
                    {/* Right details */}
                    <div className="min-w-0 flex-1">
                      <div className="font-serif font-black text-slate-900 text-sm truncate">{dept.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span className="font-mono font-bold text-[#2563EB]">Medical Portal</span>
                        <span>•</span>
                        <span>Full Curriculum</span>
                      </div>
                      <div className="mt-2 text-[10px] font-black text-[#2563EB] uppercase tracking-wider flex items-center gap-1">
                        <span>Enter Department</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Image Uploader Component */}
                <div className="pt-2">
                  <ImageUploader
                    value={dept.imageUrl || ''}
                    onChange={(newUrl) => handleUpdateFacultyImage(dept, newUrl)}
                    label="Upload / Change Picture"
                    placeholderText="Upload photo (JPG, PNG, WebP) or paste web image URL"
                  />
                  {isBusy && (
                    <div className="text-[10px] font-black text-blue-600 flex items-center gap-1.5 mt-2">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Saving to archives...
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* COURSES MEDIA TAB */}
      {activeSubTab === 'courses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => {
            const isBusy = updatingId === course.id;
            const currentImg = course.imageUrl || course.thumbnail;
            return (
              <div 
                key={course.id}
                className="bg-white border border-[#D8E3FF] rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-5"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[#2563EB] bg-[#EEF3FF] px-2.5 py-0.5 rounded border border-[#D8E3FF]">
                        {course.department}
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {course.level}
                      </span>
                    </div>
                    <h3 className="font-serif font-black text-lg text-slate-900 truncate" title={course.title}>
                      {course.title}
                    </h3>
                  </div>

                  <span className={`inline-flex items-center text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                    course.imageUrl ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {course.imageUrl ? '✓ Custom' : 'Default'}
                  </span>
                </div>

                {/* Course Card Preview (Left-Aligned Picture) */}
                <div className="bg-[#F8F9FB] border border-dashed border-[#D8E3FF] rounded-2xl p-3.5">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Eye className="w-3 h-3 text-[#2563EB]" />
                    <span>Card Preview (Left Picture):</span>
                  </div>

                  <div className="bg-white border border-[#D8E3FF] rounded-2xl p-3 shadow-sm flex items-center gap-3.5">
                    {/* Left Picture */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#EEF3FF] border border-[#D8E3FF] shrink-0 flex items-center justify-center">
                      {currentImg ? (
                        <img 
                          src={currentImg} 
                          alt={course.title} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <BookOpen className="w-7 h-7 text-[#2563EB]" />
                      )}
                    </div>
                    {/* Right Info */}
                    <div className="min-w-0 flex-1">
                      <div className="font-serif font-black text-slate-900 text-xs truncate">{course.title}</div>
                      <div className="text-[9px] text-slate-500 font-mono mt-0.5">{course.level} • {course.department}</div>
                      <div className="mt-1.5 text-[9px] font-black text-[#2563EB] uppercase tracking-wider flex items-center gap-1">
                        <span>Practice Series</span>
                        <ArrowRight className="w-2.5 h-2.5" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Image Uploader */}
                <div>
                  <ImageUploader
                    value={course.imageUrl || ''}
                    onChange={(newUrl) => handleUpdateCourseImage(course, newUrl)}
                    label="Course Picture"
                    placeholderText="Upload photo (JPG, PNG, WebP) or paste image URL"
                  />
                  {isBusy && (
                    <div className="text-[10px] font-black text-blue-600 flex items-center gap-1.5 mt-2">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Updating course picture...
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {((activeSubTab === 'departments' && filteredDepts.length === 0) ||
        (activeSubTab === 'courses' && filteredCourses.length === 0)) && (
        <div className="text-center py-16 bg-white border border-[#D8E3FF] rounded-3xl p-8">
          <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-serif font-black text-lg text-slate-800">No items match your query</h3>
          <p className="text-slate-400 text-xs mt-1">Try clearing your search query or selecting a different department filter.</p>
        </div>
      )}
    </div>
  );
}
