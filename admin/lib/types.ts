export type UserRole = 'host' | 'organiser' | 'guest' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
}

export type EventType = 'private' | 'public';
export type EventStatus = 'active' | 'revealed' | 'archived';

export interface Event {
  id: string;
  title: string;
  type: EventType;
  hostId: string;
  date: string;           // ISO date string
  revealTime: string;     // ISO datetime string
  shotLimit: number;
  aesthetic: string;
  status: EventStatus;
}

export interface Participant {
  id: string;
  eventId: string;
  userId: string;
  name: string;
  qrToken: string;
  shotsUsed: number;
  uploadCount: number;
  amountPaid: number;
  tier: string;
}

export interface Photo {
  id: string;
  eventId: string;
  participantId: string;
  url: string;
  uploadedAt: string;     // ISO datetime string
  isRevealed: boolean;
}

export type PayoutStatus = 'pending' | 'scheduled' | 'paid' | 'failed';

export interface Payout {
  id: string;
  eventId: string;
  organiserId: string;
  amount: number;
  status: PayoutStatus;
  scheduledDate: string;  // ISO date string
}
