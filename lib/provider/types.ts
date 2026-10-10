export interface ProviderService {
  name: string;
  key: string;
  count: number;
}

export interface ProviderCountry {
  name: string;
  flag: string;
  count: number;
  displayName: string;
  requestValue: string;
}

export interface ProviderNumberAllocation {
  number: string;
  country?: string;
  flag?: string;
  service?: string;
  network?: string;
  assigned_at: Date;
  raw: Record<string, unknown>;
}

export interface ProviderActiveNumber {
  number: string;
  service?: string;
  network?: string;
  country?: string;
  flag?: string;
  status?: string;
  assigned_at?: string;
  latest_otp?: string | null;
  latest_otp_message?: string | null;
  raw: Record<string, unknown>;
}

export interface ProviderOtp {
  service?: string;
  number: string;
  otp_code?: string;
  full_message?: string;
  timestamp?: string;
  country?: string;
  raw: Record<string, unknown>;
}

export interface ProviderOtpResponse {
  has_otp: boolean;
  otp_code?: string;
  message?: string;
  received_at?: string;
}

export interface MailDomain {
  domain: string;
}

export interface MailboxSummary {
  id: string;
  email: string;
  domain: string;
  createdAt: string;
  listedUpstream: boolean;
}

export interface MailMessage {
  id: string;
  from?: string;
  subject?: string;
  receivedAt?: string;
  text?: string;
  html?: string;
  raw: Record<string, unknown>;
}
