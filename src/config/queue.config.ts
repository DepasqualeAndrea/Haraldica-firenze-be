 import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  // Concurrency settings
  concurrency: {
    email: parseInt(process.env.QUEUE_CONCURRENCY_EMAIL ?? '5', 10) || 5,
    shipment: parseInt(process.env.QUEUE_CONCURRENCY_SHIPMENT ?? '3', 10) || 3,
    tracking: parseInt(process.env.QUEUE_CONCURRENCY_TRACKING ?? '10', 10) || 10,
  },

  // Default job options
  defaultJobOptions: {
    attempts: parseInt(process.env.QUEUE_DEFAULT_JOB_ATTEMPTS ?? '3', 10) || 3,
    backoff: {
      type: 'exponential' as const,
      delay: parseInt(process.env.QUEUE_DEFAULT_BACKOFF_DELAY ?? '5000', 10) || 5000, // 5s, 15s, 45s
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 200, // Keep last 200 failed jobs
  },

  // Queue specific settings
  email: {
    limiter: {
      max: 10, // Max 10 jobs per second
      duration: 1000,
    },
  },

  shipment: {
    limiter: {
      max: 5, // Max 5 jobs per second
      duration: 1000,
    },
  },

  tracking: {
    limiter: {
      max: 20, // Max 20 jobs per second
      duration: 1000,
    },
  },
}));