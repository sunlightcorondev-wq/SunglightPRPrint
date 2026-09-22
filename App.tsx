import React, { useEffect, useState, useRef, useMemo } from 'react';
import { fetchDatabaseRecords, getDbConfig, saveDbConfig, fetchSOH, updateRequisitionStatus, deleteRequisition } from './services/dbService';
import { DocumentData, PrintSettings } from './types';
import PrintableDocument, { ITEM_LIMIT_ONE_PAGE, splitItemsIntoPages } from './components/PrintableDocument';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Printer, 
  Database, 
  FileText, 
  Search, 
  RefreshCw, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Menu,
  X,
  Settings2,
  Copy,
  WifiOff,
  FileDown,
  PenLine,
  ArrowRight,
  Bell,
  BellOff,
  Volume2,
  Trash2
} from 'lucide-react';

const App: React.FC = () => {
  // Splash Screen State
  const [hasEntered, setHasEntered] = useState(false);
  const [splashVisible, setSplashVisible] = useState(false);

  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  
  // Notification State
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  
  // Track printed/exported documents locally to ensure immediate UI feedback and persistence
  const [processedDocIds, setProcessedDocIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('sunlight_processed_docs');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (e) {
      console.error("Failed to load processed docs from localStorage", e);
      return new Set();
    }
  });

  // Track "NEW" documents that haven't been opened yet
  const [newDocIds, setNewDocIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('sunlight_new_docs');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (e) {
      console.error("Failed to load new docs from localStorage", e);
      return new Set();
    }
  });

  const [scale, setScale] = useState(1);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateScale = () => {
      if (previewContainerRef.current) {
        // Container padding is p-4 (16px) or p-8 (32px), using 32px safe margin
        const containerWidth = previewContainerRef.current.clientWidth - 32; 
        const documentWidth = 210 * 3.7795; // 210mm to pixels approx
        const newScale = containerWidth < documentWidth ? (containerWidth / documentWidth) * 0.98 : 1;
        setScale(newScale);
      }
    };
    window.addEventListener('resize', updateScale);
    updateScale();
    
    // Also recalculate after sidebar transition
    const timer = setTimeout(updateScale, 350);
    
    return () => {
      window.removeEventListener('resize', updateScale);
      clearTimeout(timer);
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    localStorage.setItem('sunlight_processed_docs', JSON.stringify(Array.from(processedDocIds)));
  }, [processedDocIds]);

  useEffect(() => {
    localStorage.setItem('sunlight_new_docs', JSON.stringify(Array.from(newDocIds)));
  }, [newDocIds]);

  // Cleanup effect: Ensure "NEW" tags are only on Pending documents
  useEffect(() => {
    if (documents.length > 0) {
      setNewDocIds(prev => {
        const next = new Set(prev);
        let changed = false;
        
        documents.forEach(doc => {
          if (next.has(doc.id) && doc.status !== 'Pending') {
            next.delete(doc.id);
            changed = true;
          }
        });
        
        return changed ? next : prev;
      });
    }
  }, [documents]);
  
  // Realtime SOH fetching for selected document
  useEffect(() => {
    if (!selectedDocId) return;
    
    const doc = documents.find(d => d.id === selectedDocId);
    if (!doc) return;
    
    const fetchSOHForDoc = async () => {
        const isSecurity = doc.department.trim().toLowerCase() === 'security';
        const updatedItems = await Promise.all(doc.items.map(async (item) => {
            if (isSecurity) {
                return { ...item, soh: 0 };
            }
            if (item.soh !== '' && item.soh !== undefined && item.soh !== null) {
                return item;
            }
            const soh = await fetchSOH(doc.department, item.description);
            return { ...item, soh: soh };
        }));
        
        setDocuments(prevDocs => prevDocs.map(d => d.id === selectedDocId ? { ...d, items: updatedItems } : d));
    };
    
    fetchSOHForDoc();
  }, [selectedDocId]);
  
  // Print Settings State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printSettings, setPrintSettings] = useState<PrintSettings>({
    copies: 1,
    paperSize: 'A4',
    orientation: 'portrait'
  });

  // Database Settings State
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [dbUrlInput, setDbUrlInput] = useState('');
  const [dbTokenInput, setDbTokenInput] = useState('');

  useEffect(() => {
    const config = getDbConfig();
    setDbUrlInput(config.url);
    setDbTokenInput(config.authToken);
  }, []);
  
  // Ref for the sidebar to handle click outside
  const sidebarRef = useRef<HTMLDivElement>(null);
  
  // Ref to track latest documents for background sync comparison
  const docsRef = useRef<DocumentData[]>([]);
  useEffect(() => {
    docsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    // Trigger splash animation on mount
    setTimeout(() => setSplashVisible(true), 100);
    loadData();

    // Setup Notifications
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    // Polling for new records every 30 seconds
    const intervalId = setInterval(() => checkForNewRecords(true), 30000);
    return () => clearInterval(intervalId);
  }, []);

  const playNotificationSound = () => {
    try {
      // Using a slightly different, more reliable sound URL
      const audio = new Audio('https://cdn.pixabay.com/audio/2022/03/15/audio_7833324c0d.mp3');
      audio.volume = 0.4;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.log("Audio play blocked. Interaction required.");
        });
      }
    } catch (e) {
      console.error("Audio playback error", e);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const docs = await fetchDatabaseRecords();
      setDocuments(docs);
      setLastSync(new Date());
      if (docs.length > 0 && !selectedDocId) {
        setSelectedDocId(docs[0].id);
      } else if (docs.length === 0) {
        setError("No records found in the database.");
      }
    } catch (err: any) {
      console.error(err);
      setError("Unable to connect to Turso database. Please check your internet connection or database configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  const checkForNewRecords = async (isSilent = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const newDocs = await fetchDatabaseRecords();
      const now = new Date();
      setLastSync(now);
      
      // Use the ref to get the most current documents without triggering re-renders or stale closures
      const currentDocs = docsRef.current;
      const prevDocsMap = new Map<string, DocumentData>(currentDocs.map(d => [d.id, d]));
      
      const newItems = newDocs.filter(d => !prevDocsMap.has(d.id) && d.status === 'Pending');
      const statusChanges = newDocs.filter(d => {
        const prev = prevDocsMap.get(d.id);
        return prev && prev.status !== d.status;
      });

      // Update documents state
      setDocuments(newDocs);

      // Handle side effects
      if (newItems.length > 0 || statusChanges.length > 0) {
        playNotificationSound();

        if (newItems.length > 0) {
          setNewDocIds(prev => {
            const next = new Set(prev);
            newItems.forEach(item => next.add(item.id));
            return next;
          });
        }

        if (Notification.permission === 'granted') {
          if (newItems.length > 0) {
            new Notification(newItems.length === 1 ? 'New Requisition' : 'New Requisitions', {
              body: newItems.length === 1 
                ? `Requisition #${newItems[0].id} from ${newItems[0].department} received.`
                : `${newItems.length} new requisitions have been queued.`,
              icon: '/vite.svg',
              tag: 'new-items'
            });
          }
          
          statusChanges.forEach(doc => {
            new Notification(`Status Updated: #${doc.id}`, {
              body: `Requisition for ${doc.department} is now ${doc.status}.`,
              icon: '/vite.svg',
              tag: `status-${doc.id}`
            });
          });
        }

        if (newItems.length > 0) {
          toast.success(
            newItems.length === 1 
              ? `New Requisition #${newItems[0].id} received!` 
              : `${newItems.length} new requisitions received!`,
            { duration: 5000, position: 'top-right', icon: '🔔', style: { background: '#4a0404', color: '#faca15', border: '1px solid #faca15' } }
          );
        }

        statusChanges.forEach(doc => {
          if (doc.status !== 'Pending') {
            setNewDocIds(prev => {
              const next = new Set(prev);
              next.delete(doc.id);
              return next;
            });
          }
          toast.success(`Requisition #${doc.id} is now ${doc.status}`, {
            duration: 4000,
            position: 'top-right',
            icon: '📝',
            style: { background: '#1e3a8a', color: 'white', border: '1px solid #3b82f6' }
          });
        });
      } else if (!isSilent) {
        toast("Database is up to date", { icon: '✅', style: { background: '#064e3b', color: '#faca15' } });
      }
    } catch (err) {
      console.error("Background polling failed", err);
      if (!isSilent) toast.error("Sync failed. Check connection.");
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  };

  const requestNotificationPermission = () => {
    if (!('Notification' in window)) {
      toast.error("This browser does not support desktop notifications.");
      return;
    }

    if (Notification.permission !== 'granted') {
      // Show the specific instructions provided by the user for the preview environment
      toast((t) => (
        <div className="flex flex-col gap-2">
          <p className="font-bold text-sm">How to enable browser push:</p>
          <ol className="text-[11px] list-decimal pl-4 space-y-1 text-maroon-200">
            <li>Click the button below to open in a new tab.</li>
            <li>In the new tab, click the <span className="text-gold-400 font-bold">Bell icon</span> again.</li>
            <li>Click <span className="text-green-400 font-bold">"Allow"</span> when the browser prompts you.</li>
            <li>Close that tab and return here!</li>
          </ol>
          <a 
            href={window.location.href} 
            target="_blank" 
            rel="noopener noreferrer"
            className="mt-2 text-center py-2 px-3 bg-gold-500 text-maroon-950 rounded-lg font-bold text-xs hover:bg-gold-400 transition-colors"
            onClick={() => toast.dismiss(t.id)}
          >
            Open in New Tab & Enable
          </a>
        </div>
      ), {
        duration: 15000,
        style: {
          background: '#4a0404',
          color: '#faca15',
          border: '1px solid #faca15',
          minWidth: '280px'
        }
      });
    }

    Notification.requestPermission().then(permission => {
      setNotificationPermission(permission);
      if (permission === 'granted') {
        toast.success("Notifications Enabled!", {
          style: { background: '#4a0404', color: '#faca15', border: '1px solid #faca15' }
        });
        new Notification("Notifications Enabled", {
          body: "You will now be notified when new requisitions arrive.",
          icon: '/vite.svg'
        });
      }
    });
  };

  const testNotification = () => {
    playNotificationSound();
    toast.success("Test Notification Successful!", {
      style: {
        background: '#4a0404',
        color: '#faca15',
        border: '1px solid #faca15',
      }
    });
    if (Notification.permission === 'granted') {
      new Notification("Sunlight Printing System", {
        body: "This is a test notification. System is active.",
        icon: '/vite.svg'
      });
    } else {
      toast("Enable browser notifications for full experience.", { icon: 'ℹ️' });
    }
  };

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const secondaryDoc = documents.find(d => d.id === printSettings.secondaryDocId);

  const ITEM_LIMIT_HALF_PAGE = 10;
  const isHalfPage = selectedDoc ? selectedDoc.items.length <= ITEM_LIMIT_HALF_PAGE : false;
  const otherHalfPageDocs = documents.filter(d => 
    d.id !== selectedDoc?.id && 
    d.items.length <= ITEM_LIMIT_HALF_PAGE
  );

  // Helper to check if a document is considered "processed" (printed/exported/signed)
  const isDocProcessed = (doc: DocumentData) => {
    return processedDocIds.has(doc.id) || doc.status !== 'Pending';
  };

  // Sort documents for sidebar: Unprocessed first, then Processed (Printed/Exported/For signing)
  // Processed items are moved to the bottom. Within groups, sort by Date ascending (Earliest First).
  const sidebarDocuments = useMemo(() => {
    return [...documents].sort((a, b) => {
      const aProcessed = isDocProcessed(a);
      const bProcessed = isDocProcessed(b);
      
      // If one is processed and the other isn't, the processed one goes last
      if (aProcessed && !bProcessed) return 1;
      if (!aProcessed && bProcessed) return -1;
      
      // Within groups, sort by Date ascending (Earliest First)
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      
      // If dates are identical, use ID as a stable fallback (Earliest ID first)
      return a.id.localeCompare(b.id);
    });
  }, [documents, processedDocIds]);

  const handlePrintRequest = () => {
    setIsPrintModalOpen(true);
  };

  const handleDeleteRequisition = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete requisition #${id}?`)) {
      return;
    }
    try {
      await deleteRequisition(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      if (selectedDocId === id) {
        const remaining = documents.filter(d => d.id !== id);
        setSelectedDocId(remaining.length > 0 ? remaining[0].id : null);
      }
      toast.success(`Requisition #${id} deleted`);
    } catch (err) {
      toast.error("Failed to delete requisition");
    }
  };

  const markDocumentAsProcessedLocally = async (id: string) => {
    // 1. Update local documents state
    setDocuments(prevDocs => prevDocs.map(d => 
        d.id === id ? { ...d, status: 'For signing' } : d
    ));

    // 2. Add to processed set for immediate sorting/styling effect if not caught by status yet
    setProcessedDocIds(prev => {
        const newSet = new Set(prev);
        newSet.add(id);
        return newSet;
    });

    // 3. Persist to database so it is universal to all users
    try {
      await updateRequisitionStatus(id, 'For signing');
    } catch (e) {
      console.error("Failed to update status in database:", e);
    }
  };

  const executePrint = async () => {
    if (selectedDocId) {
      await markDocumentAsProcessedLocally(selectedDocId);
    }
    if (printSettings.secondaryDocId) {
      await markDocumentAsProcessedLocally(printSettings.secondaryDocId);
    }

    // Close print modal so overlay/blur is dismissed before print dialog opens
    setIsPrintModalOpen(false);

    // Check if in iframe (common in preview environments)
    const isIframe = window.self !== window.top;
    
    if (isIframe) {
      toast((t) => (
        <div className="flex flex-col gap-2">
          <p className="font-bold text-sm text-gold-400">Preview Device Detected</p>
          <p className="text-xs text-maroon-100">Printing works best when opened in a new tab. If the print dialog doesn't appear, please use the button below.</p>
          <div className="flex gap-2 mt-1">
            <button 
              onClick={() => {
                toast.dismiss(t.id);
                window.open(window.location.href, '_blank');
              }}
              className="flex-1 py-2 px-3 bg-gold-500 text-maroon-950 rounded-lg font-bold text-xs"
            >
              Open in New Tab
            </button>
            <button 
              onClick={async () => {
                toast.dismiss(t.id);
                if (selectedDocId) await markDocumentAsProcessedLocally(selectedDocId);
                if (printSettings.secondaryDocId) await markDocumentAsProcessedLocally(printSettings.secondaryDocId);
                setTimeout(() => window.print(), 100);
              }}
              className="flex-1 py-2 px-3 bg-maroon-800 border border-maroon-700 text-maroon-100 rounded-lg text-xs"
            >
              Try Printing Now
            </button>
          </div>
        </div>
      ), { duration: 10000, position: 'bottom-center', style: { background: '#4a0404', border: '1px solid #e3a008' } });
      
      // If mobile, we also trigger it after a short delay to let modal close
      if (window.innerWidth < 1024) {
        setTimeout(() => window.print(), 150);
      }
    } else {
      setTimeout(() => window.print(), 150);
    }
  };

  const handleExportPdf = async () => {
    if (selectedDocId) {
      await markDocumentAsProcessedLocally(selectedDocId);
    }
    if (printSettings.secondaryDocId) {
      await markDocumentAsProcessedLocally(printSettings.secondaryDocId);
    }

    const element = document.getElementById('printable-area');
    if (!element) return;
    
    // Check if html2pdf is loaded
    if (typeof (window as any).html2pdf === 'undefined') {
        alert("PDF Generator is still loading. Please try again in a moment.");
        return;
    }

    // Dismiss modal and temporarily reset scale transform for crisp, unscaled 1:1 A4 canvas capture
    setIsPrintModalOpen(false);
    const innerScaler = document.querySelector('.preview-inner-scale') as HTMLElement;
    const prevTransform = innerScaler ? innerScaler.style.transform : '';
    if (innerScaler) innerScaler.style.transform = 'none';

    const opt = {
      margin: 0,
      filename: `Requisition_${selectedDoc?.id || 'doc'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    };
    
    try {
      await (window as any).html2pdf().set(opt).from(element).save();
      if (Notification.permission === 'granted') {
        new Notification("PDF Exported", {
          body: `Requisition #${selectedDoc?.id || 'doc'} has been successfully exported.`,
          icon: '/vite.svg'
        });
      }
    } finally {
      if (innerScaler) innerScaler.style.transform = prevTransform;
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'Approved': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'For signing': return <PenLine className="w-4 h-4 text-maroon-400" />;
      case 'Pending': return <Clock className="w-4 h-4 text-gold-400" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  // Dynamic CSS for Print Settings
  const printStyles = `
    @media print {
      @page {
        size: ${printSettings.paperSize || 'A4'} ${printSettings.orientation || 'portrait'};
        margin: 0;
      }
      
      /* Reset global layout styles that might clip content or inject scrollbars */
      html, body {
        width: 210mm !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        background: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Completely hide all non-printable UI elements */
      .print\\:hidden,
      .fixed,
      aside,
      nav,
      header,
      button,
      [role="dialog"] {
        display: none !important;
      }

      /* Reset preview scaling so it renders at pure 100% 1:1 scale on A4 */
      #root,
      #root > div,
      .preview-container,
      .preview-scale-wrapper,
      .preview-inner-scale {
        width: 210mm !important;
        max-width: 210mm !important;
        min-width: 210mm !important;
        height: auto !important;
        min-height: 0 !important;
        transform: none !important;
        position: static !important;
        overflow: visible !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        filter: none !important;
        opacity: 1 !important;
      }
      
      /* Hide scrollbars */
      ::-webkit-scrollbar { display: none !important; }

      #printable-area {
        display: block !important;
        position: static !important;
        width: 210mm !important;
        max-width: 210mm !important;
        min-width: 210mm !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        box-shadow: none !important;
        overflow: visible !important;
      }

      #printable-area * {
        visibility: visible !important;
      }

      .page-sheet-container {
        display: block !important;
        width: 210mm !important;
        max-width: 210mm !important;
        min-width: 210mm !important;
        height: 297mm !important;
        max-height: 297mm !important;
        box-sizing: border-box !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: #ffffff !important;
        box-shadow: none !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        overflow: hidden !important;
      }

      .page-sheet-container:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }
    
    /* Splash Screen Animations */
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fadeInUp {
      animation: fadeInUp 1s ease-out forwards;
    }
  `;

  // SPLASH SCREEN RENDER
  if (!hasEntered) {
    return (
      <div className="h-screen w-screen bg-maroon-950 flex flex-col items-center justify-center relative overflow-hidden">
        <Toaster />
        <style>{printStyles}</style>
        {/* Decorative Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
           <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-maroon-900/50 rounded-full blur-[100px]"></div>
           <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-gold-600/10 rounded-full blur-[80px]"></div>
           <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] bg-maroon-800/50 rounded-full blur-[100px]"></div>
        </div>

        <div className={`z-10 flex flex-col items-center transition-all duration-1000 ${splashVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="text-center mb-12">
             <div className="inline-block relative">
                <h1 className="text-7xl md:text-9xl text-gold-500 leading-tight drop-shadow-2xl" style={{ fontFamily: 'Vivaldi, "Brush Script MT", cursive' }}>
                  Sunlight
                </h1>
                {/* Underline accent */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-2/3 h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-50"></div>
             </div>
             
             <div className="mt-4 flex items-center justify-center gap-4">
                <div className="h-px w-8 bg-maroon-400"></div>
                <span className="text-sm md:text-lg tracking-[0.4em] font-bold text-maroon-100 uppercase font-sans">
                  Hotel, Coron
                </span>
                <div className="h-px w-8 bg-maroon-400"></div>
             </div>
             
             <p className="mt-6 text-maroon-300 font-serif italic text-lg tracking-wide">
                Requisition Printing System
             </p>
          </div>

          <button 
            onClick={() => setHasEntered(true)}
            className="group relative px-10 py-4 bg-transparent overflow-hidden rounded-full transition-all duration-500 hover:shadow-[0_0_50px_rgba(250,202,21,0.2)] border border-gold-500/30 hover:border-gold-500"
          >
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-gold-600 to-gold-400 opacity-80 group-hover:opacity-100 transition-opacity duration-300"></div>
            
            <span className="relative flex items-center gap-3 text-maroon-950 font-bold text-lg tracking-widest uppercase z-10">
              Enter System
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
            </span>
          </button>
        </div>
        
        <div className="absolute bottom-6 text-maroon-500/50 text-[10px] tracking-[0.2em] font-sans">
            SECURE DATABASE CONNECTION ESTABLISHED
        </div>
      </div>
    );
  }

  // MAIN APP RENDER
  return (
    <div className="flex h-screen bg-maroon-950 text-white overflow-hidden relative">
      <Toaster />
      <style>{printStyles}</style>

      {/* Print Settings Modal */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-maroon-950/90 backdrop-blur-sm print:hidden">
           <div className="bg-maroon-900 border border-gold-500 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeInUp">
              <div className="p-6 border-b border-maroon-800 bg-maroon-800/50 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-gold-500 rounded-lg text-maroon-900">
                      <Settings2 className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-serif font-bold text-white">Print Settings</h2>
                 </div>
                 <button onClick={() => setIsPrintModalOpen(false)} className="text-maroon-300 hover:text-white transition-colors">
                   <X className="w-6 h-6" />
                 </button>
              </div>
              
              <div className="p-6 space-y-6">
                
                {/* Copies */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-maroon-200 flex items-center gap-2">
                    <Copy className="w-4 h-4 text-gold-500" />
                    Copies
                  </label>
                  <div className="flex items-center gap-4">
                     <button 
                        onClick={() => setPrintSettings(prev => ({ ...prev, copies: Math.max(1, prev.copies - 1) }))}
                        className="w-10 h-10 rounded-lg bg-maroon-950 border border-maroon-700 hover:border-gold-500 text-white flex items-center justify-center transition-colors"
                     >-</button>
                     <span className="text-2xl font-mono font-bold w-12 text-center">{printSettings.copies}</span>
                     <button 
                        onClick={() => setPrintSettings(prev => ({ ...prev, copies: prev.copies + 1 }))}
                        className="w-10 h-10 rounded-lg bg-maroon-950 border border-maroon-700 hover:border-gold-500 text-white flex items-center justify-center transition-colors"
                     >+</button>
                  </div>
                </div>

                {/* Show Draft */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={printSettings.showDraft ?? true}
                      onChange={(e) => setPrintSettings(prev => ({ ...prev, showDraft: e.target.checked }))}
                      className="w-5 h-5 rounded border-maroon-700 bg-maroon-950 text-gold-500 focus:ring-gold-500"
                    />
                    <span className="text-sm font-bold text-maroon-200">Include Draft Copy</span>
                  </label>
                </div>

                {/* Combine with another request */}
                {isHalfPage && (
                  <div className="space-y-3 pt-4 border-t border-maroon-800">
                    <label className="text-sm font-bold text-maroon-200 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gold-500" />
                      Combine with another request
                    </label>
                    <p className="text-xs text-maroon-400 mb-2">Select another half-page request to print on the same page.</p>
                    <select
                      value={printSettings.secondaryDocId || ''}
                      onChange={(e) => setPrintSettings(prev => ({ 
                        ...prev, 
                        secondaryDocId: e.target.value || null,
                        // Automatically uncheck draft if they select a secondary document to fit on 1 page
                        showDraft: e.target.value ? false : prev.showDraft
                      }))}
                      className="w-full bg-maroon-950 border border-maroon-700 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-gold-500"
                    >
                      <option value="">None (Print half page only)</option>
                      {otherHalfPageDocs.map(doc => (
                        <option key={doc.id} value={doc.id}>
                          #{doc.id} - {doc.department} ({doc.items.length} items)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Multi-page Notice */}
                {selectedDoc && splitItemsIntoPages(selectedDoc.items).length > 1 && (
                  <div className="p-3 bg-maroon-950/60 border border-gold-500/30 rounded-xl flex items-start gap-3">
                    <div className="p-1.5 bg-gold-500/20 text-gold-400 rounded-lg shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="text-xs">
                      <div className="font-bold text-gold-400">
                        Multi-page Requisition ({splitItemsIntoPages(selectedDoc.items).length} Pages)
                      </div>
                      <div className="text-maroon-200 mt-0.5">
                        Contains {selectedDoc.items.length} items across {splitItemsIntoPages(selectedDoc.items).length} pages. Form fills empty rows across full pages, with signatories exclusively on the final page.
                      </div>
                    </div>
                  </div>
                )}

              </div>

              <div className="p-6 border-t border-maroon-800 bg-maroon-950/50 flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => setIsPrintModalOpen(false)}
                  className="py-3 px-4 rounded-xl border border-maroon-700 text-maroon-300 hover:text-white hover:bg-maroon-800 transition-colors font-medium text-center"
                >
                  Cancel
                </button>
                <div className="flex-1 flex gap-3">
                    <button 
                        onClick={handleExportPdf}
                        className="flex-1 py-3 rounded-xl bg-maroon-800 border border-gold-500/30 text-gold-400 font-bold hover:bg-maroon-700 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                    >
                        <FileDown className="w-4 h-4" />
                        Export PDF
                    </button>
                    <button 
                        onClick={executePrint}
                        className="flex-1 py-3 rounded-xl bg-gold-500 text-maroon-950 font-bold hover:bg-gold-400 shadow-lg shadow-gold-900/20 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                    >
                        <Printer className="w-4 h-4" />
                        Print Now
                    </button>
                </div>
              </div>
           </div>
        </div>
      )}
      
      {/* Database Connection Settings Modal */}
      {isDbModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-maroon-950/90 backdrop-blur-sm print:hidden">
           <div className="bg-maroon-900 border border-gold-500 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeInUp">
              <div className="p-6 border-b border-maroon-800 bg-maroon-800/50 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-gold-500 rounded-lg text-maroon-900">
                      <Database className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-serif font-bold text-white">Database Settings</h2>
                 </div>
                 <button onClick={() => setIsDbModalOpen(false)} className="text-maroon-300 hover:text-white transition-colors">
                   <X className="w-6 h-6" />
                 </button>
              </div>
              
              <div className="p-6 space-y-4">
                 <p className="text-xs text-maroon-200 leading-relaxed">
                    Enter your Turso / libSQL database credentials below. If not configured, the system falls back to the high-fidelity Gemini mock data service.
                 </p>

                 <div className="space-y-1.5">
                    <label className="text-xs font-bold text-maroon-200">Database URL</label>
                    <input 
                      type="text"
                      value={dbUrlInput}
                      onChange={(e) => setDbUrlInput(e.target.value)}
                      placeholder="libsql://your-db-name.turso.io"
                      className="w-full bg-maroon-950 border border-maroon-700 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-gold-500 placeholder-maroon-700"
                    />
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-xs font-bold text-maroon-200">Auth Token</label>
                    <input 
                      type="password"
                      value={dbTokenInput}
                      onChange={(e) => setDbTokenInput(e.target.value)}
                      placeholder="eyJhbGciOi..."
                      className="w-full bg-maroon-950 border border-maroon-700 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-gold-500 placeholder-maroon-700"
                    />
                 </div>
              </div>

              <div className="p-6 border-t border-maroon-800 bg-maroon-950/50 flex flex-col sm:flex-row gap-3">
                 <button 
                    onClick={() => {
                      saveDbConfig('', '');
                      setDbUrlInput('');
                      setDbTokenInput('');
                      setIsDbModalOpen(false);
                      toast.success("Database configuration reset to environment defaults.", {
                        style: { background: '#4a0404', color: '#faca15', border: '1px solid #faca15' }
                      });
                      loadData();
                    }}
                    className="py-2 px-3 rounded-xl border border-maroon-800 hover:border-maroon-600 text-maroon-400 hover:text-white transition-colors text-xs font-medium text-center"
                 >
                    Reset defaults
                 </button>
                 
                 <div className="flex-1 flex gap-2 justify-end">
                    <button 
                       onClick={() => setIsDbModalOpen(false)}
                       className="py-2.5 px-4 rounded-xl border border-maroon-700 text-maroon-300 hover:text-white hover:bg-maroon-800 transition-colors text-xs font-medium"
                    >
                       Cancel
                    </button>
                    <button 
                       onClick={() => {
                         if (dbUrlInput && !dbUrlInput.trim().startsWith('libsql://') && !dbUrlInput.trim().startsWith('https://') && !dbUrlInput.trim().startsWith('http://') && !dbUrlInput.trim().startsWith('file:')) {
                           toast.error("Database URL should start with 'libsql://' or 'https://'", {
                             style: { background: '#4a0404', color: '#faca15', border: '1px solid #faca15' }
                           });
                           return;
                         }
                         saveDbConfig(dbUrlInput, dbTokenInput);
                         setIsDbModalOpen(false);
                         toast.success("Database credentials saved!", {
                           style: { background: '#4a0404', color: '#faca15', border: '1px solid #faca15' }
                         });
                         loadData();
                       }}
                       className="py-2.5 px-4 rounded-xl bg-gold-500 text-maroon-950 font-bold hover:bg-gold-400 transition-colors text-xs"
                    >
                       Save & Connect
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Mobile Header */}
      <div className="lg:hidden absolute top-0 left-0 right-0 h-16 bg-maroon-900 border-b border-maroon-800 flex items-center justify-between px-4 z-40 print:hidden">
        <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-gold-400" />
            <span className="font-serif font-bold text-sm text-white truncate max-w-[150px]">Sunlight Hotel</span>
        </div>
        <div className="flex items-center gap-1">
          {selectedDoc && (
            <button 
              onClick={handlePrintRequest}
              className="p-2 text-gold-400 bg-maroon-800 rounded-lg border border-gold-500/30 active:scale-95"
              title="Print Document"
            >
              <Printer className="w-5 h-5" />
            </button>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gold-400 bg-maroon-800 rounded-lg active:scale-95">
             {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar - Document List */}
      <div 
        ref={sidebarRef}
        className={`
          fixed lg:static inset-y-0 left-0 z-30
          w-80 bg-maroon-900 border-r border-maroon-800 flex flex-col shadow-2xl transition-transform duration-300 transform
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          print:hidden
        `}
      >
        <div className="p-6 border-b border-maroon-800 hidden lg:flex items-center gap-3">
          <div className="p-2 bg-maroon-800 rounded-lg">
            <Printer className="w-6 h-6 text-gold-400" />
          </div>
          <div>
            <h1 className="font-serif font-bold text-lg tracking-wide text-white leading-tight">Sunlight<br/>Requisition Printing</h1>
          </div>
        </div>

        {/* Filters/Search Mockup */}
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-maroon-400" />
            <input 
              type="text" 
              placeholder="Search database..." 
              className="w-full bg-maroon-950 border border-maroon-800 rounded-lg py-2 pl-9 pr-4 text-sm text-maroon-100 placeholder-maroon-400 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 scrollbar-thin">
          {isLoading ? (
             <div className="flex flex-col items-center justify-center h-40 text-maroon-300 space-y-2">
                <Database className="w-8 h-8 animate-pulse text-maroon-500" />
                <span className="text-sm">Querying Database...</span>
             </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 text-maroon-300 space-y-2 px-4 text-center">
               <WifiOff className="w-8 h-8 text-maroon-500" />
               <span className="text-sm text-maroon-400">{error}</span>
            </div>
          ) : (
            sidebarDocuments.map((doc) => {
              const processed = isDocProcessed(doc);
              const isNew = doc.status === 'Pending';
              return (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedDocId(doc.id);
                    setPrintSettings(prev => ({ ...prev, secondaryDocId: null }));
                    setIsSidebarOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedDocId(doc.id);
                      setPrintSettings(prev => ({ ...prev, secondaryDocId: null }));
                      setIsSidebarOpen(false);
                    }
                  }}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-200 group border cursor-pointer select-none ${
                    selectedDocId === doc.id 
                      ? 'bg-maroon-950 border-gold-500 shadow-[0_0_20px_rgba(0,0,0,0.4)] scale-[1.02]' 
                      : 'bg-transparent border-transparent hover:bg-maroon-800/50 hover:border-maroon-700'
                  } ${processed ? 'opacity-40 grayscale bg-maroon-950/30' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                        selectedDocId === doc.id ? 'bg-gold-500 text-maroon-950' : 
                        processed ? 'bg-gray-700 text-gray-400' : 'bg-maroon-800 text-maroon-300 group-hover:bg-maroon-700'
                      }`}>
                        {doc.type}
                      </span>
                      {isNew && !processed && (
                        <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                          NEW
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-mono ${selectedDocId === doc.id ? 'text-maroon-200' : 'text-maroon-400'}`}>{doc.date}</span>
                  </div>
                  <h3 className={`font-bold truncate mb-2 ${
                    selectedDocId === doc.id ? 'text-white' : 'text-maroon-100'
                  }`}>
                    {doc.department}
                  </h3>
                  <div className="flex justify-between items-center">
                     <div className={`flex items-center gap-1.5 text-[11px] font-medium ${selectedDocId === doc.id ? 'text-gold-400' : 'text-maroon-300'}`}>
                       {getStatusIcon(doc.status)}
                       <span>{doc.status}</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <button
                         type="button"
                         onClick={(e) => handleDeleteRequisition(e, doc.id)}
                         className="opacity-0 group-hover:opacity-100 p-1 text-maroon-400 hover:text-red-400 hover:bg-maroon-900 rounded transition-all"
                         title="Delete requisition"
                       >
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                       <span className={`font-mono text-[10px] font-bold ${
                         selectedDocId === doc.id ? 'text-gold-500' : 'text-maroon-500'
                       }`}>
                         #{doc.id}
                       </span>
                     </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        
        {/* User Profile Mock */}
        <div className="p-4 border-t border-maroon-800 bg-maroon-900/50">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center text-maroon-900 font-bold">
                        A
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-sm font-medium text-white truncate">Admin User</p>
                        <p className="text-xs text-maroon-300 truncate">Station #04 • Online</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => {
                      const config = getDbConfig();
                      setDbUrlInput(config.url);
                      setDbTokenInput(config.authToken);
                      setIsDbModalOpen(true);
                    }}
                    className="p-2 text-maroon-400 hover:text-gold-400 hover:bg-maroon-800 rounded-full transition-colors"
                    title="Database Connection Settings"
                  >
                    <Database className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={testNotification}
                    className="p-2 text-maroon-400 hover:text-gold-400 hover:bg-maroon-800 rounded-full transition-colors"
                    title="Test Notification"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={requestNotificationPermission}
                    className={`p-2 rounded-full transition-colors ${
                      notificationPermission === 'granted' 
                        ? 'text-gold-500 hover:bg-maroon-800' 
                        : 'text-maroon-400 hover:text-gold-400 hover:bg-maroon-800'
                    }`}
                    title={notificationPermission === 'granted' ? 'Notifications Enabled' : 'Enable Notifications'}
                  >
                    {notificationPermission === 'granted' ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                  </button>
                </div>
            </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-maroon-950 pt-16 lg:pt-0">
        
        {/* Mobile Floating Action Button */}
        {selectedDoc && !isPrintModalOpen && (
          <div className="lg:hidden fixed bottom-6 right-6 z-40 print:hidden">
            <button 
              onClick={handlePrintRequest}
              className="w-14 h-14 bg-gold-500 text-maroon-950 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(227,160,8,0.4)] border-2 border-white/20 active:scale-90 transition-transform"
            >
              <Printer className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="h-16 border-b border-maroon-800 flex items-center justify-between px-6 bg-maroon-950 print:hidden shrink-0">
          <div className="flex items-center gap-4 text-sm text-maroon-200">
             <button 
               onClick={() => {
                 const config = getDbConfig();
                 setDbUrlInput(config.url);
                 setDbTokenInput(config.authToken);
                 setIsDbModalOpen(true);
               }}
               className="flex items-center gap-2 text-maroon-300 hover:text-gold-400 bg-maroon-900/40 hover:bg-maroon-900/80 px-2.5 py-1.5 rounded-lg border border-maroon-800 transition-colors"
               title="Database Connection Settings"
             >
               <Database className="w-4 h-4 text-gold-500" />
               <span className="hidden sm:inline text-xs font-medium">Source: Turso DB</span>
               <Settings2 className="w-3 h-3 opacity-60" />
             </button>
             <span className="text-maroon-700">|</span>
             <div className="flex items-center gap-2">
               <button 
                 onClick={() => checkForNewRecords(false)}
                 disabled={isSyncing}
                 className={`p-1 rounded-full transition-all ${isSyncing ? 'text-gold-500 animate-spin' : 'text-maroon-400 hover:text-gold-400 hover:bg-maroon-800'}`}
                 title="Sync Now"
               >
                 <RefreshCw className="w-3 h-3" />
               </button>
               <span className="hidden md:inline text-xs">
                 {isSyncing ? (
                   <span className="text-gold-500 animate-pulse">Syncing...</span>
                 ) : (
                   `Last Sync: ${lastSync.toLocaleTimeString()}`
                 )}
               </span>
             </div>
             <span className="text-maroon-700 hidden md:inline">|</span>
             <span className="flex items-center gap-2">
               <FileText className="w-4 h-4 text-gold-500" />
               <span>{documents.length} Records</span>
             </span>
             {selectedDoc && splitItemsIntoPages(selectedDoc.items).length > 1 && (
               <>
                 <span className="text-maroon-700 hidden md:inline">|</span>
                 <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gold-500/20 text-gold-400 border border-gold-500/30">
                   <FileText className="w-3.5 h-3.5" />
                   {splitItemsIntoPages(selectedDoc.items).length} Pages ({selectedDoc.items.length} items)
                 </span>
               </>
             )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
             <button 
               onClick={handlePrintRequest}
               disabled={!selectedDoc}
               className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-maroon-950 px-4 sm:px-6 py-2 rounded-full font-bold shadow-lg shadow-gold-900/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
             >
               <Printer className="w-4 h-4" />
               <span className="text-xs sm:text-sm">Print<span className="hidden xs:inline"> Document</span></span>
             </button>
          </div>
        </div>

        {/* Preview Area */}
        <div className="flex-1 overflow-auto bg-maroon-950 p-4 md:p-8 flex justify-start lg:justify-center items-start print:p-0 print:overflow-visible relative preview-container" ref={previewContainerRef}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-maroon-400 space-y-4">
               <div className="w-16 h-16 border-4 border-maroon-800 border-t-gold-500 rounded-full animate-spin"></div>
               <p className="font-serif animate-pulse">Retrieving records from database...</p>
            </div>
          ) : selectedDoc ? (
            <div 
              className={`transition-all duration-300 print:opacity-100 print:filter-none print:scale-100 preview-scale-wrapper ${
                isPrintModalOpen ? 'opacity-50 blur-sm scale-95' : 'opacity-100 scale-100 animate-fadeInUp'
              }`} 
              style={{ 
                width: `${210 * 3.7795 * scale}px`,
                position: 'relative'
              }}
            >
              <div 
                className="preview-inner-scale"
                style={{ 
                  transform: `scale(${scale})`, 
                  transformOrigin: 'top left',
                  width: '210mm'
                }}
              >
                <PrintableDocument data={selectedDoc} secondaryData={secondaryDoc} settings={printSettings} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-maroon-400 max-w-md text-center">
              <div className="w-20 h-20 bg-maroon-900 rounded-full flex items-center justify-center mb-6">
                 <FileText className="w-10 h-10 text-maroon-600" />
              </div>
              <h2 className="text-2xl font-serif text-maroon-200 mb-2">
                {error ? 'Database Error' : 'No Document Selected'}
              </h2>
              <p className="text-maroon-500">
                {error || 'Select a record from the sidebar to view details and print options.'}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default App;