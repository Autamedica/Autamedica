import { getServerEnvOrDefault, ensureServerEnv } from '@autamedica/shared';

export interface MaintenanceData {
  title: string;
  description: string;
  monitorIds: number[];
  statusPageIds: number[];
  start: string;
  end: string;
  timezone: string;
  strategy: 'single' | 'recurring';
}

export class UptimeService {
  private static baseUrl = getServerEnvOrDefault('UPTIME_KUMA_URL', 'http://localhost:3010') ?? 'http://localhost:3010';
  private static apiKey = ensureServerEnv('UPTIME_KUMA_API_KEY');

  static async getMonitors() {
    const response = await fetch(`${this.baseUrl}/api/monitors`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch monitors');
    return response.json();
  }

  static async getStatusPages() {
    const response = await fetch(`${this.baseUrl}/api/status-pages`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch status pages');
    return response.json();
  }

  static async scheduleMaintenance(data: MaintenanceData) {
    const response = await fetch(`${this.baseUrl}/api/maintenance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Failed to schedule maintenance');
    }
    return response.json();
  }
}
