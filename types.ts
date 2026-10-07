export interface OrderItem {
  description: string;
  quantity: number;
  uom: string; // Unit of Measure
  unitPrice: number;
  total: number;
  remarks?: string;
  soh?: number | string;
}

export interface DocumentData {
  id: string; // Serial Code
  type: 'Requisition Form';
  department: string;
  purpose: string;
  date: string;
  deliverOn: string;
  status: 'Approved' | 'Pending' | 'Processing' | 'For signing' | 'Completed';
  items: OrderItem[];
  totalAmount: number;
  pr_for: string;
  
  // Signatories
  preparedBy: string; // Also acts as Requester
  requester?: string; // Optional field if we want to store the raw requester separately
  notedBy: string;
  approvedBy: string;
  receivedBy: string;
  checkedBy: string;
}

export interface PrintSettings {
  copies: number;
  paperSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  showDraft?: boolean;
  secondaryDocId?: string | null;
  priceDisplay?: 'blank' | 'hidden' | 'show';
}

export interface AppState {
  documents: DocumentData[];
  selectedDocId: string | null;
  isLoading: boolean;
  error: string | null;
}