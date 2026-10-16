export type PageType = 'home' | 'tools' | 'pricing' | 'workspace' | 'checkout' | 'admin-pricing' | 'admin-users' | 'admin-dashboard' | 'admin-settings' | 'admin-editor' | 'about' | 'terms' | 'privacy' | 'refund';

export type ToolType = 
  | 'merge' 
  | 'split' 
  | 'compress' 
  | 'convert-to' 
  | 'convert-from' 
  | 'summarize' 
  | 'edit-text'
  | 'page-manager'
  | 'protect'
  | 'unlock'
  | 'watermark'
  | 'page-numbers'
  | 'signature'
  | 'ocr'
  | 'smart-enhance'
  | 'batch';

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: 'idle' | 'reading' | 'ready' | 'processing' | 'success' | 'error';
  progress: number;
  previewUrl?: string;
  data?: Uint8Array; // Raw bytes for real client-side PDF processing
  pageCount?: number; // Number of pages for PDF files
  errorMsg?: string;
}

export interface ToolConfig {
  id: ToolType;
  title: string;
  shortDescription: string;
  longDescription: string;
  icon: string;
  color: string;
  bgGlow: string;
}

export interface PricingPlan {
  name: string;
  priceMonthly: number;
  // priceAnnually was removed: only monthly billing exists in Stripe config
  // (see PricingPage.tsx). Do not re-add without a real annual Stripe price.
  description: string;
  isPopular: boolean;
  features: string[];
  ctaText: string;
  subText: string;
}
