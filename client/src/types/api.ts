export interface LoanScheme {
  id: string;
  name: string;
  interestRateAnnual: number;
  maxLtv: number;
  tenureMonths: number;
  description: string;
  isActive: boolean;
}

export interface QuoteRequest {
  grossWeightGrams: number;
  netWeightGrams: number;
  karat: number;
  selectedPlanId?: string;
}

export interface QuoteResponse {
  pureGoldGrams: number;
  goldValueRupees: number;
  goldValuePaise: number;
  eligibleLoanRupees: number;
  eligibleLoanPaise: number;
  currency: string;
  appliedLtv: number;
  appliedRatePerGram24K: number;
}

export interface LeadCreationRequest {
  fullName: string;
  mobileNumber: string;
  grossWeightGrams: number;
  netWeightGrams: number;
  karat: number;
  selectedPlanId: string;
}

export interface LeadCreationResponse {
  applicationId: string;
  status: string;
  fullName: string;
  pureGoldGrams: number;
  eligibleLoanRupees: number;
  createdAt: string;
}

export interface AdminLead {
  id: string;
  fullName: string;
  maskedMobile: string;
  grossWeightGrams: number;
  netWeightGrams: number;
  karat: number;
  pureGoldGrams: number;
  eligibleLoanRupees: number;
  selectedPlanId: string;
  status: string;
  createdAt: string;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    existingApplicationId?: string;
    existingApplicationDate?: string;
    fields?: ApiErrorDetail[];
  };
}

export interface ApplicationDraft {
  fullName?: string;
  mobileNumber?: string;
  grossWeightGrams?: number;
  netWeightGrams?: number;
  karat?: number;
  selectedPlanId?: string;
  pureGoldGrams?: number;
  goldValueRupees?: number;
  eligibleLoanRupees?: number;
  applicationId?: string;
  status?: string;
  submittedAt?: string;
}

export interface AgentToolCallItem {
  name: string;
  args: any;
  result: any;
}

export interface AgentChatRequest {
  sessionId?: string;
  message: string;
}

export interface AgentChatResponse {
  sessionId: string;
  reply: string;
  draft: ApplicationDraft | null;
  draftVersion: number;
  isConfirmed: boolean;
  toolCallsExecuted?: AgentToolCallItem[];
}

export interface AgentConfirmRequest {
  sessionId: string;
  draftVersion: number;
}

export interface AgentConfirmResponse {
  confirmed: boolean;
  sessionId: string;
  draftVersion: number;
  confirmedAt?: string;
  draft: ApplicationDraft | null;
  submission?: {
    success: boolean;
    applicationId?: string;
    status?: string;
    fullName?: string;
    pureGoldGrams?: number;
    eligibleLoanRupees?: number;
    createdAt?: string;
    error?: string;
    existingApplicationId?: string;
    existingApplicationDate?: string;
    message?: string;
  } | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: string;
  toolCallsExecuted?: AgentToolCallItem[];
}

