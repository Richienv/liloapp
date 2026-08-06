import { format } from 'date-fns';
import { NotificationType } from './notification-service';

interface TemplateData {
  streamer_name?: string;
  client_name?: string;
  start_time?: string;
  end_time?: string;
  platform?: string;
  stream_link?: string;
  duration?: number;
  reason?: string;
  message?: string;
}

interface NotificationTemplate {
  client: string;
  streamer: string;
}

type NotificationTemplates = {
  [K in NotificationType]: NotificationTemplate;
};

export const NOTIFICATION_TEMPLATES: NotificationTemplates = {
  booking_request: {
    client: "Permintaan booking kamu untuk {streamer_name} pada {start_time} sedang diproses.",
    streamer: "{client_name} telah melakukan booking untuk {start_time} - {end_time} ({duration} jam)."
  },
  booking_payment: {
    client: "Pembayaran untuk booking dengan {streamer_name} pada {start_time} telah dikonfirmasi.",
    streamer: "Pembayaran dari {client_name} untuk sesi pada {start_time} telah diterima."
  },
  booking_accepted: {
    client: "{streamer_name} telah menerima booking kamu untuk {start_time} pada platform {platform}.",
    streamer: "kamu telah menerima booking dari {client_name} untuk {start_time}."
  },
  booking_rejected: {
    client: "{streamer_name} telah menolak booking kamu untuk {start_time} pada platform {platform}.",
    streamer: "kamu telah menolak booking dari {client_name} untuk {start_time}."
  },
  booking_cancelled: {
    client: "Booking kamu dengan {streamer_name} untuk {start_time} telah dibatalkan.",
    streamer: "Booking dari {client_name} untuk {start_time} telah dibatalkan."
  },
  stream_started: {
    client: "{streamer_name} telah memulai live stream untuk booking kamu pada {start_time}.[[stream_link]]",
    streamer: "kamu telah memulai live stream dengan {client_name}."
  },
  stream_ended: {
    client: "{streamer_name} telah mengakhiri live stream untuk booking kamu.",
    streamer: "kamu telah mengakhiri live stream dengan {client_name}."
  },
  reschedule_request: {
    client: "{streamer_name} mengajukan perubahan jadwal untuk sesi live streaming kamu. Alasan: {reason}",
    streamer: "kamu mengajukan perubahan jadwal untuk sesi dengan {client_name}. Alasan: {reason}"
  },
  reschedule_accepted: {
    client: "Permintaan perubahan jadwal telah diterima oleh {streamer_name}.",
    streamer: "kamu telah menerima permintaan perubahan jadwal dari {client_name}."
  },
  reschedule_rejected: {
    client: "Permintaan perubahan jadwal telah ditolak oleh {streamer_name}.",
    streamer: "kamu telah menolak permintaan perubahan jadwal dari {client_name}."
  },
  item_received: {
    client: "{streamer_name} telah menerima barang kamu dan siap untuk memulai live streaming.",
    streamer: "kamu telah menerima barang dari {client_name} untuk sesi live streaming."
  },
  new_message: {
    client: "kamu menerima pesan baru dari {streamer_name}",
    streamer: "kamu menerima pesan baru dari {client_name}"
  },
  info: {
    client: "{message}",
    streamer: "{message}"
  },
  warning: {
    client: "{message}",
    streamer: "{message}"
  },
  confirmation: {
    client: "{message}",
    streamer: "{message}"
  }
};

export function processTemplate(
  template: string,
  data: TemplateData
): string {
  // First, handle special stream link placeholder
  template = template.replace(
    /\[\[stream_link\]\]/g,
    data.stream_link ? ` Klik untuk bergabung: ${data.stream_link}` : ''
  );

  // Then handle regular template variables
  return template.replace(
    /{(\w+)}/g,
    (match, key: keyof TemplateData) => {
      if (key === 'start_time' || key === 'end_time') {
        const value = data[key];
        return value ? format(new Date(value), 'dd MMMM HH:mm') : '';
      }
      return data[key]?.toString() || '';
    }
  );
}

export function getNotificationMessage(
  type: NotificationType,
  userType: 'client' | 'streamer',
  data: TemplateData
): string {
  const template = NOTIFICATION_TEMPLATES[type]?.[userType];
  if (!template) return data.message || '';
  return processTemplate(template, data);
} 