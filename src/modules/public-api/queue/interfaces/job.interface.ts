import { Job } from 'bull';

/**
 * Base job data interface
 */
export interface BaseJobData {
  jobId?: string;
  timestamp?: Date;
  retryCount?: number;
}

/**
 * Email job data
 */
export interface EmailJobData extends BaseJobData {
  to: string | string[];
  subject: string;
  template?: string;
  context?: Record<string, any>;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
  }>;
}

/**
 * Shipment creation job data (BRT)
 */
export interface CreateShipmentJobData extends BaseJobData {
  orderId: string;
  forceRecreate?: boolean;
}

/**
 * Tracking update job data
 */
export interface TrackingUpdateJobData extends BaseJobData {
  orderId?: string;
  shipmentId?: string;
}

/**
 * Batch tracking update job data
 */
export interface BatchTrackingUpdateJobData extends BaseJobData {
  orderIds: string[];
  maxConcurrency?: number;
}

/**
 * Download label job data (BRT)
 */
export interface DownloadLabelJobData extends BaseJobData {
  shipmentId: string;
  savePath?: string;
}

/**
 * Pickup request job data
 */
export interface PickupRequestJobData extends BaseJobData {
  shipmentIds: string[];
  pickupDate: string; // YYYY-MM-DD
  timeStart: string; // HH:MM
  timeEnd: string; // HH:MM
  notes?: string;
}

/**
 * Job result interface
 */
export interface JobResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  metadata?: Record<string, any>;
}

/**
 * Queue event handlers
 */
export interface QueueEventHandlers {
  onCompleted?: (job: Job, result: any) => void | Promise<void>;
  onFailed?: (job: Job, error: Error) => void | Promise<void>;
  onProgress?: (job: Job, progress: number) => void | Promise<void>;
  onStalled?: (job: Job) => void | Promise<void>;
}