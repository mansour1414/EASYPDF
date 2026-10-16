import React, { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PDFDocument } from '@cantoo/pdf-lib';
import { 
  GitMerge, 
  Columns, 
  Minimize, 
  RefreshCw, 
  FileText, 
  ScanText, 
  UploadCloud, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  FileCheck, 
  Play, 
  Download, 
  RefreshCcw, 
  Sparkles,
  Info,
  Edit,
  Bot,
  Layers,
  Eye,
  Save,
  Check,
  Loader,
  ShieldCheck,
  Lock,
  AlertTriangle,
  Image as ImageIcon,
  FileImage
} from 'lucide-react';
import JSZip from 'jszip';
import { ToolType, FileItem } from '../types';
import AICopilot from './AICopilot';
import VisualPageManager from './VisualPageManager';
import ProtectUnlockTool from './ProtectUnlockTool';
import WatermarkTool from './WatermarkTool';
import PageNumbersTool from './PageNumbersTool';
import ESignatureTool from './ESignatureTool';
import OcrTool from './OcrTool';
import SmartEnhanceTool from './SmartEnhanceTool';
import BatchProcessingTool from './BatchProcessingTool';
import { AnimatedCounter, SuccessFeedbackCard } from './AnimatedFeedback';
import { authenticatedFetch } from '../lib/supabaseClient';
import { extractPdfPageImage, extractPdfText, renderPdfPagesToImages, getPdfPageCount } from '../lib/pdfRenderer';
import { compressPdfWithReport, imagesToPdf, loadPdfForEditing, assertPdfNotEncrypted, parsePageRanges, pdfErrorMessage } from '../lib/pdfOperations';
import { sniffImageType } from '../lib/fileValidation';

const translations = {
  en: {
    activeSystem: "Active System",
    changeProtocol: "Change Protocol:",
    collationProtocol: "Collation Protocol:",
    collationDesc: "Combine files in the order they appear on the screen. Arrange them using the arrow controls.",
    addAlpha: "+ Add Alpha PDF",
    addBeta: "+ Add Beta PDF",
    targetRange: "Target Page Range:",
    splitInfo: "Upload a PDF, or add a quick sample document below to check actual page-level splitting.",
    addSample6: "+ Use Sample PDF (6 Pages)",
    compAlgo: "Compression Algorithm:",
    addSample4: "+ Use Sample PDF (4 Pages)",
    assetInput: "Asset Input guidelines:",
    assetInputDesc: "Drag & drop image files (PNG/JPG) to combine them into a high-fidelity PDF, page by page.",
    assetInputInfo: "You can upload actual screenshots or pictures to see actual image-to-PDF embedding in real-time!",
    targetFormat: "Target Format Paradigm:",
    addSample3: "+ Use Sample PDF (3 Pages)",
    loadPayload: "Load your payload nodes",
    loadPayloadDesc: "Drag and drop files here, click to browse, or select \"Add Sample\" on the left panel to inject mockup modules immediately.",
    activeQueue: "ACTIVE QUEUE",
    clearAll: "Clear All",
    pages: "pages",
    reading: "Reading...",
    addMore: "Add more files to the queue",
    compilingProgress: "Browser node compiling progress:",
    initProtocol: "Initialize Processing Protocol",
    outputCompiled: "Output Compiled Successfully",
    payloadSize: "Payload Size:",
    downloadResult: "Download Processed PDF",
    startAnother: "Start Another",
  },
  ar: {
    activeSystem: "النظام النشط",
    changeProtocol: "تغيير الأداة:",
    collationProtocol: "بروتوكول الدمج (الترتيب):",
    collationDesc: "سيتم دمج الملفات بالترتيب الظاهر على الشاشة. يمكنك تغيير ترتيبها باستخدام الأسهم.",
    addAlpha: "+ إضافة ملف ألفا التجريبي",
    addBeta: "+ إضافة ملف بيتا التجريبي",
    targetRange: "نطاق الصفحات المستهدفة:",
    splitInfo: "قم برفع ملف PDF، أو أضف مستنداً تجريبياً سريعاً بالأسفل لاختبار التقسيم الفعلي للصفحات.",
    addSample6: "+ استخدام ملف تجريبي (6 صفحات)",
    compAlgo: "خوارزمية الضغط المستهدفة:",
    addSample4: "+ استخدام ملف تجريبي (4 صفحات)",
    assetInput: "إرشادات إدخال الصور والملفات:",
    assetInputDesc: "اسحب وأسقط ملفات الصور (PNG/JPG) لدمجها وتحويلها إلى ملف PDF عالي الجودة، صفحة تلو الأخرى.",
    assetInputInfo: "يمكنك رفع لقطات شاشة أو صور حقيقية لرؤية عملية التحويل والدمج في ملف PDF بشكل حي ومباشر!",
    targetFormat: "الصيغة المستهدفة للتحويل:",
    addSample3: "+ استخدام ملف تجريبي (3 صفحات)",
    loadPayload: "قم برفع مستنداتك هنا للبدء",
    loadPayloadDesc: "اسحب وأسقط الملفات هنا، أو انقر للتصفح من جهازك، أو اختر إضافة مستند تجريبي من اللوحة الجانبية.",
    activeQueue: "قائمة الملفات النشطة",
    clearAll: "مسح الكل",
    pages: "صفحات",
    reading: "جاري القراءة...",
    addMore: "إضافة المزيد من الملفات إلى القائمة",
    compilingProgress: "مستوى تقدم معالجة المستندات:",
    initProtocol: "بدء عملية الدمج الآن",
    outputCompiled: "تم تجميع ودمج المستند بنجاح!",
    payloadSize: "حجم الملف الناتج:",
    downloadResult: "تحميل الملف الناتج المدمج",
    startAnother: "بدء عملية دمج جديدة",
  }
};

interface WorkspaceProps {
  initialTool: ToolType;
  uploadedFiles: FileList | null;
  onClearUploadedFiles: () => void;
  lang?: 'ar' | 'en';
  setLang?: (lang: 'ar' | 'en') => void;
  currentUser?: { id: string; email: string; plan: 'free' | 'pro' } | null;
  onUpgrade?: () => void;
}

export default function Workspace({ 
  initialTool, 
  uploadedFiles, 
  onClearUploadedFiles,
  lang: propLang,
  setLang: propSetLang,
  currentUser,
  onUpgrade
}: WorkspaceProps) {
  const [localLang, localSetLang] = useState<'ar' | 'en'>('ar');
  const lang = propLang || localLang;
  const setLang = propSetLang || localSetLang;
  const shouldReduceMotion = useReducedMotion();
  const [activeTool, setActiveTool] = useState<ToolType>(initialTool);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processingStatusText, setProcessingStatusText] = useState('');
  const [resultFile, setResultFile] = useState<{ name: string; blobUrl: string; size: number } | null>(null);
  
  // Custom states for options
  const [splitRange, setSplitRange] = useState('1-2');
  // 'jpg' and 'png' both have real conversion implementations (see
  // executeProtocol / renderPdfPagesToImages); 'docx'/'xlsx' remain
  // unavailable. Defaults to 'jpg'; the direction switcher below sets this
  // explicitly when the user picks "PDF → PNG" or "PDF → JPG".
  const [conversionTarget, setConversionTarget] = useState<string>('jpg');

  // AI Summarizer custom states
  const [summaryFocus, setSummaryFocus] = useState('');
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  // Tracks whether the current summaryResult came from the backend's
  // labeled `demo: true` fallback (Gemini not configured server-side)
  // rather than a real AI read of the document, so the UI can say so
  // instead of presenting simulated text as if it were genuine.
  const [summaryIsDemo, setSummaryIsDemo] = useState(false);

  // Advanced In-Document Editing and Copilot states
  const [textLayers, setTextLayers] = useState<any[]>([]);
  const [imageFilters, setImageFilters] = useState({
    brightness: 100,
    contrast: 100,
    grayscale: false,
    rotate: 0
  });
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [ocrStatusText, setOcrStatusText] = useState('');
  const [isCompilingEditedPdf, setIsCompilingEditedPdf] = useState(false);
  
  // Custom states for Killer Features
  const [isRedactModeActive, setIsRedactModeActive] = useState(false);
  const [stickyNotes, setStickyNotes] = useState<any[]>([]);

  // Hook to fetch OCR text blocks
  // `override` lets a caller run OCR on a file that was JUST created (e.g. a
  // freshly generated sample) without waiting for React state to settle —
  // `files` here would still be stale in the same synchronous handler.
  // Returns the extracted layers directly (in addition to the usual
  // setTextLayers) so a caller can use the REAL result immediately instead
  // of falling back to placeholder content.
  const runOcrOnActiveFile = async (override?: { data?: Uint8Array; name?: string }): Promise<any[] | null> => {
    const activeData = override?.data ?? files[0]?.data;
    const activeName = override?.name ?? files[0]?.name;
    if (!activeData) return null;
    setIsOcrLoading(true);
    setOcrStatusText(lang === 'ar' ? 'جاري استخراج النص من المستند...' : 'Extracting text from the document...');
    try {
      // Render the real page as an image and send it, so OCR reflects the
      // actual uploaded document instead of a generic placeholder.
      const imageBase64 = await extractPdfPageImage(activeData, 0, 2.0);
      if (!imageBase64) {
        console.error('Could not render page image for OCR.');
        return null;
      }

      const response = await authenticatedFetch('/api/pdf/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang,
          fileName: activeName,
          imageBase64,
          mimeType: 'image/png'
        })
      });
      if (response.ok) {
        const data = await response.json();
        const layers = data.textLayers || [];
        setTextLayers(layers);
        return layers;
      } else {
        const err = await response.json().catch(() => ({}));
        console.error('OCR API error:', err.error || response.statusText);
        return null;
      }
    } catch (err) {
      console.error('OCR API error:', err);
      return null;
    } finally {
      setIsOcrLoading(false);
    }
  };

  // Compile modified text layers back to a real downloadable PDF. The
  // server (via Gemini OCR + pdf-lib) rebuilds ONLY page 1 from the edited
  // text blocks — that part is unchanged. What changed (Sep 2026): this
  // used to hand the user that single rebuilt page as the entire "edited"
  // file, silently discarding every other page of a multi-page document
  // (a 10-page PDF became a 1-page PDF with no warning). The client now
  // fetches that rebuilt page 1 and combines it with pages 2..N copied
  // UNCHANGED from the real original file, so the export has the correct
  // page count and the rest of the document is untouched.
  const compileModifiedPdf = async () => {
    if (textLayers.length === 0) return;
    setIsCompilingEditedPdf(true);
    try {
      const response = await authenticatedFetch('/api/pdf/edit-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // SECURITY (redaction): the original text of every redacted block
          // is stripped HERE, before it ever leaves the browser — the server
          // only receives a coarse character-count hint (redactedTextLength)
          // used to size the opaque redaction bar it draws instead of the
          // text. The sensitive string itself is never transmitted, drawn,
          // or persisted anywhere in the export path.
          textLayers: textLayers.map(b =>
            b.redacted
              ? { ...b, text: '', redactedTextLength: String(b.text ?? '').length }
              : b
          ),
          fileName: files[0]?.name || 'Compiled_Document.pdf'
        })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const originalBytes = files[0]?.data;
        let finalBytes: Uint8Array | null = null;
        let pageCount: number | null = null;

        if (originalBytes) {
          try {
            const rebuiltPage1Bytes = new Uint8Array(await (await fetch(data.fileUrl)).arrayBuffer());
            const originalDoc = await loadPdfForEditing(originalBytes, files[0]?.name);
            const totalOriginalPages = originalDoc.getPageCount();

            if (totalOriginalPages > 1) {
              const rebuiltDoc = await PDFDocument.load(rebuiltPage1Bytes);
              const outDoc = await PDFDocument.create();
              const [rebuiltPage1] = await outDoc.copyPages(rebuiltDoc, [0]);
              outDoc.addPage(rebuiltPage1);
              const remainingIndices = originalDoc.getPageIndices().slice(1);
              const remainingPages = await outDoc.copyPages(originalDoc, remainingIndices);
              remainingPages.forEach((p) => outDoc.addPage(p));
              finalBytes = await outDoc.save();
              pageCount = outDoc.getPageCount();
            } else {
              // Single-page document: the rebuilt page already IS the whole document.
              finalBytes = rebuiltPage1Bytes;
              pageCount = 1;
            }
          } catch (mergeErr) {
            // The original file couldn't be read for merging (e.g. it's
            // password-protected — loadPdfForEditing/assertPdfNotEncrypted
            // already require Unlock PDF first for every OTHER tool, but
            // Edit Text intentionally still allows previewing an encrypted
            // file's page 1 via the image-based OCR path). Rather than
            // silently deliver only 1 page with no explanation, fall back
            // to the server's single rebuilt page and say so honestly.
            console.error('Could not merge the rebuilt page with the original document:', mergeErr);
            alert(lang === 'ar'
              ? 'تعذّر دمج الصفحة المعاد بناؤها مع بقية صفحات الملف الأصلي (قد يكون الملف محمياً بكلمة مرور). سيتم تنزيل الصفحة الأولى المعاد بناؤها فقط.'
              : "Could not combine the rebuilt page with the rest of the original file (it may be password-protected). Downloading only the rebuilt first page.");
          }
        }

        if (!finalBytes) {
          // No original bytes to merge with (or the merge failed above): the
          // server's single-page file is still a real, valid PDF — use it
          // as-is rather than failing the whole export.
          const rebuiltPage1Bytes = new Uint8Array(await (await fetch(data.fileUrl)).arrayBuffer());
          finalBytes = rebuiltPage1Bytes;
          pageCount = 1;
        }

        const blob = new Blob([finalBytes], { type: 'application/pdf' });
        setResultFile({
          name: data.fileName,
          blobUrl: URL.createObjectURL(blob),
          size: blob.size
        });
        if (pageCount && pageCount > 1) {
          setProcessingStatusText(lang === 'ar' ? `تم إنشاء مستند من ${pageCount} صفحة (الصفحة الأولى فقط أُعيد بناؤها بالذكاء الاصطناعي).` : `Created a ${pageCount}-page document (only page 1 was AI-rebuilt).`);
        }
      } else {
        // Previously a failed response here was silently swallowed — the
        // spinner would just stop with no explanation. The server now
        // returns clear errors (e.g. Supabase Storage misconfigured), so
        // surface them instead of failing silently.
        throw new Error(data.error || (lang === 'ar' ? 'فشل تجميع ملف PDF المعدّل.' : 'Failed to compile the edited PDF.'));
      }
    } catch (err: any) {
      console.error('Error compiling PDF:', err);
      alert(err.message || (lang === 'ar' ? 'حدث خطأ أثناء تجميع ملف PDF المعدّل.' : 'An error occurred while compiling the edited PDF.'));
    } finally {
      setIsCompilingEditedPdf(false);
    }
  };

  // NOTE (Sep 2026): this used to auto-run OCR (a real AI call, consuming
  // one of the user's daily AI credits) the instant the Edit Text tool
  // opened with a file loaded, with no click and no warning. Extraction now
  // only runs when the user presses "Extract Text" / "Re-scan" below.

  // Live user usage/quota state
  const [liveUserQuota, setLiveUserQuota] = useState<{ plan: string; uploads_count_today: number; ai_count_today: number } | null>(null);

  // Fetch live user status to keep daily usage stats 100% accurate in real-time
  const fetchLiveQuota = () => {
    if (currentUser?.id) {
      authenticatedFetch(`/api/user/me`)
        .then(res => res.json())
        .then(profile => {
          if (profile && !profile.error) {
            setLiveUserQuota(profile);
          }
        })
        .catch(err => console.error('Error fetching live quota:', err));
    }
  };

  useEffect(() => {
    fetchLiveQuota();
  }, [currentUser, resultFile, summaryResult]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const preloadMockupFiles = async () => {
    try {
      const doc1 = await PDFDocument.create();
      for (let i = 0; i < 5; i++) {
        const page = doc1.addPage([595.28, 841.89]);
        page.drawText("Easy PDF Enterprise Node", { x: 50, y: 780, size: 20 });
        page.drawText("Document: Q3_Financial_Report.pdf", { x: 50, y: 750, size: 12 });
        page.drawText(`Page ${i + 1} of 5`, { x: 50, y: 720, size: 10 });
      }
      const bytes1 = await doc1.save();
      const file1 = new File([bytes1], 'Q3_Financial_Report.pdf', { type: 'application/pdf' });
      
      const doc2 = await PDFDocument.create();
      for (let i = 0; i < 3; i++) {
        const page = doc2.addPage([595.28, 841.89]);
        page.drawText("Easy PDF Proposal Stream", { x: 50, y: 780, size: 20 });
        page.drawText("Document: Project_Proposal_Draft.pdf", { x: 50, y: 750, size: 12 });
        page.drawText(`Page ${i + 1} of 3`, { x: 50, y: 720, size: 10 });
      }
      const bytes2 = await doc2.save();
      const file2 = new File([bytes2], 'Project_Proposal_Draft.pdf', { type: 'application/pdf' });

      setFiles([
        {
          id: 'mock-1',
          file: file1,
          name: file1.name,
          size: 2516582, // exact 2.4 MB
          type: 'application/pdf',
          status: 'ready',
          progress: 100,
          data: bytes1,
          pageCount: 5
        },
        {
          id: 'mock-2',
          file: file2,
          name: file2.name,
          size: 1153433, // exact 1.1 MB
          type: 'application/pdf',
          status: 'ready',
          progress: 100,
          data: bytes2,
          pageCount: 3
        }
      ]);
    } catch (e) {
      console.error("Failed preloading mockup files", e);
    }
  };

  // Sync initial tool changes
  useEffect(() => {
    setActiveTool(initialTool);
    setResultFile(null);
  }, [initialTool]);

  // NOTE (Aug 2026 audit): this used to auto-inject two fake demo PDFs
  // ("Q3_Financial_Report.pdf", "Project_Proposal_Draft.pdf") into the
  // workspace on every mount whenever no real files were uploaded yet,
  // via preloadMockupFiles() below. That silently misled users into
  // thinking pre-existing files were loaded when they had uploaded
  // nothing. Intentionally disabled — the workspace must start with an
  // empty file list unless the user drops/selects a file themselves, or
  // explicitly clicks one of the "Add Sample" buttons (which call the
  // separate, opt-in generateSamplePDF() function elsewhere in this file
  // and are unaffected by this change).

  // Handle files passed from landing page
  useEffect(() => {
    if (uploadedFiles && uploadedFiles.length > 0) {
      handleIncomingFiles(uploadedFiles);
      onClearUploadedFiles(); // clear parent state to avoid re-triggering
    }
  }, [uploadedFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleIncomingFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleIncomingFiles(e.target.files);
    }
  };

  const openFileBrowser = () => {
    fileInputRef.current?.click();
  };

  // Helper to read files as ArrayBuffer
  const handleIncomingFiles = async (fileList: FileList) => {
    const newItems: FileItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const originalFile = fileList[i];
      const id = Math.random().toString(36).substring(2, 9);
      
      const newItem: FileItem = {
        id,
        file: originalFile,
        name: originalFile.name,
        size: originalFile.size,
        type: originalFile.type || getFallbackType(originalFile.name),
        status: 'reading',
        progress: 10,
      };

      newItems.push(newItem);
    }

    // Set files state immediately to show progress
    if (activeTool === 'split' || activeTool === 'compress' || activeTool === 'convert-from' || activeTool === 'summarize') {
      setFiles(newItems.slice(0, 1));
    } else {
      setFiles((prev) => [...prev, ...newItems]);
    }

    // Read details in background
    for (const item of newItems) {
      try {
        const arrayBuffer = await readFileAsArrayBuffer(item.file);
        const data = new Uint8Array(arrayBuffer);
        let pageCount: number | undefined = undefined;

        if (item.name.toLowerCase().endsWith('.pdf')) {
          try {
            const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
            pageCount = pdfDoc.getPageCount();
          } catch (e) {
            console.log('Could not get actual PDF page count', e);
          }
        }

        setFiles((prev) => 
          prev.map((f) => 
            f.id === item.id 
              ? { ...f, status: 'ready', progress: 100, data, pageCount } 
              : f
          )
        );
      } catch (err) {
        setFiles((prev) => 
          prev.map((f) => 
            f.id === item.id 
              ? { ...f, status: 'error', progress: 0, errorMsg: 'Failed to read file' } 
              : f
          )
        );
      }
    }
  };

  const getFallbackType = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return 'application/octet-stream';
  };

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  };

  // Dynamic sample file generation to ease user testing!
  const generateSamplePDF = async (name: string, pagesNum: number = 2): Promise<FileItem | null> => {
    setIsProcessing(true);
    setProcessingStatusText(lang === 'ar' ? 'جاري إنشاء ملف PDF تجريبي...' : 'Generating a sample PDF...');
    setProcessProgress(20);

    try {
      const pdfDoc = await PDFDocument.create();

      for (let i = 1; i <= pagesNum; i++) {
        const page = pdfDoc.addPage([595.28, 841.89]); // standard A4
        page.drawText(`Sample PDF Document`, { x: 50, y: 780, size: 24, opacity: 0.8 });
        page.drawText(`File name: ${name}`, { x: 50, y: 740, size: 10, opacity: 0.5 });

        page.drawText(`This is page ${i} of ${pagesNum} of a sample PDF.`, { x: 50, y: 600, size: 14 });
        page.drawText(`Generated locally in your browser for trying out this tool.`, { x: 50, y: 570, size: 12, opacity: 0.7 });
        
        // Draw a decorative outline
        page.drawRectangle({
          x: 40,
          y: 40,
          width: 515.28,
          height: 761.89,
          borderColor: undefined,
          borderWidth: 1,
          opacity: 0.1,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const sampleFile = new File([blob], `${name}.pdf`, { type: 'application/pdf' });
      
      const id = Math.random().toString(36).substring(2, 9);
      const sampleItem: FileItem = {
        id,
        file: sampleFile,
        name: sampleFile.name,
        size: sampleFile.size,
        type: 'application/pdf',
        status: 'ready',
        progress: 100,
        data: pdfBytes,
        pageCount: pagesNum,
      };

      if (activeTool === 'split' || activeTool === 'compress' || activeTool === 'convert-from' || activeTool === 'summarize') {
        setFiles([sampleItem]);
      } else {
        setFiles((prev) => [...prev, sampleItem]);
      }
      return sampleItem;
    } catch (err) {
      console.error('Failed to generate sample PDF', err);
      return null;
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === files.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newFiles = [...files];
    const temp = newFiles[index];
    newFiles[index] = newFiles[targetIndex];
    newFiles[targetIndex] = temp;
    setFiles(newFiles);
  };

  // core actual and simulated PDF handlers
  const executeProtocol = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProcessProgress(10);
    setResultFile(null);

    try {
      if (activeTool === 'merge') {
        setProcessingStatusText(lang === 'ar' ? 'جاري تجهيز الملفات...' : 'Preparing files...');
        await sleep();
        setProcessProgress(40);
        
        // Actual PDF merge
        const mergedPdf = await PDFDocument.create();
        let validPdfCount = 0;

        for (const item of files) {
          if (item.data && item.name.toLowerCase().endsWith('.pdf')) {
            setProcessingStatusText(lang === 'ar' ? `جاري دمج ملف ${item.name}...` : `Merging ${item.name}...`);
            // Refuses password-protected inputs with a clear "unlock it first"
            // message instead of merging broken/blank pages.
            const pdfDoc = await loadPdfForEditing(item.data, item.name);
            const pageIndices = pdfDoc.getPageIndices();
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);
            copiedPages.forEach((page) => mergedPdf.addPage(page));
            validPdfCount++;
          }
        }

        if (validPdfCount === 0) {
          throw new Error(lang === 'ar' ? 'لا توجد مستندات PDF صالحة للدمج.' : 'No valid PDF files loaded to merge.');
        }

        setProcessProgress(80);
        setProcessingStatusText(lang === 'ar' ? 'جاري حفظ الملف المدمج...' : 'Saving the merged PDF...');
        await sleep();

        const mergedBytes = await mergedPdf.save();
        const blob = new Blob([mergedBytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        setResultFile({
          name: 'Merged_Document.pdf',
          blobUrl,
          size: blob.size,
        });

      } else if (activeTool === 'split') {
        setProcessingStatusText(lang === 'ar' ? 'جاري قراءة المستند...' : 'Reading the document...');
        await sleep();
        setProcessProgress(30);

        const targetFile = files[0];
        if (!targetFile.data || !targetFile.name.toLowerCase().endsWith('.pdf')) {
          throw new Error(lang === 'ar' ? 'الرجاء تحميل ملف PDF صالح لتقسيمه.' : 'Please load a valid PDF file to split.');
        }

        setProcessingStatusText(lang === 'ar' ? 'جاري استخراج الصفحات المحددة...' : 'Extracting the selected pages...');
        const pdfDoc = await loadPdfForEditing(targetFile.data, targetFile.name);
        const totalPages = pdfDoc.getPageCount();

        // Strict parse: an invalid/out-of-range page range throws a clear
        // localized error. It never silently falls back to page 1.
        const selectedPages = parsePageRanges(splitRange, totalPages);

        setProcessProgress(60);
        setProcessingStatusText(lang === 'ar' ? 'جاري إعداد ملف الإخراج...' : 'Preparing the output file...');
        await sleep();

        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, selectedPages);
        copiedPages.forEach((page) => newPdf.addPage(page));

        const splitBytes = await newPdf.save();
        const blob = new Blob([splitBytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        setResultFile({
          name: `${targetFile.name.replace(/\.pdf$/i, '')}_pages_${splitRange.replace(/,/g, '_')}.pdf`,
          blobUrl,
          size: blob.size,
        });

      } else if (activeTool === 'compress') {
        setProcessingStatusText(lang === 'ar' ? 'جاري تحليل المستند...' : 'Analyzing the document...');
        await sleep();
        setProcessProgress(45);

        const targetFile = files[0];
        if (!targetFile.data || !targetFile.name.toLowerCase().endsWith('.pdf')) {
          throw new Error(lang === 'ar' ? 'الرجاء تحميل ملف PDF صالح للضغط.' : 'Please load a valid PDF file to compress.');
        }

        setProcessingStatusText(lang === 'ar' ? 'جاري تقليل حجم الملف...' : 'Optimizing file size...');
        await sleep();
        setProcessProgress(75);

        // Real compression: re-serializes the PDF's internal object graph
        // using object streams (removes redundant/duplicated objects — helps
        // documents with many objects: forms, repeated fonts, layered
        // content) AND, since Sep 2026, re-encodes eligible embedded JPEG
        // photos at a high-quality setting when that yields a genuine size
        // reduction (see recompressEmbeddedJpegImages's doc comment in
        // pdfOperations.ts for the exact, narrow, safety-first scope — many
        // images are intentionally left untouched rather than risk
        // corruption). Either way we report the ACTUAL resulting byte size
        // below rather than a fabricated ratio, so the user never sees a
        // claimed size that doesn't match what they actually download.
        const { bytes: compressedBytes, imagesOptimized } = await compressPdfWithReport(targetFile.data);

        const blob = new Blob([compressedBytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        if (imagesOptimized > 0) {
          // Real, measured outcome (not a claim made up front): only shown
          // when at least one embedded photo was genuinely re-encoded.
          setProcessingStatusText(
            lang === 'ar'
              ? `تم تحسين ${imagesOptimized} صورة داخل الملف.`
              : `Optimized ${imagesOptimized} embedded image${imagesOptimized === 1 ? '' : 's'}.`
          );
        }

        setResultFile({
          name: `Compressed_${targetFile.name}`,
          blobUrl,
          size: blob.size, // real, measured size — never fabricated
        });

      } else if (activeTool === 'convert-to') {
        setProcessingStatusText(lang === 'ar' ? 'جاري التحقق من الملفات...' : 'Validating files...');
        await sleep();
        setProcessProgress(25);

        // Image-to-PDF conversion is genuinely implemented below (real
        // embedJpg/embedPng via pdf-lib, see imagesToPdf() in
        // pdfOperations.ts). Any other source file type gets a clear,
        // honest "not supported yet" error instead of a fabricated result.
        //
        // Security/correctness fix (Sept 2026): a file's browser-reported
        // MIME type (`f.type`) is derived mostly from its extension, so a
        // renamed non-image file would previously pass this filter. We now
        // additionally sniff the real magic bytes of each candidate file
        // (see sniffImageType) and only convert files that are genuinely
        // PNG/JPEG data, regardless of their name or reported MIME type.
        const candidateList = files.filter(f => f.type.startsWith('image/'));
        const validImages: { item: FileItem; format: 'jpg' | 'png' }[] = [];
        for (const f of candidateList) {
          const sniffed = f.data ? sniffImageType(f.data) : null;
          if (sniffed) {
            validImages.push({ item: f, format: sniffed });
          }
        }

        if (validImages.length > 0) {
          setProcessingStatusText(lang === 'ar' ? 'تضمين الصور داخل صفحات PDF...' : 'Embedding images into PDF pages...');
          setProcessProgress(55);

          const pdfBytes = await imagesToPdf(
            validImages.map(v => ({ bytes: v.item.data as Uint8Array, format: v.format }))
          );

          setProcessProgress(85);
          setProcessingStatusText(lang === 'ar' ? 'إنهاء إعداد ملف PDF...' : 'Finalizing PDF...');
          await sleep();

          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(blob);

          setResultFile({
            name: `Converted_Document.pdf`,
            blobUrl,
            size: blob.size,
          });
        } else if (candidateList.length > 0) {
          // Files were picked as images by extension/MIME, but none of
          // them actually contained a real PNG/JPEG signature.
          throw new Error(
            lang === 'ar'
              ? 'لم يتم التعرف على أي من الملفات كصورة PNG أو JPG صالحة (تم فحص محتوى الملف الفعلي وليس فقط امتداده).'
              : 'None of the selected files could be verified as valid PNG or JPG image data (checked by inspecting the actual file content, not just the file extension).'
          );
        } else {
          // "Convert to PDF" only genuinely supports image inputs (PNG/JPG)
          // today — the file picker for this tool only accepts image/* for
          // that reason. There is no real Office/XML-to-PDF conversion
          // pipeline in this codebase. Previously this branch silently
          // fabricated a fake one-page PDF containing a canned sentence
          // ("This simulated conversion preserves all structural and text
          // elements accurately.") regardless of the actual source file —
          // that is a correctness/integrity bug (it lies about succeeding),
          // not a real feature, so it has been removed. Surface a clear
          // error instead of fake output.
          throw new Error(
            lang === 'ar'
              ? 'تحويل هذا النوع من الملفات إلى PDF غير مدعوم حالياً. هذه الأداة تدعم فقط تحويل الصور (PNG/JPG) إلى PDF.'
              : 'Converting this file type to PDF is not supported yet. This tool currently only supports converting images (PNG/JPG) to PDF.'
          );
        }

      } else if (activeTool === 'convert-from') {
        const targetFile = files[0];
        if (!targetFile.data || !targetFile.name.toLowerCase().endsWith('.pdf')) {
          throw new Error(lang === 'ar' ? 'الرجاء تحميل ملف PDF صالح للتحويل.' : 'Please load a valid PDF file to convert.');
        }

        if (conversionTarget === 'jpg' || conversionTarget === 'png') {
          // Real conversion: renders EVERY page of the actual PDF to a
          // genuinely re-encoded PNG or JPEG image via pdf.js + canvas
          // (see renderPdfPagesToImages). This is not a renamed/relabeled
          // file — canvas.toBlob() with 'image/jpeg' produces a real JPEG
          // bitstream, distinct from the PNG bitstream produced for 'png'.
          const format: 'png' | 'jpeg' = conversionTarget === 'jpg' ? 'jpeg' : 'png';
          const baseName = targetFile.name.replace(/\.pdf$/i, '');

          // pdf.js cannot render encrypted PDFs; say so clearly up front.
          await assertPdfNotEncrypted(targetFile.data, targetFile.name);

          setProcessingStatusText(lang === 'ar' ? 'جاري قراءة عدد الصفحات...' : 'Reading page count...');
          setProcessProgress(15);
          const pageCount = await getPdfPageCount(targetFile.data);
          if (pageCount <= 0) {
            throw new Error(lang === 'ar' ? 'لم يتم العثور على صفحات في هذا الملف.' : 'No pages were found in this PDF.');
          }

          setProcessingStatusText(
            lang === 'ar'
              ? `جاري تحويل ${pageCount} صفحة إلى ${format === 'jpeg' ? 'JPG' : 'PNG'}...`
              : `Converting ${pageCount} page${pageCount > 1 ? 's' : ''} to ${format === 'jpeg' ? 'JPG' : 'PNG'}...`
          );

          const rendered = await renderPdfPagesToImages(targetFile.data, format, {
            scale: 2,
            jpegQuality: 0.92,
            // Cap very large documents so a huge PDF can't freeze the tab
            // indefinitely — 300 pages of real page renders is already far
            // beyond what any of this app's other tools process at once.
            maxPages: 300,
            onProgress: (done, total) => {
              // Map rendering progress onto the 20% → 85% portion of the
              // overall progress bar, leaving room for the read step before
              // and the packaging/download step after.
              const pct = 20 + Math.round((done / total) * 65);
              setProcessProgress(pct);
              setProcessingStatusText(
                lang === 'ar'
                  ? `جاري عرض الصفحة ${done} من ${total}...`
                  : `Rendering page ${done} of ${total}...`
              );
            },
          });

          if (rendered.length === 0) {
            throw new Error(lang === 'ar' ? 'تعذر تحويل صفحات هذا الملف إلى صور.' : 'Could not render this PDF\'s pages as images.');
          }

          const ext = format === 'jpeg' ? 'jpg' : 'png';

          if (rendered.length === 1) {
            // Single page: download the image file directly, same UX as
            // every other single-file result in this tool.
            const blobUrl = URL.createObjectURL(rendered[0].blob);
            setProcessProgress(95);
            setResultFile({
              name: `${baseName}_page_1.${ext}`,
              blobUrl,
              size: rendered[0].blob.size,
            });
          } else {
            // Multiple pages: package every page into a single ZIP so the
            // user gets one clean download instead of N separate browser
            // download prompts. Filenames follow the requested
            // filename_page_1.ext / filename_page_2.ext pattern and
            // preserve page order (pages were rendered and pushed in order).
            setProcessingStatusText(lang === 'ar' ? 'جاري تجهيز أرشيف ZIP...' : 'Packaging ZIP archive...');
            setProcessProgress(90);

            const zip = new JSZip();
            rendered.forEach((page) => {
              zip.file(`${baseName}_page_${page.pageIndex + 1}.${ext}`, page.blob);
            });
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const blobUrl = URL.createObjectURL(zipBlob);

            setProcessProgress(97);
            setResultFile({
              name: `${baseName}_${ext}_pages.zip`,
              blobUrl,
              size: zipBlob.size,
            });
          }
        } else {
          // Real DOCX/XLSX export from an arbitrary PDF (preserving layout,
          // tables, fonts, etc.) requires a full document-conversion engine
          // that isn't part of this codebase. Previously this branch
          // fabricated a fake exported file (a text blob saying "Easy PDF
          // Content Exported successfully.") regardless of target format —
          // a correctness/integrity bug, since it always claimed success
          // without doing any real conversion. Surface a clear error
          // instead of fake output rather than silently producing a
          // corrupt/fake .docx or .xlsx file.
          throw new Error(
            lang === 'ar'
              ? `التصدير إلى ${conversionTarget.toUpperCase()} غير مدعوم بعد. هذه الميزة قيد التطوير — يمكنك حالياً التصدير إلى PNG أو JPG فقط.`
              : `Exporting to ${conversionTarget.toUpperCase()} isn't supported yet. This feature is still in development — PNG and JPG export are the only formats currently available.`
          );
        }
      } else if (activeTool === 'summarize') {
        const targetFile = files[0];
        if (!targetFile) {
          throw new Error(lang === 'ar' ? 'الرجاء تحميل مستند PDF للتلخيص.' : 'Please load a PDF file first to summarize.');
        }

        // NOTE (Sep 2026): Summarize used to upload the whole PDF to cloud
        // storage first ("cataloging"). That consumed one of the free user's
        // daily UPLOAD credits on top of the AI credit, and stored the
        // user's document permanently for no functional reason — the
        // summary only needs the extracted text. The file now stays on the
        // device; only its text is sent to /api/summarize.
        if (targetFile.data) {
          await assertPdfNotEncrypted(targetFile.data, targetFile.name);
        }

        setProcessProgress(45);
        setProcessingStatusText(lang === 'ar' ? 'جاري استخراج النص الفعلي من المستند...' : 'Extracting the document\'s real text content...');

        // NOTE (audit, Aug 2026): this previously sent Gemini a fabricated
        // metadata description ("This is a document titled X, N pages...")
        // instead of the document's actual text, meaning the AI was
        // "summarizing" a fake placeholder string on every real document,
        // not the user's content. extractPdfText() (already used correctly
        // by SmartEnhanceTool.tsx for smart-rename/extract-data) pulls the
        // real embedded text layer client-side so Gemini analyzes what the
        // document actually says.
        let realDocumentText = '';
        if (targetFile.data) {
          realDocumentText = await extractPdfText(targetFile.data);
        }
        if (!realDocumentText || !realDocumentText.trim()) {
          throw new Error(
            lang === 'ar'
              ? 'تعذر استخراج نص قابل للقراءة من هذا الملف. قد يكون مستنداً ممسوحاً ضوئياً (صورة) بدون طبقة نص — جرّب أداة OCR أولاً.'
              : "Couldn't extract readable text from this file. It may be a scanned/image-only document with no text layer — try the OCR tool first."
          );
        }

        setProcessProgress(50);
        setProcessingStatusText(lang === 'ar' ? 'جاري قراءة وتحليل نصوص المستند بالذكاء الاصطناعي (Gemini)...' : 'Gemini AI is reading and digesting document text contents...');

        // Trigger AI Summarization endpoint with the document's real text.
        const response = await authenticatedFetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `${realDocumentText}\n\n${summaryFocus ? `Additional focus instructions from the user: "${summaryFocus}"` : ''}`
          })
        });

        const aiData = await response.json();
        if (!response.ok) {
          throw new Error(response.status === 403
            ? (lang === 'ar' ? 'لقد تجاوزت الحد اليومي للعمليات الذكية للحساب المجاني (3 عمليات). يرجى الترقية إلى خطة برو لتلخيص غير محدود.' : aiData.error)
            : (aiData.error || 'AI Summarization failed.'));
        }

        setProcessProgress(85);
        setProcessingStatusText(lang === 'ar' ? 'جاري تنسيق التلخيص...' : 'Formatting the summary...');
        await sleep();

        if (aiData.summary) {
          setSummaryResult(aiData.summary);
          setSummaryIsDemo(!!aiData.demo);
        } else {
          throw new Error('No AI summary text returned from server.');
        }
      }

      setProcessProgress(100);
      setProcessingStatusText(lang === 'ar' ? 'اكتمل!' : 'Done!');
      await sleep();

    } catch (err: any) {
      alert(pdfErrorMessage(err, lang, 'Error processing PDF'));
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  // Short pause between progress-bar steps so the UI updates are visible
  // (not a fake "processing" delay standing in for real work).
  const UI_STEP_DELAY_MS = 120;
  const sleep = (ms: number = UI_STEP_DELAY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const clearWorkspace = () => {
    setFiles([]);
    setResultFile(null);
  };

  return (
    <motion.div 
      className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full relative z-10 max-w-7xl mx-auto" 
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
    >
      
      {/* Side Control Panel */}
      <motion.div className="lg:col-span-4 flex flex-col gap-6" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
        <motion.div className="content-card rounded-xl p-6 flex flex-col gap-6 text-left" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
          
          {/* Language Switcher */}
          <div className="flex justify-between items-center gap-2 bg-white/5 p-2.5 rounded-lg border border-white/5">
            <span className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">
              {lang === 'ar' ? 'لغة الواجهة / Language' : 'Interface Language'}
            </span>
            <div className="flex gap-1.5">
              <button 
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 text-xs font-bold font-mono rounded cursor-pointer transition-colors ${lang === 'en' ? 'bg-primary text-background' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                English
              </button>
              <button 
                onClick={() => setLang('ar')}
                className={`px-2.5 py-1 text-xs font-bold font-mono rounded cursor-pointer transition-colors ${lang === 'ar' ? 'bg-primary text-background' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                العربية
              </button>
            </div>
          </div>

          {/* Active Tool Header */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs text-primary font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {translations[lang].activeSystem}
            </span>
            <h2 className="text-xl font-display font-bold text-on-surface capitalize">
              {lang === 'ar' 
                ? (activeTool === 'merge' ? 'دمج مستندات PDF' 
                   : activeTool === 'split' ? 'تقسيم مستند PDF' 
                   : activeTool === 'compress' ? 'ضغط حجم PDF' 
                   : activeTool === 'convert-to' ? 'تحويل الصور إلى PDF' 
                   : activeTool === 'convert-from' ? 'تحويل من PDF'
                   : 'تلخيص المستند بالذكاء الاصطناعي')
                : (activeTool === 'summarize' ? 'AI PDF Summarizer' : `${activeTool.replace('-', ' ')} PDF`)
              }
            </h2>
          </div>

          {/* User Live Quota Tracker */}
          {currentUser && liveUserQuota && (
            <div className="flex flex-col gap-2 bg-primary/5 p-4 rounded-xl border border-primary/20 text-xs text-on-surface-variant relative overflow-hidden">
              <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-primary animate-ping"></div>
              <div className="flex justify-between items-center font-semibold text-on-surface">
                <span>{lang === 'ar' ? 'مستوى الاستهلاك اليومي' : 'Daily Usage Quota'}</span>
                <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs uppercase font-mono font-bold ${liveUserQuota.plan === 'pro' ? 'bg-secondary/20 text-secondary' : 'bg-white/10 text-on-surface-variant'}`}>
                  {liveUserQuota.plan === 'pro' ? (
                    <>
                      <ShieldCheck className="w-3 h-3" />
                      {liveUserQuota.plan}
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3" />
                      {liveUserQuota.plan}
                    </>
                  )}
                </span>
              </div>
              <div className="space-y-1.5 mt-1">
                <div className="flex justify-between">
                  <span>{lang === 'ar' ? 'رفع المستندات:' : 'PDF Uploads:'}</span>
                  <span className="font-mono font-bold text-on-surface">
                    {liveUserQuota.plan === 'pro' ? '∞' : `${liveUserQuota.uploads_count_today} / 3`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'ar' ? 'عمليات الذكاء الاصطناعي:' : 'AI Summaries:'}</span>
                  <span className="font-mono font-bold text-on-surface">
                    {liveUserQuota.plan === 'pro' ? '∞' : `${liveUserQuota.ai_count_today} / 3`}
                  </span>
                </div>
              </div>
              {liveUserQuota.plan === 'free' && (
                <button
                  onClick={onUpgrade}
                  className="w-full text-center py-2 bg-gradient-to-r from-primary to-secondary text-background hover:scale-[1.02] active:scale-95 transition-all rounded-lg text-xs font-bold font-display cursor-pointer mt-2 shadow-md shadow-primary/20"
                >
                  {lang === 'ar' ? 'ترقية الحساب الآن' : 'Upgrade to Pro'}
                </button>
              )}
            </div>
          )}

          <hr className="border-white/10" />

          {/* Quick Nav Inside Workspace */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-on-surface-variant font-mono uppercase tracking-wider">
              {translations[lang].changeProtocol}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'merge', label_en: 'Merge', label_ar: 'دمج PDF', icon: <GitMerge className="w-3.5 h-3.5" /> },
                { id: 'split', label_en: 'Split', label_ar: 'تقسيم PDF', icon: <Columns className="w-3.5 h-3.5" /> },
                { id: 'compress', label_en: 'Compress', label_ar: 'ضغط PDF', icon: <Minimize className="w-3.5 h-3.5" /> },
                { id: 'page-manager', label_en: 'Page Manager', label_ar: 'إدارة الصفحات', icon: <Layers className="w-3.5 h-3.5 text-primary" /> },
                { id: 'protect', label_en: 'Protect', label_ar: 'حماية وتشفير', icon: <FileCheck className="w-3.5 h-3.5" /> },
                { id: 'unlock', label_en: 'Unlock', label_ar: 'فك الحماية', icon: <RefreshCw className="w-3.5 h-3.5" /> },
                { id: 'watermark', label_en: 'Watermark', label_ar: 'علامة مائية', icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" /> },
                { id: 'page-numbers', label_en: 'Page Numbers', label_ar: 'ترقيم الصفحات', icon: <FileText className="w-3.5 h-3.5" /> },
                { id: 'e-signature', label_en: 'E-Signature', label_ar: 'توقيع إلكتروني', icon: <Edit className="w-3.5 h-3.5 text-emerald-400" /> },
                // Sept 2026 fix: 'convert-to' (the Convert tool) previously had
                // no entry in this in-workspace quick-switch list, so a user
                // already working on another tool had no way to jump to
                // Convert without first going back to the homepage — see the
                // Convert tool audit notes in executeProtocol above.
                { id: 'convert-to', label_en: 'Convert', label_ar: 'تحويل الصيغ', icon: <FileImage className="w-3.5 h-3.5 text-primary" /> },
                { id: 'ocr', label_en: 'OCR Extractor', label_ar: 'استخراج OCR', icon: <Eye className="w-3.5 h-3.5" /> },
                { id: 'smart-enhance', label_en: 'AI Suite', label_ar: 'أدوات الذكاء', icon: <Sparkles className="w-3.5 h-3.5 text-secondary animate-pulse" /> },
                { id: 'batch-process', label_en: 'Batch Queue', label_ar: 'معالجة جماعية', icon: <Layers className="w-3.5 h-3.5" /> },
                { id: 'edit-text', label_en: 'In-Document Edit', label_ar: 'تعديل النصوص', icon: <Edit className="w-3.5 h-3.5 text-primary animate-pulse" /> },
              ].map((item, index) => (
                <motion.button
                  key={item.id}
                  onClick={() => {
                    setActiveTool(item.id as ToolType);
                    setResultFile(null);
                    setSummaryResult(null);
                    setSummaryIsDemo(false);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg font-medium cursor-pointer transition-all ${
                    activeTool === item.id
                      ? 'bg-secondary text-on-primary font-bold shadow-md shadow-secondary/20'
                      : 'bg-white/5 text-on-surface-variant hover:text-on-surface hover:bg-white/10'
                  }`}
                  id={`workspace-tool-nav-${item.id}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 + index * 0.03 }}
                  whileHover={!shouldReduceMotion ? { x: 2 } : undefined}
                  whileTap={{ scale: 0.98 }}
                >
                  {item.icon}
                  {lang === 'ar' ? item.label_ar : item.label_en}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Always Visible Superpower Quick Toggles */}
          <div className="flex flex-col gap-3.5 p-4 bg-gradient-to-tr from-primary/10 to-secondary/15 border border-primary/25 rounded-xl animate-fadeIn">
            <span className="text-xs font-mono text-primary font-extrabold uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-secondary animate-pulse" />
              {lang === 'ar' ? 'خصائص التعديل الفائقة (Gemini)' : 'IN-DOCUMENT SUPERPOWERS (GEMINI)'}
            </span>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {lang === 'ar' 
                ? 'ميزات ذكية للتفاعل الفوري مع محتوى المستند. انقر لتجربتها حياً:' 
                : 'Advanced AI modules for real-time document interaction. Click to try live:'}
            </p>

            <div className="flex flex-col gap-2">
              {/* Smart Redaction (Magic Eraser) */}
              <button
                onClick={async () => {
                  setActiveTool('edit-text');
                  setIsRedactModeActive(!isRedactModeActive);
                  if (files.length === 0) {
                    await generateSamplePDF(lang === 'ar' ? 'تقرير_الشركاء_الرسمي' : 'Official_Partner_Report', 1);
                  }
                }}
                className={`w-full py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                  isRedactModeActive && activeTool === 'edit-text'
                    ? 'bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.2)]' 
                    : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                }`}
                id="sidebar-superpower-redact"
              >
                <span className="flex items-center gap-1.5">
                  <span>🛡️</span>
                  <span>{lang === 'ar' ? 'طمس وحجب البيانات (Magic Eraser)' : 'Smart Redaction (Magic Eraser)'}</span>
                </span>
                <span className="text-xs font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-white/10 text-neutral-400">
                  {isRedactModeActive && activeTool === 'edit-text' ? (lang === 'ar' ? 'نشط' : 'ON') : (lang === 'ar' ? 'مغلق' : 'OFF')}
                </span>
              </button>

              {/* Layout-Preserving Translation */}
              <button
                onClick={async () => {
                  setActiveTool('edit-text');
                  // NOTE (Sep 2026): this used to fall back to hard-coded demo
                  // invoice text (with the AR/EN strings even swapped) and
                  // "translate" that instead of the real document whenever no
                  // real text had been extracted yet. It now always OCRs the
                  // real active file (or a freshly generated sample, whose
                  // bytes are used directly rather than relying on state that
                  // has not re-rendered yet) and only ever translates real
                  // extracted text, or tells the user honestly if there is
                  // nothing to translate.
                  let activeFile = files[0];
                  if (!activeFile) {
                    activeFile = await generateSamplePDF(lang === 'ar' ? 'مستند_عينة' : 'Sample_Document', 1) || undefined as any;
                    if (!activeFile) return;
                  }
                  setIsOcrLoading(true);
                  try {
                    let currentTextLayers = textLayers;
                    if (currentTextLayers.length === 0) {
                      setOcrStatusText(lang === 'ar' ? 'جاري استخراج النص من المستند...' : 'Extracting text from the document...');
                      const fresh = await runOcrOnActiveFile({ data: activeFile.data, name: activeFile.name });
                      if (!fresh || fresh.length === 0) {
                        alert(lang === 'ar' ? 'تعذّر استخراج أي نص من هذا المستند لترجمته.' : 'Could not extract any text from this document to translate.');
                        return;
                      }
                      currentTextLayers = fresh;
                    }

                    setOcrStatusText(lang === 'ar' ? 'جاري ترجمة النصوص مع الحفاظ على التصميم...' : 'Translating while preserving structural layout...');
                    // Direction follows the DOCUMENT's own language, not the UI language.
                    const isDocumentArabic = /[\u0600-\u06FF]/.test(currentTextLayers[0]?.text || '');
                    const response = await authenticatedFetch('/api/copilot/command', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        message: isDocumentArabic ? 'translate to English' : 'translate to Arabic',
                        textLayers: currentTextLayers,
                        imageFilters,
                        lang
                      })
                    });
                    if (response.ok) {
                      const data = await response.json();
                      if (data.textLayers) {
                        setTextLayers(data.textLayers);
                      }
                    } else {
                      const err = await response.json().catch(() => ({}));
                      alert(err.error || (lang === 'ar' ? 'فشلت عملية الترجمة. حاول مرة أخرى.' : 'Translation failed. Please try again.'));
                    }
                  } catch (err) {
                    console.error('Translation error:', err);
                    alert(lang === 'ar' ? 'فشلت عملية الترجمة. حاول مرة أخرى.' : 'Translation failed. Please try again.');
                  } finally {
                    setIsOcrLoading(false);
                  }
                }}
                disabled={isOcrLoading}
                className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                id="sidebar-superpower-translation"
              >
                <span>🌐</span>
                <span>{lang === 'ar' ? 'ترجمة ذكية (حفظ التخطيط)' : 'Layout-Preserving Translation'}</span>
              </button>

              {/* Voice-to-Text Sticky Notes — NOT implemented yet. The
                  previous version ran a fake 3-second "REC" countdown and then
                  injected a random hardcoded note labeled as voice-transcribed.
                  Disabled until real speech-to-text exists; do not re-enable
                  without wiring an actual microphone transcription pipeline. */}
              <button
                disabled
                aria-disabled={true}
                title={lang === 'ar' ? 'الملاحظات الصوتية غير متاحة بعد — قريباً' : 'Voice sticky notes are not available yet — coming soon'}
                className="w-full py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-between border bg-white/5 text-neutral-500 border-white/10 opacity-50 cursor-not-allowed"
                id="sidebar-superpower-voice"
              >
                <span className="flex items-center gap-1.5">
                  <span>🎙️</span>
                  <span>{lang === 'ar' ? 'ملاحظة ملصقة بالصوت (قريباً)' : 'Voice-to-Text Sticky Notes (soon)'}</span>
                </span>
                <span className="bg-white/5 text-neutral-400 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase font-mono">
                  {lang === 'ar' ? 'قريباً' : 'SOON'}
                </span>
              </button>
            </div>
          </div>

          <hr className="border-white/10" />

          {/* Tool specific parameters/options */}
          <div className="flex flex-col gap-4">
            {activeTool === 'merge' && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold font-mono text-on-surface-variant uppercase tracking-wider">
                  {translations[lang].collationProtocol}
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {translations[lang].collationDesc}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => generateSamplePDF(lang === 'ar' ? 'تقرير_الربع_الثالث' : 'Source_Node_Alpha', 3)}
                    className="flex-grow text-center py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                    id="btn-sample-alpha"
                  >
                    {translations[lang].addAlpha}
                  </button>
                  <button
                    onClick={() => generateSamplePDF(lang === 'ar' ? 'مسودة_المشروع' : 'Source_Node_Beta', 2)}
                    className="flex-grow text-center py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                    id="btn-sample-beta"
                  >
                    {translations[lang].addBeta}
                  </button>
                </div>
              </div>
            )}

            {activeTool === 'split' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold font-mono text-on-surface-variant uppercase tracking-wider">
                    {translations[lang].targetRange}
                  </label>
                  <input
                    type="text"
                    value={splitRange}
                    onChange={(e) => setSplitRange(e.target.value)}
                    placeholder="e.g. 1-2, 4"
                    className="w-full px-3.5 py-2.5 bg-surface-bright rounded-lg border border-white/10 text-xs focus:outline-none focus:border-primary text-on-surface"
                    id="input-split-range"
                  />
                </div>
                <div className="bg-primary/5 p-3.5 rounded-lg border border-primary/20 flex gap-2 items-start text-xs text-primary leading-relaxed">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{translations[lang].splitInfo}</p>
                </div>
                <button
                  onClick={() => generateSamplePDF(lang === 'ar' ? 'مستند_للتقسيم' : 'Splitting_Demo_Target', 6)}
                  className="w-full text-center py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  id="btn-sample-split"
                >
                  {translations[lang].addSample6}
                </button>
              </div>
            )}

            {activeTool === 'compress' && (
              <div className="flex flex-col gap-4">
                <span className="text-xs font-bold font-mono text-on-surface-variant uppercase tracking-wider">
                  {translations[lang].compAlgo}
                </span>
                {/* HONESTY FIX: the previous Recommended / Extreme / Low
                    selector was cosmetic — all three produced identical output,
                    because the underlying optimizer has a single strategy.
                    Replaced with a plain description of what compression
                    actually does here, so users aren't choosing between fake
                    levels. Do not re-introduce selectable levels without wiring
                    them to genuinely different pipelines. */}
                <div className="bg-primary/5 p-3.5 rounded-lg border border-primary/20 flex gap-2 items-start text-xs text-primary leading-relaxed">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    {lang === 'ar'
                      ? 'يعيد الضغط بناء هيكل الملف الداخلي ويحذف الكائنات المكررة، كما يُعيد ترميز الصور الفوتوغرافية المناسبة بجودة عالية عندما يقلّل ذلك الحجم فعلياً. النتيجة تعتمد على محتوى المستند — ملفات الرسوم والنماذج تتقلص أكثر، وبعض الصور قد تُترك كما هي إذا لم يكن إعادة ترميزها آمناً.'
                      : 'Compression rebuilds the PDF\u2019s internal structure, removes duplicate objects, and re-encodes eligible photos at a high-quality setting when that genuinely shrinks the file. Gains depend on content — graphics- and form-heavy files shrink more, and some images are left untouched when re-encoding them isn\u2019t safe to do.'}
                  </p>
                </div>
                <button
                  onClick={() => generateSamplePDF(lang === 'ar' ? 'مستند_للضغط' : 'Compression_Demo_Target', 4)}
                  className="w-full text-center py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  id="btn-sample-compress"
                >
                  {translations[lang].addSample4}
                </button>
              </div>
            )}

            {(activeTool === 'convert-to' || activeTool === 'convert-from') && (
              <div className="flex flex-col gap-4">
                {/* Direction switcher — the single entry point into all three
                    real conversions this tool supports. Sept 2026 fix: this
                    is what makes 'convert-from' (PDF → image) reachable at
                    all; previously no button anywhere set activeTool to
                    'convert-from', so that panel/logic existed in code but
                    could never actually be opened by a user. */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold font-mono text-on-surface-variant uppercase tracking-wider">
                    {lang === 'ar' ? 'اتجاه التحويل' : 'Convert'}
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      {
                        key: 'images-to-pdf',
                        label: lang === 'ar' ? 'صور ← PDF' : 'Images → PDF',
                        icon: <ImageIcon className="w-3.5 h-3.5" />,
                        active: activeTool === 'convert-to',
                        onClick: () => { setActiveTool('convert-to'); setResultFile(null); },
                      },
                      {
                        key: 'pdf-to-png',
                        label: lang === 'ar' ? 'PDF ← PNG' : 'PDF → PNG',
                        icon: <FileImage className="w-3.5 h-3.5" />,
                        active: activeTool === 'convert-from' && conversionTarget === 'png',
                        onClick: () => { setActiveTool('convert-from'); setConversionTarget('png'); setResultFile(null); },
                      },
                      {
                        key: 'pdf-to-jpg',
                        label: lang === 'ar' ? 'PDF ← JPG' : 'PDF → JPG',
                        icon: <FileImage className="w-3.5 h-3.5" />,
                        active: activeTool === 'convert-from' && conversionTarget === 'jpg',
                        onClick: () => { setActiveTool('convert-from'); setConversionTarget('jpg'); setResultFile(null); },
                      },
                    ].map((dir) => (
                      <button
                        key={dir.key}
                        onClick={dir.onClick}
                        className={`flex items-center gap-2 py-2.5 px-3 text-xs rounded-lg border transition-all cursor-pointer ${
                          dir.active
                            ? 'bg-primary/10 border-primary font-bold text-primary'
                            : 'bg-white/5 border-transparent hover:border-white/10 text-on-surface-variant hover:text-on-surface'
                        }`}
                        id={`convert-direction-${dir.key}`}
                      >
                        {dir.icon}
                        {dir.label}
                      </button>
                    ))}
                  </div>
                  {/* Word/Excel are intentionally NOT offered as a direction —
                      there is no real PDF-to-Office conversion engine in this
                      codebase. Shown as a plain, non-interactive note instead
                      of clickable buttons so it's never mistaken for a working
                      option. */}
                  <p className="text-[10px] text-on-surface-variant/60 mt-1">
                    {lang === 'ar' ? 'قريباً: Word و Excel' : 'Coming soon: Word & Excel'}
                  </p>
                </div>

                {activeTool === 'convert-to' && (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      {translations[lang].assetInputDesc}
                    </p>
                    <div className="bg-primary/5 p-3.5 rounded-lg border border-primary/20 flex gap-2 items-start text-xs text-primary leading-relaxed">
                      <Info className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>{translations[lang].assetInputInfo}</p>
                    </div>
                  </div>
                )}

                {activeTool === 'convert-from' && (
                  <button
                    onClick={() => generateSamplePDF(lang === 'ar' ? 'تقرير_للتصدير' : 'Extraction_Demo_Target', 3)}
                    className="w-full text-center py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                    id="btn-sample-convert-from"
                  >
                    {translations[lang].addSample3}
                  </button>
                )}
              </div>
            )}

            {activeTool === 'summarize' && (
              <div className="flex flex-col gap-4 animate-fadeIn">
                <span className="text-xs font-bold font-mono text-secondary uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-secondary animate-pulse" />
                  {lang === 'ar' ? 'خيارات ملخص الذكاء الاصطناعي' : 'AI Summary Options'}
                </span>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  {lang === 'ar' 
                    ? 'سيقوم نموذج الذكاء الاصطناعي (Gemini) بقراءة ملف الـ PDF وتوليد ملخص احترافي لأبرز النقاط وبنود العمل فوراً.'
                    : 'The Gemini AI model will read and parse your PDF file to distill a professional summary and bullet points.'}
                </p>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-on-surface flex items-center gap-1">
                    <span>{lang === 'ar' ? 'توجيه مخصص للتلخيص (اختياري):' : 'Custom Summary Instruction (Optional):'}</span>
                  </label>
                  <textarea
                    value={summaryFocus}
                    onChange={(e) => setSummaryFocus(e.target.value)}
                    placeholder={lang === 'ar' ? 'مثال: ركز على النتائج المالية الرئيسية والأرقام والنسب...' : 'e.g., Focus on major financial statistics, percentages, and performance results...'}
                    rows={4}
                    className="w-full px-3 py-2 bg-surface-bright rounded-lg border border-white/10 text-xs focus:outline-none focus:border-secondary text-on-surface resize-none"
                    id="input-summary-focus"
                  />
                </div>
                <button
                  onClick={() => generateSamplePDF(lang === 'ar' ? 'تقرير_الأداء_السنوي' : 'Annual_Performance_Summary', 4)}
                  className="w-full text-center py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  id="btn-sample-summarize"
                >
                  {lang === 'ar' ? 'استخدم ملف تجريبي (4 صفحات)' : 'Use Sample PDF (4 Pages)'}
                </button>
              </div>
            )}

            {activeTool === 'edit-text' && (
              <div className="flex flex-col gap-4 animate-fadeIn">
                <span className="text-xs font-bold font-mono text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Edit className="w-3.5 h-3.5 text-primary" />
                  {lang === 'ar' ? 'لوحة تحكم التعديل الفوري' : 'Live Editing Controls'}
                </span>
                {/* Honesty note (Sep 2026): this tool rebuilds page 1 from
                    AI-extracted text — it does not edit the real vector
                    text/layout of the original page. Every other page is
                    now preserved unchanged in the exported file (see
                    compileModifiedPdf above), but page 1 itself is a
                    reconstruction, not an in-place edit, so this is stated
                    up front rather than implied by the "Live Editing"
                    label above. */}
                <p className="text-[11px] text-on-surface-variant leading-relaxed -mt-2">
                  {lang === 'ar'
                    ? 'ملاحظة: تُعاد صياغة الصفحة الأولى فقط بالذكاء الاصطناعي بناءً على النص المستخرج منها؛ بقية صفحات الملف تبقى كما هي دون أي تغيير في الملف النهائي.'
                    : "Note: only page 1 is AI-rebuilt from its extracted text. Every other page is kept exactly as-is in the final file."}
                </p>

                {/* Copilot Launcher Card */}
                <div className="p-3.5 bg-gradient-to-tr from-primary/10 to-secondary/10 border border-primary/20 rounded-xl flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-secondary animate-bounce" />
                    <span className="text-xs font-bold text-on-surface">{lang === 'ar' ? 'مساعد التعديل الذكي' : 'Gemini AI Assistant'}</span>
                  </div>
                  <p className="text-[10px] text-neutral-400 leading-relaxed">
                    {lang === 'ar' 
                      ? 'افتح لوحة الكوبايلوت الجانبية لإعطاء أوامر صوتية أو نصية لترجمة وتعديل المستند تلقائياً.' 
                      : 'Launch the AI Copilot side-drawer to give natural voice or text directives to translate, re-title or tweak filters.'}
                  </p>
                  <button
                    onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                    className="w-full py-2 bg-primary text-on-primary hover:bg-primary-dark transition-all rounded-lg text-xs font-bold font-display cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-primary/20"
                    id="btn-toggle-copilot-panel"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isCopilotOpen 
                      ? (lang === 'ar' ? 'إغلاق الكوبايلوت' : 'Close AI Copilot') 
                      : (lang === 'ar' ? 'تشغيل الكوبايلوت الذكي' : 'Open AI Copilot')}
                  </button>
                </div>

                <hr className="border-white/5" />

                {/* OCR & Document Layering status */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-mono text-on-surface-variant font-bold uppercase tracking-wider">{lang === 'ar' ? 'خريطة النصوص المكتشفة:' : 'Extracted Text Layers:'}</span>
                  <div className="flex items-center justify-between bg-white/3 p-2.5 rounded-lg border border-white/5 text-xs">
                    <span className="font-mono text-neutral-300">
                      {isOcrLoading ? (
                        <span className="flex items-center gap-1.5 text-neutral-400 animate-pulse">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          {lang === 'ar' ? 'جاري القراءة...' : 'Scanning PDF...'}
                        </span>
                      ) : (
                        textLayers.length === 0
                          ? (lang === 'ar' ? 'لم يتم استخراج أي نص بعد' : 'No text extracted yet')
                          : `${textLayers.length} ${lang === 'ar' ? 'فقرة نصية' : 'text blocks'}`
                      )}
                    </span>
                    <button
                      onClick={() => runOcrOnActiveFile()}
                      disabled={isOcrLoading || files.length === 0}
                      className="text-xs font-bold text-secondary hover:text-on-surface disabled:opacity-30 cursor-pointer"
                      id="btn-re-scan-ocr"
                    >
                      {textLayers.length === 0
                        ? (lang === 'ar' ? 'استخراج النص' : 'Extract Text')
                        : (lang === 'ar' ? 'إعادة الفحص' : 'Re-scan')}
                    </button>
                  </div>
                </div>

                <hr className="border-white/5" />

                {/* Superpower Features Card */}
                <div className="p-3.5 bg-neutral-950/40 border border-white/5 rounded-xl flex flex-col gap-3">
                  <span className="text-xs font-mono text-primary font-bold uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary animate-pulse" />
                    {lang === 'ar' ? 'أدوات التعديل الفائقة' : 'SUPERPOWER EDITING TOOLS'}
                  </span>

                  {/* Smart Redaction (Magic Eraser) */}
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => setIsRedactModeActive(!isRedactModeActive)}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                        isRedactModeActive 
                          ? 'bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.2)]' 
                          : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'
                      }`}
                      id="btn-toggle-redaction-mode"
                    >
                      <span className="flex items-center gap-1.5">
                        <span>🛡️</span>
                        <span>{lang === 'ar' ? 'طمس وحجب البيانات' : 'Smart Redaction'}</span>
                      </span>
                      <span className="text-xs font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-white/10 text-neutral-400">
                        {isRedactModeActive ? (lang === 'ar' ? 'نشط' : 'ON') : (lang === 'ar' ? 'مغلق' : 'OFF')}
                      </span>
                    </button>
<p className="text-xs text-neutral-400 leading-normal px-1 mt-0.5">
                          {lang === 'ar' 
                            ? 'فَعِّل الأداة ثم انقر على أي نص بالمستند لتطبيقه بطمس معتم.'
                            : 'Activate, then click any text block on the document to redact/blur it.'}
                        </p>
                  </div>

                  {/* Layout-Preserving Translation */}
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={async () => {
                        if (files.length === 0) return;
                        setIsOcrLoading(true);
                        setOcrStatusText(lang === 'ar' ? 'جاري ترجمة النصوص مع الحفاظ على التصميم...' : 'Translating while preserving structural layout...');
                        try {
                          const isCurrentlyArabic = textLayers.length > 0 && /[\u0600-\u06FF]/.test(textLayers[0].text || '');
                          const message = isCurrentlyArabic ? 'translate to English' : 'translate to Arabic';
                          const response = await authenticatedFetch('/api/copilot/command', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              message,
                              textLayers,
                              imageFilters,
                              lang
                            })
                          });
                          if (response.ok) {
                            const data = await response.json();
                            if (data.textLayers) {
                              setTextLayers(data.textLayers);
                            }
                          }
                        } catch (err) {
                          console.error('Translation error:', err);
                        } finally {
                          setIsOcrLoading(false);
                        }
                      }}
                      disabled={files.length === 0 || isOcrLoading}
                      className="w-full py-2 px-3 bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                      id="btn-layout-translation"
                    >
                      <span>🌐</span>
                      <span>{lang === 'ar' ? 'ترجمة ذكية (حفظ التخطيط)' : 'Layout-Preserved Translation'}</span>
                    </button>
<p className="text-xs text-neutral-400 leading-normal px-1 mt-0.5">
                        {lang === 'ar' 
                          ? 'ترجمة فورية للمستند مع الحفاظ على مواقع وأحجام الفقرات والتصميم.'
                          : 'Instantly translate all texts while keeping absolute layouts intact.'}
                      </p>
                  </div>

                  {/* Voice-to-Text Sticky Note — disabled: not implemented
                      (was a fake REC countdown + hardcoded note text). */}
                  <button
                    disabled
                    aria-disabled={true}
                    title={lang === 'ar' ? 'الملاحظة الصوتية غير متاحة بعد — قريباً' : 'Voice sticky note is not available yet — coming soon'}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-between border bg-white/5 text-neutral-500 border-white/10 opacity-50 cursor-not-allowed ${
                      files.length === 0 ? 'hidden' : ''
                    }`}
                    id="btn-voice-sticky-note"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>🎙️</span>
                      <span>{lang === 'ar' ? 'ملاحظة ملصقة بالصوت (قريباً)' : 'Voice-to-Text Sticky Note (soon)'}</span>
                    </span>
<span className="bg-white/5 text-neutral-400 text-xs font-bold px-1.5 py-0.5 rounded uppercase font-mono">
                      {lang === 'ar' ? 'قريباً' : 'SOON'}
                    </span>
                  </button>
                  <p className="text-xs text-neutral-400 leading-normal px-1 mt-0.5">
                    {lang === 'ar' 
                      ? 'ميزة الإملاء الصوتي للملاحظات غير متاحة بعد.'
                      : 'Voice dictation for sticky notes is not available yet.'}
                  </p>
                </div>

                <hr className="border-white/5" />

                {/* Visual canvas styling filters */}
                <div className="flex flex-col gap-2.5 bg-neutral-950/20 p-3 rounded-xl border border-white/5">
                  <span className="text-xs font-mono text-on-surface-variant font-bold uppercase tracking-wider">{lang === 'ar' ? 'تحسين مرونة الصورة والمستند:' : 'Page Graphic Enhancements:'}</span>
                  
                  {/* Brightness */}
                  <div className="flex flex-col gap-1">
<div className="flex justify-between text-xs font-mono text-neutral-400">
                        <span>{lang === 'ar' ? 'مستوى الإضاءة' : 'Brightness'}</span>
                      <span>{imageFilters.brightness}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="50" 
                      max="200" 
                      value={imageFilters.brightness}
                      onChange={(e) => setImageFilters({ ...imageFilters, brightness: parseInt(e.target.value) })}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="flex flex-col gap-1">
<div className="flex justify-between text-xs font-mono text-neutral-400">
                        <span>{lang === 'ar' ? 'مستوى التباين' : 'Contrast'}</span>
                      <span>{imageFilters.contrast}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="50" 
                      max="200" 
                      value={imageFilters.contrast}
                      onChange={(e) => setImageFilters({ ...imageFilters, contrast: parseInt(e.target.value) })}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  {/* Toggle monochrome & orientation */}
                  <div className="flex gap-2.5 mt-1 items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs text-neutral-400 font-mono cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={imageFilters.grayscale}
                        onChange={(e) => setImageFilters({ ...imageFilters, grayscale: e.target.checked })}
                        className="rounded border-white/10 bg-neutral-800 text-primary focus:ring-0 cursor-pointer"
                      />
                      <span>{lang === 'ar' ? 'أبيض وأسود' : 'Monochrome'}</span>
                    </label>

                    <button
                      onClick={() => setImageFilters({ ...imageFilters, rotate: (imageFilters.rotate + 90) % 360 })}
                      className="text-xs font-bold font-mono px-2 py-1 bg-white/5 border border-white/10 text-neutral-300 hover:text-on-surface rounded transition-colors cursor-pointer"
                    >
                      🔄 {lang === 'ar' ? 'تدوير 90°' : 'Rotate 90°'}
                    </button>
                  </div>
                </div>

                {/* Simulated Preset Document Templates Injection */}
                <button
                  onClick={() => generateSamplePDF(lang === 'ar' ? 'تقرير_الشركاء_الرسمي' : 'Official_Partner_Report', 1)}
                  className="w-full text-center py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-secondary"
                  id="btn-sample-editor"
                >
                  {lang === 'ar' ? '+ تحميل قالب فاتورة تجريبي' : '+ Load Invoice Document Template'}
                </button>
              </div>
            )}
          </div>

</motion.div>
        </motion.div>

      {/* Main File Management Canvas */}
      <div className="lg:col-span-8 flex flex-col gap-6 w-full">
        <div className="flex flex-col xl:flex-row gap-6 items-start w-full">
          <div className="flex-1 w-full flex flex-col gap-6">
            
            {/* Specialized Feature View Interfaces */}
            {activeTool === 'page-manager' ? (
              <VisualPageManager
                pdfBytes={files[0]?.data || null}
                fileName={files[0]?.name || 'Document.pdf'}
                lang={lang}
                onExport={(res) => setResultFile(res)}
              />
            ) : activeTool === 'protect' || activeTool === 'unlock' ? (
              <ProtectUnlockTool
                pdfBytes={files[0]?.data || null}
                fileName={files[0]?.name || 'Document.pdf'}
                mode={activeTool as 'protect' | 'unlock'}
                lang={lang}
                onExport={(res) => setResultFile(res)}
              />
            ) : activeTool === 'watermark' ? (
              <WatermarkTool
                pdfBytes={files[0]?.data || null}
                fileName={files[0]?.name || 'Document.pdf'}
                lang={lang}
                onExport={(res) => setResultFile(res)}
              />
            ) : activeTool === 'page-numbers' ? (
              <PageNumbersTool
                pdfBytes={files[0]?.data || null}
                fileName={files[0]?.name || 'Document.pdf'}
                lang={lang}
                onExport={(res) => setResultFile(res)}
              />
            ) : (activeTool as string) === 'signature' || (activeTool as string) === 'e-signature' ? (
              <ESignatureTool
                pdfBytes={files[0]?.data || null}
                fileName={files[0]?.name || 'Document.pdf'}
                pageCount={files[0]?.pageCount || 1}
                lang={lang}
                onExport={(res) => setResultFile(res)}
              />
            ) : activeTool === 'ocr' ? (
              <OcrTool
                pdfBytes={files[0]?.data || null}
                fileName={files[0]?.name || 'Document.pdf'}
                lang={lang}
              />
            ) : activeTool === 'smart-enhance' ? (
              <SmartEnhanceTool
                pdfBytes={files[0]?.data || null}
                fileName={files[0]?.name || 'Document.pdf'}
                lang={lang}
                onExport={(res) => setResultFile(res)}
              />
            ) : (activeTool as string) === 'batch' || (activeTool as string) === 'batch-process' ? (
              <BatchProcessingTool
                files={files}
                lang={lang}
                onClearFiles={() => setFiles([])}
                onRemoveFile={(id) => removeFile(id)}
              />
            ) : activeTool === 'edit-text' && files.length > 0 ? (
              <div className="w-full flex flex-col gap-5 text-left animate-fadeIn">
                {/* Document Editor Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-surface-bright/50 p-4 rounded-xl border border-white/5 gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider block">
                      {lang === 'ar' ? 'مساحة العمل للتعديل الفوري والمزامنة الذكية' : 'ACTIVE SMART EDIT WORKSPACE'}
                    </span>
                    <p className="text-sm font-semibold text-on-surface truncate mt-0.5">{files[0].name}</p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                      className={`px-3.5 py-2 hover:from-primary/20 hover:to-secondary/20 text-xs font-bold border rounded-lg flex items-center gap-1.5 transition-all ${
                        isCopilotOpen 
                          ? 'bg-gradient-to-r from-primary to-secondary text-background border-transparent' 
                          : 'bg-gradient-to-r from-primary/10 to-secondary/10 text-on-primary border-primary/20'
                      }`}
                      id="btn-workspace-copilot-toggle"
                    >
                      <Bot className="w-4 h-4" />
                      {lang === 'ar' ? 'مساعد الذكاء الاصطناعي' : 'AI Copilot'}
                    </button>

                    <button
                      onClick={compileModifiedPdf}
                      disabled={isCompilingEditedPdf || textLayers.length === 0}
                      className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-xs font-bold text-on-primary rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-secondary/20 disabled:opacity-50 cursor-pointer"
                      id="btn-workspace-save-modified"
                    >
                      {isCompilingEditedPdf ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          {lang === 'ar' ? 'جاري الحفظ...' : 'Compiling...'}
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          {lang === 'ar' ? 'حفظ وتصدير PDF' : 'Save & Export PDF'}
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Document Canvas Frame wrapper */}
                <div className="relative w-full bg-neutral-900/60 rounded-xl p-6 border border-white/5 flex justify-center items-center overflow-hidden min-h-[520px]">
                  {isOcrLoading ? (
                    <div className="flex flex-col items-center gap-3 py-12 text-center animate-fadeIn">
                      <Loader className="w-8 h-8 text-primary animate-spin" />
                      <p className="text-xs font-mono text-neutral-400 animate-pulse">{ocrStatusText}</p>
                    </div>
                  ) : textLayers.length === 0 ? (
                    /* Explicit empty state (Sep 2026 fix): text extraction no
                       longer runs automatically on opening this tool (it used
                       to spend an AI credit with no click and no warning —
                       see runOcrOnActiveFile's history). Before this fix,
                       skipping that auto-run left the canvas below rendering
                       a plain white "document sheet" with nothing on it and
                       no visible call to action, which looked exactly like a
                       broken/blank page rather than a tool waiting for a
                       click. This replaces that blank sheet with a real
                       explanation and a button that does the same thing the
                       sidebar's "Extract Text" button does. */
                    <div className="flex flex-col items-center gap-4 py-12 text-center animate-fadeIn max-w-sm">
                      <FileText className="w-10 h-10 text-neutral-500" />
                      <div className="flex flex-col gap-1.5">
                        <p className="text-sm font-semibold text-on-surface">
                          {lang === 'ar' ? 'لم يتم استخراج أي نص بعد' : 'No text extracted yet'}
                        </p>
                        <p className="text-xs text-on-surface-variant leading-relaxed">
                          {lang === 'ar'
                            ? 'اضغط على الزر أدناه لاستخراج نص الصفحة الأولى بالذكاء الاصطناعي قبل بدء التعديل.'
                            : "Press the button below to extract page 1's text with AI before editing."}
                        </p>
                      </div>
                      <button
                        onClick={() => runOcrOnActiveFile()}
                        disabled={files.length === 0}
                        className="px-4 py-2 bg-primary hover:bg-primary/90 text-xs font-bold text-on-primary rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
                        id="btn-canvas-extract-text"
                      >
                        <ScanText className="w-4 h-4" />
                        {lang === 'ar' ? 'استخراج النص' : 'Extract Text'}
                      </button>
                    </div>
                  ) : (
                    /* US Letter document sheet aspect ratio container */
                    <div 
                      className="w-full max-w-lg bg-white text-neutral-950 rounded shadow-2xl relative transition-all duration-300 p-8 flex flex-col justify-between overflow-hidden"
                      style={{
                        aspectRatio: '1 / 1.35',
                        filter: `brightness(${imageFilters.brightness}%) contrast(${imageFilters.contrast}%) grayscale(${imageFilters.grayscale ? 1 : 0})`,
                        transform: `rotate(${imageFilters.rotate}deg)`,
                      }}
                    >
                      {/* Simulated elegant security background watermark */}
                      <div className="absolute inset-0 pointer-events-none opacity-[0.03] select-none flex items-center justify-center font-bold text-5xl tracking-widest text-primary rotate-45">
                        EASY PDF PRO
                      </div>

                      {/* Left & Right absolute margin markers */}
                      <div className="absolute left-6 right-6 top-8 bottom-8 border border-dashed border-primary/5 pointer-events-none"></div>

                      {/* Top Bar Logo watermark in preview */}
                      <div className="flex justify-between items-center border-b border-neutral-200 pb-3 z-10 pointer-events-none">
                        <span className="text-xs font-mono uppercase tracking-wider text-neutral-400">Easy PDF Live Render</span>
                        <span className="text-xs font-mono text-neutral-400">Page 1 / 1</span>
                      </div>

                      {/* Interactive Text Blocks Layer */}
                      <div className="relative flex-1 py-4">
                        {textLayers.map((block) => {
                          const isTitle = block.id === 't1';
                          const isFooter = block.id === 't9';
                          return (
                            <div
                              key={block.id}
                              className={`absolute group cursor-pointer select-none transition-all duration-150 p-1 rounded ${
                                selectedBlockId === block.id 
                                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-white bg-primary/10' 
                                  : 'hover:bg-primary/5 hover:ring-1 hover:ring-primary/40'
                              } ${block.redacted ? 'border border-red-500/30' : ''}`}
                              style={{
                                left: `${(block.x / 612) * 100}%`,
                                top: `${((792 - block.y) / 792) * 100}%`, // Invert Y for correct web top-down layout
                                fontSize: `${(block.size || 11) * 0.9}px`,
                                maxWidth: '85%',
                                transform: 'translateY(-50%)', // Align with baseline properly
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isRedactModeActive) {
                                  setTextLayers(prev => prev.map(b => b.id === block.id ? { ...b, redacted: !b.redacted } : b));
                                } else {
                                  setSelectedBlockId(block.id);
                                }
                              }}
                            >
                              {selectedBlockId === block.id ? (
                                <input
                                  type="text"
                                  value={block.text}
                                  onChange={(e) => {
                                    const newVal = e.target.value;
                                    setTextLayers(prev => prev.map(b => b.id === block.id ? { ...b, text: newVal } : b));
                                  }}
                                  onBlur={() => setSelectedBlockId(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') setSelectedBlockId(null);
                                  }}
                                  autoFocus
                                  className="bg-neutral-100 text-neutral-900 border border-primary px-1.5 py-0.5 rounded focus:outline-none min-w-[240px] font-sans"
                                />
                              ) : (
                                <span className={`font-sans transition-all duration-200 ${
                                  block.redacted 
                                    ? 'bg-neutral-950 text-neutral-950 blur-[5.5px] select-none rounded px-1' 
                                    : isTitle ? 'font-bold text-neutral-900' : isFooter ? 'text-neutral-500 text-[10px]' : 'text-neutral-800'
                                }`}>
                                  {block.text}
                                </span>
                              )}

                              {/* Edit Badge overlay */}
                              <span className={`absolute -top-4 right-0 scale-0 group-hover:scale-100 transition-transform text-on-surface text-[8px] font-bold px-1.5 py-0.5 rounded shadow z-20 ${
                                isRedactModeActive ? 'bg-red-500' : 'bg-primary'
                              }`}>
                                {isRedactModeActive 
                                  ? (lang === 'ar' ? 'طمس / كشف' : 'Redact / Show') 
                                  : (lang === 'ar' ? 'تعديل' : 'Edit')}
                              </span>
                            </div>
                          );
                        })}

                        {/* Speech-to-Text Draggable Sticky Notes */}
                        {stickyNotes.map((note) => (
                          <div
                            key={note.id}
                            className="absolute bg-amber-200 text-amber-950 p-2.5 rounded-lg shadow-xl border border-amber-300 font-sans text-xs w-48 z-30 cursor-pointer hover:scale-105 transition-all duration-200"
                            style={{
                              left: `${(note.x / 612) * 100}%`,
                              top: `${((792 - note.y) / 792) * 100}%`,
                              transform: 'translate(-50%, -50%)',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              // Delete note on click
                              setStickyNotes(prev => prev.filter(n => n.id !== note.id));
                            }}
                            title={lang === 'ar' ? 'انقر لحذف الملاحظة' : 'Click to delete note'}
                          >
                            <div className="flex justify-between items-center font-bold border-b border-amber-300/60 pb-1 mb-1.5 text-[9px] tracking-wide font-mono text-amber-800">
                              <span className="flex items-center gap-1">📝 {lang === 'ar' ? 'ملاحظة صوتية' : 'Voice Sticky'}</span>
                              <span className="text-xs font-bold text-amber-600 hover:text-red-700">×</span>
                            </div>
                            <p className="leading-tight text-[11px] font-medium font-sans">{note.text}</p>
                          </div>
                        ))}
                      </div>

                      {/* Bottom Border Accent inside canvas sheet */}
                      <div className="border-t border-neutral-100 pt-3 flex justify-between items-center text-xs text-neutral-400 z-10 pointer-events-none">
                        <span>EASY-PDF-ENTERPRISE-VERIFIED</span>
                        <span>MD5: SECURE-ENCRYPTED</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Instructions tip bar */}
                <div className="bg-white/5 p-3.5 rounded-xl border border-white/5 flex gap-2.5 items-start text-xs text-neutral-400">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    {lang === 'ar' 
                      ? 'انقر على أي فقرة أو سطر نصي في المستند لتعديل كلماته مباشرة. التغييرات تنعكس حياً في الـ PDF!' 
                      : 'Click directly on any text line or block inside the visual editor frame to edit it inline. Changes are updated dynamically!'}
                  </p>
                </div>
</div>
              ) : (
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`drop-zone content-card rounded-xl p-8 flex flex-col items-center justify-center min-h-[250px] relative transition-all duration-300 ${
                    isDragOver ? 'dragover' : ''
                  }`}
                  id="workspace-files-dropzone"
                >
                {summaryResult ? (
                  <div className="flex flex-col items-center gap-4 text-center py-6">
                    <div className="w-16 h-16 rounded-full bg-secondary/15 flex items-center justify-center text-secondary shadow-[0_0_20px_rgba(76,215,246,0.35)] animate-pulse">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-on-surface">
                        {lang === 'ar' ? 'اكتمل تحليل التلخيص الذكي!' : 'AI Summary analysis complete!'}
                      </h3>
                      <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed max-w-sm">
                        {lang === 'ar' 
                          ? 'تم قراءة وتلخيص مستندك بنجاح باستخدام نموذج جيميناي. تصفح النتائج بالأسفل.' 
                          : 'Your PDF was processed and summarized securely via Gemini. See output below.'}
                      </p>
                    </div>
                  </div>
                ) : files.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 text-center cursor-pointer max-w-md" onClick={openFileBrowser}>
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <UploadCloud className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-on-surface">{translations[lang].loadPayload}</h3>
                      <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                        {translations[lang].loadPayloadDesc}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full flex flex-col gap-6 text-left">
                    
                    {/* Header inside Workspace lists */}
                    <div className="flex justify-between items-center bg-surface-bright/50 p-3.5 rounded-lg border border-white/5">
                      <span className="text-xs font-semibold text-on-surface-variant font-mono">
                        {translations[lang].activeQueue} ({files.length} {lang === 'ar' ? 'ملفات' : (files.length === 1 ? 'FILE' : 'FILES')})
                      </span>
                      <button
                        onClick={clearWorkspace}
                        className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 cursor-pointer"
                        id="btn-clear-queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {translations[lang].clearAll}
                      </button>
                    </div>

                    {/* Files list */}
                    <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1">
                      {files.map((file, idx) => (
                        <motion.div 
                          key={file.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: idx * 0.05 }}
                          layout
                          className="flex justify-between items-center bg-surface-container-high/40 p-4 rounded-xl border border-white/5 hover:border-primary/20 transition-all duration-200"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-10 h-10 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                              <FileText className="text-primary w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-on-surface truncate pr-2">{file.name}</p>
                              <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-2">
                                <span>{formatSize(file.size)}</span>
                                {file.pageCount && (
                                  <>
                                    <span className="w-1 h-1 rounded-full bg-white/20"></span>
                                    <span className="text-secondary font-semibold font-mono">{file.pageCount} {translations[lang].pages}</span>
                                  </>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Controls & statuses */}
                          <div className="flex items-center gap-3">
                            {file.status === 'reading' ? (
                              <span className="text-xs text-on-surface-variant font-mono animate-pulse">{translations[lang].reading}</span>
                            ) : (
                              <div className="flex items-center gap-1.5">
{activeTool === 'merge' && (
                                    <>
                                      <motion.button
                                        onClick={() => moveFile(idx, 'up')}
                                        disabled={idx === 0}
                                        className="p-1.5 rounded bg-white/5 text-on-surface-variant hover:text-on-surface hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                        id={`btn-move-up-${idx}`}
                                        whileHover={!shouldReduceMotion ? { scale: 1.1 } : undefined}
                                        whileTap={{ scale: 0.9 }}
                                      >
                                        <ArrowUp className="w-3.5 h-3.5" />
                                      </motion.button>
                                      <motion.button
                                        onClick={() => moveFile(idx, 'down')}
                                        disabled={idx === files.length - 1}
                                        className="p-1.5 rounded bg-white/5 text-on-surface-variant hover:text-on-surface hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                        id={`btn-move-down-${idx}`}
                                        whileHover={!shouldReduceMotion ? { scale: 1.1 } : undefined}
                                        whileTap={{ scale: 0.9 }}
                                      >
                                        <ArrowDown className="w-3.5 h-3.5" />
                                      </motion.button>
                                    </>
                                )}
                                <motion.button
                                  onClick={() => removeFile(file.id)}
                                  className="p-1.5 rounded bg-red-500/10 text-red-400 hover:text-red-300 hover:bg-red-500/20 cursor-pointer ml-1"
                                  id={`btn-remove-file-${idx}`}
                                  whileHover={!shouldReduceMotion ? { scale: 1.1, rotate: 180 } : undefined}
                                  whileTap={{ scale: 0.9 }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </motion.button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {/* Add files inside queue bar */}
                    <motion.div
                      onClick={openFileBrowser}
                      className="w-full border border-dashed border-white/10 hover:border-primary/40 py-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                      id="btn-queue-add-more"
                      whileHover={!shouldReduceMotion ? { scale: 1.02 } : undefined}
                      whileTap={{ scale: 0.98 }}
                    >
                      <UploadCloud className="w-4 h-4 text-primary" />
                      {translations[lang].addMore}
                    </motion.div>

                  </div>
                )}

                <input
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  multiple 
                  className="hidden" 
                  accept=".pdf,image/*"
                />

                {/* Laser Scanner Progress Overlay */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-surface/95 backdrop-blur-md flex flex-col items-center justify-center p-8 z-20">
                    <div className="w-full max-w-md flex flex-col gap-4 text-center">
                      
                      {/* Simulated dynamic scanner line */}
                      <div className="relative h-20 w-full overflow-hidden flex items-center justify-center">
                        <div className="laser-progress absolute left-0 right-0 top-1/2 -translate-y-1/2" style={{ width: `${processProgress}%` }}></div>
                        <FileCheck className="w-12 h-12 text-primary animate-bounce relative z-10" />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <p className="text-sm font-semibold text-on-surface font-mono animate-pulse">{processingStatusText}</p>
                        <p className="text-xs text-on-surface-variant flex items-center justify-center gap-1">
                          <span>{translations[lang].compilingProgress}</span>
                          <AnimatedCounter to={processProgress} className="font-mono font-bold text-primary" />
                        </p>
                      </div>

                      <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-gradient-to-r from-primary to-secondary h-full transition-all duration-300" style={{ width: `${processProgress}%` }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Contextual AI Copilot drawer side integration */}
          <AICopilot
            isOpen={isCopilotOpen}
            onClose={() => setIsCopilotOpen(false)}
            lang={lang}
            textLayers={textLayers}
            setTextLayers={setTextLayers}
            imageFilters={imageFilters}
            setImageFilters={setImageFilters}
            fileName={files[0]?.name || 'Document_Canvas'}
            userId={currentUser?.id}
          />
        </div>

        {/* Trigger / Compile Action Zone */}
        <motion.button
          onClick={executeProtocol}
          className="btn-primary font-semibold text-sm w-full py-4 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_4px_25px_rgba(79,70,229,0.3)] hover:shadow-[0_4px_30px_rgba(99,102,241,0.5)] cursor-pointer"
          id="btn-execute-workspace-tool"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
          whileHover={!shouldReduceMotion ? { scale: 1.02 } : undefined}
          whileTap={{ scale: 0.98 }}
        >
          <Play className="w-4 h-4 fill-current" />
          {translations[lang].initProtocol}
        </motion.button>

        {/* Output Result panel */}
        {resultFile && (
          <SuccessFeedbackCard
            title={translations[lang].outputCompiled}
            subtitle={lang === 'ar' ? 'تمت معالجة مستندك بنجاح وجاهز للتنزيل الآن' : 'Your PDF document was compiled successfully and is ready.'}
            fileName={resultFile.name}
            fileSize={formatSize(resultFile.size)}
            downloadUrl={resultFile.blobUrl}
            onReset={() => {
              setResultFile(null);
              setFiles([]);
            }}
            lang={lang}
          />
        )}

        {/* Output AI Summary Result Panel */}
        {summaryResult && activeTool === 'summarize' && (
          <div className="glass-panel rounded-xl p-6 md:p-8 flex flex-col gap-6 animate-fadeIn border-secondary/40 bg-secondary/5 text-left">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/10 pb-4 gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary shadow-[0_0_15px_rgba(76,215,246,0.2)]">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-display font-bold text-on-surface">
                    {lang === 'ar' ? 'ملخص الذكاء الاصطناعي (Gemini AI)' : 'AI Summarized Output (Gemini AI)'}
                  </h3>
                  <p className="text-xs text-on-surface-variant font-mono mt-0.5">
                    {files[0]?.name || 'Document.pdf'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  // Was previously fire-and-forget: writeText() returns a
                  // Promise that can reject (denied permission, insecure
                  // context, unfocused document), but the "Copied!" alert
                  // fired unconditionally regardless of the outcome. Now
                  // only claims success once the copy actually resolves,
                  // and reports a real failure otherwise instead of lying
                  // about it (audit, Aug 2026).
                  navigator.clipboard.writeText(summaryResult).then(
                    () => {
                      alert(lang === 'ar' ? 'تم نسخ التلخيص بنجاح!' : 'Summary copied to clipboard!');
                    },
                    (err) => {
                      console.error('Clipboard copy failed:', err);
                      alert(lang === 'ar'
                        ? 'تعذر النسخ إلى الحافظة. حدد النص ونسخه يدوياً (Ctrl/Cmd+C).'
                        : "Couldn't copy to clipboard. Select the text and copy manually (Ctrl/Cmd+C).");
                    }
                  );
                }}
                className="px-4 py-2 bg-secondary/10 hover:bg-secondary/25 border border-secondary/30 hover:border-secondary/50 rounded-lg text-xs font-bold text-secondary transition-all cursor-pointer shadow-md shadow-secondary/5"
                id="btn-copy-summary"
              >
                {lang === 'ar' ? 'نسخ الملخص' : 'Copy Summary'}
              </button>
            </div>

            {summaryIsDemo && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg badge-warning">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-bold shrink-0">{lang === 'ar' ? 'نتيجة تجريبية' : 'Simulated result'}</span>
                <span>
                  {lang === 'ar'
                    ? 'خدمة الذكاء الاصطناعي (Gemini) غير مُفعّلة على الخادم حالياً، لذا هذا النص نموذجي وليس تلخيصاً حقيقياً لمستندك.'
                    : "Gemini isn't configured on the server right now, so this is placeholder text — not a real summary of your document."}
                </span>
              </div>
            )}

            {/* Markdown styled summary content wrapper */}
            <div 
              className="prose prose-invert max-w-none text-xs leading-relaxed text-on-surface-variant bg-black/30 p-5 rounded-xl border border-white/5 max-h-[380px] overflow-y-auto font-sans" 
              style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}
            >
              {summaryResult.split('\n').map((line, idx) => {
                if (line.startsWith('## ')) {
                  return <h3 key={idx} className="text-sm font-bold text-secondary mt-4 mb-2 first:mt-0">{line.replace('## ', '')}</h3>;
                }
                if (line.startsWith('# ')) {
                  return <h2 key={idx} className="text-base font-bold text-on-surface mt-4 mb-2 first:mt-0">{line.replace('# ', '')}</h2>;
                }
                if (line.startsWith('- ') || line.startsWith('* ')) {
                  return <li key={idx} className="list-disc ml-4 my-1 text-on-surface-variant">{line.substring(2)}</li>;
                }
                if (line.trim() === '') return <div key={idx} className="h-2"></div>;
                return <p key={idx} className="my-1 text-on-surface-variant font-medium">{line}</p>;
              })}
            </div>

            <div className="flex justify-center mt-2">
              <button
                onClick={() => {
                  setSummaryResult(null);
                  setSummaryIsDemo(false);
                  clearWorkspace();
                }}
                className="btn-secondary text-xs font-semibold px-8 py-3.5 rounded-lg uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                id="btn-reset-summarize"
              >
                <RefreshCcw className="w-4 h-4" />
                {translations[lang].startAnother}
              </button>
            </div>
          </div>
        )}

      </div>

  </motion.div>
);
}
