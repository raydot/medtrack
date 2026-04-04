import { Prescriptions } from '../services/prescriptions';

export function calculateAdherence(rx: Prescriptions, today: Date): number {
  const fillDate = new Date(rx.lastFillDate);
  const daysSinceFill = Math.floor((today.getTime() - fillDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.min(100, Math.round((daysSinceFill / rx.daysSupply) * 100));
}
